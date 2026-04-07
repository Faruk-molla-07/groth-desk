
-- 1. Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  username TEXT NOT NULL DEFAULT '',
  avatar_color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. Study sessions table
CREATE TABLE public.study_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions" ON public.study_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON public.study_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON public.study_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own sessions" ON public.study_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 3. Communities table
CREATE TABLE public.communities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;

-- 4. Community secrets table (password hashes - never exposed)
CREATE TABLE public.community_secrets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE NOT NULL UNIQUE,
  password_hash TEXT NOT NULL DEFAULT ''
);
ALTER TABLE public.community_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct access" ON public.community_secrets FOR SELECT USING (false);

-- 5. Memberships table
CREATE TABLE public.memberships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, community_id)
);
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

-- 6. Messages table
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Security definer function to check membership
CREATE OR REPLACE FUNCTION public.is_community_member(_community_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE community_id = _community_id AND user_id = _user_id
  )
$$;

-- RLS policies using is_community_member
CREATE POLICY "Members can view communities" ON public.communities FOR SELECT TO authenticated
  USING (public.is_community_member(id, auth.uid()));
CREATE POLICY "Authenticated can insert communities" ON public.communities FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Members can view memberships" ON public.memberships FOR SELECT TO authenticated
  USING (public.is_community_member(community_id, auth.uid()));
CREATE POLICY "Members can delete own membership" ON public.memberships FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Members can view messages" ON public.messages FOR SELECT TO authenticated
  USING (public.is_community_member(community_id, auth.uid()));
CREATE POLICY "Members can send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_community_member(community_id, auth.uid()));

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, username, avatar_color)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    '#' || lpad(to_hex((random()*16777215)::int), 6, '0')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create community with password (RPC)
CREATE OR REPLACE FUNCTION public.create_community_with_password(_name TEXT, _password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code TEXT;
  _community_id UUID;
BEGIN
  _code := upper(substr(md5(random()::text), 1, 6));
  
  INSERT INTO public.communities (name, code, created_by)
  VALUES (_name, _code, auth.uid())
  RETURNING id INTO _community_id;
  
  INSERT INTO public.community_secrets (community_id, password_hash)
  VALUES (_community_id, crypt(_password, gen_salt('bf')));
  
  INSERT INTO public.memberships (user_id, community_id, role)
  VALUES (auth.uid(), _community_id, 'owner');
  
  RETURN json_build_object('id', _community_id, 'code', _code, 'name', _name);
END;
$$;

-- Join community with password (RPC)
CREATE OR REPLACE FUNCTION public.join_community_with_password(_code TEXT, _password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _community RECORD;
  _secret RECORD;
BEGIN
  SELECT * INTO _community FROM public.communities WHERE code = _code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Community not found';
  END IF;
  
  SELECT * INTO _secret FROM public.community_secrets WHERE community_id = _community.id;
  IF _secret.password_hash <> crypt(_password, _secret.password_hash) THEN
    RAISE EXCEPTION 'Invalid password';
  END IF;
  
  INSERT INTO public.memberships (user_id, community_id, role)
  VALUES (auth.uid(), _community.id, 'member')
  ON CONFLICT (user_id, community_id) DO NOTHING;
  
  RETURN json_build_object('id', _community.id, 'name', _community.name, 'code', _community.code);
END;
$$;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

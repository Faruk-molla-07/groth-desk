-- 1. Create community_secrets table
CREATE TABLE public.community_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL UNIQUE REFERENCES public.communities(id) ON DELETE CASCADE,
  password_hash text NOT NULL DEFAULT ''
);

-- Enable RLS with NO select policy (only accessible via security definer functions)
ALTER TABLE public.community_secrets ENABLE ROW LEVEL SECURITY;

-- 2. Migrate existing data
INSERT INTO public.community_secrets (community_id, password_hash)
SELECT id, password_hash FROM public.communities;

-- 3. Drop password_hash from communities
ALTER TABLE public.communities DROP COLUMN password_hash;

-- 4. Update create_community_with_password to use community_secrets
CREATE OR REPLACE FUNCTION public.create_community_with_password(
  _name text,
  _password text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _code text;
  _community_id uuid;
  _chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  _i int;
BEGIN
  IF _user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  _code := '';
  FOR _i IN 1..6 LOOP
    _code := _code || substr(_chars, floor(random() * length(_chars) + 1)::int, 1);
  END LOOP;

  INSERT INTO public.communities (name, code, created_by)
  VALUES (trim(_name), _code, _user_id)
  RETURNING id INTO _community_id;

  INSERT INTO public.community_secrets (community_id, password_hash)
  VALUES (_community_id, COALESCE(_password, ''));

  INSERT INTO public.memberships (user_id, community_id, role)
  VALUES (_user_id, _community_id, 'owner');

  RETURN json_build_object('success', true, 'community_id', _community_id, 'code', _code);
END;
$$;

-- 5. Update join_community_with_password to use community_secrets
CREATE OR REPLACE FUNCTION public.join_community_with_password(
  _code text,
  _password text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _community_id uuid;
  _stored_hash text;
  _user_id uuid := auth.uid();
BEGIN
  IF _user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT c.id INTO _community_id
  FROM public.communities c
  WHERE c.code = upper(trim(_code));

  IF _community_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Community not found');
  END IF;

  SELECT cs.password_hash INTO _stored_hash
  FROM public.community_secrets cs
  WHERE cs.community_id = _community_id;

  IF _stored_hash IS NOT NULL AND _stored_hash != '' AND _stored_hash != _password THEN
    RETURN json_build_object('success', false, 'error', 'Wrong password');
  END IF;

  IF EXISTS (SELECT 1 FROM public.memberships WHERE user_id = _user_id AND community_id = _community_id) THEN
    RETURN json_build_object('success', false, 'error', 'Already a member');
  END IF;

  INSERT INTO public.memberships (user_id, community_id)
  VALUES (_user_id, _community_id);

  RETURN json_build_object('success', true, 'community_id', _community_id);
END;
$$;
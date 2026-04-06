-- 1. Fix study_sessions UPDATE policy role (public -> authenticated)
DROP POLICY "Users can update own sessions" ON public.study_sessions;
CREATE POLICY "Users can update own sessions" ON public.study_sessions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Restrict communities SELECT to hide password_hash
DROP POLICY "Authenticated can view communities" ON public.communities;
CREATE POLICY "Authenticated can view communities" ON public.communities
  FOR SELECT TO authenticated
  USING (true);

-- 3. Create server-side RPC for joining communities with password verification
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

  SELECT id, password_hash INTO _community_id, _stored_hash
  FROM public.communities
  WHERE code = upper(trim(_code));

  IF _community_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Community not found');
  END IF;

  -- Verify password if one is set
  IF _stored_hash IS NOT NULL AND _stored_hash != '' AND _stored_hash != _password THEN
    RETURN json_build_object('success', false, 'error', 'Wrong password');
  END IF;

  -- Check if already a member
  IF EXISTS (SELECT 1 FROM public.memberships WHERE user_id = _user_id AND community_id = _community_id) THEN
    RETURN json_build_object('success', false, 'error', 'Already a member');
  END IF;

  -- Insert membership
  INSERT INTO public.memberships (user_id, community_id)
  VALUES (_user_id, _community_id);

  RETURN json_build_object('success', true, 'community_id', _community_id);
END;
$$;

-- 4. Create server-side RPC for creating communities (password never exposed)
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

  -- Generate 6-char code
  _code := '';
  FOR _i IN 1..6 LOOP
    _code := _code || substr(_chars, floor(random() * length(_chars) + 1)::int, 1);
  END LOOP;

  INSERT INTO public.communities (name, code, password_hash, created_by)
  VALUES (trim(_name), _code, _password, _user_id)
  RETURNING id INTO _community_id;

  -- Auto-join as owner
  INSERT INTO public.memberships (user_id, community_id, role)
  VALUES (_user_id, _community_id, 'owner');

  RETURN json_build_object('success', true, 'community_id', _community_id, 'code', _code);
END;
$$;

-- 5. Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.join_community_with_password(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_community_with_password(text, text) TO authenticated;
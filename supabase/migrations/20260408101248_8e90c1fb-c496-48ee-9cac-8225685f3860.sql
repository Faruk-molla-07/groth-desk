CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.create_community_with_password(_name text, _password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _code TEXT;
  _community_id UUID;
BEGIN
  _code := upper(substr(md5(random()::text), 1, 6));

  WHILE EXISTS (SELECT 1 FROM public.communities WHERE code = _code) LOOP
    _code := upper(substr(md5(random()::text), 1, 6));
  END LOOP;
  
  INSERT INTO public.communities (name, code, created_by)
  VALUES (_name, _code, auth.uid())
  RETURNING id INTO _community_id;
  
  INSERT INTO public.community_secrets (community_id, password_hash)
  VALUES (_community_id, extensions.crypt(COALESCE(_password, ''), extensions.gen_salt('bf')));
  
  INSERT INTO public.memberships (user_id, community_id, role)
  VALUES (auth.uid(), _community_id, 'owner')
  ON CONFLICT (user_id, community_id) DO NOTHING;
  
  RETURN json_build_object('id', _community_id, 'code', _code, 'name', _name);
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_community_with_password(_code text, _password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _community RECORD;
  _secret RECORD;
BEGIN
  SELECT * INTO _community
  FROM public.communities
  WHERE code = upper(trim(_code));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Community not found';
  END IF;
  
  SELECT * INTO _secret
  FROM public.community_secrets
  WHERE community_id = _community.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Community password not configured';
  END IF;
  
  IF _secret.password_hash <> extensions.crypt(COALESCE(_password, ''), _secret.password_hash) THEN
    RAISE EXCEPTION 'Invalid password';
  END IF;
  
  INSERT INTO public.memberships (user_id, community_id, role)
  VALUES (auth.uid(), _community.id, 'member')
  ON CONFLICT (user_id, community_id) DO NOTHING;
  
  RETURN json_build_object('id', _community.id, 'name', _community.name, 'code', _community.code);
END;
$function$;
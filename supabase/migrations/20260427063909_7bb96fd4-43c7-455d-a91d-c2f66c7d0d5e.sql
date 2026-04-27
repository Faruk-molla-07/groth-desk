-- Helper function: is user owner or admin of community
CREATE OR REPLACE FUNCTION public.is_community_admin(_community_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE community_id = _community_id
      AND user_id = _user_id
      AND role IN ('owner', 'admin')
  );
$$;

-- Transfer "Come Back" community to farukmolla3597@gmail.com
DO $$
DECLARE
  _new_owner uuid := '754ac156-ea5f-4d38-ad14-61bf87807fd0';
  _community uuid := 'b4b7cad8-73a3-43cd-ae0e-ece0cd014a17';
  _old_owner uuid;
BEGIN
  SELECT created_by INTO _old_owner FROM public.communities WHERE id = _community;

  -- Update the community owner
  UPDATE public.communities SET created_by = _new_owner WHERE id = _community;

  -- Set previous owner's role to admin (if they're still a member)
  IF _old_owner IS NOT NULL AND _old_owner <> _new_owner THEN
    UPDATE public.memberships
    SET role = 'admin'
    WHERE community_id = _community AND user_id = _old_owner;
  END IF;

  -- Make the new owner's membership role = 'owner'
  UPDATE public.memberships
  SET role = 'owner'
  WHERE community_id = _community AND user_id = _new_owner;
END $$;

-- Allow owner to update memberships (promote/demote) within their community
CREATE POLICY "Owner can update memberships in their community"
ON public.memberships
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.communities c
    WHERE c.id = memberships.community_id AND c.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.communities c
    WHERE c.id = memberships.community_id AND c.created_by = auth.uid()
  )
  AND role IN ('admin', 'member')  -- prevent promoting to 'owner'
);

-- Allow owner to remove any member (kick) from their community
CREATE POLICY "Owner can remove members from their community"
ON public.memberships
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.communities c
    WHERE c.id = memberships.community_id
      AND c.created_by = auth.uid()
      AND memberships.user_id <> auth.uid()  -- can't kick self via this policy
  )
);

-- Update challenges INSERT policy: owner OR admin can create
DROP POLICY IF EXISTS "Community owner can create challenges" ON public.challenges;

CREATE POLICY "Community owner or admin can create challenges"
ON public.challenges
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND public.is_community_admin(community_id, auth.uid())
  AND ends_at > starts_at
);
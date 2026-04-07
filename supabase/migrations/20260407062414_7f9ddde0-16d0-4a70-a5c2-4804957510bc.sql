
-- Remove duplicate memberships, keeping the earliest one
DELETE FROM public.memberships a
USING public.memberships b
WHERE a.id > b.id
  AND a.user_id = b.user_id
  AND a.community_id = b.community_id;

-- Add unique constraint to prevent future duplicates
ALTER TABLE public.memberships
ADD CONSTRAINT memberships_user_community_unique UNIQUE (user_id, community_id);

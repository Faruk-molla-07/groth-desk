-- Allow community members to view each other's study sessions
CREATE POLICY "Community members can view member sessions"
ON public.study_sessions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m1
    JOIN public.memberships m2 ON m1.community_id = m2.community_id
    WHERE m1.user_id = auth.uid()
    AND m2.user_id = study_sessions.user_id
  )
);
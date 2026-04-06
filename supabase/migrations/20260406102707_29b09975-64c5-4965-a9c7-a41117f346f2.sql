-- Allow users to update their own study sessions (needed for edit feature)
CREATE POLICY "Users can update own sessions"
ON public.study_sessions
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
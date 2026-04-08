
-- 1. Create the missing trigger for auto-creating profiles on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Add RLS policy so community members can view each other's study sessions (needed for leaderboard)
CREATE POLICY "Community members can view sessions"
  ON public.study_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m1
      JOIN public.memberships m2 ON m1.community_id = m2.community_id
      WHERE m1.user_id = auth.uid() AND m2.user_id = study_sessions.user_id
    )
    OR auth.uid() = user_id
  );

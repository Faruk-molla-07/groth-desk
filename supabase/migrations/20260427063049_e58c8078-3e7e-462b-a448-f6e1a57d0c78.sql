CREATE TABLE public.challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Challenge',
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_challenges_community ON public.challenges(community_id, starts_at DESC);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view challenges"
ON public.challenges FOR SELECT
TO authenticated
USING (public.is_community_member(community_id, auth.uid()));

CREATE POLICY "Community owner can create challenges"
ON public.challenges FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND EXISTS (
    SELECT 1 FROM public.communities c
    WHERE c.id = community_id AND c.created_by = auth.uid()
  )
  AND ends_at > starts_at
);

CREATE POLICY "Creator can delete own challenges"
ON public.challenges FOR DELETE
TO authenticated
USING (auth.uid() = created_by);

ALTER PUBLICATION supabase_realtime ADD TABLE public.challenges;
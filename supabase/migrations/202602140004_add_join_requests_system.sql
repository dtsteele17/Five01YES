-- ============================================================================
-- ADD JOIN REQUEST SYSTEM FOR QUICK MATCH
-- ============================================================================
--
-- Purpose:
-- Creates a table to store join requests for quick match lobbies
-- Allows lobby creators to approve/decline join requests
-- Stores the 3-dart average of the requester for display
--
-- ============================================================================

-- Create the join requests table
CREATE TABLE IF NOT EXISTS public.quick_match_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id UUID NOT NULL REFERENCES public.quick_match_lobbies(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requester_username TEXT NOT NULL,
  requester_avatar_url TEXT,
  requester_3dart_avg DECIMAL(5,2) DEFAULT 0,
  requester_has_camera BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  match_id UUID REFERENCES public.match_rooms(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_join_requests_lobby_id ON public.quick_match_join_requests(lobby_id);
CREATE INDEX IF NOT EXISTS idx_join_requests_requester_id ON public.quick_match_join_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_join_requests_status ON public.quick_match_join_requests(status);
CREATE INDEX IF NOT EXISTS idx_join_requests_created_at ON public.quick_match_join_requests(created_at);

-- Enable RLS
ALTER TABLE public.quick_match_join_requests ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Lobby creators can see all requests for their lobbies
CREATE POLICY "Lobby creators can view join requests"
  ON public.quick_match_join_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quick_match_lobbies
      WHERE quick_match_lobbies.id = quick_match_join_requests.lobby_id
      AND quick_match_lobbies.created_by = auth.uid()
    )
    OR requester_id = auth.uid()
  );

-- Anyone can create a join request
CREATE POLICY "Anyone can create join requests"
  ON public.quick_match_join_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = auth.uid());

-- Only lobby creators can update status
CREATE POLICY "Lobby creators can update join requests"
  ON public.quick_match_join_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quick_match_lobbies
      WHERE quick_match_lobbies.id = quick_match_join_requests.lobby_id
      AND quick_match_lobbies.created_by = auth.uid()
    )
  );

-- Requesters can delete their own pending requests
CREATE POLICY "Requesters can delete their own requests"
  ON public.quick_match_join_requests
  FOR DELETE
  TO authenticated
  USING (requester_id = auth.uid() AND status = 'pending');

-- Grant permissions
GRANT ALL ON public.quick_match_join_requests TO authenticated;
GRANT ALL ON public.quick_match_join_requests TO anon;

-- Create function to auto-cleanup old requests
CREATE OR REPLACE FUNCTION cleanup_old_join_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.quick_match_join_requests
  WHERE created_at < now() - interval '5 minutes'
  AND status = 'pending';
END;
$$;

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_join_requests_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_join_requests_updated_at ON public.quick_match_join_requests;
CREATE TRIGGER update_join_requests_updated_at
  BEFORE UPDATE ON public.quick_match_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_join_requests_updated_at();

-- ============================================================================
-- ENABLE REALTIME FOR JOIN REQUESTS
-- ============================================================================

-- Add table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.quick_match_join_requests;

-- ============================================================================
-- VERIFY
-- ============================================================================

SELECT 'Join requests table created successfully!' as status;

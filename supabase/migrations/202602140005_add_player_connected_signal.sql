-- ============================================================================
-- ADD: player_connected signal type support
-- ============================================================================

-- First ensure match_signals has proper RLS
ALTER TABLE public.match_signals DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_signals ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies to avoid conflicts
DROP POLICY IF EXISTS "match_signals_select" ON public.match_signals;
DROP POLICY IF EXISTS "match_signals_insert" ON public.match_signals;
DROP POLICY IF EXISTS "Users can view signals addressed to them" ON public.match_signals;
DROP POLICY IF EXISTS "Users can insert signals" ON public.match_signals;
DROP POLICY IF EXISTS "System can insert signals" ON public.match_signals;
DROP POLICY IF EXISTS "Enable read access for users" ON public.match_signals;
DROP POLICY IF EXISTS "Enable insert access for users" ON public.match_signals;
DROP POLICY IF EXISTS "match_signals_select_v2" ON public.match_signals;
DROP POLICY IF EXISTS "match_signals_insert_v2" ON public.match_signals;

-- Create permissive SELECT policy
CREATE POLICY "match_signals_select_v2"
  ON public.match_signals
  FOR SELECT
  TO authenticated
  USING (to_user_id = auth.uid());

-- Create very permissive INSERT policy - allows any authenticated user to insert
CREATE POLICY "match_signals_insert_v2"
  ON public.match_signals
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Grant permissions
GRANT ALL ON public.match_signals TO authenticated;
GRANT ALL ON public.match_signals TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;

-- Add match_signals to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_signals;

-- ============================================================================
-- CREATE: RPC function to send player connected signal (bypasses RLS)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_send_player_connected(
  p_room_id UUID,
  p_to_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_from_user_id UUID;
BEGIN
  v_from_user_id := auth.uid();
  
  IF v_from_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  
  INSERT INTO public.match_signals (
    room_id,
    from_user_id,
    to_user_id,
    type,
    payload
  ) VALUES (
    p_room_id,
    v_from_user_id,
    p_to_user_id,
    'player_connected',
    jsonb_build_object('timestamp', extract(epoch from now()))
  );
  
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_send_player_connected(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_send_player_connected(UUID, UUID) TO anon;

-- ============================================================================
-- VERIFY
-- ============================================================================

SELECT 'Player connected signal support added!' as status;

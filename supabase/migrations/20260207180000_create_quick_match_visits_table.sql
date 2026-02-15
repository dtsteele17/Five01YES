-- Migration: Create quick_match_visits table if not exists
-- Ensures the visit history table exists with correct structure

-- Create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.quick_match_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.match_rooms(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    leg INTEGER NOT NULL DEFAULT 1,
    turn_no INTEGER NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    remaining_before INTEGER NOT NULL DEFAULT 501,
    remaining_after INTEGER NOT NULL DEFAULT 501,
    darts JSONB DEFAULT '[]'::JSONB,
    darts_thrown INTEGER DEFAULT 3,
    darts_at_double INTEGER DEFAULT 0,
    is_bust BOOLEAN DEFAULT FALSE,
    bust_reason TEXT,
    is_checkout BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_quick_match_visits_room_id ON public.quick_match_visits(room_id);
CREATE INDEX IF NOT EXISTS idx_quick_match_visits_player_id ON public.quick_match_visits(player_id);
CREATE INDEX IF NOT EXISTS idx_quick_match_visits_room_leg ON public.quick_match_visits(room_id, leg);
CREATE INDEX IF NOT EXISTS idx_quick_match_visits_turn ON public.quick_match_visits(room_id, leg, turn_no);

-- Enable RLS
ALTER TABLE public.quick_match_visits ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Players can view visits for their matches" ON public.quick_match_visits;
DROP POLICY IF EXISTS "Players can insert their own visits" ON public.quick_match_visits;
DROP POLICY IF EXISTS "Players can update visits in their matches" ON public.quick_match_visits;
DROP POLICY IF EXISTS "Players can delete visits in their matches" ON public.quick_match_visits;

-- RLS Policies
CREATE POLICY "Players can view visits for their matches" 
    ON public.quick_match_visits FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM public.match_rooms 
            WHERE match_rooms.id = quick_match_visits.room_id 
            AND (match_rooms.player1_id = auth.uid() OR match_rooms.player2_id = auth.uid())
        )
    );

CREATE POLICY "Players can insert their own visits" 
    ON public.quick_match_visits FOR INSERT 
    WITH CHECK (
        player_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM public.match_rooms 
            WHERE match_rooms.id = quick_match_visits.room_id 
            AND (match_rooms.player1_id = auth.uid() OR match_rooms.player2_id = auth.uid())
        )
    );

CREATE POLICY "Players can update visits in their matches" 
    ON public.quick_match_visits FOR UPDATE 
    USING (
        EXISTS (
            SELECT 1 FROM public.match_rooms 
            WHERE match_rooms.id = quick_match_visits.room_id 
            AND (match_rooms.player1_id = auth.uid() OR match_rooms.player2_id = auth.uid())
        )
    );

CREATE POLICY "Players can delete visits in their matches" 
    ON public.quick_match_visits FOR DELETE 
    USING (
        EXISTS (
            SELECT 1 FROM public.match_rooms 
            WHERE match_rooms.id = quick_match_visits.room_id 
            AND (match_rooms.player1_id = auth.uid() OR match_rooms.player2_id = auth.uid())
        )
    );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quick_match_visits TO authenticated;
GRANT ALL ON public.quick_match_visits TO service_role;

-- Enable realtime (only if not already added)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'quick_match_visits'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.quick_match_visits;
    END IF;
END $$;

COMMENT ON TABLE public.quick_match_visits IS 'Stores individual dart visits/turns for quick matches';

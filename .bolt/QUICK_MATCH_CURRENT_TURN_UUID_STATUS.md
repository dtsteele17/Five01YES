# Quick Match current_turn UUID Status

**Date:** 2026-02-06
**Status:** ⚠️ Needs Manual Migration

---

## Current State

### Frontend
✅ **FIXED** - Frontend now calls `rpc_quick_match_submit_visit_v3` (the version that exists)
- File: `app/app/play/quick-match/match/[matchId]/page.tsx`
- Line 1242: Calls `rpc_quick_match_submit_visit_v3`
- Removed `p_is_checkout` parameter (not in v3 signature)

### Database
⚠️ **NEEDS VERIFICATION** - The `match_rooms.current_turn` column type

**Two possible states:**

1. **If current_turn is TEXT ('player1'/'player2'):**
   - ✅ v3 works correctly (uses TEXT comparison)
   - No migration needed

2. **If current_turn is UUID (player_id):**
   - ❌ v3 will fail with "Not your turn" errors
   - ✅ Need to apply v4 migration (UUID support)

---

## Issue Explanation

The SQL you pasted (`submit_quick_match_throw`) expects `match_rooms.current_turn` to be a **UUID** (stores actual player_id):

```sql
-- UUID comparison
IF v_room.current_turn != v_user_id THEN
  RAISE EXCEPTION 'Not your turn';
END IF;

-- Sets to UUID on turn switch
UPDATE match_rooms SET current_turn = v_other_player_id WHERE ...;
```

But the current v3 function expects `current_turn` to be **TEXT** ('player1' or 'player2'):

```sql
-- TEXT comparison (from v3, lines 85-88)
IF (v_is_player1 AND v_room.current_turn != 'player1') OR
   (NOT v_is_player1 AND v_room.current_turn != 'player2') THEN
  RAISE EXCEPTION 'Not your turn';
END IF;

-- Sets to TEXT on turn switch (line 243)
UPDATE match_rooms SET current_turn = CASE WHEN current_turn = 'player1' THEN 'player2' ELSE 'player1' END;
```

---

## How to Check Current State

Run this SQL in Supabase to check the column type:

```sql
SELECT
  column_name,
  data_type,
  udt_name
FROM information_schema.columns
WHERE table_name = 'match_rooms'
  AND column_name = 'current_turn';
```

**Results:**
- If `data_type = 'uuid'` → You need v4 migration
- If `data_type = 'text'` or `'character varying'` → v3 works fine

---

## Migration Needed (If current_turn is UUID)

The v4 migration file is ready and documented here. To apply it, you need to manually create this migration in Supabase:

**Migration filename:** `20260205000000_create_rpc_quick_match_submit_visit_v4_uuid_fix.sql`

**Content:** See the complete SQL below that:
1. Drops v4 if exists
2. Creates `rpc_quick_match_submit_visit_v4` with UUID support
3. Uses `v_room.current_turn != v_user_id` (UUID comparison)
4. Sets `current_turn = v_other_player_id` (UUID value)
5. Properly handles leg starter tracking with UUIDs

---

## V4 Migration SQL (UUID Support)

```sql
/*
  # Create rpc_quick_match_submit_visit_v4 with UUID current_turn support

  ## Summary
  Creates v4 of the quick match submit function that properly handles current_turn as UUID
  instead of TEXT ('player1'/'player2').

  ## Changes from v3
  - current_turn checks use UUID comparison (match with player_id directly)
  - Turn switching sets current_turn to opponent's UUID (player_id)
  - Leg starter tracking uses UUID
  - All turn logic now uses UUID values consistently
*/

-- Drop existing v4 if it exists
DROP FUNCTION IF EXISTS public.rpc_quick_match_submit_visit_v4(UUID, INTEGER, JSONB, BOOLEAN, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.rpc_quick_match_submit_visit_v4(UUID, INTEGER, JSONB, BOOLEAN);

-- Create v4 with UUID support
CREATE FUNCTION public.rpc_quick_match_submit_visit_v4(
  p_room_id UUID,
  p_score INTEGER,
  p_darts JSONB DEFAULT '[]'::JSONB,
  p_is_bust BOOLEAN DEFAULT FALSE,
  p_darts_thrown INTEGER DEFAULT 3,
  p_darts_at_double INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_room RECORD;
  v_is_player1 BOOLEAN;
  v_current_remaining INTEGER;
  v_new_remaining INTEGER;
  v_is_bust BOOLEAN := FALSE;
  v_bust_reason TEXT := NULL;
  v_is_checkout BOOLEAN := FALSE;
  v_player1_legs INTEGER := 0;
  v_player2_legs INTEGER := 0;
  v_leg_won BOOLEAN := FALSE;
  v_match_won BOOLEAN := FALSE;
  v_winner_id UUID := NULL;
  v_next_leg INTEGER;
  v_next_leg_starter UUID;
  v_other_player_id UUID;
  v_last_dart JSONB;
  v_is_double_finish BOOLEAN := FALSE;
  v_score_applied INTEGER;
  v_visit_number INTEGER := 1;
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock and get room
  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  -- Check if user is in this room
  IF v_room.player1_id != v_user_id AND v_room.player2_id != v_user_id THEN
    RAISE EXCEPTION 'You are not in this room';
  END IF;

  -- Check if room is active
  IF v_room.status != 'active' THEN
    RAISE EXCEPTION 'Room is not active (status: %)', v_room.status;
  END IF;

  -- Determine which player
  v_is_player1 := (v_room.player1_id = v_user_id);

  -- Get other player ID
  v_other_player_id := CASE WHEN v_is_player1 THEN v_room.player2_id ELSE v_room.player1_id END;

  -- Verify it's their turn (UUID comparison)
  IF v_room.current_turn != v_user_id THEN
    RAISE EXCEPTION 'Not your turn (current_turn: %, your_id: %)', v_room.current_turn, v_user_id;
  END IF;

  -- Get current remaining score
  IF v_is_player1 THEN
    v_current_remaining := v_room.player1_remaining;
  ELSE
    v_current_remaining := v_room.player2_remaining;
  END IF;

  -- Get next visit number for this leg
  SELECT COALESCE(MAX(turn_no), 0) + 1 INTO v_visit_number
  FROM quick_match_visits
  WHERE room_id = p_room_id AND leg = v_room.current_leg AND player_id = v_user_id;

  -- Check for explicit bust from client (Bust button)
  IF p_is_bust THEN
    v_is_bust := TRUE;
    v_bust_reason := 'manual_bust';
    v_new_remaining := v_current_remaining;
    v_score_applied := 0;
  ELSE
    -- Calculate new remaining
    v_new_remaining := v_current_remaining - p_score;

    -- Check for automatic bust conditions
    IF v_new_remaining < 0 THEN
      v_is_bust := TRUE;
      v_bust_reason := 'below_zero';
      v_new_remaining := v_current_remaining;
      v_score_applied := 0;
    ELSIF v_new_remaining = 1 THEN
      v_is_bust := TRUE;
      v_bust_reason := 'left_on_one';
      v_new_remaining := v_current_remaining;
      v_score_applied := 0;
    ELSIF v_new_remaining = 0 THEN
      -- Potential checkout - validate double-out if required
      IF v_room.double_out THEN
        -- Only enforce double-out when remaining_before <= 50
        IF v_current_remaining <= 50 THEN
          -- Get the last dart
          IF jsonb_array_length(p_darts) > 0 THEN
            v_last_dart := p_darts -> (jsonb_array_length(p_darts) - 1);

            -- Check if last dart is a double
            IF (v_last_dart->>'mult' = 'D') OR (v_last_dart->>'mult' = 'DB') THEN
              v_is_double_finish := TRUE;
            END IF;

            -- If double-out required but last dart wasn't double, it's a bust
            IF NOT v_is_double_finish THEN
              v_is_bust := TRUE;
              v_bust_reason := 'double_out_required';
              v_new_remaining := v_current_remaining;
              v_score_applied := 0;
            ELSE
              v_score_applied := p_score;
            END IF;
          ELSE
            -- No darts provided but claiming checkout - treat as bust
            v_is_bust := TRUE;
            v_bust_reason := 'double_out_required';
            v_new_remaining := v_current_remaining;
            v_score_applied := 0;
          END IF;
        ELSE
          -- Remaining > 50, no double-out enforcement yet, valid checkout
          v_score_applied := p_score;
        END IF;
      ELSE
        -- No double-out required, valid checkout
        v_score_applied := p_score;
      END IF;
    ELSE
      -- Normal scoring
      v_score_applied := p_score;
    END IF;
  END IF;

  -- Check for checkout
  v_is_checkout := (v_new_remaining = 0 AND NOT v_is_bust);

  -- Insert visit into quick_match_visits
  INSERT INTO quick_match_visits (
    room_id, player_id, leg, turn_no, score,
    remaining_before, remaining_after,
    darts, darts_thrown, darts_at_double,
    is_bust, bust_reason, is_checkout
  ) VALUES (
    p_room_id, v_user_id, v_room.current_leg, v_visit_number, p_score,
    v_current_remaining, v_new_remaining,
    p_darts, p_darts_thrown, p_darts_at_double,
    v_is_bust, v_bust_reason, v_is_checkout
  );

  -- Update remaining score for current player
  IF v_is_player1 THEN
    UPDATE match_rooms SET player1_remaining = v_new_remaining WHERE id = p_room_id;
  ELSE
    UPDATE match_rooms SET player2_remaining = v_new_remaining WHERE id = p_room_id;
  END IF;

  -- If checkout, handle leg win
  IF v_is_checkout THEN
    v_leg_won := TRUE;

    -- Get current leg counts from summary
    v_player1_legs := COALESCE((v_room.summary->>'player1_legs')::INTEGER, 0);
    v_player2_legs := COALESCE((v_room.summary->>'player2_legs')::INTEGER, 0);

    -- Increment winner's legs
    IF v_is_player1 THEN
      v_player1_legs := v_player1_legs + 1;
    ELSE
      v_player2_legs := v_player2_legs + 1;
    END IF;

    -- Check if match won
    IF v_player1_legs > (v_room.legs_to_win - 1) THEN
      v_match_won := TRUE;
      v_winner_id := v_room.player1_id;
    ELSIF v_player2_legs > (v_room.legs_to_win - 1) THEN
      v_match_won := TRUE;
      v_winner_id := v_room.player2_id;
    END IF;

    IF v_match_won THEN
      -- Match complete
      UPDATE match_rooms
      SET status = 'finished', winner_id = v_winner_id,
          summary = jsonb_build_object('player1_legs', v_player1_legs, 'player2_legs', v_player2_legs),
          updated_at = NOW()
      WHERE id = p_room_id;
    ELSE
      -- Start new leg
      v_next_leg := v_room.current_leg + 1;

      -- Alternate starting player using UUID
      IF v_room.leg_starter_id = v_room.player1_id THEN
        v_next_leg_starter := v_room.player2_id;
      ELSE
        v_next_leg_starter := v_room.player1_id;
      END IF;

      UPDATE match_rooms
      SET current_leg = v_next_leg,
          leg_starter_id = v_next_leg_starter,
          current_turn = v_next_leg_starter,  -- UUID value
          player1_remaining = v_room.game_mode,
          player2_remaining = v_room.game_mode,
          summary = jsonb_build_object('player1_legs', v_player1_legs, 'player2_legs', v_player2_legs),
          updated_at = NOW()
      WHERE id = p_room_id;
    END IF;
  ELSE
    -- Switch turn to opponent (UUID value)
    UPDATE match_rooms
    SET current_turn = v_other_player_id,  -- UUID value
        updated_at = NOW()
    WHERE id = p_room_id;
  END IF;

  -- Return response
  RETURN jsonb_build_object(
    'ok', TRUE,
    'remaining_after', v_new_remaining,
    'score_applied', v_score_applied,
    'is_bust', v_is_bust,
    'bust_reason', v_bust_reason,
    'is_checkout', v_is_checkout,
    'leg_won', v_leg_won,
    'match_won', v_match_won,
    'double_out', v_room.double_out,
    'player1_legs', v_player1_legs,
    'player2_legs', v_player2_legs,
    'current_turn', v_other_player_id  -- Return the new turn player UUID
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_quick_match_submit_visit_v4 TO authenticated;

COMMENT ON FUNCTION public.rpc_quick_match_submit_visit_v4 IS 'V4: Fixed to use UUID for current_turn instead of TEXT. Properly handles turn switching with player IDs. Stores visits in quick_match_visits table with full dart details.';
```

---

## After Applying v4 Migration

Update the frontend to call v4:

```typescript
// In app/app/play/quick-match/match/[matchId]/page.tsx line 1242
const { data, error } = await supabase.rpc("rpc_quick_match_submit_visit_v4", {
  p_room_id: matchId,
  p_score: score,
  p_darts: dartsArray,
  p_is_bust: isBust
});
```

---

## Summary

**Current Status:**
- ✅ Frontend calls v3 (works if current_turn is TEXT)
- ⚠️ Need to verify match_rooms.current_turn column type
- ⚠️ If UUID, apply v4 migration above
- ⚠️ Then update frontend to call v4

**Files Modified:**
- `app/app/play/quick-match/match/[matchId]/page.tsx` - Line 1242 (now calls v3)

**Next Steps:**
1. Run the SQL query to check current_turn type
2. If UUID, manually apply the v4 migration in Supabase dashboard
3. Update frontend to call v4 instead of v3

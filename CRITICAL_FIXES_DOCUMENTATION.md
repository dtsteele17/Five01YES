# Critical Fixes Documentation

⚠️ **DO NOT MODIFY THESE FIXES WITHOUT TESTING** ⚠️

This document tracks critical fixes that are working correctly and should not be changed without thorough testing.

## 1. Tournament Ready-Up System

**Migration:** `20260202350000_fix_tournament_ready_id_mismatch.sql`

**Status:** ✅ WORKING - DO NOT CHANGE

**Key Points:**
- `tournament_match_ready.user_id` stores `profiles.id` (NOT `auth.users.id`)
- `tournament_matches.player1_id/player2_id` are `auth.users.id`
- The RPC function converts `auth.uid()` to `profiles.id` before inserting

**Critical Code:**
```sql
-- Line 48: Get profile ID from auth user ID
SELECT id INTO v_profile_id FROM profiles WHERE user_id = v_user_id;

-- Line 55: Insert profile ID (NOT auth user ID)
INSERT INTO tournament_match_ready (match_id, user_id, ready_at)
VALUES (p_match_id, v_profile_id, now())
```

**Testing Checklist:**
- [ ] Player 1 ready up → shows 1/2
- [ ] Player 2 ready up → shows 2/2
- [ ] Match starts automatically when both ready
- [ ] Works from different accounts/browsers

---

## 2. Match Turn Switching & Leg Scores

**Migration:** `20260202360000_ensure_turn_switching_and_leg_scores.sql`

**Status:** ✅ WORKING - DO NOT CHANGE

**Key Points:**
- Turn MUST switch after every visit (line 189)
- Leg scores MUST be maintained in `summary` JSONB
- Summary JSONB MUST always exist with `player1_legs` and `player2_legs`

**Critical Code:**
```sql
-- Line 189: ALWAYS switch turn to opponent
current_turn = v_other_player_id

-- Lines 190-197: ALWAYS maintain summary with leg scores
summary = jsonb_build_object('player1_legs', ..., 'player2_legs', ...)
```

**Frontend:** `app/app/match/online/[matchId]/page.tsx`
- Lines 270-277: Always reload match data after submit
- DO NOT REMOVE the reload calls - they're essential

**Testing Checklist:**
- [ ] Player A submits score → turn switches to Player B
- [ ] Player B can immediately submit (turn indicator updates)
- [ ] Player wins leg → leg score updates (e.g., 1-0, 2-1)
- [ ] Leg scores display correctly throughout match
- [ ] Both players can continue playing without turn getting stuck

---

## 3. Match Rooms vs Online Matches

**Important:** The system uses `match_rooms` table, NOT `online_matches`.

**All RPC functions must:**
- Query `match_rooms` table
- Use `match_rooms.id` as room/match ID
- Update `match_rooms.current_turn` for turn switching
- Store leg scores in `match_rooms.summary` JSONB

---

## Before Making Changes

If you need to modify any of these systems:

1. **Read this document first**
2. **Understand why the current code works**
3. **Test thoroughly:**
   - Test with 2 different accounts/browsers
   - Verify turn switching works
   - Verify leg scores update correctly
   - Verify ready-up works for both players
4. **Update this document** if you make changes

---

## Migration Order

These migrations must be run in order:
1. `20260202350000_fix_tournament_ready_id_mismatch.sql` - Tournament ready-up
2. `20260202360000_ensure_turn_switching_and_leg_scores.sql` - Match gameplay

Do not skip or reorder these migrations.

# Tournament System Implementation Summary

## Overview

This implementation provides a complete DartCounter-like tournament system with:
- Registration and check-in phases
- Single elimination bracket generation with byes
- Match ready-up with auto-forfeit
- Winner advancement through bracket
- Live bracket updates
- Admin controls

## Files Created/Modified

### 1. Database Migration
**File:** `supabase/migrations/20260223000000_complete_tournament_system.sql`

**Contains:**
- Status constraints for tournaments, participants, and matches
- `tournament_scheduler_log` table for observability
- `rpc_tournament_check_in()` - Player check-in function
- `generate_tournament_bracket()` - Bracket generation with byes
- `process_due_tournaments()` - Scheduler for tournament progression
- `process_ready_deadlines()` - Auto-forfeit handler
- `advance_tournament_winner()` - Bracket advancement helper
- `handle_match_room_complete()` - Trigger for match completion
- Admin functions: `admin_force_start_tournament()`, `admin_extend_check_in()`, `admin_force_forfeit()`
- RLS policies

### 2. Edge Function (Scheduler)
**File:** `supabase/functions/tournament-scheduler/index.ts`

A Supabase Edge Function that runs the scheduler RPCs every minute.

### 3. Setup Documentation
**File:** `TOURNAMENT_SCHEDULER_SETUP.md`

Instructions for setting up the scheduled job using:
- Supabase Cron (recommended)
- pg_cron (database-only)
- External cron service (Vercel, etc.)

### 4. Frontend Updates
**File:** `app/app/tournaments/[tournamentId]/page.tsx`

**Changes:**
- Added check-in button during checkin phase
- Show checked-in status in participants list
- Display checked-in count during checkin phase
- Import CheckCircle icon

## Tournament Status Flow

```
draft → scheduled → checkin → in_progress → completed
         ↓              ↓            ↓
    (registration  (check-in   (bracket
      open)         window)     running)
```

## Match Status Flow

```
pending → ready_check → in_game → completed
    ↓
 forfeit (if deadline missed)
   ↓
bye (if odd bracket)
```

## Key Features

### 1. Check-In System
- Tournament enters `checkin` status 10 minutes before start
- Registered players must check in to be included in bracket
- Bracket is generated using ONLY checked-in participants

### 2. Bracket Generation
- Single elimination format
- Next power-of-2 bracket size with byes
- Byes automatically advance to next round
- Supports any number of participants (2+)

### 3. Match Ready-Up
- 5-minute ready window when match becomes playable
- Both players must ready up
- Auto-forfeit if deadline passes:
  - One ready, one not: Ready player wins
  - Neither ready: Player1 wins (deterministic)

### 4. Winner Advancement
- Automatic advancement to next round match
- Tournament completes when final match done
- Updates tournament.current_round as rounds complete

### 5. Admin Controls
- `admin_force_start_tournament()` - Start before scheduled time
- `admin_extend_check_in()` - Extend check-in window
- `admin_force_forfeit()` - Manually forfeit a player

## Database Schema

### tournaments
| Column | Status Values |
|--------|--------------|
| status | draft, scheduled, checkin, in_progress, completed, cancelled |
| bracket_generated_at | Timestamp when bracket created |
| current_round | Current active round number |
| total_rounds | Total rounds in bracket |

### tournament_participants
| Column | Status Values |
|--------|--------------|
| status_type | registered, checked-in, eliminated, withdrawn |

### tournament_matches
| Column | Status Values |
|--------|--------------|
| status | pending, ready, ready_check, in_game, completed, forfeit, bye |
| playable_at | When match can start |
| ready_deadline | Deadline for ready-up |
| match_room_id | Link to match_rooms when live |

## Scheduler Jobs

### process_due_tournaments()
Runs every minute:
1. Finds tournaments starting within 10 minutes → sets status to `checkin`
2. Finds tournaments at start time with checked-in players → generates bracket

### process_ready_deadlines()
Runs every minute:
1. Finds matches past ready_deadline
2. Determines winner based on ready status
3. Advances winner through bracket

## Frontend Integration

### Tournament Detail Page
- Shows "Check In Now" button during checkin phase
- Shows "Checked In" badge after check-in
- Displays checked-in count vs registered count during checkin
- Shows participant status badges (Checked In, Organizer, You)

### Tournament Bracket Tab
- Uses existing `TournamentBracketTab` component
- Realtime updates via Supabase subscriptions
- Shows match status and ready state

## Testing Plan

### 1. Create Tournament
```sql
INSERT INTO tournaments (
  name, description, start_at, status, max_participants, 
  game_mode, best_of_legs, entry_type, owner_id
) VALUES (
  'Test Tournament', 'Description', NOW() + INTERVAL '15 minutes',
  'scheduled', 8, 501, 3, 'open', 'your-user-id'
);
```

### 2. Register Players
- Have multiple users register via UI
- Verify participants appear in list

### 3. Check-In Phase
- Wait for 10 minutes before start (or manually update start_at)
- Verify status changes to `checkin`
- Players click "Check In Now"
- Verify checked-in count updates

### 4. Bracket Generation
- At start time, verify bracket generates automatically
- Check `tournament_matches` table for matches
- Verify byes auto-complete

### 5. Match Play
- Players see their matches in Bracket tab
- Click "I'm Ready" button
- When both ready, match room created
- Players redirected to match

### 6. Match Completion
- Complete match in match room
- Verify winner advances in bracket
- Check tournament status updates

### 7. Auto-Forfeit Test
- Create match with short ready deadline
- Only one player ready up
- Wait for deadline
- Verify auto-forfeit and winner advance

## Monitoring

### View Scheduler Logs
```sql
-- Recent runs
SELECT * FROM tournament_scheduler_log
ORDER BY ran_at DESC
LIMIT 20;

-- Errors only
SELECT * FROM tournament_scheduler_log
WHERE jsonb_array_length(errors) > 0
ORDER BY ran_at DESC;
```

### Manual Function Test
```sql
-- Test tournament processing
SELECT process_due_tournaments();

-- Test ready deadline processing
SELECT process_ready_deadlines();
```

## Deployment Checklist

- [ ] Run migration SQL in Supabase SQL Editor
- [ ] Deploy Edge Function: `npx supabase functions deploy tournament-scheduler`
- [ ] Set up cron job (see TOURNAMENT_SCHEDULER_SETUP.md)
- [ ] Verify RLS policies are active
- [ ] Test with a small tournament
- [ ] Monitor scheduler logs for errors

## Existing Functions Used

The implementation integrates with these existing functions:
- `ready_up_tournament_match()` - Already exists and works
- `start_tournament()` - Already exists
- `report_tournament_match_winner()` - Already exists
- Views: `v_tournament_bracket`, `v_tournament_playable_matches` - Already exist

## Notes

- The system is designed to be backward compatible with existing tournaments
- Existing tournaments in progress will continue to work
- Bracket generation is idempotent (can't run twice due to `bracket_generated_at` check)
- Auto-forfeit uses deterministic rules (not random)
- All progression is server-authoritative via RPCs

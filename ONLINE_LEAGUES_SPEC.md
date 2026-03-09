# Online Leagues Feature Spec

## Overview
Make the existing leagues system fully functional so users can create, browse, join, and play in online leagues against each other. Think F1 online leagues but for darts.

## What Already Exists
- `leagues` table in Supabase (name, owner_id, game_mode, match_format, access, start_date, match_days, match_time, games_per_day, legs_per_game, camera_required, playoffs, double_out, straight_in)
- `league_members` table (league_id, user_id, role)
- `rpc_create_league` function (inserts into leagues + adds owner as member)
- Frontend: `app/app/leagues/page.tsx` (208 lines — lists user's leagues, "Create League" button)
- Frontend: `app/app/leagues/[leagueId]/page.tsx` (league detail page with tabs: Standings, Fixtures, Players, Live Updates, Stats)
- Frontend: `app/app/leagues/[leagueId]/manage/page.tsx` (admin manage page)
- Frontend: `components/app/CreateLeagueModal.tsx` (569 lines — 5-step wizard: Basics, Schedule, Rules, Playoffs, Review)
- Tournament system already exists with match_room, ready-up, real-time play

## What Needs to Be Built

### 1. Database (Supabase SQL migrations)

#### New tables needed:
- `league_fixtures` — individual scheduled matches between two league members
  - id, league_id, home_user_id, away_user_id, matchday, scheduled_date, scheduled_time, status (scheduled/live/completed/cancelled), home_score, away_score, home_legs_won, away_legs_won, match_room_id, completed_at
- `league_standings` — live league table  
  - id, league_id, user_id, played, won, lost, drawn, legs_for, legs_against, points, average, form (last 5 results as string like "WWLWL"), position
- `league_warnings` — admin warnings to players
  - id, league_id, user_id, admin_id, reason, created_at

#### Alter existing tables:
- `leagues` — add: status (open/closed/active/completed), close_date, max_participants (may already exist), description
- `league_members` — add: joined_at, status (active/kicked/left), kicked_by, kick_reason

#### New RPC functions:
- `rpc_join_league(p_league_id)` — join an open league (check max participants, not already joined, not closed)
- `rpc_leave_league(p_league_id)` — leave a league (not if owner, not if league active)
- `rpc_generate_league_fixtures(p_league_id)` — generate round-robin fixtures based on schedule settings (called when league closes/starts)
- `rpc_close_league(p_league_id)` — admin closes registration, generates fixtures
- `rpc_start_league(p_league_id)` — marks league as active
- `rpc_complete_league_match(p_fixture_id, p_home_legs, p_away_legs)` — record result, update standings
- `rpc_admin_kick_player(p_league_id, p_user_id, p_reason)` — kick a player
- `rpc_admin_warn_player(p_league_id, p_user_id, p_reason)` — warn a player
- `rpc_admin_reschedule_fixture(p_fixture_id, p_new_date, p_new_time)` — change fixture time
- `rpc_admin_update_league(p_league_id, ...)` — update league settings
- `rpc_get_league_details(p_league_id)` — get full league info + standings + fixtures + members
- `rpc_browse_leagues()` — list all open leagues that user can join

#### RLS policies:
- Anyone can read leagues with status 'open' or 'active'
- Only members can read league fixtures/standings
- Only owner can update league settings
- Only authenticated users can join open leagues

### 2. Frontend Changes

#### Leagues list page (`app/app/leagues/page.tsx`):
- Add "Browse Leagues" tab showing all open leagues other users created
- Each league card shows: name, participants (X/max), start date, match format, join button
- "Your Leagues" tab shows leagues user is in
- Search/filter leagues

#### League detail page (`app/app/leagues/[leagueId]/page.tsx`):
- **Join button** if user is not a member and league is open
- **Standings tab**: Live league table (like career mode but with real usernames)
- **Fixtures tab**: All scheduled matches with dates/times, results
- **Players tab**: List of all members with join date, form
- **Live Updates tab**: Recent results, upcoming matches
- **Stats tab**: League stats (top scorer, best average, etc.)

#### League manage page (`app/app/leagues/[leagueId]/manage/page.tsx`):
- Only visible to league owner
- **Players section**: List with kick/warn buttons
- **Fixtures section**: List with reschedule button per fixture
- **Settings section**: Edit league name, description, times
- **Close Registration** button (generates fixtures)
- **Start League** button

#### Create League Modal (`components/app/CreateLeagueModal.tsx`):
- Already has 5 steps — make sure form data maps to rpc_create_league params correctly
- Add close_date field (registration deadline)
- Add description field

### 3. Match Flow (when fixture time arrives)

This should work EXACTLY like the existing tournament match system:
1. When fixture time is reached, both players see a "Match Ready" notification/popup
2. Both players must "Ready Up" within X minutes
3. When both ready, a match_room is created and they play the match
4. Results are automatically recorded and standings updated
5. If a player doesn't ready up, they forfeit (loss)
6. If multiple games per day, next fixture starts after current one completes

### 4. Fixture Generation Algorithm

When admin closes registration:
1. Get all league members
2. Generate round-robin schedule: each player plays every other player once (or twice for home/away)
3. Distribute fixtures across the selected match days and times
4. If games_per_day > 1, schedule multiple fixtures on same day (sequential times)
5. Start from the league start_date, using only selected match_days (Mon, Tue, etc.)
6. Points system: Win = 2 points, Loss = 0 (same as career mode)

### 5. Real-time Features (Supabase Realtime)
- Subscribe to league_fixtures changes for live score updates
- Subscribe to league_standings changes for live table updates
- Notification when your fixture is about to start (5 min warning)

## Important Constraints
- Use existing Supabase tables where they exist (leagues, league_members)
- Use ADD COLUMN IF NOT EXISTS for alterations
- Match launching should reuse existing match_room system
- Don't break existing tournament or career mode functionality
- All dates/times should respect user's timezone
- Frontend must be mobile responsive
- Use existing UI components (Card, Button, Badge, etc.)

## File Locations
- Frontend: `app/app/leagues/` (pages), `components/app/` (components)
- SQL: `supabase/migrations/` (new migration files)
- Existing league RPC: `supabase/migrations/20260210073550_complete_rpc_functions_setup.sql`
- Existing tournament match flow: `app/app/tournaments/` (reference for ready-up, match_room)
- Existing match room: search for `match_room` in the codebase

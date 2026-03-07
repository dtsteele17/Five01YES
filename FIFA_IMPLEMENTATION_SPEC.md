# FIFA Career Mode Implementation Spec

## What ALREADY EXISTS (DO NOT DUPLICATE)

### Tables (in 20260304_career_mode_tables.sql):
- career_profiles (has tier, season, week, day, rep, form)
- career_schedule_templates (has all 5 tiers seeded)
- career_events
- career_opponents
- career_matches
- career_league_standings (columns: played, won, lost, legs_for, legs_against, points, average)
- career_brackets
- career_sponsor_catalog (has sponsors seeded for tiers 2-5)
- career_sponsor_contracts
- career_world_rankings
- career_premier_league_seasons
- career_premier_league_table
- career_milestones

### RPC Functions that exist:
- rpc_create_career_profile, rpc_get_career_saves, rpc_abandon_career
- rpc_get_career_home, rpc_get_career_home_with_season_end_locked_fixed_v3
- rpc_career_play_next_event_locked_fixed
- rpc_career_complete_match
- rpc_career_init_bracket_event, rpc_career_complete_bracket_event, rpc_career_save_bracket
- rpc_generate_career_opponents
- rpc_career_generate_tier2_opponents, rpc_career_generate_tier3_league
- rpc_career_tournament_choice (Tier 3 tournament choice handling)
- rpc_career_check_sponsor_offer, rpc_career_accept_sponsor
- rpc_career_tier2_season_complete (promotion to tier 3 or relegation tournament)
- rpc_career_complete_season, rpc_career_advance_season
- rpc_generate_career_emails
- rpc_get_week_fixtures_with_match_lock, rpc_get_week_results_with_standings

### Frontend pages that exist:
- app/app/career/page.tsx (career home - handles tiers 1-5, emails, sponsors, world rankings)
- app/app/career/start/page.tsx
- app/app/career/bracket/page.tsx (tournament bracket play)
- app/app/career/week/[runId]/page.tsx (week fixtures - league match launch)
- app/app/career/fixtures/page.tsx
- app/app/career/results/page.tsx
- app/app/career/season-end/page.tsx
- app/app/career/sponsor-offer/page.tsx
- app/app/career/tournament-choice/page.tsx

### Schedule templates already seeded (20260304_career_mode_seed.sql):
- Tier 1: 3 trial tournaments (day-based)
- Tier 2: 7 league matches + 1 Golden Oche Cup open (8 events)
- Tier 3: 7 league matches + County Open + County Qualifier + Promotion Weekend (10 events)
- Tier 4: 8 league matches + Regional Open + Ranking Open + Regional Qualifier + Promotion Weekend (12 events)
- Tier 5: 8 league matches + 2 Pro Series Opens + World Qualifier + Championship Qualifier + The Grand Open + Season Finals (14 events)

### Also exists from 20260305 migrations:
- Tier 3 tournament choice system (replaces fixed Tier 3 schedule with tournament_choice events)
- Tier 2 relegation tournament
- Season end event type
- rpc_career_tier2_season_complete (handles promotion/relegation)

## What's MISSING from the FIFA plan

After thorough audit, here's what the existing system is MISSING:

### 1. Tier 2 Pub League: Round-Robin with 8 Players (PARTIALLY EXISTS)
**Existing**: Schedule has 7 league matchdays. League standings table exists. Tier 2 opponent generation exists.
**Missing**: 
- The schedule should be 7 round-robin matches (player vs each of 7 opponents). Currently it's just generic "matchday" events with no opponent assignment logic for round-robin.
- Need to verify rpc_career_play_next_event_locked_fixed correctly assigns unique opponents for each matchday

### 2. Tier 3 County League: 12 Players (CONFLICT)
**Problem**: Two competing Tier 3 schedules exist:
- Original seed (20260304): 10 events with fixed opens/qualifiers
- Tier 3 expansion (20260305): Replaces with 9 league + 3 tournament_choice events + relegation
- These may conflict at the DB level

### 3. Mid-Season Tournament Triggers
**Existing**: Tier 2 has "The Golden Oche Cup" at sequence 5 (between matchday 4 and 5). Tier 3 has tournament_choice events.
**Missing**: The FIFA plan wanted tournaments triggered after the 4th league match specifically, with choice to enter/decline. The existing system has this for Tier 3 but NOT for Tier 2 (Tier 2 just has a fixed open at sequence 5).

### 4. FIFA-Style Season Turnover
**Existing**: rpc_career_tier2_season_complete handles promotion to tier 3 and relegation. rpc_career_complete_season and rpc_career_advance_season exist.
**Missing**: 
- Refreshing 2-3 opponents between seasons (keeping rivals)
- International name diversity in opponent generation (the tier3 expansion has British names but not international ones)

### 5. Career Emails
**Existing**: rpc_generate_career_emails function exists. Frontend generates contextual emails client-side based on milestones.
**Status**: DONE - exists and works.

### 6. Sponsor System  
**Existing**: Full sponsor catalog seeded, rpc_career_check_sponsor_offer, rpc_career_accept_sponsor, sponsor-offer page.
**Missing**: The FIFA plan wanted 8 additional sponsors (Ace Arrows, Bulls Eye Brewery, etc.) at Tiers 3-5. Current catalog has sponsors but could use more variety.
**Status**: MOSTLY DONE - just need to seed more sponsors if desired.

## RECOMMENDED IMPLEMENTATION (minimal, non-overlapping)

### Migration 1: FIFA Enhancements (single file)
1. Add more sponsors to career_sponsor_catalog (INSERT only, no duplicates)
2. Update opponent generation to use international name pool (diverse first/last names)
3. Add tournament_choice event to Tier 2 schedule (replace the fixed Golden Oche Cup with a choice)
4. Add opponent refresh logic for season turnover

### DO NOT:
- Create any new tables (all needed tables exist)
- Override existing functions without checking they work
- Use `wins`/`losses` columns — existing schema uses `won`/`lost`
- Create duplicate migration files
- Break existing Tier 1 tournament flow

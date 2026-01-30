# Tournament Cron Job Setup

## Overview

The `tournament-cron` Edge Function handles automated tournament management:
- **Bracket Generation**: Generates brackets for tournaments starting within 5 minutes
- **Tournament Start**: Starts tournaments when their start time arrives

## Edge Function Details

**Function Name**: `tournament-cron`
**Status**: Deployed ✓
**Verify JWT**: No (allows cron trigger access)

### What It Does

#### Phase 1: Bracket Generation
- Queries tournaments with:
  - `status = 'scheduled'`
  - `bracket_generated_at IS NULL`
  - `start_at <= NOW() + INTERVAL '5 minutes'`
- Calls `generate_tournament_bracket(tournament_id)` RPC for each tournament

#### Phase 2: Tournament Start
- Queries tournaments with:
  - `status = 'scheduled'`
  - `started_at IS NULL`
  - `start_at <= NOW()`
- Calls `start_tournament_round_one(tournament_id)` RPC for each tournament

### Response Format

```json
{
  "success": true,
  "timestamp": "2026-01-25T12:00:00.000Z",
  "processed": {
    "bracketsGenerated": 2,
    "tournamentsStarted": 1
  },
  "errors": [] // Only present if errors occurred
}
```

## Setting Up the Cron Trigger

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **Database** > **Cron Jobs**
3. Click **Create a new cron job**
4. Configure:
   - **Name**: `tournament-cron-job`
   - **Schedule**: `* * * * *` (every minute)
   - **Command**:
     ```sql
     SELECT
       net.http_post(
         url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/tournament-cron',
         headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
       ) as request_id;
     ```
5. Replace `YOUR_PROJECT_REF` with your Supabase project reference
6. Replace `YOUR_SERVICE_ROLE_KEY` with your service role key
7. Click **Create cron job**

### Option 2: Using SQL Migration

Create a migration file with the following SQL:

```sql
-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create the cron job to run every minute
SELECT cron.schedule(
  'tournament-cron-job',
  '* * * * *', -- Every minute
  $$
  SELECT
    net.http_post(
      url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/tournament-cron',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
    ) as request_id;
  $$
);
```

### Option 3: Manual HTTP Trigger (Testing)

For testing purposes, you can manually trigger the function:

```bash
curl -X POST \
  https://YOUR_PROJECT_REF.supabase.co/functions/v1/tournament-cron \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

## Monitoring

### View Cron Job Status

```sql
-- List all cron jobs
SELECT * FROM cron.job;

-- View cron job execution history
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'tournament-cron-job')
ORDER BY start_time DESC
LIMIT 10;
```

### Edge Function Logs

1. Go to **Edge Functions** in Supabase Dashboard
2. Click on `tournament-cron`
3. View the **Logs** tab for execution details

## Required RPC Functions

The cron job depends on these RPC functions existing in your database:

1. **generate_tournament_bracket(tournament_id UUID)**
   - Generates the bracket structure for a tournament
   - Updates `bracket_generated_at` timestamp

2. **start_tournament_round_one(tournament_id UUID)**
   - Starts the first round of matches
   - Updates `started_at` timestamp
   - Changes status to 'in_progress'

## Troubleshooting

### Cron Job Not Running

1. Verify pg_cron extension is enabled:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```

2. Check cron job exists:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'tournament-cron-job';
   ```

3. Check recent executions:
   ```sql
   SELECT * FROM cron.job_run_details
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'tournament-cron-job')
   ORDER BY start_time DESC;
   ```

### Edge Function Errors

- Check Edge Function logs in Supabase Dashboard
- Verify environment variables are set (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
- Ensure RPC functions exist and have correct permissions

### No Tournaments Being Processed

- Verify tournaments exist with correct status and timestamps
- Check that `bracket_generated_at` and `started_at` columns are properly set
- Review Edge Function logs for query results

## Deleting the Cron Job

If you need to remove the cron job:

```sql
SELECT cron.unschedule('tournament-cron-job');
```

## Notes

- The cron job runs every minute (60 seconds)
- Each execution processes all eligible tournaments
- Errors are logged but don't stop execution
- Service role key is required for bypassing RLS policies
- Environment variables are automatically configured in the Edge Function

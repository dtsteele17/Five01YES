# Tournament Scheduler Setup

This document describes how to set up the automated tournament scheduler.

## Overview

The tournament scheduler runs every minute to:
1. Move tournaments from `scheduled` → `checkin` when within 10 minutes of start
2. Generate brackets and start tournaments at their scheduled time
3. Auto-forfeit players who don't ready up within the deadline
4. Advance winners through the bracket

## Setup Options

### Option 1: Supabase Cron (Recommended)

1. **Deploy the Edge Function:**
   ```bash
   cd FIVE01-Repo
   npx supabase functions deploy tournament-scheduler
   ```

2. **Create a Cron Job using Supabase Dashboard:**
   - Go to your Supabase Dashboard
   - Navigate to "Database" → "Cron"
   - Click "New Cron Job"
   - Name: `tournament-scheduler`
   - Schedule: `* * * * *` (every minute)
   - Command: 
     ```sql
     SELECT net.http_post(
       url:='https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/tournament-scheduler',
       headers:='{"Authorization": "Bearer <YOUR_SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb
     ) as request_id;
     ```

### Option 2: pg_cron (Database-only, no Edge Function needed)

Run this SQL in your Supabase SQL Editor:

```sql
-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create the scheduled job
SELECT cron.schedule(
  'tournament-scheduler',           -- job name
  '* * * * *',                      -- every minute
  $$
    -- Process due tournaments
    SELECT process_due_tournaments();
    
    -- Process ready deadlines
    SELECT process_ready_deadlines();
  $$
);

-- Verify the job was created
SELECT * FROM cron.job;

-- To unschedule:
-- SELECT cron.unschedule('tournament-scheduler');
```

### Option 3: External Cron Service (Vercel Cron, etc.)

If using Vercel, add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/tournament-scheduler",
      "schedule": "* * * * *"
    }
  ]
}
```

Then create `app/api/cron/tournament-scheduler/route.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Process due tournaments
  const { data: dueData } = await supabase.rpc('process_due_tournaments')

  // Process ready deadlines
  const { data: readyData } = await supabase.rpc('process_ready_deadlines')

  return NextResponse.json({
    success: true,
    due_tournaments: dueData,
    ready_deadlines: readyData,
  })
}
```

## Monitoring

### View Scheduler Logs

```sql
-- View recent scheduler runs
SELECT * FROM tournament_scheduler_log
ORDER BY ran_at DESC
LIMIT 20;

-- View errors only
SELECT * FROM tournament_scheduler_log
WHERE jsonb_array_length(errors) > 0
ORDER BY ran_at DESC
LIMIT 20;

-- View by function
SELECT * FROM tournament_scheduler_log
WHERE function_name = 'process_due_tournaments'
ORDER BY ran_at DESC
LIMIT 20;
```

### Manual Test

Run the functions manually to verify they work:

```sql
-- Test tournament processing
SELECT process_due_tournaments();

-- Test ready deadline processing
SELECT process_ready_deadlines();
```

## Troubleshooting

### Scheduler not running?

1. Check if cron is enabled: `SELECT * FROM pg_extension WHERE extname = 'pg_cron';`
2. Check cron jobs: `SELECT * FROM cron.job;`
3. Check job runs: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`

### Edge Function not working?

1. Check function logs in Supabase Dashboard → Edge Functions
2. Verify service role key has correct permissions
3. Test function URL directly with curl:
   ```bash
   curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/tournament-scheduler \
     -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
   ```

## Migration Notes

If you have existing tournaments in progress, the new system will:
- Continue to work with existing matches
- Auto-forfeit will apply to matches that haven't started yet
- Bracket advancement works for both old and new matches

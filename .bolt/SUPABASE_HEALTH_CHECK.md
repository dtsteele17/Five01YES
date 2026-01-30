# Supabase Health Check Page

## Overview

The Supabase Health Check page is located at `/app/dev/supabase-check` and provides comprehensive testing of your Supabase connection in development, preview, and production environments.

## Accessing the Page

Navigate to: `https://your-domain.com/app/dev/supabase-check`

## What It Tests

### 1. Environment Variables ✅
- **NEXT_PUBLIC_SUPABASE_URL** - Present/Missing
- **NEXT_PUBLIC_SUPABASE_ANON_KEY** - Present/Missing
- Displays masked values (first 6 and last 6 characters only)

**Expected Result**: Both variables present with valid values

### 2. Database Connection ✅
- Runs a simple public query against the `healthcheck` table
- Verifies basic connectivity to Supabase

**Expected Result**: Query returns "ok" message

### 3. Authentication ✅
- Checks current authentication status
- Shows user ID and email if logged in
- Provides Sign In/Sign Out buttons for testing

**Expected Result**:
- When not logged in: Shows "Not authenticated" (info status)
- When logged in: Shows user details (pass status)

### 4. Row Level Security (RLS) ✅
- Tests INSERT, SELECT, and DELETE operations on user-owned data
- Uses the `user_connection_test` table with RLS policies
- Only runs when user is authenticated

**Expected Result**: All three operations complete successfully

**Test Steps**:
1. Sign in first
2. Click "Run RLS Test"
3. System will:
   - Insert a test row with your user_id
   - Select rows for your user_id
   - Delete the test row
4. All operations should pass

### 5. Realtime Subscriptions ✅
- Tests Supabase Realtime functionality (critical for lobbies/tournaments)
- Subscribes to the `realtime_test` table
- Inserts a row and waits for the realtime event
- Measures latency

**Expected Result**: Event received within 2 seconds

**Test Steps**:
1. Sign in first
2. Click "Trigger Realtime Event"
3. System will:
   - Create a realtime subscription
   - Insert a test row
   - Wait for INSERT event to arrive
4. Should show "Event received in XXXms"

**If Realtime Fails**:
- Verify realtime replication is enabled on `realtime_test` table
- Check if WebSocket connections are blocked
- Verify Supabase project URL is correct

### 6. Production Tables ✅
- **Tournaments Table** - Verifies the table exists and shows count
- **Quick Match Lobbies Table** - Verifies the table exists and shows count

**Expected Result**: Both tables accessible with current counts

## Database Tables Created

The health check page requires these test tables (created automatically via migration):

### `healthcheck`
```sql
- id (int, primary key)
- message (text)
```
RLS: Public read access for all users

### `user_connection_test`
```sql
- id (uuid, primary key)
- user_id (uuid, references auth.users)
- created_at (timestamptz)
```
RLS: Users can only read/insert/delete their own rows

### `realtime_test`
```sql
- id (uuid, primary key)
- user_id (uuid, references auth.users)
- created_at (timestamptz)
```
RLS: Users can only read/insert their own rows
Realtime: Enabled for INSERT events

## Status Indicators

- **PASS** (Green) - Test succeeded
- **FAIL** (Red) - Test failed, check details
- **INFO** (Yellow) - Informational status (e.g., not logged in)
- **PENDING** (Blue) - Test in progress or not run yet

## Common Issues

### Environment Variables Missing
**Symptom**: Red banner at top of page
**Fix**: Ensure `.env` file contains:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### Connection Failed
**Symptom**: Database Connection test fails
**Possible Causes**:
- Supabase project is paused
- Invalid URL or API key
- Network connectivity issues
- RLS policy blocking public read on healthcheck table

### RLS Tests Fail
**Symptom**: INSERT, SELECT, or DELETE operations fail
**Possible Causes**:
- User not authenticated
- RLS policies not configured correctly
- Table doesn't exist
- Migration didn't run

### Realtime Not Working
**Symptom**: "No realtime event received"
**Possible Causes**:
- Realtime replication not enabled on `realtime_test` table
- WebSocket connections blocked by firewall/proxy
- Supabase project settings need realtime enabled
- Wrong Supabase URL

**To Enable Realtime Replication**:
1. Go to Supabase Dashboard
2. Navigate to Database → Replication
3. Enable replication for `realtime_test` table
4. Or run: `ALTER PUBLICATION supabase_realtime ADD TABLE realtime_test;`

## Using in Different Environments

### Development
Visit: `http://localhost:3000/app/dev/supabase-check`

### Preview/Staging
Visit: `https://preview-url.netlify.app/app/dev/supabase-check`

### Production
Visit: `https://your-domain.com/app/dev/supabase-check`

**Note**: Consider restricting access to this page in production via middleware or authentication checks.

## Debugging Tips

1. **Copy Error Logs**: Each test section has a copy button to copy detailed error messages
2. **Check Browser Console**: Real-time subscription events are logged to console
3. **Refresh Tests**: Use the "Refresh All Checks" button at the bottom to re-run all tests
4. **Test Incrementally**: Fix issues from top to bottom (env vars → connection → auth → RLS → realtime)

## Security Notes

- Full API keys are never displayed (only masked values)
- Test tables use proper RLS policies
- No sensitive data is stored in test tables
- Consider adding authentication middleware to restrict access in production

## Next Steps

Once all checks pass:
1. ✅ Environment variables configured
2. ✅ Database connection working
3. ✅ Authentication functional
4. ✅ RLS policies working correctly
5. ✅ Realtime subscriptions active
6. ✅ Production tables accessible

Your Supabase integration is fully functional and ready for production!

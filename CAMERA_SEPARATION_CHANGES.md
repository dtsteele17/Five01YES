# Camera System Separation - Changes Summary

## Problem
Both 301/501 games and ATC games were using the `match_signals` table with different schemas:
- 301/501 used: `room_id`, `from_user_id`, `to_user_id`, `type`, `payload`
- ATC used: `match_id`, `sender_id`, `recipient_id`, `signal_type`, `signal_data`

This caused conflicts and broke the camera for 301/501 games.

## Solution
Separated the two systems completely:

### 1. Database Changes
**File:** `supabase/migrations/036_separate_atc_signaling.sql`

- **match_signals** - For 301/501 only (kept original schema)
  - `room_id`, `from_user_id`, `to_user_id`, `type`, `payload`
  
- **atc_match_signals** - New table for ATC only
  - `match_id`, `sender_id`, `recipient_id`, `signal_type`, `signal_data`

- **RPC Functions:**
  - `rpc_send_match_signal()` - For 301/501
  - `rpc_send_atc_signal()` - For ATC

### 2. Code Changes

#### Updated File: `lib/hooks/useATCWebRTC.ts`
**Changes:**
- Changed from using `match_signals` table to `atc_match_signals` table
- Updated `sendSignal` function to use `rpc_send_atc_signal` RPC
- Updated subscription to listen to `atc_match_signals` table
- Kept all the multi-player mesh topology logic

#### Unchanged File: `lib/hooks/useMatchWebRTC.ts`
- Still uses `match_signals` table via `signaling-adapter.ts`
- No changes needed

#### Unchanged File: `lib/webrtc/signaling-adapter.ts`
- Still uses `match_signals` table
- No changes needed

#### Unchanged File: `app/app/play/quick-match/atc-match/page.tsx`
- Uses `useATCWebRTC` hook (which now uses separate table)
- No changes needed to this file

## How to Deploy

1. **Run the SQL migration in Supabase:**
   ```sql
   -- Run supabase/migrations/036_separate_atc_signaling.sql
   ```

2. **Deploy the updated code:**
   - Updated: `lib/hooks/useATCWebRTC.ts`

3. **No changes needed to:**
   - `lib/hooks/useMatchWebRTC.ts` (301/501 hook)
   - `lib/webrtc/signaling-adapter.ts` (301/501 signaling)
   - `app/app/play/quick-match/match/[matchId]/page.tsx` (301/501 page)

## Table Schema Comparison

| Column | match_signals (301/501) | atc_match_signals (ATC) |
|--------|------------------------|------------------------|
| ID | id (uuid) | id (uuid) |
| Match/Room | room_id (uuid) | match_id (uuid) |
| Sender | from_user_id (uuid) | sender_id (uuid) |
| Recipient | to_user_id (uuid) | recipient_id (uuid) |
| Signal Type | type (text) | signal_type (text) |
| Data | payload (jsonb) | signal_data (jsonb) |
| Timestamp | created_at (timestamp) | created_at (timestamp) |

## Troubleshooting

If 301/501 cameras don't work:
- Check that `match_signals` table exists with correct columns
- Verify `rpc_send_match_signal` function exists
- Check RLS policies on `match_signals`

If ATC cameras don't work:
- Check that `atc_match_signals` table exists with correct columns
- Verify `rpc_send_atc_signal` function exists
- Check RLS policies on `atc_match_signals`

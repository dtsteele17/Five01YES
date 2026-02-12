# Rematch & Edit Visit Features Implementation

## Summary

This document describes the implementation of two key features:
1. **Fixed Rematch System** - Works like DartCounter
2. **Edit Visit Functionality** - For DartBot matches

---

## 1. Fixed Rematch System (QuickMatch)

### SQL Migration: `20260212000001_fix_rematch_system.sql`

Created new RPC functions for reliable rematch coordination:

#### `request_rematch_v2(p_old_room_id uuid)`
- Called when a player clicks the rematch button
- Records player's rematch request in `match_rematches` table
- When both players are ready:
  - **Player 1** creates the new room with same settings
  - **Player 2** waits and polls for the room ID
- Returns status including ready count and new room ID

#### `check_rematch_status(p_old_room_id uuid)`
- Poll this function to check rematch status
- Returns:
  - `ready_count`: How many players are ready (0-2)
  - `both_ready`: True if both players clicked rematch
  - `new_room_id`: The ID of the new match room (when created)
  - `player1_ready`/`player2_ready`: Individual player status

#### `cancel_rematch(p_old_room_id uuid)`
- Allows a player to cancel their rematch request

#### `cleanup_stale_rematches()`
- Removes rematch records older than 5 minutes that never completed

### How It Works

1. **Player clicks "Rematch"** → Call `request_rematch_v2()`
2. **System records ready state** → Updates `match_rematches` table
3. **If only one player ready** → Show "Waiting for opponent..." and start polling
4. **When both ready**:
   - Player 1 creates new room automatically
   - Player 2 detects new room via polling
5. **Both navigate** to new room ID

### Frontend Implementation

Replace the existing `handleRematch` function in `app/app/play/quick-match/match/[matchId]/page.tsx`:

```typescript
// Rematch - Using RPC function for reliable coordination
const handleRematch = async () => {
  if (!room || !currentUserId || !matchEndStats || rematchAttemptedRef.current) return;
  
  rematchAttemptedRef.current = true;
  setRematchStatus('waiting');
  
  try {
    const { data: result, error } = await supabase.rpc('request_rematch_v2', {
      p_old_room_id: matchId
    });
    
    if (error) throw error;
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to request rematch');
    }
    
    // If both ready and new room created
    if (result.both_ready && result.new_room_id) {
      toast.success('Rematch starting!');
      setNewRematchRoomId(result.new_room_id);
      return;
    }
    
    // If waiting for other player
    if (result.ready_count === 1) {
      toast.info('Waiting for opponent to accept rematch...');
      startRematchPolling();
    }
    
  } catch (error: any) {
    console.error('[REMATCH] Error:', error);
    setRematchStatus('none');
    rematchAttemptedRef.current = false;
    toast.error('Failed to start rematch: ' + error.message);
  }
};

// Poll for rematch status
function startRematchPolling() {
  let pollCount = 0;
  const maxPolls = 30;
  
  const poll = async () => {
    pollCount++;
    
    if (pollCount > maxPolls) {
      toast.error('Rematch timed out. Please try again.');
      setRematchStatus('none');
      rematchAttemptedRef.current = false;
      return;
    }
    
    if (newRematchRoomId) return;
    
    try {
      const { data: status, error } = await supabase.rpc('check_rematch_status', {
        p_old_room_id: matchId
      });
      
      if (error) throw error;
      
      if (status.success && status.new_room_id) {
        toast.success('Rematch starting!');
        setNewRematchRoomId(status.new_room_id);
        return;
      }
      
      // Update opponent ready status for UI
      if (status.success) {
        const isOpponentReady = status.is_player1 ? status.player2_ready : status.player1_ready;
        setOpponentRematchReady(isOpponentReady);
      }
      
      setTimeout(poll, 1000);
      
    } catch (err) {
      setTimeout(poll, 1000);
    }
  };
  
  setTimeout(poll, 1000);
}
```

---

## 2. Edit Visit Functionality (DartBot Matches)

### Changes to `app/app/play/training/501/page.tsx`

#### Added State
```typescript
// Edit visit state
const [editingVisit, setEditingVisit] = useState<Visit | null>(null);
const [showEditModal, setShowEditModal] = useState(false);
```

#### Added EditVisitModal Component
A modal dialog that allows editing the score of the last visit:
- Shows current remaining score
- Updates new remaining score preview
- Validates score (0-180)
- Handles bust detection

#### Updated VisitHistoryPanel
- Added `onEditVisit` prop
- Added `canEdit` prop
- Shows "Edit" button on the latest player visit (only when it's player's turn)
- Edit button appears only for the last visit in current leg

#### Added Handler Functions

**handleEditVisit:**
```typescript
const handleEditVisit = (visit: Visit) => {
  if (visit.player !== 'player1') {
    toast.error("You can only edit your own visits");
    return;
  }
  // Only allow editing the latest visit
  const allVisits = [...allLegs.flatMap(l => l.visits), ...currentLeg.visits];
  const myVisits = allVisits.filter(v => v.player === 'player1' && v.legNumber === currentLeg.legNumber);
  const latestVisit = myVisits.sort((a, b) => b.timestamp - a.timestamp)[0];
  
  if (visit.timestamp !== latestVisit?.timestamp) {
    toast.error("Only the last visit can be edited");
    return;
  }
  
  setEditingVisit(visit);
  setShowEditModal(true);
};
```

**handleSaveEditedVisit:**
```typescript
const handleSaveEditedVisit = (updatedVisit: Visit, newScore: number) => {
  if (!config) return;

  const oldScore = updatedVisit.score;
  const remainingBefore = updatedVisit.remainingBefore || (oldScore + updatedVisit.remainingScore);
  
  // Check for bust conditions
  let isBust = false;
  let isCheckout = false;
  let newRemaining = remainingBefore - newScore;
  
  if (newRemaining < 0) {
    isBust = true;
    newRemaining = remainingBefore;
  } else if (newRemaining === 1) {
    isBust = true;
    newRemaining = remainingBefore;
  } else if (newRemaining === 0) {
    isCheckout = true;
  }

  // Update the visit in current leg
  setCurrentLeg(prev => ({
    ...prev,
    visits: prev.visits.map(v => 
      v.timestamp === updatedVisit.timestamp 
        ? { 
            ...v, 
            score: isBust ? 0 : newScore,
            remainingScore: newRemaining,
            isBust,
            isCheckout,
            bustReason: isBust ? (newRemaining < 0 ? 'below_zero' : 'left_on_one') : undefined
          }
        : v
    )
  }));

  // Update player score
  setPlayer1Score(newRemaining);

  // Recalculate stats
  if (!isBust) {
    setPlayer1MatchTotalScored(prev => prev - oldScore + newScore);
  }

  toast.success('Visit updated');
  setShowEditModal(false);
  setEditingVisit(null);
};
```

#### Added Modal to JSX
```tsx
{/* Edit Visit Modal */}
<EditVisitModal
  isOpen={showEditModal}
  onClose={() => setShowEditModal(false)}
  visit={editingVisit}
  onSave={handleSaveEditedVisit}
  remainingBefore={editingVisit?.remainingBefore || 0}
/>
```

---

## How to Apply

### Step 1: Apply SQL Migrations
Run these migrations in Supabase SQL Editor:
1. `20260212000000_enhance_match_history_system.sql` (if not already applied)
2. `20260212000001_fix_rematch_system.sql`

### Step 2: Update Frontend Code

#### For QuickMatch Rematch:
Replace the `handleRematch` function and add `startRematchPolling` in:
`app/app/play/quick-match/match/[matchId]/page.tsx`

#### For DartBot Edit Visit:
The changes have been applied to:
`app/app/play/training/501/page.tsx`

### Step 3: Test

1. **Test Rematch:**
   - Play a quick match to completion
   - Both players click "Rematch"
   - Verify both navigate to new room with same settings

2. **Test Edit Visit:**
   - Play a dartbot match
   - After throwing, click "Edit" on your last visit
   - Change the score
   - Verify remaining score updates correctly

---

## Files Modified

### SQL Migrations (New)
- `supabase/migrations/20260212000001_fix_rematch_system.sql`

### Frontend Files Modified
- `app/app/play/training/501/page.tsx` - Added edit visit functionality
- `app/app/play/quick-match/match/[matchId]/page.tsx` - Needs rematch function update

---

## Notes

- The rematch system now uses database RPC functions for reliable coordination
- Edit visit only works on the **last** visit and only when it's your turn
- Bust detection is recalculated when editing visits
- Both features follow the DartCounter UX pattern

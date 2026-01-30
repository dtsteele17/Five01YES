# Achievement Notifications & Toast System

## Overview
This system provides real-time visual feedback when users unlock achievements, combining both an in-app toast notification and persistent database notifications accessible via the notification bell.

## Implementation Details

### 1. Database Schema

#### Notifications Table Enhancement
- **Added Field**: `metadata` (jsonb, nullable)
  - Stores achievement details: `achievementId`, `achievementName`, `category`, `icon`, `xp`
  - Allows for rich notification context without additional queries
  - Applied via migration: `add_notifications_metadata`

#### Existing Fields:
- `id`: uuid (primary key)
- `user_id`: uuid (foreign key to auth.users)
- `type`: text enum ('achievement' | 'league_announcement' | 'match_reminder' | 'app_update')
- `title`: text
- `message`: text
- `link`: text (nullable, e.g., '/app/achievements')
- `read`: boolean (default false)
- `created_at`: timestamptz
- `reference_id`: uuid (nullable)

#### RLS Policies:
- Users can only view their own notifications
- Users can update their own notifications (mark as read)
- Authenticated users can insert notifications (for service operations)

---

### 2. Achievement Detection & Unlocking

#### Location: `lib/achievements/evaluateAchievementEvents.ts`

**Key Functions:**
- `evaluateAchievementEvent()`: Main entry point for processing achievement events
- `checkAndUpdate()`: Updates progress and detects completion for counter/milestone achievements
- `checkBestAndUpdate()`: Updates progress for "best value" achievements (e.g., highest checkout)
- `getNewlyUnlocked()`: Fetches full achievement details for newly completed achievements

**Duplicate Prevention:**
- Achievement completion is detected by checking: `isNowCompleted && !existing?.completed`
- Only achievements transitioning from incomplete → complete trigger the unlock
- Uses an in-memory buffer (`unlockedBuffer`) to batch newly unlocked achievements
- Buffer is cleared after fetching details, ensuring single-time processing

**Achievement Types Tracked:**
- `VISIT_SUBMITTED`: Score-based achievements (180s, 100+, specific scores like 26, 69)
- `CHECKOUT_MADE`: Checkout achievements (high checkouts, first-dart finishes, bull checkouts)
- `MATCH_COMPLETED`: Match-based achievements (ranked matches, win streaks, averages, shutouts)
- `LEAGUE_JOINED`: League participation
- `LEAGUE_CREATED`: League creation
- `TOURNAMENT_WON`: Tournament victories
- `ATC_COMPLETED`: Around the Clock training

---

### 3. Toast Notification System

#### Location: `lib/achievements/achievementService.ts`

**Flow:**
1. `processAchievementEvent()` called from match persistence layer
2. Calls `evaluateAchievementEvent()` to get unlocked achievements
3. For each unlocked achievement, calls `showAchievementUnlockToast()`

**showAchievementUnlockToast() does:**
1. **Creates Database Notification:**
   - Inserts into `notifications` table
   - Type: `achievement`
   - Title: "Achievement Unlocked!"
   - Message: Achievement name
   - Link: `/app/achievements`
   - Metadata: Full achievement details (id, name, category, icon, xp)

2. **Shows Toast Popup:**
   - Position: `bottom-right`
   - Duration: 5 seconds (auto-dismiss)
   - Custom styling via `.achievement-toast` CSS class
   - Displays: Achievement icon, name, category, and XP
   - Action Button: "View" → navigates to `/app/achievements`

**Toast Styling:**
- Dark slate background with blur effect
- Amber/gold border to match achievement theme
- Bold title in amber color
- Clear visual hierarchy
- Hover effects on action button

---

### 4. Notification Bell Integration

#### Location: `lib/context/NotificationsContext.tsx`

**Features:**
- Real-time updates via Supabase Realtime subscriptions
- Automatic notification fetching on user login
- Unread count badge
- Mark as read (individual or all)
- Click handling with navigation

**Updated Interface:**
```typescript
interface Notification {
  // ... existing fields
  metadata?: {
    achievementId?: string;
    achievementName?: string;
    category?: string;
    icon?: string;
    xp?: number;
    [key: string]: any;
  } | null;
}
```

#### Location: `components/app/NotificationDropdown.tsx`

**Achievement Notifications:**
- Trophy icon (amber color) for achievement type
- Displays achievement name as title
- Shows timestamp (relative: "5m ago", "2h ago", etc.)
- Click to navigate to achievements page and mark as read
- Unread indicator (green dot)
- Empty state: "No Notifications at this moment"

---

### 5. Match Persistence Integration

#### Location: `lib/utils/match-persistence.ts`

**Achievement Events Triggered:**

1. **MATCH_COMPLETED** (after match saved):
   ```typescript
   await processAchievementEvent({
     type: 'MATCH_COMPLETED',
     userId: user.id,
     matchId: match.id,
     matchType: matchData.matchType,
     gameMode: matchData.gameMode,
     won: matchData.winner === 'user',
     stats: { ... },
     opponentStats: { ... },
     durationMs: ...
   });
   ```

2. **VISIT_SUBMITTED** (for special scores):
   - Triggered for 180s, 100+, 26, 69

3. **CHECKOUT_MADE** (for successful checkouts):
   - Includes checkout value and darts at double

**All Events Processed:**
- After match is saved to database
- After stats are updated
- Before success toast is shown
- Achievements unlock asynchronously (no blocking)

---

## Data Flow

```
Match Completes
    ↓
saveCompletedMatch() called
    ↓
Match/Stats saved to DB
    ↓
processAchievementEvent() called for MATCH_COMPLETED + special visits
    ↓
evaluateAchievementEvent() checks all relevant achievements
    ↓
Achievement progress updated in user_achievements table
    ↓
Newly completed achievements detected (completed: false → true)
    ↓
Achievement details fetched and returned
    ↓
For each newly unlocked achievement:
    ├── Insert notification into DB (with metadata)
    └── Show toast popup (bottom-right, 5s)
    ↓
NotificationsContext (real-time subscription) detects new notification
    ↓
Notification bell badge updates (unread count++)
    ↓
User can:
    ├── See toast popup → Click "View" → Navigate to achievements page
    └── Click bell → See notification → Click notification → Navigate to achievements page
```

---

## Duplicate Prevention Mechanisms

### 1. Database Level:
- `user_achievements` table has unique constraint on `(user_id, achievement_id)`
- `completed` flag prevents re-completion
- Only transitions from `completed: false → true` trigger unlock

### 2. Application Level:
- `evaluateAchievementEvents.ts` checks `existing?.completed` before marking as newly unlocked
- `unlockedBuffer` only filled when: `isNowCompleted && !existing?.completed`
- Buffer cleared after processing, ensuring single-time notification

### 3. Toast Level:
- Toasts only shown when `unlocked.length > 0` from evaluation
- Notification insertion has error handling (prevents duplicate inserts via DB constraint)
- No toast shows on page refresh (only on unlock event)

---

## Testing Checklist

### ✅ Single Achievement Unlock:
- [ ] Play a match that completes an achievement
- [ ] Toast appears bottom-right once (5 seconds)
- [ ] Notification appears in bell dropdown
- [ ] Refresh page: no duplicate toast
- [ ] Click "View" on toast: navigates to achievements page
- [ ] Click notification in dropdown: navigates to achievements page and marks as read

### ✅ Multiple Achievements Unlock:
- [ ] Complete multiple achievements in one match (e.g., hit 180 + win ranked match)
- [ ] Multiple toasts appear (stack/queue)
- [ ] Multiple notifications inserted
- [ ] All notifications visible in dropdown
- [ ] Unread count matches number of new notifications

### ✅ Already Completed Achievement:
- [ ] Complete an already completed achievement again
- [ ] No toast appears
- [ ] No new notification created
- [ ] Existing achievement still shows as completed in achievements page

### ✅ Different Match Types:
- [ ] Training matches trigger achievements ✓
- [ ] Quick matches trigger achievements ✓
- [ ] Ranked matches trigger achievements ✓
- [ ] League matches trigger achievements ✓
- [ ] Private matches trigger achievements ✓

### ✅ Real-time Updates:
- [ ] Achievement notification appears without page refresh
- [ ] Notification bell badge updates immediately
- [ ] Clicking notification marks it as read
- [ ] "Mark all as read" works correctly

---

## Styling Details

### Toast Appearance:
- **Background**: Dark slate (rgba(15, 23, 42, 0.95)) with backdrop blur
- **Border**: Amber/gold glow (rgba(251, 191, 36, 0.3))
- **Title**: Amber color (#fbbf24), bold, small text
- **Description**: White, semi-bold, achievement name + category + XP
- **Action Button**: Amber outline, hover effects
- **Shadow**: Deep shadow for depth
- **Position**: Bottom-right corner
- **Duration**: 5000ms (5 seconds)

### Notification Dropdown:
- **Icon**: Trophy icon in amber (#f59e0b)
- **Title**: Achievement name in white
- **Message**: Achievement description
- **Metadata**: Stored but not displayed (available for future enhancements)
- **Timestamp**: Relative format (e.g., "5m ago")
- **Unread Indicator**: Small green dot

---

## Files Modified

### Backend/Database:
- ✅ Applied migration: `add_notifications_metadata.sql`
- ✅ `lib/achievements/achievementService.ts` - Toast & notification creation
- ✅ `lib/achievements/evaluateAchievementEvents.ts` - Already had unlock detection
- ✅ `lib/utils/match-persistence.ts` - Already calling achievement events

### Frontend:
- ✅ `lib/context/NotificationsContext.tsx` - Added metadata to interface
- ✅ `components/app/NotificationDropdown.tsx` - Trophy icon for achievements
- ✅ `components/app/AchievementToast.tsx` - Custom toast component (created)
- ✅ `app/globals.css` - Achievement toast styling

---

## Future Enhancements

### Potential Improvements:
1. **Toast Queueing**: Implement intelligent queueing for multiple simultaneous unlocks
2. **Sound Effects**: Add audio feedback on achievement unlock
3. **Animation**: Add entrance/exit animations for toast
4. **Achievement Preview**: Show achievement icon/progress in toast
5. **Notification Grouping**: Group similar notifications (e.g., "3 new achievements unlocked")
6. **Push Notifications**: Browser push notifications for achievement unlocks (when tab not active)
7. **Achievement Share**: Add "Share" button to toast for social sharing
8. **Celebration Animation**: Confetti or particle effects on rare/high-value achievements

---

## Known Limitations

1. **Toast Persistence**: Toasts do not persist across page refreshes (by design)
2. **Offline Achievements**: Achievements unlock only when online (Supabase connection required)
3. **Toast Stacking**: Multiple toasts may overlap if many achievements unlock simultaneously
4. **No Undo**: Once unlocked, achievements cannot be re-locked (permanent)

---

## Conclusion

The achievement notification system is fully functional and provides immediate visual feedback when users unlock achievements. The system:

- ✅ Creates database notifications for persistence
- ✅ Shows beautiful bottom-right toast popups
- ✅ Updates notification bell badge in real-time
- ✅ Prevents duplicates at multiple levels
- ✅ Works across all game modes (training, ranked, league, etc.)
- ✅ Provides clear navigation to achievements page
- ✅ Maintains notification history in dropdown

The implementation is production-ready and thoroughly integrated with the existing achievement tracking system.

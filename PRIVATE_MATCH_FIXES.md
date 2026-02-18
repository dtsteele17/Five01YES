# Private Match Fixes

## 1. Duplicate Notifications Fixed

### Problem
When receiving a private match invite, users were getting two notifications:
1. One WITHOUT Accept/Decline buttons
2. One WITH Accept/Decline buttons

### Root Cause
The notification was being created in TWO places:
1. **Database function** `rpc_create_private_match_invite` (line 120-136) - Creates notification automatically
2. **Frontend code** in `PrivateMatchModal.tsx` (lines 431-446) - Was manually creating another notification

### Fix
Removed the manual notification creation from the frontend (`components/app/PrivateMatchModal.tsx`).

The database function already creates the notification, so the frontend doesn't need to do it.

## 2. Private Match Settings Updated

### Changes Made

#### Game Mode Options
**Before:** 301, 501, Around the Clock  
**After:** 301, 501

#### Match Format Options
**Before:** Best of 1, 3, 5, 7  
**After:** Best of 1, 3, 5, 7, 9, 11

### Files Modified
- `components/app/PrivateMatchModal.tsx`

### UI Changes

#### Invite Friend Tab
```
Game Mode: [301/501 dropdown]
Match Format: [Best of 1/3/5/7/9/11 dropdown]
Double Out: [Toggle]
Straight In: [Toggle]
```

#### Local Play Tab
Same settings as Invite Friend tab for consistency.

## Testing Checklist

### Notifications
- [ ] Send private match invite to a friend
- [ ] Friend should receive ONLY ONE notification
- [ ] Notification should have Accept/Decline buttons
- [ ] Clicking Accept navigates to lobby
- [ ] Clicking Decline dismisses notification

### Settings
- [ ] Open Private Match modal
- [ ] Game Mode shows only 301 and 501
- [ ] Match Format shows 1, 3, 5, 7, 9, 11
- [ ] Selecting Best of 9 creates match with 5 legs to win
- [ ] Selecting Best of 11 creates match with 6 legs to win

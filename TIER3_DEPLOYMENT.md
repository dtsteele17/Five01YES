# Career Mode Tier 3 - Deployment Guide

## 🚀 Quick Deploy

### 1. Environment Setup
```bash
# Copy the example environment file
cp .env.example .env.local

# The values are already set for your Supabase instance:
# - URL: https://azrmgtukcgqslnilodky.supabase.co
# - Anon Key: Already configured
# - Service Role: Already configured
```

### 2. Database Migration
Run the migrations in your Supabase dashboard:
```sql
-- Run these in order:
-- 1. Original tier 3 expansion (if not already run)
\i supabase/migrations/20260305_career_tier3_expansion.sql

-- 2. Improved naming system
\i supabase/migrations/20260305_career_tier3_improved_names.sql
```

**OR** use Supabase CLI:
```bash
supabase db push
```

### 3. Frontend Deploy
```bash
npm install
npm run build
npm run start
```

## ✅ What's Included

### **Tier 3 Features**
- **10-player leagues** (user + 9 AI opponents)
- **Best of 5 matches** (higher stakes than tier 2)
- **Tournament choices every 3 games:**
  - After games 3, 6, and 9
  - Choose between 16-player or 32-player tournaments
  - Option to decline and continue league play

### **Sponsor System**
- **Auto-triggered** when:
  - Win 3 consecutive league games, OR
  - Reach a tournament final
- **Only for tier 3+** players without existing sponsors
- **Choose from 3 sponsors** with different objectives and bonuses

### **Relegation System**
- **If not promoted from tier 2:**
  - 8-player relegation tournament
  - New tier 2 season with refreshed opponents
  - Replaces 1st, 2nd, 7th, and 8th place finishers

### **Realistic Opponent Names**
- **Tier 2 (Pub Level):** Working-class names like "Bazza", "Mickey", "Tel" from areas like "Bethnal Green", "Peckham"
- **Tier 3 (County Level):** More diverse names like "Adrian", "Malcolm", "Connor" from places like "Canterbury", "Winchester"
- **Authentic nicknames:** "The Tungsten Terror", "County Champion", "Maximum Mike"
- **Geographic accuracy:** Real British towns and areas appropriate to each tier

## 🧪 Testing

### Test Tournament Choices
1. Create a tier 3 career or promote an existing one
2. Complete 3 league games (Best of 5 format)
3. Next event should be "Tournament Choice #1"
4. Test both tournament selection and decline options
5. Verify bracket creation for chosen tournaments

### Test Sponsor Offers
1. In tier 3, win 3 consecutive league games OR reach a tournament final
2. Return to career home page
3. Should auto-redirect to sponsor offer page
4. Test sponsor selection and contract acceptance
5. Verify sponsor bonuses apply to subsequent matches

### Test Relegation
1. Complete tier 2 season without top 2 finish (3rd place or below)
2. Should trigger "Pub League Playoff" (8-player tournament)
3. After tournament completion, should start new tier 2 season
4. Verify opponent refresh (new names for positions 1, 2, 7, 8)

## 🔧 Troubleshooting

### Common Issues

**Migration Errors:**
- Ensure you have proper permissions in Supabase
- Run migrations in the correct order
- Check for any existing conflicting data

**Frontend Connection Issues:**
- Verify .env.local has the correct Supabase URL and keys
- Check browser console for authentication errors
- Ensure Supabase RLS policies are properly configured

**Tournament Choice Not Appearing:**
- Verify the career is in tier 3
- Check that 3 league games have been completed
- Ensure the tournament_choice event type exists in the schedule

**Sponsor Offers Not Triggering:**
- Confirm the career is tier 3 or higher
- Verify no existing active sponsor contracts
- Check recent match history for qualifying performance

## 📊 Database Schema

### New Tables Used:
- `career_schedule_templates` - Updated with tournament choice events
- `career_brackets` - Handles tournament bracket generation
- `career_sponsor_contracts` - Manages sponsor relationships
- `career_sponsor_catalog` - Available sponsors by tier
- `career_league_standings` - 10-player league tables

### New Event Types:
- `tournament_choice` - Tier 3 tournament selection events
- `relegation_tournament` - Tier 2 playoff tournaments

### Key RPCs:
- `rpc_career_tournament_choice()` - Handle tournament selection
- `rpc_career_check_sponsor_offer()` - Check sponsor eligibility
- `rpc_career_accept_sponsor()` - Sign sponsor contracts
- `rpc_career_generate_tier3_league()` - Create 10-player leagues

## 🎯 Performance Notes

- **Opponent generation** uses randomized selection from large name pools
- **Tournament brackets** reuse existing bracket engine
- **Database queries** are optimized with proper indexing
- **RLS policies** ensure secure user data access
- **Name variety** provides thousands of unique opponent combinations

## 📈 Next Steps

After successful deployment:
1. **Monitor user progression** through tier 3
2. **Gather feedback** on tournament choice balance
3. **Track sponsor engagement** and objective completion
4. **Consider expanding** to tier 4 with similar tournament choice mechanics
5. **Add seasonal events** or special tournaments for variety

The system is designed to be **expandable** - the tournament choice pattern can easily be extended to higher tiers with different tournament formats and sponsor tiers.
# Training Mode XP System

## Overview

Each training mode now has a balanced XP system based on difficulty. Players earn:
- **Base XP** - Fixed amount based on mode difficulty
- **Completion Bonus** - +10% for finishing the session
- **Performance Bonus** - Varies based on how well they performed

## XP Values by Mode

| Mode | Difficulty | Base XP | Max XP (with bonuses) |
|------|-----------|---------|----------------------|
| Around the Clock (Singles) | Beginner | 40 | 60 |
| 121 vs DartBot | Beginner | 50 | 75 |
| Around the Clock (Doubles) | Easy | 60 | 90 |
| Around the Clock (Trebles) | Easy | 65 | 98 |
| Bob's 27 | Easy | 70 | 105 |
| Around the Clock (Mixed) | Intermediate | 80 | 120 |
| 301 vs DartBot | Intermediate | 90 | 135 |
| Finish Training | Intermediate | 100 | 150 |
| 501 vs DartBot | Intermediate | 100 | 150 |
| JDC Challenge | Intermediate | 110 | 165 |
| Killer | Advanced | 130 | 195 |
| PDC Challenge | Advanced | 150 | 225 |
| Form Analysis | Expert | 200 | 300 |

## Performance Ratings

- **Excellent** (+50% XP) - Outstanding performance
- **Great** (+25% XP) - Very good performance  
- **Good** (+10% XP) - Above average performance
- **Fair** (base XP) - Average performance
- **Poor** (-25% XP) - Below average performance

## Adding XP to a Training Mode

### Step 1: Import required modules

```typescript
import { calculateXP, XPResult } from '@/lib/training/xpSystem';
import { XPRewardDisplay } from '@/components/training/XPRewardDisplay';
```

### Step 2: Add state for XP result

```typescript
const [xpResult, setXpResult] = useState<XPResult | null>(null);
```

### Step 3: Calculate XP when game completes

```typescript
// In your game completion handler
const xp = calculateXP('mode-name', performanceMetric, { 
  completed: true,
  // For DartBot matches also include:
  // won: boolean,
  // threeDartAvg: number 
});
setXpResult(xp);
```

### Step 4: Save XP to database

```typescript
await supabase.from('training_stats').insert({
  player_id: user.id,
  game_type: 'your_mode_name',
  score: totalScore,
  completed: true,
  xp_earned: xp.totalXP,
  session_data: {
    // ... other data
    xp_breakdown: {
      base: xp.baseXP,
      performance: xp.performanceBonus,
      completion: xp.completionBonus,
      total: xp.totalXP,
    },
  },
});
```

### Step 5: Display XP in completion screen

```tsx
{gameState === 'completed' && (
  <div className="min-h-screen bg-slate-950">
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8">
        
        {/* XP Display */}
        {xpResult && <XPRewardDisplay xpResult={xpResult} />}
        
        {/* Rest of your completion UI */}
        
      </div>
    </div>
  </div>
)}
```

## Performance Metrics by Mode

### Around the Clock
- Metric: Total darts used (lower is better)
- Thresholds: 100 (poor), 80 (fair), 60 (good), 45 (great), 35 (excellent)

### Bob's 27
- Metric: Final score (higher is better)
- Thresholds: 0 (poor), 27 (fair), 100 (good), 200 (great), 500 (excellent)

### Finish Training
- Metric: Checkout success rate % (higher is better)
- Thresholds: 30% (poor), 50% (fair), 70% (good), 85% (great), 95% (excellent)

### JDC Challenge
- Metric: Total score out of 840 (higher is better)
- Thresholds: 200 (poor), 350 (fair), 500 (good), 650 (great), 750 (excellent)

### PDC Challenge
- Metric: Total score (higher is better)
- Thresholds: 300 (poor), 500 (fair), 700 (good), 900 (great), 1100 (excellent)

### Killer
- Metric: Rounds survived (higher is better)
- Thresholds: 3 (poor), 5 (fair), 8 (good), 12 (great), 18 (excellent)

### DartBot Matches (121, 301, 501)
- Metric: 3-dart average (higher is better)
- Thresholds: 30 (poor), 45 (fair), 60 (good), 75 (great), 90 (excellent)
- Additional: +15% bonus for winning

## Adding a New Mode

1. Add the mode to `TrainingMode` type in `xpSystem.ts`
2. Set base XP in `BASE_XP` constant
3. Add performance thresholds if applicable
4. Update the training hub page with the new mode

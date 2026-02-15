# FIVE01 Achievements Implementation Guide

## Category 1: MATCH WIN ACHIEVEMENTS
**Trigger:** End of match (when winner is determined)
**What to track:** Match results, win counts, opponent info

### Implementation Requirements:
- Hook into `handleLegComplete` or match end logic
- Check if current user is the winner
- Track cumulative wins across sessions (database table needed)

### Achievements in this category:
| Achievement | Condition |
|-------------|-----------|
| First Blood | Win 1st tournament match |
| Champion | Win 1 tournament |
| Serial Winner | Win 5 tournaments |
| Trophy Cabinet | Win 10 tournaments |
| Elite Champion | Win 25 tournaments |
| Tournament Monster | Win 50 tournaments |
| Legendary | Win 100 tournaments |
| Bracket Buster | Win tournament without losing a leg |
| Final Boss | Win tournament final from behind |
| Weekend Warrior | Win weekend tournament |
| League Winner | Win 1 league title |
| Dominant Season | Win 5 league titles |
| Dynasty | Win 10 league titles |
| Immortal | Win 25 league titles |
| Invincible Season | Finish league unbeaten |
| Great Escape | Avoid relegation on final match |
| Promotion Party | Earn promotion |
| Relegation Tears | Get relegated twice |
| On The Ladder | Win 5 ranked matches |
| Ranked Grinder | Win 25 ranked matches |
| Sweaty Hands | Win 50 ranked matches |
| The Tryhard | Win 100 ranked matches |
| Win Streak | Win 5 ranked in a row |
| Unstoppable | Win 10 ranked in a row |
| Revenge Arc | Beat player who beat you last time |
| Promotion Secured | Reach new division |
| The Wall | Win match without dropping a leg |
| Friendly Fire | Play private match |
| Group Chat Hero | Win after trash talk |

**What you need to tell me:**
- How to detect match type (tournament vs ranked vs league vs private)
- Where league standings/promotion data is stored
- How to track "from behind" wins
- How to track head-to-head history for revenge

---

## Category 2: 180s / MAXIMUMS ACHIEVEMENTS
**Trigger:** When player scores 180 in a visit
**What to track:** 180 count per player (lifetime)

### Implementation Requirements:
- Check score after each visit
- If score == 180, increment counter
- Track consecutive 180s in same match

### Achievements in this category:
| Achievement | Condition |
|-------------|-----------|
| Boom! | Hit 1st 180 |
| Maximum Effort | Hit 5x 180s |
| The Ton 80 Club | Hit 10x 180s |
| Treble Trouble | Hit 25x 180s |
| 180 Machine | Hit 50x 180s |
| Maximum Overload | Hit 100x 180s |
| Treble Factory | Hit 250x 180s |
| Treble God | Hit 500x 180s |
| Back-to-Back | 2 consecutive 180s in one match |
| 180 Under Pressure | 180 to win deciding leg |

**What you need to tell me:**
- Is there already a 180 counter? (I saw visits_180 in stats)
- How to detect "deciding leg" (match point situation)

---

## Category 3: CHECKOUT ACHIEVEMENTS
**Trigger:** When player checks out (wins leg with final dart)
**What to track:** Checkout scores, checkout method

### Implementation Requirements:
- Check when remainingScore becomes 0
- Track checkout value and method (bull, double, etc.)

### Achievements in this category:
| Achievement | Condition |
|-------------|-----------|
| Checked Out | Win leg by checkout |
| Cool Hand | Checkout above 100 |
| Big Finish | Checkout above 120 |
| Clutch Finisher | Checkout above 150 |
| Out in Style | Checkout with bull |
| Ice Cold | Checkout on first dart at double |
| Shanghai Surprise | Hit Shanghai finish |
| 170 Club | Checkout exactly 170 |

**What you need to tell me:**
- Is checkout value tracked in the database?
- How to detect "first dart at double" (need dart-by-dart tracking)
- What defines a "Shanghai finish" (T20, S20, D20?)

---

## Category 4: HIGH SCORE VISITS (TON-UPS)
**Trigger:** When visit score is 100+
**What to track:** Count of 100+ scores

### Implementation Requirements:
- Check visit score after each turn
- Increment counter if >= 100

### Achievements in this category:
| Achievement | Condition |
|-------------|-----------|
| Ton Up | Hit 100+ once |
| Ton Machine | Hit 100+ ten times |

**What you need to tell me:**
- Is visits_100_plus already tracked? (saw this in stats)

---

## Category 5: AVERAGE-BASED ACHIEVEMENTS
**Trigger:** End of match
**What to track:** 3-dart average for the match

### Implementation Requirements:
- Calculate average at match end
- Compare against threshold

### Achievements in this category:
| Achievement | Condition |
|-------------|-----------|
| Heavy Scorer | Average 60+ in match |
| Serious Business | Average 80+ in match |
| Centurion | Average 100+ in match |
| The Pub Thrower | Win with lower average than opponent |

**What you need to tell me:**
- Is match average already calculated/stored?
- How to access opponent's average for comparison

---

## Category 6: PRACTICE MODE ACHIEVEMENTS
**Trigger:** During/after practice games
**What to track:** Practice session data

### Implementation Requirements:
- Separate tracking for practice mode
- Bull count in practice
- Consecutive trebles

### Achievements in this category:
| Achievement | Condition |
|-------------|-----------|
| Warm Up | Complete 10 practice sessions |
| Dedicated | Practice 50 times |
| Training Arc | Practice 100 times |
| Bullseye Hunter | Hit 25 bulls in practice |
| Robin Hood | Same treble 3 darts in a row |

**What you need to tell me:**
- How is practice mode tracked differently?
- Where practice stats are stored

---

## Category 7: AROUND THE CLOCK ACHIEVEMENTS
**Trigger:** During/after ATC games
**What to track:** ATC completions, time taken

### Implementation Requirements:
- Track ATC completions
- Track completion time

### Achievements in this category:
| Achievement | Condition |
|-------------|-----------|
| Clock Starter | Complete ATC once |
| Clock Master | Complete ATC 10 times |
| Clock Legend | Complete ATC 50 times |
| Speed Runner | Complete ATC under 5 minutes |

**What you need to tell me:**
- Is ATC tracked separately?
- Where ATC completion data is stored

---

## Category 8: THE DREADED 26s (FUNNY)
**Trigger:** When visit score equals 26
**What to track:** 26 count (lifetime and per match)

### Implementation Requirements:
- Check if score == 26 after each visit
- Track per-match count for "3 times in one match"

### Achievements in this category:
| Achievement | Condition |
|-------------|-----------|
| The Feared Number | Score 26 once |
| Double 13 Specialist | Score 26 ten times |
| Pain Merchant | Score 26 fifty times |
| Anti-Checkout | Score 26 one hundred times |
| Dartboard Hates Me | Score 26 three times in one match |
| Nice. | Score exactly 69 |

**What you need to tell me:**
- Just need to track 26s - no additional info needed

---

## Category 9: DOUBLE TROUBLE (FUNNY)
**Trigger:** When missing doubles
**What to track:** Consecutive double misses

### Implementation Requirements:
- Track double attempts vs hits
- Count consecutive misses

### Achievements in this category:
| Achievement | Condition |
|-------------|-----------|
| Double Trouble | Miss 5 doubles in a row |

**What you need to tell me:**
- How to detect "double attempts" (when player is on a checkout)

---

## Category 10: MISCELLANEOUS / EDGE CASES
**Trigger:** Various

### Achievements in this category:
| Achievement | Condition |
|-------------|-----------|
| Early Doors | Win match under 10 minutes |
| Rivalry | Play same opponent 10 times |
| Best Frenemies | Beat friend 25 times |
| Missed 20 Times | Miss same number 20 times |
| The Bottle Job | Lose from 1 dart away |
| Dartboard Bully | Hit 20 twenty times in a row |
| Wall Inspector | Miss board 10 times in 1 game |
| Respectfully | Win then immediately rematch 5 times |
| Joined the Ranks | Join first league |
| The Gaffer | Create a league |
| Ranked Rookie | Play first ranked match |

**What you need to tell me:**
- Match duration tracking
- How to track rematches
- How to detect "1 dart away" (remaining score of 2-40?)
- How to detect "miss board" (score 0 with no dart hit?)

---

## DATA STORAGE NEEDED

You'll need a table to track achievement progress:

```sql
CREATE TABLE user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(user_id),
  achievement_id TEXT NOT NULL,
  progress INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, achievement_id)
);
```

And possibly counters for lifetime stats:
- total_180s
- total_100_plus
- total_26s
- total_checkouts
- highest_checkout
- practice_sessions
- atc_completions
- etc.

---

## PRIORITY ORDER (Easiest to Hardest)

**EASY** (Basic counting):
1. 180s achievements
2. 100+ achievements  
3. Checkout achievements
4. Tournament wins
5. 26s achievements

**MEDIUM** (Requires additional tracking):
1. Win streaks
2. Averages
3. Practice/ATC modes
4. Time-based (Early Doors)

**HARD** (Complex logic):
1. Bracket Buster (no legs lost)
2. From behind wins
3. Revenge arc
4. Consecutive 180s
5. Robin Hood
6. Pub Thrower (lower avg win)

Which category would you like me to start implementing first?

# 🎯 Darts Career Mode — Complete Flow

## START CAREER (Tier 1)

```
USER PICKS 1 OF 3 STARTER TOURNAMENTS (8-player, BO3)
      ↓
PLAY STARTER TOURNAMENT
      ↓
REACH FINAL?
 ├─ YES → Email: "Welcome to the Pub Leagues!" → ENTER PUB LEAGUE
 └─ NO
        ↓
   SECOND STARTER TOURNAMENT (auto-assigned, different name)
        ↓
   PLAY TO COMPLETION
        ↓
   REACH SEMI FINAL?
   ├─ YES → Email: "Welcome to the Pub Leagues!" → ENTER PUB LEAGUE
   └─ NO
          ↓
     TRAINING GAME (random non-501: Around the Clock, Cricket, Bob's 27, etc.)
     Shown in Next Match tile as a career event
     Complete or leave → return to career home
          ↓
     Email: "Welcome to the Pub Leagues!" → ENTER PUB LEAGUE
```

---

## PUB LEAGUE (Tier 2)

- **8 players**, **7 league matches**, **Best of 3**
- No relegation (lowest league tier)
- No sponsors

```
ENTER PUB LEAGUE
      ↓
PLAY 4 LEAGUE MATCHES
      ↓
1 MID-SEASON TOURNAMENT INVITE (email — Accept/Decline)
 ├─ ACCEPT → Play tournament (8 or 16 players, BO3) until win or knocked out
 └─ DECLINE → Skip
      ↓
PLAY NEXT 3 LEAGUE MATCHES (7 total)
      ↓
SEASON ENDS → Show final table + position
      ↓
Click "Next Season"
      ↓
2 END-OF-SEASON TOURNAMENT INVITES (popup — Accept 1 or Decline Both)
 ├─ ACCEPT ONE → Play tournament, auto-decline other
 └─ DECLINE BOTH → Skip
      ↓
FINISH TOP 2?
 ├─ YES → 🎉 Promotion popup → ENTER COUNTY LEAGUE
 └─ NO  → Start next Pub League season (top 2 opponents replaced)
```

---

## COUNTY LEAGUE (Tier 3)

- **10 players**, **9 league matches**, **Best of 5**
- Sponsors available (3-win streak or tournament final, first sponsor max 5%)
- Tournament invites every 3 matches (2 options + decline both)

```
ENTER COUNTY LEAGUE
      ↓
PLAY 3 LEAGUE MATCHES
      ↓
2 TOURNAMENT INVITES (popup — Accept 1 or Decline Both)
 ├─ ACCEPT ONE → Play tournament (16 or 32 players, BO5) until win or knocked out
 └─ DECLINE BOTH → Skip
      ↓
PLAY NEXT 3 LEAGUE MATCHES (6 total)
      ↓
2 MORE TOURNAMENT INVITES (popup — Accept 1 or Decline Both)
 ├─ ACCEPT ONE → Play tournament until win or knocked out
 └─ DECLINE BOTH → Skip
      ↓
PLAY FINAL 3 LEAGUE MATCHES (9 total)
      ↓
SEASON ENDS → Show final table + position
```

### Relegation Check
```
FINISH BOTTOM 2?
 ├─ YES → 😞 Relegation popup (sad animation)
 │        Lose some REP
 │        Lose any active sponsor
 │        NO end-of-season tournament offered
 │        → DROP TO PUB LEAGUE
 └─ NO  → Continue to end-of-season tournament
```

### End-of-Season Tournament (County League Only)
```
Click "Next Season"
      ↓
INVITED TO END-OF-SEASON CHAMPIONSHIP
      ↓
4-PLAYER GROUP STAGE (BO5)
 - 3 matches (round robin)
 - Opponents: mix of league players + random AI
      ↓
FINISH TOP 2 IN GROUP?
 ├─ YES → Enter 32-PLAYER KNOCKOUT
 │        BO5 all rounds, FINAL = BO7
 │        ↓
 │     WIN TOURNAMENT?
 │        ├─ YES → 🎉 PROMOTED TO REGIONAL TOUR
 │        │        (even if finished 3rd-8th in league)
 │        └─ NO  → Check league position for standard promotion
 └─ NO → Check league position for standard promotion
```

### Promotion Check
```
PROMOTED TO REGIONAL TOUR IF:
  1. Finished top 2 in County League standings
  OR
  2. Finished top 2 in group AND won the 32-player knockout

NOT PROMOTED?
  → Start next County League season (top 2 opponents replaced)
  → Sponsor renewal popup (if applicable)

IMPORTANT: Bottom 2 in league = NOT invited to end-of-season tournament at all
```

---

## REGIONAL TOUR (Tier 4) — TBD

- **12 players**, **11 league matches**, **Best of 7/9 legs**
- Tournament invites every 3 matches
- Top 2 → promoted to World Tour
- Bottom 2 → relegated to County League
- (Full spec pending from Dan)

---

## WORLD TOUR (Tier 5) — TBD

- **14 players**, **13 league matches**, **Best of 9/11/13 legs**
- Tournament invites every 3 matches
- Top tier — no further promotion
- Bottom 2 → relegated to Regional Tour
- (Full spec pending from Dan)

---

## SPONSOR SYSTEM

- **Available from County League (Tier 3) onwards**
- First sponsor: max 5% REP bonus
- Triggers: 3-win streak in current season OR reach tournament final
- Only 1 sponsor at a time
- End of season: renewal popup (Renew / Switch / Drop)
- Goal tracking under active sponsor card
- Goal reached = +10 REP
- **Relegated = lose sponsor immediately**

---

## KEY RULES

1. All career matches are against dartbot
2. Tournament matches count in season stats
3. Mid-season invite (Pub League): 1 tournament after 4th match, email Accept/Decline
4. Mid-season invites (County): 2 tournament options every 3 matches via popup
5. End-of-season (Pub League): 2 random tournaments via popup on "Next Season"
6. End-of-season (County): structured group stage → 32-player knockout (NOT random invites)
7. Accepting one auto-declines the other (for dual invites)
8. No re-offers after knockout or decline
9. Relegation: bottom 2 in County+ → drop tier, lose REP + sponsors, no end-of-season tournament
10. Alternative promotion (County only): win 32-player knockout = promoted even from 3rd-8th
11. Bottom 2 in league = NOT invited to end-of-season tournament
12. Training game on starter failure: random non-501 training mode, shown as career event
13. Season complete only shows when ALL events done (league + tournaments)

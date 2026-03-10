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

## REGIONAL TOUR (Tier 4)

- **15 players**, **14 league matches**, **Best of 7**
- 2 points per win, no draws
- Sponsors available
- 3 tournaments integrated into the season (results add league points)
- Bottom 2 → relegated to County Circuit

```
ENTER REGIONAL TOUR
      ↓
PLAY 5 LEAGUE MATCHES (Matchdays 1-5)
      ↓
TOURNAMENT 1 (32 players, BO7)
  All 15 Regional Tour players auto-enter
  Remaining spots = random outside players
  Points: L32=0, L16=1, QF=2, SF=3, RU=4, W=5
  (Only Regional Tour players earn league points)
      ↓
PLAY 5 LEAGUE MATCHES (Matchdays 6-10)
      ↓
TOURNAMENT 2 (32 players, BO7)
  Same format and points as Tournament 1
      ↓
PLAY 4 LEAGUE MATCHES (Matchdays 11-14)
      ↓
TOURNAMENT 3 QUALIFICATION
  Top 8 in table → auto-qualify
  Ranks 9-15 → play qualification matches
      ↓
TOURNAMENT 3 — TOUR CHAMPIONSHIP (64 players, BO7)
  Major event with higher points:
  L64=0, L32=2, L16=3, QF=4, SF=5, RU=6, W=7
      ↓
FINAL LEAGUE TABLE (league wins + all tournament points combined)
```

### Promotion
```
1st + 2nd → 🎉 AUTO-PROMOTED to World Tour
```

### Q School (3rd–6th)
```
3rd–6th → ENTER Q SCHOOL (4-player knockout, BO9)

SEMI-FINALS:
  3rd vs 6th (BO9)
  4th vs 5th (BO9)

FINAL:
  Winners play each other (BO9)

Q SCHOOL WINNER → 🎉 PROMOTED to World Tour

Total promotions per season = 3 (top 2 + Q School winner)
```

### Relegation
```
BOTTOM 2 → 😞 Relegated to County Circuit
  Lose REP + sponsors
```

---

## PRO TOUR (Tier 5)

- **No league matches** — pure tournament circuit
- **8 tournaments** per season (5 Players Championships + 1 Open + 1 Major)
- **Global Rankings**: Top 100 players, show Top 21 + user position
- **Premier League**: Top 10 ranked players, round-robin (9 matches, BO11), runs alongside tournaments
- **Bottom 10** in rankings relegated to Regional Tour
- Rankings use rolling window (8% decay per tournament)

```
ENTER PRO TOUR
      ↓
(Rankings initialized: 100 AI players + user)
(If ranked Top 10: Premier League invitation!)
      ↓
PLAYERS CHAMPIONSHIP 1 (128 players, knockout)
  L128-L32: BO11 | L16: BO13 | QF: BO15 | SF: BO17 | F: BO19
  Rating: L128=1, L64=3, L32=6, L16=10, QF=15, SF=20, RU=30, W=40
      ↓
PREMIER LEAGUE NIGHT 1 (if in PL)
      ↓
PLAYERS CHAMPIONSHIP 2 → PL NIGHT 2 → PLAYERS CHAMPIONSHIP 3 → PL NIGHT 3
      ↓
PRO TOUR OPEN (128 players, higher rating rewards)
  L128-L32: BO11 | L16: BO13 | QF: BO15 | SF: BO17 | F: BO21
  Rating: L128=2, L64=4, L32=8, L16=12, QF=18, SF=25, RU=35, W=50
      ↓
PL NIGHT 4 → PLAYERS CHAMPIONSHIP 4 → PL NIGHT 5 → PLAYERS CHAMPIONSHIP 5 → PL NIGHT 6
      ↓
PRO TOUR MAJOR QUALIFICATION
  Top 32 in rankings auto-qualify
  Others play qualifier match
      ↓
PL NIGHT 7
      ↓
PRO TOUR MAJOR (128 players, biggest event)
  L128: BO11 | L64: BO13 | L32: BO15 | L16: BO17 | QF: BO19 | SF: BO21 | F: BO23
  Rating: L128=3, L64=6, L32=10, L16=15, QF=20, SF=30, RU=45, W=60
      ↓
PL NIGHT 8 → PL NIGHT 9
      ↓
SEASON END → Rankings update
```

### Relegation
```
BOTTOM 10 IN RANKINGS (rank 91-100) → 😞 Relegated to Regional Tour
  Lose Pro Tour card
  Drop to Tier 4
```

### Premier League
```
TOP 10 IN RANKINGS → Invited to Premier League
  9 round-robin matches (vs other Top 10 players)
  BO11 each match
  Interleaved between Pro Tour tournaments
  PL wins give +2 ranking rating each
  Win 7+ of 9 = Premier League Champion trophy
```

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

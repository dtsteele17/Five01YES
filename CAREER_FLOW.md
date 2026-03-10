# 🎯 Darts Career Mode — Complete Flow

## START CAREER

```
USER PICKS 1 OF 3 STARTER TOURNAMENTS
      ↓
PLAY STARTER TOURNAMENT
      ↓
REACH FINAL?
 ├─ YES → ENTER PUB LEAGUE
 └─ NO
        ↓
   SECOND STARTER TOURNAMENT
        ↓
   PLAY TOURNAMENT TO COMPLETION
        ↓
   REACH SEMI FINAL?
   ├─ YES → ENTER PUB LEAGUE
   └─ NO
          ↓
     AUTO SELECT TRAINING GAME FROM TRAINING HUB
          ↓
     USER PLAYS TRAINING GAME
          ↓
     ENTER PUB LEAGUE
```

---

## PUB LEAGUE (Tier 2)

- **8 players**, **7 league matches**, **Best of 3 legs**

```
ENTER PUB LEAGUE
      ↓
PLAY 4 LEAGUE MATCHES
      ↓
1 TOURNAMENT INVITE (email — Accept/Decline)
 ├─ ACCEPT → Play tournament until win or knocked out
 └─ DECLINE → Skip
      ↓
PLAY NEXT 3 LEAGUE MATCHES (7 total)
      ↓
SEASON ENDS → Show final table
      ↓
Click "Next Season"
      ↓
2 END-OF-SEASON TOURNAMENT INVITES (popup — Accept 1 or Decline Both)
 ├─ ACCEPT ONE → Play tournament until win or knocked out
 └─ DECLINE BOTH → Skip
      ↓
FINISH TOP 2?
 ├─ YES → PROMOTED TO COUNTY LEAGUE
 └─ NO  → Start next Pub League season (top 2 opponents replaced)
```

---

## COUNTY LEAGUE (Tier 3)

- **10 players**, **9 league matches**, **Best of 5 legs**
- Tournament invites every 3 matches (2 options + decline both)

```
ENTER COUNTY LEAGUE
      ↓
PLAY 3 LEAGUE MATCHES
      ↓
2 TOURNAMENT INVITES (popup — Accept 1 or Decline Both)
 ├─ ACCEPT ONE → Play tournament until win or knocked out
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
SEASON ENDS → Show final table
```

### Relegation Check
```
FINISH BOTTOM 2?
 ├─ YES → RELEGATED TO PUB LEAGUE (no final tournament)
 └─ NO  → Continue to end-of-season tournament
```

### End of Season Tournament
```
Click "Next Season"
      ↓
END-OF-SEASON TOURNAMENT INVITE
      ↓
4 PLAYER GROUP STAGE (play 3 matches)
      ↓
FINISH TOP 2 IN GROUP?
 ├─ YES → Enter 32-player knockout tournament
 │        ↓
 │     Play knockout rounds
 │        ↓
 │     WIN TOURNAMENT?
 │        ├─ YES → PROMOTED TO REGIONAL TOUR
 │        └─ NO  → Check league position
 └─ NO → Check league position
```

### Promotion Check
```
PROMOTED TO REGIONAL TOUR IF:
  1. Finish top 2 in County League
  OR
  2. Finish top 2 in group stage AND win the 32-player tournament

NOT PROMOTED?
  → Start next County League season (repeat same structure)
```

---

## REGIONAL TOUR (Tier 4)

- **12 players**, **11 league matches**, **Best of 7/9 legs**
- Tournament invites every 3 matches
- Top 2 → promoted to World Tour
- Bottom 2 → relegated to County League

---

## WORLD TOUR (Tier 5)

- **14 players**, **13 league matches**, **Best of 9/11/13 legs**
- Tournament invites every 3 matches
- Top tier — no further promotion
- Bottom 2 → relegated to Regional Tour

---

## COMPLETE PROGRESSION PATH

```
STARTER TOURNAMENTS (Tier 1)
        ↓
PUB LEAGUE (Tier 2) — 8 players, BO3
        ↓
COUNTY LEAGUE (Tier 3) — 10 players, BO5
        ↓
REGIONAL TOUR (Tier 4) — 12 players, BO7/9
        ↓
WORLD TOUR (Tier 5) — 14 players, BO9/11/13
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

---

## KEY RULES

1. All career matches are against dartbot
2. Tournament matches count in season stats
3. Mid-season invite: single tournament, Accept/Decline in email
4. End-of-season invite: 2 tournaments via popup on "Next Season" click
5. Accepting one auto-declines the other
6. No re-offers after knockout or decline
7. Season complete only shows when ALL events done (league + tournaments)
8. Promotion: top 2 finish OR tournament win path
9. Not promoted: stay same tier, top 2 opponents replaced
10. Relegated: drop a tier (bottom 2 in County+)

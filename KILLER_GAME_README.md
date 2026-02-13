# Killer Darts Training Game

## Overview
Killer is a popular darts game where players try to eliminate each other by hitting their opponent's designated number. This is a single-player training version where you play against a bot.

## Rules

### 1. Select Your Number
- Throw a dart to select a number (1-20)
- Bull is not allowed
- Each player gets a unique number

### 2. Become a Killer
- Hit your own number's **DOUBLE** to become a KILLER
- You'll see a 💀 badge when you become a killer

### 3. Eliminate Your Opponent
- As a killer, hit your opponent's number to steal their lives:
  - **Single** = 1 life
  - **Double** = 2 lives  
  - **Treble** = 3 lives

### 4. Avoid Self-Harm
- If you hit your own number after becoming a killer:
  - You lose 1 life
  - You lose your killer status
  - You must become a killer again!

### 5. Win the Game
- Last player with lives remaining wins!

## Features

### Visual Design
- **Player Card**: Green theme with heart lives display
- **Bot Card**: Blue/purple theme with heart lives display
- **Killer Badge**: Red skull badge when player becomes killer
- **Eliminated**: Red "ELIMINATED" badge when player is out

### Game Mechanics
- Turn-based play (you vs bot)
- Bot has realistic accuracy (40% hit rate)
- Bot AI will try to become killer first, then attack
- Visual feedback for all actions
- Toast notifications for important events

### Scoring Panel
- Four tabs: Singles, Trebles, Doubles, Bulls
- Taken numbers show as "X"
- Disabled when it's bot's turn
- Miss button available

### End Game Stats
- Winner announcement with trophy/robot emoji
- Your kills count
- Bot kills count
- Total turns played
- Play Again button

## Files Created/Modified

| File | Description |
|------|-------------|
| `app/app/play/training/killer/page.tsx` | **NEW** - Complete Killer game implementation |
| `app/app/play/page.tsx` | Added Killer to dropdown and navigation |

## How to Play

1. Go to **Play** → **Training** → Select **Practice Games**
2. From dropdown, select **"Killer"**
3. Click **"Start Training"**
4. Click a number (1-20) to select it as your number
5. Try to hit your number's **DOUBLE** to become a killer
6. Once killer, hit the bot's number to steal lives
7. Don't hit your own number!
8. Eliminate the bot to win!

## Tips

- **Become killer quickly** - The first to become killer has an advantage
- **Aim for doubles** when attacking - takes 2 lives at once
- **Trebles are best** - Takes 3 lives but harder to hit
- **Watch your aim** - Hitting your own number costs you!
- **The bot is sneaky** - It will try to become killer before attacking

## Variations from Traditional Killer

This training version differs from multiplayer Killer:
- Only 2 players (you vs bot) instead of 3+
- Numbers are selected by clicking rather than throwing
- No "closest to bull" to determine throwing order
- Simplified for single-player training

Enjoy playing Killer! 💀🎯

// FIFA-STYLE TRAINING PAGE COMPLETE UPDATE
// File: app/app/play/training/501/page.tsx
// This contains the complete updates needed for FIFA-style career mode

// 1. UPDATE CAREER MATCH COMPLETION (around line 1720)
// Replace the existing career completion section with this:

const careerMatchCompletionFull = `
        // Report FIFA-style career match result  
        if (config?.career) {
          try {
            // Calculate comprehensive stats for FIFA-style reporting
            const playerStats = {
              average: userStats.threeDartAverage,
              highestCheckout: userStats.highestCheckout,
              checkout_pct: userStats.checkoutPercentage,
              total180s: userStats.oneEighties || 0
            };

            // Use FIFA-style career completion function
            const careerResult = await supabase.rpc('rpc_fifa_complete_career_match', {
              p_match_id: config.career.matchId,
              p_player_legs_won: p1Legs,
              p_opponent_legs_won: p2Legs,
              p_player_stats: playerStats
            });
            
            if (careerResult.data?.success) {
              console.log('🏆 FIFA-style career match completed:', careerResult.data);
              
              // Show REP gained notification
              if (careerResult.data.rep_gained) {
                toast.success(\`+\${careerResult.data.rep_gained} REP earned!\`);
              }
              
              // Handle special FIFA-style progression notifications
              if (careerResult.data.tournament_triggered) {
                toast.info('Mid-season tournament available!');
              }
              
              if (careerResult.data.sponsor_triggered) {
                toast.info('Sponsor offers available!');
              }
              
              if (careerResult.data.season_complete) {
                toast.success('Season complete! Checking final position...');
              }
              
              // Store FIFA completion context for return navigation
              sessionStorage.setItem('career_match_completed', JSON.stringify({
                result: careerResult.data.result,
                repGained: careerResult.data.rep_gained,
                nextAction: careerResult.data.next_action,
                tournamentTriggered: careerResult.data.tournament_triggered,
                sponsorTriggered: careerResult.data.sponsor_triggered,
                seasonComplete: careerResult.data.season_complete,
                completedMatches: careerResult.data.completed_matches,
                fifaStyle: true
              }));
              
            } else {
              console.error('FIFA career match completion failed:', careerResult);
              // Fallback to original completion
              const fallbackResult = await supabase.rpc('rpc_career_complete_match', {
                p_career_id: config.career.careerId,
                p_match_id: config.career.matchId,
                p_won: currentMatchWinner === 'player1',
                p_player_legs: p1Legs,
                p_player_highest_checkout: userStats.highestCheckout
              });
              
              if (fallbackResult.data?.success) {
                toast.success(\`+\${fallbackResult.data.rep_earned} REP\`);
              }
            }
          } catch (err) {
            console.error('Failed to complete FIFA career match:', err);
            toast.error('Failed to save career match result');
          }
        }
`;

// 2. UPDATE handleReturnToPlay FUNCTION (replace entirely around line 1880)
const handleReturnToPlayComplete = `
  const handleReturnToPlay = () => {
    if (config?.career) {
      // FIFA-style career return logic
      const returnContext = sessionStorage.getItem('career_return_context');
      const matchCompleted = sessionStorage.getItem('career_match_completed');
      
      try {
        if (returnContext) {
          const context = JSON.parse(returnContext);
          
          // Clear session storage
          sessionStorage.removeItem('career_return_context');
          sessionStorage.removeItem('career_match_completed');
          sessionStorage.removeItem('career_fixtures_return');
          
          // FIFA-style return: always go back to career home after match
          // The career home will handle next steps based on completion data
          if (context.returnType === 'career_home' || config.career.fifaStyle) {
            router.push(\`/app/career?id=\${context.careerId}\`);
            return;
          }
          
          // Legacy return to fixtures for non-FIFA matches
          if (context.route) {
            router.push(context.route);
            return;
          }
        }
        
        // Check for legacy fixtures return
        const fixturesReturn = sessionStorage.getItem('career_fixtures_return');
        if (fixturesReturn && config.career.returnToFixtures) {
          try {
            const context = JSON.parse(fixturesReturn);
            sessionStorage.removeItem('career_fixtures_return');
            
            if (context.route) {
              router.push(context.route);
            } else {
              router.push(\`/app/career/week/\${context.careerId}?careerId=\${context.careerId}\`);
            }
            return;
          } catch (e) {
            console.error('Error parsing fixtures return context:', e);
          }
        }
        
        // Check if it's a bracket match
        const isBracketMatch = config.career.matchId?.startsWith('bracket-');
        if (isBracketMatch) {
          router.push(\`/app/career/bracket?careerId=\${config.career.careerId}&eventId=\${config.career.eventId}\`);
          return;
        }
        
      } catch (e) {
        console.error('Error parsing career return context:', e);
      }
      
      // Fallback: Always return to career home for FIFA-style matches
      if (config.career.fifaStyle || config.career.returnToCareer) {
        router.push(\`/app/career?id=\${config.career.careerId}\`);
      } else if (config.career.careerId) {
        router.push(\`/app/career?id=\${config.career.careerId}\`);
      } else {
        router.push('/app/career');
      }
    } else {
      // Non-career match: return to training
      router.push('/app/play/training');
    }
  };
`;

// 3. ADD FIFA CONFIG VALIDATION (in useEffect where config is loaded, around line 200)
const configValidationComplete = `
  // Validate FIFA-style career context
  if (config?.career) {
    if (!config.career.careerId) {
      console.error('FIFA Career match missing careerId - returning to career home');
      router.push('/app/career');
      return;
    }
    
    // Enhanced career context logging
    console.log('🎯 FIFA Career Match Loaded:', {
      careerId: config.career.careerId,
      matchId: config.career.matchId,
      tier: config.career.tier,
      season: config.career.season,
      tierName: config.career.tierName,
      opponent: config.career.opponentName,
      format: config.bestOf,
      fifaStyle: config.career.fifaStyle,
      source: config.career.source,
      matchType: config.career.matchType
    });
    
    // Set bot name for FIFA-style career
    if (config.career.fifaStyle && config.career.opponentName) {
      // The botName is already set correctly from config.career.opponentName
    }
  }
`;

// 4. UPDATE DartbotWinnerPopup CAREER CONTEXT (around line 2160)
const winnerPopupCareerContext = `
            career={config?.career ? {
              isCareer: true,
              playerWon: matchWinner === 'player1',
              eventName: config.career.eventName || 'Career Match',
              eventType: config.career.matchId?.startsWith('bracket-') ? 'tournament' : 'league',
              bracketRound: config.career.bracketRound && config.career.totalRounds
                ? getRoundName(config.career.bracketRound, config.career.totalRounds)
                : undefined,
              fifaStyle: config.career.fifaStyle,
              tierName: config.career.tierName,
              format: config.bestOf
            } : undefined}
`;

// 5. UPDATE GAME CONFIG DETECTION (add after config is loaded)
const gameConfigEnhancement = `
  // Enhance bot name for FIFA-style career matches
  const botName = useMemo(() => {
    if (config?.career?.opponentName) {
      return config.career.opponentName;
    } else if (config?.career?.fifaStyle && config?.career?.tier) {
      const tierName = config.career.tier === 2 ? 'Pub League' : 
                      config.career.tier === 3 ? 'County' : 'League';
      return \`\${tierName} Opponent\`;
    } else if (config?.botAverage) {
      return \`DartBot (\${config.botAverage})\`;
    } else {
      return 'DartBot';
    }
  }, [config]);
`;

// 6. ADD IMPORTS (if not already present)
const requiredImports = `
import { toast } from 'sonner';
import { useMemo } from 'react';
`;

// COMPLETE IMPLEMENTATION INSTRUCTIONS
console.log(`
🎯 FIFA-STYLE TRAINING PAGE COMPLETE UPDATE INSTRUCTIONS:

1. Open app/app/play/training/501/page.tsx

2. Add required imports at the top (if missing):
   ${requiredImports}

3. Replace the career match completion section (around line 1720) with:
   careerMatchCompletionFull

4. Replace the entire handleReturnToPlay function (around line 1880) with:
   handleReturnToPlayComplete

5. Add FIFA config validation in useEffect (around line 200) with:
   configValidationComplete

6. Update the botName variable declaration (around line 150) with:
   gameConfigEnhancement

7. Update DartbotWinnerPopup career prop (around line 2160) with:
   winnerPopupCareerContext

8. Find and replace the existing botName declaration:
   OLD: const botName = config?.career?.opponentName || (config?.botAverage ? \`DartBot (\${config.botAverage})\` : 'DartBot');
   NEW: Use the gameConfigEnhancement code above

RESULT: Complete FIFA-style career integration with:
✅ FIFA-style match completion (rpc_fifa_complete_career_match)
✅ Proper return flow to career home
✅ Tournament/sponsor notifications
✅ Season completion handling  
✅ Enhanced bot naming for career opponents
✅ Fallback support for non-FIFA matches
✅ Complete error handling

After these changes, career matches will:
- Use FIFA-style progression rules
- Return to career home with proper context
- Show tournament/sponsor triggers
- Display opponent names correctly
- Handle all FIFA-style features!
`);

module.exports = {
  careerMatchCompletionFull,
  handleReturnToPlayComplete,
  configValidationComplete,
  winnerPopupCareerContext,
  gameConfigEnhancement,
  requiredImports
};
// FIFA-Style Training Page Updates for Career Mode
// This file contains the code changes needed for app/app/play/training/501/page.tsx

// 1. Update the career match completion section (around line 1720)
// Replace the existing career match completion with this:

const careerMatchCompletion = `
        // Report career match result if this is a FIFA-style career match
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
            const careerResult = await supabase.rpc('rpc_complete_career_match_fifa_style', {
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
              
              // Store completion context for return navigation
              sessionStorage.setItem('career_match_completed', JSON.stringify({
                result: careerResult.data.result,
                repGained: careerResult.data.rep_gained,
                nextAction: careerResult.data.next_action,
                tournamentTriggered: careerResult.data.tournament_triggered,
                seasonComplete: careerResult.data.season_complete
              }));
              
            } else {
              console.error('FIFA career match completion failed:', careerResult);
              toast.error('Failed to save career match result');
            }
          } catch (err) {
            console.error('Failed to complete FIFA career match:', err);
            toast.error('Failed to save career match result');
          }
        }
`;

// 2. Update the handleReturnToPlay function (around line 1880)
// Replace the existing handleReturnToPlay with this:

const handleReturnToPlayUpdate = `
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
          
          // FIFA-style return: always go back to career home after match
          // The career home will handle next steps (fixtures complete, tournaments, etc.)
          router.push(\`/app/career?id=\${context.careerId}\`);
          return;
        }
      } catch (e) {
        console.error('Error parsing career return context:', e);
      }
      
      // Fallback to original career return logic if no context
      if (config.career.careerId) {
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

// 3. Update the game config detection to handle FIFA-style career context
// Add this validation in the useEffect where config is loaded:

const configValidation = `
  // Validate FIFA-style career context
  if (config?.career && !config.career.careerId) {
    console.error('FIFA Career match missing careerId - returning to career home');
    router.push('/app/career');
    return;
  }
  
  // Enhanced career context logging
  if (config?.career) {
    console.log('🎯 FIFA Career Match Loaded:', {
      careerId: config.career.careerId,
      matchId: config.career.matchId,
      tier: config.career.tier,
      season: config.career.season,
      tierName: config.career.tierName,
      opponent: config.career.opponentName
    });
  }
`;

// 4. Instructions for implementing these changes:
console.log(\`
FIFA-STYLE CAREER TRAINING PAGE UPDATE INSTRUCTIONS:

1. Open app/app/play/training/501/page.tsx

2. Find the career match completion section (around line 1720, after "Report career match result")
   - Replace the existing career completion code with the 'careerMatchCompletion' code above

3. Find the handleReturnToPlay function (around line 1880)
   - Replace the entire function with the 'handleReturnToPlayUpdate' code above

4. Find the useEffect where config is loaded (around line 200)
   - Add the 'configValidation' code after config is set

5. Import toast if not already imported:
   import { toast } from 'sonner';

These changes will:
✅ Use FIFA-style career completion (rpc_complete_career_match_fifa_style)
✅ Return user to career home after every match (FIFA behavior)
✅ Handle tournament triggers and season completion
✅ Show proper REP notifications
✅ Store completion context for career progression
\`);

// Export the code sections for easy copying
module.exports = {
  careerMatchCompletion,
  handleReturnToPlayUpdate, 
  configValidation
};
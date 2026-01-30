import { saveCompletedMatch, CompletedMatchData } from '@/lib/utils/match-persistence';
import { toast } from 'sonner';

export async function onMatchCompleted(matchData: CompletedMatchData): Promise<string | null> {
  try {
    console.log('🎯 MATCH_COMPLETED_TRIGGERED', {
      matchType: matchData.matchType,
      gameMode: matchData.gameMode,
      winner: matchData.winner,
      userLegs: matchData.userLegs,
      opponentLegs: matchData.opponentLegs,
    });

    const matchId = await saveCompletedMatch(matchData);

    if (matchId) {
      console.log('✅ MATCH_SAVED_OK', { matchId });
      console.log('✅ PLAYER_STATS_SAVED_OK', { matchId });
      console.log('✅ AGGREGATES_UPDATED_OK', { matchId });
      return matchId;
    } else {
      console.error('❌ MATCH_SAVE_FAILED: No match ID returned');
      return null;
    }
  } catch (error) {
    console.error('❌ MATCH_SAVE_FAILED', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      matchType: matchData.matchType,
      gameMode: matchData.gameMode,
    });

    toast.error('Failed to save match. Please try again.');
    return null;
  }
}

import { useEffect, useRef, useState } from 'react';
import { recordMatchCompletion, type PlayerStats } from '@/lib/match/recordMatchCompletion';
import { normalizeMatchConfig } from '@/lib/match/defaultMatchConfig';
import { type FinalMatchStats } from '@/lib/stats/finalMatchStats';
import { computeMatchStats } from '@/lib/stats/computeMatchStats';

interface LegData {
  legNumber: number;
  winner: 'player1' | 'player2' | null;
  visits: Array<{
    player: 'player1' | 'player2';
    score: number;
    remainingScore: number;
    isBust: boolean;
    isCheckout: boolean;
    timestamp: number;
    lastDartType?: 'S' | 'D' | 'T' | 'BULL' | 'SBULL';
    bustReason?: string;
  }>;
  player1DartsThrown: number;
  player2DartsThrown: number;
}

interface UseMatchPersistenceParams {
  matchWinner: 'player1' | 'player2' | null;
  showMatchCompleteModal: boolean;
  matchConfig: {
    mode: '301' | '501';
    bestOf: string;
    doubleOut: boolean;
    straightIn?: boolean;
    botAverage?: number;
  };
  matchType: 'training' | 'local' | 'quick' | 'ranked' | 'private' | 'league' | 'tournament';
  opponentType: 'user' | 'dartbot' | 'local';
  opponentName: string;
  dartbotLevel?: number;
  player1LegsWon: number;
  player2LegsWon: number;
  allLegs: LegData[];
  currentLeg: LegData;
  player1Name?: string;
  player2Name?: string;
  matchStartTime?: number;
  finalMatchStats?: FinalMatchStats | null;
  player1TotalDartsAtDouble?: number;
  player1CheckoutsMade?: number;
  player2TotalDartsAtDouble?: number;
  player2CheckoutsMade?: number;
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useMatchPersistence(params: UseMatchPersistenceParams) {
  const hasSaved = useRef(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedMatchId, setSavedMatchId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    console.log('🔄 useMatchPersistence effect triggered', {
      matchWinner: params.matchWinner,
      showMatchCompleteModal: params.showMatchCompleteModal,
      hasSaved: hasSaved.current,
      matchType: params.matchType,
    });

    if (params.matchWinner && params.showMatchCompleteModal && !hasSaved.current) {
      console.log('✅ CONDITIONS MET - Starting match save process');
      hasSaved.current = true;
      setSaveStatus('saving');

      (async () => {
        try {
          const normalizedConfig = normalizeMatchConfig(params.matchConfig);

          const allLegsData = [...params.allLegs, params.currentLeg].filter(leg => leg.winner);

          let player1Stats = params.finalMatchStats?.player1;
          let player2Stats = params.finalMatchStats?.player2;

          if (!player1Stats || !player2Stats) {
            // Compute stats from visits if not already provided
            const allVisitsFormatted: Array<{
              player: 'user' | 'opponent';
              legNumber: number;
              visitNumber: number;
              score: number;
              remainingScore: number;
              isBust: boolean;
              isCheckout: boolean;
              wasCheckoutAttempt: boolean;
            }> = [];

            for (const leg of allLegsData) {
              const player1VisitsInLeg = leg.visits.filter(v => v.player === 'player1');
              const player2VisitsInLeg = leg.visits.filter(v => v.player === 'player2');

              player1VisitsInLeg.forEach((visit, idx) => {
                allVisitsFormatted.push({
                  player: 'user',
                  legNumber: leg.legNumber,
                  visitNumber: idx + 1,
                  score: visit.score,
                  remainingScore: visit.remainingScore,
                  isBust: visit.isBust,
                  isCheckout: visit.isCheckout,
                  wasCheckoutAttempt: visit.remainingScore <= 170 && !visit.isBust,
                });
              });

              player2VisitsInLeg.forEach((visit, idx) => {
                allVisitsFormatted.push({
                  player: 'opponent',
                  legNumber: leg.legNumber,
                  visitNumber: idx + 1,
                  score: visit.score,
                  remainingScore: visit.remainingScore,
                  isBust: visit.isBust,
                  isCheckout: visit.isCheckout,
                  wasCheckoutAttempt: visit.remainingScore <= 170 && !visit.isBust,
                });
              });
            }

            const userStats = computeMatchStats(
              allVisitsFormatted.filter(v => v.player === 'user'),
              'user',
              normalizedConfig.mode,
              params.player1TotalDartsAtDouble,
              params.player1CheckoutsMade
            );

            const opponentStats = computeMatchStats(
              allVisitsFormatted.filter(v => v.player === 'opponent'),
              'opponent',
              normalizedConfig.mode,
              params.player2TotalDartsAtDouble,
              params.player2CheckoutsMade
            );

            player1Stats = {
              threeDartAverage: userStats.threeDartAverage,
              first9Average: userStats.first9Average,
              first9DartsThrown: userStats.first9DartsThrown,
              first9PointsScored: userStats.first9PointsScored,
              highestScore: userStats.highestVisit,
              highestCheckout: userStats.highestCheckout,
              checkoutPercent: userStats.checkoutPercent,
              checkoutDartsAttempted: userStats.checkoutDartsAttempted,
              checkoutsMade: userStats.checkoutsMade,
              count100Plus: userStats.count100Plus,
              count140Plus: userStats.count140Plus,
              count180: userStats.oneEighties,
            legsWon: userStats.legsWon,
            totalDartsThrown: userStats.totalDartsThrown,
            totalPointsScored: userStats.totalPointsScored,
          };

          player2Stats = {
            threeDartAverage: opponentStats.threeDartAverage,
            first9Average: opponentStats.first9Average,
            first9DartsThrown: opponentStats.first9DartsThrown,
            first9PointsScored: opponentStats.first9PointsScored,
            highestScore: opponentStats.highestVisit,
            highestCheckout: opponentStats.highestCheckout,
            checkoutPercent: opponentStats.checkoutPercent,
            checkoutDartsAttempted: opponentStats.checkoutDartsAttempted,
            checkoutsMade: opponentStats.checkoutsMade,
            count100Plus: opponentStats.count100Plus,
            count140Plus: opponentStats.count140Plus,
            count180: opponentStats.oneEighties,
            legsWon: opponentStats.legsWon,
            totalDartsThrown: opponentStats.totalDartsThrown,
            totalPointsScored: opponentStats.totalPointsScored,
          };
        }

          // Prepare player stats for recording
          const userPlayerStats: PlayerStats = {
            threeDartAvg: player1Stats.threeDartAverage,
            first9Avg: player1Stats.first9Average,
            checkoutDartsAttempted: player1Stats.checkoutDartsAttempted,
            checkoutsMade: player1Stats.checkoutsMade,
            checkoutPercent: player1Stats.checkoutPercent,
            highestCheckout: player1Stats.highestCheckout,
            count100Plus: player1Stats.count100Plus,
            count140Plus: player1Stats.count140Plus,
            count180: player1Stats.count180,
            highestScore: player1Stats.highestScore,
            legsWon: params.player1LegsWon,
            legsLost: params.player2LegsWon,
            dartsThrown: player1Stats.totalDartsThrown,
            pointsScored: player1Stats.totalPointsScored,
          };

          const opponentPlayerStats: PlayerStats = {
            threeDartAvg: player2Stats.threeDartAverage,
            first9Avg: player2Stats.first9Average,
            checkoutDartsAttempted: player2Stats.checkoutDartsAttempted,
            checkoutsMade: player2Stats.checkoutsMade,
            checkoutPercent: player2Stats.checkoutPercent,
            highestCheckout: player2Stats.highestCheckout,
            count100Plus: player2Stats.count100Plus,
            count140Plus: player2Stats.count140Plus,
            count180: player2Stats.count180,
            highestScore: player2Stats.highestScore,
            legsWon: params.player2LegsWon,
            legsLost: params.player1LegsWon,
            dartsThrown: player2Stats.totalDartsThrown,
            pointsScored: player2Stats.totalPointsScored,
          };

          // Normalize bestOf to string format
          let matchFormat = 'best-of-3';
          const bestOf = params.matchConfig?.bestOf;
          if (typeof bestOf === 'number') {
            matchFormat = `best-of-${bestOf}`;
          } else if (typeof bestOf === 'string') {
            matchFormat = bestOf.includes('best-of') ? bestOf : `best-of-${bestOf}`;
          }

          // Call unified recording service
          const result = await recordMatchCompletion({
            matchType: params.matchType,
            game: normalizedConfig.mode,
            startedAt: params.matchStartTime ? new Date(params.matchStartTime).toISOString() : new Date().toISOString(),
            endedAt: new Date().toISOString(),
            opponent: {
              userId: undefined, // Will be set for online matches
              name: params.opponentName,
              isBot: params.opponentType === 'dartbot',
            },
            winner: params.matchWinner === 'player1' ? 'user' : 'opponent',
            userStats: userPlayerStats,
            opponentStats: opponentPlayerStats,
            matchFormat,
          });

          console.log('📊 MATCH_RECORD_RESULT:', result);

          if (result.ok && result.matchId) {
            setSaveStatus('saved');
            setSavedMatchId(result.matchId);
            setSaveError(null);
          } else {
            setSaveStatus('error');
            setSaveError(result.error || 'Unknown error');
          }

        } catch (error: any) {
          console.error('❌ Exception in match persistence:', error);
          setSaveStatus('error');
          setSaveError(error?.message || String(error));
        }
      })();
    } else {
      if (!params.matchWinner) {
        console.log('⏸️ Match not saved: no winner yet');
      } else if (!params.showMatchCompleteModal) {
        console.log('⏸️ Match not saved: complete modal not shown yet');
      } else if (hasSaved.current) {
        console.log('⏸️ Match not saved: already saved');
      }
    }
  }, [params]);

  return {
    hasSaved: hasSaved.current,
    saveStatus,
    savedMatchId,
    saveError,
  };
}

'use client';

import { useTournamentReadyUp } from '@/lib/hooks/useTournamentReadyUp';
import { TournamentReadyModal } from './TournamentReadyModal';

export default function TournamentMatchMonitor() {
  const {
    showModal,
    activeMatch,
    timeRemaining,
    isReadyingUp,
    readyUp,
    closeModal,
  } = useTournamentReadyUp();

  if (!showModal || !activeMatch) {
    return null;
  }

  const opponentName =
    activeMatch.opponent_username ??
    activeMatch.opponent_id ??
    'Opponent';

  return (
    <TournamentReadyModal
      isOpen={showModal}
      opponentName={opponentName}
      opponentAvatar={activeMatch.opponent_avatar_url ?? null}
      tournamentName={activeMatch.tournament_name ?? 'Tournament'}
      round={activeMatch.round ?? 1}
      timeRemaining={timeRemaining ?? 0}
      readyCount={activeMatch.ready_count ?? 0}
      isReady={activeMatch.my_ready ?? false}
      isReadyingUp={isReadyingUp}
      onReadyUp={readyUp}
      onClose={closeModal}
    />
  );
}

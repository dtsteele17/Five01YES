/**
 * Canonical Tournament Match Status Utilities
 * Centralizes all match status logic to eliminate inconsistencies
 */

export type TournamentMatchStatus = 'pending' | 'ready' | 'ready_check' | 'in_progress' | 'completed';

export interface TournamentMatchStatusResult {
  isActive: boolean;
  canRedirect: boolean;
  redirectUrl?: string;
  shouldShowReadyUp: boolean;
  statusLabel: string;
}

/**
 * Canonical function to determine if a match has started (should redirect to match room)
 */
export function isMatchStarted(match: {
  status: string;
  match_room_id: string | null;
}): boolean {
  return match.status === 'in_progress' && !!match.match_room_id;
}

/**
 * Canonical function to determine if match needs ready-up
 */
export function needsReadyUp(match: {
  status: string;
  ready_deadline: string | null;
}): boolean {
  return match.status === 'ready' || match.status === 'ready_check';
}

/**
 * Canonical function to determine match redirect behavior
 */
export function getMatchRedirect(
  match: {
    id: string;
    status: string;
    match_room_id: string | null;
    ready_deadline: string | null;
  },
  tournamentId: string,
  currentUserId: string | null
): TournamentMatchStatusResult {
  const isUserParticipant = match && currentUserId && (
    (match as any).player1_id === currentUserId || 
    (match as any).player2_id === currentUserId
  );

  // Match has started - redirect to match room
  if (isMatchStarted(match)) {
    return {
      isActive: true,
      canRedirect: true,
      redirectUrl: `/app/play/quick-match/match?room=${match.match_room_id}&tournament=${tournamentId}&tournamentMatch=${match.id}`,
      shouldShowReadyUp: false,
      statusLabel: 'Live Match'
    };
  }

  // Match needs ready-up and user is participant
  if (needsReadyUp(match) && isUserParticipant) {
    return {
      isActive: true,
      canRedirect: true,
      redirectUrl: `/app/tournaments/${tournamentId}/ready`,
      shouldShowReadyUp: true,
      statusLabel: 'Ready Up Required'
    };
  }

  // Match completed
  if (match.status === 'completed') {
    return {
      isActive: false,
      canRedirect: false,
      shouldShowReadyUp: false,
      statusLabel: 'Completed'
    };
  }

  // Match pending/scheduled
  return {
    isActive: true,
    canRedirect: false,
    shouldShowReadyUp: false,
    statusLabel: match.status === 'pending' ? 'Scheduled' : 'Waiting'
  };
}

/**
 * Canonical function to check if user has an active match requiring action
 */
export function findActiveUserMatch(
  matches: Array<{
    id: string;
    status: string;
    match_room_id: string | null;
    ready_deadline: string | null;
    player1_id: string;
    player2_id: string;
  }>,
  currentUserId: string | null
) {
  if (!currentUserId) return null;

  return matches.find(match => {
    const isParticipant = match.player1_id === currentUserId || match.player2_id === currentUserId;
    return isParticipant && (isMatchStarted(match) || needsReadyUp(match));
  });
}
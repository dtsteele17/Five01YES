/**
 * Centralized Tournament Participant State Management
 * Ensures consistent registration/check-in state across components
 */

export interface TournamentParticipantState {
  isRegistered: boolean;
  isCheckedIn: boolean;
  registrationTime?: string;
  checkInTime?: string;
  status: 'not_registered' | 'registered' | 'checked_in' | 'eliminated';
}

/**
 * Canonical function to determine participant state for a user
 */
export function getParticipantState(
  participants: Array<{
    user_id: string;
    status_type: string;
    joined_at?: string;
    checked_in_at?: string;
  }>,
  userId: string | null
): TournamentParticipantState {
  if (!userId) {
    return {
      isRegistered: false,
      isCheckedIn: false,
      status: 'not_registered'
    };
  }

  const participation = participants.find(p => p.user_id === userId);
  
  if (!participation) {
    return {
      isRegistered: false,
      isCheckedIn: false,
      status: 'not_registered'
    };
  }

  // Determine status based on participation record
  const isRegistered = ['confirmed', 'checked_in'].includes(participation.status_type);
  const isCheckedIn = participation.status_type === 'checked_in' && !!participation.checked_in_at;

  return {
    isRegistered,
    isCheckedIn,
    registrationTime: participation.joined_at,
    checkInTime: participation.checked_in_at,
    status: isCheckedIn ? 'checked_in' : 
             isRegistered ? 'registered' : 
             'not_registered'
  };
}

/**
 * Canonical function to update participant state optimistically
 */
export function updateParticipantStateOptimistically(
  participants: Array<{
    user_id: string;
    status_type: string;
    joined_at?: string;
    checked_in_at?: string;
  }>,
  userId: string,
  action: 'register' | 'checkin' | 'eliminate'
): Array<{
  user_id: string;
  status_type: string;
  joined_at?: string;
  checked_in_at?: string;
}> {
  const now = new Date().toISOString();
  
  // Remove existing participation for this user
  const filteredParticipants = participants.filter(p => p.user_id !== userId);
  
  if (action === 'register') {
    return [...filteredParticipants, {
      user_id: userId,
      status_type: 'confirmed',
      joined_at: now
    }];
  }
  
  if (action === 'checkin') {
    // Find existing registration or create new one
    const existing = participants.find(p => p.user_id === userId);
    return [...filteredParticipants, {
      user_id: userId,
      status_type: 'checked_in',
      joined_at: existing?.joined_at || now,
      checked_in_at: now
    }];
  }
  
  // For eliminate, just remove from participants
  return filteredParticipants;
}

/**
 * Centralized participant count calculation
 */
export function getParticipantCounts(
  participants: Array<{
    status_type: string;
  }>
) {
  const registered = participants.filter(p => 
    ['confirmed', 'checked_in'].includes(p.status_type)
  ).length;
  
  const checkedIn = participants.filter(p => 
    p.status_type === 'checked_in'
  ).length;
  
  return {
    registered,
    checkedIn,
    total: participants.length
  };
}
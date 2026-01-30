export type TournamentSize = 4 | 8 | 16 | 32 | 64 | 128;

export type TournamentStatus = 'Open' | 'Full' | 'InProgress' | 'Completed';

export type ParticipantStatus = 'Registered' | 'Invited' | 'CheckedIn' | 'Eliminated';

export interface TournamentParticipant {
  userId: string;
  displayName: string;
  status: ParticipantStatus;
  avatar?: string;
}

export interface TournamentRoundSchedule {
  round: number;
  roundName: string;
  dayISO: string;
  time: string;
}

export interface Tournament {
  id: string;
  name: string;
  startDateISO: string;
  startTime: string;
  maxParticipants: TournamentSize;
  schedulingMode: 'one-day' | 'multi-day';
  roundSchedules: TournamentRoundSchedule[];
  entryType: 'open' | 'invite';
  legsPerMatch: number;
  description?: string;
  createdByUserId: string;
  createdAtISO: string;
  participants: TournamentParticipant[];
  invitedEmails: string[];
  status: TournamentStatus;
  matches: any[];
}

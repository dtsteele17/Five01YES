'use client';

import { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { Tournament, TournamentParticipant, TournamentStatus } from '@/lib/types/tournament';
import { createClient } from '@/lib/supabase/client';
import { listTournaments, subscribeToTournaments, TournamentRow } from '@/lib/db/tournaments';

function convertTournamentRowToTournament(row: TournamentRow): Tournament {
  const statusMap: Record<string, TournamentStatus> = {
    'draft': 'Open',
    'scheduled': 'Open',
    'checkin': 'Open',
    'in_progress': 'InProgress',
    'completed': 'Completed',
    'cancelled': 'Completed',
  };

  const startDate = row.start_at ? new Date(row.start_at) : null;
  const startDateISO = startDate ? startDate.toISOString().split('T')[0] : '';
  const startTime = startDate ? startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '00:00';

  return {
    id: row.id,
    name: row.name,
    startDateISO: startDateISO,
    startTime: startTime,
    maxParticipants: row.max_participants as any,
    schedulingMode: row.round_scheduling === 'one_day' ? 'one-day' : 'multi-day',
    roundSchedules: [],
    entryType: row.entry_type === 'invite_only' ? 'invite' : 'open',
    legsPerMatch: row.legs_per_match,
    description: row.description || undefined,
    createdByUserId: row.owner_id,
    createdAtISO: row.created_at,
    participants: [],
    invitedEmails: [],
    status: statusMap[row.status.toLowerCase()] || 'Open',
    matches: [],
  };
}

interface TournamentsState {
  tournaments: Tournament[];
  currentUserId: string;
}

type TournamentsAction =
  | { type: 'SET_TOURNAMENTS'; payload: Tournament[] }
  | { type: 'SET_USER_ID'; payload: string }
  | { type: 'ADD_TOURNAMENT'; payload: Tournament }
  | { type: 'UPDATE_TOURNAMENT'; payload: { id: string; updates: Partial<Tournament> } }
  | { type: 'DELETE_TOURNAMENT'; payload: string }
  | { type: 'ADD_PARTICIPANT'; payload: { tournamentId: string; participant: TournamentParticipant } }
  | { type: 'UPDATE_PARTICIPANT_STATUS'; payload: { tournamentId: string; userId: string; status: TournamentParticipant['status'] } }
  | { type: 'ADD_INVITE'; payload: { tournamentId: string; email: string } };

function tournamentsReducer(state: TournamentsState, action: TournamentsAction): TournamentsState {
  console.log('TOURNAMENTS_REDUCER_ACTION', action.type);

  switch (action.type) {
    case 'SET_TOURNAMENTS':
      return { ...state, tournaments: action.payload };

    case 'SET_USER_ID':
      return { ...state, currentUserId: action.payload };

    case 'ADD_TOURNAMENT': {
      const existingIndex = state.tournaments.findIndex(t => t.id === action.payload.id);
      if (existingIndex >= 0) {
        console.warn('TOURNAMENT_ALREADY_EXISTS', action.payload.id);
        const updated = [...state.tournaments];
        updated[existingIndex] = action.payload;
        return { ...state, tournaments: updated };
      }
      return {
        ...state,
        tournaments: [action.payload, ...state.tournaments],
      };
    }

    case 'UPDATE_TOURNAMENT': {
      const tournaments = state.tournaments.map(tournament =>
        tournament.id === action.payload.id
          ? { ...tournament, ...action.payload.updates }
          : tournament
      );
      return { ...state, tournaments };
    }

    case 'DELETE_TOURNAMENT': {
      const tournaments = state.tournaments.filter(t => t.id !== action.payload);
      return { ...state, tournaments };
    }

    case 'ADD_PARTICIPANT': {
      const tournaments = state.tournaments.map(tournament => {
        if (tournament.id === action.payload.tournamentId) {
          const existingParticipant = tournament.participants.find(
            p => p.userId === action.payload.participant.userId
          );
          if (existingParticipant) {
            return tournament;
          }
          const newParticipants = [...tournament.participants, action.payload.participant];
          const newStatus = newParticipants.length >= tournament.maxParticipants ? 'Full' : tournament.status;
          return {
            ...tournament,
            participants: newParticipants,
            status: newStatus,
          };
        }
        return tournament;
      });
      return { ...state, tournaments };
    }

    case 'UPDATE_PARTICIPANT_STATUS': {
      const tournaments = state.tournaments.map(tournament => {
        if (tournament.id === action.payload.tournamentId) {
          const participants = tournament.participants.map(p =>
            p.userId === action.payload.userId
              ? { ...p, status: action.payload.status }
              : p
          );
          return { ...tournament, participants };
        }
        return tournament;
      });
      return { ...state, tournaments };
    }

    case 'ADD_INVITE': {
      const tournaments = state.tournaments.map(tournament => {
        if (tournament.id === action.payload.tournamentId) {
          if (tournament.invitedEmails.includes(action.payload.email)) {
            return tournament;
          }
          return {
            ...tournament,
            invitedEmails: [...tournament.invitedEmails, action.payload.email],
          };
        }
        return tournament;
      });
      return { ...state, tournaments };
    }

    default:
      return state;
  }
}

function getInitialState(): TournamentsState {
  if (typeof window === 'undefined') {
    return {
      tournaments: [],
      currentUserId: 'user-1',
    };
  }

  try {
    const stored = localStorage.getItem('five01_tournaments');
    if (stored) {
      const parsed = JSON.parse(stored);
      console.log('TOURNAMENTS_LOADED_FROM_LOCALSTORAGE', parsed.tournaments?.length || 0);
      return {
        tournaments: parsed.tournaments || [],
        currentUserId: parsed.currentUserId || 'user-1',
      };
    }
  } catch (error) {
    console.error('TOURNAMENTS_LOCALSTORAGE_LOAD_FAILED', error);
  }

  return {
    tournaments: [],
    currentUserId: 'user-1',
  };
}

interface TournamentsContextValue {
  state: TournamentsState;
  dispatch: React.Dispatch<TournamentsAction>;
  getTournament: (id: string) => Tournament | undefined;
}

const TournamentsContext = createContext<TournamentsContextValue | undefined>(undefined);

export function TournamentsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(tournamentsReducer, undefined, getInitialState);
  const supabase = createClient();

  useEffect(() => {
    console.log('TournamentsProvider mounted, loading from Supabase');

    async function loadFromSupabase() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          dispatch({ type: 'SET_USER_ID', payload: user.id });
        }

        const tournamentRows = await listTournaments();
        console.log('TOURNAMENTS_LOADED_FROM_SUPABASE', tournamentRows.length);
        const tournaments = tournamentRows.map(convertTournamentRowToTournament);
        dispatch({ type: 'SET_TOURNAMENTS', payload: tournaments });
      } catch (error) {
        console.error('FAILED_TO_LOAD_TOURNAMENTS_FROM_SUPABASE', error);
      }
    }

    loadFromSupabase();

    const unsubscribe = subscribeToTournaments((tournamentRow) => {
      console.log('TOURNAMENT_REALTIME_UPDATE', tournamentRow.id);
      const tournament = convertTournamentRowToTournament(tournamentRow);
      dispatch({ type: 'ADD_TOURNAMENT', payload: tournament });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    console.log('LOCALSTORAGE_TOURNAMENTS_SAVE', state.tournaments.length, 'tournaments');
    try {
      const dataToSave = {
        tournaments: state.tournaments,
        currentUserId: state.currentUserId,
      };
      localStorage.setItem('five01_tournaments', JSON.stringify(dataToSave));
    } catch (error) {
      console.error('LOCALSTORAGE_TOURNAMENTS_SAVE_FAILED', error);
    }
  }, [state.tournaments, state.currentUserId]);

  const getTournament = (id: string) => {
    console.log('GET_TOURNAMENT_CALLED', {
      requestedId: id,
      availableTournaments: state.tournaments.map(t => ({ id: t.id, name: t.name })),
    });
    const found = state.tournaments.find(tournament => tournament.id === id);
    console.log('GET_TOURNAMENT_RESULT', found ? { id: found.id, name: found.name } : 'NOT_FOUND');
    return found;
  };

  const value: TournamentsContextValue = {
    state,
    dispatch,
    getTournament,
  };

  return <TournamentsContext.Provider value={value}>{children}</TournamentsContext.Provider>;
}

export function useTournaments() {
  const context = useContext(TournamentsContext);
  if (!context) {
    throw new Error('useTournaments must be used within TournamentsProvider');
  }
  return context;
}

"use client";

import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';

export interface Player {
  id: string;
  displayName: string;
  role: 'Owner' | 'Admin' | 'Player';
  status: 'Active' | 'Banned';
  cameraRequiredAcknowledged: boolean;
  avatar?: string;
}

export interface Fixture {
  matchId: string;
  dateTime: Date;
  homePlayerId: string;
  awayPlayerId: string;
  status: 'Scheduled' | 'Completed';
  legsWonHome?: number;
  legsWonAway?: number;
  matchday?: number;
}

export interface Standing {
  playerId: string;
  played: number;
  won: number;
  lost: number;
  legDifference: number;
  points: number;
  form: ('W' | 'L')[];
}

export interface PlayerStats {
  playerId: string;
  matchesPlayed: number;
  average: number;
  checkoutPercentage: number;
  oneEighties: number;
  highestCheckout: number;
  wins: number;
  losses: number;
}

export interface LiveUpdate {
  id: string;
  authorId: string;
  timestamp: Date;
  message: string;
  upvotes: string[];
  downvotes: string[];
  notificationSent: boolean;
}

export interface League {
  id: string;
  name: string;
  maxParticipants: number;
  startDate: Date;
  matchDays: string[];
  matchTime: string;
  gamesPerDay: number;
  legsPerGame: number;
  access: 'invite' | 'open';
  cameraRequired: boolean;
  playoffs: boolean;
  players: Player[];
  fixtures: Fixture[];
  standings: Standing[];
  stats: PlayerStats[];
  liveUpdates: LiveUpdate[];
  invitedEmails: string[];
}

type LeaguesState = {
  leagues: League[];
  currentUserId: string;
};

type LeaguesAction =
  | { type: 'ADD_LEAGUE'; payload: League }
  | { type: 'UPDATE_LEAGUE'; payload: { id: string; updates: Partial<League> } }
  | { type: 'DELETE_LEAGUE'; payload: string }
  | { type: 'ADD_PLAYER'; payload: { leagueId: string; player: Player } }
  | { type: 'UPDATE_PLAYER'; payload: { leagueId: string; playerId: string; updates: Partial<Player> } }
  | { type: 'REMOVE_PLAYER'; payload: { leagueId: string; playerId: string } }
  | { type: 'ADD_LIVE_UPDATE'; payload: { leagueId: string; update: LiveUpdate } }
  | { type: 'TOGGLE_REACTION'; payload: { leagueId: string; updateId: string; userId: string; type: 'upvote' | 'downvote' } }
  | { type: 'ADD_INVITE'; payload: { leagueId: string; email: string } }
  | { type: 'UPDATE_FIXTURE'; payload: { leagueId: string; matchId: string; updates: Partial<Fixture> } };

const LeaguesContext = createContext<{
  state: LeaguesState;
  dispatch: React.Dispatch<LeaguesAction>;
  getLeague: (id: string) => League | undefined;
  isOwnerOrAdmin: (leagueId: string) => boolean;
} | undefined>(undefined);

function leaguesReducer(state: LeaguesState, action: LeaguesAction): LeaguesState {
  switch (action.type) {
    case 'ADD_LEAGUE':
      console.log('REDUCER_ADD_LEAGUE', {
        leagueId: action.payload.id,
        leagueName: action.payload.name,
        currentLeaguesCount: state.leagues.length,
      });
      const newState = {
        ...state,
        leagues: [...state.leagues, action.payload],
      };
      console.log('REDUCER_NEW_STATE', {
        leaguesCount: newState.leagues.length,
        leagueIds: newState.leagues.map(l => l.id),
      });
      return newState;

    case 'UPDATE_LEAGUE':
      return {
        ...state,
        leagues: state.leagues.map(league =>
          league.id === action.payload.id
            ? { ...league, ...action.payload.updates }
            : league
        ),
      };

    case 'DELETE_LEAGUE':
      return {
        ...state,
        leagues: state.leagues.filter(league => league.id !== action.payload),
      };

    case 'ADD_PLAYER':
      return {
        ...state,
        leagues: state.leagues.map(league =>
          league.id === action.payload.leagueId
            ? { ...league, players: [...league.players, action.payload.player] }
            : league
        ),
      };

    case 'UPDATE_PLAYER':
      return {
        ...state,
        leagues: state.leagues.map(league =>
          league.id === action.payload.leagueId
            ? {
                ...league,
                players: league.players.map(player =>
                  player.id === action.payload.playerId
                    ? { ...player, ...action.payload.updates }
                    : player
                ),
              }
            : league
        ),
      };

    case 'REMOVE_PLAYER':
      return {
        ...state,
        leagues: state.leagues.map(league =>
          league.id === action.payload.leagueId
            ? {
                ...league,
                players: league.players.filter(p => p.id !== action.payload.playerId),
              }
            : league
        ),
      };

    case 'ADD_LIVE_UPDATE':
      return {
        ...state,
        leagues: state.leagues.map(league =>
          league.id === action.payload.leagueId
            ? {
                ...league,
                liveUpdates: [action.payload.update, ...league.liveUpdates],
              }
            : league
        ),
      };

    case 'TOGGLE_REACTION':
      return {
        ...state,
        leagues: state.leagues.map(league =>
          league.id === action.payload.leagueId
            ? {
                ...league,
                liveUpdates: league.liveUpdates.map(update => {
                  if (update.id !== action.payload.updateId) return update;

                  const { userId, type } = action.payload;
                  const upvotes = [...update.upvotes];
                  const downvotes = [...update.downvotes];

                  if (type === 'upvote') {
                    const upvoteIndex = upvotes.indexOf(userId);
                    const downvoteIndex = downvotes.indexOf(userId);

                    if (upvoteIndex > -1) {
                      upvotes.splice(upvoteIndex, 1);
                    } else {
                      upvotes.push(userId);
                      if (downvoteIndex > -1) {
                        downvotes.splice(downvoteIndex, 1);
                      }
                    }
                  } else {
                    const downvoteIndex = downvotes.indexOf(userId);
                    const upvoteIndex = upvotes.indexOf(userId);

                    if (downvoteIndex > -1) {
                      downvotes.splice(downvoteIndex, 1);
                    } else {
                      downvotes.push(userId);
                      if (upvoteIndex > -1) {
                        upvotes.splice(upvoteIndex, 1);
                      }
                    }
                  }

                  return { ...update, upvotes, downvotes };
                }),
              }
            : league
        ),
      };

    case 'ADD_INVITE':
      return {
        ...state,
        leagues: state.leagues.map(league =>
          league.id === action.payload.leagueId
            ? {
                ...league,
                invitedEmails: [...league.invitedEmails, action.payload.email],
              }
            : league
        ),
      };

    case 'UPDATE_FIXTURE':
      return {
        ...state,
        leagues: state.leagues.map(league =>
          league.id === action.payload.leagueId
            ? {
                ...league,
                fixtures: league.fixtures.map(fixture =>
                  fixture.matchId === action.payload.matchId
                    ? { ...fixture, ...action.payload.updates }
                    : fixture
                ),
              }
            : league
        ),
      };

    default:
      return state;
  }
}

const getInitialState = (): LeaguesState => {
  if (typeof window === 'undefined') {
    return { leagues: [], currentUserId: 'user-1' };
  }

  try {
    const stored = localStorage.getItem('five01_leagues');
    if (stored) {
      const parsed = JSON.parse(stored);
      const hydratedLeagues = parsed.leagues.map((league: any) => ({
        ...league,
        startDate: new Date(league.startDate),
        fixtures: league.fixtures.map((f: any) => ({
          ...f,
          dateTime: new Date(f.dateTime),
        })),
        liveUpdates: league.liveUpdates.map((u: any) => ({
          ...u,
          timestamp: new Date(u.timestamp),
        })),
      }));

      console.log('LOADED_FROM_LOCALSTORAGE', hydratedLeagues.length, 'leagues');
      return { leagues: hydratedLeagues, currentUserId: 'user-1' };
    }
  } catch (error) {
    console.error('Failed to load leagues from localStorage:', error);
  }

  return { leagues: [], currentUserId: 'user-1' };
};

export function LeaguesProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(leaguesReducer, undefined, getInitialState);

  useEffect(() => {
    console.log('LeaguesProvider mounted');
  }, []);

  useEffect(() => {
    console.log('LOCALSTORAGE_SAVE_DISABLED_FOR_DEBUGGING', state.leagues.length, 'leagues');
    // TEMPORARILY DISABLED TO ISOLATE STACK OVERFLOW ISSUE
    // try {
    //   const dataToSave = {
    //     leagues: state.leagues,
    //     currentUserId: state.currentUserId,
    //   };
    //   console.log('SAVING_TO_LOCALSTORAGE', state.leagues.length, 'leagues');
    //   console.log('SERIALIZABLE_CHECK', JSON.stringify(dataToSave).length, 'chars');
    //   localStorage.setItem('five01_leagues', JSON.stringify(dataToSave));
    // } catch (error) {
    //   console.error('LOCALSTORAGE_SERIALIZE_FAILED', error);
    //   console.error('Failed to save leagues to localStorage:', error);
    // }
  }, [state.leagues, state.currentUserId]);

  const getLeague = (id: string) => {
    console.log('GET_LEAGUE_CALLED', {
      requestedId: id,
      availableLeagues: state.leagues.map(l => ({ id: l.id, name: l.name })),
    });
    const found = state.leagues.find(league => league.id === id);
    console.log('GET_LEAGUE_RESULT', found ? { id: found.id, name: found.name } : 'NOT_FOUND');
    return found;
  };

  const isOwnerOrAdmin = (leagueId: string) => {
    const league = getLeague(leagueId);
    if (!league) return false;

    const currentUserPlayer = league.players.find(p => p.id === state.currentUserId);
    return currentUserPlayer?.role === 'Owner' || currentUserPlayer?.role === 'Admin';
  };

  return (
    <LeaguesContext.Provider value={{ state, dispatch, getLeague, isOwnerOrAdmin }}>
      {children}
    </LeaguesContext.Provider>
  );
}

export function useLeagues() {
  const context = useContext(LeaguesContext);
  if (!context) {
    throw new Error('useLeagues must be used within a LeaguesProvider');
  }
  return context;
}

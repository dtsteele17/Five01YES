import { createClient } from '@/lib/supabase/client';

export interface CreateTournamentInput {
  name: string;
  startDate: string;
  startTime: string;
  maxParticipants: number;
  schedulingMode: 'one-day' | 'multi-day';
  entryType: 'open' | 'invite';
  legsPerMatch: number;
  description?: string;
  startingScore?: number;
  doubleOut?: boolean;
  straightIn?: boolean;
}

export interface TournamentFilters {
  status?: string;
  entryType?: string;
  maxParticipants?: number;
  createdBy?: string;
}

export interface TournamentRow {
  id: string;
  name: string;
  start_at: string | null;
  max_participants: number;
  round_scheduling: string;
  entry_type: string;
  legs_per_match: number;
  description: string | null;
  status: string;
  created_by: string;
  created_at: string;
  game_mode: number;
  double_out: boolean;
  match_format?: string;
  timezone?: string;
}

export async function createTournament(input: CreateTournamentInput) {
  const supabase = createClient();

  console.log('CREATE_TOURNAMENT_FUNCTION_CALLED', input);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('CREATE_TOURNAMENT_NO_USER');
    throw new Error('User must be authenticated to create tournaments');
  }

  console.log('CREATE_TOURNAMENT_USER_AUTHENTICATED', { userId: user.id });

  const startDateTime = new Date(`${input.startDate}T${input.startTime}`);
  console.log('CREATE_TOURNAMENT_DATE_PARSED', { 
    inputDate: input.startDate,
    inputTime: input.startTime,
    parsedDateTime: startDateTime.toISOString()
  });

  const tournamentData = {
    name: input.name,
    description: input.description || null,
    start_at: startDateTime.toISOString(),
    max_participants: input.maxParticipants,
    round_scheduling: input.schedulingMode === 'one-day' ? 'one_day' : 'multi_day',
    entry_type: input.entryType === 'invite' ? 'invite_only' : 'open',
    game_mode: input.startingScore || 501,
    legs_per_match: input.legsPerMatch,
    double_out: input.doubleOut ?? true,
    status: 'registration',
    created_by: user.id,
  };

  console.log('CREATE_TOURNAMENT_DATA_PREPARED', tournamentData);

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .insert(tournamentData)
    .select()
    .single();

  console.log('CREATE_TOURNAMENT_DB_RESPONSE', { 
    data: tournament, 
    error: tournamentError,
    expectedStatus: 'registration',
    actualStatus: tournament?.status
  });

  if (tournamentError) {
    console.error('CREATE_TOURNAMENT_ERROR:', {
      code: tournamentError.code,
      message: tournamentError.message,
      details: tournamentError.details,
      hint: tournamentError.hint,
      data: tournamentData
    });
    if (tournamentError.code === '42501') {
      throw new Error('Permission denied. Please check your authentication.');
    } else if (tournamentError.code === '23505') {
      throw new Error('A tournament with this information already exists.');
    } else if (tournamentError.code === '23514') {
      throw new Error('Invalid tournament data. Please check your inputs.');
    } else {
      throw new Error(tournamentError.message || 'Failed to create tournament');
    }
  }

  return tournament;
}

export async function joinTournament(tournamentId: string) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('User must be authenticated to join tournaments');
  }

  // Get tournament details and check eligibility
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, name, status, max_participants')
    .eq('id', tournamentId)
    .single();

  if (tournamentError || !tournament) {
    throw new Error('Tournament not found');
  }

  // Check if tournament is still accepting registrations
  if (tournament.status !== 'registration') {
    throw new Error('Tournament registration is closed');
  }

  // Check if user is already registered
  const { data: existingParticipation } = await supabase
    .from('tournament_participants')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('user_id', user.id)
    .single();

  if (existingParticipation) {
    throw new Error('You are already registered for this tournament');
  }

  // Check if tournament is full
  const { count: participantCount, error: countError } = await supabase
    .from('tournament_participants')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);

  if (countError) {
    throw new Error('Failed to check tournament capacity');
  }

  if (participantCount && participantCount >= tournament.max_participants) {
    throw new Error('Tournament is full');
  }

  // Register for tournament
  const { error } = await supabase
    .from('tournament_participants')
    .insert({
      tournament_id: tournamentId,
      user_id: user.id,
      role: 'participant',
      status_type: 'confirmed',
      joined_at: new Date().toISOString()
    });

  if (error) {
    if (error.code === '23505') {
      throw new Error('You are already registered for this tournament');
    }
    throw new Error(error.message || 'Failed to register for tournament');
  }
}

export async function listTournaments(filters?: TournamentFilters) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();

  let query = supabase
    .from('tournaments')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.entryType) {
    query = query.eq('entry_type', filters.entryType);
  }

  if (filters?.maxParticipants) {
    query = query.eq('max_participants', filters.maxParticipants);
  }

  if (filters?.createdBy) {
    query = query.eq('created_by', filters.createdBy);
  }

  const { data, error } = await query;

  if (error) {
    console.error('LIST_TOURNAMENTS_ERROR', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
    throw new Error(`Failed to fetch tournaments: ${error.message}`);
  }

  console.log('TOURNAMENTS_FETCHED_SUCCESS', {
    count: data?.length || 0,
    tournaments: data?.map(t => ({ id: t.id, name: t.name, status: t.status }))
  });

  return (data || []) as TournamentRow[];
}

export async function getTournament(id: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('GET_TOURNAMENT_ERROR', error);
    throw new Error(`Failed to fetch tournament: ${error.message}`);
  }

  return data as TournamentRow | null;
}

export async function getTournamentParticipants(tournamentId: string) {
  const supabase = createClient();

  console.log('FETCHING_TOURNAMENT_PARTICIPANTS', { tournamentId });

  const { data, error } = await supabase
    .from('tournament_participants')
    .select(`
      id,
      user_id,
      role,
      status_type,
      created_at,
      profiles:user_id (
        id,
        username,
        display_name,
        avatar_url
      )
    `)
    .eq('tournament_id', tournamentId);

  if (error) {
    console.error('GET_TOURNAMENT_PARTICIPANTS_ERROR', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      tournamentId
    });
    throw new Error(`Failed to fetch participants: ${error.message}`);
  }

  console.log('TOURNAMENT_PARTICIPANTS_FETCHED', {
    tournamentId,
    count: data?.length || 0,
    participants: data?.map(p => ({ userId: p.user_id, role: p.role }))
  });

  return data;
}

export function subscribeToTournaments(
  onChange: (tournament: TournamentRow) => void,
  filters?: TournamentFilters
) {
  const supabase = createClient();

  console.log('SUBSCRIBING_TO_TOURNAMENTS', { filters });

  let filterString = '';
  if (filters?.status) {
    filterString += `status=eq.${filters.status}`;
  }

  const channel = supabase
    .channel('tournaments_channel')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'tournaments',
        filter: filterString || undefined,
      },
      (payload) => {
        console.log('REALTIME_TOURNAMENT_INSERTED', {
          id: (payload.new as any).id,
          name: (payload.new as any).name,
          fullPayload: payload.new
        });
        onChange(payload.new as TournamentRow);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'tournaments',
        filter: filterString || undefined,
      },
      (payload) => {
        console.log('REALTIME_TOURNAMENT_UPDATED', {
          id: (payload.new as any).id,
          name: (payload.new as any).name
        });
        onChange(payload.new as TournamentRow);
      }
    )
    .subscribe((status) => {
      console.log('REALTIME_SUBSCRIPTION_STATUS', status);
    });

  console.log('REALTIME_CHANNEL_CREATED', channel);

  return () => {
    console.log('UNSUBSCRIBING_FROM_TOURNAMENTS');
    supabase.removeChannel(channel);
  };
}

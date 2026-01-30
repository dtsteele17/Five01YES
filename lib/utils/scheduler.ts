import { Player, Fixture, Standing, PlayerStats, LiveUpdate, League } from '../context/LeaguesContext';

const MOCK_NAMES = [
  'Alex Thompson', 'Jamie Wilson', 'Sam Parker', 'Chris Morgan',
  'Jordan Lee', 'Taylor Smith', 'Casey Johnson', 'Riley Brown',
  'Morgan Davis', 'Drew Martinez', 'Quinn Anderson', 'Avery White'
];

export function generateMockPlayers(creatorName: string = 'You', count: number = 8): Player[] {
  const players: Player[] = [
    {
      id: 'user-1',
      displayName: creatorName,
      role: 'Owner',
      status: 'Active',
      cameraRequiredAcknowledged: true,
    },
  ];

  for (let i = 1; i < count && i < MOCK_NAMES.length + 1; i++) {
    players.push({
      id: `player-${i + 1}`,
      displayName: MOCK_NAMES[i - 1],
      role: 'Player',
      status: 'Active',
      cameraRequiredAcknowledged: Math.random() > 0.2,
    });
  }

  return players;
}

function getNextMatchDate(
  startDate: Date,
  matchDays: string[],
  weekOffset: number = 0
): Date {
  if (matchDays.length === 0) {
    console.error('SCHEDULER_ERROR: matchDays is empty, returning startDate');
    return new Date(startDate);
  }

  if (weekOffset > 52) {
    console.error('SCHEDULER_ERROR: infinite recursion detected in getNextMatchDate');
    return new Date(startDate);
  }

  const dayMap: { [key: string]: number } = {
    'Sunday': 0,
    'Monday': 1,
    'Tuesday': 2,
    'Wednesday': 3,
    'Thursday': 4,
    'Friday': 5,
    'Saturday': 6,
  };

  const targetDays = matchDays.map(day => dayMap[day]).filter(d => d !== undefined).sort((a, b) => a - b);

  if (targetDays.length === 0) {
    console.error('SCHEDULER_ERROR: no valid match days found, returning startDate');
    return new Date(startDate);
  }

  const date = new Date(startDate);
  date.setDate(date.getDate() + (weekOffset * 7));

  for (const targetDay of targetDays) {
    const daysUntilTarget = (targetDay - date.getDay() + 7) % 7;
    if (daysUntilTarget >= 0) {
      const matchDate = new Date(date);
      matchDate.setDate(date.getDate() + daysUntilTarget);
      return matchDate;
    }
  }

  date.setDate(date.getDate() + 7);
  return getNextMatchDate(date, matchDays, 0);
}

export function generateFixtures(
  players: Player[],
  startDate: Date,
  matchDays: string[],
  matchTime: string,
  gamesPerDay: number,
  legsPerGame: number
): Fixture[] {
  console.log('GENERATE_FIXTURES_START', {
    playersCount: players.length,
    matchDays,
    gamesPerDay,
    legsPerGame
  });

  const fixtures: Fixture[] = [];
  const activePlayers = players.filter(p => p.status === 'Active');

  if (activePlayers.length < 2) {
    console.log('GENERATE_FIXTURES_SKIP: Less than 2 active players');
    return fixtures;
  }

  const matchups: [string, string][] = [];
  for (let i = 0; i < activePlayers.length; i++) {
    for (let j = i + 1; j < activePlayers.length; j++) {
      matchups.push([activePlayers[i].id, activePlayers[j].id]);
      matchups.push([activePlayers[j].id, activePlayers[i].id]);
    }
  }

  const maxFixtures = Math.min(matchups.length, 500);
  console.log('GENERATE_FIXTURES_LIMITS', { totalMatchups: matchups.length, maxFixtures });

  let currentDate = new Date(startDate);
  const [hours, minutes] = matchTime.split(':').map(Number);
  let matchday = 1;
  let gamesScheduledToday = 0;

  for (let i = 0; i < maxFixtures; i++) {
    if (gamesScheduledToday >= gamesPerDay) {
      currentDate = getNextMatchDate(currentDate, matchDays, 1);
      gamesScheduledToday = 0;
      matchday++;
    }

    const matchDate = new Date(currentDate);
    matchDate.setHours(hours, minutes, 0, 0);

    const isCompleted = Math.random() < 0.3 && i < 10;
    const homeLegs = isCompleted ? Math.floor(Math.random() * (legsPerGame + 1)) : undefined;
    const awayLegs = isCompleted && homeLegs !== undefined ? legsPerGame - homeLegs : undefined;

    fixtures.push({
      matchId: `match-${i + 1}`,
      dateTime: matchDate,
      homePlayerId: matchups[i][0],
      awayPlayerId: matchups[i][1],
      status: isCompleted ? 'Completed' : 'Scheduled',
      legsWonHome: homeLegs,
      legsWonAway: awayLegs,
      matchday,
    });

    gamesScheduledToday++;
  }

  console.log('GENERATE_FIXTURES_COMPLETE', { fixturesCount: fixtures.length });
  return fixtures;
}

export function generateStandings(players: Player[], fixtures: Fixture[]): Standing[] {
  console.log('GENERATE_STANDINGS_START', { playersCount: players.length, fixturesCount: fixtures.length });
  const standingsMap = new Map<string, Standing>();

  players.forEach(player => {
    standingsMap.set(player.id, {
      playerId: player.id,
      played: 0,
      won: 0,
      lost: 0,
      legDifference: 0,
      points: 0,
      form: [],
    });
  });

  const completedFixtures = fixtures.filter(f => f.status === 'Completed');

  completedFixtures.forEach(fixture => {
    const homeStanding = standingsMap.get(fixture.homePlayerId);
    const awayStanding = standingsMap.get(fixture.awayPlayerId);

    if (!homeStanding || !awayStanding) return;
    if (fixture.legsWonHome === undefined || fixture.legsWonAway === undefined) return;

    homeStanding.played++;
    awayStanding.played++;

    homeStanding.legDifference += fixture.legsWonHome - fixture.legsWonAway;
    awayStanding.legDifference += fixture.legsWonAway - fixture.legsWonHome;

    if (fixture.legsWonHome > fixture.legsWonAway) {
      homeStanding.won++;
      homeStanding.points += 2;
      homeStanding.form.unshift('W');
      awayStanding.lost++;
      awayStanding.form.unshift('L');
    } else {
      awayStanding.won++;
      awayStanding.points += 2;
      awayStanding.form.unshift('W');
      homeStanding.lost++;
      homeStanding.form.unshift('L');
    }

    if (homeStanding.form.length > 5) homeStanding.form.pop();
    if (awayStanding.form.length > 5) awayStanding.form.pop();
  });

  const result = Array.from(standingsMap.values())
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.legDifference !== a.legDifference) return b.legDifference - a.legDifference;
      return b.won - a.won;
    });

  console.log('GENERATE_STANDINGS_COMPLETE', { standingsCount: result.length });
  return result;
}

export function generatePlayerStats(players: Player[], fixtures: Fixture[]): PlayerStats[] {
  console.log('GENERATE_PLAYER_STATS_START', { playersCount: players.length, fixturesCount: fixtures.length });
  const stats: PlayerStats[] = [];

  players.forEach(player => {
    const playerFixtures = fixtures.filter(
      f => f.status === 'Completed' && (f.homePlayerId === player.id || f.awayPlayerId === player.id)
    );

    const wins = playerFixtures.filter(f => {
      if (f.legsWonHome === undefined || f.legsWonAway === undefined) return false;
      return (f.homePlayerId === player.id && f.legsWonHome > f.legsWonAway) ||
             (f.awayPlayerId === player.id && f.legsWonAway > f.legsWonHome);
    }).length;

    stats.push({
      playerId: player.id,
      matchesPlayed: playerFixtures.length,
      average: Math.floor(Math.random() * 30) + 60,
      checkoutPercentage: Math.floor(Math.random() * 30) + 25,
      oneEighties: Math.floor(Math.random() * 15),
      highestCheckout: [170, 164, 161, 156, 150, 141, 138, 132, 127, 121][Math.floor(Math.random() * 10)],
      wins,
      losses: playerFixtures.length - wins,
    });
  });

  const result = stats.sort((a, b) => b.average - a.average);
  console.log('GENERATE_PLAYER_STATS_COMPLETE', { statsCount: result.length });
  return result;
}

export function generateInitialUpdates(ownerId: string): LiveUpdate[] {
  console.log('GENERATE_INITIAL_UPDATES_START', { ownerId });
  const result = [
    {
      id: 'update-1',
      authorId: ownerId,
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      message: 'Welcome to the league! Looking forward to some great matches. Please make sure to check the fixtures and mark your calendars.',
      upvotes: [],
      downvotes: [],
      notificationSent: true,
    },
  ];
  console.log('GENERATE_INITIAL_UPDATES_COMPLETE', { updatesCount: result.length });
  return result;
}

export function createLeagueFromSettings(
  id: string,
  name: string,
  maxParticipants: number,
  startDate: Date,
  matchDays: string[],
  matchTime: string,
  gamesPerDay: number,
  legsPerGame: number,
  access: 'invite' | 'open',
  cameraRequired: boolean,
  playoffs: boolean
): League {
  const players = generateMockPlayers('You', 8);
  const fixtures = generateFixtures(players, startDate, matchDays, matchTime, gamesPerDay, legsPerGame);
  const standings = generateStandings(players, fixtures);
  const stats = generatePlayerStats(players, fixtures);
  const liveUpdates = generateInitialUpdates(players[0].id);

  const league: League = {
    id,
    name,
    maxParticipants,
    startDate,
    matchDays,
    matchTime,
    gamesPerDay,
    legsPerGame,
    access,
    cameraRequired,
    playoffs,
    players,
    fixtures,
    standings,
    stats,
    liveUpdates,
    invitedEmails: [],
  };

  console.log('CREATED_LEAGUE_SERIALIZABLE_CHECK', {
    id: league.id,
    playersCount: league.players.length,
    fixturesCount: league.fixtures.length,
    fixturesSample: league.fixtures[0],
  });

  return league;
}

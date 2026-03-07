// FIFA-STYLE CAREER HOME PAGE UPDATES
// This file contains the updates needed for app/app/career/page.tsx

// 1. Add these new state variables (around line 100)
const newStateVariables = `
  // FIFA-style career state
  const [leagueStandings, setLeagueStandings] = useState<any[]>([]);
  const [sponsorOffers, setSponsorOffers] = useState<any>(null);
  const [thirdSeasonRule, setThirdSeasonRule] = useState<boolean>(false);
  const [pendingEmails, setPendingEmails] = useState<any[]>([]);
`;

// 2. Update the loadCareer function to load FIFA-style data (around line 150)
const loadCareerUpdate = `
async function loadCareer() {
  if (!careerId) return;
  
  setLoading(true);
  try {
    const supabase = createClient();
    
    // Load career home data
    const { data: homeData, error } = await supabase.rpc('rpc_get_career_home_with_season_end_locked_fixed', {
      p_career_id: careerId
    });
    
    if (error) throw error;
    setData(homeData);

    // Load FIFA-style league standings if Tier 2+
    if (homeData?.career?.tier >= 2) {
      const { data: standingsData, error: standingsError } = await supabase
        .from('career_league_standings')
        .select(\`
          *, 
          career_opponents(first_name, last_name, hometown, skill_rating)
        \`)
        .eq('career_id', careerId)
        .eq('season', homeData.career.season)
        .eq('tier', homeData.career.tier)
        .order('points', { ascending: false })
        .order('wins', { ascending: false });
        
      if (!standingsError) {
        setLeagueStandings(standingsData || []);
      }
    }

    // Load FIFA-style emails/notifications
    const { data: emailsData, error: emailsError } = await supabase
      .from('career_emails')
      .select('*')
      .eq('career_id', careerId)
      .eq('is_read', false)
      .order('sent_at', { ascending: false })
      .limit(5);
      
    if (!emailsError) {
      setPendingEmails(emailsData || []);
    }

    // Check for sponsor offers if Tier 3+
    if (homeData?.career?.tier >= 3 && !homeData?.career?.current_sponsor_id) {
      // This would be triggered by completing tournaments or win streaks
      // Implementation depends on when sponsor offers are shown
    }

    // Check third season rule
    if (homeData?.career?.tier === 2 && homeData?.career?.consecutive_seasons_in_tier2 >= 2) {
      setThirdSeasonRule(true);
    }

  } catch (err: any) {
    toast.error(err.message || 'Failed to load career');
  } finally {
    setLoading(false);
  }
}
`;

// 3. Add FIFA-style league standings component (around line 800)
const leagueStandingsComponent = `
{/* FIFA-style League Standings - Tier 2+ */}
{data?.career?.tier >= 2 && leagueStandings.length > 0 && (
  <Card className="bg-slate-800/30 border-white/10 p-6">
    <div className="flex items-center gap-2 mb-4">
      <Table2 className="w-5 h-5 text-blue-400" />
      <h3 className="text-lg font-bold text-white">
        {data.career.tier === 2 ? 'Pub League' : 'County League'} Table
      </h3>
      <Badge variant="outline" className="text-xs">
        Season {data.career.season}
      </Badge>
    </div>
    
    <div className="space-y-2">
      <div className="grid grid-cols-6 gap-2 text-xs text-slate-400 font-medium">
        <div>Pos</div>
        <div className="col-span-2">Player</div>
        <div>P</div>
        <div>W-L</div>
        <div>Pts</div>
      </div>
      
      {leagueStandings.map((team, index) => {
        const isPlayer = team.is_player;
        const playerName = isPlayer ? 'You' : 
          \`\${team.career_opponents?.first_name || ''} \${team.career_opponents?.last_name || ''}\`.trim() || 
          'Unknown Player';
        const isPromotionZone = data.career.tier === 2 && index < 2;
        const isRelegationZone = data.career.tier === 3 && index >= 10;
        
        return (
          <div 
            key={team.id}
            className={\`grid grid-cols-6 gap-2 py-2 px-3 rounded-lg \${
              isPlayer ? 'bg-amber-500/20 border border-amber-500/30' : 
              isPromotionZone ? 'bg-green-500/10' : 
              isRelegationZone ? 'bg-red-500/10' : 'bg-slate-800/20'
            }\`}
          >
            <div className={\`text-sm font-bold \${isPlayer ? 'text-amber-400' : 'text-white'}\`}>
              {index + 1}
            </div>
            <div className={\`col-span-2 text-sm \${isPlayer ? 'text-amber-400 font-bold' : 'text-white'}\`}>
              {playerName}
              {isPlayer && (
                <span className="text-xs text-amber-300 ml-1">(You)</span>
              )}
            </div>
            <div className="text-sm text-slate-300">{team.played}</div>
            <div className="text-sm text-slate-300">{team.wins}-{team.losses}</div>
            <div className={\`text-sm font-bold \${isPlayer ? 'text-amber-400' : 'text-white'}\`}>
              {team.points}
            </div>
          </div>
        );
      })}
    </div>
    
    {/* FIFA-style Position Indicators */}
    <div className="mt-4 flex flex-wrap gap-2 text-xs">
      {data.career.tier === 2 && (
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-500/20 border border-green-500/50 rounded"></div>
          <span className="text-green-400">Promotion to County League</span>
        </div>
      )}
      {data.career.tier === 3 && (
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-500/20 border border-red-500/50 rounded"></div>
          <span className="text-red-400">Relegation to Pub League</span>
        </div>
      )}
    </div>
  </Card>
)}
`;

// 4. Add FIFA-style emails/notifications panel (around line 900)
const emailsComponent = `
{/* FIFA-style Emails/Notifications */}
{pendingEmails.length > 0 && (
  <Card className="bg-slate-800/30 border-white/10 p-6">
    <div className="flex items-center gap-2 mb-4">
      <Mail className="w-5 h-5 text-blue-400" />
      <h3 className="text-lg font-bold text-white">Messages</h3>
      <Badge className="bg-red-500 text-white text-xs">
        {pendingEmails.length}
      </Badge>
    </div>
    
    <div className="space-y-3">
      {pendingEmails.slice(0, 3).map((email) => (
        <div 
          key={email.id}
          className="bg-slate-900/50 border border-white/10 rounded-lg p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-bold text-white text-sm">{email.subject}</h4>
            <Badge variant="outline" className="text-xs">
              {email.email_type}
            </Badge>
          </div>
          <p className="text-slate-300 text-sm">{email.body}</p>
        </div>
      ))}
      
      {pendingEmails.length > 3 && (
        <div className="text-center">
          <Button variant="ghost" size="sm" className="text-slate-400">
            View All ({pendingEmails.length} total)
          </Button>
        </div>
      )}
    </div>
  </Card>
)}
`;

// 5. Add sponsor display for Tier 3+ (around line 600)
const sponsorComponent = `
{/* Current Sponsor Display - Tier 3+ */}
{data?.career?.tier >= 3 && data?.career?.current_sponsor_id && (
  <Card className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/30 p-4">
    <div className="flex items-center gap-3">
      <Award className="w-6 h-6 text-purple-400" />
      <div>
        <h3 className="font-bold text-white">Current Sponsor</h3>
        <p className="text-purple-300 text-sm">
          {/* This would show the sponsor name from the sponsor data */}
          Contract Active • +REP Bonus
        </p>
      </div>
    </div>
  </Card>
)}
`;

// 6. Update the handlePlayEvent function for FIFA-style flow (around line 400)
const handlePlayEventUpdate = `
async function handlePlayEvent() {
  if (!careerId || !data?.next_event || playingEvent) return;
  setPlayingEvent(true);
  
  try {
    const { next_event } = data;
    
    // For Tier 2+ league matches, go to weekly fixtures page first (FIFA-style)
    if (data.career.tier >= 2 && next_event.event_type === 'league') {
      router.push(\`/app/career/week/\${careerId}?careerId=\${careerId}\`);
      return;
    }

    // Tournament choice - let user pick between tournaments or decline
    if (next_event.event_type === 'tournament_choice') {
      router.push(\`/app/career/tournament-choice?careerId=\${careerId}&eventId=\${next_event.id}\`);
      return;
    }

    // Sponsor offers (Tier 3+)
    if (sponsorOffers) {
      // Show sponsor choice modal/page
      // Implementation depends on UI design
      return;
    }

    // Tournament brackets
    const bracketTypes = ['open', 'qualifier', 'trial_tournament', 'major', 'season_finals'];
    if (bracketTypes.includes(next_event.event_type) && next_event.bracket_size) {
      router.push(\`/app/career/bracket?careerId=\${careerId}&eventId=\${next_event.id}\`);
      return;
    }

    // Direct training/single matches
    if (next_event.event_type === 'training') {
      router.push(\`/app/career/training?careerId=\${careerId}\`);
      return;
    }

    // Default: Use the original career play function
    const supabase = createClient();
    const { data: matchData, error } = await supabase.rpc('rpc_career_play_next_event_locked_fixed', { 
      p_career_id: careerId 
    });
    
    if (error) throw error;
    if (matchData?.error) throw new Error(matchData.error);

    // Launch match with career context
    const config = {
      mode: '501',
      botDifficulty: 'amateur',
      botAverage: 50,
      doubleOut: true,
      bestOf: 'best-of-3',
      atcOpponent: 'bot',
      career: {
        careerId,
        eventId: matchData.event?.id,
        eventName: matchData.event?.name,
        matchId: matchData.match_id,
        opponentId: matchData.opponent?.id,
        opponentName: matchData.opponent?.name
      },
    };

    sessionStorage.setItem('game_config', JSON.stringify(config));
    router.push('/app/play/training/501');
    
  } catch (err: any) {
    toast.error(err.message || 'Failed to start event');
  } finally {
    setPlayingEvent(false);
  }
}
`;

// Export all components for reference
console.log(\`
FIFA-STYLE CAREER HOME UPDATE INSTRUCTIONS:

1. Add new state variables at the top of the component
2. Replace loadCareer function with the updated version
3. Add league standings component to the main grid layout
4. Add emails/notifications component below other cards
5. Add sponsor component for Tier 3+ careers
6. Update handlePlayEvent function with FIFA-style routing

These changes will display:
✅ FIFA-style league table with positions
✅ Email notifications system
✅ Current sponsor display
✅ Proper routing for weekly fixtures
✅ Tournament choice handling
✅ Third season special rule awareness
\`);

module.exports = {
  newStateVariables,
  loadCareerUpdate,
  leagueStandingsComponent, 
  emailsComponent,
  sponsorComponent,
  handlePlayEventUpdate
};
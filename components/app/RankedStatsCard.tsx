'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Shield, TrendingUp, Trophy, ArrowUp, ArrowDown, Minus, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getRankImageUrl } from '@/lib/rank-badge-helpers';

interface RankedMatch {
  id: string;
  season_id: string;
  match_room_id: string;
  player1_id: string;
  player2_id: string;
  winner_id: string | null;
  p1_start_rp: number;
  p2_start_rp: number;
  p1_delta: number | null;
  p2_delta: number | null;
  legs_p1: number | null;
  legs_p2: number | null;
  status: string;
  created_at: string;
  completed_at: string | null;
}

interface RatingHistory {
  id: number;
  rp_before: number;
  rp_after: number;
  delta: number;
  created_at: string;
}

interface Profile {
  id: string;
  username: string;
}

interface MatchDetails {
  match: RankedMatch;
  player1Username: string;
  player2Username: string;
}

interface RankedPlayerState {
  season_id: string;
  player_id: string;
  rp: number;
  mmr: number;
  games_played: number;
  wins: number;
  losses: number;
  provisional_games_remaining: number;
  division_name: string;
}

export function RankedStatsCard() {
  const [activeTab, setActiveTab] = useState('history');
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<RankedMatch[]>([]);
  const [ratingHistory, setRatingHistory] = useState<RatingHistory[]>([]);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<MatchDetails | null>(null);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [rankedState, setRankedState] = useState<RankedPlayerState | null>(null);

  const supabase = createClient();

  useEffect(() => {
    fetchRankedData();
  }, []);

  async function fetchRankedData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setCurrentUserId(user.id);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, user_id')
        .eq('user_id', user.id)
        .single();

      if (!profileData) return;

      const myProfileId = profileData.id;

      const { data: seasonData } = await supabase.rpc('rpc_ranked_get_my_state');

      if (!seasonData || !seasonData.season) {
        setLoading(false);
        return;
      }

      const activeSeasonId = seasonData.season.id;

      if (seasonData.player_state) {
        setRankedState(seasonData.player_state);
      }

      const { data: matchesData } = await supabase
        .from('ranked_matches')
        .select('*')
        .eq('season_id', activeSeasonId)
        .or(`player1_id.eq.${myProfileId},player2_id.eq.${myProfileId}`)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(20);

      if (matchesData) {
        setMatches(matchesData);

        const playerIds = new Set<string>();
        matchesData.forEach((match) => {
          playerIds.add(match.player1_id);
          playerIds.add(match.player2_id);
        });

        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', Array.from(playerIds));

        if (profilesData) {
          const profileMap = new Map<string, string>();
          profilesData.forEach((p: Profile) => {
            profileMap.set(p.id, p.username);
          });
          setProfiles(profileMap);
        }
      }

      const { data: historyData } = await supabase
        .from('ranked_rating_history')
        .select('id, rp_before, rp_after, delta, created_at')
        .eq('season_id', activeSeasonId)
        .eq('player_id', myProfileId)
        .order('created_at', { ascending: true })
        .limit(50);

      if (historyData) {
        setRatingHistory(historyData);
      }
    } catch (error) {
      console.error('Error fetching ranked data:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleMatchClick = (match: RankedMatch) => {
    const player1Username = profiles.get(match.player1_id) || 'Unknown';
    const player2Username = profiles.get(match.player2_id) || 'Unknown';
    setSelectedMatch({ match, player1Username, player2Username });
    setShowMatchModal(true);
  };

  const getTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const chartData = ratingHistory.map((entry) => ({
    rp: entry.rp_after,
    timestamp: new Date(entry.created_at).getTime(),
  }));

  if (loading) {
    return (
      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
        </div>
      </Card>
    );
  }

  if (matches.length === 0 && ratingHistory.length === 0) {
    return (
      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <Shield className="w-6 h-6 text-amber-500" />
          <h2 className="text-xl font-bold text-white">Ranked</h2>
        </div>
        <div className="py-12 text-center">
          <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-amber-500" />
          </div>
          <p className="text-gray-400 mb-2">No ranked matches yet</p>
          <p className="text-gray-500 text-sm">Play ranked matches to track your progress</p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <Shield className="w-6 h-6 text-amber-500" />
          <h2 className="text-xl font-bold text-white">Ranked</h2>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-slate-800/50 w-full grid grid-cols-2 mb-6">
            <TabsTrigger value="history" className="data-[state=active]:bg-amber-500">
              History
            </TabsTrigger>
            <TabsTrigger value="progress" className="data-[state=active]:bg-amber-500">
              Progress
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="space-y-3">
            {matches.length === 0 ? (
              <div className="py-8 text-center text-gray-400">
                No match history yet
              </div>
            ) : (
              matches.map((match) => {
                const myProfileId = currentUserId;
                if (!myProfileId) return null;

                const amIPlayer1 = match.player1_id === myProfileId;
                const won = match.winner_id === (amIPlayer1 ? match.player1_id : match.player2_id);
                const opponentId = amIPlayer1 ? match.player2_id : match.player1_id;
                const opponentUsername = profiles.get(opponentId) || 'Unknown';
                const myDelta = amIPlayer1 ? match.p1_delta : match.p2_delta;
                const scoreline = amIPlayer1
                  ? `${match.legs_p1 || 0}-${match.legs_p2 || 0}`
                  : `${match.legs_p2 || 0}-${match.legs_p1 || 0}`;

                return (
                  <div
                    key={match.id}
                    onClick={() => handleMatchClick(match)}
                    className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all hover:border-amber-500/50 ${
                      won
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-red-500/10 border-red-500/30'
                    }`}
                  >
                    <div className="flex items-center space-x-4">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold ${
                          won
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {won ? 'W' : 'L'}
                      </div>
                      <div>
                        <p className="text-white font-medium">vs {opponentUsername}</p>
                        <div className="flex items-center space-x-2 text-sm">
                          <span className="text-gray-400">{scoreline}</span>
                          <span className="text-gray-600">•</span>
                          <span className="text-gray-500">{getTimeAgo(match.created_at)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`flex items-center justify-end font-bold ${
                        (myDelta || 0) > 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {(myDelta || 0) > 0 ? (
                          <ArrowUp className="w-4 h-4 mr-1" />
                        ) : (myDelta || 0) < 0 ? (
                          <ArrowDown className="w-4 h-4 mr-1" />
                        ) : (
                          <Minus className="w-4 h-4 mr-1" />
                        )}
                        {Math.abs(myDelta || 0)} RP
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="progress">
            {ratingHistory.length === 0 ? (
              <div className="py-8 text-center text-gray-400">
                No rating history yet
              </div>
            ) : (
              <div className="space-y-6">
                {rankedState && rankedState.provisional_games_remaining > 0 && (
                  <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-800 flex-shrink-0 flex items-center justify-center">
                        <img 
                          src={getRankImageUrl(rankedState.division_name)} 
                          alt={rankedState.division_name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                      <div>
                        <p className="text-white font-medium text-sm">
                          Placements: {10 - rankedState.provisional_games_remaining}/10 complete
                        </p>
                        <p className="text-gray-300 text-xs mt-1">
                          Your rank will be finalized after completing all placement matches.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {rankedState && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-800/50 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <div className="w-5 h-5 rounded overflow-hidden bg-slate-700 flex items-center justify-center">
                          <img 
                            src={getRankImageUrl(rankedState.division_name)} 
                            alt={rankedState.division_name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </div>
                        <p className="text-gray-400 text-xs">Current Rank</p>
                      </div>
                      <p className="text-white font-bold text-xl">{rankedState.rp} <span className="text-sm text-gray-400">RP</span></p>
                      <p className="text-gray-500 text-xs mt-1">{rankedState.division_name}</p>
                    </div>

                    <div className="bg-slate-800/50 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                        <p className="text-gray-400 text-xs">Season W/L</p>
                      </div>
                      <p className="text-white font-bold text-2xl">
                        {rankedState.wins}-{rankedState.losses}
                      </p>
                      <p className="text-gray-500 text-xs mt-1">
                        {rankedState.games_played > 0
                          ? `${((rankedState.wins / rankedState.games_played) * 100).toFixed(0)}% WR`
                          : '0% WR'}
                      </p>
                    </div>

                    <div className="bg-slate-800/50 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <Shield className="w-4 h-4 text-blue-500" />
                        <p className="text-gray-400 text-xs">Games Played</p>
                      </div>
                      <p className="text-white font-bold text-2xl">{rankedState.games_played}</p>
                      <p className="text-gray-500 text-xs mt-1">This season</p>
                    </div>

                    <div className="bg-slate-800/50 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <Shield className="w-4 h-4 text-purple-500" />
                        <p className="text-gray-400 text-xs">Placements</p>
                      </div>
                      <p className="text-white font-bold text-2xl">
                        {10 - rankedState.provisional_games_remaining}/10
                      </p>
                      <p className="text-gray-500 text-xs mt-1">
                        {rankedState.provisional_games_remaining > 0 ? 'In progress' : 'Complete'}
                      </p>
                    </div>
                  </div>
                )}

                <div className="bg-slate-800/50 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-400 mb-4">Rating Progress</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={(timestamp) => new Date(timestamp).toLocaleDateString()}
                        stroke="#9CA3AF"
                        style={{ fontSize: '12px' }}
                      />
                      <YAxis
                        stroke="#9CA3AF"
                        style={{ fontSize: '12px' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1E293B',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: '#F3F4F6' }}
                        itemStyle={{ color: '#10B981' }}
                        formatter={(value: number) => [`${value} RP`, 'Rating']}
                        labelFormatter={(timestamp: number) => new Date(timestamp).toLocaleString()}
                      />
                      <Line
                        type="monotone"
                        dataKey="rp"
                        stroke="#10B981"
                        strokeWidth={2}
                        dot={{ fill: '#10B981', r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Recent Changes</h3>
                  <div className="space-y-2">
                    {ratingHistory.slice(-10).reverse().map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`flex items-center font-bold ${
                            entry.delta > 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}>
                            {entry.delta > 0 ? (
                              <ArrowUp className="w-4 h-4 mr-1" />
                            ) : (
                              <ArrowDown className="w-4 h-4 mr-1" />
                            )}
                            {Math.abs(entry.delta)}
                          </div>
                          <span className="text-gray-400 text-sm">
                            {entry.rp_before} → {entry.rp_after} RP
                          </span>
                        </div>
                        <span className="text-gray-500 text-sm">
                          {getTimeAgo(entry.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>

      <Dialog open={showMatchModal} onOpenChange={setShowMatchModal}>
        <DialogContent className="bg-slate-900 border-amber-500/30 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Match Details</DialogTitle>
          </DialogHeader>

          {selectedMatch && (
            <div className="space-y-4">
              <div className="flex items-center justify-center space-x-4 py-4">
                <div className="text-center">
                  <p className="text-white font-bold text-lg mb-1">
                    {selectedMatch.player1Username}
                  </p>
                  <Badge className={
                    selectedMatch.match.winner_id === selectedMatch.match.player1_id
                      ? 'bg-emerald-500 text-white'
                      : 'bg-gray-600 text-white'
                  }>
                    {selectedMatch.match.winner_id === selectedMatch.match.player1_id ? 'Winner' : 'Loser'}
                  </Badge>
                </div>

                <div className="text-3xl font-bold text-amber-500">
                  {selectedMatch.match.legs_p1 || 0} - {selectedMatch.match.legs_p2 || 0}
                </div>

                <div className="text-center">
                  <p className="text-white font-bold text-lg mb-1">
                    {selectedMatch.player2Username}
                  </p>
                  <Badge className={
                    selectedMatch.match.winner_id === selectedMatch.match.player2_id
                      ? 'bg-emerald-500 text-white'
                      : 'bg-gray-600 text-white'
                  }>
                    {selectedMatch.match.winner_id === selectedMatch.match.player2_id ? 'Winner' : 'Loser'}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-slate-800/50 border-white/10 p-4">
                  <p className="text-gray-400 text-sm mb-2">Starting RP</p>
                  <p className="text-white font-bold text-xl">{selectedMatch.match.p1_start_rp}</p>
                  <div className={`flex items-center mt-2 font-bold ${
                    (selectedMatch.match.p1_delta || 0) > 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {(selectedMatch.match.p1_delta || 0) > 0 ? (
                      <ArrowUp className="w-4 h-4 mr-1" />
                    ) : (
                      <ArrowDown className="w-4 h-4 mr-1" />
                    )}
                    {Math.abs(selectedMatch.match.p1_delta || 0)} RP
                  </div>
                </Card>

                <Card className="bg-slate-800/50 border-white/10 p-4">
                  <p className="text-gray-400 text-sm mb-2">Starting RP</p>
                  <p className="text-white font-bold text-xl">{selectedMatch.match.p2_start_rp}</p>
                  <div className={`flex items-center mt-2 font-bold ${
                    (selectedMatch.match.p2_delta || 0) > 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {(selectedMatch.match.p2_delta || 0) > 0 ? (
                      <ArrowUp className="w-4 h-4 mr-1" />
                    ) : (
                      <ArrowDown className="w-4 h-4 mr-1" />
                    )}
                    {Math.abs(selectedMatch.match.p2_delta || 0)} RP
                  </div>
                </Card>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Match ID</span>
                  <span className="text-gray-300 font-mono text-xs">
                    {selectedMatch.match.match_room_id.substring(0, 8)}...
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Date</span>
                  <span className="text-gray-300">
                    {new Date(selectedMatch.match.created_at).toLocaleString()}
                  </span>
                </div>
              </div>

              <Button
                onClick={() => setShowMatchModal(false)}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white"
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

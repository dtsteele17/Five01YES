'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Users,
  Trophy,
  Plus,
  Crown,
  Medal,
  Calendar,
} from 'lucide-react';
import { CreateLeagueModal } from '@/components/app/CreateLeagueModal';

interface League {
  id: string;
  name: string;
  max_participants: number;
  access_type: 'open' | 'invite';
  start_date: string;
  member_count?: number;
}

export default function LeaguesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeagues();
  }, []);

  const loadLeagues = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch leagues where user is a member
      const { data: leagueMembers, error: membersError } = await supabase
        .from('league_members')
        .select('league_id, leagues(*)')
        .eq('user_id', user.id);

      if (membersError) {
        console.error('[LEAGUES] Error fetching league members:', membersError);
        setLoading(false);
        return;
      }

      if (!leagueMembers || leagueMembers.length === 0) {
        setLeagues([]);
        setLoading(false);
        return;
      }

      // Get member counts for each league
      const leagueIds = leagueMembers.map(lm => lm.league_id);
      
      const { data: memberCounts, error: countError } = await supabase
        .from('league_members')
        .select('league_id')
        .in('league_id', leagueIds);

      if (countError) {
        console.error('[LEAGUES] Error fetching member counts:', countError);
      }

      // Count members per league
      const countsMap = new Map<string, number>();
      memberCounts?.forEach(mc => {
        countsMap.set(mc.league_id, (countsMap.get(mc.league_id) || 0) + 1);
      });

      // Transform data - handle the nested leagues object
      const leaguesData: League[] = leagueMembers
        .map((lm: any) => {
          const league = lm.leagues;
          if (!league) return null as any;
          
          return {
            id: league.id,
            name: league.name,
            max_participants: league.max_participants,
            access_type: league.access_type,
            start_date: league.start_date,
            member_count: countsMap.get(lm.league_id) || 0,
          };
        })
        .filter((l): l is League => l !== null) || [];

      setLeagues(leaguesData);
    } catch (error) {
      console.error('[LEAGUES] Error loading leagues:', error);
    } finally {
      setLoading(false);
    }
  };

  const myLeagues = leagues;

  const getLeagueColor = (index: number) => {
    const colors = [
      'from-yellow-500 to-orange-500',
      'from-blue-500 to-cyan-500',
      'from-emerald-500 to-teal-500',
      'from-purple-500 to-pink-500',
    ];
    return colors[index % colors.length];
  };

  return (
    <div className="space-y-8 max-sm:px-1">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold text-white mb-2">Leagues</h1>
          <p className="text-gray-400">Join or create leagues and compete with others.</p>
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white w-full sm:w-auto"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create League
        </Button>
      </div>

      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-4 sm:p-6">
        <h2 className="text-xl font-bold text-white mb-6">Your Leagues</h2>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-400">Loading leagues...</p>
          </div>
        ) : myLeagues.length === 0 ? (
          <div className="text-center py-12">
            <Trophy className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 mb-4">You haven&apos;t joined any leagues yet</p>
            <Button
              onClick={() => setIsModalOpen(true)}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white"
            >
              Create Your First League
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {myLeagues.map((league, index) => (
              <div
                key={league.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-3 sm:p-6 bg-white/5 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-colors"
              >
                <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
                  <div className={`w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br ${getLeagueColor(index)} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <Trophy className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-white font-semibold text-base sm:text-lg mb-1 break-words">{league.name}</h3>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-400">
                      <div className="flex items-center">
                        <Users className="w-4 h-4 mr-1" />
                        {league.member_count || 0}/{league.max_participants} players
                      </div>
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-1" />
                        Starts {new Date(league.start_date).toLocaleDateString()}
                      </div>
                      <span className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-400">
                        {league.access_type === 'invite' ? 'Invite Only' : 'Open'}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="border-white/10 text-white hover:bg-white/5 w-full sm:w-auto"
                  onClick={() => router.push(`/app/leagues/${league.id}`)}
                >
                  View League
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <CreateLeagueModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onLeagueCreated={async (id) => {
          console.log('PARENT_onLeagueCreated', id);
          setIsModalOpen(false);
          // Reload leagues to show the new one
          await loadLeagues();
          router.push(`/app/leagues/${id}`);
        }}
      />
    </div>
  );
}

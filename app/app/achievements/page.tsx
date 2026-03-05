'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AchievementCard } from '@/components/app/AchievementCard';
import { achievements, getAchievementStats, getCategoryName, Achievement, mergeUserAchievements } from '@/lib/achievements';
import { Search, Trophy } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function AchievementsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [completionFilter, setCompletionFilter] = useState<'all' | 'completed' | 'incomplete'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [userAchievements, setUserAchievements] = useState<Achievement[]>(achievements);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserAchievements();
  }, []);

  async function fetchUserAchievements() {
    setLoading(true);
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Use achievements with all progress reset to 0 for non-authenticated users
      const resetAchievements = achievements.map(a => ({ ...a, progress: 0, completed: false }));
      setUserAchievements(resetAchievements);
      setLoading(false);
      return;
    }

    try {
      // Use the new RPC function to get achievements with user progress
      const { data: achievementsData, error } = await supabase.rpc('rpc_get_user_achievements');
      
      if (error) {
        console.error('Failed to fetch achievements:', error);
        // Fallback to hardcoded achievements with progress reset
        const resetAchievements = achievements.map(a => ({ ...a, progress: 0, completed: false }));
        setUserAchievements(resetAchievements);
      } else if (achievementsData?.achievements) {
        // Map the database format to our frontend format
        const mappedAchievements = achievementsData.achievements.map((a: any) => ({
          id: a.id,
          title: a.title,
          description: a.description,
          category: a.category,
          icon: a.icon,
          completed: a.completed,
          progress: a.progress,
          goal: a.goal,
          reward: `${a.xp} XP`,
          completedDate: a.completed_at ? new Date(a.completed_at).toISOString().split('T')[0] : undefined,
        }));
        setUserAchievements(mappedAchievements);
      } else {
        // No achievements found, use default with progress reset
        const resetAchievements = achievements.map(a => ({ ...a, progress: 0, completed: false }));
        setUserAchievements(resetAchievements);
      }
    } catch (err) {
      console.error('Achievement fetch error:', err);
      // Fallback to hardcoded achievements with progress reset
      const resetAchievements = achievements.map(a => ({ ...a, progress: 0, completed: false }));
      setUserAchievements(resetAchievements);
    }

    setLoading(false);
  }

  const stats = getAchievementStats(userAchievements);

  const filteredAchievements = userAchievements.filter((achievement) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        achievement.title.toLowerCase().includes(query) ||
        achievement.description.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    if (completionFilter === 'completed' && !achievement.completed) return false;
    if (completionFilter === 'incomplete' && achievement.completed) return false;

    if (categoryFilter !== 'all' && achievement.category !== categoryFilter) return false;

    return true;
  });

  return (
    <div className="space-y-8 max-sm:px-1">
      <div>
        <h1 className="text-2xl sm:text-4xl font-bold text-white mb-2">Achievements</h1>
        <p className="text-gray-400">Complete challenges across all modes to earn rewards and show off your skill.</p>
      </div>

      <div className="bg-gradient-to-br from-teal-500/10 to-cyan-500/10 border border-teal-500/30 rounded-xl p-4 sm:p-6 shadow-lg shadow-teal-500/10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-xl flex items-center justify-center">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">Achievement Progress</h2>
              <p className="text-gray-300 text-sm">
                {stats.completed} of {stats.total} completed
              </p>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-2xl sm:text-4xl font-bold text-teal-400">{stats.percentage}%</div>
            <p className="text-xs text-gray-400">Total Progress</p>
          </div>
        </div>
        <Progress value={stats.percentage} className="h-3 bg-teal-900/30" />
      </div>

      <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Search achievements..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-slate-800/50 border-white/10 text-white placeholder:text-gray-500 focus:border-teal-500 focus:ring-teal-500/20"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex flex-wrap gap-2 bg-slate-800/50 rounded-lg p-1">
              <Button
                size="sm"
                variant={completionFilter === 'all' ? 'default' : 'ghost'}
                onClick={() => setCompletionFilter('all')}
                className={
                  completionFilter === 'all'
                    ? 'bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }
              >
                All
              </Button>
              <Button
                size="sm"
                variant={completionFilter === 'completed' ? 'default' : 'ghost'}
                onClick={() => setCompletionFilter('completed')}
                className={
                  completionFilter === 'completed'
                    ? 'bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }
              >
                Completed
              </Button>
              <Button
                size="sm"
                variant={completionFilter === 'incomplete' ? 'default' : 'ghost'}
                onClick={() => setCompletionFilter('incomplete')}
                className={
                  completionFilter === 'incomplete'
                    ? 'bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }
              >
                Incomplete
              </Button>
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[200px] bg-slate-800/50 border-white/10 text-white focus:border-teal-500 focus:ring-teal-500/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10">
                <SelectItem value="all">All Modes</SelectItem>
                <SelectItem value="career">Career Mode</SelectItem>
                <SelectItem value="ranked">Ranked</SelectItem>
                <SelectItem value="league">League</SelectItem>
                <SelectItem value="tournaments">Tournaments</SelectItem>
                <SelectItem value="practice">Practice</SelectItem>
                <SelectItem value="atc">Around The Clock</SelectItem>
                <SelectItem value="scoring">Scoring</SelectItem>
                <SelectItem value="milestones">Milestones</SelectItem>
                <SelectItem value="funny">Funny</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-12 text-center">
          <Trophy className="w-16 h-16 text-gray-600 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-400 text-lg">Loading achievements...</p>
        </div>
      ) : filteredAchievements.length > 0 ? (
        <div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredAchievements.map((achievement) => (
              <AchievementCard key={achievement.id} achievement={achievement} />
            ))}
          </div>
          <div className="mt-6 text-center text-gray-400 text-sm">
            Showing {filteredAchievements.length} of {userAchievements.length} achievements
          </div>
        </div>
      ) : (
        <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-12 text-center">
          <Trophy className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg mb-2">No achievements match your filters</p>
          <p className="text-gray-500 text-sm">Try adjusting your search or filters</p>
        </div>
      )}
    </div>
  );
}

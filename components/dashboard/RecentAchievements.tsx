'use client';

import { useState, useEffect } from 'react';
import { Trophy } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface RecentAchievement {
  achievement_id: string;
  completed_at: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  xp: number;
}

export function RecentAchievements({ userId, limit = 5 }: { userId: string; limit?: number }) {
  const [achievements, setAchievements] = useState<RecentAchievement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecentAchievements();
  }, [userId]);

  async function fetchRecentAchievements() {
    const supabase = createClient();
    setLoading(true);

    try {
      // Fetch recent user achievements joined with achievement details
      const { data, error } = await supabase
        .from('user_achievements')
        .select(`
          achievement_id,
          completed_at,
          achievements:achievement_id (
            name,
            description,
            category,
            icon,
            xp
          )
        `)
        .eq('user_id', userId)
        .eq('completed', true)
        .order('completed_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[RecentAchievements] Error:', error);
        setLoading(false);
        return;
      }

      // Map the data
      const mapped = (data || []).map((item: any) => ({
        achievement_id: item.achievement_id,
        completed_at: item.completed_at,
        title: item.achievements?.name || item.achievement_id,
        description: item.achievements?.description || '',
        category: item.achievements?.category || 'General',
        icon: item.achievements?.icon || '🏆',
        xp: item.achievements?.xp || 0,
      }));

      setAchievements(mapped);
    } catch (error) {
      console.error('[RecentAchievements] Error:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-4 animate-pulse">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-5 h-5 text-teal-400" />
          <span className="text-white font-semibold">Recent Achievements</span>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-slate-700/50 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (achievements.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-5 h-5 text-teal-400" />
          <span className="text-white font-semibold">Recent Achievements</span>
        </div>
        <p className="text-gray-400 text-sm">No achievements yet. Start playing to unlock some!</p>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-slate-800/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-teal-400" />
          <span className="text-white font-semibold">Recent Achievements</span>
        </div>
        <a href="/app/achievements" className="text-xs text-teal-400 hover:text-teal-300">
          View All
        </a>
      </div>
      
      <div className="space-y-2">
        {achievements.map((achievement) => (
          <div
            key={achievement.achievement_id}
            className="flex items-center gap-3 p-2 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500/20 to-cyan-500/20 flex items-center justify-center text-xl">
              {achievement.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium text-sm truncate">{achievement.title}</p>
              <p className="text-gray-400 text-xs truncate">{achievement.description}</p>
            </div>
            <div className="text-right">
              <p className="text-teal-400 text-xs font-medium">+{achievement.xp} XP</p>
              <p className="text-gray-500 text-xs">{formatDate(achievement.completed_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

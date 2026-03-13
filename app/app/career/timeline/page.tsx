'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Trophy, Star, TrendingUp, TrendingDown, Award, Zap, Shield, Calendar, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

interface Milestone {
  id: string;
  milestone_type: string;
  title: string;
  description: string;
  tier: number;
  season: number;
  day: number;
  created_at: string;
}

const TIER_NAMES: Record<number, string> = {
  1: 'Local Circuit',
  2: 'Pub Leagues',
  3: 'County Circuit',
  4: 'National Tour',
  5: 'Pro Tour',
};

const TIER_COLORS: Record<number, string> = {
  1: 'border-slate-500',
  2: 'border-green-500',
  3: 'border-blue-500',
  4: 'border-purple-500',
  5: 'border-yellow-500',
};

const TIER_BG: Record<number, string> = {
  1: 'bg-slate-500/10',
  2: 'bg-green-500/10',
  3: 'bg-blue-500/10',
  4: 'bg-purple-500/10',
  5: 'bg-yellow-500/10',
};

const TIER_DOT: Record<number, string> = {
  1: 'bg-slate-400',
  2: 'bg-green-400',
  3: 'bg-blue-400',
  4: 'bg-purple-400',
  5: 'bg-yellow-400',
};

function getMilestoneIcon(type: string) {
  switch (type) {
    case 'tournament_win': return <Trophy className="w-4 h-4 text-yellow-400" />;
    case 'tournament_result': return <Award className="w-4 h-4 text-blue-400" />;
    case 'promotion': return <TrendingUp className="w-4 h-4 text-green-400" />;
    case 'relegation': return <TrendingDown className="w-4 h-4 text-red-400" />;
    case 'league_champion': return <Trophy className="w-4 h-4 text-yellow-400" />;
    case 'sponsor_offer': return <Shield className="w-4 h-4 text-cyan-400" />;
    case 'sponsor_accepted': return <Shield className="w-4 h-4 text-cyan-400" />;
    case 'rep_bonus': return <Zap className="w-4 h-4 text-orange-400" />;
    case 'tournament_invite': return <Star className="w-4 h-4 text-amber-400" />;
    default: return <Star className="w-4 h-4 text-slate-400" />;
  }
}

function getMilestoneColor(type: string) {
  switch (type) {
    case 'tournament_win': return 'border-l-yellow-500 bg-yellow-500/5';
    case 'tournament_result': return 'border-l-blue-500 bg-blue-500/5';
    case 'promotion': return 'border-l-green-500 bg-green-500/5';
    case 'relegation': return 'border-l-red-500 bg-red-500/5';
    case 'league_champion': return 'border-l-yellow-500 bg-yellow-500/5';
    case 'sponsor_offer': case 'sponsor_accepted': return 'border-l-cyan-500 bg-cyan-500/5';
    default: return 'border-l-slate-500 bg-slate-500/5';
  }
}

export default function TimelinePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const careerId = searchParams.get('careerId');
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    if (careerId) loadTimeline();
  }, [careerId]);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  async function loadTimeline() {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('career_milestones')
      .select('id, milestone_type, title, description, tier, season, day, created_at')
      .eq('career_id', careerId)
      .order('day', { ascending: false });
    if (!error && data) {
      // Filter out milestone types that shouldn't appear on timeline
      const hidden = new Set(['sponsor_slot_unlocked', 'sponsor_slot_lost', 'sponsor_offer', 'tournament_invite', 'rep_bonus']);
      setMilestones(data.filter(m => !hidden.has(m.milestone_type)));
    }
    setLoading(false);
  }

  // Group milestones by tier+season, sorted by most recent first
  // Each group is a stretch of time in a particular tier
  type TierGroup = { tier: number; season: number; milestones: Milestone[]; maxDay: number };
  const tierGroups: TierGroup[] = [];
  let currentGroup: TierGroup | null = null;
  
  // Milestones are already sorted by day desc from the query
  milestones.forEach(m => {
    const t = m.tier || 1;
    if (!currentGroup || currentGroup.tier !== t || currentGroup.season !== m.season) {
      currentGroup = { tier: t, season: m.season, milestones: [], maxDay: m.day };
      tierGroups.push(currentGroup);
    }
    currentGroup.milestones.push(m);
  });

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#0a0a14]/95 backdrop-blur-sm border-b border-slate-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost" size="sm"
            onClick={() => router.push(`/app/career?id=${careerId}`)}
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Career Home
          </Button>
          <div className="flex-1 text-center">
            <h1 className="text-lg font-bold flex items-center justify-center gap-2">
              <Calendar className="w-5 h-5 text-amber-400" />
              Career Timeline
            </h1>
          </div>
          <div className="w-20" />
        </div>
      </div>

      {/* Stats bar */}
      <div className="max-w-2xl mx-auto px-4 py-3">
        <div className="flex gap-3 text-xs text-slate-400">
          <span>{milestones.length} milestone{milestones.length !== 1 ? 's' : ''}</span>
          <span>|</span>
          <span>{milestones.filter(m => m.milestone_type === 'tournament_win').length} tournament wins</span>
          <span>|</span>
          <span>{milestones.filter(m => m.milestone_type === 'promotion').length} promotions</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="max-w-2xl mx-auto px-4 pb-20">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full" />
          </div>
        ) : milestones.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <Star className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No milestones yet. Start playing to build your timeline!</p>
          </div>
        ) : (
          tierGroups.map((group, groupIdx) => (
            <div key={`${group.tier}-${group.season}`} className="mb-8">
              {/* Tier header */}
              <div className={`sticky top-14 z-40 flex items-center gap-2 py-2 px-3 mb-3 rounded-lg ${TIER_BG[group.tier]} border ${TIER_COLORS[group.tier]} bg-[#0a0a14]/90 backdrop-blur-sm`}>
                <div className={`w-2.5 h-2.5 rounded-full ${TIER_DOT[group.tier]}`} />
                <span className="font-semibold text-sm">{TIER_NAMES[group.tier] || `Tier ${group.tier}`}</span>
                <span className="text-xs text-slate-500 ml-auto">Season {group.season} &middot; {group.milestones.length} events</span>
              </div>

              {/* Milestones for this group */}
              <div className="relative ml-4 border-l-2 border-slate-700/50 pl-6 space-y-3">
                {group.milestones.map((m, idx) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(idx * 0.03, 0.5) }}
                    className={`relative border-l-4 rounded-r-lg px-4 py-3 ${getMilestoneColor(m.milestone_type)}`}
                  >
                    {/* Timeline dot */}
                    <div className={`absolute -left-[2.05rem] top-4 w-3 h-3 rounded-full border-2 border-[#0a0a14] ${TIER_DOT[group.tier]}`} />

                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          {getMilestoneIcon(m.milestone_type)}
                          <h3 className="font-semibold text-sm truncate">{m.title}</h3>
                        </div>
                        {m.description && !m.description.startsWith('Points change:') && (
                          <p className="text-xs text-slate-400 mt-0.5">{m.description}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs text-slate-500 font-mono">Day {m.day}</span>
                        <div className="text-[10px] text-slate-600">S{m.season}</div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shadow-lg hover:bg-slate-700 transition-colors"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

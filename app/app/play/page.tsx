'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion, Variants } from 'framer-motion';
import { useRecentMatches } from '@/lib/hooks/useRecentMatches';
import { useTodayStats } from '@/lib/hooks/useTodayStats';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { MatchStatsModal } from '@/components/app/MatchStatsModal';
import {
  Zap,
  Shield,
  Lock,
  Trophy,
  Users,
  Target,
  Flame,
  TrendingUp,
  Gamepad2,
  ChevronRight,
  Clock,
  BarChart3,
  Play,
  Star,
  ArrowRight,
  Activity,
  Cpu,
  Crown,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';

// Animation variants
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 100,
      damping: 15,
    },
  },
};

// Game Mode Card Component
interface GameModeCardProps {
  href: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  badge?: { text: string; color: string };
  stats?: { label: string; value: string };
  featured?: boolean;
  color: string;
  disabled?: boolean;
}

function GameModeCard({ href, title, subtitle, description, icon, badge, stats, featured = false, color, disabled }: GameModeCardProps) {
  if (disabled) {
    return (
      <motion.div variants={itemVariants} className="h-full">
        <div className="relative overflow-hidden rounded-2xl bg-slate-800/30 border border-slate-700/30 p-6 opacity-50 h-full">
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-10">
            <div className="text-center">
              <Lock className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <span className="text-slate-500 font-medium">Coming Soon</span>
            </div>
          </div>
          <div className="flex items-start justify-between mb-4">
            <div className={`w-14 h-14 rounded-xl ${color} flex items-center justify-center`}>
              {icon}
            </div>
            {badge && <Badge className={badge.color}>{badge.text}</Badge>}
          </div>
          <h3 className="text-xl font-bold text-white mb-1">{title}</h3>
          <p className="text-slate-400 text-sm">{description}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div variants={itemVariants} className="h-full">
      <Link href={href} className="h-full block">
        <Card className={`relative overflow-hidden group cursor-pointer transition-all duration-300 hover:scale-[1.02] h-full ${featured ? 'bg-slate-800/60 border-emerald-500/30' : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600/50'} p-6`}>
          <div className={`absolute inset-0 ${color} opacity-0 group-hover:opacity-10 transition-opacity`} />
          
          <div className="relative z-10 h-full flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-14 h-14 rounded-xl ${color} flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow`}>
                {icon}
              </div>
              {badge && <Badge className={badge.color}>{badge.text}</Badge>}
            </div>

            <div className="flex-1">
              <div className="mb-3">
                <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">{subtitle}</p>
                <h3 className="text-xl font-bold text-white mt-1 group-hover:text-emerald-400 transition-colors">{title}</h3>
              </div>

              <p className="text-slate-400 text-sm mb-4 line-clamp-2">{description}</p>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-700/30">
              {stats ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{stats.label}</span>
                  <span className="text-sm font-bold text-white">{stats.value}</span>
                </div>
              ) : (
                <div />
              )}
              <div className="flex items-center text-emerald-400 text-sm font-medium">
                Play
                <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}

// Stats Mini Card
function StatMiniCard({ label, value, icon: Icon, color, trend, loading }: { label: string; value: string; icon: any; color: string; trend?: { value: string; positive: boolean }; loading?: boolean }) {
  return (
    <motion.div variants={itemVariants} className="relative overflow-hidden rounded-xl bg-slate-800/40 border border-slate-700/50 p-4 group hover:border-slate-500/50 transition-all">
      <div className={`absolute inset-0 ${color} opacity-0 group-hover:opacity-10 transition-opacity`} />
      <div className="relative flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
          <div className="flex items-center gap-2">
            {loading ? (
              <div className="w-12 h-6 bg-slate-700 rounded animate-pulse" />
            ) : (
              <>
                <p className="text-xl font-bold text-white">{value}</p>
                {trend && (
                  <span className={`text-xs font-medium ${trend.positive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {trend.positive ? '+' : ''}{trend.value}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Training Hub Card (Simplified - Explore only)
function TrainingHubCard() {
  return (
    <motion.div variants={itemVariants}>
      <Link href="/app/play/training">
        <Card className="relative overflow-hidden group cursor-pointer transition-all duration-300 hover:scale-[1.02] h-full bg-gradient-to-br from-rose-500/10 to-orange-500/10 border-rose-500/30 hover:border-rose-500/50 p-6">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <div className="relative z-10 h-full flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-rose-500 to-orange-600 flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow">
                <Target className="w-7 h-7 text-white" />
              </div>
              <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">
                <Star className="w-3 h-3 mr-1" />
                9 Modes
              </Badge>
            </div>

            <div className="flex-1">
              <p className="text-xs text-rose-400 uppercase tracking-wider font-semibold">Practice</p>
              <h3 className="text-2xl font-bold text-white mt-1 group-hover:text-rose-400 transition-colors">Training Hub</h3>
              <p className="text-slate-300 text-sm mt-2">
                Master your skills with AI opponents. 501 practice, checkout training, challenges, and more.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-slate-700/30 mt-4">
              <Button 
                className="flex-1 bg-gradient-to-r from-rose-500 to-orange-600 hover:from-rose-600 hover:to-orange-700"
              >
                Explore
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}

// Stats Dashboard Component
function StatsDashboard() {
  const { stats, loading } = useTodayStats();

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatMiniCard 
        label="Matches Today" 
        value={stats.matchesPlayed.toString()} 
        icon={Zap} 
        color="bg-emerald-500/20" 
        loading={loading}
      />
      <StatMiniCard 
        label="Wins Today" 
        value={stats.wins.toString()} 
        icon={Target} 
        color="bg-purple-500/20" 
        loading={loading}
      />
      <StatMiniCard 
        label="Today's 3-Dart Avg" 
        value={stats.threeDartAverage.toFixed(1)} 
        icon={BarChart3} 
        color="bg-blue-500/20" 
        loading={loading}
      />
      <StatMiniCard 
        label="Win Streak" 
        value={stats.currentStreak.toString()} 
        icon={Flame} 
        color="bg-orange-500/20" 
        loading={loading}
      />
    </div>
  );
}

// Quick Actions Bar
function QuickActionsBar() {
  return (
    <motion.div 
      variants={itemVariants}
      className="flex flex-wrap gap-3"
    >
      <Link href="/app/play/training">
        <Button className="bg-emerald-500 hover:bg-emerald-600">
          <Play className="w-4 h-4 mr-2" />
          Start Training
        </Button>
      </Link>
      <Link href="/app/play/quick-match">
        <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
          <Zap className="w-4 h-4 mr-2" />
          Find Opponent
        </Button>
      </Link>
    </motion.div>
  );
}

// Recent Match Item Component - Dashboard Themed
function RecentMatchItem({ match, onClick }: { match: any; onClick: () => void }) {
  const getResultColor = (result: string) => {
    switch (result) {
      case 'win': return 'text-emerald-400';
      case 'loss': return 'text-rose-400';
      case 'draw': return 'text-amber-400';
      default: return 'text-slate-400';
    }
  };

  const getResultBgColor = (result: string) => {
    switch (result) {
      case 'win': return 'bg-emerald-500/20 border-emerald-500/30';
      case 'loss': return 'bg-rose-500/20 border-rose-500/30';
      case 'draw': return 'bg-amber-500/20 border-amber-500/30';
      default: return 'bg-slate-500/20 border-slate-500/30';
    }
  };

  const getResultGradient = (result: string) => {
    switch (result) {
      case 'win': return 'from-emerald-500/10 to-emerald-600/5';
      case 'loss': return 'from-rose-500/10 to-rose-600/5';
      case 'draw': return 'from-amber-500/10 to-amber-600/5';
      default: return 'from-slate-500/10 to-slate-600/5';
    }
  };

  const getResultIcon = (result: string) => {
    switch (result) {
      case 'win': return <ArrowUpRight className="w-4 h-4" />;
      case 'loss': return <ArrowDownRight className="w-4 h-4" />;
      case 'draw': return <Minus className="w-4 h-4" />;
      default: return <Minus className="w-4 h-4" />;
    }
  };

  const timeAgo = formatDistanceToNow(new Date(match.played_at), { addSuffix: true });

  return (
    <motion.div 
      onClick={onClick}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${getResultGradient(match.result)} border border-slate-700/50 hover:border-slate-500/50 cursor-pointer transition-all group`}
    >
      {/* Result indicator strip */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
        match.result === 'win' ? 'bg-emerald-500' : 
        match.result === 'loss' ? 'bg-rose-500' : 'bg-amber-500'
      }`} />
      
      <div className="p-4 pl-5">
        {/* Header Row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* Result Badge */}
            <div className={`px-2 py-1 rounded-lg ${getResultBgColor(match.result)} flex items-center gap-1`}>
              {getResultIcon(match.result)}
              <span className={`text-xs font-bold uppercase ${getResultColor(match.result)}`}>
                {match.result}
              </span>
            </div>
            
            {/* Opponent */}
            <div>
              <p className="text-white font-semibold">vs {match.opponent_username || 'Unknown'}</p>
              <p className="text-slate-500 text-xs">{match.game_mode} • {timeAgo}</p>
            </div>
          </div>
          
          {/* Score */}
          <div className="flex items-center gap-2">
            <div className={`text-2xl font-black ${match.result === 'win' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {match.legs_won}
            </div>
            <span className="text-slate-600 font-bold">-</span>
            <div className="text-2xl font-black text-slate-400">
              {match.legs_lost}
            </div>
          </div>
        </div>
        
        {/* Stats Comparison Row */}
        <div className="grid grid-cols-4 gap-3">
          {/* User Stats */}
          <div className="col-span-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">You</span>
              <span className="text-emerald-400 font-bold">{match.three_dart_avg?.toFixed(1) || '-'} avg</span>
            </div>
            <div className="flex gap-1">
              <Badge className="bg-slate-800 text-slate-400 text-xs border-0">
                <Target className="w-3 h-3 mr-1" />
                {match.first9_avg?.toFixed(1) || '-'}
              </Badge>
              <Badge className="bg-slate-800 text-slate-400 text-xs border-0">
                <Trophy className="w-3 h-3 mr-1" />
                {match.highest_checkout || '-'}
              </Badge>
              <Badge className="bg-slate-800 text-emerald-500 text-xs border-0">
                <Flame className="w-3 h-3 mr-1" />
                {match.visits_180 || 0}
              </Badge>
            </div>
          </div>
          
          {/* Opponent Stats */}
          <div className="col-span-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Opponent</span>
              <span className="text-orange-400 font-bold">{match.opponent_three_dart_avg?.toFixed(1) || '-'} avg</span>
            </div>
            <div className="flex gap-1 justify-end">
              <Badge className="bg-slate-800 text-slate-400 text-xs border-0">
                {match.opponent_first9_avg?.toFixed(1) || '-'}
                <Target className="w-3 h-3 ml-1" />
              </Badge>
              <Badge className="bg-slate-800 text-slate-400 text-xs border-0">
                {match.opponent_highest_checkout || '-'}
                <Trophy className="w-3 h-3 ml-1" />
              </Badge>
              <Badge className="bg-slate-800 text-orange-500 text-xs border-0">
                {match.opponent_visits_180 || 0}
                <Flame className="w-3 h-3 ml-1" />
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Recent Matches Section
function RecentMatchesSection() {
  const { matches, loading, refresh } = useRecentMatches(5);
  const [selectedMatch, setSelectedMatch] = useState<any>(null);

  return (
    <>
      <motion.div variants={itemVariants} className="rounded-2xl bg-slate-800/40 border border-slate-700/50 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-1">History</p>
            <h2 className="text-2xl font-bold text-white">Recent Matches</h2>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
              onClick={refresh}
              disabled={loading}
            >
              <Loader2 className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Link href="/app/stats">
              <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
                View All
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
        
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 rounded-xl bg-slate-800/60 animate-pulse">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-6 rounded-lg bg-slate-700" />
                    <div>
                      <div className="w-24 h-4 bg-slate-700 rounded mb-2" />
                      <div className="w-16 h-3 bg-slate-700 rounded" />
                    </div>
                  </div>
                  <div className="w-12 h-6 bg-slate-700 rounded" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="h-10 bg-slate-700 rounded-lg" />
                  <div className="h-10 bg-slate-700 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : matches.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-8 h-8 text-slate-500" />
            </div>
            <h3 className="text-white font-bold mb-2">No Matches Yet</h3>
            <p className="text-slate-400 text-sm mb-4">Start playing to see your match history here</p>
            <Link href="/app/play/quick-match">
              <Button className="bg-emerald-500 hover:bg-emerald-600">
                <Play className="w-4 h-4 mr-2" />
                Play Now
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {matches.map((match) => (
              <RecentMatchItem 
                key={match.id} 
                match={match} 
                onClick={() => setSelectedMatch(match)}
              />
            ))}
          </div>
        )}
      </motion.div>

      {/* Match Stats Modal */}
      <MatchStatsModal
        isOpen={!!selectedMatch}
        onClose={() => setSelectedMatch(null)}
        matchId={selectedMatch?.room_id || ''}
      />
    </>
  );
}

export default function PlayPage() {
  return (
    <motion.div 
      className="max-w-7xl mx-auto space-y-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <motion.p 
            className="text-emerald-400 text-sm font-semibold uppercase tracking-wider mb-2"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            Welcome Back
          </motion.p>
          <motion.h1 
            className="text-4xl md:text-5xl font-black text-white tracking-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            Game Dashboard
          </motion.h1>
          <motion.p 
            className="text-slate-400 mt-2 text-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Select a mode to start playing or continue your training
          </motion.p>
        </div>
        <QuickActionsBar />
      </div>

      {/* Stats Dashboard - Real Data */}
      <StatsDashboard />

      {/* Main Game Modes Grid */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-1">Game Modes</p>
            <h2 className="text-2xl font-bold text-white">Choose Your Match</h2>
          </div>
          <Badge className="bg-slate-700 text-slate-300">
            <Activity className="w-3 h-3 mr-1" />
            1.2k Online
          </Badge>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Quick Match */}
          <GameModeCard
            href="/app/play/quick-match"
            title="Quick Match"
            subtitle="Casual"
            description="Jump into a fast-paced match against players worldwide. Perfect for casual games."
            icon={<Zap className="w-7 h-7 text-white" />}
            badge={{ text: 'Popular', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' }}
            stats={{ label: 'Active', value: '1.2k' }}
            featured
            color="bg-gradient-to-br from-emerald-500 to-teal-600"
          />

          {/* Ranked */}
          <GameModeCard
            href="/app/ranked"
            title="Ranked Match"
            subtitle="Competitive"
            description="Compete for ranked points and climb the divisions. Prove your skills."
            icon={<Shield className="w-7 h-7 text-white" />}
            badge={{ text: 'Ranked', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' }}
            stats={{ label: 'Points', value: '500' }}
            color="bg-gradient-to-br from-amber-500 to-orange-600"
          />

          {/* Private Match */}
          <GameModeCard
            href="/app/play/private-match"
            title="Private Match"
            subtitle="Social"
            description="Create a private room and invite your friends for custom matches."
            icon={<Users className="w-7 h-7 text-white" />}
            badge={{ text: 'Multiplayer', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' }}
            stats={{ label: 'Online', value: '432' }}
            color="bg-gradient-to-br from-blue-500 to-indigo-600"
          />

          {/* Tournament */}
          <GameModeCard
            href="#"
            title="Tournament"
            subtitle="Competitive"
            description="Join weekly tournaments and compete for exclusive rewards."
            icon={<Trophy className="w-7 h-7 text-white" />}
            badge={{ text: 'Soon', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' }}
            color="bg-gradient-to-br from-purple-500 to-pink-600"
            disabled
          />

          {/* Local Play */}
          <GameModeCard
            href="/app/play/local"
            title="Local Play"
            subtitle="Offline"
            description="Play against friends on the same device. Pass and play style."
            icon={<Gamepad2 className="w-7 h-7 text-white" />}
            color="bg-gradient-to-br from-slate-500 to-slate-600"
          />

          {/* Training Hub */}
          <TrainingHubCard />
        </div>
      </div>

      {/* Recent Matches - Real Data */}
      <RecentMatchesSection />
    </motion.div>
  );
}

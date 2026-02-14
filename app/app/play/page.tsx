'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTraining } from '@/lib/context/TrainingContext';
import { motion } from 'framer-motion';
import {
  Zap,
  Shield,
  Lock,
  Trophy,
  Users,
  Target,
  Cpu,
  Flame,
  TrendingUp,
  Gamepad2,
  ChevronRight,
  Crown,
  Clock,
  BarChart3,
  Play,
  Star,
  ArrowRight,
  Activity,
  TargetIcon,
} from 'lucide-react';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
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
function StatMiniCard({ label, value, icon: Icon, color, trend }: { label: string; value: string; icon: any; color: string; trend?: { value: string; positive: boolean } }) {
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
            <p className="text-xl font-bold text-white">{value}</p>
            {trend && (
              <span className={`text-xs font-medium ${trend.positive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {trend.positive ? '+' : ''}{trend.value}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Live Match Card
function LiveMatchCard() {
  return (
    <motion.div variants={itemVariants} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600/20 to-teal-600/20 border border-emerald-500/30 p-6">
      <div className="absolute top-0 right-0">
        <div className="flex items-center gap-1.5 bg-red-500/20 text-red-400 px-3 py-1 rounded-bl-xl">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-semibold">LIVE</span>
        </div>
      </div>
      
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <Activity className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-white font-bold">Premier League Final</h3>
            <p className="text-slate-400 text-sm">2.4k watching</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="text-center">
          <p className="text-lg font-bold text-white">Smith</p>
          <p className="text-emerald-400 font-mono">3</p>
        </div>
        <div className="text-center px-4">
          <p className="text-xs text-slate-500 uppercase">vs</p>
          <p className="text-slate-400 text-sm">Leg 6</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-white">van Gerwen</p>
          <p className="text-emerald-400 font-mono">2</p>
        </div>
      </div>

      <Button className="w-full bg-emerald-500 hover:bg-emerald-600">
        <Play className="w-4 h-4 mr-2" />
        Watch Now
      </Button>
    </motion.div>
  );
}

// Training Hub Card (Prominent)
function TrainingHubCard() {
  const router = useRouter();
  const { setConfig } = useTraining();

  const quickStart = () => {
    setConfig({
      mode: '501',
      botAverage: 50,
      bestOf: 3,
      doubleOut: true,
    });
    router.push('/app/play/training/501');
  };

  return (
    <motion.div variants={itemVariants}>
      <Card className="relative overflow-hidden group cursor-pointer transition-all duration-300 hover:scale-[1.02] h-full bg-gradient-to-br from-rose-500/10 to-orange-500/10 border-rose-500/30 hover:border-rose-500/50 p-6">
        <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        
        <div className="relative z-10 h-full flex flex-col">
          <div className="flex items-start justify-between mb-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-rose-500 to-orange-600 flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow">
              <TargetIcon className="w-7 h-7 text-white" />
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
              onClick={quickStart}
              className="flex-1 bg-gradient-to-r from-rose-500 to-orange-600 hover:from-rose-600 hover:to-orange-700"
            >
              <Play className="w-4 h-4 mr-2" />
              Quick Start
            </Button>
            <Link href="/app/play/training">
              <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
                Explore
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// Quick Actions Bar
function QuickActionsBar() {
  const router = useRouter();
  const { setConfig } = useTraining();

  const quickStartTraining = () => {
    setConfig({
      mode: '501',
      botAverage: 50,
      bestOf: 3,
      doubleOut: true,
    });
    router.push('/app/play/training/501');
  };

  return (
    <motion.div 
      variants={itemVariants}
      className="flex flex-wrap gap-3"
    >
      <Button 
        onClick={quickStartTraining}
        className="bg-emerald-500 hover:bg-emerald-600"
      >
        <Play className="w-4 h-4 mr-2" />
        Quick Match vs Bot
      </Button>
      <Link href="/app/play/quick-match">
        <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
          <Zap className="w-4 h-4 mr-2" />
          Find Opponent
        </Button>
      </Link>
      <Link href="/app/play/private-match">
        <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
          <Users className="w-4 h-4 mr-2" />
          Private Room
        </Button>
      </Link>
    </motion.div>
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

      {/* Stats Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatMiniCard label="Matches Today" value="3" icon={Zap} color="bg-emerald-500/20" trend={{ value: '2', positive: true }} />
        <StatMiniCard label="Win Streak" value="5" icon={Flame} color="bg-orange-500/20" trend={{ value: '1', positive: true }} />
        <StatMiniCard label="Best Average" value="82.4" icon={BarChart3} color="bg-blue-500/20" trend={{ value: '4.2', positive: true }} />
        <StatMiniCard label="Training XP" value="1,240" icon={TargetIcon} color="bg-purple-500/20" trend={{ value: '150', positive: true }} />
      </div>

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

          {/* Training Hub - Now prominent */}
          <TrainingHubCard />
        </div>
      </div>

      {/* Featured / Live Section */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-1">Featured</p>
              <h2 className="text-2xl font-bold text-white">Live Now</h2>
            </div>
            <Link href="#">
              <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
                View All
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
          <LiveMatchCard />
        </div>

        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-1">Progress</p>
              <h2 className="text-2xl font-bold text-white">Your Stats</h2>
            </div>
          </div>
          <motion.div variants={itemVariants} className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">Weekly Goal</span>
                <span className="text-emerald-400 font-bold">70%</span>
              </div>
              <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                <div className="h-full w-[70%] bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full" />
              </div>
              <p className="text-slate-500 text-xs mt-2">12 of 20 sessions completed</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">Ranked Progress</span>
                <span className="text-amber-400 font-bold">45%</span>
              </div>
              <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                <div className="h-full w-[45%] bg-gradient-to-r from-amber-500 to-orange-400 rounded-full" />
              </div>
              <p className="text-slate-500 text-xs mt-2">500 / 1000 RP to next tier</p>
            </div>
            <Link href="/app/stats">
              <Button variant="outline" className="w-full border-slate-600 text-slate-300 hover:bg-slate-700">
                <BarChart3 className="w-4 h-4 mr-2" />
                View Full Stats
              </Button>
            </Link>
          </motion.div>
        </div>
      </div>

      {/* Recent Activity */}
      <motion.div variants={itemVariants} className="rounded-2xl bg-slate-800/40 border border-slate-700/50 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-1">History</p>
            <h2 className="text-2xl font-bold text-white">Recent Matches</h2>
          </div>
          <Link href="/app/stats">
            <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
              View All
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
        
        <div className="space-y-3">
          {[
            { mode: 'Quick Match', opponent: 'Player123', result: 'Win', score: '3-1', time: '2h ago', color: 'text-emerald-400' },
            { mode: 'Training', opponent: 'DartBot (60)', result: 'Loss', score: '2-3', time: '5h ago', color: 'text-rose-400' },
            { mode: 'Ranked', opponent: 'ProPlayer', result: 'Win', score: '3-2', time: '1d ago', color: 'text-emerald-400' },
          ].map((match, index) => (
            <div key={index} className="flex items-center justify-between p-4 rounded-xl bg-slate-800/60 hover:bg-slate-800/80 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  match.mode === 'Quick Match' ? 'bg-emerald-500/20' :
                  match.mode === 'Training' ? 'bg-rose-500/20' : 'bg-amber-500/20'
                }`}>
                  {match.mode === 'Quick Match' ? <Zap className="w-5 h-5 text-emerald-400" /> :
                   match.mode === 'Training' ? <TargetIcon className="w-5 h-5 text-rose-400" /> :
                   <Crown className="w-5 h-5 text-amber-400" />}
                </div>
                <div>
                  <p className="text-white font-medium">{match.mode}</p>
                  <p className="text-slate-400 text-sm">vs {match.opponent}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-bold ${match.color}`}>{match.result}</p>
                <p className="text-slate-500 text-sm">{match.score} • {match.time}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

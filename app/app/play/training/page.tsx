'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useTraining } from '@/lib/context/TrainingContext';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Target,
  Cpu,
  Flame,
  Crown,
  TrendingUp,
  Dices,
  Clock,
  BarChart3,
  Zap,
  ChevronRight,
  Play,
  RotateCcw,
  Trophy,
  Star,
  Gamepad2,
  Crosshair,
  Award,
  ArrowLeft,
  Activity,
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

// Training Mode Type
interface TrainingMode {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  gradient: string;
  glowColor: string;
  href: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | 'Pro';
  duration: string;
  xpReward: number;
  featured?: boolean;
  locked?: boolean;
  stats?: {
    label: string;
    value: string;
  };
}

// Difficulty Badge Component
function DifficultyBadge({ level }: { level: TrainingMode['difficulty'] }) {
  const colors = {
    Beginner: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    Intermediate: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    Advanced: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    Pro: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  };

  return (
    <Badge className={`${colors[level]} text-xs font-medium`}>
      {level}
    </Badge>
  );
}

// Training Mode Card Component
function TrainingModeCard({ mode, onClick }: { mode: TrainingMode; onClick?: () => void }) {
  const content = (
    <motion.div
      variants={itemVariants}
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      className={`relative overflow-hidden rounded-2xl bg-slate-800/40 border ${
        mode.featured ? 'border-amber-500/40' : 'border-slate-700/50'
      } hover:border-slate-500/50 transition-all duration-300 group cursor-pointer h-full`}
    >
      {/* Glow Effect */}
      <div
        className={`absolute -inset-1 ${mode.glowColor} opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-500`}
      />

      {/* Featured Banner */}
      {mode.featured && (
        <div className="absolute top-0 right-0">
          <div className="bg-gradient-to-l from-amber-500 to-amber-600 text-white text-xs font-bold px-4 py-1 rounded-bl-xl">
            FEATURED
          </div>
        </div>
      )}

      <div className="relative p-6 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div
            className={`w-16 h-16 rounded-2xl ${mode.gradient} flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow`}
          >
            {mode.icon}
          </div>
          <div className="flex flex-col items-end gap-2">
            <DifficultyBadge level={mode.difficulty} />
            {!mode.locked && (
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <Clock className="w-3 h-3" />
                {mode.duration}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">
            {mode.subtitle}
          </p>
          <h3 className="text-xl font-bold text-white mb-2 group-hover:text-emerald-400 transition-colors">
            {mode.title}
          </h3>
          <p className="text-slate-400 text-sm mb-4 line-clamp-2">
            {mode.description}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-700/50">
          {mode.locked ? (
            <div className="flex items-center gap-2 text-slate-500">
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                <Activity className="w-4 h-4" />
              </div>
              <span className="text-sm">Locked</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-amber-400">
                <Star className="w-4 h-4" />
                <span className="text-sm font-bold">+{mode.xpReward} XP</span>
              </div>
              {mode.stats && (
                <span className="text-xs text-slate-500 ml-2">
                  {mode.stats.label}: {mode.stats.value}
                </span>
              )}
            </div>
          )}

          <motion.div
            className={`flex items-center gap-1 text-sm font-medium ${
              mode.locked ? 'text-slate-500' : 'text-emerald-400'
            }`}
            whileHover={{ x: 4 }}
          >
            {mode.locked ? (
              'Complete Beginner Modes'
            ) : (
              <>
                Start
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );

  if (mode.locked) {
    return content;
  }

  if (onClick) {
    return (
      <div onClick={onClick} className="h-full">
        {content}
      </div>
    );
  }

  return (
    <Link href={mode.href} className="h-full block">
      {content}
    </Link>
  );
}

// Quick Stat Card
function QuickStatCard({
  icon: Icon,
  label,
  value,
  subtext,
  color,
  trend,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  subtext?: string;
  color: string;
  trend?: { value: string; positive: boolean };
}) {
  return (
    <motion.div
      variants={itemVariants}
      className="relative overflow-hidden rounded-xl bg-slate-800/40 border border-slate-700/50 p-4 group hover:border-slate-500/50 transition-all"
    >
      <div className={`absolute inset-0 ${color} opacity-0 group-hover:opacity-10 transition-opacity`} />
      <div className="relative flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-slate-400 text-xs uppercase tracking-wider">{label}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-white">{value}</p>
            {trend && (
              <span
                className={`text-xs font-medium ${
                  trend.positive ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {trend.positive ? '+' : ''}
                {trend.value}
              </span>
            )}
          </div>
          {subtext && <p className="text-slate-500 text-xs mt-0.5">{subtext}</p>}
        </div>
      </div>
    </motion.div>
  );
}

// Progress Card Component
function ProgressCard() {
  const weeklyGoal = 70; // 70% progress
  const sessionsThisWeek = 12;
  const targetSessions = 20;

  return (
    <motion.div
      variants={itemVariants}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800/60 to-slate-800/40 border border-slate-700/50 p-6"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl" />

      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-white font-bold">Weekly Progress</h3>
              <p className="text-slate-400 text-sm">
                {sessionsThisWeek} of {targetSessions} sessions completed
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-emerald-400">{weeklyGoal}%</span>
          </div>
        </div>

        <div className="relative h-3 bg-slate-700/50 rounded-full overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${weeklyGoal}%` }}
            transition={{ duration: 1, delay: 0.5, ease: 'easeOut' }}
          />
          {/* Animated shimmer effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
        </div>

        <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
          <span>Keep going! 8 more sessions to reach your goal</span>
          <span className="text-emerald-400 font-medium">On Track</span>
        </div>
      </div>
    </motion.div>
  );
}

// Recent Activity Component
function RecentActivity() {
  const activities = [
    { mode: '501 vs DartBot', result: 'Win', score: '3-2', time: '2h ago', color: 'text-emerald-400' },
    { mode: 'Finish Training', result: 'Practice', score: '12/20', time: '5h ago', color: 'text-amber-400' },
    { mode: 'Around the Clock', result: 'Complete', score: '3:42', time: '1d ago', color: 'text-blue-400' },
  ];

  return (
    <motion.div variants={itemVariants} className="space-y-3">
      <h3 className="text-white font-bold flex items-center gap-2">
        <Activity className="w-4 h-4 text-emerald-400" />
        Recent Activity
      </h3>
      <div className="space-y-2">
        {activities.map((activity, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/30 hover:border-slate-600/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <div>
                <p className="text-white text-sm font-medium">{activity.mode}</p>
                <p className="text-slate-500 text-xs">{activity.time}</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-sm font-bold ${activity.color}`}>{activity.result}</p>
              <p className="text-slate-500 text-xs">{activity.score}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// Main Training Hub Page
export default function TrainingHubPage() {
  const router = useRouter();
  const { setConfig } = useTraining();

  // Training modes configuration
  const trainingModes: TrainingMode[] = [
    {
      id: '501-dartbot',
      title: '501 vs DartBot',
      subtitle: 'Classic Practice',
      description: 'Play classic 501 against AI opponents. Choose from 5 difficulty levels to match your skill.',
      icon: <Target className="w-8 h-8 text-white" />,
      color: 'bg-emerald-500',
      gradient: 'bg-gradient-to-br from-emerald-500 to-teal-600',
      glowColor: 'bg-emerald-500',
      href: '/app/play/training/501',
      difficulty: 'Beginner',
      duration: '10-20 min',
      xpReward: 100,
      featured: true,
      stats: { label: 'Win Rate', value: '64%' },
    },
    {
      id: '121-dartbot',
      title: '121 vs DartBot',
      subtitle: 'Quick Format',
      description: 'Fast-paced 121 practice. Perfect for quick games and improving your checkout speed.',
      icon: <Zap className="w-8 h-8 text-white" />,
      color: 'bg-blue-500',
      gradient: 'bg-gradient-to-br from-blue-500 to-cyan-600',
      glowColor: 'bg-blue-500',
      href: '/app/play/training/121',
      difficulty: 'Beginner',
      duration: '5-10 min',
      xpReward: 75,
    },
    {
      id: 'finish-training',
      title: 'Finish Training',
      subtitle: 'Checkout Practice',
      description: 'Master your checkouts with targeted practice. Work on specific ranges from 2-170.',
      icon: <Flame className="w-8 h-8 text-white" />,
      color: 'bg-orange-500',
      gradient: 'bg-gradient-to-br from-orange-500 to-red-600',
      glowColor: 'bg-orange-500',
      href: '/app/play/training/finish',
      difficulty: 'Intermediate',
      duration: '15-30 min',
      xpReward: 150,
      stats: { label: 'Accuracy', value: '68%' },
    },
    {
      id: 'pdc-challenge',
      title: 'PDC Challenge',
      subtitle: 'Pro Routine',
      description: 'Professional practice routine used by PDC players. Test your skills against the best.',
      icon: <Crown className="w-8 h-8 text-white" />,
      color: 'bg-amber-500',
      gradient: 'bg-gradient-to-br from-amber-500 to-yellow-600',
      glowColor: 'bg-amber-500',
      href: '/app/play/training/pdc-challenge',
      difficulty: 'Pro',
      duration: '30-45 min',
      xpReward: 300,
    },
    {
      id: 'jdc-challenge',
      title: 'JDC Challenge',
      subtitle: 'Development',
      description: 'Junior Darts Corporation training routine. Build fundamentals and consistency.',
      icon: <TrendingUp className="w-8 h-8 text-white" />,
      color: 'bg-purple-500',
      gradient: 'bg-gradient-to-br from-purple-500 to-pink-600',
      glowColor: 'bg-purple-500',
      href: '/app/play/training/jdc-challenge',
      difficulty: 'Intermediate',
      duration: '20-30 min',
      xpReward: 200,
    },
    {
      id: 'killer',
      title: 'Killer Training',
      subtitle: 'Elimination',
      description: 'Strategic elimination game. Perfect for practicing accuracy under pressure.',
      icon: <Crosshair className="w-8 h-8 text-white" />,
      color: 'bg-rose-500',
      gradient: 'bg-gradient-to-br from-rose-500 to-pink-600',
      glowColor: 'bg-rose-500',
      href: '/app/play/training/killer',
      difficulty: 'Advanced',
      duration: '15-25 min',
      xpReward: 175,
    },
    {
      id: 'around-the-clock',
      title: 'Around the Clock',
      subtitle: 'Accuracy',
      description: 'Hit every number from 1-20 in sequence. Great for improving overall accuracy.',
      icon: <Clock className="w-8 h-8 text-white" />,
      color: 'bg-indigo-500',
      gradient: 'bg-gradient-to-br from-indigo-500 to-violet-600',
      glowColor: 'bg-indigo-500',
      href: '/app/play/training/around-the-clock',
      difficulty: 'Beginner',
      duration: '10-20 min',
      xpReward: 125,
      stats: { label: 'Best Time', value: '2:34' },
    },
    {
      id: 'bobs-27',
      title: "Bob's 27",
      subtitle: 'Doubles Practice',
      description: 'Classic doubles practice game. Start with 27 points and work your way up.',
      icon: <Dices className="w-8 h-8 text-white" />,
      color: 'bg-cyan-500',
      gradient: 'bg-gradient-to-br from-cyan-500 to-blue-600',
      glowColor: 'bg-cyan-500',
      href: '/app/play/training/bobs-27',
      difficulty: 'Intermediate',
      duration: '10-15 min',
      xpReward: 100,
    },
    {
      id: 'form-analysis',
      title: 'Form Analysis',
      subtitle: 'AI Powered',
      description: 'Record and analyze your throwing form. Get AI-powered feedback and tips.',
      icon: <BarChart3 className="w-8 h-8 text-white" />,
      color: 'bg-slate-500',
      gradient: 'bg-gradient-to-br from-slate-500 to-slate-600',
      glowColor: 'bg-slate-500',
      href: '/app/play/training/form-analysis',
      difficulty: 'Advanced',
      duration: '20-30 min',
      xpReward: 250,
      locked: true,
    },
  ];

  const handleModeClick = (mode: TrainingMode) => {
    if (mode.id === '501-dartbot') {
      setConfig({
        mode: '501',
        botAverage: 50,
        bestOf: 3,
        doubleOut: true,
      });
      router.push(mode.href);
    } else if (mode.id === '121-dartbot') {
      setConfig({
        mode: '121',
        botAverage: 45,
        bestOf: 1,
        doubleOut: true,
      });
      router.push(mode.href);
    }
  };

  return (
    <motion.div
      className="max-w-7xl mx-auto space-y-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header Section */}
      <div className="relative">
        <div className="absolute -top-20 -left-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute -top-10 -right-10 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl" />

        <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <motion.div
              className="flex items-center gap-2 mb-2"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Link
                href="/app/play"
                className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm">Back to Play</span>
              </Link>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider mb-2">
                Practice & Improve
              </p>
              <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
                Training Hub
              </h1>
              <p className="text-slate-400 mt-2 text-lg max-w-2xl">
                Master your skills with AI-powered training modes. Track progress, earn XP, and become a better player.
              </p>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-4"
          >
            <div className="text-right">
              <p className="text-slate-400 text-sm">Training Level</p>
              <p className="text-2xl font-bold text-white">Level 12</p>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Award className="w-8 h-8 text-white" />
            </div>
          </motion.div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <QuickStatCard
          icon={Target}
          label="Sessions"
          value="48"
          subtext="This month"
          color="bg-emerald-500/20"
          trend={{ value: '12%', positive: true }}
        />
        <QuickStatCard
          icon={Flame}
          label="Current Streak"
          value="5"
          subtext="Days"
          color="bg-orange-500/20"
          trend={{ value: '2', positive: true }}
        />
        <QuickStatCard
          icon={BarChart3}
          label="Avg Score"
          value="72.4"
          subtext="3-dart average"
          color="bg-blue-500/20"
          trend={{ value: '3.2', positive: true }}
        />
        <QuickStatCard
          icon={Trophy}
          label="Best Checkout"
          value="136"
          subtext="Personal record"
          color="bg-amber-500/20"
        />
      </div>

      {/* Progress and Activity Row */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <ProgressCard />
        </div>
        <div className="md:col-span-1">
          <RecentActivity />
        </div>
      </div>

      {/* Featured Mode */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-amber-400 text-sm font-semibold uppercase tracking-wider mb-1">
              Recommended
            </p>
            <h2 className="text-2xl font-bold text-white">Featured Training</h2>
          </div>
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
            <Star className="w-3 h-3 mr-1" />
            Popular
          </Badge>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {trainingModes
            .filter((mode) => mode.featured)
            .map((mode) => (
              <TrainingModeCard key={mode.id} mode={mode} onClick={() => handleModeClick(mode)} />
            ))}

          {/* Special Promo Card */}
          <motion.div
            variants={itemVariants}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600/20 to-teal-600/20 border border-emerald-500/30 p-6"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/20 rounded-full blur-3xl" />
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <Cpu className="w-7 h-7 text-white" />
                </div>
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  AI Powered
                </Badge>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Adaptive Difficulty</h3>
              <p className="text-slate-300 text-sm mb-4">
                Our AI analyzes your performance and automatically adjusts bot difficulty to keep you challenged.
              </p>
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  5 Difficulty Levels
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  Real-time Calibration
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* All Training Modes */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-1">
              All Modes
            </p>
            <h2 className="text-2xl font-bold text-white">Choose Your Training</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-sm">{trainingModes.length} modes available</span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {trainingModes
            .filter((mode) => !mode.featured)
            .map((mode) => (
              <TrainingModeCard key={mode.id} mode={mode} onClick={() => handleModeClick(mode)} />
            ))}
        </div>
      </div>

      {/* Tips Section */}
      <motion.div
        variants={itemVariants}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800/60 to-slate-800/40 border border-slate-700/50 p-6"
      >
        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="relative flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
            <Gamepad2 className="w-6 h-6 text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-bold mb-1">Training Tip</h3>
            <p className="text-slate-400 text-sm">
              Consistency is key! Try to complete at least 3 training sessions per week to see steady improvement in your game. Focus on one weak area at a time.
            </p>
          </div>
          <Button
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
            onClick={() => toast.info('More tips coming soon!')}
          >
            View All Tips
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

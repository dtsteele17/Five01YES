'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTraining } from '@/lib/context/TrainingContext';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Target,
  Flame,
  Crown,
  TrendingUp,
  Dices,
  Clock,
  BarChart3,
  Zap,
  ChevronRight,
  Star,
  ArrowLeft,
  Activity,
  Trophy,
  Cpu,
  Play,
  Minus,
  Plus,
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
  locked?: boolean;
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

// Standard Training Mode Card Component
function TrainingModeCard({ mode, onClick }: { mode: TrainingMode; onClick?: () => void }) {
  const content = (
    <motion.div
      variants={itemVariants}
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      className="relative overflow-hidden rounded-2xl bg-slate-800/40 border border-slate-700/50 hover:border-slate-500/50 transition-all duration-300 group cursor-pointer h-full"
    >
      {/* Glow Effect */}
      <div
        className={`absolute -inset-1 ${mode.glowColor} opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-500`}
      />

      <div className="relative p-5 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div
            className={`w-12 h-12 rounded-xl ${mode.gradient} flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow`}
          >
            {mode.icon}
          </div>
          <DifficultyBadge level={mode.difficulty} />
        </div>

        {/* Content */}
        <div className="flex-1">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">
            {mode.subtitle}
          </p>
          <h3 className="text-lg font-bold text-white mb-1 group-hover:text-emerald-400 transition-colors">
            {mode.title}
          </h3>
          <p className="text-slate-400 text-sm line-clamp-2">
            {mode.description}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-700/50 mt-3">
          <div className="flex items-center gap-1 text-amber-400">
            <Star className="w-3 h-3" />
            <span className="text-xs font-bold">+{mode.xpReward} XP</span>
          </div>

          <motion.div
            className="flex items-center gap-1 text-sm font-medium text-emerald-400"
            whileHover={{ x: 4 }}
          >
            Start
            <ChevronRight className="w-4 h-4" />
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
}: {
  icon: typeof Target;
  label: string;
  value: string;
  subtext?: string;
  color: string;
}) {
  return (
    <motion.div
      variants={itemVariants}
      className="relative overflow-hidden rounded-xl bg-slate-800/40 border border-slate-700/50 p-4 group hover:border-slate-500/50 transition-all"
    >
      <div className={`absolute inset-0 ${color} opacity-0 group-hover:opacity-10 transition-opacity`} />
      <div className="relative flex items-center gap-4">
        <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-slate-400 text-xs uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {subtext && <p className="text-slate-500 text-xs mt-0.5">{subtext}</p>}
        </div>
      </div>
    </motion.div>
  );
}

// DartBot Config Card (Large Featured Card)
function DartBotConfigCard() {
  const router = useRouter();
  const { setConfig } = useTraining();
  
  const [botLevel, setBotLevel] = useState(3);
  const [gameMode, setGameMode] = useState<301 | 501>(501);
  const [bestOf, setBestOf] = useState(3);

  const botLevels = [
    { level: 1, avg: 25, label: 'Beginner' },
    { level: 2, avg: 35, label: 'Casual' },
    { level: 3, avg: 50, label: 'Intermediate' },
    { level: 4, avg: 65, label: 'Advanced' },
    { level: 5, avg: 80, label: 'Pro' },
  ];

  const handleStart = () => {
    const selectedLevel = botLevels.find(l => l.level === botLevel);
    setConfig({
      mode: gameMode === 301 ? '301' : '501',
      botAverage: selectedLevel?.avg || 50,
      bestOf: bestOf,
      doubleOut: true,
    });
    router.push('/app/play/training/501');
  };

  return (
    <motion.div
      variants={itemVariants}
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600/20 via-slate-800/60 to-teal-600/20 border border-emerald-500/40 p-8"
    >
      {/* Background Effects */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl" />
      
      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-2xl">
              <Cpu className="w-10 h-10 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  AI Opponent
                </Badge>
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                  <Star className="w-3 h-3 mr-1" />
                  +100 XP
                </Badge>
              </div>
              <h2 className="text-3xl font-black text-white">DartBot Training</h2>
              <p className="text-slate-400">Practice against AI with adjustable difficulty</p>
            </div>
          </div>
          <div className="text-right hidden md:block">
            <p className="text-slate-400 text-sm">Win Rate</p>
            <p className="text-2xl font-bold text-emerald-400">64%</p>
          </div>
        </div>

        {/* Configuration Options */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Bot Level Selector */}
          <div className="bg-slate-900/50 rounded-2xl p-5 border border-slate-700/50">
            <label className="text-slate-400 text-sm font-medium mb-3 block">
              Bot Level
            </label>
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setBotLevel(Math.max(1, botLevel - 1))}
                className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
              >
                <Minus className="w-4 h-4 text-slate-300" />
              </button>
              <div className="text-center">
                <span className="text-3xl font-black text-white">{botLevel}</span>
                <p className="text-xs text-slate-500">
                  {botLevels.find(l => l.level === botLevel)?.label}
                </p>
              </div>
              <button
                onClick={() => setBotLevel(Math.min(5, botLevel + 1))}
                className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
              >
                <Plus className="w-4 h-4 text-slate-300" />
              </button>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                style={{ width: `${(botLevel / 5) * 100}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center">
              Avg: {botLevels.find(l => l.level === botLevel)?.avg}
            </p>
          </div>

          {/* Game Mode Selector */}
          <div className="bg-slate-900/50 rounded-2xl p-5 border border-slate-700/50">
            <label className="text-slate-400 text-sm font-medium mb-3 block">
              Game Mode
            </label>
            <div className="flex gap-3">
              {[301, 501].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setGameMode(mode as 301 | 501)}
                  className={`flex-1 py-4 rounded-xl font-bold text-lg transition-all ${
                    gameMode === mode
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-3 text-center">
              {gameMode === 301 ? 'Quick format - Fast paced' : 'Classic format - Standard play'}
            </p>
          </div>

          {/* Legs Selector */}
          <div className="bg-slate-900/50 rounded-2xl p-5 border border-slate-700/50">
            <label className="text-slate-400 text-sm font-medium mb-3 block">
              Match Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[1, 3, 5, 7, 9, 11].map((legs) => (
                <button
                  key={legs}
                  onClick={() => setBestOf(legs)}
                  className={`py-2 px-3 rounded-lg font-semibold text-sm transition-all ${
                    bestOf === legs
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  Best of {legs}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-3 text-center">
              First to {(bestOf + 1) / 2} legs wins
            </p>
          </div>
        </div>

        {/* Start Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              Double Out Enabled
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              Stats Tracked
            </div>
          </div>
          <Button 
            onClick={handleStart}
            size="lg"
            className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold px-8 py-6 text-lg shadow-xl hover:shadow-2xl transition-all"
          >
            <Play className="w-5 h-5 mr-2" />
            Start Match
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// Main Training Hub Page
export default function TrainingHubPage() {
  // Training modes configuration (excluding DartBot which is featured separately)
  const otherTrainingModes: TrainingMode[] = [
    {
      id: '121-dartbot',
      title: '121 vs DartBot',
      subtitle: 'Quick Format',
      description: 'Fast-paced 121 practice. Perfect for quick games and improving your checkout speed.',
      icon: <Zap className="w-6 h-6 text-white" />,
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
      icon: <Flame className="w-6 h-6 text-white" />,
      color: 'bg-orange-500',
      gradient: 'bg-gradient-to-br from-orange-500 to-red-600',
      glowColor: 'bg-orange-500',
      href: '/app/play/training/finish',
      difficulty: 'Intermediate',
      duration: '15-30 min',
      xpReward: 150,
    },
    {
      id: 'pdc-challenge',
      title: 'PDC Challenge',
      subtitle: 'Pro Routine',
      description: 'Professional practice routine used by PDC players. Test your skills against the best.',
      icon: <Crown className="w-6 h-6 text-white" />,
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
      icon: <TrendingUp className="w-6 h-6 text-white" />,
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
      icon: <Activity className="w-6 h-6 text-white" />,
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
      icon: <Clock className="w-6 h-6 text-white" />,
      color: 'bg-indigo-500',
      gradient: 'bg-gradient-to-br from-indigo-500 to-violet-600',
      glowColor: 'bg-indigo-500',
      href: '/app/play/training/around-the-clock',
      difficulty: 'Beginner',
      duration: '10-20 min',
      xpReward: 125,
    },
    {
      id: 'bobs-27',
      title: "Bob's 27",
      subtitle: 'Doubles Practice',
      description: 'Classic doubles practice game. Start with 27 points and work your way up.',
      icon: <Dices className="w-6 h-6 text-white" />,
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
      icon: <BarChart3 className="w-6 h-6 text-white" />,
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
              <Trophy className="w-8 h-8 text-white" />
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
        />
        <QuickStatCard
          icon={Flame}
          label="Current Streak"
          value="5"
          subtext="Days"
          color="bg-orange-500/20"
        />
        <QuickStatCard
          icon={BarChart3}
          label="Avg Score"
          value="72.4"
          subtext="3-dart average"
          color="bg-blue-500/20"
        />
        <QuickStatCard
          icon={Trophy}
          label="Best Checkout"
          value="136"
          subtext="Personal record"
          color="bg-amber-500/20"
        />
      </div>

      {/* DartBot Config Card (Large Featured) */}
      <DartBotConfigCard />

      {/* All Other Training Modes */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-1">
              More Training
            </p>
            <h2 className="text-2xl font-bold text-white">Choose Your Training</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-sm">{otherTrainingModes.length} modes available</span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {otherTrainingModes.map((mode) => (
            <TrainingModeCard key={mode.id} mode={mode} />
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
            <BarChart3 className="w-6 h-6 text-blue-400" />
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

'use client';

import { Achievement } from '@/lib/achievements';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Trophy,
  Award,
  Target,
  Zap,
  Crown,
  Star,
  Flame,
  Shield,
  TrendingUp,
  Calendar,
  Users,
  PlusCircle,
  Heart,
  Frown,
  XCircle,
  Snowflake,
  Sparkles,
  ArrowUp,
  Repeat,
  BarChart,
  Clock,
  AlertTriangle,
  Skull,
  X,
  Play,
  Droplet,
  ChevronUp,
  RotateCcw,
  ChevronsUp,
  Swords,
  Laugh,
  MessageCircle,
  Activity,
  Dumbbell,
  CircleDot,
  Timer,
  Beer,
  AlertCircle,
  Home,
  Handshake,
  CheckCircle,
  Lock,
  Cpu,
  Rocket,
  Crosshair,
  Check,
  Disc,
  LucideIcon,
} from 'lucide-react';
import { format } from 'date-fns';

interface AchievementCardProps {
  achievement: Achievement;
}

const iconMap: Record<string, LucideIcon> = {
  trophy: Trophy,
  award: Award,
  target: Target,
  zap: Zap,
  crown: Crown,
  star: Star,
  flame: Flame,
  shield: Shield,
  'trending-up': TrendingUp,
  calendar: Calendar,
  users: Users,
  'plus-circle': PlusCircle,
  heart: Heart,
  frown: Frown,
  'x-circle': XCircle,
  snowflake: Snowflake,
  sparkles: Sparkles,
  'arrow-up': ArrowUp,
  repeat: Repeat,
  'bar-chart': BarChart,
  clock: Clock,
  'alert-triangle': AlertTriangle,
  skull: Skull,
  x: X,
  play: Play,
  droplet: Droplet,
  'chevron-up': ChevronUp,
  'rotate-ccw': RotateCcw,
  'chevrons-up': ChevronsUp,
  swords: Swords,
  laugh: Laugh,
  'message-circle': MessageCircle,
  activity: Activity,
  dumbbell: Dumbbell,
  'circle-dot': CircleDot,
  timer: Timer,
  beer: Beer,
  'alert-circle': AlertCircle,
  home: Home,
  handshake: Handshake,
  cpu: Cpu,
  rocket: Rocket,
  crosshair: Crosshair,
  check: Check,
  disc: Disc,
  factory: Trophy,
  angry: AlertCircle,
};

export function AchievementCard({ achievement }: AchievementCardProps) {
  const Icon = iconMap[achievement.icon] || Trophy;
  const progressPercentage = (achievement.progress / achievement.goal) * 100;

  return (
    <div
      className={`relative p-6 rounded-xl border transition-all ${
        achievement.completed
          ? 'bg-gradient-to-br from-teal-500/10 to-cyan-500/10 border-teal-500/30 shadow-lg shadow-teal-500/10'
          : 'bg-slate-800/30 border-white/10 opacity-75'
      }`}
    >
      {achievement.completed && (
        <div className="absolute top-3 right-3">
          <CheckCircle className="w-6 h-6 text-teal-400" />
        </div>
      )}

      {!achievement.completed && achievement.progress === 0 && (
        <div className="absolute top-3 right-3">
          <Lock className="w-5 h-5 text-gray-500" />
        </div>
      )}

      <div className="flex items-start gap-4 mb-4">
        <div
          className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${
            achievement.completed
              ? 'bg-gradient-to-br from-teal-500 to-cyan-500'
              : 'bg-slate-700/50'
          }`}
        >
          <Icon className={`w-7 h-7 ${achievement.completed ? 'text-white' : 'text-gray-400'}`} />
        </div>

        <div className="flex-1 min-w-0">
          <h3
            className={`font-semibold text-lg mb-1 ${
              achievement.completed ? 'text-white' : 'text-gray-300'
            }`}
          >
            {achievement.title}
          </h3>
          <p
            className={`text-sm ${
              achievement.completed ? 'text-gray-300' : 'text-gray-500'
            }`}
          >
            {achievement.description}
          </p>
        </div>
      </div>

      {achievement.goal > 1 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className={achievement.completed ? 'text-gray-300' : 'text-gray-500'}>
              Progress
            </span>
            <span
              className={`font-semibold ${
                achievement.completed ? 'text-teal-400' : 'text-gray-400'
              }`}
            >
              {achievement.progress}/{achievement.goal}
            </span>
          </div>
          <Progress
            value={progressPercentage}
            className={`h-2 ${
              achievement.completed ? 'bg-teal-900/30' : 'bg-slate-700/50'
            }`}
          />
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-white/10">
        {achievement.reward && (
          <Badge
            variant="outline"
            className={
              achievement.completed
                ? 'border-teal-500/30 text-teal-400 bg-teal-500/10'
                : 'border-gray-600 text-gray-500 bg-gray-800/30'
            }
          >
            {achievement.reward}
          </Badge>
        )}

        {achievement.completed && achievement.completedDate && (
          <span className="text-xs text-gray-400">
            {format(new Date(achievement.completedDate), 'MMM d, yyyy')}
          </span>
        )}

        {!achievement.completed && achievement.progress > 0 && (
          <span className="text-xs text-gray-500">
            {Math.round(progressPercentage)}% complete
          </span>
        )}
      </div>
    </div>
  );
}

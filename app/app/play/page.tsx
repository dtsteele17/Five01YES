'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  Dices,
  Clock,
  BarChart3,
} from 'lucide-react';

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
      <div className="relative overflow-hidden rounded-2xl bg-slate-800/30 border border-slate-700/30 p-6 opacity-50">
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
    );
  }

  return (
    <Link href={href}>
      <Card className={`relative overflow-hidden group cursor-pointer transition-all duration-300 hover:scale-[1.02] ${featured ? 'bg-slate-800/60 border-emerald-500/30' : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600/50'} p-6 h-full`}>
        <div className={`absolute inset-0 ${color} opacity-0 group-hover:opacity-10 transition-opacity`} />
        
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-4">
            <div className={`w-14 h-14 rounded-xl ${color} flex items-center justify-center shadow-lg`}>
              {icon}
            </div>
            {badge && <Badge className={badge.color}>{badge.text}</Badge>}
          </div>

          <div className="mb-3">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">{subtitle}</p>
            <h3 className="text-xl font-bold text-white mt-1 group-hover:text-emerald-400 transition-colors">{title}</h3>
          </div>

          <p className="text-slate-400 text-sm mb-4 line-clamp-2">{description}</p>

          <div className="flex items-center justify-between">
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
  );
}

// Training Card Component
function TrainingCard({ href, title, description, icon, color }: { 
  href: string; 
  title: string; 
  description: string; 
  icon: React.ReactNode; 
  color: string;
}) {
  return (
    <Link href={href}>
      <Card className="group cursor-pointer bg-slate-800/30 border-slate-700/50 hover:border-slate-600/50 transition-all p-5">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-white font-bold group-hover:text-emerald-400 transition-colors">{title}</h4>
            <p className="text-slate-400 text-sm truncate">{description}</p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
        </div>
      </Card>
    </Link>
  );
}

// Stats Mini Card
function StatMiniCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div className="flex items-center gap-3 p-4 bg-slate-800/40 rounded-xl border border-slate-700/50">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-lg font-bold text-white">{value}</p>
        <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}

export default function PlayPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider mb-2">Game Modes</p>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">Choose Your Match</h1>
          <p className="text-slate-400 mt-2 text-lg">Select a mode to start playing</p>
        </div>
      </div>

      {/* Main Game Modes Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
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

        {/* Training Hub Card */}
        <Link href="#training">
          <Card className="h-full cursor-pointer bg-gradient-to-br from-rose-500/20 to-orange-500/20 border-rose-500/30 hover:border-rose-500/50 transition-all p-6 group">
            <div className="flex flex-col h-full">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-rose-500 to-orange-600 flex items-center justify-center mb-4 shadow-lg">
                <Target className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-rose-400 uppercase tracking-wider font-semibold">Practice</p>
                <h3 className="text-xl font-bold text-white mt-1">Training Hub</h3>
                <p className="text-slate-300 text-sm mt-2">Master your skills with AI opponents</p>
              </div>
              <div className="flex items-center text-rose-400 text-sm font-medium mt-4">
                Explore Modes
                <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </Card>
        </Link>
      </div>

      {/* Training Section */}
      <div id="training" className="pt-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-rose-400 text-sm font-semibold uppercase tracking-wider mb-2">Practice</p>
            <h2 className="text-2xl font-bold text-white">Training Modes</h2>
          </div>
          <Badge className="bg-slate-700 text-slate-300">
            <Cpu className="w-3 h-3 mr-1" />
            AI Powered
          </Badge>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <TrainingCard
            href="/app/play/training/501"
            title="501 vs Dartbot"
            description="Classic 501 against AI opponent"
            icon={<Target className="w-6 h-6 text-white" />}
            color="bg-emerald-600"
          />
          <TrainingCard
            href="/app/play/training/finish"
            title="Finish Training"
            description="Practice checkouts and doubles"
            icon={<Flame className="w-6 h-6 text-white" />}
            color="bg-orange-600"
          />
          <TrainingCard
            href="/app/play/training/pdc-challenge"
            title="PDC Challenge"
            description="Professional practice routine"
            icon={<Crown className="w-6 h-6 text-white" />}
            color="bg-amber-600"
          />
          <TrainingCard
            href="/app/play/training/jdc-challenge"
            title="JDC Challenge"
            description="Junior practice routine"
            icon={<TrendingUp className="w-6 h-6 text-white" />}
            color="bg-blue-600"
          />
          <TrainingCard
            href="/app/play/training/killer"
            title="Killer Training"
            description="Elimination style practice"
            icon={<Dices className="w-6 h-6 text-white" />}
            color="bg-rose-600"
          />
          <TrainingCard
            href="/app/play/training/clock"
            title="Around the Clock"
            description="Hit every number in sequence"
            icon={<Clock className="w-6 h-6 text-white" />}
            color="bg-purple-600"
          />
        </div>
      </div>

      {/* Quick Stats Section */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
        <StatMiniCard label="Matches Today" value="0" icon={Zap} color="bg-emerald-500/20" />
        <StatMiniCard label="Win Streak" value="0" icon={Flame} color="bg-orange-500/20" />
        <StatMiniCard label="Best Average" value="--" icon={BarChart3} color="bg-blue-500/20" />
        <StatMiniCard label="Training Time" value="0h" icon={Clock} color="bg-purple-500/20" />
      </div>
    </div>
  );
}

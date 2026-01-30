'use client';

import { Trophy, Users, X, Award } from 'lucide-react';

interface PlayoffSelectorProps {
  value: 'top8' | 'top4' | 'top2_final' | 'none';
  onChange: (value: 'top8' | 'top4' | 'top2_final' | 'none') => void;
}

const options = [
  {
    value: 'top8' as const,
    icon: Award,
    title: 'Top 8 Playoff',
    description: 'Top 8 teams compete in quarter-finals, semi-finals and finals',
  },
  {
    value: 'top4' as const,
    icon: Trophy,
    title: 'Top 4 Playoff',
    description: 'Top 4 teams compete in semi-finals and finals',
  },
  {
    value: 'top2_final' as const,
    icon: Users,
    title: 'Top 2 Final',
    description: 'Top 2 teams compete in a final match',
  },
  {
    value: 'none' as const,
    icon: X,
    title: 'No Playoff',
    description: 'Winner determined by regular season standings',
  },
];

export function PlayoffSelector({ value, onChange }: PlayoffSelectorProps) {
  return (
    <div className="grid gap-3">
      {options.map((option) => {
        const Icon = option.icon;
        const isSelected = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`p-4 rounded-lg border-2 transition-all text-left ${
              isSelected
                ? 'border-teal-500 bg-teal-500/10'
                : 'border-white/10 bg-slate-800/30 hover:border-white/20'
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  isSelected
                    ? 'bg-gradient-to-br from-teal-500 to-cyan-500'
                    : 'bg-slate-700'
                }`}
              >
                <Icon className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="text-white font-semibold mb-1">{option.title}</div>
                <div className="text-gray-400 text-sm">{option.description}</div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

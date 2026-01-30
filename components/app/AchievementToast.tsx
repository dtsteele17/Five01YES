'use client';

import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AchievementToastProps {
  achievement: {
    icon: string;
    name: string;
    category: string;
    xp: number;
  };
  onView?: () => void;
}

export function AchievementToast({ achievement, onView }: AchievementToastProps) {
  return (
    <div className="flex items-start space-x-3 p-4 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-lg">
      <div className="flex-shrink-0">
        <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full flex items-center justify-center">
          <Trophy className="w-5 h-5 text-white" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2 mb-1">
          <span className="text-lg">{achievement.icon}</span>
          <h4 className="text-sm font-bold text-white">{achievement.name}</h4>
        </div>
        <p className="text-xs text-gray-300">
          {achievement.category} • +{achievement.xp} XP
        </p>
      </div>

      {onView && (
        <Button
          size="sm"
          variant="outline"
          onClick={onView}
          className="flex-shrink-0 bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 h-7 px-3 text-xs"
        >
          View
        </Button>
      )}
    </div>
  );
}

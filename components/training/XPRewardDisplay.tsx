'use client';

import { motion } from 'framer-motion';
import { Star, TrendingUp, Target, Zap } from 'lucide-react';
import { XPResult } from '@/lib/training/xpSystem';

interface XPRewardDisplayProps {
  xpResult: XPResult;
  showBreakdown?: boolean;
}

export function XPRewardDisplay({ xpResult, showBreakdown = true }: XPRewardDisplayProps) {
  const { totalXP, baseXP, performanceBonus, completionBonus, performanceRating } = xpResult;

  const getRatingColor = (rating: string) => {
    switch (rating) {
      case 'Excellent': return 'text-purple-400';
      case 'Great': return 'text-emerald-400';
      case 'Good': return 'text-blue-400';
      case 'Fair': return 'text-yellow-400';
      case 'Poor': return 'text-red-400';
      default: return 'text-slate-400';
    }
  };

  const getRatingBg = (rating: string) => {
    switch (rating) {
      case 'Excellent': return 'from-purple-500/20 to-pink-500/20 border-purple-500/30';
      case 'Great': return 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30';
      case 'Good': return 'from-blue-500/20 to-cyan-500/20 border-blue-500/30';
      case 'Fair': return 'from-yellow-500/20 to-amber-500/20 border-yellow-500/30';
      case 'Poor': return 'from-red-500/20 to-rose-500/20 border-red-500/30';
      default: return 'from-slate-500/20 to-gray-500/20 border-slate-500/30';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
      className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-4 sm:p-6 mb-6"
    >
      {/* Total XP Header */}
      <div className="text-center mb-4">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.4, type: 'spring', stiffness: 300 }}
          className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 mb-3 shadow-lg shadow-amber-500/20"
        >
          <Star className="w-8 h-8 text-white" />
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-3xl sm:text-5xl font-black text-white mb-1"
        >
          +{totalXP}
        </motion.h2>
        <p className="text-slate-400 text-sm uppercase tracking-wider">XP Earned</p>
      </div>

      {/* Performance Rating Badge */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className={`text-center py-2 px-4 rounded-lg bg-gradient-to-r ${getRatingBg(performanceRating)} border mb-4`}
      >
        <span className={`font-bold ${getRatingColor(performanceRating)}`}>
          {performanceRating} Performance
        </span>
      </motion.div>

      {/* XP Breakdown */}
      {showBreakdown && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="space-y-2"
        >
          <div className="flex items-center justify-between text-sm py-2 border-b border-slate-700/50">
            <div className="flex items-center gap-2 text-slate-400">
              <Target className="w-4 h-4" />
              <span>Base XP</span>
            </div>
            <span className="text-white font-medium">+{baseXP}</span>
          </div>
          
          {completionBonus > 0 && (
            <div className="flex items-center justify-between text-sm py-2 border-b border-slate-700/50">
              <div className="flex items-center gap-2 text-slate-400">
                <Zap className="w-4 h-4 text-emerald-400" />
                <span>Completion Bonus</span>
              </div>
              <span className="text-emerald-400 font-medium">+{completionBonus}</span>
            </div>
          )}
          
          {performanceBonus !== 0 && (
            <div className="flex items-center justify-between text-sm py-2">
              <div className="flex items-center gap-2 text-slate-400">
                <TrendingUp className={`w-4 h-4 ${performanceBonus > 0 ? 'text-blue-400' : 'text-red-400'}`} />
                <span>Performance Bonus</span>
              </div>
              <span className={`font-medium ${performanceBonus > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                {performanceBonus > 0 ? '+' : ''}{performanceBonus}
              </span>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

// Mini XP display for inline use
export function XPBadge({ amount }: { amount: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium border border-amber-500/30">
      <Star className="w-3 h-3" />
      +{amount} XP
    </span>
  );
}

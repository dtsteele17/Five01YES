'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Trophy, Target, Flame, Shield, Crown, Skull,
  ChevronRight, ArrowLeft, Loader2, Sparkles, Swords,
} from 'lucide-react';

const DIFFICULTIES = [
  {
    id: 'rookie',
    label: 'Rookie',
    icon: Target,
    color: 'emerald',
    description: 'Just starting out. Opponents are forgiving and the road to promotion is smooth.',
    bgClass: 'from-emerald-500/20 to-emerald-600/10',
    borderClass: 'border-emerald-500/30',
    badgeClass: 'bg-emerald-500/20 text-emerald-400',
    iconClass: 'text-emerald-400',
    glowClass: 'shadow-emerald-500/20',
  },
  {
    id: 'amateur',
    label: 'Amateur',
    icon: Shield,
    color: 'blue',
    description: 'A fair challenge. Opponents have their moments and promotion takes consistent form.',
    bgClass: 'from-blue-500/20 to-blue-600/10',
    borderClass: 'border-blue-500/30',
    badgeClass: 'bg-blue-500/20 text-blue-400',
    iconClass: 'text-blue-400',
    glowClass: 'shadow-blue-500/20',
  },
  {
    id: 'semi-pro',
    label: 'Semi-Pro',
    icon: Flame,
    color: 'amber',
    description: 'The real thing. Opponents are competitive and you\'ll need to earn every win.',
    bgClass: 'from-amber-500/20 to-amber-600/10',
    borderClass: 'border-amber-500/30',
    badgeClass: 'bg-amber-500/20 text-amber-400',
    iconClass: 'text-amber-400',
    glowClass: 'shadow-amber-500/20',
  },
  {
    id: 'pro',
    label: 'Pro',
    icon: Trophy,
    color: 'orange',
    description: 'Tough opponents, tight promotion gates. Only consistent performers progress.',
    bgClass: 'from-orange-500/20 to-orange-600/10',
    borderClass: 'border-orange-500/30',
    badgeClass: 'bg-orange-500/20 text-orange-400',
    iconClass: 'text-orange-400',
    glowClass: 'shadow-orange-500/20',
  },
  {
    id: 'world-class',
    label: 'World Class',
    icon: Crown,
    color: 'purple',
    description: 'Elite-level opponents from the start. Promotion demands excellence.',
    bgClass: 'from-purple-500/20 to-purple-600/10',
    borderClass: 'border-purple-500/30',
    badgeClass: 'bg-purple-500/20 text-purple-400',
    iconClass: 'text-purple-400',
    glowClass: 'shadow-purple-500/20',
  },
  {
    id: 'nightmare',
    label: 'Nightmare',
    icon: Skull,
    color: 'red',
    description: 'Unforgiving. Every opponent is dangerous. Only the best survive.',
    bgClass: 'from-red-500/20 to-red-600/10',
    borderClass: 'border-red-500/30',
    badgeClass: 'bg-red-500/20 text-red-400',
    iconClass: 'text-red-400',
    glowClass: 'shadow-red-500/20',
  },
];

const SAVE_SLOTS = [1, 2, 3] as const;

export default function CareerStartPage() {
  const router = useRouter();
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number>(1);
  const [existingSaves, setExistingSaves] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [loadingSaves, setLoadingSaves] = useState(true);
  const [step, setStep] = useState<'difficulty' | 'slot'>('difficulty');

  // Load existing saves on mount
  useState(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc('rpc_get_career_saves');
      if (data?.saves) {
        setExistingSaves(data.saves);
        // Auto-select first empty slot
        const usedSlots = data.saves.map((s: any) => s.save_slot);
        const firstEmpty = SAVE_SLOTS.find(s => !usedSlots.includes(s));
        if (firstEmpty) setSelectedSlot(firstEmpty);
      }
      setLoadingSaves(false);
    })();
  });

  const handleCreate = async () => {
    if (!selectedDifficulty) return;
    setCreating(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('rpc_create_career_profile', {
        p_difficulty: selectedDifficulty,
        p_save_slot: selectedSlot,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Career created!');
      router.push(`/app/career?id=${data.career_id}`);
    } catch (err: any) {
      console.error('Failed to create career:', err);
      toast.error(err.message || 'Failed to create career');
    } finally {
      setCreating(false);
    }
  };

  const selectedDiffData = DIFFICULTIES.find(d => d.id === selectedDifficulty);

  const TIER_NAMES: Record<number, string> = {
    1: 'Local Trials',
    2: 'Pub Leagues',
    3: 'County Circuit',
    4: 'Regional Tour',
    5: 'World Tour',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => step === 'slot' ? setStep('difficulty') : router.push('/app/play')}
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 mb-4">
            <Swords className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-3xl font-black text-white mb-2">Career Mode</h1>
          <p className="text-slate-400">
            {step === 'difficulty'
              ? 'Choose your difficulty. This affects opponent skill and promotion requirements.'
              : 'Pick a save slot for your career.'}
          </p>
        </motion.div>

        {step === 'difficulty' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-3"
          >
            {DIFFICULTIES.map((diff, i) => {
              const Icon = diff.icon;
              const isSelected = selectedDifficulty === diff.id;
              return (
                <motion.div
                  key={diff.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card
                    className={`p-4 cursor-pointer transition-all duration-200 bg-gradient-to-r ${diff.bgClass} border ${
                      isSelected
                        ? `${diff.borderClass} shadow-lg ${diff.glowClass}`
                        : 'border-white/5 hover:border-white/15'
                    }`}
                    onClick={() => setSelectedDifficulty(diff.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-white/5 ${isSelected ? 'ring-2 ring-white/20' : ''}`}>
                        <Icon className={`w-6 h-6 ${diff.iconClass}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-bold text-white">{diff.label}</span>
                          {isSelected && (
                            <Badge className={diff.badgeClass}>Selected</Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-400 line-clamp-2">{diff.description}</p>
                      </div>
                      <ChevronRight className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-slate-600'}`} />
                    </div>
                  </Card>
                </motion.div>
              );
            })}

            <div className="pt-4">
              <Button
                onClick={() => setStep('slot')}
                disabled={!selectedDifficulty}
                className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold py-3 text-lg disabled:opacity-40"
              >
                Continue
                <ChevronRight className="w-5 h-5 ml-1" />
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'slot' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            {/* Selected difficulty recap */}
            {selectedDiffData && (
              <Card className={`p-3 bg-gradient-to-r ${selectedDiffData.bgClass} border ${selectedDiffData.borderClass}`}>
                <div className="flex items-center gap-3">
                  <selectedDiffData.icon className={`w-5 h-5 ${selectedDiffData.iconClass}`} />
                  <span className="text-white font-semibold">{selectedDiffData.label}</span>
                  <span className="text-slate-400 text-sm">difficulty</span>
                </div>
              </Card>
            )}

            {/* Save slots */}
            <div className="space-y-3">
              {SAVE_SLOTS.map(slot => {
                const existing = existingSaves.find((s: any) => s.save_slot === slot);
                const isSelected = selectedSlot === slot;
                const isOccupied = !!existing;

                return (
                  <Card
                    key={slot}
                    className={`p-4 cursor-pointer transition-all duration-200 border ${
                      isSelected
                        ? 'border-amber-500/50 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                        : 'border-white/5 bg-slate-800/50 hover:border-white/15'
                    }`}
                    onClick={() => !isOccupied && setSelectedSlot(slot)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">Save Slot {slot}</span>
                          {isOccupied && (
                            <Badge className="bg-slate-600/50 text-slate-300 text-xs">In Use</Badge>
                          )}
                        </div>
                        {isOccupied ? (
                          <p className="text-sm text-slate-400 mt-1">
                            {TIER_NAMES[existing.tier] || `Tier ${existing.tier}`} • Season {existing.season} • {existing.difficulty}
                          </p>
                        ) : (
                          <p className="text-sm text-slate-500 mt-1">Empty slot</p>
                        )}
                      </div>
                      {!isOccupied && isSelected && (
                        <Sparkles className="w-5 h-5 text-amber-400" />
                      )}
                      {isOccupied && (
                        <span className="text-xs text-slate-500">Abandon in settings</span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>

            <div className="pt-4">
              <Button
                onClick={handleCreate}
                disabled={creating || !selectedDifficulty}
                className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold py-3 text-lg disabled:opacity-40"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Creating Career...
                  </>
                ) : (
                  <>
                    <Swords className="w-5 h-5 mr-2" />
                    Start Career
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

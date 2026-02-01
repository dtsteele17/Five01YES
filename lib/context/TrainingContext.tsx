'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface TrainingConfig {
  mode: '301' | '501' | 'around-the-clock';
  botDifficulty: 'beginner' | 'casual' | 'intermediate' | 'advanced' | 'elite' | 'pro';
  botAverage: number;
  doubleOut: boolean;
  bestOf: 'best-of-1' | 'best-of-3' | 'best-of-5' | 'best-of-7';
  atcOpponent: 'solo' | 'bot';
  atcSettings?: {
    orderMode: 'in_order' | 'random';
    segmentRule: 'singles_only' | 'doubles_only' | 'trebles_only' | 'increase_by_segment';
    includeBull: boolean;
  };
}

interface TrainingContextType {
  config: TrainingConfig | null;
  setConfig: (config: TrainingConfig) => void;
  clearConfig: () => void;
}

const TrainingContext = createContext<TrainingContextType | undefined>(undefined);

export function TrainingProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<TrainingConfig | null>(null);

  const setConfig = (newConfig: TrainingConfig) => {
    setConfigState(newConfig);
  };

  const clearConfig = () => {
    setConfigState(null);
  };

  return (
    <TrainingContext.Provider value={{ config, setConfig, clearConfig }}>
      {children}
    </TrainingContext.Provider>
  );
}

export function useTraining() {
  const context = useContext(TrainingContext);
  if (context === undefined) {
    throw new Error('useTraining must be used within a TrainingProvider');
  }
  return context;
}

export const BOT_DIFFICULTY_CONFIG = {
  beginner: { name: 'Beginner', average: 35, checkoutChance: 0.08 },
  casual: { name: 'Casual', average: 45, checkoutChance: 0.12 },
  intermediate: { name: 'Intermediate', average: 55, checkoutChance: 0.18 },
  advanced: { name: 'Advanced', average: 65, checkoutChance: 0.26 },
  elite: { name: 'Elite', average: 75, checkoutChance: 0.35 },
  pro: { name: 'Pro', average: 85, checkoutChance: 0.45 },
} as const;

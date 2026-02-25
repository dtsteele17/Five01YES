'use client';

import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Target, TrendingUp, Zap, Award } from 'lucide-react';

interface LegStats {
  legNumber: number;
  playerStats: {
    visits: number;
    average: number;
    darts: number;
    highestVisit: number;
    visits100Plus: number;
    visits140Plus: number;
    visits180: number;
    checkout: number | null;
    won: boolean;
  };
  opponentStats: {
    visits: number;
    average: number;
    darts: number;
    highestVisit: number;
    visits100Plus: number;
    visits140Plus: number;
    visits180: number;
    checkout: number | null;
    won: boolean;
  };
}

interface LegByLegStatsProps {
  legStats: LegStats[];
  playerName: string;
  opponentName: string;
}

export function LegByLegStats({ legStats, playerName, opponentName }: LegByLegStatsProps) {
  const [currentLeg, setCurrentLeg] = useState(0);

  const currentStats = legStats[currentLeg];
  
  if (!currentStats) return null;

  const nextLeg = () => {
    if (currentLeg < legStats.length - 1) {
      setCurrentLeg(currentLeg + 1);
    }
  };

  const prevLeg = () => {
    if (currentLeg > 0) {
      setCurrentLeg(currentLeg - 1);
    }
  };

  const StatRow = ({ 
    icon: Icon, 
    label, 
    playerValue, 
    opponentValue, 
    playerWon, 
    opponentWon 
  }: { 
    icon: any; 
    label: string; 
    playerValue: React.ReactNode; 
    opponentValue: React.ReactNode;
    playerWon: boolean;
    opponentWon: boolean;
  }) => (
    <div className="flex items-center justify-between py-2 px-3 bg-slate-800/30 rounded">
      <div className="flex items-center gap-2 text-slate-400 text-sm">
        <Icon className="w-4 h-4" />
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-6">
        <span className={`font-bold w-16 text-right ${playerWon ? 'text-emerald-400' : 'text-slate-300'}`}>
          {playerValue}
        </span>
        <span className={`font-bold w-16 text-right ${opponentWon ? 'text-blue-400' : 'text-slate-300'}`}>
          {opponentValue}
        </span>
      </div>
    </div>
  );

  const fmt = (value: number) => value > 0 ? value.toFixed(1) : '-';
  const fmtInt = (value: number) => value > 0 ? value.toString() : '-';

  return (
    <Card className="bg-slate-800/50 border-slate-700 p-4">
      {/* Header with navigation */}
      <div className="flex items-center justify-between mb-4">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={prevLeg} 
          disabled={currentLeg === 0}
          className="text-slate-400 hover:text-white"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        
        <div className="text-center">
          <h3 className="font-bold text-lg text-white">
            Leg {currentStats.legNumber}
          </h3>
          <div className="text-sm text-slate-400">
            {currentLeg + 1} of {legStats.length}
          </div>
        </div>
        
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={nextLeg} 
          disabled={currentLeg === legStats.length - 1}
          className="text-slate-400 hover:text-white"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Winner indicator */}
      <div className="text-center mb-4">
        {currentStats.playerStats.won ? (
          <div className="text-emerald-400 font-bold">
            <div>🏆 {playerName} won this leg</div>
            <div className="text-sm text-emerald-300 mt-1">
              {currentStats.playerStats.darts} darts thrown
            </div>
          </div>
        ) : currentStats.opponentStats.won ? (
          <div className="text-blue-400 font-bold">
            <div>🏆 {opponentName} won this leg</div>
            <div className="text-sm text-blue-300 mt-1">
              {currentStats.opponentStats.darts} darts thrown
            </div>
          </div>
        ) : (
          <div className="text-slate-500">Leg in progress...</div>
        )}
      </div>

      {/* Column headers */}
      <div className="flex items-center justify-between py-2 px-3 text-sm text-slate-400 border-b border-slate-700 mb-2">
        <div>Stats</div>
        <div className="flex items-center gap-6">
          <span className="w-16 text-right font-medium">{playerName}</span>
          <span className="w-16 text-right font-medium">{opponentName}</span>
        </div>
      </div>

      {/* Stats rows */}
      <div className="space-y-1">
        <StatRow
          icon={Target}
          label="Average"
          playerValue={fmt(currentStats.playerStats.average)}
          opponentValue={fmt(currentStats.opponentStats.average)}
          playerWon={currentStats.playerStats.won}
          opponentWon={currentStats.opponentStats.won}
        />
        
        <StatRow
          icon={TrendingUp}
          label="Darts"
          playerValue={fmtInt(currentStats.playerStats.darts)}
          opponentValue={fmtInt(currentStats.opponentStats.darts)}
          playerWon={currentStats.playerStats.won}
          opponentWon={currentStats.opponentStats.won}
        />
        
        <StatRow
          icon={Zap}
          label="Highest Visit"
          playerValue={fmtInt(currentStats.playerStats.highestVisit)}
          opponentValue={fmtInt(currentStats.opponentStats.highestVisit)}
          playerWon={currentStats.playerStats.won}
          opponentWon={currentStats.opponentStats.won}
        />
        
        <StatRow
          icon={Award}
          label="100+ Visits"
          playerValue={fmtInt(currentStats.playerStats.visits100Plus)}
          opponentValue={fmtInt(currentStats.opponentStats.visits100Plus)}
          playerWon={currentStats.playerStats.won}
          opponentWon={currentStats.opponentStats.won}
        />
        
        <StatRow
          icon={Award}
          label="140+ Visits"
          playerValue={fmtInt(currentStats.playerStats.visits140Plus)}
          opponentValue={fmtInt(currentStats.opponentStats.visits140Plus)}
          playerWon={currentStats.playerStats.won}
          opponentWon={currentStats.opponentStats.won}
        />
        
        <StatRow
          icon={Award}
          label="180s"
          playerValue={fmtInt(currentStats.playerStats.visits180)}
          opponentValue={fmtInt(currentStats.opponentStats.visits180)}
          playerWon={currentStats.playerStats.won}
          opponentWon={currentStats.opponentStats.won}
        />
        
        {(currentStats.playerStats.checkout || currentStats.opponentStats.checkout) && (
          <StatRow
            icon={Target}
            label="Checkout"
            playerValue={currentStats.playerStats.checkout ? fmtInt(currentStats.playerStats.checkout) : '-'}
            opponentValue={currentStats.opponentStats.checkout ? fmtInt(currentStats.opponentStats.checkout) : '-'}
            playerWon={currentStats.playerStats.won}
            opponentWon={currentStats.opponentStats.won}
          />
        )}
      </div>

      {/* Leg navigation dots */}
      <div className="flex justify-center gap-1 mt-4">
        {legStats.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentLeg(index)}
            className={`w-2 h-2 rounded-full transition-colors ${
              index === currentLeg 
                ? 'bg-blue-400' 
                : 'bg-slate-600 hover:bg-slate-500'
            }`}
          />
        ))}
      </div>
    </Card>
  );
}
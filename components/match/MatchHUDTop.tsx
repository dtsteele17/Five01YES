'use client';

import { PlayerScoreCard } from './PlayerScoreCard';
import { PlayerStatsSideBlock } from './PlayerStatsSideBlock';

interface Player {
  name: string;
  remaining: number;
  average: number;
  lastScore: number;
  dartsThrown: number;
  legsWon: number;
  isActive: boolean;
  isMe: boolean;
  trustRating?: {
    letter: string | null;
    count: number;
  } | null;
}

interface MatchHUDTopProps {
  bestOf: string;
  myPlayer: Player;
  opponentPlayer: Player;
  legsToWin: number;
}

export function MatchHUDTop({
  bestOf,
  myPlayer,
  opponentPlayer,
  legsToWin,
}: MatchHUDTopProps) {
  return (
    <div className="flex flex-col items-center py-3 px-4 space-y-3">
      <h2 className="text-lg font-semibold text-white">{bestOf}</h2>

      <div className="flex flex-col lg:flex-row items-center justify-center gap-3 sm:gap-4 w-full">
        <PlayerStatsSideBlock
          average={myPlayer.average}
          lastScore={myPlayer.lastScore}
          dartsThrown={myPlayer.dartsThrown}
          side="left"
        />

        <div className="w-full sm:w-64">
          <PlayerScoreCard
            name={myPlayer.name}
            remaining={myPlayer.remaining}
            legsWon={myPlayer.legsWon}
            legsToWin={legsToWin}
            isActive={myPlayer.isActive}
            isMe={myPlayer.isMe}
            trustRating={myPlayer.trustRating}
          />
        </div>

        <div className="w-full sm:w-64">
          <PlayerScoreCard
            name={opponentPlayer.name}
            remaining={opponentPlayer.remaining}
            legsWon={opponentPlayer.legsWon}
            legsToWin={legsToWin}
            isActive={opponentPlayer.isActive}
            isMe={opponentPlayer.isMe}
            trustRating={opponentPlayer.trustRating}
          />
        </div>

        <PlayerStatsSideBlock
          average={opponentPlayer.average}
          lastScore={opponentPlayer.lastScore}
          dartsThrown={opponentPlayer.dartsThrown}
          side="right"
        />
      </div>
    </div>
  );
}

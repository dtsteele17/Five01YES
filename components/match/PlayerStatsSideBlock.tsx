'use client';

interface PlayerStatsSideBlockProps {
  average: number;
  lastScore: number;
  dartsThrown: number;
  side: 'left' | 'right';
}

export function PlayerStatsSideBlock({ average, lastScore, dartsThrown, side }: PlayerStatsSideBlockProps) {
  const stats = [
    { label: 'Average', value: average.toFixed(1) },
    { label: 'Last Score', value: lastScore.toString() },
    { label: 'Darts Thrown', value: dartsThrown.toString() },
  ];

  return (
    <div className={`flex flex-col justify-center space-y-2 ${side === 'left' ? 'items-end' : 'items-start'}`}>
      {stats.map((stat) => (
        <div key={stat.label} className={`flex flex-col ${side === 'left' ? 'items-end' : 'items-start'}`}>
          <span className="text-xs text-gray-400 font-medium">{stat.label}</span>
          <span className="text-lg font-bold text-white">{stat.value}</span>
        </div>
      ))}
    </div>
  );
}

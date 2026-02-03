import { cn } from '@/lib/utils';

export type TrustLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'N';

interface TrustBadgeProps {
  letter?: TrustLetter | null;
  size?: 'sm' | 'md';
}

export function TrustBadge({ letter, size = 'sm' }: TrustBadgeProps) {
  const displayLetter = letter || 'N';

  const colorClasses = {
    A: 'bg-green-600 text-white',
    B: 'bg-lime-500 text-gray-900',
    C: 'bg-yellow-500 text-gray-900',
    D: 'bg-orange-500 text-white',
    E: 'bg-red-600 text-white',
    N: 'bg-gray-500 text-white',
  };

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
  };

  const titleText = displayLetter === 'N'
    ? 'Trust Rating: Not yet rated'
    : `Trust Rating: ${displayLetter}`;

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-bold',
        colorClasses[displayLetter],
        sizeClasses[size]
      )}
      title={titleText}
    >
      {displayLetter}
    </div>
  );
}

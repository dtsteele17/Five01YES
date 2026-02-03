import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface TrustRatingBadgeProps {
  letter?: 'A' | 'B' | 'C' | 'D' | 'E' | null;
  count?: number;
  size?: 'sm' | 'md';
  showTooltip?: boolean;
  showCount?: boolean;
}

export function TrustRatingBadge({
  letter = null,
  count = 0,
  size = 'sm',
  showTooltip = true,
  showCount = false
}: TrustRatingBadgeProps) {
  const isUnrated = count === 0 || letter === null;
  const displayLetter = isUnrated ? 'Unrated' : letter;

  const colors: Record<string, string> = {
    A: 'bg-green-600/20 text-green-400 border-green-500/30',
    B: 'bg-lime-600/20 text-lime-400 border-lime-500/30',
    C: 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30',
    D: 'bg-orange-600/20 text-orange-400 border-orange-500/30',
    E: 'bg-red-600/20 text-red-400 border-red-500/30',
    Unrated: 'bg-slate-600/20 text-slate-300 border-slate-500/30',
  };

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5 h-5',
    md: 'text-sm px-2 py-1 h-6',
  };

  const tooltipText = isUnrated
    ? 'Not enough Trust Ratings yet.'
    : `Trust Rating: ${letter} (${count} ${count === 1 ? 'vote' : 'votes'}). A best → E worst.`;

  const badge = (
    <Badge
      className={`
        ${colors[displayLetter]}
        ${sizeClasses[size]}
        font-semibold
        rounded-full
        border
      `}
    >
      {showCount && !isUnrated ? `${letter} • ${count}` : displayLetter}
    </Badge>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-slate-800 border-white/10">
          <p className="text-xs">{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getTrustRatingBadgeClass, getTrustRatingDisplay, getUnratedLabel } from '@/lib/utils/trust-rating';

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
  const displayText = isUnrated ? getTrustRatingDisplay(null) : letter;

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5 h-5',
    md: 'text-sm px-2 py-1 h-6',
  };

  const tooltipText = isUnrated
    ? getUnratedLabel()
    : `Trust Rating: ${letter} (${count} ${count === 1 ? 'vote' : 'votes'}). A best → E worst.`;

  const badge = (
    <Badge
      className={`
        ${getTrustRatingBadgeClass(letter)}
        ${sizeClasses[size]}
        font-semibold
        rounded-full
        border
      `}
    >
      {showCount && !isUnrated ? `${letter} • ${count}` : displayText}
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

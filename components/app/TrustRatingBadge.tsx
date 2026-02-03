import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface TrustRatingBadgeProps {
  rating?: string | null;
  size?: 'sm' | 'md';
  showTooltip?: boolean;
}

export function TrustRatingBadge({
  rating,
  size = 'sm',
  showTooltip = true
}: TrustRatingBadgeProps) {
  const letter = rating || 'C';

  const colors = {
    A: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    B: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    C: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    D: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    E: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5 h-5',
    md: 'text-sm px-2 py-1 h-6',
  };

  const badge = (
    <Badge
      className={`
        ${colors[letter as keyof typeof colors] || colors.C}
        ${sizeClasses[size]}
        font-semibold
        rounded-full
      `}
    >
      {letter}
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
          <p className="text-xs">Trust Rating (A best → E worst)</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

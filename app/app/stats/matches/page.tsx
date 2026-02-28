'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ModernMatchCard } from '@/components/match/ModernMatchCard';
import { useMatchHistory } from '@/lib/hooks/useMatchHistory';
import { MatchStatsModal } from '@/components/app/MatchStatsModal';
import { 
  Trophy, 
  ArrowLeft, 
  Loader2, 
  Target,
  Calendar,
  BarChart3,
  ChevronDown,
  Filter,
  RefreshCw
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Filter options
const GAME_MODES = [
  { value: 'all', label: 'All Modes' },
  { value: '301', label: '301' },
  { value: '501', label: '501' },
];

const MATCH_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'quick', label: 'Quick Match' },
  { value: 'dartbot', label: 'Training (vs Bot)' },
];

export default function AllMatchesPage() {
  const [gameModeFilter, setGameModeFilter] = useState<string>('all');
  const [matchTypeFilter, setMatchTypeFilter] = useState<string>('all');
  const [selectedMatch, setSelectedMatch] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);

  const gameModeParam = gameModeFilter === 'all' ? null : parseInt(gameModeFilter);
  const matchTypeParam = matchTypeFilter === 'all' ? null : matchTypeFilter;

  const { 
    matches, 
    loading, 
    error, 
    hasMore,
    refresh, 
    loadMore,
    totalCount 
  } = useMatchHistory({
    limit: 20,
    gameMode: gameModeParam,
    matchType: matchTypeParam,
    includeOpponentStats: true, // Show opponent stats for all since we're loading in batches
  });

  const isFiltered = gameModeFilter !== 'all' || matchTypeFilter !== 'all';

  // Calculate stats from loaded matches
  const calculateStats = () => {
    if (matches.length === 0) return null;
    
    const wins = matches.filter(m => m.result === 'win').length;
    const losses = matches.filter(m => m.result === 'loss').length;
    const totalAvg = matches.reduce((sum, m) => sum + (m.three_dart_avg || 0), 0) / matches.length;
    const avgFirst9 = matches.reduce((sum, m) => sum + (m.first9_avg || 0), 0) / matches.length;
    const avgCheckout = matches.reduce((sum, m) => sum + (m.checkout_percentage || 0), 0) / matches.length;
    
    return {
      wins,
      losses,
      totalAvg: totalAvg.toFixed(1),
      avgFirst9: avgFirst9.toFixed(1),
      avgCheckout: avgCheckout.toFixed(1),
    };
  };

  const stats = calculateStats();

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/app/stats">
              <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white hover:bg-slate-800">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider">History</p>
          </div>
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-white tracking-tight">All Matches</h1>
          <p className="text-slate-400 mt-2 text-base sm:text-lg">
            {isFiltered 
              ? `Showing ${matches.length} filtered matches`
              : `Complete match history (${totalCount} games loaded)`
            }
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="border-slate-600 text-slate-300 hover:text-white"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
            <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </Button>
          <Button 
            onClick={refresh} 
            variant="outline" 
            size="sm"
            className="border-slate-600 text-slate-300 hover:text-white"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
          <Card className="bg-slate-800/40 border-slate-700/50 p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold text-white">{stats.wins}</p>
                <p className="text-slate-400 text-xs">Wins</p>
              </div>
            </div>
          </Card>
          <Card className="bg-slate-800/40 border-slate-700/50 p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                <Target className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold text-white">{stats.losses}</p>
                <p className="text-slate-400 text-xs">Losses</p>
              </div>
            </div>
          </Card>
          <Card className="bg-slate-800/40 border-slate-700/50 p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold text-white">{stats.totalAvg}</p>
                <p className="text-slate-400 text-xs">Avg</p>
              </div>
            </div>
          </Card>
          <Card className="bg-slate-800/40 border-slate-700/50 p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold text-white">{stats.avgFirst9}</p>
                <p className="text-slate-400 text-xs">First 9</p>
              </div>
            </div>
          </Card>
          <Card className="bg-slate-800/40 border-slate-700/50 p-3 sm:p-4 col-span-2 md:col-span-1">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <Target className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold text-white">{stats.avgCheckout}%</p>
                <p className="text-slate-400 text-xs">Checkout %</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Filters Panel */}
      {showFilters && (
        <Card className="bg-slate-800/40 border-slate-700/50 p-4 sm:p-6">
          <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <label className="text-slate-400 text-sm mb-3 block font-medium">Game Mode</label>
              <Select value={gameModeFilter} onValueChange={setGameModeFilter}>
                <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white">
                  <SelectValue placeholder="Game Mode" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  {GAME_MODES.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-slate-400 text-sm mb-3 block font-medium">Match Type</label>
              <Select value={matchTypeFilter} onValueChange={setMatchTypeFilter}>
                <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white">
                  <SelectValue placeholder="Match Type" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  {MATCH_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {isFiltered && (
            <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center gap-2">
              <span className="text-slate-400 text-sm">Active filters:</span>
              <Badge className="bg-emerald-500/20 text-emerald-400">
                {GAME_MODES.find(m => m.value === gameModeFilter)?.label} × {MATCH_TYPES.find(t => t.value === matchTypeFilter)?.label}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setGameModeFilter('all'); setMatchTypeFilter('all'); }}
                className="text-slate-400 hover:text-white"
              >
                Clear
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Match List */}
      <Card className="bg-slate-800/40 border-slate-700/50 overflow-hidden">
        <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Match History</h2>
          <Badge className="bg-slate-700 text-slate-300">
            {matches.length} Matches
          </Badge>
        </div>
        
        <ScrollArea className="h-[600px]">
          <div className="p-4 space-y-3">
            {loading && matches.length === 0 ? (
              <div className="py-12 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mx-auto mb-4" />
                <p className="text-slate-400">Loading matches...</p>
              </div>
            ) : matches.length === 0 ? (
              <div className="py-12 text-center">
                <Trophy className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-white font-bold mb-2">No Matches Found</h3>
                <p className="text-slate-400 text-sm">
                  {isFiltered 
                    ? 'Try adjusting your filters'
                    : 'Play some games to see your match history here'
                  }
                </p>
              </div>
            ) : (
              <>
                {matches.map((match, index) => (
                  <ModernMatchCard
                    key={match.id}
                    match={match}
                    onClick={() => setSelectedMatch(match)}
                    showOpponentStats={index < 10}
                    compact={false}
                  />
                ))}
                
                {hasMore && (
                  <div className="pt-4 text-center">
                    <Button
                      onClick={loadMore}
                      disabled={loading}
                      variant="outline"
                      className="border-slate-600 text-slate-300 hover:text-white"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        'Load More'
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </Card>

      {/* Match Stats Modal */}
      <MatchStatsModal
        isOpen={!!selectedMatch}
        onClose={() => setSelectedMatch(null)}
        matchId={selectedMatch?.room_id || ''}
      />
    </div>
  );
}

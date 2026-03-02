'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { TrendingUp, ChevronDown } from 'lucide-react';

type TimeRange = 'week' | 'month' | 'year';

interface DayData {
  date: string;       // YYYY-MM-DD
  avg: number;
  matchCount: number;
}

const RANGE_LABELS: Record<TimeRange, string> = {
  week: 'This Week',
  month: 'This Month',
  year: 'This Year',
};

function getDateRange(range: TimeRange): Date {
  const now = new Date();
  if (range === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (range === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return d;
  }
  // year
  return new Date(now.getFullYear(), 0, 1);
}

function formatLabel(dateStr: string, range: TimeRange): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (range === 'week') {
    return d.toLocaleDateString('en-GB', { weekday: 'short' });
  }
  if (range === 'month') {
    return d.getDate().toString();
  }
  // year – show month abbreviation
  return d.toLocaleDateString('en-GB', { month: 'short' });
}

export function ThreeDartAvgChart() {
  const [range, setRange] = useState<TimeRange>('week');
  const [rawData, setRawData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    fetchData();
  }, [range]);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const startDate = getDateRange(range);
      const startStr = startDate.toISOString();

      const { data, error } = await supabase
        .from('match_history')
        .select('created_at, three_dart_avg')
        .eq('user_id', user.id)
        .gte('created_at', startStr)
        .not('three_dart_avg', 'is', null)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching avg data:', error);
        setRawData([]);
        return;
      }

      // Group by date
      const byDate: Record<string, { total: number; count: number }> = {};
      (data || []).forEach((m: any) => {
        if (!m.three_dart_avg) return;
        const dateKey = new Date(m.created_at).toISOString().slice(0, 10);
        if (!byDate[dateKey]) byDate[dateKey] = { total: 0, count: 0 };
        byDate[dateKey].total += m.three_dart_avg;
        byDate[dateKey].count += 1;
      });

      const result: DayData[] = Object.entries(byDate).map(([date, v]) => ({
        date,
        avg: v.total / v.count,
        matchCount: v.count,
      }));

      result.sort((a, b) => a.date.localeCompare(b.date));
      setRawData(result);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }

  // For year view, aggregate by month
  const chartData = useMemo(() => {
    if (range !== 'year') return rawData;
    const byMonth: Record<string, { total: number; count: number }> = {};
    rawData.forEach((d) => {
      const key = d.date.slice(0, 7) + '-01'; // YYYY-MM-01
      if (!byMonth[key]) byMonth[key] = { total: 0, count: 0 };
      byMonth[key].total += d.avg * d.matchCount;
      byMonth[key].count += d.matchCount;
    });
    return Object.entries(byMonth)
      .map(([date, v]) => ({ date, avg: v.total / v.count, matchCount: v.count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [rawData, range]);

  const maxVal = Math.max(...chartData.map((d) => d.avg), 1);
  const minVal = Math.min(...chartData.map((d) => d.avg), 0);
  const chartMin = Math.max(0, minVal - 10);
  const chartMax = maxVal + 10;
  const valueRange = chartMax - chartMin || 1;

  const overallAvg = chartData.length > 0
    ? chartData.reduce((s, d) => s + d.avg * d.matchCount, 0) / chartData.reduce((s, d) => s + d.matchCount, 0)
    : 0;

  return (
    <Card className="bg-slate-800/40 border-slate-700/50 p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">3-Dart Average</h2>
            <p className="text-slate-400 text-sm">Daily performance trend</p>
          </div>
        </div>
        {/* Dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/50 text-slate-300 text-sm hover:bg-slate-700 transition-colors"
          >
            {RANGE_LABELS[range]}
            <ChevronDown className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 overflow-hidden">
              {(Object.entries(RANGE_LABELS) as [TimeRange, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setRange(key); setDropdownOpen(false); }}
                  className={`block w-full text-left px-4 py-2 text-sm hover:bg-slate-700 transition-colors ${
                    range === key ? 'text-emerald-400 bg-slate-700/50' : 'text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="h-48 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
          No match data for this period
        </div>
      ) : (
        <div>
          {/* Average summary */}
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-3xl font-black text-white">{overallAvg.toFixed(1)}</span>
            <span className="text-slate-400 text-sm">avg for period</span>
          </div>

          {/* Chart */}
          <div className="relative h-48">
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
              const val = chartMin + valueRange * (1 - pct);
              return (
                <div
                  key={pct}
                  className="absolute left-8 right-0 border-t border-slate-700/40 flex items-center"
                  style={{ top: `${pct * 100}%` }}
                >
                  <span className="absolute -left-1 -translate-x-full text-[10px] text-slate-500 -mt-2">
                    {val.toFixed(0)}
                  </span>
                </div>
              );
            })}

            {/* Line chart via SVG */}
            <svg className="absolute left-10 right-0 top-0 bottom-6 w-[calc(100%-2.5rem)]" viewBox={`0 0 ${Math.max(chartData.length - 1, 1) * 100} 100`} preserveAspectRatio="none">
              {/* Area fill */}
              {chartData.length > 1 && (
                <path
                  d={`M0,${100 - ((chartData[0].avg - chartMin) / valueRange) * 100} ${chartData.map((d, i) => `L${i * 100},${100 - ((d.avg - chartMin) / valueRange) * 100}`).join(' ')} L${(chartData.length - 1) * 100},100 L0,100 Z`}
                  fill="url(#areaGradient)"
                  opacity="0.3"
                />
              )}
              {/* Line */}
              {chartData.length > 1 && (
                <polyline
                  points={chartData.map((d, i) => `${i * 100},${100 - ((d.avg - chartMin) / valueRange) * 100}`).join(' ')}
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="3"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {/* Dots */}
              {chartData.map((d, i) => {
                const y = 100 - ((d.avg - chartMin) / valueRange) * 100;
                return <circle key={i} cx={i * 100} cy={y} r="5" fill="#a855f7" stroke="#1e293b" strokeWidth="2" vectorEffect="non-scaling-stroke" />;
              })}
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
            {/* Tooltip dots overlay */}
            <div className="absolute left-10 right-0 top-0 bottom-6 flex">
              {chartData.map((d, i) => {
                const y = ((d.avg - chartMin) / valueRange) * 100;
                return (
                  <div key={d.date} className="flex-1 relative group" style={{ height: '100%' }}>
                    <div className="hidden group-hover:block absolute bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs z-10 whitespace-nowrap shadow-lg -translate-x-1/2 left-1/2" style={{ bottom: `${y + 5}%` }}>
                      <p className="text-white font-bold">{d.avg.toFixed(1)}</p>
                      <p className="text-slate-400">{d.matchCount} match{d.matchCount !== 1 ? 'es' : ''}</p>
                      <p className="text-slate-500">{d.date}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* X-axis labels */}
            <div className="absolute left-10 right-0 bottom-0 flex">
              {chartData.map((d, i) => {
                // Show every label for week, every few for month/year
                const showLabel = range === 'week' || range === 'year' || 
                  (range === 'month' && (i % Math.ceil(chartData.length / 10) === 0 || i === chartData.length - 1));
                return (
                  <div key={d.date} className="flex-1 text-center">
                    {showLabel && (
                      <span className="text-[10px] text-slate-500">{formatLabel(d.date, range)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

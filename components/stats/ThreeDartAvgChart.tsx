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
  // year – show day + month abbreviation
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
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

  // Build complete list of days for the range, filling gaps with null avg
  const chartData = useMemo(() => {
    const dataMap = new Map(rawData.map(d => [d.date, d]));
    const start = getDateRange(range);
    const end = new Date();
    const days: (DayData & { hasData: boolean })[] = [];

    const d = new Date(start);
    while (d <= end) {
      const key = d.toISOString().slice(0, 10);
      const existing = dataMap.get(key);
      days.push({
        date: key,
        avg: existing?.avg || 0,
        matchCount: existing?.matchCount || 0,
        hasData: !!existing,
      });
      d.setDate(d.getDate() + 1);
    }
    return days;
  }, [rawData, range]);

  // Only days with actual data for line/dots
  const dataPoints = chartData.filter(d => d.hasData);
  
  const maxVal = dataPoints.length > 0 ? Math.max(...dataPoints.map(d => d.avg)) : 100;
  const minVal = dataPoints.length > 0 ? Math.min(...dataPoints.map(d => d.avg)) : 0;
  // Round to nice axis values
  const chartMin = Math.max(0, Math.floor((minVal - 5) / 10) * 10);
  const chartMax = Math.ceil((maxVal + 5) / 10) * 10;
  const valueRange = chartMax - chartMin || 1;

  const overallAvg = dataPoints.length > 0
    ? dataPoints.reduce((s, d) => s + d.avg * d.matchCount, 0) / dataPoints.reduce((s, d) => s + d.matchCount, 0)
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
      ) : dataPoints.length === 0 ? (
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
          <div className="relative h-52" style={{ paddingLeft: '40px', paddingBottom: '24px' }}>
            {/* Y-axis grid lines & labels */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
              const val = chartMax - valueRange * pct;
              return (
                <div
                  key={pct}
                  className="absolute right-0 border-t border-slate-700/30"
                  style={{ top: `${pct * (100 - 12)}%`, left: '40px' }}
                >
                  <span className="absolute -left-2 -translate-x-full text-[10px] text-slate-500" style={{ marginTop: '-6px' }}>
                    {val.toFixed(0)}
                  </span>
                </div>
              );
            })}

            {/* SVG line chart */}
            {(() => {
              const totalDays = chartData.length;
              const w = 1000;
              const h = 400;
              const padT = 10;
              const padB = 10;
              const chartH = h - padT - padB;

              // Build points only for days with data
              const pointsWithIndex = chartData
                .map((d, i) => ({ ...d, idx: i }))
                .filter(d => d.hasData);

              if (pointsWithIndex.length === 0) return null;

              const getX = (idx: number) => totalDays <= 1 ? w / 2 : (idx / (totalDays - 1)) * w;
              const getY = (avg: number) => padT + chartH - ((avg - chartMin) / valueRange) * chartH;

              const linePoints = pointsWithIndex.map(p => `${getX(p.idx)},${getY(p.avg)}`).join(' ');
              
              // Area path
              const first = pointsWithIndex[0];
              const last = pointsWithIndex[pointsWithIndex.length - 1];
              const areaPath = `M${getX(first.idx)},${getY(first.avg)} ${pointsWithIndex.map(p => `L${getX(p.idx)},${getY(p.avg)}`).join(' ')} L${getX(last.idx)},${h} L${getX(first.idx)},${h} Z`;

              // Dot radius based on number of days
              const dotR = totalDays <= 7 ? 8 : totalDays <= 31 ? 5 : 3;

              return (
                <svg
                  className="absolute"
                  style={{ left: '40px', top: 0, width: 'calc(100% - 40px)', height: 'calc(100% - 24px)' }}
                  viewBox={`0 0 ${w} ${h}`}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="avgAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  {/* Area fill */}
                  <path d={areaPath} fill="url(#avgAreaGrad)" />
                  {/* Line */}
                  <polyline
                    points={linePoints}
                    fill="none"
                    stroke="#a855f7"
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* Dots */}
                  {pointsWithIndex.map((p) => (
                    <circle
                      key={p.date}
                      cx={getX(p.idx)}
                      cy={getY(p.avg)}
                      r={dotR}
                      fill="#a855f7"
                      stroke="#1e293b"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </svg>
              );
            })()}

            {/* Tooltip overlay */}
            <div className="absolute flex" style={{ left: '40px', top: 0, width: 'calc(100% - 40px)', height: 'calc(100% - 24px)' }}>
              {chartData.map((d, i) => {
                if (!d.hasData) return <div key={d.date} className="flex-1" />;
                const yPct = ((d.avg - chartMin) / valueRange) * 100;
                return (
                  <div key={d.date} className="flex-1 relative group cursor-pointer" style={{ height: '100%' }}>
                    <div className="hidden group-hover:block absolute bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs z-20 whitespace-nowrap shadow-lg -translate-x-1/2 left-1/2" style={{ bottom: `${yPct + 8}%` }}>
                      <p className="text-white font-bold">{d.avg.toFixed(1)}</p>
                      <p className="text-slate-400">{d.matchCount} match{d.matchCount !== 1 ? 'es' : ''}</p>
                      <p className="text-slate-500">{d.date}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* X-axis labels */}
            <div className="absolute flex" style={{ left: '40px', bottom: 0, width: 'calc(100% - 40px)', height: '20px' }}>
              {chartData.map((d, i) => {
                const total = chartData.length;
                // For week: show all 7 days. For month: show every 5th + last. For year: show every 30th + last.
                const showLabel = range === 'week' ||
                  (range === 'month' && (i % 5 === 0 || i === total - 1)) ||
                  (range === 'year' && (i % 30 === 0 || i === total - 1));
                return (
                  <div key={d.date} className="flex-1 text-center overflow-hidden">
                    {showLabel && (
                      <span className="text-[9px] text-slate-500 leading-none">{formatLabel(d.date, range)}</span>
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

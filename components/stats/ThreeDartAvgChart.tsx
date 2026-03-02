'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { TrendingUp, ChevronDown, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

type TimeRange = 'week' | 'month' | 'year';

interface DayData {
  date: string;
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
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (range === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return new Date(now.getFullYear(), 0, 1);
}

function getDateRangeEnd(range: TimeRange): Date {
  const now = new Date();
  if (range === 'week') {
    const start = getDateRange('week');
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }
  if (range === 'month') {
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  return new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
}

function formatLabel(dateStr: string, range: TimeRange, isZoomed?: boolean): string {
  const d = new Date(dateStr + 'T12:00:00');
  if (range === 'week') {
    return d.toLocaleDateString('en-GB', { weekday: 'short' });
  }
  if (range === 'month') {
    return d.getDate().toString();
  }
  if (isZoomed) {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ThreeDartAvgChart() {
  const [range, setRange] = useState<TimeRange>('week');
  const [rawData, setRawData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Zoom state for year view (indices into chartData)
  const [zoomStart, setZoomStart] = useState<number>(0);
  const [zoomEnd, setZoomEnd] = useState<number>(365);
  const [isZoomed, setIsZoomed] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    fetchData();
  }, [range]);

  // Reset zoom when range changes
  useEffect(() => {
    setIsZoomed(false);
    setZoomStart(0);
    setZoomEnd(365);
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

  // Full chart data for the range
  const fullChartData = useMemo(() => {
    const dataMap = new Map(rawData.map(d => [d.date, d]));
    const start = getDateRange(range);
    const end = getDateRangeEnd(range);
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

  // Visible chart data (zoomed slice for year view)
  const chartData = useMemo(() => {
    if (range === 'year' && isZoomed) {
      return fullChartData.slice(zoomStart, zoomEnd + 1);
    }
    return fullChartData;
  }, [fullChartData, range, isZoomed, zoomStart, zoomEnd]);

  const dataPoints = chartData.filter(d => d.hasData);

  const maxVal = dataPoints.length > 0 ? Math.max(...dataPoints.map(d => d.avg)) : 100;
  const minVal = dataPoints.length > 0 ? Math.min(...dataPoints.map(d => d.avg)) : 0;
  const chartMin = Math.max(0, Math.floor((minVal - 5) / 10) * 10);
  const chartMax = Math.ceil((maxVal + 5) / 10) * 10;
  const valueRange = chartMax - chartMin || 1;

  const overallAvg = dataPoints.length > 0
    ? dataPoints.reduce((s, d) => s + d.avg * d.matchCount, 0) / dataPoints.reduce((s, d) => s + d.matchCount, 0)
    : 0;

  // Compute x-axis label frequency based on visible days
  const getLabelFrequency = () => {
    const total = chartData.length;
    if (range === 'week') return 1;
    if (range === 'month') return 5;
    if (range === 'year' && isZoomed) {
      const span = zoomEnd - zoomStart;
      if (span <= 14) return 1;
      if (span <= 31) return 3;
      if (span <= 90) return 7;
      return 14;
    }
    return 30;
  };

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
            {range === 'year' && isZoomed && (
              <span className="text-purple-400 text-xs ml-2">
                ({chartData[0]?.date && formatLabel(chartData[0].date, 'year')} – {chartData[chartData.length - 1]?.date && formatLabel(chartData[chartData.length - 1].date, 'year')})
              </span>
            )}
          </div>

          {/* Main Chart */}
          <ChartArea
            chartData={chartData}
            chartMin={chartMin}
            chartMax={chartMax}
            valueRange={valueRange}
            range={range}
            isZoomed={isZoomed}
            labelFrequency={getLabelFrequency()}
          />

          {/* Year zoom brush */}
          {range === 'year' && fullChartData.length > 0 && (
            <YearBrush
              fullData={fullChartData}
              zoomStart={zoomStart}
              zoomEnd={zoomEnd}
              isZoomed={isZoomed}
              onBrushChange={(start, end) => {
                setZoomStart(start);
                setZoomEnd(end);
                setIsZoomed(true);
              }}
              onReset={() => {
                setIsZoomed(false);
                setZoomStart(0);
                setZoomEnd(fullChartData.length - 1);
              }}
            />
          )}
        </div>
      )}
    </Card>
  );
}

// ── Chart Area ──────────────────────────────────────────────
interface ChartAreaProps {
  chartData: (DayData & { hasData: boolean })[];
  chartMin: number;
  chartMax: number;
  valueRange: number;
  range: TimeRange;
  isZoomed: boolean;
  labelFrequency: number;
}

function ChartArea({ chartData, chartMin, chartMax, valueRange, range, isZoomed, labelFrequency }: ChartAreaProps) {
  const totalDays = chartData.length;
  const pointsWithIndex = chartData
    .map((d, i) => ({ ...d, idx: i }))
    .filter(d => d.hasData);

  const getXPct = (idx: number) => totalDays <= 1 ? 50 : (idx / (totalDays - 1)) * 100;
  const getYPct = (avg: number) => 100 - ((avg - chartMin) / valueRange) * 100;

  const w = 1000;
  const h = 1000;
  const getXSvg = (idx: number) => totalDays <= 1 ? w / 2 : (idx / (totalDays - 1)) * w;
  const getYSvg = (avg: number) => h - ((avg - chartMin) / valueRange) * h;

  const linePoints = pointsWithIndex.map(p => `${getXSvg(p.idx)},${getYSvg(p.avg)}`).join(' ');

  const first = pointsWithIndex[0];
  const last = pointsWithIndex[pointsWithIndex.length - 1];
  const areaPath = first && last
    ? `M${getXSvg(first.idx)},${getYSvg(first.avg)} ${pointsWithIndex.map(p => `L${getXSvg(p.idx)},${getYSvg(p.avg)}`).join(' ')} L${getXSvg(last.idx)},${h} L${getXSvg(first.idx)},${h} Z`
    : '';

  const dotSize = totalDays <= 7 ? 12 : totalDays <= 31 ? 8 : totalDays <= 90 ? 6 : 5;

  return (
    <div className="relative h-52" style={{ paddingLeft: '40px', paddingBottom: '24px' }}>
      {/* Y-axis grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
        const val = chartMax - valueRange * pct;
        return (
          <div
            key={pct}
            className="absolute border-t border-slate-700/30"
            style={{ top: `${pct * 100}%`, left: '40px', right: 0, height: 0 }}
          >
            <span className="absolute -left-2 -translate-x-full text-[10px] text-slate-500" style={{ marginTop: '-6px' }}>
              {val.toFixed(0)}
            </span>
          </div>
        );
      })}

      {pointsWithIndex.length > 0 && (
        <>
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
            <path d={areaPath} fill="url(#avgAreaGrad)" />
            <polyline
              points={linePoints}
              fill="none"
              stroke="#a855f7"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* HTML dots */}
          <div
            className="absolute pointer-events-none"
            style={{ left: '40px', top: 0, width: 'calc(100% - 40px)', height: 'calc(100% - 24px)' }}
          >
            {pointsWithIndex.map((p) => (
              <div
                key={p.date}
                className="absolute rounded-full bg-purple-500 border-2 border-slate-800"
                style={{
                  width: dotSize,
                  height: dotSize,
                  left: `${getXPct(p.idx)}%`,
                  top: `${getYPct(p.avg)}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            ))}
          </div>

          {/* Tooltip overlay */}
          <div className="absolute" style={{ left: '40px', top: 0, width: 'calc(100% - 40px)', height: 'calc(100% - 24px)' }}>
            {chartData.map((d, i) => {
              if (!d.hasData) return null;
              const xPct = totalDays <= 1 ? 50 : (i / (totalDays - 1)) * 100;
              const yPct = 100 - ((d.avg - chartMin) / valueRange) * 100;
              return (
                <div
                  key={d.date}
                  className="absolute group cursor-pointer"
                  style={{
                    left: `${xPct}%`,
                    top: `${yPct}%`,
                    transform: 'translate(-50%, -50%)',
                    width: 24,
                    height: 24,
                  }}
                >
                  <div className="hidden group-hover:block absolute bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs z-20 whitespace-nowrap shadow-lg -translate-x-1/2 left-1/2 bottom-full mb-2">
                    <p className="text-white font-bold">{d.avg.toFixed(1)}</p>
                    <p className="text-slate-400">{d.matchCount} match{d.matchCount !== 1 ? 'es' : ''}</p>
                    <p className="text-slate-500">{d.date}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* X-axis labels */}
      <div className="absolute" style={{ left: '40px', bottom: 0, width: 'calc(100% - 40px)', height: '20px' }}>
        {chartData.map((d, i) => {
          const total = chartData.length;
          const freq = labelFrequency;
          const showLabel = range === 'week' || (i % freq === 0 || i === total - 1);
          if (!showLabel) return null;
          const xPct = total <= 1 ? 50 : (i / (total - 1)) * 100;
          return (
            <span
              key={d.date}
              className="absolute text-[9px] text-slate-500 leading-none -translate-x-1/2"
              style={{ left: `${xPct}%` }}
            >
              {formatLabel(d.date, range, isZoomed)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Year Brush (zoom selector) ─────────────────────────────
interface YearBrushProps {
  fullData: (DayData & { hasData: boolean })[];
  zoomStart: number;
  zoomEnd: number;
  isZoomed: boolean;
  onBrushChange: (start: number, end: number) => void;
  onReset: () => void;
}

function YearBrush({ fullData, zoomStart, zoomEnd, isZoomed, onBrushChange, onReset }: YearBrushProps) {
  const brushRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'left' | 'right' | 'window' | null>(null);
  const dragStartRef = useRef({ x: 0, start: 0, end: 0 });

  const totalDays = fullData.length;
  const effectiveStart = isZoomed ? zoomStart : 0;
  const effectiveEnd = isZoomed ? zoomEnd : totalDays - 1;

  // Mini sparkline for brush background
  const dataPoints = fullData.filter(d => d.hasData);
  const maxVal = dataPoints.length > 0 ? Math.max(...dataPoints.map(d => d.avg)) : 100;
  const minVal = dataPoints.length > 0 ? Math.min(...dataPoints.map(d => d.avg)) : 0;
  const sparkRange = maxVal - minVal || 1;

  const startDrag = useCallback((type: 'left' | 'right' | 'window', e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    dragStartRef.current = { x: clientX, start: effectiveStart, end: effectiveEnd };
    setDragging(type);
  }, [effectiveStart, effectiveEnd]);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!brushRef.current) return;
      const rect = brushRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const dx = clientX - dragStartRef.current.x;
      const daysDelta = Math.round((dx / rect.width) * totalDays);

      let newStart = dragStartRef.current.start;
      let newEnd = dragStartRef.current.end;

      if (dragging === 'left') {
        newStart = Math.max(0, Math.min(newEnd - 7, dragStartRef.current.start + daysDelta));
      } else if (dragging === 'right') {
        newEnd = Math.min(totalDays - 1, Math.max(newStart + 7, dragStartRef.current.end + daysDelta));
      } else if (dragging === 'window') {
        const span = dragStartRef.current.end - dragStartRef.current.start;
        newStart = dragStartRef.current.start + daysDelta;
        newEnd = newStart + span;
        if (newStart < 0) { newStart = 0; newEnd = span; }
        if (newEnd > totalDays - 1) { newEnd = totalDays - 1; newStart = newEnd - span; }
      }

      onBrushChange(newStart, newEnd);
    };

    const handleUp = () => setDragging(null);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [dragging, totalDays, onBrushChange]);

  const leftPct = (effectiveStart / (totalDays - 1)) * 100;
  const rightPct = (effectiveEnd / (totalDays - 1)) * 100;

  return (
    <div className="mt-4 pt-3 border-t border-slate-700/30">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Drag to zoom into a time period</p>
        {isZoomed && (
          <button
            onClick={onReset}
            className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset zoom
          </button>
        )}
      </div>

      {/* Brush area */}
      <div
        ref={brushRef}
        className="relative h-12 rounded-lg bg-slate-900/60 overflow-hidden select-none cursor-crosshair"
      >
        {/* Mini sparkline */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${totalDays} 100`}
          preserveAspectRatio="none"
        >
          {dataPoints.length > 1 && (() => {
            const pts = fullData
              .map((d, i) => ({ ...d, idx: i }))
              .filter(d => d.hasData)
              .map(p => `${p.idx},${100 - ((p.avg - minVal) / sparkRange) * 80 - 10}`)
              .join(' ');
            return (
              <polyline
                points={pts}
                fill="none"
                stroke="#a855f7"
                strokeWidth="1"
                strokeOpacity="0.4"
                vectorEffect="non-scaling-stroke"
              />
            );
          })()}
        </svg>

        {/* Dimmed areas outside selection */}
        <div
          className="absolute top-0 bottom-0 left-0 bg-slate-900/70"
          style={{ width: `${leftPct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 right-0 bg-slate-900/70"
          style={{ width: `${100 - rightPct}%` }}
        />

        {/* Selected window */}
        <div
          className="absolute top-0 bottom-0 border-y-2 border-purple-500/50 cursor-grab active:cursor-grabbing"
          style={{ left: `${leftPct}%`, width: `${rightPct - leftPct}%` }}
          onMouseDown={(e) => startDrag('window', e)}
          onTouchStart={(e) => startDrag('window', e)}
        />

        {/* Left handle */}
        <div
          className="absolute top-0 bottom-0 w-3 cursor-ew-resize z-10 flex items-center justify-center"
          style={{ left: `${leftPct}%`, transform: 'translateX(-50%)' }}
          onMouseDown={(e) => startDrag('left', e)}
          onTouchStart={(e) => startDrag('left', e)}
        >
          <div className="w-1.5 h-8 rounded-full bg-purple-400 hover:bg-purple-300 transition-colors" />
        </div>

        {/* Right handle */}
        <div
          className="absolute top-0 bottom-0 w-3 cursor-ew-resize z-10 flex items-center justify-center"
          style={{ left: `${rightPct}%`, transform: 'translateX(-50%)' }}
          onMouseDown={(e) => startDrag('right', e)}
          onTouchStart={(e) => startDrag('right', e)}
        >
          <div className="w-1.5 h-8 rounded-full bg-purple-400 hover:bg-purple-300 transition-colors" />
        </div>

        {/* Month labels */}
        <div className="absolute bottom-0 left-0 right-0 h-4 flex">
          {MONTH_NAMES.map((name, m) => {
            const dayOfYear = new Date(new Date().getFullYear(), m, 1);
            const startOfYear = new Date(new Date().getFullYear(), 0, 1);
            const dayIdx = Math.floor((dayOfYear.getTime() - startOfYear.getTime()) / 86400000);
            const pct = totalDays <= 1 ? 0 : (dayIdx / (totalDays - 1)) * 100;
            return (
              <span
                key={m}
                className="absolute text-[8px] text-slate-600 leading-none"
                style={{ left: `${pct}%` }}
              >
                {name}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

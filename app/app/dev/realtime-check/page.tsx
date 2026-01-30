'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface RealtimeEvent {
  timestamp: string;
  type: string;
  table: string;
  event: string;
  payload: any;
}

export default function RealtimeCheckPage() {
  const router = useRouter();
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openLobbiesCount, setOpenLobbiesCount] = useState(0);
  const [activeMatchesCount, setActiveMatchesCount] = useState(0);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('disconnected');
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    initialize();
  }, []);

  async function initialize() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      setUserId(user.id);
      await fetchCounts();
      setupRealtimeSubscription();
    } catch (error: any) {
      console.error('Initialization error:', error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCounts() {
    try {
      const { count: lobbiesCount } = await supabase
        .from('quick_match_lobbies')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open');

      const { count: matchesCount } = await supabase
        .from('online_matches')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      setOpenLobbiesCount(lobbiesCount || 0);
      setActiveMatchesCount(matchesCount || 0);
      setLastRefresh(new Date());
    } catch (error: any) {
      console.error('Failed to fetch counts:', error);
      toast.error(`Failed to fetch counts: ${error.message}`);
    }
  }

  function setupRealtimeSubscription() {
    const channel = supabase
      .channel('realtime_debug')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'quick_match_lobbies',
        },
        (payload) => {
          addEvent({
            timestamp: new Date().toISOString(),
            type: 'quick_match_lobbies',
            table: 'quick_match_lobbies',
            event: payload.eventType,
            payload: payload.new || payload.old,
          });
          fetchCounts();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'online_matches',
        },
        (payload) => {
          addEvent({
            timestamp: new Date().toISOString(),
            type: 'online_matches',
            table: 'online_matches',
            event: payload.eventType,
            payload: payload.new || payload.old,
          });
          fetchCounts();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'online_match_visits',
        },
        (payload) => {
          addEvent({
            timestamp: new Date().toISOString(),
            type: 'online_match_visits',
            table: 'online_match_visits',
            event: payload.eventType,
            payload: payload.new || payload.old,
          });
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
        setSubscriptionStatus(status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }

  function addEvent(event: RealtimeEvent) {
    setEvents((prev) => [event, ...prev].slice(0, 50));
  }

  function clearEvents() {
    setEvents([]);
    toast.info('Events cleared');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  const isConnected = subscriptionStatus === 'SUBSCRIBED';

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Realtime Debug Console
            </h1>
            <p className="text-gray-400">
              Monitor Quick Match realtime events and connection status
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={fetchCounts}
              variant="outline"
              size="sm"
              className="border-white/10"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button
              onClick={() => router.push('/app/play/quick-match')}
              className="bg-emerald-500 hover:bg-emerald-600"
            >
              Back to Quick Match
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="bg-slate-900 border-white/10 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">Connection Status</h3>
              {isConnected ? (
                <Wifi className="w-5 h-5 text-emerald-400" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-400" />
              )}
            </div>
            <div className="space-y-2">
              <Badge
                className={
                  isConnected
                    ? 'bg-emerald-500/20 text-emerald-400 border-0'
                    : 'bg-red-500/20 text-red-400 border-0'
                }
              >
                {subscriptionStatus}
              </Badge>
              <p className="text-sm text-gray-400">
                {isConnected
                  ? 'Realtime subscriptions active'
                  : 'Connection issue - check console'}
              </p>
            </div>
          </Card>

          <Card className="bg-slate-900 border-white/10 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">Open Lobbies</h3>
              <CheckCircle className="w-5 h-5 text-blue-400" />
            </div>
            <div className="space-y-2">
              <div className="text-4xl font-bold text-white">
                {openLobbiesCount}
              </div>
              <p className="text-sm text-gray-400">
                Lobbies waiting for players
              </p>
            </div>
          </Card>

          <Card className="bg-slate-900 border-white/10 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">Active Matches</h3>
              <XCircle className="w-5 h-5 text-amber-400" />
            </div>
            <div className="space-y-2">
              <div className="text-4xl font-bold text-white">
                {activeMatchesCount}
              </div>
              <p className="text-sm text-gray-400">
                Matches currently in progress
              </p>
            </div>
          </Card>
        </div>

        <Card className="bg-slate-900 border-white/10 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-white font-bold text-lg">Realtime Events</h3>
              <p className="text-sm text-gray-400">
                Last refresh: {lastRefresh.toLocaleTimeString()}
              </p>
            </div>
            <Button
              onClick={clearEvents}
              variant="outline"
              size="sm"
              className="border-white/10"
            >
              Clear Events
            </Button>
          </div>

          {events.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>No events received yet</p>
              <p className="text-sm mt-2">
                Create a lobby or join a match to see realtime events
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {events.map((event, index) => (
                <div
                  key={index}
                  className="p-4 bg-white/5 rounded-lg border border-white/10"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <Badge
                        className={
                          event.event === 'INSERT'
                            ? 'bg-emerald-500/20 text-emerald-400 border-0'
                            : event.event === 'UPDATE'
                            ? 'bg-blue-500/20 text-blue-400 border-0'
                            : 'bg-red-500/20 text-red-400 border-0'
                        }
                      >
                        {event.event}
                      </Badge>
                      <Badge variant="outline" className="border-white/20 text-gray-300">
                        {event.table}
                      </Badge>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="text-xs text-gray-300 bg-black/30 p-3 rounded overflow-x-auto">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="bg-slate-900 border-white/10 p-6">
          <h3 className="text-white font-bold mb-4">Test Instructions</h3>
          <div className="space-y-3 text-sm text-gray-300">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                1
              </div>
              <p>
                <strong className="text-white">Open Quick Match</strong> in two browser windows
                (or incognito mode for second user)
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                2
              </div>
              <p>
                <strong className="text-white">User A creates a lobby</strong> - watch for INSERT
                event on quick_match_lobbies
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                3
              </div>
              <p>
                <strong className="text-white">User B sees lobby instantly</strong> - lobby should
                appear within 1-2 seconds without refresh
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                4
              </div>
              <p>
                <strong className="text-white">User B joins</strong> - watch for UPDATE on lobby and
                INSERT on online_matches
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                5
              </div>
              <p>
                <strong className="text-white">Both users redirect to match room</strong> - User A
                auto-redirects, User B redirects after join
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                6
              </div>
              <p>
                <strong className="text-white">Submit scores</strong> - watch for UPDATE on
                online_matches and INSERT on online_match_visits
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

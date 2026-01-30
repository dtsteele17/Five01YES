'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Database,
  Shield,
  Zap,
  User,
  Eye,
  RefreshCw,
  Globe,
  LogIn
} from 'lucide-react';

interface TestResult {
  status: 'pass' | 'fail' | 'pending' | 'info';
  message: string;
  details?: string;
  data?: any;
}

interface RealtimeEvent {
  timestamp: string;
  table: string;
  eventType: string;
  record: any;
}

export default function SupabaseCheckPage() {
  const supabase = createClient();
  const router = useRouter();

  const [origin, setOrigin] = useState('');
  const [envCheck, setEnvCheck] = useState<TestResult>({ status: 'pending', message: 'Checking...' });
  const [connectionCheck, setConnectionCheck] = useState<TestResult>({ status: 'pending', message: 'Checking...' });
  const [authCheck, setAuthCheck] = useState<TestResult>({ status: 'pending', message: 'Checking...' });
  const [tournamentsCheck, setTournamentsCheck] = useState<TestResult>({ status: 'pending', message: 'Checking...' });
  const [lobbiesCheck, setLobbiesCheck] = useState<TestResult>({ status: 'pending', message: 'Checking...' });
  const [realtimeCheck, setRealtimeCheck] = useState<TestResult>({ status: 'pending', message: 'Not tested yet' });

  const [userId, setUserId] = useState<string | null>(null);
  const [realtimeActive, setRealtimeActive] = useState(false);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [realtimeStatus, setRealtimeStatus] = useState('disconnected');
  const [lastEventInfo, setLastEventInfo] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
    runChecks();
  }, []);

  async function runChecks() {
    setLoading(true);

    checkEnvVars();
    await checkAuth();
    await checkConnection();
    await checkTournaments();
    await checkLobbies();

    setLoading(false);
  }

  function checkEnvVars() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      setEnvCheck({
        status: 'fail',
        message: 'Missing environment variables',
        details: `URL: ${url ? '✓' : '✗'}, Key: ${key ? '✓' : '✗'}`
      });
    } else {
      try {
        const urlObj = new URL(url);
        const maskedKey = key.slice(0, 20) + '...' + key.slice(-4);
        setEnvCheck({
          status: 'pass',
          message: 'Environment variables found',
          details: `Supabase host: ${urlObj.host} | Key: ${maskedKey}`
        });
      } catch (e) {
        setEnvCheck({
          status: 'fail',
          message: 'Invalid SUPABASE_URL',
          details: String(e)
        });
      }
    }
  }

  async function checkAuth() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error) throw error;

      if (!user) {
        setAuthCheck({
          status: 'info',
          message: 'Not logged in',
          details: 'Sign in to fully test RLS policies and inserts. Click "Sign In" below to authenticate.'
        });
        setUserId(null);
      } else {
        setUserId(user.id);
        setAuthCheck({
          status: 'pass',
          message: 'Authenticated',
          details: `User ID: ${user.id.slice(0, 8)}... | Email: ${user.email || 'N/A'}`
        });
      }
    } catch (error: any) {
      setAuthCheck({
        status: 'fail',
        message: 'Authentication check failed',
        details: error.message
      });
      console.error('Auth check error:', error);
    }
  }

  async function checkConnection() {
    try {
      const { data, error } = await supabase
        .from('healthcheck')
        .select('*')
        .limit(1);

      if (error) throw error;

      setConnectionCheck({
        status: 'pass',
        message: 'Database connection successful',
        details: 'Supabase is reachable and responding'
      });
    } catch (error: any) {
      setConnectionCheck({
        status: 'fail',
        message: 'Connection failed',
        details: error.message
      });
      console.error('Connection error:', error);
    }
  }

  async function checkTournaments() {
    try {
      const { data, error, count } = await supabase
        .from('tournaments')
        .select('id', { count: 'exact' })
        .limit(5);

      if (error) {
        console.error('Tournaments query error:', error);

        if (error.message.includes('relation') && error.message.includes('does not exist')) {
          setTournamentsCheck({
            status: 'fail',
            message: 'Table does not exist',
            details: 'The tournaments table was not found in the database. Run migrations first.'
          });
        } else if (error.message.includes('permission denied') || error.message.includes('row-level security')) {
          setTournamentsCheck({
            status: 'fail',
            message: 'RLS policy issue',
            details: 'Row Level Security is blocking access. Check RLS policies for authenticated users.'
          });
        } else if (error.message.includes('Invalid API key') || error.message.includes('JWT')) {
          setTournamentsCheck({
            status: 'fail',
            message: 'Invalid API key',
            details: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is incorrect or expired.'
          });
        } else {
          throw error;
        }
      } else {
        const dataArray = data || [];
        setTournamentsCheck({
          status: 'pass',
          message: `Found ${count || 0} tournaments`,
          details: dataArray.length > 0 ? `Showing ${dataArray.length} records` : 'No tournaments yet',
          data: dataArray
        });
      }
    } catch (error: any) {
      setTournamentsCheck({
        status: 'fail',
        message: 'Query failed',
        details: error.message
      });
      console.error('Tournaments check error:', error);
    }
  }

  async function checkLobbies() {
    try {
      const { data, error, count } = await supabase
        .from('quick_match_lobbies')
        .select('id', { count: 'exact' })
        .limit(5);

      if (error) {
        console.error('Lobbies query error:', error);

        if (error.message.includes('relation') && error.message.includes('does not exist')) {
          setLobbiesCheck({
            status: 'fail',
            message: 'Table does not exist',
            details: 'The quick_match_lobbies table was not found. Run migrations first.'
          });
        } else if (error.message.includes('permission denied') || error.message.includes('row-level security')) {
          setLobbiesCheck({
            status: 'fail',
            message: 'RLS policy issue',
            details: 'Cannot read lobbies. Check RLS policies allow SELECT.'
          });
        } else if (error.message.includes('Invalid API key') || error.message.includes('JWT')) {
          setLobbiesCheck({
            status: 'fail',
            message: 'Invalid API key',
            details: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is incorrect or expired.'
          });
        } else {
          throw error;
        }
      } else {
        const dataArray = data || [];
        setLobbiesCheck({
          status: 'pass',
          message: `Found ${count || 0} lobbies`,
          details: dataArray.length > 0 ? `Showing ${dataArray.length} records` : 'No lobbies yet',
          data: dataArray
        });
      }
    } catch (error: any) {
      setLobbiesCheck({
        status: 'fail',
        message: 'Query failed',
        details: error.message
      });
      console.error('Lobbies check error:', error);
    }
  }

  async function testRealtime() {
    if (realtimeActive) {
      setRealtimeActive(false);
      setRealtimeStatus('disconnected');
      setLastEventInfo('');
      setRealtimeCheck({
        status: 'info',
        message: 'Realtime subscription stopped',
        details: 'Click "Test Realtime" to start again'
      });
      return;
    }

    setRealtimeCheck({
      status: 'pending',
      message: 'Starting realtime subscription...',
      details: 'Listening for changes to quick_match_lobbies and tournaments'
    });

    try {
      const lobbiesChannel = supabase
        .channel('lobbies-changes')
        .on(
          'postgres_changes' as any,
          { event: '*', schema: 'public', table: 'quick_match_lobbies' },
          (payload: any) => {
            const event: RealtimeEvent = {
              timestamp: new Date().toISOString(),
              table: 'quick_match_lobbies',
              eventType: payload.eventType,
              record: payload.new || payload.old
            };
            setRealtimeEvents(prev => [event, ...prev].slice(0, 10));
            setLastEventInfo(`${event.table} → ${event.eventType} (id: ${event.record?.id?.slice(0, 8)}...)`);
          }
        )
        .subscribe((status) => {
          console.log('[Realtime] Lobbies subscription status:', status);
          setRealtimeStatus(status === 'SUBSCRIBED' ? 'connected' : status);
        });

      const tournamentsChannel = supabase
        .channel('tournaments-changes')
        .on(
          'postgres_changes' as any,
          { event: '*', schema: 'public', table: 'tournaments' },
          (payload: any) => {
            const event: RealtimeEvent = {
              timestamp: new Date().toISOString(),
              table: 'tournaments',
              eventType: payload.eventType,
              record: payload.new || payload.old
            };
            setRealtimeEvents(prev => [event, ...prev].slice(0, 10));
            setLastEventInfo(`${event.table} → ${event.eventType} (id: ${event.record?.id?.slice(0, 8)}...)`);
          }
        )
        .subscribe((status) => {
          console.log('[Realtime] Tournaments subscription status:', status);
          setRealtimeStatus(status === 'SUBSCRIBED' ? 'connected' : status);
        });

      setRealtimeActive(true);
      setRealtimeCheck({
        status: 'pass',
        message: 'Realtime subscription active',
        details: 'Listening for INSERT, UPDATE, DELETE on lobbies and tournaments. Try creating a lobby or tournament in another tab!'
      });
    } catch (error: any) {
      setRealtimeCheck({
        status: 'fail',
        message: 'Realtime subscription failed',
        details: error.message
      });
      console.error('Realtime error:', error);
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'fail':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'pending':
        return <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />;
      case 'info':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      default:
        return null;
    }
  }

  function getStatusBadge(status: string) {
    const variants: Record<string, any> = {
      pass: 'default',
      fail: 'destructive',
      pending: 'secondary',
      info: 'outline'
    };
    return <Badge variant={variants[status] || 'outline'}>{status.toUpperCase()}</Badge>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-yellow-400">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-semibold">Dev Tool</span>
          </div>
          <p className="text-sm text-yellow-300/80 mt-1">
            This page is for debugging Supabase connection issues. Available in both dev and production.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Supabase Health Check</h1>
            <p className="text-slate-400">Verify database connection, RLS policies, and realtime subscriptions</p>
          </div>
          <Button onClick={runChecks} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <Card className="p-6 bg-slate-800 border-slate-700">
          <div className="flex items-center gap-3 mb-4">
            <Globe className="h-6 w-6 text-blue-400" />
            <div>
              <h2 className="text-xl font-semibold text-white">Current Origin</h2>
              <p className="text-sm text-slate-400">Your browser location</p>
            </div>
          </div>
          <p className="text-white font-mono text-sm">{origin || 'Loading...'}</p>
        </Card>

        <Card className="p-6 bg-slate-800 border-slate-700">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <Database className="h-6 w-6 text-blue-400" />
              <div>
                <h2 className="text-xl font-semibold text-white">Environment Variables</h2>
                <p className="text-sm text-slate-400">NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY</p>
              </div>
            </div>
            {getStatusBadge(envCheck.status)}
          </div>
          <div className="flex items-start gap-3">
            {getStatusIcon(envCheck.status)}
            <div className="flex-1">
              <p className="text-white">{envCheck.message}</p>
              {envCheck.details && <p className="text-sm text-slate-400 mt-1 font-mono">{envCheck.details}</p>}
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-slate-800 border-slate-700">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <User className="h-6 w-6 text-purple-400" />
              <div>
                <h2 className="text-xl font-semibold text-white">Authentication Status</h2>
                <p className="text-sm text-slate-400">Current user session</p>
              </div>
            </div>
            {getStatusBadge(authCheck.status)}
          </div>
          <div className="flex items-start gap-3">
            {getStatusIcon(authCheck.status)}
            <div className="flex-1">
              <p className="text-white">{authCheck.message}</p>
              {authCheck.details && <p className="text-sm text-slate-400 mt-1">{authCheck.details}</p>}
              {!userId && authCheck.status === 'info' && (
                <Button
                  onClick={() => router.push('/login')}
                  className="mt-3 bg-emerald-500 hover:bg-emerald-600"
                  size="sm"
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  Sign In
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-slate-800 border-slate-700">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <Database className="h-6 w-6 text-green-400" />
              <div>
                <h2 className="text-xl font-semibold text-white">Database Connection</h2>
                <p className="text-sm text-slate-400">Healthcheck query</p>
              </div>
            </div>
            {getStatusBadge(connectionCheck.status)}
          </div>
          <div className="flex items-start gap-3">
            {getStatusIcon(connectionCheck.status)}
            <div className="flex-1">
              <p className="text-white">{connectionCheck.message}</p>
              {connectionCheck.details && <p className="text-sm text-slate-400 mt-1">{connectionCheck.details}</p>}
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-slate-800 border-slate-700">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <Shield className="h-6 w-6 text-yellow-400" />
              <div>
                <h2 className="text-xl font-semibold text-white">Tournaments Table</h2>
                <p className="text-sm text-slate-400">SELECT id FROM tournaments LIMIT 5</p>
              </div>
            </div>
            {getStatusBadge(tournamentsCheck.status)}
          </div>
          <div className="flex items-start gap-3">
            {getStatusIcon(tournamentsCheck.status)}
            <div className="flex-1">
              <p className="text-white">{tournamentsCheck.message}</p>
              {tournamentsCheck.details && <p className="text-sm text-slate-400 mt-1">{tournamentsCheck.details}</p>}
              {tournamentsCheck.data && tournamentsCheck.data.length > 0 && (
                <div className="mt-3 p-3 bg-slate-900 rounded-lg">
                  <pre className="text-xs text-slate-300 overflow-auto">
                    {JSON.stringify(tournamentsCheck.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-slate-800 border-slate-700">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <Eye className="h-6 w-6 text-cyan-400" />
              <div>
                <h2 className="text-xl font-semibold text-white">Quick Match Lobbies Table</h2>
                <p className="text-sm text-slate-400">SELECT id FROM quick_match_lobbies LIMIT 5</p>
              </div>
            </div>
            {getStatusBadge(lobbiesCheck.status)}
          </div>
          <div className="flex items-start gap-3">
            {getStatusIcon(lobbiesCheck.status)}
            <div className="flex-1">
              <p className="text-white">{lobbiesCheck.message}</p>
              {lobbiesCheck.details && <p className="text-sm text-slate-400 mt-1">{lobbiesCheck.details}</p>}
              {lobbiesCheck.data && lobbiesCheck.data.length > 0 && (
                <div className="mt-3 p-3 bg-slate-900 rounded-lg">
                  <pre className="text-xs text-slate-300 overflow-auto">
                    {JSON.stringify(lobbiesCheck.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-slate-800 border-slate-700">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <Zap className="h-6 w-6 text-orange-400" />
              <div>
                <h2 className="text-xl font-semibold text-white">Realtime Subscriptions</h2>
                <p className="text-sm text-slate-400">postgres_changes for lobbies and tournaments</p>
              </div>
            </div>
            {getStatusBadge(realtimeCheck.status)}
          </div>
          <div className="flex items-start gap-3 mb-4">
            {getStatusIcon(realtimeCheck.status)}
            <div className="flex-1">
              <p className="text-white">{realtimeCheck.message}</p>
              {realtimeCheck.details && <p className="text-sm text-slate-400 mt-1">{realtimeCheck.details}</p>}
            </div>
          </div>

          <div className="flex items-center gap-4 mb-4">
            <Button onClick={testRealtime} variant={realtimeActive ? 'destructive' : 'default'}>
              {realtimeActive ? 'Stop Realtime' : 'Test Realtime'}
            </Button>
            {realtimeActive && (
              <div className="flex items-center gap-2">
                <Badge variant={realtimeStatus === 'connected' ? 'default' : 'secondary'}>
                  {realtimeStatus}
                </Badge>
                {lastEventInfo && (
                  <span className="text-sm text-slate-400">Last: {lastEventInfo}</span>
                )}
              </div>
            )}
          </div>

          {realtimeEvents.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-white">Recent Events ({realtimeEvents.length})</h3>
              {realtimeEvents.map((event, idx) => (
                <div key={idx} className="p-3 bg-slate-900 rounded-lg border border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline">{event.table}</Badge>
                    <Badge>{event.eventType}</Badge>
                    <span className="text-xs text-slate-400">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="text-xs text-slate-300 overflow-auto max-h-32">
                    {JSON.stringify(event.record, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6 bg-slate-800 border-slate-700">
          <h2 className="text-xl font-semibold text-white mb-4">Troubleshooting Guide</h2>
          <div className="space-y-3 text-sm text-slate-300">
            <div>
              <p className="font-semibold text-white">Table does not exist</p>
              <p className="text-slate-400">Run database migrations in Supabase Dashboard.</p>
            </div>
            <div>
              <p className="font-semibold text-white">RLS policy issue</p>
              <p className="text-slate-400">Check RLS policies allow authenticated users to SELECT.</p>
            </div>
            <div>
              <p className="font-semibold text-white">Invalid API key</p>
              <p className="text-slate-400">NEXT_PUBLIC_SUPABASE_ANON_KEY is incorrect or missing from .env file.</p>
            </div>
            <div>
              <p className="font-semibold text-white">Not logged in</p>
              <p className="text-slate-400">Sign in to fully test RLS policies and create tournaments/lobbies.</p>
            </div>
            <div>
              <p className="font-semibold text-white">All checks pass</p>
              <p className="text-slate-400">Supabase is configured correctly!</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

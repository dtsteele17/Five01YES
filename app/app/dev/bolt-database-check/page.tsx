'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  AlertTriangle,
  Database,
  Shield,
  Zap,
  User,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface TestResult {
  status: 'pass' | 'fail' | 'pending' | 'info';
  message: string;
  details?: string;
  timestamp?: string;
}

export default function BoltDatabaseCheckPage() {
  const router = useRouter();
  const [envCheck, setEnvCheck] = useState<TestResult>({ status: 'pending', message: 'Checking...' });
  const [connectionCheck, setConnectionCheck] = useState<TestResult>({ status: 'pending', message: 'Checking...' });
  const [authCheck, setAuthCheck] = useState<TestResult>({ status: 'pending', message: 'Checking...' });
  const [rlsCheck, setRlsCheck] = useState<TestResult>({ status: 'pending', message: 'Not tested yet' });
  const [realtimeCheck, setRealtimeCheck] = useState<TestResult>({ status: 'pending', message: 'Not tested yet' });
  const [tournamentsCheck, setTournamentsCheck] = useState<TestResult>({ status: 'pending', message: 'Checking...' });
  const [lobbiesCheck, setLobbiesCheck] = useState<TestResult>({ status: 'pending', message: 'Checking...' });

  const [user, setUser] = useState<any>(null);
  const [rlsTesting, setRlsTesting] = useState(false);
  const [realtimeTesting, setRealtimeTesting] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  useEffect(() => {
    runInitialChecks();
  }, []);

  async function runInitialChecks() {
    await checkEnvVars();
    await checkConnection();
    await checkAuth();
    await checkTournamentsTable();
    await checkLobbiesTable();
  }

  function checkEnvVars() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      setEnvCheck({
        status: 'fail',
        message: 'Environment variables missing',
        details: `URL: ${url ? 'Present' : 'Missing'}, Key: ${key ? 'Present' : 'Missing'}`,
      });
      return;
    }

    const urlMasked = `${url.substring(0, 8)}...${url.substring(url.length - 6)}`;
    const keyMasked = `${key.substring(0, 6)}...${key.substring(key.length - 6)}`;

    setEnvCheck({
      status: 'pass',
      message: 'Environment variables present',
      details: `URL: ${urlMasked}\nKey: ${keyMasked}`,
    });
  }

  async function checkConnection() {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('healthcheck')
        .select('message')
        .eq('id', 1)
        .maybeSingle();

      if (error) {
        setConnectionCheck({
          status: 'fail',
          message: 'Connection query failed',
          details: `Error: ${error.message}\nCode: ${error.code}`,
        });
        return;
      }

      if (data?.message === 'ok') {
        setConnectionCheck({
          status: 'pass',
          message: 'Connection successful',
          details: 'Public query returned expected result',
        });
      } else {
        setConnectionCheck({
          status: 'fail',
          message: 'Unexpected response',
          details: `Expected "ok", got: ${data?.message}`,
        });
      }
    } catch (error: any) {
      setConnectionCheck({
        status: 'fail',
        message: 'Connection error',
        details: error.message,
      });
    }
  }

  async function checkAuth() {
    try {
      const supabase = createClient();
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error) {
        setAuthCheck({
          status: 'info',
          message: 'Not authenticated',
          details: 'Sign in to test authenticated features',
        });
        return;
      }

      if (user) {
        setUser(user);
        setAuthCheck({
          status: 'pass',
          message: 'Authentication working',
          details: `User ID: ${user.id}\nEmail: ${user.email}`,
        });

        // Subscribe to auth state changes
        supabase.auth.onAuthStateChange((event, session) => {
          console.log('Auth state changed:', event, session?.user?.email);
        });
      } else {
        setAuthCheck({
          status: 'info',
          message: 'Not authenticated',
          details: 'Sign in to test authenticated features',
        });
      }
    } catch (error: any) {
      setAuthCheck({
        status: 'fail',
        message: 'Auth check failed',
        details: error.message,
      });
    }
  }

  async function testRLS() {
    if (!user) {
      toast.error('Please sign in first');
      return;
    }

    setRlsTesting(true);
    setRlsCheck({ status: 'pending', message: 'Testing RLS...' });

    try {
      const supabase = createClient();
      let testId: string | null = null;

      // Test INSERT
      const { data: insertData, error: insertError } = await supabase
        .from('user_connection_test')
        .insert({ user_id: user.id })
        .select()
        .single();

      if (insertError) {
        setRlsCheck({
          status: 'fail',
          message: 'INSERT failed',
          details: `Error: ${insertError.message}\nCode: ${insertError.code}`,
        });
        setRlsTesting(false);
        return;
      }

      testId = insertData.id;

      // Test SELECT
      const { data: selectData, error: selectError } = await supabase
        .from('user_connection_test')
        .select('*')
        .eq('user_id', user.id);

      if (selectError) {
        setRlsCheck({
          status: 'fail',
          message: 'SELECT failed',
          details: `Error: ${selectError.message}\nCode: ${selectError.code}`,
        });
        setRlsTesting(false);
        return;
      }

      if (!selectData || selectData.length === 0) {
        setRlsCheck({
          status: 'fail',
          message: 'SELECT returned no rows',
          details: 'RLS policy may be blocking access',
        });
        setRlsTesting(false);
        return;
      }

      // Test DELETE
      const { error: deleteError } = await supabase
        .from('user_connection_test')
        .delete()
        .eq('id', testId);

      if (deleteError) {
        setRlsCheck({
          status: 'fail',
          message: 'DELETE failed',
          details: `Error: ${deleteError.message}\nCode: ${deleteError.code}`,
        });
        setRlsTesting(false);
        return;
      }

      setRlsCheck({
        status: 'pass',
        message: 'RLS tests passed',
        details: 'INSERT, SELECT, and DELETE operations completed successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      setRlsCheck({
        status: 'fail',
        message: 'RLS test error',
        details: error.message,
      });
    } finally {
      setRlsTesting(false);
    }
  }

  async function testRealtime() {
    if (!user) {
      toast.error('Please sign in first');
      return;
    }

    setRealtimeTesting(true);
    setRealtimeCheck({ status: 'pending', message: 'Setting up subscription...' });

    try {
      const supabase = createClient();
      let eventReceived = false;
      const startTime = Date.now();

      // Subscribe to realtime changes
      const channel = supabase
        .channel('realtime_test_channel')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'realtime_test',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const elapsed = Date.now() - startTime;
            eventReceived = true;
            setRealtimeCheck({
              status: 'pass',
              message: 'Realtime event received',
              details: `Event received in ${elapsed}ms\nPayload ID: ${payload.new.id}`,
              timestamp: new Date().toISOString(),
            });
            setRealtimeConnected(true);
            channel.unsubscribe();
          }
        )
        .subscribe((status) => {
          console.log('Realtime subscription status:', status);
          if (status === 'SUBSCRIBED') {
            setRealtimeConnected(true);
            setRealtimeCheck({
              status: 'info',
              message: 'Subscription active, inserting test data...',
            });

            // Insert test data after subscription is ready
            setTimeout(async () => {
              const { error } = await supabase
                .from('realtime_test')
                .insert({ user_id: user.id });

              if (error) {
                setRealtimeCheck({
                  status: 'fail',
                  message: 'Failed to insert test data',
                  details: `Error: ${error.message}`,
                });
                channel.unsubscribe();
                setRealtimeTesting(false);
                return;
              }

              // Wait 3 seconds for event
              setTimeout(() => {
                if (!eventReceived) {
                  setRealtimeCheck({
                    status: 'fail',
                    message: 'No realtime event received',
                    details: 'Troubleshooting:\n- Verify realtime replication is enabled\n- Check WebSocket connection\n- Verify Supabase project URL is correct',
                  });
                  channel.unsubscribe();
                  setRealtimeTesting(false);
                }
              }, 3000);
            }, 500);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setRealtimeCheck({
              status: 'fail',
              message: 'Subscription failed',
              details: `Status: ${status}\nCheck WebSocket connectivity`,
            });
            setRealtimeTesting(false);
          }
        });

      // Cleanup after 5 seconds
      setTimeout(() => {
        if (realtimeTesting) {
          setRealtimeTesting(false);
        }
      }, 5000);
    } catch (error: any) {
      setRealtimeCheck({
        status: 'fail',
        message: 'Realtime test error',
        details: error.message,
      });
      setRealtimeTesting(false);
    }
  }

  async function checkTournamentsTable() {
    try {
      const supabase = createClient();
      const { count, error } = await supabase
        .from('tournaments')
        .select('*', { count: 'exact', head: true });

      if (error) {
        setTournamentsCheck({
          status: 'fail',
          message: 'Tournaments table error',
          details: `Error: ${error.message}`,
        });
        return;
      }

      const statusMessage = count === 0
        ? 'No tournaments yet (create one to test!)'
        : 'Tournaments table accessible';

      setTournamentsCheck({
        status: count !== null ? 'pass' : 'fail',
        message: statusMessage,
        details: `Count: ${count} tournament${count === 1 ? '' : 's'}`,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      setTournamentsCheck({
        status: 'fail',
        message: 'Tournaments check failed',
        details: error.message,
      });
    }
  }

  async function checkLobbiesTable() {
    try {
      const supabase = createClient();
      const { count, error } = await supabase
        .from('quick_match_lobbies')
        .select('*', { count: 'exact', head: true });

      if (error) {
        setLobbiesCheck({
          status: 'fail',
          message: 'Quick Match lobbies table error',
          details: `Error: ${error.message}`,
        });
        return;
      }

      setLobbiesCheck({
        status: 'pass',
        message: 'Quick Match lobbies table accessible',
        details: `Count: ${count} lobbies`,
      });
    } catch (error: any) {
      setLobbiesCheck({
        status: 'fail',
        message: 'Lobbies check failed',
        details: error.message,
      });
    }
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setAuthCheck({
      status: 'info',
      message: 'Signed out',
      details: 'Sign in to test authenticated features',
    });
    toast.success('Signed out successfully');
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'fail':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'pending':
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      case 'info':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      default:
        return null;
    }
  }

  function getStatusBadge(status: string) {
    const variants = {
      pass: 'bg-green-500/20 text-green-400 border-green-500/30',
      fail: 'bg-red-500/20 text-red-400 border-red-500/30',
      pending: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      info: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    };

    return (
      <Badge className={`${variants[status as keyof typeof variants]} border`}>
        {status.toUpperCase()}
      </Badge>
    );
  }

  const TestSection = ({
    icon: Icon,
    title,
    result
  }: {
    icon: any;
    title: string;
    result: TestResult
  }) => (
    <div className="p-6 bg-white/5 border border-white/10 rounded-lg">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <Icon className="w-5 h-5 text-emerald-400" />
          <h3 className="text-lg font-semibold text-white">{title}</h3>
        </div>
        {getStatusBadge(result.status)}
      </div>

      <div className="flex items-start space-x-3 mb-3">
        {getStatusIcon(result.status)}
        <div className="flex-1">
          <p className="text-gray-300 mb-2">{result.message}</p>
          {result.details && (
            <div className="relative">
              <pre className="text-xs text-gray-400 bg-black/30 p-3 rounded border border-white/5 overflow-x-auto">
                {result.details}
              </pre>
              <Button
                size="sm"
                variant="ghost"
                className="absolute top-2 right-2 h-6 w-6 p-0"
                onClick={() => copyToClipboard(result.details || '')}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          )}
          {result.timestamp && (
            <p className="text-xs text-gray-500 mt-2">
              {new Date(result.timestamp).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Bolt Database Connection Check
            </h1>
            <p className="text-gray-400">
              Verify Supabase connection, authentication, RLS, and realtime functionality
            </p>
          </div>
          <Button variant="outline" onClick={() => router.back()}>
            Back
          </Button>
        </div>

        {/* Environment Variables Warning */}
        {envCheck.status === 'fail' && (
          <Card className="bg-red-500/10 border-red-500/30 p-6">
            <div className="flex items-start space-x-3">
              <XCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-red-400 mb-2">
                  Supabase Environment Variables Missing
                </h3>
                <p className="text-gray-300">
                  Connection will not work. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in your environment.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Basic Checks */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Eye className="w-5 h-5 text-emerald-400" />
            <span>Basic Checks</span>
          </h2>

          <TestSection icon={Database} title="Environment Variables" result={envCheck} />
          <TestSection icon={Database} title="Database Connection" result={connectionCheck} />
        </div>

        {/* Authentication */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <User className="w-5 h-5 text-emerald-400" />
            <span>Authentication</span>
          </h2>

          <TestSection icon={User} title="Auth Status" result={authCheck} />

          <div className="flex space-x-3">
            {user ? (
              <Button onClick={handleSignOut} variant="outline">
                Sign Out
              </Button>
            ) : (
              <Button onClick={() => router.push('/login')} className="bg-emerald-500 hover:bg-emerald-600">
                Sign In Test
              </Button>
            )}
          </div>
        </div>

        {/* RLS Tests */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            <span>Row Level Security (RLS)</span>
          </h2>

          <TestSection icon={Shield} title="RLS Tests (Insert/Select/Delete)" result={rlsCheck} />

          <Button
            onClick={testRLS}
            disabled={!user || rlsTesting}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50"
          >
            {rlsTesting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Testing RLS...
              </>
            ) : (
              'Run RLS Test'
            )}
          </Button>

          {!user && (
            <p className="text-sm text-yellow-400">
              Log in to run RLS tests
            </p>
          )}
        </div>

        {/* Realtime Tests */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Zap className="w-5 h-5 text-emerald-400" />
            <span>Realtime Subscriptions</span>
          </h2>

          <TestSection icon={Zap} title="Realtime Test" result={realtimeCheck} />

          <Button
            onClick={testRealtime}
            disabled={!user || realtimeTesting}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50"
          >
            {realtimeTesting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Testing Realtime...
              </>
            ) : (
              'Trigger Realtime Event'
            )}
          </Button>

          {!user && (
            <p className="text-sm text-yellow-400">
              Log in to run realtime tests
            </p>
          )}
        </div>

        {/* Production Tables */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Database className="w-5 h-5 text-emerald-400" />
            <span>Production Tables</span>
          </h2>

          <TestSection icon={Database} title="Tournaments Table" result={tournamentsCheck} />
          <Button
            onClick={checkTournamentsTable}
            variant="outline"
            size="sm"
            className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
          >
            Refresh Tournaments Count
          </Button>

          <TestSection icon={Database} title="Quick Match Lobbies Table" result={lobbiesCheck} />
          <Button
            onClick={checkLobbiesTable}
            variant="outline"
            size="sm"
            className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
          >
            Refresh Lobbies Count
          </Button>
        </div>

        {/* Refresh Button */}
        <div className="flex justify-center pt-6">
          <Button
            onClick={runInitialChecks}
            variant="outline"
            className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
          >
            Refresh All Checks
          </Button>
        </div>
      </div>
    </div>
  );
}

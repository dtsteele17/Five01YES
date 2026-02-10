'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';

export default function TestConnectionPage() {
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<any>(null);

  const testConnection = async () => {
    setTesting(true);
    const testResults: any = {
      timestamp: new Date().toISOString(),
      tests: {},
    };

    try {
      // Test 1: Check environment variables
      testResults.tests.envVars = {
        url: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Found' : 'Missing',
        anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Found' : 'Missing',
        urlValue: process.env.NEXT_PUBLIC_SUPABASE_URL,
      };

      // Test 2: Create Supabase client
      try {
        const supabase = createClient();
        testResults.tests.clientCreation = 'Success';

        // Test 3: Simple REST API call (health check)
        try {
          const { data, error } = await supabase.from('profiles').select('count', { count: 'exact', head: true });

          if (error) {
            testResults.tests.databaseQuery = {
              status: 'Error',
              error: {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
              },
            };
          } else {
            testResults.tests.databaseQuery = {
              status: 'Success',
              count: data,
            };
          }
        } catch (err: any) {
          testResults.tests.databaseQuery = {
            status: 'Exception',
            error: err.message,
            type: err.name,
          };
        }

        // Test 4: Auth status
        try {
          const { data: session } = await supabase.auth.getSession();
          testResults.tests.authCheck = {
            status: 'Success',
            hasSession: !!session.session,
            userId: session.session?.user?.id || null,
          };
        } catch (err: any) {
          testResults.tests.authCheck = {
            status: 'Exception',
            error: err.message,
          };
        }

        // Test 5: Direct fetch to Supabase
        try {
          const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const response = await fetch(`${url}/rest/v1/`, {
            method: 'GET',
            headers: {
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
              'Content-Type': 'application/json',
            },
          });

          testResults.tests.directFetch = {
            status: response.ok ? 'Success' : 'Failed',
            statusCode: response.status,
            statusText: response.statusText,
          };
        } catch (err: any) {
          testResults.tests.directFetch = {
            status: 'Exception',
            error: err.message,
            type: err.name,
          };
        }

      } catch (err: any) {
        testResults.tests.clientCreation = {
          status: 'Failed',
          error: err.message,
        };
      }

    } catch (err: any) {
      testResults.error = {
        message: err.message,
        stack: err.stack,
      };
    }

    setResults(testResults);
    setTesting(false);
  };

  const getStatusIcon = (test: any) => {
    if (test === 'Success' || test?.status === 'Success') {
      return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    } else if (test?.status === 'Error' || test?.status === 'Exception' || test?.status === 'Failed') {
      return <XCircle className="w-5 h-5 text-red-500" />;
    }
    return <AlertCircle className="w-5 h-5 text-yellow-500" />;
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Supabase Connection Test</h1>
          <p className="text-muted-foreground mt-2">
            Diagnose connection issues with your Supabase database
          </p>
        </div>

        <Card className="p-6">
          <Button
            onClick={testConnection}
            disabled={testing}
            className="w-full"
          >
            {testing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Testing Connection...
              </>
            ) : (
              'Run Connection Test'
            )}
          </Button>
        </Card>

        {results && (
          <Card className="p-6 space-y-4">
            <h2 className="text-xl font-semibold">Test Results</h2>
            <p className="text-sm text-muted-foreground">
              Run at: {new Date(results.timestamp).toLocaleString()}
            </p>

            <div className="space-y-4 mt-4">
              {/* Environment Variables */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  {getStatusIcon(results.tests.envVars?.url === 'Found' && results.tests.envVars?.anonKey === 'Found' ? 'Success' : 'Failed')}
                  <h3 className="font-semibold">1. Environment Variables</h3>
                </div>
                <pre className="text-xs bg-muted p-3 rounded overflow-auto">
                  {JSON.stringify(results.tests.envVars, null, 2)}
                </pre>
              </div>

              {/* Client Creation */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  {getStatusIcon(results.tests.clientCreation)}
                  <h3 className="font-semibold">2. Client Creation</h3>
                </div>
                <pre className="text-xs bg-muted p-3 rounded overflow-auto">
                  {JSON.stringify(results.tests.clientCreation, null, 2)}
                </pre>
              </div>

              {/* Database Query */}
              {results.tests.databaseQuery && (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {getStatusIcon(results.tests.databaseQuery)}
                    <h3 className="font-semibold">3. Database Query</h3>
                  </div>
                  <pre className="text-xs bg-muted p-3 rounded overflow-auto">
                    {JSON.stringify(results.tests.databaseQuery, null, 2)}
                  </pre>
                </div>
              )}

              {/* Auth Check */}
              {results.tests.authCheck && (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {getStatusIcon(results.tests.authCheck)}
                    <h3 className="font-semibold">4. Auth Status</h3>
                  </div>
                  <pre className="text-xs bg-muted p-3 rounded overflow-auto">
                    {JSON.stringify(results.tests.authCheck, null, 2)}
                  </pre>
                </div>
              )}

              {/* Direct Fetch */}
              {results.tests.directFetch && (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {getStatusIcon(results.tests.directFetch)}
                    <h3 className="font-semibold">5. Direct Fetch Test</h3>
                  </div>
                  <pre className="text-xs bg-muted p-3 rounded overflow-auto">
                    {JSON.stringify(results.tests.directFetch, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Overall Error */}
            {results.error && (
              <div className="border border-red-500 rounded-lg p-4 bg-red-50 dark:bg-red-950">
                <h3 className="font-semibold text-red-700 dark:text-red-300 mb-2">
                  Overall Error
                </h3>
                <pre className="text-xs text-red-600 dark:text-red-400 overflow-auto">
                  {JSON.stringify(results.error, null, 2)}
                </pre>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

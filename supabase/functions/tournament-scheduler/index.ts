// Supabase Edge Function: Tournament Scheduler
// Runs every minute to process tournaments and ready deadlines

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    console.log('[TOURNAMENT SCHEDULER] Starting run at:', new Date().toISOString())

    // Process due tournaments (status transitions and bracket generation)
    const { data: dueData, error: dueError } = await supabase.rpc('process_due_tournaments')
    
    if (dueError) {
      console.error('[TOURNAMENT SCHEDULER] process_due_tournaments error:', dueError)
    } else {
      console.log('[TOURNAMENT SCHEDULER] process_due_tournaments result:', dueData)
    }

    // Process ready deadlines (auto-forfeits)
    const { data: readyData, error: readyError } = await supabase.rpc('process_ready_deadlines')
    
    if (readyError) {
      console.error('[TOURNAMENT SCHEDULER] process_ready_deadlines error:', readyError)
    } else {
      console.log('[TOURNAMENT SCHEDULER] process_ready_deadlines result:', readyData)
    }

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        due_tournaments: dueData || null,
        ready_deadlines: readyData || null,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('[TOURNAMENT SCHEDULER] Unexpected error:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Missing environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    let bracketsGenerated = 0;
    let tournamentsStarted = 0;
    const errors: string[] = [];

    console.log("[TOURNAMENT_CRON] Starting cron job execution");

    // PHASE 1: Generate brackets for tournaments starting in 5 minutes
    console.log("[TOURNAMENT_CRON] Phase 1: Checking tournaments for bracket generation");

    const { data: tournamentsForBrackets, error: bracketQueryError } = await supabase
      .from("tournaments")
      .select("id, name, start_at")
      .eq("status", "registration")
      .is("bracket_generated_at", null)
      .lte("start_at", new Date(Date.now() + 5 * 60 * 1000).toISOString());

    if (bracketQueryError) {
      console.error("[TOURNAMENT_CRON] Error querying tournaments for brackets:", bracketQueryError);
      errors.push(`Bracket query error: ${bracketQueryError.message}`);
    } else {
      console.log(`[TOURNAMENT_CRON] Found ${tournamentsForBrackets?.length || 0} tournaments needing brackets`);

      for (const tournament of tournamentsForBrackets || []) {
        try {
          console.log(`[TOURNAMENT_CRON] Generating bracket for tournament ${tournament.id} (${tournament.name})`);

          const { error: rpcError } = await supabase.rpc("generate_tournament_bracket", {
            tournament_id: tournament.id,
          });

          if (rpcError) {
            console.error(`[TOURNAMENT_CRON] Failed to generate bracket for ${tournament.id}:`, rpcError);
            errors.push(`Bracket generation for ${tournament.name}: ${rpcError.message}`);
          } else {
            bracketsGenerated++;
            console.log(`[TOURNAMENT_CRON] Successfully generated bracket for ${tournament.id}`);
          }
        } catch (error: any) {
          console.error(`[TOURNAMENT_CRON] Exception generating bracket for ${tournament.id}:`, error);
          errors.push(`Bracket generation exception for ${tournament.name}: ${error.message}`);
        }
      }
    }

    // PHASE 2: Process tournament status transitions (start tournaments or cancel if insufficient participants)
    console.log("[TOURNAMENT_CRON] Phase 2: Processing tournament status transitions");

    try {
      const { data: statusResult, error: statusError } = await supabase
        .rpc('process_tournament_status_transitions');

      if (statusError) {
        console.error("[TOURNAMENT_CRON] Error processing tournament status transitions:", statusError);
        errors.push(`Status transition error: ${statusError.message}`);
      } else if (statusResult) {
        console.log("[TOURNAMENT_CRON] Tournament status transitions completed:", statusResult);
        
        tournamentsStarted = statusResult.tournaments_started || 0;
        const tournamentsCancelled = statusResult.tournaments_cancelled || 0;
        
        console.log(`[TOURNAMENT_CRON] Started ${tournamentsStarted} tournaments`);
        console.log(`[TOURNAMENT_CRON] Cancelled ${tournamentsCancelled} tournaments (insufficient participants)`);
        
        if (statusResult.results && statusResult.results.length > 0) {
          for (const result of statusResult.results) {
            if (result.action === 'started') {
              console.log(`[TOURNAMENT_CRON] ✓ Started: ${result.tournament_name} (${result.participant_count} participants)`);
            } else if (result.action === 'cancelled') {
              console.log(`[TOURNAMENT_CRON] ✗ Cancelled: ${result.tournament_name} (${result.participant_count} participants - insufficient)`);
            }
          }
        }
      }
    } catch (error: any) {
      console.error("[TOURNAMENT_CRON] Exception in status transitions:", error);
      errors.push(`Status transition exception: ${error.message}`);
      
      // Fallback to old method
      console.log("[TOURNAMENT_CRON] Falling back to legacy tournament starting logic");
      
      const { data: tournamentsToStart, error: startQueryError } = await supabase
        .from("tournaments")
        .select("id, name, start_at")
        .in("status", ["registration", "scheduled", "checkin"])
        .lte("start_at", new Date().toISOString());

      if (startQueryError) {
        console.error("[TOURNAMENT_CRON] Error querying tournaments to start:", startQueryError);
        errors.push(`Legacy start query error: ${startQueryError.message}`);
      } else {
        console.log(`[TOURNAMENT_CRON] Found ${tournamentsToStart?.length || 0} tournaments to process (legacy)`);

        for (const tournament of tournamentsToStart || []) {
          try {
            console.log(`[TOURNAMENT_CRON] Processing tournament ${tournament.id} (${tournament.name}) with legacy logic`);

            // Check participant count
            const { count: participantCount } = await supabase
              .from('tournament_participants')
              .select('*', { count: 'exact', head: true })
              .eq('tournament_id', tournament.id);

            if (participantCount && participantCount >= 2) {
              // Start tournament
              const { error: updateError } = await supabase
                .from('tournaments')
                .update({ 
                  status: 'in_progress',
                  started_at: new Date().toISOString()
                })
                .eq('id', tournament.id);

              if (!updateError) {
                tournamentsStarted++;
                console.log(`[TOURNAMENT_CRON] ✓ Started tournament ${tournament.id} (${participantCount} participants)`);
              }
            } else {
              // Cancel tournament
              const { error: cancelError } = await supabase
                .from('tournaments')
                .update({ 
                  status: 'cancelled',
                  cancelled_reason: 'Insufficient participants'
                })
                .eq('id', tournament.id);

              if (!cancelError) {
                console.log(`[TOURNAMENT_CRON] ✗ Cancelled tournament ${tournament.id} (${participantCount || 0} participants)`);
              }
            }
          } catch (error: any) {
            console.error(`[TOURNAMENT_CRON] Exception processing tournament ${tournament.id}:`, error);
            errors.push(`Legacy processing exception for ${tournament.name}: ${error.message}`);
          }
        }
      }
    }

    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      processed: {
        bracketsGenerated,
        tournamentsStarted,
      },
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log("[TOURNAMENT_CRON] Execution completed:", result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    console.error("[TOURNAMENT_CRON] Fatal error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Unknown error occurred",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});

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

    // PHASE 2: Start tournaments whose start time has arrived
    console.log("[TOURNAMENT_CRON] Phase 2: Checking tournaments to start");

    const { data: tournamentsToStart, error: startQueryError } = await supabase
      .from("tournaments")
      .select("id, name, start_at")
      .eq("status", "registration")
      .is("started_at", null)
      .lte("start_at", new Date().toISOString());

    if (startQueryError) {
      console.error("[TOURNAMENT_CRON] Error querying tournaments to start:", startQueryError);
      errors.push(`Start query error: ${startQueryError.message}`);
    } else {
      console.log(`[TOURNAMENT_CRON] Found ${tournamentsToStart?.length || 0} tournaments to start`);

      for (const tournament of tournamentsToStart || []) {
        try {
          console.log(`[TOURNAMENT_CRON] Starting tournament ${tournament.id} (${tournament.name})`);

          const { error: rpcError } = await supabase.rpc("start_tournament_round_one", {
            tournament_id: tournament.id,
          });

          if (rpcError) {
            console.error(`[TOURNAMENT_CRON] Failed to start tournament ${tournament.id}:`, rpcError);
            errors.push(`Tournament start for ${tournament.name}: ${rpcError.message}`);
          } else {
            tournamentsStarted++;
            console.log(`[TOURNAMENT_CRON] Successfully started tournament ${tournament.id}`);
          }
        } catch (error: any) {
          console.error(`[TOURNAMENT_CRON] Exception starting tournament ${tournament.id}:`, error);
          errors.push(`Tournament start exception for ${tournament.name}: ${error.message}`);
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

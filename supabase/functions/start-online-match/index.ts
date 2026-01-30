import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface StartMatchRequest {
  matchId: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization")!;

    const supabaseClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { matchId }: StartMatchRequest = await req.json();

    const { data: match, error: matchError } = await supabaseClient
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .single();

    if (matchError || !match) {
      return new Response(
        JSON.stringify({ error: "Match not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (match.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Only match owner can start the match" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (match.status !== "lobby") {
      return new Response(
        JSON.stringify({ error: "Match already started or completed" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: players } = await supabaseClient
      .from("match_players")
      .select("*")
      .eq("match_id", matchId)
      .order("seat", { ascending: true });

    if (!players || players.length !== 2) {
      return new Response(
        JSON.stringify({ error: "Need exactly 2 players to start" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const startingScore = match.game_mode === "301" ? 301 : 501;

    await supabaseAdmin
      .from("matches")
      .update({
        status: "in_progress",
        started_at: new Date().toISOString(),
      })
      .eq("id", matchId);

    await supabaseAdmin
      .from("match_state")
      .insert({
        match_id: matchId,
        current_leg: 1,
        p1_remaining: startingScore,
        p2_remaining: startingScore,
        p1_legs_won: 0,
        p2_legs_won: 0,
        current_turn_user_id: players[0].user_id,
        last_action_at: new Date().toISOString(),
        state: {
          visits: [],
          p1CheckoutDartsAttempted: 0,
          p1CheckoutsMade: 0,
          p2CheckoutDartsAttempted: 0,
          p2CheckoutsMade: 0,
        },
        updated_at: new Date().toISOString(),
      });

    await supabaseAdmin
      .from("match_events")
      .insert({
        match_id: matchId,
        user_id: user.id,
        type: "match_started",
        payload: {
          player1: players[0].player_name,
          player2: players[1].player_name,
          gameMode: match.game_mode,
          format: match.match_format,
        },
      });

    await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: players[1].user_id,
        type: "match_invite",
        title: "Match Started",
        body: `Your match with ${players[0].player_name} has started`,
        link: `/app/match/online/${matchId}`,
        is_read: false,
      });

    return new Response(
      JSON.stringify({
        success: true,
        matchId,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error starting match:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

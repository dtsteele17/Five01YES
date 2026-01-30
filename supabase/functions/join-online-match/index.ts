import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface JoinMatchRequest {
  inviteCode: string;
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
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization")!;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { inviteCode }: JoinMatchRequest = await req.json();

    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("*")
      .eq("invite_code", inviteCode.toUpperCase())
      .eq("status", "lobby")
      .maybeSingle();

    if (matchError || !match) {
      return new Response(
        JSON.stringify({ error: "Match not found or already started" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (match.user_id === user.id) {
      return new Response(
        JSON.stringify({ error: "Cannot join your own match" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: existingPlayers } = await supabase
      .from("match_players")
      .select("*")
      .eq("match_id", match.id);

    if (existingPlayers && existingPlayers.length >= 2) {
      return new Response(
        JSON.stringify({ error: "Match is full" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const alreadyJoined = existingPlayers?.some(p => p.user_id === user.id);
    if (alreadyJoined) {
      return new Response(
        JSON.stringify({
          success: true,
          match: {
            id: match.id,
            gameMode: match.game_mode,
            bestOf: match.match_format === "best-of-1" ? 1 : match.match_format === "best-of-3" ? 3 : 5,
            doubleOut: match.double_out,
            straightIn: match.straight_in,
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    const playerName = profile?.display_name || "Player";

    const { error: playerError } = await supabase
      .from("match_players")
      .insert({
        match_id: match.id,
        user_id: user.id,
        seat: 2,
        player_name: playerName,
        is_bot: false,
      });

    if (playerError) {
      return new Response(
        JSON.stringify({ error: playerError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    await supabase
      .from("matches")
      .update({
        player2_name: playerName,
        opponent_id: user.id,
        opponent_type: "user",
      })
      .eq("id", match.id);

    await supabase
      .from("notifications")
      .insert({
        user_id: match.user_id,
        type: "match_invite",
        title: "Player Joined",
        body: `${playerName} joined your match`,
        link: `/app/play/private/lobby/${match.id}`,
        is_read: false,
      });

    return new Response(
      JSON.stringify({
        success: true,
        match: {
          id: match.id,
          gameMode: match.game_mode,
          bestOf: match.match_format === "best-of-1" ? 1 : match.match_format === "best-of-3" ? 3 : 5,
          doubleOut: match.double_out,
          straightIn: match.straight_in,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error joining match:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

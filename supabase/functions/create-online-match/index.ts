import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CreateMatchRequest {
  gameMode: "301" | "501";
  bestOf: 1 | 3 | 5;
  doubleOut: boolean;
  straightIn: boolean;
}

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
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

    const {
      gameMode,
      bestOf,
      doubleOut,
      straightIn,
    }: CreateMatchRequest = await req.json();

    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    const playerName = profile?.username || "Player";

    const inviteCode = generateInviteCode();
    const matchFormat = bestOf === 1 ? "best-of-1" : bestOf === 3 ? "best-of-3" : "best-of-5";

    const { data: match, error: matchError } = await supabase
      .from("matches")
      .insert({
        user_id: user.id,
        match_type: "private",
        game_mode: gameMode,
        match_format: matchFormat,
        double_out: doubleOut,
        straight_in: straightIn,
        status: "lobby",
        invite_code: inviteCode,
        player1_name: playerName,
        player1_legs_won: 0,
        player2_legs_won: 0,
      })
      .select()
      .single();

    if (matchError) {
      return new Response(
        JSON.stringify({ error: matchError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { error: playerError } = await supabase
      .from("match_players")
      .insert({
        match_id: match.id,
        user_id: user.id,
        seat: 1,
        player_name: playerName,
        is_bot: false,
      });

    if (playerError) {
      await supabase.from("matches").delete().eq("id", match.id);
      return new Response(
        JSON.stringify({ error: playerError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        match: {
          id: match.id,
          inviteCode,
          gameMode,
          bestOf,
          doubleOut,
          straightIn,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error creating match:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

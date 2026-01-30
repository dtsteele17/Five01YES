import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SubmitVisitRequest {
  matchId: string;
  legId: string;
  player: "player1" | "player2";
  visitNumber: number;
  darts: string[];
  score: number;
  dartsThrown: number;
  lastDartType?: "S" | "D" | "T" | "BULL" | "SBULL";
  checkoutDartsAtDouble?: number;
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

    const {
      matchId,
      legId,
      player,
      visitNumber,
      darts,
      score,
      dartsThrown,
      lastDartType,
      checkoutDartsAtDouble,
    }: SubmitVisitRequest = await req.json();

    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("*, match_legs!inner(*)")
      .eq("id", matchId)
      .eq("match_legs.id", legId)
      .single();

    if (matchError || !match) {
      return new Response(
        JSON.stringify({ error: "Match or leg not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: lastVisit } = await supabase
      .from("match_visits")
      .select("remaining_score")
      .eq("leg_id", legId)
      .eq("player", player)
      .order("visit_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const startingScore = match.game_mode === "301" ? 301 : 501;
    const remainingBefore = lastVisit?.remaining_score ?? startingScore;
    const remainingAfter = remainingBefore - score;

    const isBust = remainingAfter < 0 || remainingAfter === 1;
    const isCheckout = remainingAfter === 0;

    const finalRemaining = isBust ? remainingBefore : remainingAfter;

    const { error: insertError } = await supabase.from("match_visits").insert({
      leg_id: legId,
      player,
      visit_number: visitNumber,
      score: isBust ? 0 : score,
      remaining_score: finalRemaining,
      is_bust: isBust,
      is_checkout: isCheckout,
      darts: darts,
      darts_thrown: dartsThrown,
      last_dart_type: lastDartType,
      checkout_darts_at_double: checkoutDartsAtDouble,
    });

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isCheckout) {
      await supabase
        .from("match_legs")
        .update({
          winner: player,
          completed_at: new Date().toISOString(),
        })
        .eq("id", legId);

      const playerLegsField =
        player === "player1" ? "player1_legs_won" : "player2_legs_won";
      const currentLegsWon = match[playerLegsField] || 0;
      const newLegsWon = currentLegsWon + 1;

      await supabase
        .from("matches")
        .update({ [playerLegsField]: newLegsWon })
        .eq("id", matchId);

      const legsToWin = match.match_format === "best-of-1" ? 1
        : match.match_format === "best-of-3" ? 2
        : 3;

      if (newLegsWon >= legsToWin) {
        const { data: { user } } = await supabase.auth.getUser();

        await supabase
          .from("matches")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            winner_id: user?.id,
            winner_name: player === "player1" ? match.player1_name : match.player2_name,
          })
          .eq("id", matchId);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        remainingAfter: finalRemaining,
        isBust,
        isCheckout,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SubmitVisitRequest {
  matchId: string;
  score: number;
  dartsAtDouble?: number;
  isCheckout?: boolean;
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

    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

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

    const {
      matchId,
      score,
      dartsAtDouble = 0,
      isCheckout = false,
    }: SubmitVisitRequest = await req.json();

    const { data: match, error: matchError } = await supabaseClient
      .from("online_matches")
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

    if (match.status !== "active") {
      return new Response(
        JSON.stringify({ error: "Match not active" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (match.current_turn_player_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Not your turn" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const isPlayer1 = user.id === match.player1_id;
    const playerKey = isPlayer1 ? "p1" : "p2";
    const opponentKey = isPlayer1 ? "p2" : "p1";

    const currentRemaining = match[`${playerKey}_remaining`];
    const remainingAfter = currentRemaining - score;

    const isBust = remainingAfter < 0 || remainingAfter === 1 ||
      (match.double_out && remainingAfter === 0 && !isCheckout);

    const actualCheckout = remainingAfter === 0 && (!match.double_out || isCheckout);
    const finalRemaining = isBust ? currentRemaining : remainingAfter;

    const { data: visitCount } = await supabaseClient
      .from("online_match_visits")
      .select("visit_number", { count: "exact", head: true })
      .eq("match_id", matchId)
      .eq("player_id", user.id)
      .eq("leg_number", match.leg_number);

    const visitNumber = (visitCount || 0) + 1;

    await supabaseClient
      .from("online_match_visits")
      .insert({
        match_id: matchId,
        player_id: user.id,
        leg_number: match.leg_number,
        visit_number: visitNumber,
        score: isBust ? 0 : score,
        darts_at_double: dartsAtDouble,
        is_checkout: actualCheckout,
        checkout_value: actualCheckout ? score : null,
        new_remaining: finalRemaining,
      });

    let newP1LegsWon = match.p1_legs_won;
    let newP2LegsWon = match.p2_legs_won;
    let newLegNumber = match.leg_number;
    let newP1Remaining = match.p1_remaining;
    let newP2Remaining = match.p2_remaining;
    let matchCompleted = false;
    let winnerId = null;

    if (actualCheckout) {
      if (isPlayer1) {
        newP1LegsWon += 1;
      } else {
        newP2LegsWon += 1;
      }

      const legsToWin = Math.ceil(match.best_of / 2);

      if (newP1LegsWon >= legsToWin || newP2LegsWon >= legsToWin) {
        matchCompleted = true;
        winnerId = newP1LegsWon >= legsToWin ? match.player1_id : match.player2_id;

        await supabaseClient
          .from("online_matches")
          .update({
            status: "finished",
            p1_legs_won: newP1LegsWon,
            p2_legs_won: newP2LegsWon,
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", matchId);
      } else {
        newLegNumber += 1;
        newP1Remaining = match.game_type;
        newP2Remaining = match.game_type;

        await supabaseClient
          .from("online_matches")
          .update({
            leg_number: newLegNumber,
            p1_remaining: newP1Remaining,
            p2_remaining: newP2Remaining,
            p1_legs_won: newP1LegsWon,
            p2_legs_won: newP2LegsWon,
            current_turn_player_id: match.player1_id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", matchId);
      }
    } else {
      const updates: any = {
        [`${playerKey}_remaining`]: finalRemaining,
        current_turn_player_id: isPlayer1 ? match.player2_id : match.player1_id,
        updated_at: new Date().toISOString(),
      };

      await supabaseClient
        .from("online_matches")
        .update(updates)
        .eq("id", matchId);

      if (isPlayer1) {
        newP1Remaining = finalRemaining;
      } else {
        newP2Remaining = finalRemaining;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        remainingAfter: finalRemaining,
        isBust,
        isCheckout: actualCheckout,
        legWon: actualCheckout,
        matchCompleted,
        winnerId,
        newState: {
          legNumber: newLegNumber,
          p1Remaining: newP1Remaining,
          p2Remaining: newP2Remaining,
          p1LegsWon: newP1LegsWon,
          p2LegsWon: newP2LegsWon,
          currentTurnPlayerId: matchCompleted
            ? match.current_turn_player_id
            : (isPlayer1 ? match.player2_id : match.player1_id),
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error submitting visit:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

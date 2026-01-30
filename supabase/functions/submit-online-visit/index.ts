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
  darts: string[];
  dartsThrown: number;
  wasCheckoutAttempt?: boolean;
  dartsAtDouble?: number;
  checkoutSuccess?: boolean;
}

interface MatchState {
  visits: Array<{
    player: string;
    legNumber: number;
    visitNumber: number;
    score: number;
    darts: string[];
    dartsThrown: number;
    remainingBefore: number;
    remainingAfter: number;
    isBust: boolean;
    isCheckout: boolean;
    wasCheckoutAttempt?: boolean;
    dartsAtDouble?: number;
  }>;
  p1CheckoutDartsAttempted: number;
  p1CheckoutsMade: number;
  p2CheckoutDartsAttempted: number;
  p2CheckoutsMade: number;
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization")!;

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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
      darts,
      dartsThrown,
      wasCheckoutAttempt,
      dartsAtDouble,
      checkoutSuccess,
    }: SubmitVisitRequest = await req.json();

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

    if (match.status !== "in_progress") {
      return new Response(
        JSON.stringify({ error: "Match not in progress" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: matchState, error: stateError } = await supabaseClient
      .from("match_state")
      .select("*")
      .eq("match_id", matchId)
      .single();

    if (stateError || !matchState) {
      return new Response(
        JSON.stringify({ error: "Match state not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (matchState.current_turn_user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Not your turn" }),
        {
          status: 403,
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
        JSON.stringify({ error: "Invalid match players" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const player1 = players[0];
    const player2 = players[1];
    const isPlayer1 = user.id === player1.user_id;
    const playerKey = isPlayer1 ? "p1" : "p2";
    const opponentKey = isPlayer1 ? "p2" : "p1";

    const currentRemaining = matchState[`${playerKey}_remaining`];
    const state: MatchState = matchState.state as MatchState || {
      visits: [],
      p1CheckoutDartsAttempted: 0,
      p1CheckoutsMade: 0,
      p2CheckoutDartsAttempted: 0,
      p2CheckoutsMade: 0,
    };

    const remainingAfter = currentRemaining - score;
    const isBust = remainingAfter < 0 || remainingAfter === 1 || (match.double_out && remainingAfter === 0 && !checkoutSuccess);
    const isCheckout = remainingAfter === 0 && (!match.double_out || checkoutSuccess);

    const finalRemaining = isBust ? currentRemaining : remainingAfter;

    const visitNumber = state.visits.filter(v =>
      v.player === (isPlayer1 ? "player1" : "player2") &&
      v.legNumber === matchState.current_leg
    ).length + 1;

    const visit = {
      player: isPlayer1 ? "player1" : "player2",
      legNumber: matchState.current_leg,
      visitNumber,
      score: isBust ? 0 : score,
      darts,
      dartsThrown,
      remainingBefore: currentRemaining,
      remainingAfter: finalRemaining,
      isBust,
      isCheckout,
      wasCheckoutAttempt,
      dartsAtDouble: dartsAtDouble || 0,
    };

    state.visits.push(visit);

    if (wasCheckoutAttempt && dartsAtDouble) {
      if (isPlayer1) {
        state.p1CheckoutDartsAttempted += dartsAtDouble;
        if (checkoutSuccess) state.p1CheckoutsMade += 1;
      } else {
        state.p2CheckoutDartsAttempted += dartsAtDouble;
        if (checkoutSuccess) state.p2CheckoutsMade += 1;
      }
    }

    await supabaseAdmin
      .from("match_events")
      .insert({
        match_id: matchId,
        user_id: user.id,
        type: isBust ? "bust" : isCheckout ? "checkout" : "visit_submitted",
        payload: visit,
      });

    let newP1LegsWon = matchState.p1_legs_won;
    let newP2LegsWon = matchState.p2_legs_won;
    let newCurrentLeg = matchState.current_leg;
    let newP1Remaining = matchState.p1_remaining;
    let newP2Remaining = matchState.p2_remaining;
    let matchCompleted = false;

    if (isCheckout) {
      if (isPlayer1) {
        newP1LegsWon += 1;
      } else {
        newP2LegsWon += 1;
      }

      await supabaseAdmin
        .from("match_events")
        .insert({
          match_id: matchId,
          user_id: user.id,
          type: "leg_won",
          payload: { leg: matchState.current_leg, winner: isPlayer1 ? "player1" : "player2" },
        });

      const legsToWin = match.match_format === "best-of-1" ? 1
        : match.match_format === "best-of-3" ? 2
        : 3;

      if (newP1LegsWon >= legsToWin || newP2LegsWon >= legsToWin) {
        matchCompleted = true;

        const winnerId = newP1LegsWon >= legsToWin ? player1.user_id : player2.user_id;
        const winnerName = newP1LegsWon >= legsToWin ? match.player1_name : match.player2_name;

        const p1Visits = state.visits.filter(v => v.player === "player1");
        const p2Visits = state.visits.filter(v => v.player === "player2");

        function computeStats(visits: any[]) {
          let totalScore = 0;
          let totalDarts = 0;
          let first9Score = 0;
          let first9Darts = 0;
          let highestScore = 0;
          let highestCheckout = 0;
          let count100Plus = 0;
          let count140Plus = 0;
          let count180 = 0;

          for (const v of visits) {
            if (!v.isBust) {
              totalScore += v.score;
              highestScore = Math.max(highestScore, v.score);
              if (v.score >= 100) count100Plus++;
              if (v.score >= 140) count140Plus++;
              if (v.score === 180) count180++;
              if (v.isCheckout) {
                highestCheckout = Math.max(highestCheckout, v.score);
              }
            }
            totalDarts += v.dartsThrown || 3;

            if (first9Darts < 9) {
              const dartsInVisit = Math.min(9 - first9Darts, v.dartsThrown || 3);
              first9Darts += dartsInVisit;
              if (!v.isBust) {
                first9Score += v.score;
              }
            }
          }

          const threeDartAvg = totalDarts > 0 ? (totalScore / totalDarts) * 3 : 0;
          const first9Avg = first9Darts > 0 ? (first9Score / first9Darts) * 3 : 0;

          return {
            threeDartAvg,
            first9Avg,
            highestScore,
            highestCheckout,
            count100Plus,
            count140Plus,
            count180,
            totalDarts,
            totalScore,
          };
        }

        const p1Stats = computeStats(p1Visits);
        const p2Stats = computeStats(p2Visits);

        const p1CheckoutPercent = state.p1CheckoutDartsAttempted > 0
          ? (state.p1CheckoutsMade / state.p1CheckoutDartsAttempted) * 100
          : 0;
        const p2CheckoutPercent = state.p2CheckoutDartsAttempted > 0
          ? (state.p2CheckoutsMade / state.p2CheckoutDartsAttempted) * 100
          : 0;

        await supabaseAdmin
          .from("matches")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            winner_id: winnerId,
            winner_name: winnerName,
            player1_legs_won: newP1LegsWon,
            player2_legs_won: newP2LegsWon,
            user_avg: p1Stats.threeDartAvg,
            opponent_avg: p2Stats.threeDartAvg,
            user_first9_avg: p1Stats.first9Avg,
            opponent_first9_avg: p2Stats.first9Avg,
            user_checkout_pct: p1CheckoutPercent,
            opponent_checkout_pct: p2CheckoutPercent,
          })
          .eq("id", matchId);

        await supabaseAdmin
          .from("match_players")
          .update({
            legs_won: newP1LegsWon,
            legs_lost: newP2LegsWon,
            checkout_attempts: state.p1CheckoutDartsAttempted,
            checkout_hits: state.p1CheckoutsMade,
            checkout_percentage: p1CheckoutPercent,
            checkout_darts_attempted: state.p1CheckoutDartsAttempted,
            darts_thrown: p1Stats.totalDarts,
            points_scored: p1Stats.totalScore,
            avg_3dart: p1Stats.threeDartAvg,
            first_9_dart_avg: p1Stats.first9Avg,
            highest_score: p1Stats.highestScore,
            highest_checkout: p1Stats.highestCheckout,
            count_100_plus: p1Stats.count100Plus,
            count_140_plus: p1Stats.count140Plus,
            count_180: p1Stats.count180,
          })
          .eq("match_id", matchId)
          .eq("seat", 1);

        await supabaseAdmin
          .from("match_players")
          .update({
            legs_won: newP2LegsWon,
            legs_lost: newP1LegsWon,
            checkout_attempts: state.p2CheckoutDartsAttempted,
            checkout_hits: state.p2CheckoutsMade,
            checkout_percentage: p2CheckoutPercent,
            checkout_darts_attempted: state.p2CheckoutDartsAttempted,
            darts_thrown: p2Stats.totalDarts,
            points_scored: p2Stats.totalScore,
            avg_3dart: p2Stats.threeDartAvg,
            first_9_dart_avg: p2Stats.first9Avg,
            highest_score: p2Stats.highestScore,
            highest_checkout: p2Stats.highestCheckout,
            count_100_plus: p2Stats.count100Plus,
            count_140_plus: p2Stats.count140Plus,
            count_180: p2Stats.count180,
          })
          .eq("match_id", matchId)
          .eq("seat", 2);

        async function updateUserStats(userId: string, stats: any, isWinner: boolean) {
          const { data: existing } = await supabaseAdmin
            .from("user_stats")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();

          const newWins = (existing?.wins || 0) + (isWinner ? 1 : 0);
          const newLosses = (existing?.losses || 0) + (isWinner ? 0 : 1);
          const newTotalMatches = (existing?.total_matches || 0) + 1;
          const newTotal180s = (existing?.total_180s || 0) + stats.count180;
          const newTotalCheckoutAttempts = (existing?.total_checkout_attempts || 0) + (stats.checkoutAttempts || 0);
          const newTotalCheckoutsMade = (existing?.total_checkouts_made || 0) + (stats.checkoutsMade || 0);
          const newHighestCheckout = Math.max(existing?.highest_checkout || 0, stats.highestCheckout);
          const newBestAverage = Math.max(existing?.best_average || 0, stats.threeDartAvg);
          const newBestFirst9Average = Math.max(existing?.best_first9_average || 0, stats.first9Avg);
          const newTotal100Plus = (existing?.total_100_plus || 0) + stats.count100Plus;
          const newTotal140Plus = (existing?.total_140_plus || 0) + stats.count140Plus;
          const newTotalPointsScored = (existing?.total_points_scored || 0) + stats.totalScore;
          const newTotalDartsThrown = (existing?.total_darts_thrown || 0) + stats.totalDarts;

          await supabaseAdmin
            .from("user_stats")
            .upsert({
              user_id: userId,
              total_matches: newTotalMatches,
              wins: newWins,
              losses: newLosses,
              total_180s: newTotal180s,
              total_checkout_attempts: newTotalCheckoutAttempts,
              total_checkouts_made: newTotalCheckoutsMade,
              highest_checkout: newHighestCheckout,
              best_average: newBestAverage,
              best_first9_average: newBestFirst9Average,
              total_100_plus: newTotal100Plus,
              total_140_plus: newTotal140Plus,
              total_points_scored: newTotalPointsScored,
              total_darts_thrown: newTotalDartsThrown,
              updated_at: new Date().toISOString(),
            });

          const { data: playerStats } = await supabaseAdmin
            .from("player_stats")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();

          const currentStreak = isWinner ? (playerStats?.current_win_streak || 0) + 1 : 0;
          const bestStreak = Math.max(playerStats?.best_win_streak || 0, currentStreak);

          await supabaseAdmin
            .from("player_stats")
            .upsert({
              user_id: userId,
              wins_total: newWins,
              losses_total: newLosses,
              current_win_streak: currentStreak,
              best_win_streak: bestStreak,
              total_matches: newTotalMatches,
              total_180s: newTotal180s,
              total_checkouts: newTotalCheckoutsMade,
              total_checkout_attempts: newTotalCheckoutAttempts,
              highest_checkout_ever: newHighestCheckout,
              best_average_ever: newBestAverage,
              most_180s_in_match: Math.max(playerStats?.most_180s_in_match || 0, stats.count180),
              updated_at: new Date().toISOString(),
            });
        }

        const p1IsWinner = newP1LegsWon >= legsToWin;
        const p2IsWinner = newP2LegsWon >= legsToWin;

        await updateUserStats(player1.user_id, {
          ...p1Stats,
          checkoutAttempts: state.p1CheckoutDartsAttempted,
          checkoutsMade: state.p1CheckoutsMade,
        }, p1IsWinner);

        if (player2.user_id) {
          await updateUserStats(player2.user_id, {
            ...p2Stats,
            checkoutAttempts: state.p2CheckoutDartsAttempted,
            checkoutsMade: state.p2CheckoutsMade,
          }, p2IsWinner);
        }

        await supabaseAdmin
          .from("match_events")
          .insert({
            match_id: matchId,
            user_id: user.id,
            type: "match_completed",
            payload: {
              winner: newP1LegsWon >= legsToWin ? "player1" : "player2",
              score: `${newP1LegsWon}-${newP2LegsWon}`,
            },
          });

        console.log(`[ONLINE_MATCH_COMPLETED] Match ${matchId} completed. Stats recorded for both players.`);
      } else {
        newCurrentLeg += 1;
        const startingScore = match.game_mode === "301" ? 301 : 501;
        newP1Remaining = startingScore;
        newP2Remaining = startingScore;
      }
    } else {
      if (isPlayer1) {
        newP1Remaining = finalRemaining;
      } else {
        newP2Remaining = finalRemaining;
      }
    }

    const nextTurnUserId = matchCompleted
      ? matchState.current_turn_user_id
      : (matchState.current_turn_user_id === player1.user_id ? player2.user_id : player1.user_id);

    await supabaseAdmin
      .from("match_state")
      .update({
        current_leg: newCurrentLeg,
        p1_remaining: newP1Remaining,
        p2_remaining: newP2Remaining,
        p1_legs_won: newP1LegsWon,
        p2_legs_won: newP2LegsWon,
        current_turn_user_id: nextTurnUserId,
        last_action_at: new Date().toISOString(),
        state,
        updated_at: new Date().toISOString(),
      })
      .eq("match_id", matchId);

    return new Response(
      JSON.stringify({
        success: true,
        remainingAfter: finalRemaining,
        isBust,
        isCheckout,
        legWon: isCheckout,
        matchCompleted,
        newState: {
          currentLeg: newCurrentLeg,
          p1Remaining: newP1Remaining,
          p2Remaining: newP2Remaining,
          p1LegsWon: newP1LegsWon,
          p2LegsWon: newP2LegsWon,
          currentTurnUserId: nextTurnUserId,
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

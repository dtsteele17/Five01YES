import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CheckAchievementsRequest {
  userId: string;
  eventType: "visit_scored" | "match_completed" | "leg_won" | "rank_updated";
  data: {
    visitScore?: number;
    matchId?: string;
    legDarts?: number;
    checkoutValue?: number;
    matchAverage?: number;
    isDoubleCheckout?: boolean;
    newTier?: string;
    winStreak?: number;
  };
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, eventType, data }: CheckAchievementsRequest = await req.json();

    const { data: achievements, error: achievementsError } = await supabase
      .from("achievements")
      .select("*");

    if (achievementsError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch achievements" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: userAchievements } = await supabase
      .from("user_achievements")
      .select("achievement_id")
      .eq("user_id", userId)
      .eq("completed", true);

    const completedAchievementIds = new Set(
      userAchievements?.map((ua) => ua.achievement_id) || []
    );

    const unlockedAchievements = [];

    for (const achievement of achievements) {
      if (completedAchievementIds.has(achievement.code)) {
        continue;
      }

      const condition = achievement.condition;
      let shouldUnlock = false;

      if (eventType === "visit_scored" && data.visitScore !== undefined) {
        if (condition.type === "visit_score" && data.visitScore === condition.value) {
          shouldUnlock = true;
        } else if (condition.type === "visit_score_min" && data.visitScore >= condition.value) {
          shouldUnlock = true;
        }
      }

      if (eventType === "leg_won") {
        if (condition.type === "checkout_count") {
          const { count } = await supabase
            .from("match_visits")
            .select("id", { count: "exact", head: true })
            .eq("is_checkout", true);

          if (count && count >= condition.value) {
            shouldUnlock = true;
          }
        }

        if (condition.type === "double_checkout" && data.isDoubleCheckout) {
          shouldUnlock = true;
        }

        if (condition.type === "checkout_value" && data.checkoutValue === condition.value) {
          shouldUnlock = true;
        }

        if (condition.type === "leg_darts" && data.legDarts === condition.value) {
          shouldUnlock = true;
        }
      }

      if (eventType === "match_completed") {
        if (condition.type === "match_count") {
          const { count } = await supabase
            .from("matches")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("status", "completed");

          if (count && count >= condition.value) {
            shouldUnlock = true;
          }
        }

        if (condition.type === "match_average" && data.matchAverage && data.matchAverage >= condition.value) {
          shouldUnlock = true;
        }

        if (condition.type === "win_streak" && data.winStreak && data.winStreak >= condition.value) {
          shouldUnlock = true;
        }

        if (condition.type === "ranked_count") {
          const { count } = await supabase
            .from("matches")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("match_type", "ranked")
            .eq("status", "completed");

          if (count && count >= condition.value) {
            shouldUnlock = true;
          }
        }
      }

      if (eventType === "rank_updated") {
        if (condition.type === "rank_tier" && data.newTier === condition.value) {
          shouldUnlock = true;
        }
      }

      if (shouldUnlock) {
        const { error: insertError } = await supabase
          .from("user_achievements")
          .upsert({
            user_id: userId,
            achievement_id: achievement.code,
            completed: true,
            progress: 100,
            completed_at: new Date().toISOString(),
          });

        if (!insertError) {
          unlockedAchievements.push(achievement);

          await supabase.from("notifications").insert({
            user_id: userId,
            type: "achievement",
            title: `Achievement Unlocked: ${achievement.name}`,
            message: achievement.description,
            link: "/app/achievements",
            read: false,
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        unlockedAchievements,
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

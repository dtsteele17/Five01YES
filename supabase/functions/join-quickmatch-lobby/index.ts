import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface JoinLobbyRequest {
  lobbyId: string;
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

    const { lobbyId }: JoinLobbyRequest = await req.json();

    // Fetch lobby to verify it's still open and not expired
    const { data: lobby, error: lobbyFetchError } = await supabase
      .from("quick_match_lobbies")
      .select("*")
      .eq("id", lobbyId)
      .maybeSingle();

    if (lobbyFetchError) {
      return new Response(
        JSON.stringify({ error: lobbyFetchError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!lobby) {
      return new Response(
        JSON.stringify({ error: "Lobby not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify lobby is still open
    if (lobby.status !== "open") {
      return new Response(
        JSON.stringify({ error: "Lobby already joined" }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify lobby hasn't expired
    const expiresAt = new Date(lobby.expires_at);
    if (expiresAt < new Date()) {
      // Mark as expired
      await supabase
        .from("quick_match_lobbies")
        .update({ status: "expired" })
        .eq("id", lobbyId);

      return new Response(
        JSON.stringify({ error: "Lobby has expired" }),
        {
          status: 410,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Cannot join your own lobby
    if (lobby.host_user_id === user.id) {
      return new Response(
        JSON.stringify({ error: "Cannot join your own lobby" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create match room first
    const { data: matchRoom, error: matchRoomError } = await supabase
      .from("match_rooms")
      .insert({
        lobby_id: lobbyId,
        match_type: "quick",
        source: "quick",
        game_mode: lobby.game_mode,
        match_format: lobby.match_format,
        player1_id: lobby.host_user_id,
        player2_id: user.id,
        status: "waiting",
      })
      .select()
      .single();

    if (matchRoomError) {
      return new Response(
        JSON.stringify({ error: matchRoomError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Atomically update lobby to matched status (only if still open)
    const { error: lobbyUpdateError } = await supabase
      .from("quick_match_lobbies")
      .update({
        guest_user_id: user.id,
        status: "matched",
        match_room_id: matchRoom.id,
      })
      .eq("id", lobbyId)
      .eq("status", "open");

    if (lobbyUpdateError) {
      // Rollback match room if lobby update failed
      await supabase.from("match_rooms").delete().eq("id", matchRoom.id);
      return new Response(
        JSON.stringify({ error: "Lobby was taken by another player" }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Send notification to host
    await supabase.from("notifications").insert({
      user_id: lobby.host_user_id,
      type: "quick_match_ready",
      title: "Match Ready!",
      message: "Your Quick Match opponent has joined",
      link: `/app/match/room/${matchRoom.id}`,
      read: false,
    });

    return new Response(
      JSON.stringify({
        success: true,
        matchRoomId: matchRoom.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error joining lobby:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

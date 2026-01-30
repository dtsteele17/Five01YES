import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface InviteRequest {
  tournamentId: string;
  inviteeUserId: string;
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

    const { tournamentId, inviteeUserId }: InviteRequest = await req.json();

    // Check if user is creator or admin of tournament
    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select(`
        *,
        tournament_participants!inner(user_id, role)
      `)
      .eq("id", tournamentId)
      .maybeSingle();

    if (tournamentError || !tournament) {
      return new Response(
        JSON.stringify({ error: "Tournament not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if user is creator or admin
    const isCreator = tournament.created_by === user.id;
    const isAdmin = tournament.tournament_participants?.some(
      (p: any) => p.user_id === user.id && (p.role === 'admin' || p.role === 'owner')
    );

    if (!isCreator && !isAdmin) {
      return new Response(
        JSON.stringify({ error: "Only creator or admins can invite players" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if invitee exists
    const { data: inviteeProfile, error: profileError } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", inviteeUserId)
      .maybeSingle();

    if (profileError || !inviteeProfile) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create notification for invitee
    const { error: notificationError } = await supabase
      .from("notifications")
      .insert({
        user_id: inviteeUserId,
        type: "tournament_invite",
        title: "Tournament Invitation",
        message: `You've been invited to join ${tournament.name}`,
        link: `/app/tournaments/${tournamentId}`,
        metadata: {
          tournament_id: tournamentId,
          tournament_name: tournament.name,
          invited_by: user.id,
        },
        read: false,
      });

    if (notificationError) {
      return new Response(
        JSON.stringify({ error: notificationError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Invitation sent successfully",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error inviting to tournament:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

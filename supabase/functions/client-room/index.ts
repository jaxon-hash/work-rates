import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://jxnn.store",
  "https://www.jxnn.store",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

const roomStatuses = new Set([
  "active",
  "waiting_client",
  "waiting_studio",
  "revision",
  "approved",
  "complete",
]);

const statusLabels: Record<string, string> = {
  active: "Room open",
  waiting_client: "Waiting for you",
  waiting_studio: "With JXNN Studio",
  revision: "Revision round",
  approved: "Cut approved",
  complete: "Project complete",
};

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(origin: string, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max + 1) : "";
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createAccessToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clientLink(origin: string, token: string) {
  const base = origin.includes("localhost") || origin.includes("127.0.0.1")
    ? origin
    : "https://jxnn.store";
  return `${base}/client.html#access=${token}`;
}

function discordValue(value: string, fallback = "Not supplied") {
  return (value || fallback).slice(0, 900);
}

async function ownerIsAuthorised(request: Request, supabase: ReturnType<typeof createClient>) {
  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return false;
  const { data, error } = await supabase.auth.getUser(accessToken);
  return !error && data.user?.email?.toLowerCase() === "business.jxnn@gmail.com";
}

async function notifyStudioDiscord(webhookUrl: string, details: {
  clientName: string;
  projectTitle: string;
  message: string;
  messageType: string;
}) {
  if (!/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\//.test(webhookUrl)) {
    console.error("DISCORD_WEBHOOK_URL is not a valid Discord webhook");
    return;
  }

  const labels: Record<string, string> = {
    message: "New client message",
    approval: "Edit approved",
    revision: "Changes requested",
    call: "Client wants to talk",
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({
        username: "JXNN Client Rooms",
        allowed_mentions: { parse: [] },
        embeds: [{
          title: labels[details.messageType] || "Client Room update",
          description: discordValue(details.message),
          color: details.messageType === "approval" ? 13172530 : 9267455,
          fields: [
            { name: "Client", value: discordValue(details.clientName), inline: true },
            { name: "Project", value: discordValue(details.projectTitle), inline: true },
          ],
          footer: { text: "Reply from the private JXNN Studio dashboard." },
          timestamp: new Date().toISOString(),
        }],
      }),
    });

    if (!response.ok) console.error("Discord studio notification failed", response.status);
  } catch (error) {
    console.error("Discord studio notification unavailable", error instanceof Error ? error.name : "unknown");
  }
}

async function sendClientDiscordDm(botToken: string, discordUserId: string, message: string, knownChannelId = "") {
  if (!/^\d{17,20}$/.test(discordUserId) || botToken.length < 50) return { delivered: false, channelId: "" };

  try {
    let channelId = knownChannelId;
    if (!/^\d{17,20}$/.test(channelId)) {
      const channelResponse = await fetch("https://discord.com/api/v10/users/@me/channels", {
        method: "POST",
        headers: {
          "Authorization": `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({ recipient_id: discordUserId }),
      });

      if (!channelResponse.ok) {
        console.error("Discord DM channel unavailable", channelResponse.status);
        return { delivered: false, channelId: "" };
      }

      const channel = await channelResponse.json();
      channelId = cleanText(channel.id, 20);
    }

    if (!/^\d{17,20}$/.test(channelId)) return { delivered: false, channelId: "" };

    const messageResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        content: message.slice(0, 1900),
        allowed_mentions: { parse: [] },
      }),
    });

    if (!messageResponse.ok) {
      console.error("Discord client notification failed", messageResponse.status);
      return { delivered: false, channelId };
    }

    return { delivered: true, channelId };
  } catch (error) {
    console.error("Discord client notification unavailable", error instanceof Error ? error.name : "unknown");
    return { delivered: false, channelId: "" };
  }
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") ?? "";

  if (!allowedOrigins.has(origin)) {
    return new Response("Forbidden", { status: 403 });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method !== "POST") {
    return json(origin, { error: "Method not allowed" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(origin, { error: "Invalid request" }, 400);
  }

  const action = cleanText(body.action, 40);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const rateLimitSalt = Deno.env.get("RATE_LIMIT_SALT");

  if (!supabaseUrl || !serviceRoleKey || !rateLimitSalt) {
    console.error("Client Room server credentials are unavailable");
    return json(origin, { error: "Client Room unavailable" }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ownerActions = new Set(["create_room", "rotate_link", "studio_reply", "studio_status"]);
  if (ownerActions.has(action)) {
    if (!await ownerIsAuthorised(request, supabase)) {
      return json(origin, { error: "Owner access required" }, 401);
    }

    if (action === "studio_reply") {
      const roomId = cleanText(body.room_id, 36);
      const message = cleanText(body.message, 4000);
      if (!validUuid(roomId) || !message || message.length > 4000) {
        return json(origin, { error: "Invalid reply" }, 400);
      }

      const { data: room, error: roomError } = await supabase
        .from("client_rooms")
        .select("id, client_name, project_title, discord_user_id, discord_dm_channel_id")
        .eq("id", roomId)
        .eq("archived", false)
        .maybeSingle();

      if (roomError || !room) return json(origin, { error: "Room not found" }, 404);

      const now = new Date().toISOString();
      const { data: newMessage, error: messageError } = await supabase
        .from("client_messages")
        .insert({ room_id: room.id, sender: "studio", message_type: "message", message })
        .select("id, room_id, created_at, sender, message_type, message")
        .single();

      if (messageError || !newMessage) return json(origin, { error: "Unable to send reply" }, 500);

      await supabase.from("client_rooms").update({
        status: "waiting_client",
        updated_at: now,
        last_activity_at: now,
      }).eq("id", room.id);

      let discordDelivered = false;
      const botToken = Deno.env.get("DISCORD_BOT_TOKEN") || "";
      if (room.discord_user_id && botToken) {
        const dm = await sendClientDiscordDm(
          botToken,
          room.discord_user_id,
          `New reply from JXNN Studio — ${room.project_title}\n\n${message}\n\nOpen your existing private Client Room link to reply.`,
          room.discord_dm_channel_id || "",
        );
        discordDelivered = dm.delivered;
        if (dm.channelId && dm.channelId !== room.discord_dm_channel_id) {
          await supabase.from("client_rooms").update({ discord_dm_channel_id: dm.channelId }).eq("id", room.id);
        }
      }

      return json(origin, {
        ok: true,
        message: newMessage,
        status: "waiting_client",
        discord_connected: Boolean(room.discord_user_id),
        discord_delivered: discordDelivered,
      }, 201);
    }

    if (action === "studio_status") {
      const roomId = cleanText(body.room_id, 36);
      const nextStatus = cleanText(body.status, 30);
      if (!validUuid(roomId) || !roomStatuses.has(nextStatus)) {
        return json(origin, { error: "Invalid project signal" }, 400);
      }

      const { data: room, error } = await supabase
        .from("client_rooms")
        .update({ status: nextStatus, updated_at: new Date().toISOString(), last_activity_at: new Date().toISOString() })
        .eq("id", roomId)
        .eq("archived", false)
        .select("id, project_title, discord_user_id, discord_dm_channel_id")
        .maybeSingle();

      if (error || !room) return json(origin, { error: "Room not found" }, 404);

      let discordDelivered = false;
      const botToken = Deno.env.get("DISCORD_BOT_TOKEN") || "";
      if (room.discord_user_id && botToken) {
        const dm = await sendClientDiscordDm(
          botToken,
          room.discord_user_id,
          `Project update from JXNN Studio — ${room.project_title}\n\nStatus: ${statusLabels[nextStatus] || nextStatus}`,
          room.discord_dm_channel_id || "",
        );
        discordDelivered = dm.delivered;
        if (dm.channelId && dm.channelId !== room.discord_dm_channel_id) {
          await supabase.from("client_rooms").update({ discord_dm_channel_id: dm.channelId }).eq("id", room.id);
        }
      }

      return json(origin, { ok: true, status: nextStatus, discord_delivered: discordDelivered });
    }

    const token = createAccessToken();
    const tokenHash = await sha256(`${rateLimitSalt}:client-room:${token}`);

    if (action === "rotate_link") {
      const roomId = cleanText(body.room_id, 36);
      if (!validUuid(roomId)) return json(origin, { error: "Invalid room" }, 400);

      const { data: room, error } = await supabase
        .from("client_rooms")
        .update({ token_hash: tokenHash, updated_at: new Date().toISOString(), archived: false })
        .eq("id", roomId)
        .select("id, client_name, project_title, status, archived, last_activity_at")
        .single();

      if (error || !room) return json(origin, { error: "Room not found" }, 404);
      return json(origin, { room, access_url: clientLink(origin, token) });
    }

    const enquiryId = Number(body.enquiry_id);
    const projectTitle = cleanText(body.project_title, 140);
    if (!Number.isSafeInteger(enquiryId) || enquiryId < 1 || !projectTitle || projectTitle.length > 140) {
      return json(origin, { error: "Invalid room details" }, 400);
    }

    const { data: enquiry, error: enquiryError } = await supabase
      .from("enquiries")
      .select("id, name")
      .eq("id", enquiryId)
      .single();

    if (enquiryError || !enquiry) return json(origin, { error: "Enquiry not found" }, 404);

    const { data: existing } = await supabase
      .from("client_rooms")
      .select("id")
      .eq("enquiry_id", enquiryId)
      .eq("archived", false)
      .maybeSingle();

    if (existing) return json(origin, { error: "This enquiry already has a Client Room" }, 409);

    const now = new Date().toISOString();
    const { data: room, error } = await supabase
      .from("client_rooms")
      .insert({
        enquiry_id: enquiryId,
        client_name: enquiry.name,
        project_title: projectTitle,
        token_hash: tokenHash,
        status: "active",
        updated_at: now,
        last_activity_at: now,
      })
      .select("id, enquiry_id, client_name, project_title, status, archived, last_activity_at")
      .single();

    if (error || !room) {
      console.error("Client Room insert failed", error?.code);
      return json(origin, { error: "Unable to create room" }, 500);
    }

    await supabase.from("client_messages").insert({
      room_id: room.id,
      sender: "system",
      message_type: "project_update",
      message: "Your private JXNN Client Room is ready. Use this space for updates, feedback and final approval.",
    });

    return json(origin, { room, access_url: clientLink(origin, token) }, 201);
  }

  if (action === "discord_callback") {
    const code = cleanText(body.code, 300);
    const state = cleanText(body.state, 128);
    if (!code || !/^[0-9a-f]{64}$/i.test(state)) {
      return json(origin, { error: "This Discord connection link is invalid." }, 400);
    }

    const clientId = Deno.env.get("DISCORD_CLIENT_ID") || "";
    const clientSecret = Deno.env.get("DISCORD_CLIENT_SECRET") || "";
    const redirectUri = Deno.env.get("DISCORD_REDIRECT_URI") || "";
    const botToken = Deno.env.get("DISCORD_BOT_TOKEN") || "";
    if (!clientId || !clientSecret || !redirectUri || !botToken) {
      return json(origin, { error: "Discord connection is temporarily unavailable." }, 503);
    }

    const stateHash = await sha256(`${rateLimitSalt}:discord-link:${state}`);
    const { data: linkSession } = await supabase
      .from("discord_link_sessions")
      .select("room_id, expires_at")
      .eq("state_hash", stateHash)
      .maybeSingle();

    if (!linkSession) return json(origin, { error: "This Discord connection has expired." }, 401);
    await supabase.from("discord_link_sessions").delete().eq("state_hash", stateHash);
    if (new Date(linkSession.expires_at).getTime() <= Date.now()) {
      return json(origin, { error: "This Discord connection has expired." }, 401);
    }

    const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(7000),
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) return json(origin, { error: "Discord could not verify this connection." }, 400);
    const oauthToken = await tokenResponse.json();
    const discordAccessToken = cleanText(oauthToken.access_token, 300);
    if (!discordAccessToken) return json(origin, { error: "Discord did not return an access token." }, 400);

    const userResponse = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { "Authorization": `Bearer ${discordAccessToken}` },
      signal: AbortSignal.timeout(7000),
    });
    if (!userResponse.ok) return json(origin, { error: "Discord identity could not be loaded." }, 400);

    const discordUser = await userResponse.json();
    const discordUserId = cleanText(discordUser.id, 20);
    const username = cleanText(discordUser.username, 100);
    const displayName = cleanText(discordUser.global_name, 100) || username;
    if (!/^\d{17,20}$/.test(discordUserId) || !username) {
      return json(origin, { error: "Discord returned an invalid identity." }, 400);
    }

    const dm = await sendClientDiscordDm(
      botToken,
      discordUserId,
      "JXNN Client Room alerts are connected. You’ll receive a private Discord message whenever the studio replies or changes your project status.",
    );

    const { data: connectedRoom, error: updateError } = await supabase.from("client_rooms").update({
      discord_user_id: discordUserId,
      discord_username: username,
      discord_display_name: displayName,
      discord_connected_at: new Date().toISOString(),
      discord_dm_channel_id: dm.channelId || null,
    }).eq("id", linkSession.room_id).eq("archived", false).select("id").maybeSingle();

    if (updateError || !connectedRoom) {
      return json(origin, { error: "The Client Room is no longer available." }, 404);
    }

    return json(origin, {
      ok: true,
      display_name: displayName,
      discord_delivered: dm.delivered,
    });
  }

  const token = cleanText(body.token, 128);
  if (!/^[0-9a-f]{64}$/i.test(token)) {
    return json(origin, { error: "Invalid or expired room link" }, 401);
  }

  const tokenHash = await sha256(`${rateLimitSalt}:client-room:${token}`);
  const { data: room, error: roomError } = await supabase
    .from("client_rooms")
    .select("id, client_name, project_title, status, archived, created_at, updated_at, last_activity_at, discord_user_id, discord_display_name")
    .eq("token_hash", tokenHash)
    .eq("archived", false)
    .maybeSingle();

  if (roomError || !room) {
    return json(origin, { error: "Invalid or expired room link" }, 401);
  }

  if (action === "discord_authorize") {
    const clientId = Deno.env.get("DISCORD_CLIENT_ID") || "";
    const redirectUri = Deno.env.get("DISCORD_REDIRECT_URI") || "";
    if (!clientId || !redirectUri) return json(origin, { error: "Discord connection is temporarily unavailable." }, 503);

    const state = createAccessToken();
    const stateHash = await sha256(`${rateLimitSalt}:discord-link:${state}`);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await supabase.from("discord_link_sessions").delete().lt("expires_at", new Date().toISOString());
    const { error } = await supabase.from("discord_link_sessions").insert({
      state_hash: stateHash,
      room_id: room.id,
      expires_at: expiresAt,
    });
    if (error) return json(origin, { error: "Discord connection could not be started." }, 500);

    const authorizeUrl = new URL("https://discord.com/oauth2/authorize");
    authorizeUrl.search = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: "identify",
      state,
      prompt: "consent",
    }).toString();
    return json(origin, { authorize_url: authorizeUrl.toString() });
  }

  if (action === "discord_disconnect") {
    const { error } = await supabase.from("client_rooms").update({
      discord_user_id: null,
      discord_username: null,
      discord_display_name: null,
      discord_connected_at: null,
      discord_dm_channel_id: null,
    }).eq("id", room.id);
    if (error) return json(origin, { error: "Discord could not be disconnected." }, 500);
    return json(origin, { ok: true });
  }

  const publicRoom = {
    id: room.id,
    client_name: room.client_name,
    project_title: room.project_title,
    status: room.status,
    created_at: room.created_at,
    updated_at: room.updated_at,
    last_activity_at: room.last_activity_at,
    discord_connected: Boolean(room.discord_user_id),
    discord_display_name: room.discord_display_name || "",
  };

  if (action === "get_room") {
    const { data: messages, error } = await supabase
      .from("client_messages")
      .select("id, created_at, sender, message_type, message")
      .eq("room_id", room.id)
      .order("created_at", { ascending: true })
      .limit(250);

    if (error) return json(origin, { error: "Unable to load messages" }, 500);
    return json(origin, { room: publicRoom, messages: messages || [] });
  }

  if (action !== "send_message" && action !== "quick_action") {
    return json(origin, { error: "Unknown action" }, 400);
  }

  const visitorIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const [ipKey, roomKey] = await Promise.all([
    sha256(`${rateLimitSalt}:client-room-ip:${visitorIp}`),
    sha256(`${rateLimitSalt}:client-room-id:${room.id}`),
  ]);
  const [ipLimit, roomLimit] = await Promise.all([
    supabase.rpc("check_request_rate_limit", {
      p_key_hash: ipKey,
      p_max_requests: 40,
      p_window_seconds: 3600,
    }),
    supabase.rpc("check_request_rate_limit", {
      p_key_hash: roomKey,
      p_max_requests: 80,
      p_window_seconds: 3600,
    }),
  ]);

  if (ipLimit.error || roomLimit.error) return json(origin, { error: "Messaging unavailable" }, 503);
  if (!ipLimit.data || !roomLimit.data) return json(origin, { error: "Too many updates" }, 429);

  let message = cleanText(body.message, 2000);
  let messageType = "message";
  let nextStatus = "waiting_studio";

  if (action === "quick_action") {
    const quickAction = cleanText(body.quick_action, 30);
    const actions: Record<string, { message: string; type: string; status: string }> = {
      approve: { message: "Approved — this cut is ready to lock.", type: "approval", status: "approved" },
      revision: { message: "I have changes to request. I’ll add the details below.", type: "revision", status: "revision" },
      talk: { message: "Can we talk this through together?", type: "call", status: "waiting_studio" },
    };
    const selection = actions[quickAction];
    if (!selection) return json(origin, { error: "Invalid action" }, 400);
    message = selection.message;
    messageType = selection.type;
    nextStatus = selection.status;
  }

  if (!message || message.length > 2000 || !roomStatuses.has(nextStatus)) {
    return json(origin, { error: "Invalid message" }, 400);
  }

  const now = new Date().toISOString();
  const { data: newMessage, error: messageError } = await supabase
    .from("client_messages")
    .insert({ room_id: room.id, sender: "client", message_type: messageType, message })
    .select("id, created_at, sender, message_type, message")
    .single();

  if (messageError || !newMessage) return json(origin, { error: "Unable to send message" }, 500);

  await supabase
    .from("client_rooms")
    .update({ status: nextStatus, updated_at: now, last_activity_at: now })
    .eq("id", room.id);

  const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
  if (webhookUrl) {
    await notifyStudioDiscord(webhookUrl, {
      clientName: room.client_name,
      projectTitle: room.project_title,
      message,
      messageType,
    });
  }

  return json(origin, { ok: true, message: newMessage, status: nextStatus }, 201);
});

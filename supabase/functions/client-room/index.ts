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

async function notifyDiscord(webhookUrl: string, details: {
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

    if (!response.ok) console.error("Discord notification failed", response.status);
  } catch (error) {
    console.error("Discord notification unavailable", error instanceof Error ? error.name : "unknown");
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

  if (action === "create_room" || action === "rotate_link") {
    const authHeader = request.headers.get("authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);

    if (userError || userData.user?.email?.toLowerCase() !== "business.jxnn@gmail.com") {
      return json(origin, { error: "Owner access required" }, 401);
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

  const token = cleanText(body.token, 128);
  if (!/^[0-9a-f]{64}$/i.test(token)) {
    return json(origin, { error: "Invalid or expired room link" }, 401);
  }

  const tokenHash = await sha256(`${rateLimitSalt}:client-room:${token}`);
  const { data: room, error: roomError } = await supabase
    .from("client_rooms")
    .select("id, client_name, project_title, status, archived, created_at, updated_at, last_activity_at")
    .eq("token_hash", tokenHash)
    .eq("archived", false)
    .maybeSingle();

  if (roomError || !room) {
    return json(origin, { error: "Invalid or expired room link" }, 401);
  }

  if (action === "get_room") {
    const { data: messages, error } = await supabase
      .from("client_messages")
      .select("id, created_at, sender, message_type, message")
      .eq("room_id", room.id)
      .order("created_at", { ascending: true })
      .limit(250);

    if (error) return json(origin, { error: "Unable to load messages" }, 500);
    return json(origin, { room, messages: messages || [] });
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
    await notifyDiscord(webhookUrl, {
      clientName: room.client_name,
      projectTitle: room.project_title,
      message,
      messageType,
    });
  }

  return json(origin, { ok: true, message: newMessage, status: nextStatus }, 201);
});

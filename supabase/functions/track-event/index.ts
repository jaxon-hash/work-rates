import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://jxnn.store",
  "https://www.jxnn.store",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

const eventNames = new Set([
  "page_view",
  "cta_click",
  "showreel_play",
  "work_open",
  "form_start",
  "form_success",
  "case_study_open",
]);

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "content-type",
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

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max + 1) : "";
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function deviceType(userAgent: string) {
  if (/iPad|Tablet|PlayBook|Silk/i.test(userAgent)) return "tablet";
  if (/Mobi|Android|iPhone|iPod/i.test(userAgent)) return "mobile";
  return userAgent ? "desktop" : "unknown";
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

  const eventName = text(body.event_name, 40);
  const eventLabel = text(body.event_label, 60) || null;
  const path = text(body.path, 200);
  const referrer = text(body.referrer, 500);

  if (
    !eventNames.has(eventName) ||
    (eventLabel && !/^[a-z0-9_-]{1,60}$/.test(eventLabel)) ||
    !path.startsWith("/") || path.startsWith("//") || path.length > 200
  ) {
    return json(origin, { error: "Invalid event" }, 400);
  }

  let referrerHost: string | null = null;
  if (referrer) {
    try {
      referrerHost = new URL(referrer).hostname.slice(0, 200) || null;
    } catch {
      referrerHost = null;
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const rateLimitSalt = Deno.env.get("RATE_LIMIT_SALT");

  if (!supabaseUrl || !serviceRoleKey || !rateLimitSalt) {
    return json(origin, { error: "Analytics unavailable" }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const visitorIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateKey = await sha256(`${rateLimitSalt}:analytics:${visitorIp}`);
  const { data: allowed, error: limitError } = await supabase.rpc("check_request_rate_limit", {
    p_key_hash: rateKey,
    p_max_requests: 180,
    p_window_seconds: 3600,
  });

  if (limitError || !allowed) {
    return json(origin, { error: "Event limit reached" }, limitError ? 503 : 429);
  }

  const { error } = await supabase.from("site_events").insert({
    event_name: eventName,
    event_label: eventLabel,
    path,
    referrer_host: referrerHost,
    device_type: deviceType(request.headers.get("user-agent") || ""),
  });

  if (error) {
    console.error("Analytics insert failed", error.code);
    return json(origin, { error: "Analytics unavailable" }, 500);
  }

  // Occasionally trim anonymous operational records so the tables stay small.
  if (Math.random() < 0.01) {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    await Promise.all([
      supabase.from("request_rate_limits").delete().lt("updated_at", twoDaysAgo),
      supabase.from("submission_fingerprints").delete().lt("created_at", oneDayAgo),
      supabase.from("site_events").delete().lt("created_at", sixMonthsAgo),
    ]);
  }

  return json(origin, { ok: true }, 201);
});

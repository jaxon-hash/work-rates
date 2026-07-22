import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://jxnn.store",
  "https://www.jxnn.store",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

const projectTypes = new Set([
  "Short-form edit",
  "Long-form edit",
  "Thumbnail design",
  "Monthly retainer",
  "Something else",
]);

const budgets = new Set([
  "Under £100",
  "£100–£300",
  "£300–£750",
  "£750–£1,500",
  "£1,500+",
  "Not sure yet",
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

function createAccessToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function discordValue(value: string | null, fallback = "Not supplied") {
  return (value || fallback).slice(0, 900);
}

async function notifyDiscord(webhookUrl: string, enquiry: {
  name: string;
  email: string;
  discordUsername: string | null;
  projectType: string;
  runtime: string;
  budget: string;
  deadline: string | null;
  details: string;
}) {
  if (!/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\//.test(webhookUrl)) {
    console.error("DISCORD_WEBHOOK_URL is not a valid Discord webhook");
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({
        username: "JXNN Enquiries",
        allowed_mentions: { parse: [] },
        embeds: [{
          title: `New ${enquiry.projectType} enquiry`,
          description: discordValue(enquiry.details),
          color: 13172530,
          fields: [
            { name: "Name", value: discordValue(enquiry.name), inline: true },
            { name: "Email", value: discordValue(enquiry.email), inline: true },
            { name: "Discord", value: discordValue(enquiry.discordUsername), inline: true },
            { name: "Budget", value: discordValue(enquiry.budget), inline: true },
            { name: "Finished length", value: discordValue(enquiry.runtime), inline: true },
            { name: "Deadline", value: discordValue(enquiry.deadline, "Flexible"), inline: true },
          ],
          footer: { text: "Open the private JXNN dashboard for the complete brief." },
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

  // Silently accept honeypot submissions without storing them.
  if (text(body.website, 200)) {
    return json(origin, { ok: true });
  }

  const name = text(body.name, 100);
  const email = text(body.email, 254).toLowerCase();
  const discordUsername = text(body.discord_username, 100) || null;
  const projectType = text(body.project_type, 80);
  const runtime = text(body.runtime, 120);
  const budget = text(body.budget, 80);
  const deadline = text(body.deadline, 10) || null;
  const footageLink = text(body.footage_link, 1000) || null;
  const details = text(body.details, 4000);
  const turnstileToken = text(body.turnstile_token, 2048);
  const visitorIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validDeadline = !deadline || /^\d{4}-\d{2}-\d{2}$/.test(deadline);
  let validFootageLink = !footageLink;

  if (footageLink) {
    try {
      const url = new URL(footageLink);
      validFootageLink = url.protocol === "https:" || url.protocol === "http:";
    } catch {
      validFootageLink = false;
    }
  }

  if (
    !name || name.length > 100 || !validEmail ||
    !projectTypes.has(projectType) || !runtime || runtime.length > 120 ||
    !budgets.has(budget) || !validDeadline || !validFootageLink ||
    details.length < 20 || details.length > 4000 || !turnstileToken
  ) {
    return json(origin, { error: "Invalid enquiry" }, 400);
  }

  const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");

  if (!turnstileSecret) {
    console.error("TURNSTILE_SECRET_KEY is not configured");
    return json(origin, { error: "Submission service unavailable" }, 503);
  }

  const verificationForm = new FormData();
  verificationForm.set("secret", turnstileSecret);
  verificationForm.set("response", turnstileToken);

  if (visitorIp !== "unknown") verificationForm.set("remoteip", visitorIp);

  let verification: {
    success?: boolean;
    hostname?: string;
    action?: string;
  };

  try {
    const verificationResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: verificationForm },
    );
    verification = await verificationResponse.json();
  } catch {
    return json(origin, { error: "Verification unavailable" }, 503);
  }

  const validHostname = verification.hostname === "jxnn.store" || verification.hostname === "www.jxnn.store";

  if (!verification.success || !validHostname || verification.action !== "project_enquiry") {
    return json(origin, { error: "Verification failed" }, 422);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const rateLimitSalt = Deno.env.get("RATE_LIMIT_SALT");

  if (!supabaseUrl || !serviceRoleKey || !rateLimitSalt) {
    console.error("Supabase server credentials are unavailable");
    return json(origin, { error: "Submission service unavailable" }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [ipKey, emailKey, duplicateKey] = await Promise.all([
    sha256(`${rateLimitSalt}:enquiry-ip:${visitorIp}`),
    sha256(`${rateLimitSalt}:enquiry-email:${email}`),
    sha256(`${rateLimitSalt}:duplicate:${email}:${projectType}:${details.toLowerCase()}`),
  ]);

  const [ipLimit, emailLimit] = await Promise.all([
    supabase.rpc("check_request_rate_limit", {
      p_key_hash: ipKey,
      p_max_requests: 5,
      p_window_seconds: 3600,
    }),
    supabase.rpc("check_request_rate_limit", {
      p_key_hash: emailKey,
      p_max_requests: 3,
      p_window_seconds: 3600,
    }),
  ]);

  if (ipLimit.error || emailLimit.error) {
    console.error("Enquiry rate limit unavailable");
    return json(origin, { error: "Submission service unavailable" }, 503);
  }

  if (!ipLimit.data || !emailLimit.data) {
    return json(origin, { error: "Too many enquiries" }, 429);
  }

  const { data: fingerprintReserved, error: fingerprintError } = await supabase.rpc(
    "reserve_submission_fingerprint",
    { p_key_hash: duplicateKey, p_window_seconds: 600 },
  );

  if (fingerprintError) {
    console.error("Duplicate protection unavailable");
    return json(origin, { error: "Submission service unavailable" }, 503);
  }

  if (!fingerprintReserved) {
    return json(origin, { error: "Duplicate enquiry" }, 409);
  }

  const websiteNotificationToken = createAccessToken();
  const websiteNotificationTokenHash = await sha256(
    `${rateLimitSalt}:website-notification:${websiteNotificationToken}`,
  );

  const { error } = await supabase.from("enquiries").insert({
    name,
    email,
    discord_username: discordUsername,
    project_type: projectType,
    runtime,
    budget,
    deadline,
    footage_link: footageLink,
    details,
    status: "new",
    website_notification_token_hash: websiteNotificationTokenHash,
  });

  if (error) {
    await supabase.rpc("release_submission_fingerprint", { p_key_hash: duplicateKey });
    console.error("Enquiry insert failed", error.code);
    return json(origin, { error: "Unable to save enquiry" }, 500);
  }

  const discordWebhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
  if (discordWebhookUrl) {
    await notifyDiscord(discordWebhookUrl, {
      name,
      email,
      discordUsername,
      projectType,
      runtime,
      budget,
      deadline,
      details,
    });
  }

  return json(origin, { ok: true, website_notification_token: websiteNotificationToken }, 201);
});

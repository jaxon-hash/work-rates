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

  const visitorIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (visitorIp) verificationForm.set("remoteip", visitorIp);

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

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Supabase server credentials are unavailable");
    return json(origin, { error: "Submission service unavailable" }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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
  });

  if (error) {
    console.error("Enquiry insert failed", error.code);
    return json(origin, { error: "Unable to save enquiry" }, 500);
  }

  return json(origin, { ok: true }, 201);
});

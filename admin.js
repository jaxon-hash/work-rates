import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { ADMIN_EMAIL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase-config.js";

const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const loginPanel = document.getElementById("loginPanel");
const dashboard = document.getElementById("adminDashboard");
const sendLoginButton = document.getElementById("sendLoginButton");
const signOutButton = document.getElementById("signOutButton");
const loginStatus = document.getElementById("loginStatus");
const dashboardStatus = document.getElementById("dashboardStatus");
const enquiryList = document.getElementById("enquiryList");
const emptyState = document.getElementById("emptyState");
const statusFilter = document.getElementById("statusFilter");
const adminUserEmail = document.getElementById("adminUserEmail");
const totalCount = document.getElementById("totalCount");
const newCount = document.getElementById("newCount");
const monthCount = document.getElementById("monthCount");

let enquiries = [];

function setText(element, value) {
  if (element) element.textContent = value;
}

function showLogin(message = "") {
  loginPanel.hidden = false;
  dashboard.hidden = true;
  signOutButton.hidden = true;
  setText(loginStatus, message);
}

function showDashboard(email) {
  loginPanel.hidden = true;
  dashboard.hidden = false;
  signOutButton.hidden = false;
  setText(adminUserEmail, email);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function addMeta(parent, label, value) {
  const item = document.createElement("div");
  const small = document.createElement("small");
  const text = document.createElement("span");
  small.textContent = label;
  text.textContent = value || "Not supplied";
  item.append(small, text);
  parent.append(item);
}

function safeHttpUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function safeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

async function updateStatus(id, nextStatus, select) {
  select.disabled = true;
  setText(dashboardStatus, "Updating enquiry…");

  const { error } = await client
    .from("enquiries")
    .update({ status: nextStatus })
    .eq("id", id);

  select.disabled = false;

  if (error) {
    setText(dashboardStatus, "Couldn’t update that enquiry. Please try again.");
    const existing = enquiries.find((enquiry) => enquiry.id === id);
    if (existing) select.value = existing.status;
    return;
  }

  const enquiry = enquiries.find((item) => item.id === id);
  if (enquiry) enquiry.status = nextStatus;
  setText(dashboardStatus, "Enquiry updated.");
  renderEnquiries();
}

function createEnquiryCard(enquiry) {
  const card = document.createElement("article");
  card.className = "enquiry-card";

  const heading = document.createElement("div");
  heading.className = "enquiry-card-heading";

  const titleWrap = document.createElement("div");
  const time = document.createElement("small");
  const title = document.createElement("h2");
  time.textContent = formatDate(enquiry.created_at);
  title.textContent = enquiry.name;
  titleWrap.append(time, title);

  const select = document.createElement("select");
  select.className = `status-select status-${enquiry.status}`;
  select.setAttribute("aria-label", `Status for ${enquiry.name}`);
  ["new", "contacted", "archived"].forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value.charAt(0).toUpperCase() + value.slice(1);
    option.selected = enquiry.status === value;
    select.append(option);
  });
  select.addEventListener("change", () => updateStatus(enquiry.id, select.value, select));
  heading.append(titleWrap, select);

  const meta = document.createElement("div");
  meta.className = "enquiry-meta";
  addMeta(meta, "SERVICE", enquiry.project_type);
  addMeta(meta, "FINISHED LENGTH", enquiry.runtime);
  addMeta(meta, "BUDGET", enquiry.budget);
  addMeta(meta, "DEADLINE", enquiry.deadline ? new Date(`${enquiry.deadline}T12:00:00`).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "Flexible");
  addMeta(meta, "DISCORD", enquiry.discord_username);

  const details = document.createElement("p");
  details.className = "enquiry-details";
  details.textContent = enquiry.details;

  const actions = document.createElement("div");
  actions.className = "enquiry-actions";
  const replyAddress = safeEmail(enquiry.email);
  if (replyAddress) {
    const email = document.createElement("a");
    email.className = "button primary compact";
    email.href = `mailto:${replyAddress}?subject=${encodeURIComponent(`Your ${enquiry.project_type} enquiry — JXNN Studio`)}`;
    email.textContent = `Reply to ${replyAddress} ↗`;
    actions.append(email);
  }

  const footageUrl = safeHttpUrl(enquiry.footage_link);
  if (footageUrl) {
    const footage = document.createElement("a");
    footage.className = "button compact";
    footage.href = footageUrl;
    footage.target = "_blank";
    footage.rel = "noopener noreferrer";
    footage.textContent = "Open footage / reference ↗";
    actions.append(footage);
  }

  card.append(heading, meta, details, actions);
  return card;
}

function renderEnquiries() {
  enquiryList.replaceChildren();
  const selectedStatus = statusFilter.value;
  const visible = selectedStatus === "all"
    ? enquiries
    : enquiries.filter((enquiry) => enquiry.status === selectedStatus);

  visible.forEach((enquiry) => enquiryList.append(createEnquiryCard(enquiry)));
  emptyState.hidden = visible.length !== 0;

  const now = new Date();
  const thisMonth = enquiries.filter((enquiry) => {
    const created = new Date(enquiry.created_at);
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }).length;

  setText(totalCount, String(enquiries.length));
  setText(newCount, String(enquiries.filter((enquiry) => enquiry.status === "new").length));
  setText(monthCount, String(thisMonth));
}

async function loadEnquiries() {
  setText(dashboardStatus, "Loading enquiries…");

  const { data, error } = await client
    .from("enquiries")
    .select("id, created_at, name, email, discord_username, project_type, runtime, budget, deadline, footage_link, details, status")
    .order("created_at", { ascending: false });

  if (error) {
    setText(dashboardStatus, "Couldn’t load enquiries. Check the database setup and try again.");
    return;
  }

  enquiries = data || [];
  setText(dashboardStatus, "");
  renderEnquiries();
}

async function handleSession(session) {
  const email = session?.user?.email?.toLowerCase();

  if (!email) {
    showLogin();
    return;
  }

  if (email !== ADMIN_EMAIL) {
    await client.auth.signOut();
    showLogin("This account does not have access to the private studio dashboard.");
    return;
  }

  showDashboard(email);
  await loadEnquiries();
}

sendLoginButton?.addEventListener("click", async () => {
  sendLoginButton.disabled = true;
  sendLoginButton.textContent = "Sending secure link…";
  setText(loginStatus, "");

  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await client.auth.signInWithOtp({
    email: ADMIN_EMAIL,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true }
  });

  sendLoginButton.disabled = false;
  sendLoginButton.textContent = "Email me a sign-in link ↗";
  setText(loginStatus, error
    ? "The sign-in email couldn’t be sent. Please try again shortly."
    : `A secure sign-in link has been sent to ${ADMIN_EMAIL}.`);
});

signOutButton?.addEventListener("click", async () => {
  await client.auth.signOut();
  showLogin("You’ve been signed out.");
});

statusFilter?.addEventListener("change", renderEnquiries);

const { data: initialSession } = await client.auth.getSession();
await handleSession(initialSession.session);

client.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
    window.setTimeout(() => handleSession(session), 0);
  }
});

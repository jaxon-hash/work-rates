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
const analyticsRange = document.getElementById("analyticsRange");
const pageViewCount = document.getElementById("pageViewCount");
const ctaClickCount = document.getElementById("ctaClickCount");
const workPlayCount = document.getElementById("workPlayCount");
const formSuccessCount = document.getElementById("formSuccessCount");
const topPages = document.getElementById("topPages");
const popularWork = document.getElementById("popularWork");
const deviceBreakdown = document.getElementById("deviceBreakdown");

let enquiries = [];
let siteEvents = [];

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

function countEvents(events, eventName) {
  return events.filter((event) => event.event_name === eventName).length;
}

function groupEvents(events, key) {
  return events.reduce((groups, event) => {
    const value = event[key] || "Unknown";
    groups.set(value, (groups.get(value) || 0) + 1);
    return groups;
  }, new Map());
}

function renderBars(container, entries) {
  container.replaceChildren();

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "analytics-empty";
    empty.textContent = "No activity in this range yet.";
    container.append(empty);
    return;
  }

  const maximum = Math.max(...entries.map(([, count]) => count), 1);
  entries.slice(0, 6).forEach(([label, count]) => {
    const row = document.createElement("div");
    row.className = "analytics-bar";
    const name = document.createElement("span");
    const bar = document.createElement("i");
    const total = document.createElement("strong");
    const displayLabel = String(label).startsWith("/")
      ? String(label)
      : String(label).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    name.textContent = displayLabel;
    name.title = label;
    bar.style.width = `${Math.max((count / maximum) * 100, 5)}%`;
    total.textContent = String(count);
    row.append(name, bar, total);
    container.append(row);
  });
}

function renderAnalytics() {
  const days = Number(analyticsRange?.value || 30);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const visible = siteEvents.filter((event) => new Date(event.created_at).getTime() >= cutoff);

  setText(pageViewCount, String(countEvents(visible, "page_view")));
  setText(ctaClickCount, String(countEvents(visible, "cta_click")));
  setText(workPlayCount, String(countEvents(visible, "showreel_play") + countEvents(visible, "work_open")));
  setText(formSuccessCount, String(countEvents(visible, "form_success")));

  const pageEntries = [...groupEvents(visible.filter((event) => event.event_name === "page_view"), "path").entries()]
    .sort((a, b) => b[1] - a[1]);
  const workEntries = [...groupEvents(visible.filter((event) => (
    event.event_name === "showreel_play" ||
    event.event_name === "work_open" ||
    event.event_name === "case_study_open"
  )), "event_label").entries()].sort((a, b) => b[1] - a[1]);
  const deviceEntries = [...groupEvents(visible, "device_type").entries()]
    .sort((a, b) => b[1] - a[1]);

  renderBars(topPages, pageEntries);
  renderBars(popularWork, workEntries);
  renderBars(deviceBreakdown, deviceEntries);
}

async function loadAnalytics() {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("site_events")
    .select("created_at, event_name, event_label, path, device_type")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    siteEvents = [];
    renderAnalytics();
    return;
  }

  siteEvents = data || [];
  renderAnalytics();
}

function createNoteField(labelText, control, full = false) {
  const field = document.createElement("div");
  field.className = `admin-note-field${full ? " full" : ""}`;
  const label = document.createElement("label");
  label.textContent = labelText;
  label.htmlFor = control.id;
  field.append(label, control);
  return field;
}

async function saveAdminNotes(enquiry, controls, button, saveStatus) {
  button.disabled = true;
  saveStatus.textContent = "Saving…";

  const changes = {
    internal_notes: controls.notes.value.trim() || null,
    quoted_price: controls.price.value.trim() || null,
    follow_up_on: controls.followUp.value || null,
    outcome: controls.outcome.value
  };

  const { error } = await client
    .from("enquiries")
    .update(changes)
    .eq("id", enquiry.id);

  button.disabled = false;

  if (error) {
    saveStatus.textContent = "Couldn’t save these private notes.";
    return;
  }

  Object.assign(enquiry, changes);
  saveStatus.textContent = "Private notes saved.";
}

function createAdminNotes(enquiry) {
  const section = document.createElement("section");
  section.className = "enquiry-admin-notes";
  const heading = document.createElement("small");
  heading.textContent = "PRIVATE PROJECT NOTES";

  const grid = document.createElement("div");
  grid.className = "admin-note-grid";

  const price = document.createElement("input");
  price.id = `quoted-price-${enquiry.id}`;
  price.type = "text";
  price.maxLength = 80;
  price.placeholder = "e.g. £450";
  price.value = enquiry.quoted_price || "";

  const followUp = document.createElement("input");
  followUp.id = `follow-up-${enquiry.id}`;
  followUp.type = "date";
  followUp.value = enquiry.follow_up_on || "";

  const outcome = document.createElement("select");
  outcome.id = `outcome-${enquiry.id}`;
  ["pending", "won", "lost", "paused"].forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value.charAt(0).toUpperCase() + value.slice(1);
    option.selected = (enquiry.outcome || "pending") === value;
    outcome.append(option);
  });

  const notes = document.createElement("textarea");
  notes.id = `internal-notes-${enquiry.id}`;
  notes.maxLength = 4000;
  notes.placeholder = "Creative direction, agreed scope, next step…";
  notes.value = enquiry.internal_notes || "";

  grid.append(
    createNoteField("Quoted price", price),
    createNoteField("Follow up", followUp),
    createNoteField("Outcome", outcome),
    createNoteField("Internal notes", notes, true)
  );

  const actions = document.createElement("div");
  actions.className = "admin-note-actions";
  const saveButton = document.createElement("button");
  saveButton.className = "button compact";
  saveButton.type = "button";
  saveButton.textContent = "Save private notes";
  const saveStatus = document.createElement("span");
  saveStatus.className = "admin-note-status";
  saveStatus.setAttribute("role", "status");
  saveButton.addEventListener("click", () => saveAdminNotes(
    enquiry,
    { notes, price, followUp, outcome },
    saveButton,
    saveStatus
  ));
  actions.append(saveButton, saveStatus);
  section.append(heading, grid, actions);
  return section;
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

async function deleteEnquiry(id, name, button) {
  const confirmed = window.confirm(`Permanently delete ${name}'s enquiry? This cannot be undone.`);
  if (!confirmed) return;

  button.disabled = true;
  setText(dashboardStatus, "Deleting enquiry…");

  const { error } = await client
    .from("enquiries")
    .delete()
    .eq("id", id);

  if (error) {
    button.disabled = false;
    setText(dashboardStatus, "Couldn’t delete that enquiry. Please try again.");
    return;
  }

  enquiries = enquiries.filter((enquiry) => enquiry.id !== id);
  setText(dashboardStatus, "Enquiry permanently deleted.");
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

  const deleteButton = document.createElement("button");
  deleteButton.className = "button compact danger";
  deleteButton.type = "button";
  deleteButton.textContent = "Delete enquiry";
  deleteButton.setAttribute("aria-label", `Delete ${enquiry.name}'s enquiry`);
  deleteButton.addEventListener("click", () => deleteEnquiry(enquiry.id, enquiry.name, deleteButton));
  actions.append(deleteButton);

  const adminNotes = createAdminNotes(enquiry);
  card.append(heading, meta, details, actions, adminNotes);
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
    .select("id, created_at, name, email, discord_username, project_type, runtime, budget, deadline, footage_link, details, status, internal_notes, quoted_price, follow_up_on, outcome")
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
  await Promise.all([loadEnquiries(), loadAnalytics()]);
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
analyticsRange?.addEventListener("change", renderAnalytics);

const { data: initialSession } = await client.auth.getSession();
await handleSession(initialSession.session);

client.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
    window.setTimeout(() => handleSession(session), 0);
  }
});

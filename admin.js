import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { ADMIN_EMAIL, CLIENT_ROOM_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase-config.js";

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
const roomCount = document.getElementById("roomCount");
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
let clientRooms = [];
const clientMessages = new Map();
const roomAccessLinks = new Map();

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

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function clientInviteText(room, url) {
  return `Hey ${room.client_name} — I’ve opened your private JXNN Client Room for ${room.project_title}. Use it for updates, feedback and one-tap approvals: ${url}`;
}

async function ownerRoomRequest(action, details) {
  const { data } = await client.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Your admin session has expired.");

  const response = await fetch(CLIENT_ROOM_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action, ...details })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Client Room request failed.");
  return body;
}

async function loadClientRooms({ render = false } = {}) {
  const { data: rooms, error } = await client
    .from("client_rooms")
    .select("id, enquiry_id, created_at, updated_at, last_activity_at, client_name, project_title, status, archived, discord_user_id, discord_display_name, discord_connected_at")
    .eq("archived", false)
    .order("last_activity_at", { ascending: false });

  if (error) {
    setText(dashboardStatus, "Client Rooms could not be loaded.");
    return;
  }

  clientRooms = rooms || [];
  clientMessages.clear();

  if (clientRooms.length) {
    const ids = clientRooms.map((room) => room.id);
    const { data: messages } = await client
      .from("client_messages")
      .select("id, room_id, created_at, sender, message_type, message")
      .in("room_id", ids)
      .order("created_at", { ascending: true })
      .limit(2000);

    (messages || []).forEach((message) => {
      const roomItems = clientMessages.get(message.room_id) || [];
      roomItems.push(message);
      clientMessages.set(message.room_id, roomItems);
    });
  }

  setText(roomCount, String(clientRooms.length));
  if (render) renderEnquiries();
}

async function createClientRoom(enquiry, titleInput, button, status) {
  const projectTitle = titleInput.value.trim();
  if (!projectTitle) {
    status.textContent = "Add a project title first.";
    titleInput.focus();
    return;
  }

  button.disabled = true;
  status.textContent = "Building the private room…";
  try {
    const data = await ownerRoomRequest("create_room", {
      enquiry_id: enquiry.id,
      project_title: projectTitle
    });
    roomAccessLinks.set(data.room.id, data.access_url);
    await copyText(clientInviteText(data.room, data.access_url));
    await loadClientRooms();
    setText(dashboardStatus, "Client Room created. The private invite message is copied and ready to send.");
    renderEnquiries();
  } catch (error) {
    status.textContent = error.message || "The Client Room could not be created.";
    button.disabled = false;
  }
}

async function copyOrReplaceRoomLink(room, button, status) {
  button.disabled = true;
  let accessUrl = roomAccessLinks.get(room.id);

  try {
    if (!accessUrl) {
      const confirmed = window.confirm("Create a fresh private link? The client’s previous link will stop working.");
      if (!confirmed) {
        button.disabled = false;
        return;
      }
      status.textContent = "Replacing the private link…";
      const data = await ownerRoomRequest("rotate_link", { room_id: room.id });
      accessUrl = data.access_url;
      roomAccessLinks.set(room.id, accessUrl);
    }

    await copyText(clientInviteText(room, accessUrl));
    status.textContent = "Private invite copied. Paste it into Discord or email.";
    button.textContent = "Copy invite again";
  } catch (error) {
    status.textContent = error.message || "The invite could not be copied.";
  } finally {
    button.disabled = false;
  }
}

async function sendStudioReply(room, textarea, button, status) {
  const message = textarea.value.trim();
  if (!message) return;
  button.disabled = true;
  status.textContent = "Sending to the room…";

  try {
    const data = await ownerRoomRequest("studio_reply", { room_id: room.id, message });
    textarea.value = "";
    const roomItems = clientMessages.get(room.id) || [];
    roomItems.push(data.message);
    clientMessages.set(room.id, roomItems);
    room.status = data.status;
    room.last_activity_at = data.message.created_at;
    const deliveryStatus = data.discord_connected
      ? data.discord_delivered
        ? "Reply is live and the client was alerted on Discord."
        : "Reply is live. Discord could not deliver the alert; ask the client to join the server and allow DMs."
      : "Reply is live in the client’s room. Discord alerts are not connected.";
    setText(dashboardStatus, deliveryStatus);
    renderEnquiries();
  } catch (error) {
    status.textContent = error.message || "That reply didn’t send.";
  } finally {
    button.disabled = false;
  }
}

async function updateRoomStatus(room, value, select, status) {
  select.disabled = true;
  try {
    const data = await ownerRoomRequest("studio_status", { room_id: room.id, status: value });
    room.status = value;
    room.last_activity_at = new Date().toISOString();
    status.textContent = room.discord_user_id
      ? data.discord_delivered
        ? "Project signal updated and the client was alerted on Discord."
        : "Project signal updated. Discord could not deliver the alert."
      : "Project signal updated.";
  } catch (error) {
    select.value = room.status;
    status.textContent = error.message || "The project signal could not be updated.";
  } finally {
    select.disabled = false;
  }
}

async function archiveClientRoom(room, button) {
  const confirmed = window.confirm(`Close ${room.client_name}’s Client Room? Their private link will stop working.`);
  if (!confirmed) return;
  button.disabled = true;
  const { error } = await client.from("client_rooms").update({ archived: true }).eq("id", room.id);
  if (error) {
    button.disabled = false;
    setText(dashboardStatus, "That Client Room could not be closed.");
    return;
  }
  clientRooms = clientRooms.filter((item) => item.id !== room.id);
  roomAccessLinks.delete(room.id);
  setText(roomCount, String(clientRooms.length));
  setText(dashboardStatus, "Client Room closed and its private link disabled.");
  renderEnquiries();
}

function createClientRoomPanel(enquiry) {
  const section = document.createElement("section");
  section.className = "admin-client-room";
  const room = clientRooms.find((item) => item.enquiry_id === enquiry.id);

  if (!room) {
    const heading = document.createElement("div");
    heading.className = "admin-client-room-head";
    const title = document.createElement("div");
    title.innerHTML = "<small>THE CUT ROOM</small><strong>Open a private client line</strong>";
    const status = document.createElement("span");
    status.className = "admin-room-status";
    heading.append(title, status);

    const creator = document.createElement("div");
    creator.className = "admin-room-create";
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 140;
    input.value = `${enquiry.project_type} — ${enquiry.name}`;
    input.setAttribute("aria-label", `Project title for ${enquiry.name}`);
    const button = document.createElement("button");
    button.className = "button primary compact";
    button.type = "button";
    button.textContent = "Create Client Room ↗";
    button.addEventListener("click", () => createClientRoom(enquiry, input, button, status));
    creator.append(input, button);
    section.append(heading, creator);
    return section;
  }

  const heading = document.createElement("div");
  heading.className = "admin-client-room-head";
  const title = document.createElement("div");
  const label = document.createElement("small");
  const project = document.createElement("strong");
  label.textContent = "CLIENT ROOM · LIVE";
  project.textContent = room.project_title;
  const discordBadge = document.createElement("span");
  discordBadge.className = `admin-discord-badge${room.discord_user_id ? " connected" : ""}`;
  discordBadge.textContent = room.discord_user_id
    ? `Discord alerts · ${room.discord_display_name || "Connected"}`
    : "Discord alerts · Not connected";
  title.append(label, project, discordBadge);

  const roomState = document.createElement("select");
  roomState.className = `room-state room-state-${room.status}`;
  roomState.setAttribute("aria-label", `Client Room status for ${enquiry.name}`);
  [
    ["active", "Room open"],
    ["waiting_client", "Waiting for client"],
    ["waiting_studio", "Waiting for studio"],
    ["revision", "Revision round"],
    ["approved", "Approved"],
    ["complete", "Complete"]
  ].forEach(([value, text]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    option.selected = room.status === value;
    roomState.append(option);
  });
  heading.append(title, roomState);

  const timeline = document.createElement("div");
  timeline.className = "admin-room-timeline";
  const roomItems = clientMessages.get(room.id) || [];
  roomItems.slice(-8).forEach((item) => {
    const message = document.createElement("article");
    message.className = `admin-room-message from-${item.sender}`;
    const meta = document.createElement("div");
    const sender = document.createElement("strong");
    const time = document.createElement("time");
    sender.textContent = item.sender === "studio" ? "You" : item.sender === "client" ? room.client_name : "Room signal";
    time.textContent = formatDate(item.created_at);
    meta.append(sender, time);
    const body = document.createElement("p");
    body.textContent = item.message;
    message.append(meta, body);
    timeline.append(message);
  });

  const composer = document.createElement("div");
  composer.className = "admin-room-composer";
  const textarea = document.createElement("textarea");
  textarea.maxLength = 4000;
  textarea.rows = 3;
  textarea.placeholder = `Reply privately to ${room.client_name}…`;
  const controls = document.createElement("div");
  const status = document.createElement("span");
  status.className = "admin-room-status";
  status.setAttribute("role", "status");
  const send = document.createElement("button");
  send.className = "button primary compact";
  send.type = "button";
  send.textContent = "Send to room ↗";
  send.addEventListener("click", () => sendStudioReply(room, textarea, send, status));
  controls.append(status, send);
  composer.append(textarea, controls);

  const actions = document.createElement("div");
  actions.className = "admin-room-actions";
  const invite = document.createElement("button");
  invite.className = "button compact";
  invite.type = "button";
  invite.textContent = roomAccessLinks.has(room.id) ? "Copy private invite" : "Replace access link";
  invite.addEventListener("click", () => copyOrReplaceRoomLink(room, invite, status));
  const refresh = document.createElement("button");
  refresh.className = "button compact";
  refresh.type = "button";
  refresh.textContent = "Refresh messages";
  refresh.addEventListener("click", async () => {
    refresh.disabled = true;
    await loadClientRooms({ render: true });
    setText(dashboardStatus, "Client Rooms refreshed.");
  });
  const close = document.createElement("button");
  close.className = "button compact danger";
  close.type = "button";
  close.textContent = "Close room";
  close.addEventListener("click", () => archiveClientRoom(room, close));
  actions.append(invite, refresh, close);

  roomState.addEventListener("change", () => updateRoomStatus(room, roomState.value, roomState, status));
  section.append(heading, timeline, composer, actions);
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
  const hasRoom = clientRooms.some((room) => room.enquiry_id === id);
  const confirmed = window.confirm(hasRoom
    ? `Permanently delete ${name}'s enquiry and Client Room conversation? This cannot be undone.`
    : `Permanently delete ${name}'s enquiry? This cannot be undone.`);
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
  clientRooms = clientRooms.filter((room) => room.enquiry_id !== id);
  setText(roomCount, String(clientRooms.length));
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

  const clientRoomPanel = createClientRoomPanel(enquiry);
  const adminNotes = createAdminNotes(enquiry);
  card.append(heading, meta, details, actions, clientRoomPanel, adminNotes);
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
  await Promise.all([loadEnquiries(), loadAnalytics(), loadClientRooms()]);
  renderEnquiries();
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

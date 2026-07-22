import { CLIENT_ROOM_URL } from "./supabase-config.js";

const loadingPanel = document.getElementById("loadingPanel");
const errorPanel = document.getElementById("errorPanel");
const errorMessage = document.getElementById("errorMessage");
const clientRoom = document.getElementById("clientRoom");
const roomClientName = document.getElementById("roomClientName");
const roomProjectTitle = document.getElementById("roomProjectTitle");
const roomStatus = document.getElementById("roomStatus");
const projectProgress = document.getElementById("projectProgress");
const clientMessages = document.getElementById("clientMessages");
const messageForm = document.getElementById("clientMessageForm");
const messageInput = document.getElementById("clientMessage");
const sendButton = document.getElementById("sendClientMessage");
const messageStatus = document.getElementById("clientMessageStatus");
const quickButtons = [...document.querySelectorAll("[data-client-action]")];

const accessToken = new URLSearchParams(window.location.hash.slice(1)).get("access") || "";
const statusLabels = {
  active: "Room open",
  waiting_client: "Your move",
  waiting_studio: "With JXNN",
  revision: "Revision round",
  approved: "Cut approved",
  complete: "Project complete"
};

let room = null;
let messages = [];
let polling = null;
let busy = false;

function showError(message) {
  loadingPanel.hidden = true;
  clientRoom.hidden = true;
  errorPanel.hidden = false;
  if (message) errorMessage.textContent = message;
  window.clearInterval(polling);
}

async function callRoom(action, details = {}) {
  const response = await fetch(CLIENT_ROOM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, token: accessToken, ...details })
  });

  let body = {};
  try {
    body = await response.json();
  } catch {
    // A friendly status below handles empty upstream errors.
  }

  if (!response.ok) {
    const error = new Error(body.error || "Client Room unavailable");
    error.status = response.status;
    throw error;
  }

  return body;
}

function formatMessageTime(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function statusPhase(status) {
  if (status === "approved" || status === "complete") return 4;
  if (status === "revision" || status === "waiting_studio") return 3;
  if (status === "waiting_client") return 2;
  return 1;
}

function renderRoom() {
  if (!room) return;
  roomClientName.textContent = room.client_name;
  roomProjectTitle.textContent = room.project_title;
  roomStatus.textContent = statusLabels[room.status] || "Room open";
  document.title = `${room.project_title} — JXNN Client Room`;

  const activePhase = statusPhase(room.status);
  [...projectProgress.children].forEach((item, index) => {
    item.classList.toggle("complete", index + 1 < activePhase);
    item.classList.toggle("active", index + 1 === activePhase);
  });
}

function renderMessages(scroll = false) {
  const previousCount = clientMessages.children.length;
  clientMessages.replaceChildren();

  messages.forEach((item) => {
    const article = document.createElement("article");
    article.className = `client-message from-${item.sender} type-${item.message_type}`;

    const meta = document.createElement("div");
    const sender = document.createElement("strong");
    const time = document.createElement("time");
    sender.textContent = item.sender === "studio" ? "JXNN Studio" : item.sender === "client" ? "You" : "Project signal";
    time.dateTime = item.created_at;
    time.textContent = formatMessageTime(item.created_at);
    meta.append(sender, time);

    const text = document.createElement("p");
    text.textContent = item.message;
    article.append(meta, text);
    clientMessages.append(article);
  });

  if (scroll || messages.length > previousCount) {
    clientMessages.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

async function loadRoom({ quiet = false } = {}) {
  try {
    const data = await callRoom("get_room");
    const changed = JSON.stringify(data.messages) !== JSON.stringify(messages);
    room = data.room;
    messages = data.messages || [];
    renderRoom();
    if (changed) renderMessages(!quiet);
    loadingPanel.hidden = true;
    errorPanel.hidden = true;
    clientRoom.hidden = false;
  } catch (error) {
    if (!quiet || error.status === 401) {
      showError(error.status === 401
        ? "This private link is invalid, expired or has been replaced. Ask JXNN Studio for a fresh invite."
        : "The Client Room could not connect. Please try again in a moment.");
    }
  }
}

function setBusy(value, text = "") {
  busy = value;
  sendButton.disabled = value;
  quickButtons.forEach((button) => { button.disabled = value; });
  messageStatus.textContent = text;
}

messageForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !messageInput.value.trim()) return;

  setBusy(true, "Transmitting…");
  try {
    await callRoom("send_message", { message: messageInput.value.trim() });
    messageInput.value = "";
    messageStatus.textContent = "Message delivered to JXNN.";
    await loadRoom();
  } catch (error) {
    messageStatus.textContent = error.status === 429
      ? "Too many updates were sent. Please wait a little."
      : "That message didn’t send. Please try again.";
  } finally {
    setBusy(false, messageStatus.textContent);
  }
});

messageInput?.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") messageForm.requestSubmit();
});

quickButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (busy) return;
    const action = button.dataset.clientAction;
    setBusy(true, "Sending project signal…");
    try {
      await callRoom("quick_action", { quick_action: action });
      messageStatus.textContent = "Project signal sent.";
      await loadRoom();
      if (action === "revision") messageInput.focus();
    } catch (error) {
      messageStatus.textContent = error.status === 429
        ? "Too many updates were sent. Please wait a little."
        : "That signal didn’t send. Please try again.";
    } finally {
      setBusy(false, messageStatus.textContent);
    }
  });
});

if (!/^[0-9a-f]{64}$/i.test(accessToken)) {
  showError("This page needs a private Client Room link from JXNN Studio.");
} else {
  await loadRoom();
  polling = window.setInterval(() => {
    if (!document.hidden && !busy) loadRoom({ quiet: true });
  }, 7000);
}

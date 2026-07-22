import { CLIENT_ROOM_URL } from "./supabase-config.js";

const tokenStorageKey = "jxnn_enquiry_notification_tokens";
const seenStorageKey = "jxnn_seen_client_rooms";
const tokenPattern = /^[0-9a-f]{64}$/i;
let checking = false;
let timer = 0;

function readList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function saveList(key, values) {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Notifications remain optional when browser storage is unavailable.
  }
}

function safeRoomUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === window.location.origin && url.pathname === "/client.html" &&
      /^#access=[0-9a-f]{64}$/i.test(url.hash) ? url.href : "";
  } catch {
    return "";
  }
}

function addStyles() {
  if (document.getElementById("jxnnNotificationStyles")) return;
  const style = document.createElement("style");
  style.id = "jxnnNotificationStyles";
  style.textContent = `
    .jxnn-site-alert{position:fixed;right:22px;bottom:22px;z-index:160;font-family:"Manrope",sans-serif;color:#f4f2eb}
    .jxnn-site-alert *{box-sizing:border-box}
    .jxnn-alert-toggle{display:grid;place-items:center;width:58px;height:58px;margin-left:auto;border:1px solid rgba(255,255,255,.18);border-radius:18px;background:#c8ff32;color:#070709;box-shadow:0 18px 55px rgba(0,0,0,.45),0 0 30px rgba(200,255,50,.2);cursor:pointer;transition:transform .2s ease,box-shadow .2s ease}
    .jxnn-alert-toggle:hover{transform:translateY(-3px);box-shadow:0 22px 65px rgba(0,0,0,.5),0 0 40px rgba(200,255,50,.3)}
    .jxnn-alert-toggle svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.9}
    .jxnn-alert-count{position:absolute;top:-6px;right:-6px;display:grid;place-items:center;min-width:23px;height:23px;padding:0 6px;border:2px solid #070709;border-radius:999px;background:#8d68ff;color:#fff;font:700 11px/1 "DM Mono",monospace}
    .jxnn-alert-panel{position:absolute;right:0;bottom:70px;width:min(370px,calc(100vw - 28px));padding:21px;border:1px solid rgba(255,255,255,.14);border-radius:22px;background:rgba(13,13,17,.96);box-shadow:0 28px 90px rgba(0,0,0,.58);backdrop-filter:blur(20px);opacity:0;visibility:hidden;transform:translateY(10px) scale(.98);transform-origin:bottom right;transition:opacity .2s ease,transform .2s ease,visibility .2s}
    .jxnn-site-alert.is-open .jxnn-alert-panel{opacity:1;visibility:visible;transform:none}
    .jxnn-alert-top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:17px}
    .jxnn-alert-kicker{color:#c8ff32;font:500 11px/1.2 "DM Mono",monospace;letter-spacing:.12em;text-transform:uppercase}
    .jxnn-alert-close{display:grid;place-items:center;width:30px;height:30px;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:transparent;color:#96959f;font-size:20px;cursor:pointer}
    .jxnn-alert-panel h2{margin:0 0 8px;color:#f4f2eb;font-size:clamp(1.25rem,4vw,1.55rem);line-height:1.06;letter-spacing:-.04em}
    .jxnn-alert-panel p{margin:0 0 18px;color:#aaa9b2;font-size:.9rem;line-height:1.55}
    .jxnn-alert-open{display:flex;align-items:center;justify-content:space-between;gap:18px;width:100%;padding:13px 15px;border:1px solid #c8ff32;border-radius:13px;background:#c8ff32;color:#070709;text-decoration:none;font-weight:800;font-size:.86rem}
    .jxnn-alert-more{display:block;margin-top:11px;color:#96959f;font:500 10px/1.4 "DM Mono",monospace;text-align:center;text-transform:uppercase;letter-spacing:.08em}
    @media(max-width:680px){.jxnn-site-alert{right:14px;bottom:14px}.jxnn-alert-toggle{width:54px;height:54px}.jxnn-alert-panel{right:0;bottom:66px}}
    @media(prefers-reduced-motion:reduce){.jxnn-alert-toggle,.jxnn-alert-panel{transition:none}}
  `;
  document.head.append(style);
}

function render(rooms) {
  document.getElementById("jxnnSiteAlert")?.remove();
  if (!rooms.length) return;

  addStyles();
  const first = rooms[0];
  const root = document.createElement("aside");
  root.className = "jxnn-site-alert";
  root.id = "jxnnSiteAlert";

  const panel = document.createElement("div");
  panel.className = "jxnn-alert-panel";
  panel.setAttribute("role", "status");

  const top = document.createElement("div");
  top.className = "jxnn-alert-top";
  const kicker = document.createElement("span");
  kicker.className = "jxnn-alert-kicker";
  kicker.textContent = "Client Room / Ready";
  const close = document.createElement("button");
  close.className = "jxnn-alert-close";
  close.type = "button";
  close.setAttribute("aria-label", "Close project notification");
  close.textContent = "×";
  top.append(kicker, close);

  const heading = document.createElement("h2");
  heading.textContent = "JXNN opened your private room.";
  const copy = document.createElement("p");
  copy.textContent = `${first.projectTitle} is ready for messages, updates and approvals.`;
  const link = document.createElement("a");
  link.className = "jxnn-alert-open";
  link.href = first.accessUrl;
  link.innerHTML = "<span>Open chat</span><span aria-hidden=\"true\">↗</span>";
  panel.append(top, heading, copy, link);

  if (rooms.length > 1) {
    const more = document.createElement("span");
    more.className = "jxnn-alert-more";
    more.textContent = `+ ${rooms.length - 1} more room${rooms.length === 2 ? "" : "s"} ready`;
    panel.append(more);
  }

  const toggle = document.createElement("button");
  toggle.className = "jxnn-alert-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", `${rooms.length} Client Room notification${rooms.length === 1 ? "" : "s"}`);
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg>';
  const count = document.createElement("span");
  count.className = "jxnn-alert-count";
  count.textContent = String(rooms.length);
  toggle.append(count);
  root.append(panel, toggle);
  document.body.append(root);

  const setOpen = (open) => {
    root.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", () => setOpen(!root.classList.contains("is-open")));
  close.addEventListener("click", () => {
    setOpen(false);
    toggle.focus();
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && root.classList.contains("is-open")) setOpen(false);
  });

  const seen = readList(seenStorageKey);
  if (!seen.includes(first.token)) {
    setOpen(true);
    saveList(seenStorageKey, [first.token, ...seen].slice(0, 20));
  }
}

async function checkToken(token) {
  try {
    const response = await fetch(CLIENT_ROOM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check_enquiry_notification", token }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const accessUrl = data.room_ready ? safeRoomUrl(data.access_url) : "";
    if (!accessUrl) return null;
    return {
      token,
      accessUrl,
      projectTitle: String(data.project_title || "Your project").slice(0, 140),
    };
  } catch {
    return null;
  }
}

async function checkNotifications() {
  if (checking || document.visibilityState === "hidden") return;
  const tokens = readList(tokenStorageKey).filter((token) => tokenPattern.test(token)).slice(0, 4);
  if (!tokens.length) {
    document.getElementById("jxnnSiteAlert")?.remove();
    return;
  }

  checking = true;
  const rooms = (await Promise.all(tokens.map(checkToken))).filter(Boolean);
  checking = false;
  render(rooms);
}

function scheduleChecks() {
  window.clearInterval(timer);
  timer = window.setInterval(checkNotifications, 45000);
}

const isLocalPreview = ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
  new URLSearchParams(window.location.search).has("client-room-preview");

if (isLocalPreview) {
  render([{
    token: "preview",
    accessUrl: `${window.location.origin}/client.html#access=${"a".repeat(64)}`,
    projectTitle: "Launch film edit",
  }]);
} else {
  window.addEventListener("jxnn:notification-token", checkNotifications);
  window.addEventListener("focus", checkNotifications);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkNotifications();
  });
  checkNotifications();
  scheduleChecks();
}

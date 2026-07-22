import { CLIENT_ROOM_URL } from "./supabase-config.js";

const panel = document.getElementById("discordCallbackPanel");
const orbit = document.getElementById("discordCallbackOrbit");
const eyebrow = document.getElementById("discordCallbackEyebrow");
const title = document.getElementById("discordCallbackTitle");
const message = document.getElementById("discordCallbackMessage");
const returnButton = document.getElementById("discordReturnButton");
const returnUrl = sessionStorage.getItem("jxnnClientRoomReturn") || "client.html";

function safeReturnUrl(value) {
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin && url.pathname.endsWith("/client.html")
      ? url.href
      : "client.html";
  } catch {
    return "client.html";
  }
}

function showFailure(text) {
  orbit.classList.add("error");
  orbit.querySelector("span").textContent = "!";
  eyebrow.textContent = "Discord link stopped";
  title.innerHTML = 'CONNECTION <span class="outline">FAILED.</span>';
  message.textContent = text;
  returnButton.href = safeReturnUrl(returnUrl);
  returnButton.hidden = false;
  panel.focus();
}

const query = new URLSearchParams(window.location.search);
const code = query.get("code") || "";
const state = query.get("state") || "";
const denied = query.get("error") === "access_denied";

if (denied) {
  showFailure("Discord permission was cancelled. Nothing was connected, and you can return to your room safely.");
} else if (!code || !state) {
  showFailure("This Discord connection link is incomplete or has expired.");
} else {
  try {
    const response = await fetch(CLIENT_ROOM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "discord_callback", code, state })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Discord could not be connected.");

    const deliveryNote = body.discord_delivered
      ? "A confirmation DM has been sent."
      : "Connection saved. Join the JXNN Discord server and allow direct messages for reliable alerts.";
    sessionStorage.setItem("jxnnDiscordFlash", `Discord connected as ${body.display_name}. ${deliveryNote}`);
    sessionStorage.removeItem("jxnnClientRoomReturn");
    window.location.replace(safeReturnUrl(returnUrl));
  } catch (error) {
    showFailure(error.message || "Discord could not be connected. Please return to your room and try again.");
  }
}

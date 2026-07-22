import { TRACK_EVENT_URL } from "./supabase-config.js";

const allowedEvents = new Set([
  "page_view",
  "cta_click",
  "showreel_play",
  "work_open",
  "form_start",
  "form_success",
  "case_study_open"
]);

const sentOnce = new Set();

export function trackEvent(eventName, options = {}) {
  if (!allowedEvents.has(eventName)) return;
  if (options.once && sentOnce.has(eventName)) return;
  if (options.once) sentOnce.add(eventName);

  const payload = {
    event_name: eventName,
    event_label: typeof options.label === "string" ? options.label.slice(0, 60) : null,
    path: window.location.pathname.slice(0, 200) || "/",
    referrer: document.referrer.slice(0, 500)
  };

  fetch(TRACK_EVENT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => {
    // Analytics must never interrupt the visitor's experience.
  });
}

window.jxnnTrack = trackEvent;

document.addEventListener("click", (event) => {
  const tracked = event.target.closest?.("[data-track]");
  if (!tracked) return;
  trackEvent(tracked.dataset.track, { label: tracked.dataset.trackLabel });
}, { capture: true });

trackEvent("page_view");

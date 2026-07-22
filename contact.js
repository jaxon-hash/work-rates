import { SUBMIT_ENQUIRY_URL } from "./supabase-config.js";

const form = document.getElementById("projectForm");
const submitButton = document.getElementById("submitProject");
const status = document.getElementById("formStatus");
const success = document.getElementById("formSuccess");

form?.addEventListener("input", () => window.jxnnTrack?.("form_start", { once: true }), { once: true });
const anotherButton = document.getElementById("anotherEnquiry");

function setStatus(message, isError = false) {
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function setSubmitting(isSubmitting) {
  if (!submitButton) return;
  submitButton.disabled = isSubmitting;
  submitButton.textContent = isSubmitting ? "Sending securely…" : "Send project enquiry ↗";
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.reportValidity()) return;

  const data = new FormData(form);

  // A hidden honeypot silently rejects basic automated spam.
  if (String(data.get("website") || "").trim()) {
    form.hidden = true;
    success.hidden = false;
    success.focus();
    return;
  }

  setSubmitting(true);
  setStatus("Sending your project securely…");

  const enquiry = {
    name: String(data.get("name") || "").trim(),
    email: String(data.get("email") || "").trim().toLowerCase(),
    discord_username: String(data.get("discordUsername") || "").trim() || null,
    project_type: String(data.get("projectType") || "").trim(),
    runtime: String(data.get("runtime") || "").trim(),
    budget: String(data.get("budget") || "").trim(),
    deadline: data.get("deadline") || null,
    footage_link: String(data.get("footageLink") || "").trim() || null,
    details: String(data.get("details") || "").trim(),
    website: String(data.get("website") || "").trim(),
    turnstile_token: String(data.get("cf-turnstile-response") || "").trim()
  };

  if (!enquiry.turnstile_token) {
    setSubmitting(false);
    setStatus("Please complete the verification check before sending.", true);
    return;
  }

  let response;

  try {
    response = await fetch(SUBMIT_ENQUIRY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enquiry)
    });
  } catch {
    setSubmitting(false);
    setStatus("That didn’t send. Please try again, or email business.jxnn@gmail.com.", true);
    window.turnstile?.reset();
    return;
  }

  if (!response.ok) {
    setSubmitting(false);
    const messages = {
      409: "That enquiry was already received. Check your inbox or wait a few minutes before trying again.",
      422: "Verification expired. Please complete the check again.",
      429: "Too many enquiries were sent recently. Please wait before trying again."
    };
    setStatus(messages[response.status] || "That didn’t send. Please try again, or email business.jxnn@gmail.com.", true);
    window.turnstile?.reset();
    return;
  }

  form.reset();
  window.turnstile?.reset();
  window.jxnnTrack?.("form_success");
  form.hidden = true;
  success.hidden = false;
  success.focus();
});

anotherButton?.addEventListener("click", () => {
  success.hidden = true;
  form.hidden = false;
  setSubmitting(false);
  setStatus("");
  form.querySelector("input")?.focus();
});

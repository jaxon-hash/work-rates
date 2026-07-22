import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase-config.js";

const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const form = document.getElementById("projectForm");
const submitButton = document.getElementById("submitProject");
const status = document.getElementById("formStatus");
const success = document.getElementById("formSuccess");
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
    project_type: String(data.get("projectType") || "").trim(),
    runtime: String(data.get("runtime") || "").trim(),
    budget: String(data.get("budget") || "").trim(),
    deadline: data.get("deadline") || null,
    footage_link: String(data.get("footageLink") || "").trim() || null,
    details: String(data.get("details") || "").trim()
  };

  const { error } = await client.from("enquiries").insert(enquiry);

  if (error) {
    setSubmitting(false);
    setStatus("That didn’t send. Please try again, or email business.jxnn@gmail.com.", true);
    return;
  }

  form.reset();
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

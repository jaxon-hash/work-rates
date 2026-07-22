const progress = document.getElementById("scrollProgress");

function updateProgress() {
  if (!progress) return;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.width = `${max > 0 ? (window.scrollY / max) * 100 : 0}%`;
}

window.addEventListener("scroll", updateProgress, { passive: true });
updateProgress();

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll(".reveal").forEach((element, index) => {
    element.style.transitionDelay = `${Math.min((index % 3) * 80, 160)}ms`;
    observer.observe(element);
  });
} else {
  document.querySelectorAll(".reveal").forEach((element) => element.classList.add("visible"));
}

const lightbox = document.getElementById("lightbox");
const lightboxImage = document.getElementById("lightboxImage");
const closeLightbox = document.getElementById("closeLightbox");
let lastGalleryButton = null;

function closeGallery() {
  if (!lightbox) return;
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  if (lastGalleryButton) lastGalleryButton.focus();
}

document.querySelectorAll("[data-fullsrc]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!lightbox || !lightboxImage) return;
    lastGalleryButton = button;
    lightboxImage.src = button.dataset.fullsrc;
    lightboxImage.alt = button.dataset.alt || "Expanded portfolio thumbnail";
    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    closeLightbox?.focus();
  });
});

closeLightbox?.addEventListener("click", closeGallery);
lightbox?.addEventListener("click", (event) => {
  if (event.target === lightbox) closeGallery();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && lightbox?.classList.contains("open")) closeGallery();
});

(() => {
  const nav = document.getElementById("mainNav");
  const menuToggle = document.getElementById("menuToggle");
  const navLinks = document.getElementById("navLinks");

  if (!nav || !menuToggle || !navLinks) return;

  function setMenu(open) {
    nav.classList.toggle("menu-open", open);
    document.body.classList.toggle("menu-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
  }

  menuToggle.addEventListener("click", () => {
    setMenu(!nav.classList.contains("menu-open"));
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setMenu(false));
  });

  document.addEventListener("click", (event) => {
    if (!nav.contains(event.target)) setMenu(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav.classList.contains("menu-open")) {
      setMenu(false);
      menuToggle.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 680) setMenu(false);
  });
})();

const projectForm = document.getElementById("projectForm");
const formStatus = document.getElementById("formStatus");

projectForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!projectForm.reportValidity()) return;

  const data = new FormData(projectForm);
  const projectType = data.get("projectType");
  const subject = `Project enquiry — ${projectType} — ${data.get("name")}`;
  const body = [
    "Hi JXNN Studio,",
    "",
    "I would like to discuss a project.",
    "",
    `Name: ${data.get("name")}`,
    `Email: ${data.get("email")}`,
    `Project type: ${projectType}`,
    `Finished length: ${data.get("runtime")}`,
    `Budget: ${data.get("budget")}`,
    `Deadline: ${data.get("deadline") || "Flexible / to discuss"}`,
    `Footage or reference link: ${data.get("footageLink") || "Not supplied yet"}`,
    "",
    "Project details:",
    data.get("details"),
    "",
    "Thanks"
  ].join("\n");

  if (formStatus) {
    formStatus.textContent = "Your project email is ready — opening your email app now.";
  }

  window.location.href = `mailto:business.jxnn@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});

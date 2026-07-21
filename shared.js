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

/* ==========================
   Page Loader
========================== */
const loader = document.getElementById("loader");
const hideLoader = () => {
    if (loader) { // Check if loader element exists
        setTimeout(() => loader.classList.add("fade-out"), 400);
    }
};
window.addEventListener("load", hideLoader);
if (document.readyState === "complete") hideLoader();

/* ==========================
   Clean URL (Removes .html from address bar)
========================== */
if (window.location.protocol !== 'file:') { // Protect for local testing
    const currentPath = window.location.pathname;
    const htmlFileMatch = currentPath.match(/\/(.*?)\.html$/);
    if (htmlFileMatch) {
        const cleanUrl = currentPath.replace(htmlFileMatch[0], `/${htmlFileMatch[1]}`);
        window.history.replaceState(null, null, cleanUrl);
    } else if (currentPath.endsWith('index.html')) {
        // Handle index.html specifically to go to root
        window.history.replaceState(null, null, '/');
    }
}

/* ==========================
   Navbar Hide/Show on Scroll
========================== */
let lastScrollY = window.scrollY;
const navbar = document.querySelector('.navbar');
if (navbar) {
    window.addEventListener('scroll', () => {
        if (window.scrollY > lastScrollY && window.scrollY > 150) {
            navbar.style.transform = 'translateY(-100%)';
        } else {
            navbar.style.transform = 'translateY(0)';
        }
        lastScrollY = window.scrollY;
    });
}

/* ==========================
   Particle Engine
========================== */
const particleContainer = document.getElementById("particleContainer");
if (particleContainer) {
    function generateParticles() {
        particleContainer.innerHTML = ''; // Clear existing particles
        const particleCount = 40; // Standardize particle count
        for(let i = 0; i < particleCount; i++){
            const particle = document.createElement("div");
            particle.classList.add("particle");
            const size = Math.random()*5+2;
            particle.style.width = `${size}px`;
            particle.style.height = `${size}px`;
            particle.style.top = `${Math.random()*110 - 5}%`;

            particle.style.setProperty("--speed", `${Math.random()*10+8}s`);
            particle.style.setProperty("--y-drift", `${Math.random()*200-100}px`);
            particle.style.setProperty("--opacity", Math.random()*0.5+0.2);
            particle.style.animationDelay = `${Math.random()*12}s`;

            particleContainer.appendChild(particle);
        }
    }
    generateParticles();
}

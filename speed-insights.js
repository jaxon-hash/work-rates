// Vercel Speed Insights initialization
// This file initializes Vercel Speed Insights for performance monitoring
(function() {
    // Initialize the Speed Insights queue
    window.si = window.si || function () { 
        (window.siq = window.siq || []).push(arguments); 
    };
    
    // Load the Speed Insights script dynamically
    var script = document.createElement('script');
    script.src = '/_vercel/speed-insights/script.js';
    script.defer = true;
    document.head.appendChild(script);
})();

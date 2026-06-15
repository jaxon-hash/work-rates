<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>jxnn. | Rates & Packages</title>
    
    <link rel="icon" type="image/png" href="https://i.ibb.co/XZKLXwGD/Screenshot-2026-06-15-at-03-08-31.png">
    <link rel="shortcut icon" type="image/png" href="https://i.ibb.co/XZKLXwGD/Screenshot-2026-06-15-at-03-08-31.png">

    <script src="https://kit.fontawesome.com/a076d05399.js" crossorigin="anonymous"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">

    <style>
        /* Reset and Base Styles */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            scroll-behavior: smooth;
        }

        /* Anti-White Border Canvas Fix */
        html {
            background-color: #0a0a0a;
        }

        body {
            background: #0a0a0a linear-gradient(180deg, #0a0a0a 0%, #150505 50%, #300505 100%);
            background-size: 100% 200%;
            background-position: var(--scroll-pos, 0% 0%);
            color: white;
            display: flex;
            flex-direction: column;
            align-items: center;
            min-height: 100vh;
            padding: 40px 20px;
            overflow-x: hidden;
            animation: breatheBackground 12s ease-in-out infinite alternate;
            transition: background-position 0.2s ease-out;
        }

        @keyframes breatheBackground {
            0% { background-size: 100% 180%; }
            100% { background-size: 100% 220%; }
        }

        .rate-container {
            max-width: 650px;
            width: 100%;
            background: rgba(24, 24, 24, 0.75);
            border: 1px solid rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border-radius: 24px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.5);
            margin-bottom: 30px;
        }

        .header-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 30px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            padding-bottom: 20px;
        }

        .back-link {
            color: #b5b5b5;
            text-decoration: none;
            font-weight: 600;
            font-size: 0.95rem;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: color 0.2s, transform 0.2s;
        }

        .back-link:hover {
            color: #ef4444;
            transform: translateX(-2px);
        }

        h1 {
            font-size: 1.8rem;
            font-weight: 700;
            letter-spacing: -0.5px;
        }

        /* 🖼️ Rate Sheet Image Styling */
        .rate-sheet-media {
            width: 100%;
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.05);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
            margin-bottom: 35px;
            display: block;
        }

        /* Action Order Button */
        .order-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            width: 100%;
            text-decoration: none;
            background: white;
            color: black;
            padding: 18px;
            border-radius: 14px;
            font-weight: 700;
            font-size: 1.1rem;
            transition: transform 0.2s, opacity 0.2s, box-shadow 0.2s;
            cursor: pointer;
            border: none;
        }

        .order-button:hover {
            transform: translateY(-2px);
            opacity: 0.95;
            box-shadow: 0 0 25px rgba(239, 68, 68, 0.7), 0 0 10px rgba(239, 68, 68, 0.4);
        }

        footer {
            margin-top: 10px;
            color: #555;
            font-size: 0.8rem;
            letter-spacing: 0.5px;
        }
    </style>
</head>
<body>

    <div class="rate-container">
        <div class="header-row">
            <a href="index.html" class="back-link sound-trigger">
                <i class="fa-solid fa-arrow-left"></i> Back to Main
            </a>
            <h1>Pricing & Packages</h1>
        </div>

        <img src="https://i.ibb.co/XZKLXwGD/Screenshot-2026-06-15-at-03-08-31.png" alt="jxnn Pricing Layout Sheet" class="rate-sheet-media">

        <a class="order-button sound-trigger" href="https://discord.gg/YOUR_DISCORD_INVITE_HERE" target="_blank">
            <i class="fa-solid fa-bolt"></i> Order via Discord Ticket
        </a>
    </div>

    <footer>
        <div>© 2026 jxnn. All rights reserved.</div>
    </footer>

    <script>
        const clickSound = new Audio("https://cdnjs.cloudflare.com/ajax/libs/ion-sound/3.0.7/sounds/button_click.mp3");
        clickSound.volume = 0.4;

        document.querySelectorAll('.sound-trigger').forEach(element => {
            element.addEventListener('click', () => {
                try {
                    clickSound.currentTime = 0;
                    clickSound.play().catch(err => console.log("Audio waiting for user gesture context."));
                } catch(e) {
                    console.log("Audio skipped smoothly:", e);
                }
            });
        });

        // Background Scroll Tracking Alignment
        window.addEventListener('scroll', () => {
            const scrollPercent = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
            document.body.style.setProperty('--scroll-pos', `0% ${scrollPercent}%`);
        });
    </script>
</body>
</html>

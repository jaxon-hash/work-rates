# jxnn.

Personal landing page / link-in-bio for video editing services.

**Live site:** https://jxnn.store

## 🚀 Stack

- **Tech:** Plain HTML, CSS, and Vanilla JavaScript.
- **Tooling:** No build step, no dependencies, no frameworks.

## 📁 Structure

| File | Purpose |
| :--- | :--- |
| `index.html` | Main landing page (links, socials, showreel, clients) |
| `rates.html` | Pricing / packages page |
| `404.html` | Custom not-found page |
| `pull.command` | Mac script to sync latest changes from GitHub |
| `assets/` | Images (profile pic, client logos, etc.) |
| `CNAME` | Custom domain config for GitHub Pages |

## 🛠 Local Development

Since there is no build step, you can open any `.html` file directly in a browser to preview changes. For the best experience (and to avoid potential path issues), using a local server like VS Code's **Live Server** is recommended.

## 🚢 Deploy

Hosted on **GitHub Pages**. Any push to `main` auto-deploys to jxnn.store — no manual build/release step.

### Automated Workflow
This repo uses a local `post-commit` Git hook that automatically pushes to `origin/main` immediately after every commit.

```bash
git add .
git commit -m "..."
```

(The hook lives in `.git/hooks/` and isn't tracked by git, so it won't carry over to a fresh clone — re-add it if you set this up on another machine.)

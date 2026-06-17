# jxnn.

Personal landing page / link-in-bio for video editing services.

**Live site:** https://jxnn.store

## Stack

Plain HTML/CSS/JS — no build step, no dependencies. Open any `.html` file directly in a browser to preview.

## Structure

| File | Purpose |
|---|---|
| `index.html` | Main landing page (links, socials, showreel, clients) |
| `rates.html` | Pricing / packages page |
| `404.html` | Custom not-found page |
| `assets/` | Images (profile pic, client logos, etc.) |
| `CNAME` | Custom domain config for GitHub Pages |

## Deploy

Hosted on **GitHub Pages**. Any push to `main` auto-deploys to jxnn.store — no manual build/release step.

This repo also has a local `post-commit` git hook that auto-pushes to `origin/main` right after every commit, so the workflow locally is just:

```
git add .
git commit -m "..."
```

(The hook lives in `.git/hooks/` and isn't tracked by git, so it won't carry over to a fresh clone — re-add it if you set this up on another machine.)

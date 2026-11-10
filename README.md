# LIFE PROTOCOL

Mobile-first installable web app (PWA) for real-life missions and RPG progression.

## Run locally
```bash
python -m http.server 8000
```
Open `http://localhost:8000`. Service worker and `crypto.randomUUID` need HTTPS or `localhost`
(the app has a fallback for IDs, but offline mode works only on HTTPS/localhost).

## Deploy to GitHub Pages
1. Push this folder to a GitHub repository (branch `main`).
2. Repository **Settings → Pages → Source: GitHub Actions**.
3. The included workflow `.github/workflows/pages.yml` publishes the app on every push.
4. Open the Pages URL on your phone and use **Add to Home Screen** / **Install app**.

## Features
- Daily missions: create / edit / delete, one-time or daily repeat (editing or deleting a daily mission applies to the whole series).
- +5 XP per mission, 10 missions / completions per day.
- 11 ranks (RECRUIT starts at 0 XP), skills, 7 medals, streaks.
- Activity heatmaps, statistics, history, daily report (one per day).
- Local JSON export / import with validation.
- PWA: manifest, PNG icons, network-first service worker (always fresh online, works offline).

## Limitations
- Data lives in the browser's localStorage on this device and does not sync.
- Briefings, report and mission suggestions are local logic, not a generative AI. For real AI add a backend endpoint; never put an API key in `app.js`.
- Rank XP thresholds are editable in `app.js` (`rankThresholds`).

## Changelog (v2)
- Fixed exponential duplication of daily missions; old data is migrated automatically.
- Fixed first rank showing negative XP / progress; ranks now start at 0 XP.
- Awards, Statistics and History screens are reachable (Dashboard and Profile).
- Streak no longer breaks on daylight saving changes; dates no longer depend on the `en-CA` locale.
- ID generation works without secure context.
- Service worker: network-first, versioned cache, `skipWaiting` / `clients.claim`.
- Safe storage (no crash in private mode / full quota); date rollover while app is open.
- Import validation and sanitising (XSS via crafted backup), same file can be re-imported.
- iOS: no input zoom, apple-touch-icon, safe-area padding; PNG + maskable icons.
- One report per day, report archive shown on load, working "refresh briefing", toast fixes.

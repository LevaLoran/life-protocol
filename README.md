# LIFE PROTOCOL — Beta 0.05

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

## Beta 0.02
- Storage: IndexedDB (`lifeProtocolDB`, schema v1) + localStorage mirror. Beta 0.01 data is migrated automatically (the newest copy wins, nothing is deleted). Nothing is written before data is loaded, so progress is never overwritten by an empty state. Cache updates never touch user data.
- Data Management: Export / Import, Last Backup, Storage Status.
- 12-month contribution graph (tap a cell for date, missions, XP).
- Cyberpunk-style skill tree: 6 branches x 3 tiers, cross-branch unlocks, node details.
- Animations (respect `prefers-reduced-motion`), refreshed minimalist colorful dark UI.
- PWA: versioned cache `life-protocol-b002`, update banner ("ОБНОВИТЬ") instead of forced reload.

## Beta 0.04
- Figma integration (stage 1): lime palette, desktop sidebar (mobile keeps bottom bar), 11 new rank emblems, ranks grid, next-rank card. `figma.css` is a separate override file. Game logic and storage are unchanged.

## Beta 0.05
- Calendar rebuilt: real month grid (Mon-first), month/year navigation, day panel (done / planned / XP / medals), 12-month overview. Old 12-month heat graph removed (it only cached by count, mislabeled months, used a different scale than the weekly graph, and past missed missions were not stored).
- New `state.days` (planned missions per day) and `state.medalDates` are recorded from now on; history (`state.completed`) is untouched. Older days have no "planned" data, older medals no date.
- Avatars: upload JPG/PNG/WebP (up to 8 MB), crop with drag + zoom, saved as a 256 px WebP/JPEG data URL in `state.avatar` (IndexedDB + localStorage + backups), default LIFE PROTOCOL avatar otherwise.
- Motion: `extras.css` (all animations are CSS, wrapped in `prefers-reduced-motion: no-preference`), `extras.js` (XP float, rank-up banner).

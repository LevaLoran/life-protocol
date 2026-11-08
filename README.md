# LIFE PROTOCOL

Mobile-first installable web app (PWA) for real-life missions and RPG progression.

## Run locally
Use a local static server from this folder, for example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Install on a phone
1. Deploy this folder to a static HTTPS host (GitHub Pages, Netlify, or similar).
2. Open the deployed URL in Safari (iPhone) or Chrome (Android).
3. Use **Add to Home Screen** / **Install app**.

## Current implementation
- Responsive mobile-first interface.
- Daily missions with create/edit/delete and one-time/daily repeat options.
- +5 XP per completion and 10-completion daily cap.
- Ranks and progress.
- Activity heatmap.
- Operator profile and editable callsign.
- Skill progression by mission category.
- Achievement badges and streak tracking.
- Statistics, history, daily report.
- Local JSON export/import.
- PWA manifest and service worker for offline app shell.

## Important limitations
- Data is stored in the browser's local storage on this device. It does not sync between devices.
- The included mission suggestions and briefing/report are local fallback logic, not a connected generative AI model.
- For real AI, add a backend endpoint that securely calls an AI provider. Never put a secret API key in `app.js`.
- Rank XP thresholds are editable in `app.js`.

# FORM. — SHAPE YOURSELF (Beta 0.07)

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
- Progress lives in the browser (IndexedDB + localStorage) on this device and does not sync between devices; it is tied to the signed-in account. Only photo originals go to the cloud.
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
- Redesign (Nothing-inspired): one permanent black/white/grey theme (`style.css`, no theme switch), dot-matrix numerals, dotted progress, thin dividers, minimal radii.
- Military wording replaced with plain Russian (Миссия → Задача, Оператор → Пользователь, Позывной → Имя). Rank *indices and XP thresholds are unchanged*; display names are now Новичок … Легенда. Medal "ВЕТЕРАН" is now "ОПЫТНЫЙ" (saved data is migrated).
- 11 new monochrome geometric rank emblems (`crest()` in `app.js`), growing from one dot to a dotted orbit.
- Calendar (month grid + day panel), avatars (upload, crop, WebP) and motion are kept; all animations respect Reduce Motion.
- `figma.css` / `extras.css` merged into `style.css`; service worker cache `life-protocol-b008`.

## Beta 0.06 — FORM.
- Project renamed from LIFE PROTOCOL to **FORM. — SHAPE YOURSELF** (UI, manifest, title, splash). Storage keys `lifeProtocol` / `lifeProtocolDB` are intentionally unchanged so existing progress is kept.
- Light / dark theme with a toggle in the header; the choice is saved (`formTheme`), the system theme is used on first launch.
- Short splash animation (once per browser session, tap to skip), achievement / rank pop-ups, animated progress bars. Everything respects `prefers-reduced-motion`.
- Colour system: black / white base, one blue accent, six branch colours (skills, task categories).
- Skill tree rebuilt: 3 directions x 6 branches x 3 tiers, pan (drag) and zoom (+/-, Ctrl+wheel), branch shortcuts, detail panel with conditions and thresholds. Unlock rules and thresholds are unchanged.
- Fixes: skill-unlock toast was overwritten by the task toast; dead code in `renderGraphs`; default avatar and image cropper ignored the theme.
- Service worker cache `form-b009` (old `life-protocol-*` caches are removed automatically).

## Beta 0.07 — вход, облако для фото, анимации
- **Обязательный вход** через Google и GitHub (Supabase Auth, PKCE). Без подтверждённой сессии интерфейс приложения не показывается и не запускается; при каждом старте сессия проверяется на сервере (`getUser`), при недоступной сети используется сохранённая. Выход — в Профиле и Настройках.
- **Данные по аккаунтам:** первый вошедший на устройстве получает прежний локальный прогресс (ключи `lifeProtocol`/`lifeProtocolDB` не менялись), другие аккаунты на том же устройстве — свои отдельные хранилища.
- **Фото без лимита 8 МБ:** ни в интерфейсе, ни в коде размера нет. Оригинал уходит в приватный бакет `photos` по протоколу TUS (куски по 6 МБ, продолжение с места обрыва), с прогрессом, скоростью, отменой и повтором. Аватар (256 px) по-прежнему хранится локально; HEIC и другие форматы, которые браузер не читает, загружаются как оригинал без обрезки. Предыдущий оригинал заменяется, хранилище не растёт.
- Новые анимации: экран входа, скелетоны при запуске, рябь на кнопках, всплески при награде и новом ранге, плавные списки и модальные окна. Всё отключается при Reduce Motion.
- Кэш сервис-воркера `form-b010`.

### Настройка входа и облака (один раз)
1. Создайте проект на supabase.com.
2. **Authentication → Providers:** включите Google и GitHub. Client ID и Client Secret вставляйте только сюда (это секреты, в код и репозиторий они не попадают). В настройках OAuth-приложений Google и GitHub укажите callback `https://<project-ref>.supabase.co/auth/v1/callback`.
3. **Authentication → URL Configuration:** Site URL = адрес вашего сайта на GitHub Pages; в Redirect URLs добавьте тот же адрес (и `http://localhost:8000/` для разработки).
4. **SQL Editor:** выполните `supabase/setup.sql` (приватный бакет, доступ только владельцу, защита от переполнения: 2 ГБ на пользователя).
5. **Лимит размера файла:** задаётся только проектом. На бесплатном тарифе Supabase это 50 МБ на файл; чтобы принимать больше, перейдите на платный тариф и поднимите *Storage → Settings → Upload file size limit*. Приложение лимитов не добавляет.
6. **GitHub → Settings → Secrets and variables → Actions → Variables:** добавьте `SUPABASE_URL` и `SUPABASE_ANON_KEY` (публичный anon/publishable ключ). Workflow при деплое сам запишет их в `config.js`. Для локального запуска впишите те же значения в `config.js`.

Секреты (`client secret`, `service_role`) в клиентский код и в переменные репозитория не кладутся. Защита данных в облаке держится на политиках RLS из `setup.sql`; сама страница статическая, поэтому «закрыт» от гостей интерфейс, а не файлы сайта.

# MUSTHAVE RUN — Telegram Mini App Demo

Playable pitch demo of **MUSTHAVE RUN**, a 1-tap 8-bit pixel endless runner for **MUSTHAVE Tobacco** (Mango • Peach • Pineapple palette + GTA 6 8-bit Vice City sunset aesthetic).

## Features in This Demo
- **100% Vanilla Static Build**: HTML5 Canvas + vanilla JS + CSS, zero build step, integer-scaled `195×422` pixel canvas (`imageSmoothingEnabled = false`).
- **Start Menu**: Styled after the client reference (`= MUSTHAVE RUN =`, pink accents, big `ИГРАТЬ` & `РЕЙТИНГ` buttons, toggleable Santa hat & 8-bit SFX).
- **Subscription Gate (Demo Stub)**: `Подпишитесь на канал, чтобы играть` with `Подписаться` and `Проверить подписку` buttons.
- **Intro Cutscene**: Corgi appears from behind wagging its tail, spins 360° around in place, crouches ready, and launches into a sprint.
- **Signature Corgi Butt Wiggle**: Custom 4-frame running animation with exaggerated rump & stubby-tail wiggle, toggleable Santa hat, and paw dust particles.
- **Obstacles**:
  - Hookah silhouette (matching reference)
  - Hookah fork-poker (*шило-вилка*)
  - Burning coals pile with flickering embers & animated wavy smoke (`≈`)
- **Fruits (+1 point each)**: Pineapple, Peach, and Mango float above obstacles/arcs; jumping obstacles alone awards 0 points.
- **Daily Lives & Game Over**:
  - 5 hearts in HUD for regular players, persisted in `localStorage` with a 24-hour reset after the last daily life is spent.
  - VIP Telegram usernames (`@pnkmnmr`, `@musthave_pinkman`) get **100 lives/day**. Detected client-side from `Telegram.WebApp.initDataUnsafe.user.username` (case-insensitive, no `@`). The UI shows a compact pixel heart + `×N` counter instead of 100 hearts.
  - Game Over diorama with sleeping corgi (`Z z z`) and an empty dog bowl right in front of its nose (*«Эх, ещё чуть-чуть...»*).
  - After the daily lives are spent, `ИГРАТЬ СНОВА` is hidden and replaced by *«Вернитесь в игру через 24 часа»* + countdown.
- **Leaderboard (`РЕЙТИНГ`)**: Mock leaderboard with the current player highlighted and sorted by best score.

## Run Locally
Serve the `/workspace/musthave-run` folder with any static HTTP server:

```bash
cd /workspace/musthave-run
python3 -m http.server 8080
```
Open `http://localhost:8080` in Chrome/Firefox (enable mobile viewport `390×844` in DevTools for phone view).

### Debug Query Flags
- `?reset=1` — clears `localStorage` (lives, high score, subscription gate).
- `?lives=0..N` — overrides remaining daily lives for testing (N is 5, or 100 for VIP).
- `?tguser=<username>` — mocks a Telegram username (for VIP / lives testing).
- `?sub=1` — skips the mock subscription gate.
- `?autojump=1` — enables demo auto-jumper.

## Deploy to a Static Host
Upload the contents of `musthave-run/` as-is (no build command needed):
- **GitHub Pages**: Push folder to a repo → Settings → Pages → Deploy from branch.
- **Netlify / Vercel**: Drag-and-drop the folder or connect repo with empty build command and output dir `.`.
- **Cloudflare Pages**: Upload directory directly (`npx wrangler pages deploy .`).

Telegram Mini Apps require **HTTPS** (all three hosts provide HTTPS automatically).

## Hook Into a Telegram Bot via BotFather
1. Open `@BotFather` in Telegram.
2. Create or pick a bot (`/newbot` or `/mybots`).
3. Run `/newapp` (or Bot Settings → Menu Button → Configure Menu Button):
   - Paste your HTTPS URL (e.g. `https://musthave-run.vercel.app`).
4. Share the direct Mini App link: `https://t.me/<your_bot_username>/<app_short_name>`.

## Production Backend Seams (Out of Scope for Demo)
1. **Real Subscription Check (`js/telegram.js` → `checkSubscription`)**:
   - Set `MH_TG.CONFIG.apiBaseUrl` to your backend URL.
   - Backend validates `Telegram.WebApp.initData` HMAC-SHA256 using your Bot Token, then calls Telegram Bot API `getChatMember(chat_id="@musthave_tobacco", user_id)` and checks `status` is `member | administrator | creator`.
2. **Participants DB & Leaderboard (`submitScore` / `getLeaderboard`)**:
   - Store users (`tg_id`, `username`, `first_name`, `best_score`, `lives`, `last_reset_at`) in Postgres / Supabase / SQLite.
   - Enforce daily 5-life limit server-side so clearing browser storage cannot bypass it.
3. **Admin Rating Reset with History**:
   - Add a `seasons` table (`season_id`, `started_at`, `ended_at`, `snapshot_json`). Admin endpoint archives current top scores into `seasons` and resets active `best_score` to `0`.
4. **Referral Extra Life (+1 Life)**:
   - Launch link: `https://t.me/<bot>/<app>?startapp=ref_<referrer_tg_id>`.
   - Read `Telegram.WebApp.initDataUnsafe.start_param` on backend when a new user completes their first run / subscription check, and credit `+1` life to `<referrer_tg_id>`.

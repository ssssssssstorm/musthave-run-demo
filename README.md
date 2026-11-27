# MUSTHAVE RUN — Telegram Mini App Demo

Playable pitch demo of **MUSTHAVE RUN**, a 1-tap 8-bit pixel endless runner for **MUSTHAVE Tobacco** (Mango • Peach • Pineapple palette + GTA 6 8-bit Vice City sunset aesthetic).

## Features in This Demo
- **100% Vanilla Static Build**: HTML5 Canvas + vanilla JS + CSS, zero build step, integer-scaled `195×422` pixel canvas (`imageSmoothingEnabled = false`).
- **Start Menu**: Styled after the client reference (`= MUSTHAVE RUN =`, pink accents, big `ИГРАТЬ` & `РЕЙТИНГ` buttons, toggleable Santa hat & 8-bit SFX).
- **Subscription Gate (Demo Stub)**: `Подпишитесь на канал, чтобы играть` with `Подписаться` and `Проверить подписку` buttons.
- **Intro Cutscene**: Corgi appears from behind wagging its tail, spins 360° around in place, crouches ready, and launches into a sprint.
- **Signature Corgi Butt Wiggle**: Custom 4-frame running animation with exaggerated rump & stubby-tail wiggle, toggleable Santa hat, and paw dust particles.
- **Obstacles** (all drawn on the same 1x pixel grid, ink outline + teal glass / gold accents so they pop against the sunset):
  - Small hookah and a **BIG hookah** (72 px tall, can't be cleared by a single jump — needs a double jump). The glass flask has a pixel glare.
  - Shila-vilka: a steel fork with exactly three prongs.
  - Burning coals pile with flickering embers & animated wavy smoke (`≈`).
- **Fair, varied spacing**: gaps are drawn from short / medium / long buckets and occasionally pairs/clusters of two small obstacles. Every gap is at least the physics-derived minimum for the current speed (landing + reaction margin), clusters only appear when one jump can clear both, and the big hookah only appears after ~12 s with extra recovery room. Hit boxes are per-part (stem/flask) so empty air next to the hookah stem is safe.
- **Double jump**: a second tap / `Space` / `↑` in the air gives one extra jump per airtime, with an 8-step pixel somersault (nearest-neighbour rotated sprite) and a tiny puff. A one-time `ТАП-ТАП!` hint shows when the first big hookah arrives.
- **Speed**: starts calm (70 px/s) and eases into the original curve (105 + 2.1·t, capped at 220).
- **Music**: looping WebAudio chiptune (`js/audio.js`, "Mango Beach", 8 bars @ 118 BPM; pulse lead, triangle bass, off-beat stabs, soft drums) at low volume. Starts on the first tap, pauses when the app is hidden. Pixel note icon in the menu toggles it; the choice is saved in `localStorage` (`music`) separately from SFX (`ЗВУК`).
- **Fruits (+1 point each, × combo)**: Pineapple, Peach, and Mango float above obstacles, and also appear in obstacle-free stretches as singles, arcs and rows at jump height (a high one above the big hookah rewards the double jump); jumping obstacles alone awards 0 points.
- **Controls**: tap = jump, second tap in the air = double jump, **swipe down** (or `↓` / `S`) = duck / slide; swipe down in the air = fast fall. A press waits ~45 ms for a downward move before counting as a tap, so swipes never trigger jumps.
- **Run evolves over time** (each new thing shows a tiny one-time pixel hint, remembered in `localStorage` → `hints`):

  | Run time | Unlock |
  |---|---|
  | 0 s | **Combo**: fruits in a row build x2 (3) → x3 (6) → x4 (10) → x5 (15); HUD pill + `x3!` popup; resets on a missed fruit or a hit |
  | 12 s | Big hookah (double jump) |
  | 15 s | **MUSTHAVE tin trampoline**: run/land on it → very high bounce with a flip through a high fruit arc |
  | 20 s | **Golden fruit**: rare, +5 (× combo), sparkles |
  | 25 s | **Coal magnet** pickup: 5 s, nearby fruit flies to the corgi (HUD timer) |
  | 30 s | **Low bird**: flies just above the standing corgi's head; duck under it (or jump it). A `СМАХНИ ВНИЗ` popup with a pixel arrow appears when it approaches (every time in the first few runs). Always a solo pattern with full fair spacing |
  | 35 s | **Santa-cap shield** pickup: absorbs one hit (bubble, pop effect, ~1.3 s blink invulnerability) |
  | 40 s, then every 30–38 s | **ФРУКТОВЫЙ ДОЖДЬ!** — ~4.6 s obstacle-free stretch full of falling fruit |
  | 50 s, then every 22–32 s | **Coal smoke**: a dithered smoke patch drifts over the ground ahead for ~2.3 s; obstacles under it stay faintly visible |
- **Daily Lives & Game Over**:
  - 5 hearts in HUD for regular players, persisted in `localStorage` with a 24-hour reset after the last daily life is spent.
  - VIP Telegram usernames (`@pnkmnmr`, `@musthave_pinkman`) get **100 lives/day**. Detected client-side from `Telegram.WebApp.initDataUnsafe.user.username` (case-insensitive, no `@`). The UI shows a compact pixel heart + `×N` counter instead of 100 hearts.
  - Game Over diorama with sleeping corgi (`Z z z`) and an empty dog bowl right in front of its nose (*«Эх, ещё чуть-чуть...»*).
  - After the daily lives are spent, `ИГРАТЬ СНОВА` is hidden and replaced by *«Вернитесь в игру через 24 часа»* + countdown.
- **Leaderboard (`РЕЙТИНГ`)**: Mock leaderboard with the current player highlighted and sorted by best score.

## Online Leaderboard (`server/`)
- **API**: `https://musthave-run-api.onrender.com` — small Node service (`server/index.js`, only dependency `pg`), Render **free** web service + Render **free Postgres** (`render.yaml` Blueprint). The game stays on the static site; the API allows CORS only from `https://musthave-run.onrender.com`.
- **Auth**: every write is authenticated with Telegram WebApp `initData` (HMAC-SHA256 with `TELEGRAM_BOT_TOKEN`, secret env var on Render, never committed); `auth_date` older than 24 h is rejected.
- **Endpoints**
  - `POST /api/score` `{initData, score, runStats: {runTimeMs, fruits, golden, ...}, clientRunId}` → stores the run, updates the per-user best (`accepted`, `reason`, `best`, `rank`, `isNewBest`). Retries with the same `clientRunId` are idempotent.
  - `GET /api/leaderboard?limit=50` (optional header `X-Telegram-Init-Data`) → top 50 + caller's `me: {rank, best, inTop, total}`.
  - `GET /api/health`.
- **Anti-cheat**: score ≤ 10·seconds + 30; fruits ≤ 6·seconds + 20; fruits ≤ score ≤ 5·fruits + 20·golden; run ≤ 60 min; rejected runs are stored with a reason but never count; max runs per rolling 24 h = daily lives + 1 (5 → 6, VIP `pnkmnmr` / `musthave_pinkman` / `ttvwraithh` 100 → 101); ≥ 2.5 s between submissions per user; per-IP token buckets (20 scores/min, 40 leaderboard reads/min).
- **Schema**: `players`, `runs`, `best_scores`, `seasons`; runs and bests carry `season_id` (default 1) so seasons / resets with history can be added later.
- **Client**: score is sent on game over (queued in `localStorage` and retried if offline / server asleep); the rating screen shows a pixel spinner, live top 50 with medal colours, highlights your row and pins it at the bottom when you're outside the top; offline → local best. Outside Telegram the board is read-only with a hint.
- Local run: `cd server && npm i && DATABASE_URL=postgres://... TELEGRAM_BOT_TOKEN=... ALLOWED_ORIGINS='http://127.0.0.1:*' node index.js`, then open the game with `?api=http://127.0.0.1:10000`.

## Compatibility & support
- The game targets iOS 12+ Safari / WKWebView and Android WebView Chrome 61+ (ES2017). The Telegram SDK is loaded asynchronously with a 1.5 s timeout, so a hang on `telegram.org` no longer leaves a blank page.
- If boot fails, a pixel fallback screen ("Что-то пошло не так") is shown with a short error code and a **Перезагрузить** button instead of a blank screen.
- Client errors are POSTed to `/api/clientlog` on the API (user agent, Telegram version and platform, URL, error code / message; rate-limited, CORS `*`). To read them (requires `TELEGRAM_BOT_TOKEN`):

```bash
# from a trusted machine that has the token in the environment — do not print the token
TS=$(date +%s)
SIG=$(python3 -c "import hmac,hashlib,os,sys; print(hmac.new(os.environ['TELEGRAM_BOT_TOKEN'].encode(), ('admin:'+sys.argv[1]+':logs').encode(), hashlib.sha256).hexdigest())" "$TS")
curl -sS -H "X-Admin-Ts: $TS" -H "X-Admin-Sig: $SIG" \
  "https://musthave-run-api.onrender.com/api/clientlog?limit=50"
```

- **Mirror (live bot URL):** the Telegram menu button opens `https://ssssssssstorm.github.io/musthave-run-demo/` (same repo, GitHub Pages, deploys automatically from `main` `/`). Use this when `*.onrender.com` is frozen by a Russian ISP. Cache-busting query (`?v=`) is on JS/CSS; a `<base href="/musthave-run-demo/">` is set so relative assets resolve.

- **Leaderboard API and Russian ISPs:** the API itself still runs on Render (`https://musthave-run-api.onrender.com`) and has the same IP exposure. The client tries each API base in order with a short timeout (network / 5xx → next). First: the Netlify Functions reverse proxy `https://musthave-run-api.netlify.app` (this repo's `netlify.toml` + `netlify/functions/api-proxy.js`), so RU clients reach the API via Netlify IPs while the function talks to Render. Fallback: the Render origin. CORS allows `https://ssssssssstorm.github.io` and `https://*.netlify.app`.

- **Do not use Cloudflare Workers (`*.workers.dev`) or Cloudflare Pages as the RU path.** Since 9 June 2025 major RU ISPs (Rostelecom, Megafon, Vimpelcom, MTS, MGTS) have throttled Cloudflare traffic to ~16 KB and often reset connections (Cloudflare blog, 26 June 2025). `workers.dev` is also intermittently blocked.

- **Host reachability from Russian mobile / metro networks, late 2026 (for a production move):**
  - GitHub Pages (`github.io`) — good: 9/9 HTTPS from RU check-host nodes on 17 Nov 2026 ([htmlkin.ru measurement](https://htmlkin.ru/articles/netlify-vercel-github-pages-dostup-iz-rossii)). Best free static home for the Mini App (already in use).
  - Netlify (`netlify.app`) — good: 9/9 in the same test; `netlify.app` is not in the RKN registry. Best free option for the API proxy + optional second static mirror.
  - Vercel (`vercel.app`) — flaky: 5/9 in the same test; some Vercel IPs refuse connections from Moscow. Not a reliable primary.
  - Cloudflare Pages / `workers.dev` — avoid for RU users (16 KB throttle / resets, as above).
  - Yandex Object Storage, Timeweb, Selectel — the reliable long-term choice: Russian address space, no Western-IP filters. Object Storage can serve the static game; a small VPS or Cloud Functions should run the API (and can keep using Render Postgres via its external URL, or move the DB later).
  - **Recommended production setup:** keep the Mini App on GitHub Pages (or copy it to Yandex Object Storage / Timeweb) and put the API (or at least this proxy) on a Russian VPS (~200–400 RUB/month, Timeweb / Selectel / Beget) or Yandex Cloud. A custom domain on a Russian host is the most stable option for colleagues on mobile operators. The Render API can stay as the origin behind the proxy until the API itself is migrated.

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
- `?autojump=1` — enables the demo autopilot (jumps, double-jumps the big hookah, ducks birds, grabs fruit and pickups when safe).

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

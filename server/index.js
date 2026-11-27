// MUSTHAVE RUN online leaderboard API
// - Telegram WebApp initData validation (HMAC-SHA256, bot token from env, stale auth_date rejected)
// - POST /api/score, GET /api/leaderboard, GET /api/health, DELETE /api/admin/player/:id (signed)
// Env: TELEGRAM_BOT_TOKEN (secret), DATABASE_URL, ALLOWED_ORIGINS (comma separated), PORT
'use strict';
const http = require('http');
const crypto = require('crypto');
const { Pool } = require('pg');

const PORT = +process.env.PORT || 10000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://musthave-run.onrender.com,https://ssssssssstorm.github.io')
  .split(',').map(s => s.trim()).filter(Boolean);
const SEASON_ID = +process.env.SEASON_ID || 1;
const AUTH_MAX_AGE_S = 24 * 3600;

// keep in sync with js/storage.js
const VIP_USERNAMES = ['pnkmnmr', 'musthave_pinkman', 'ttvwraithh', 'andreisibiriakov', 've1er8'];
const DEFAULT_LIVES = 5;
const VIP_LIVES = 100;

// Anti-cheat limits (see README "Online leaderboard")
const LIMITS = {
  maxScore: 100000,
  maxRunSec: 3600,
  scorePerSec: 10,      // combos x5 + fruit rain peak around ~6/s on average over long runs
  scoreSlack: 30,
  fruitsPerSec: 6,
  fruitSlack: 20,
  maxPointsPerFruit: 25, // golden (5) at x5 combo
  dailySlack: 1,         // runs per rolling 24h = daily lives + slack
  minSubmitGapMs: 2500,  // per user
};

if (!BOT_TOKEN) console.warn('[warn] TELEGRAM_BOT_TOKEN is not set: all authenticated requests will be rejected');
if (!process.env.DATABASE_URL) console.warn('[warn] DATABASE_URL is not set');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !/localhost|127\.0\.0\.1|@dpg-[^.]+\/|@dpg-[^.:]+:/.test(process.env.DATABASE_URL)
    ? { rejectUnauthorized: false } : false,
  max: 4,
  idleTimeoutMillis: 30000,
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS seasons (
  id INT PRIMARY KEY,
  name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);
INSERT INTO seasons (id, name) VALUES (1, 'Сезон #1') ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS players (
  tg_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  photo_url TEXT,
  is_vip BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS runs (
  id BIGSERIAL PRIMARY KEY,
  season_id INT NOT NULL DEFAULT 1 REFERENCES seasons(id),
  tg_id BIGINT NOT NULL REFERENCES players(tg_id) ON DELETE CASCADE,
  client_run_id TEXT,
  score INT NOT NULL,
  run_time_ms INT NOT NULL,
  fruits INT,
  stats JSONB,
  accepted BOOLEAN NOT NULL,
  reject_reason TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS runs_user_time ON runs (tg_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS runs_user_client_id ON runs (tg_id, client_run_id) WHERE client_run_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS best_scores (
  season_id INT NOT NULL DEFAULT 1 REFERENCES seasons(id),
  tg_id BIGINT NOT NULL REFERENCES players(tg_id) ON DELETE CASCADE,
  best_score INT NOT NULL,
  run_id BIGINT,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  runs_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (season_id, tg_id)
);
CREATE INDEX IF NOT EXISTS best_rank ON best_scores (season_id, best_score DESC, achieved_at ASC);
CREATE TABLE IF NOT EXISTS client_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash TEXT,
  ua TEXT,
  tg_version TEXT,
  tg_platform TEXT,
  href TEXT,
  code TEXT,
  message TEXT,
  stack TEXT
);
CREATE INDEX IF NOT EXISTS client_logs_created ON client_logs (created_at DESC);
`;

// ---------------- Telegram initData ----------------
const SECRET_KEY = BOT_TOKEN ? crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest() : null;

function validateInitData(initData) {
  if (!SECRET_KEY) return { ok: false, error: 'server_not_configured' };
  if (typeof initData !== 'string' || !initData || initData.length > 4096) return { ok: false, error: 'no_init_data' };
  let params;
  try { params = new URLSearchParams(initData); } catch (_) { return { ok: false, error: 'bad_init_data' }; }
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return { ok: false, error: 'bad_hash' };
  const pairs = [];
  for (const [k, v] of params.entries()) if (k !== 'hash') pairs.push(k + '=' + v);
  pairs.sort();
  const calc = crypto.createHmac('sha256', SECRET_KEY).update(pairs.join('\n')).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== calc.length || !crypto.timingSafeEqual(given, calc)) return { ok: false, error: 'bad_signature' };
  const authDate = +params.get('auth_date');
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > AUTH_MAX_AGE_S) return { ok: false, error: 'stale_auth' };
  if (authDate - now > 300) return { ok: false, error: 'future_auth' };
  let user;
  try { user = JSON.parse(params.get('user') || 'null'); } catch (_) { user = null; }
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return { ok: false, error: 'no_user' };
  const clip = (s, n) => (typeof s === 'string' ? s.slice(0, n) : null);
  const photo = clip(user.photo_url, 512);
  return {
    ok: true,
    user: {
      id: user.id,
      username: clip(user.username, 64),
      first_name: clip(user.first_name, 64),
      last_name: clip(user.last_name, 64),
      photo_url: photo && /^https:\/\//.test(photo) ? photo : null,
    },
  };
}

function isVip(username) {
  return !!username && VIP_USERNAMES.includes(String(username).toLowerCase().replace(/^@/, ''));
}

// ---------------- rate limiting (in memory, single instance) ----------------
const buckets = new Map();
function rateLimit(key, capacity, refillPerSec) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) { b = { tokens: capacity, t: now }; buckets.set(key, b); }
  b.tokens = Math.min(capacity, b.tokens + ((now - b.t) / 1000) * refillPerSec);
  b.t = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}
setInterval(() => {
  const cut = Date.now() - 10 * 60 * 1000;
  for (const [k, b] of buckets) if (b.t < cut) buckets.delete(k);
}, 60 * 1000).unref();
const lastSubmit = new Map();

// ---------------- helpers ----------------
function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  return (xf ? String(xf).split(',')[0] : req.socket.remoteAddress || '').trim();
}
function ipHash(ip) {
  return crypto.createHash('sha256').update('mh-ip:' + ip + ':' + (BOT_TOKEN ? BOT_TOKEN.slice(-6) : '')).digest('hex').slice(0, 16);
}
function originAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.some(o => o === origin || (o.endsWith(':*') && origin.startsWith(o.slice(0, -1)) && /^\d+$/.test(origin.slice(o.length - 1))))) {
    return true;
  }
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:') return false;
    if (u.hostname === 'ssssssssstorm.github.io') return true;
    if (u.hostname === 'netlify.app' || u.hostname.endsWith('.netlify.app')) return true;
    return false;
  } catch (_) {
    return false;
  }
}
function corsHeaders(req) {
  const origin = req.headers.origin;
  const allowed = originAllowed(origin);
  if (allowed) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
      'Access-Control-Max-Age': '600',
    };
  }
  return { 'Vary': 'Origin' };
}
function send(req, res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }, corsHeaders(req)));
  res.end(data);
}
function readJson(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('too_large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (_) { reject(Object.assign(new Error('bad_json'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
function displayName(r) {
  if (r.username) return '@' + r.username;
  const n = [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
  return n || 'Игрок';
}
const intIn = (v, lo, hi) => Number.isFinite(+v) && Math.floor(+v) === +v && +v >= lo && +v <= hi;

function cleanStats(rs) {
  const out = {};
  if (!rs || typeof rs !== 'object') return out;
  const keys = ['runTimeMs', 'fruits', 'golden', 'maxMult', 'bounces', 'birdsPassed', 'magnets', 'shields', 'shieldBreaks', 'rains', 'smokes', 'doubles', 'comboBreaks', 'missed'];
  for (const k of keys) if (Number.isFinite(+rs[k])) out[k] = Math.max(0, Math.min(1e7, Math.floor(+rs[k])));
  if (typeof rs.v === 'string') out.v = rs.v.slice(0, 16);
  return out;
}

// plausibility checks: returns null when plausible, otherwise a reason code
function plausibility(score, runTimeMs, fruits, golden) {
  const sec = runTimeMs / 1000;
  if (!intIn(score, 0, LIMITS.maxScore)) return 'bad_score';
  if (!intIn(runTimeMs, 0, LIMITS.maxRunSec * 1000)) return 'bad_run_time';
  if (!intIn(fruits, 0, 1e6) || !intIn(golden, 0, 1e6) || golden > fruits) return 'bad_fruits';
  if (score > LIMITS.scorePerSec * sec + LIMITS.scoreSlack) return 'score_rate';
  if (fruits > LIMITS.fruitsPerSec * sec + LIMITS.fruitSlack) return 'fruit_rate';
  if (score < fruits) return 'score_below_fruits';
  if (score > (fruits - golden) * 5 + golden * LIMITS.maxPointsPerFruit) return 'score_vs_fruits';
  return null;
}

async function upsertPlayer(client, u) {
  await client.query(
    `INSERT INTO players (tg_id, username, first_name, last_name, photo_url, is_vip)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tg_id) DO UPDATE SET username = EXCLUDED.username, first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name, photo_url = COALESCE(EXCLUDED.photo_url, players.photo_url),
       is_vip = EXCLUDED.is_vip, updated_at = now()`,
    [u.id, u.username, u.first_name, u.last_name, u.photo_url, isVip(u.username)]
  );
}

async function rankOf(client, tgId) {
  const r = await client.query(
    `SELECT b.best_score, b.achieved_at,
       (SELECT COUNT(*) FROM best_scores x WHERE x.season_id = b.season_id AND (x.best_score > b.best_score
          OR (x.best_score = b.best_score AND (x.achieved_at < b.achieved_at OR (x.achieved_at = b.achieved_at AND x.tg_id < b.tg_id))))) + 1 AS rank
     FROM best_scores b WHERE b.season_id = $1 AND b.tg_id = $2`,
    [SEASON_ID, tgId]
  );
  if (!r.rows.length) return null;
  return { rank: +r.rows[0].rank, best: r.rows[0].best_score };
}

// ---------------- handlers ----------------
async function handleScore(req, res) {
  const ip = clientIp(req);
  if (!rateLimit('ip-score:' + ip, 20, 20 / 60)) return send(req, res, 429, { ok: false, error: 'rate_limited' });
  const body = await readJson(req);
  const auth = validateInitData(body.initData);
  if (!auth.ok) return send(req, res, 401, { ok: false, error: auth.error });
  const u = auth.user;

  const rs = cleanStats(body.runStats);
  const score = +body.score;
  const runTimeMs = rs.runTimeMs !== undefined ? rs.runTimeMs : -1;
  const fruits = rs.fruits !== undefined ? rs.fruits : -1;
  const golden = rs.golden || 0;
  const clientRunId = typeof body.clientRunId === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(body.clientRunId) ? body.clientRunId : null;
  let reason = plausibility(score, runTimeMs, fruits, golden);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await upsertPlayer(client, u);
    if (clientRunId) {
      const dup = await client.query('SELECT id, accepted, reject_reason FROM runs WHERE tg_id = $1 AND client_run_id = $2', [u.id, clientRunId]);
      if (dup.rows.length) {
        await client.query('COMMIT');
        const rk = await rankOf(client, u.id);
        return send(req, res, 200, { ok: true, duplicate: true, accepted: dup.rows[0].accepted, reason: dup.rows[0].reject_reason || undefined, best: rk ? rk.best : 0, rank: rk ? rk.rank : null });
      }
    }
    const now = Date.now();
    if (now - (lastSubmit.get(u.id) || 0) < LIMITS.minSubmitGapMs) {
      await client.query('ROLLBACK');
      return send(req, res, 429, { ok: false, error: 'too_fast' });
    }
    lastSubmit.set(u.id, now);
    const maxRuns = (isVip(u.username) ? VIP_LIVES : DEFAULT_LIVES) + LIMITS.dailySlack;
    const cnt = await client.query(`SELECT COUNT(*)::int AS n FROM runs WHERE tg_id = $1 AND created_at > now() - interval '24 hours'`, [u.id]);
    if (cnt.rows[0].n >= maxRuns) {
      await client.query('ROLLBACK');
      return send(req, res, 429, { ok: false, error: 'daily_cap', maxRuns });
    }
    const safeScore = intIn(score, 0, 2147483647) ? score : 0;
    const safeTime = intIn(runTimeMs, 0, 2147483647) ? runTimeMs : 0;
    const ins = await client.query(
      `INSERT INTO runs (season_id, tg_id, client_run_id, score, run_time_ms, fruits, stats, accepted, reject_reason, ip_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [SEASON_ID, u.id, clientRunId, safeScore, safeTime, fruits >= 0 ? fruits : null, rs, !reason, reason, ipHash(ip)]
    );
    let isNewBest = false;
    if (!reason) {
      const up = await client.query(
        `INSERT INTO best_scores (season_id, tg_id, best_score, run_id, achieved_at, runs_count)
         VALUES ($1, $2, $3, $4, now(), 1)
         ON CONFLICT (season_id, tg_id) DO UPDATE SET
           runs_count = best_scores.runs_count + 1,
           best_score = GREATEST(best_scores.best_score, EXCLUDED.best_score),
           run_id = CASE WHEN EXCLUDED.best_score > best_scores.best_score THEN EXCLUDED.run_id ELSE best_scores.run_id END,
           achieved_at = CASE WHEN EXCLUDED.best_score > best_scores.best_score THEN now() ELSE best_scores.achieved_at END
         RETURNING best_score, run_id`,
        [SEASON_ID, u.id, safeScore, ins.rows[0].id]
      );
      isNewBest = String(up.rows[0].run_id) === String(ins.rows[0].id);
    }
    await client.query('COMMIT');
    const rk = await rankOf(client, u.id);
    if (reason) console.log(`[score] rejected user=${u.id} reason=${reason} score=${safeScore} t=${safeTime}`);
    return send(req, res, 200, { ok: true, accepted: !reason, reason: reason || undefined, isNewBest, best: rk ? rk.best : 0, rank: rk ? rk.rank : null });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

async function handleLeaderboard(req, res, url) {
  const ip = clientIp(req);
  if (!rateLimit('ip-lb:' + ip, 40, 40 / 60)) return send(req, res, 429, { ok: false, error: 'rate_limited' });
  const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
  const initData = req.headers['x-telegram-init-data'];
  let me = null;
  let authError = null;
  let meId = null;
  if (initData) {
    const auth = validateInitData(String(initData));
    if (auth.ok) meId = auth.user.id;
    else authError = auth.error;
  }
  const top = await pool.query(
    `SELECT b.tg_id, b.best_score, p.username, p.first_name, p.last_name, p.photo_url
     FROM best_scores b JOIN players p ON p.tg_id = b.tg_id
     WHERE b.season_id = $1
     ORDER BY b.best_score DESC, b.achieved_at ASC, b.tg_id ASC LIMIT $2`,
    [SEASON_ID, limit]
  );
  const total = await pool.query('SELECT COUNT(*)::int AS n FROM best_scores WHERE season_id = $1', [SEASON_ID]);
  const rows = top.rows.map((r, i) => ({
    rank: i + 1,
    name: displayName(r),
    username: r.username || null,
    firstName: r.first_name || null,
    photo: r.photo_url || null,
    score: r.best_score,
    isMe: meId !== null && String(r.tg_id) === String(meId),
  }));
  if (meId !== null) {
    const rk = await rankOf(pool, meId);
    if (rk) {
      const p = await pool.query('SELECT username, first_name, last_name, photo_url FROM players WHERE tg_id = $1', [meId]);
      me = { rank: rk.rank, best: rk.best, name: displayName(p.rows[0] || {}), inTop: rk.rank <= rows.length, total: total.rows[0].n };
    } else {
      me = { rank: null, best: 0, inTop: false, total: total.rows[0].n };
    }
  }
  return send(req, res, 200, { ok: true, season: SEASON_ID, total: total.rows[0].n, top: rows, me, authError: authError || undefined });
}

function checkAdmin(req, action) {
  if (!BOT_TOKEN) return false;
  const ts = +req.headers['x-admin-ts'];
  const sig = String(req.headers['x-admin-sig'] || '');
  if (!ts || Math.abs(Date.now() / 1000 - ts) > 300 || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const calc = crypto.createHmac('sha256', BOT_TOKEN).update('admin:' + ts + ':' + action).digest();
  try { return crypto.timingSafeEqual(calc, Buffer.from(sig, 'hex')); } catch (e) { return false; }
}

function sendOpenCors(req, res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data, X-Admin-Ts, X-Admin-Sig',
  });
  res.end(data);
}

async function handleClientLog(req, res) {
  const ip = clientIp(req);
  if (!rateLimit('ip-clog:' + ip, 8, 8 / 60)) return sendOpenCors(req, res, 429, { ok: false, error: 'rate_limited' });
  let body;
  try { body = await readJson(req, 8 * 1024); } catch (e) { return sendOpenCors(req, res, 400, { ok: false }); }
  const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const row = {
    ua: clip(body.ua, 400),
    tg_version: clip(body.tgVersion, 32),
    tg_platform: clip(body.tgPlatform, 32),
    href: clip(body.href, 300),
    code: clip(body.code, 32) || 'JS',
    message: clip(body.message, 1500),
    stack: clip(body.stack, 2000),
  };
  await pool.query(
    `INSERT INTO client_logs (ip_hash, ua, tg_version, tg_platform, href, code, message, stack)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [ipHash(ip), row.ua, row.tg_version, row.tg_platform, row.href, row.code, row.message, row.stack]
  );
  console.log('[clientlog]', row.code, row.tg_platform, row.message.slice(0, 80));
  return sendOpenCors(req, res, 200, { ok: true });
}

async function handleClientLogList(req, res, url) {
  if (!checkAdmin(req, 'logs')) return send(req, res, 403, { ok: false });
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
  const r = await pool.query(
    `SELECT id, created_at, code, message, ua, tg_version, tg_platform, href, ip_hash
     FROM client_logs ORDER BY id DESC LIMIT $1`,
    [limit]
  );
  return send(req, res, 200, { ok: true, logs: r.rows });
}

// Admin delete (for removing test rows). Signed with the bot token: sig = HMAC_SHA256(token, "admin:" + ts + ":" + id)
async function handleAdminDelete(req, res, id) {
  if (!checkAdmin(req, id)) return send(req, res, 403, { ok: false });
  const r1 = await pool.query('DELETE FROM runs WHERE tg_id = $1', [id]);
  const r2 = await pool.query('DELETE FROM best_scores WHERE tg_id = $1', [id]);
  const r3 = await pool.query('DELETE FROM players WHERE tg_id = $1', [id]);
  return send(req, res, 200, { ok: true, deleted: { runs: r1.rowCount, best: r2.rowCount, players: r3.rowCount } });
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch (_) { return send(req, res, 400, { ok: false }); }
  try {
    if (req.method === 'OPTIONS') {
      if (url.pathname === '/api/clientlog') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data, X-Admin-Ts, X-Admin-Sig',
          'Access-Control-Max-Age': '600',
        });
      } else {
        res.writeHead(204, corsHeaders(req));
      }
      return res.end();
    }
    if (url.pathname === '/api/health' || url.pathname === '/') {
      let db = false;
      try { await pool.query('SELECT 1'); db = true; } catch (_) {}
      return send(req, res, db ? 200 : 503, { ok: db, service: 'musthave-run-api', season: SEASON_ID, db });
    }
    if (url.pathname === '/api/score' && req.method === 'POST') return await handleScore(req, res);
    if (url.pathname === '/api/leaderboard' && req.method === 'GET') return await handleLeaderboard(req, res, url);
    if (url.pathname === '/api/clientlog' && req.method === 'POST') return await handleClientLog(req, res);
    if (url.pathname === '/api/clientlog' && req.method === 'GET') return await handleClientLogList(req, res, url);
    const m = url.pathname.match(/^\/api\/admin\/player\/(\d{1,20})$/);
    if (m && req.method === 'DELETE') return await handleAdminDelete(req, res, m[1]);
    return send(req, res, 404, { ok: false, error: 'not_found' });
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error('[error]', e && e.message);
    if (!res.headersSent) send(req, res, status, { ok: false, error: status === 500 ? 'server_error' : e.message });
  }
});

async function migrate() {
  for (let i = 0; i < 10; i++) {
    try { await pool.query(SCHEMA); console.log('[db] schema ready'); return; } catch (e) {
      console.error('[db] migrate failed, retrying:', e.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

if (require.main === module) {
  migrate().finally(() => server.listen(PORT, () => {
    console.log('[api] listening on', PORT, 'origins', ALLOWED_ORIGINS.join(','));
    try {
      require('./set-menu-button').syncMenuButton().catch((e) => console.error('[menu] failed', e && e.message));
    } catch (e) {
      console.error('[menu] skipped', e && e.message);
    }
    if (process.env.PROXY_PROBE === '1') {
      require('./proxy-e2e').runProxyE2E().catch((e) => console.error('[proxy-e2e] fail', e && e.message));
    }
  }));
}
module.exports = { validateInitData, plausibility, server, migrate, pool, LIMITS };

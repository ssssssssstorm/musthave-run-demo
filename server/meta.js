// Shared constants, settings, VIP/admin lookups, season, schema extras.
'use strict';

const SEED_VIPS = ['pnkmnmr', 'musthave_pinkman', 'ttvwraithh', 'andreisibiriakov', 've1er8'];
const ADMIN_USERNAMES = ['ttvwraithh', 'pnkmnmr', 'musthave_pinkman'];
const DEFAULT_LIVES = 5;
const VIP_LIVES = 100;
const REF_DAILY_CAP = 10;
const SUB_CACHE_MS = 10 * 60 * 1000;
const CHANNEL = {
  username: 'musthavetobacco',
  url: 'https://t.me/musthavetobacco',
  chatId: '@musthavetobacco',
};
const BOT_USERNAME = 'tetsbot9145_bot';

const SCHEMA_EXTRA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO settings (key, value) VALUES ('gate_enabled', 'true') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('current_season', '1') ON CONFLICT (key) DO NOTHING;
CREATE TABLE IF NOT EXISTS vip_usernames (
  username TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO vip_usernames (username) VALUES
  ('pnkmnmr'), ('musthave_pinkman'), ('ttvwraithh'), ('andreisibiriakov'), ('ve1er8')
  ON CONFLICT (username) DO NOTHING;
ALTER TABLE players ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE players ADD COLUMN IF NOT EXISTS sub_status TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS sub_checked_at TIMESTAMPTZ;
ALTER TABLE players ADD COLUMN IF NOT EXISTS invited_by BIGINT;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS note TEXT;
CREATE TABLE IF NOT EXISTS referrals (
  invitee_tg_id BIGINT PRIMARY KEY REFERENCES players(tg_id) ON DELETE CASCADE,
  inviter_tg_id BIGINT NOT NULL REFERENCES players(tg_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  qualified BOOLEAN NOT NULL DEFAULT false,
  qualified_at TIMESTAMPTZ,
  CONSTRAINT referrals_no_self CHECK (invitee_tg_id <> inviter_tg_id)
);
CREATE INDEX IF NOT EXISTS referrals_inviter ON referrals (inviter_tg_id);
CREATE TABLE IF NOT EXISTS life_grants (
  id BIGSERIAL PRIMARY KEY,
  tg_id BIGINT NOT NULL REFERENCES players(tg_id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  amount INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  meta JSONB
);
CREATE INDEX IF NOT EXISTS life_grants_user ON life_grants (tg_id, created_at DESC);
CREATE TABLE IF NOT EXISTS bot_users (
  tg_id BIGINT PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  username TEXT,
  first_name TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_start_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  start_payload TEXT
);
CREATE TABLE IF NOT EXISTS admin_audit (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT,
  action TEXT,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_created ON admin_audit (created_at DESC);
UPDATE players SET is_vip = true
  WHERE lower(regexp_replace(coalesce(username, ''), '^@', '')) IN
    (SELECT username FROM vip_usernames);
`;

function normUser(raw) {
  return String(raw || '').trim().replace(/^@+/, '').toLowerCase();
}

function isAdminUsername(username) {
  return ADMIN_USERNAMES.indexOf(normUser(username)) !== -1;
}

function createMeta(pool) {
  let vipCache = { t: 0, set: new Set(SEED_VIPS) };
  let seasonCache = { t: 0, id: 1 };
  let settingsCache = { t: 0, map: {} };

  async function vipSet() {
    const now = Date.now();
    if (now - vipCache.t < 15000 && vipCache.set.size) return vipCache.set;
    try {
      const r = await pool.query('SELECT username FROM vip_usernames');
      const s = new Set(SEED_VIPS);
      for (const row of r.rows) s.add(normUser(row.username));
      vipCache = { t: now, set: s };
    } catch (_) {}
    return vipCache.set;
  }

  async function isVipUsername(username) {
    if (!username) return false;
    const set = await vipSet();
    return set.has(normUser(username));
  }

  async function isVipUser(user) {
    if (!user) return false;
    if (await isVipUsername(user.username)) return true;
    if (user.is_vip || user.isVip) return true;
    return false;
  }

  async function getSetting(key, fallback) {
    const now = Date.now();
    if (now - settingsCache.t > 5000) {
      try {
        const r = await pool.query('SELECT key, value FROM settings');
        const map = {};
        for (const row of r.rows) map[row.key] = row.value;
        settingsCache = { t: now, map };
      } catch (_) {}
    }
    if (Object.prototype.hasOwnProperty.call(settingsCache.map, key)) return settingsCache.map[key];
    return fallback;
  }

  async function setSetting(key, value) {
    await pool.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, String(value)]
    );
    settingsCache.t = 0;
    if (key === 'current_season') seasonCache.t = 0;
  }

  async function currentSeason() {
    const now = Date.now();
    if (now - seasonCache.t < 5000 && seasonCache.id) return seasonCache.id;
    let id = +process.env.SEASON_ID || 1;
    try {
      const v = await getSetting('current_season', String(id));
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n > 0) id = n;
    } catch (_) {}
    seasonCache = { t: now, id };
    return id;
  }

  function invalidate() {
    vipCache.t = 0;
    seasonCache.t = 0;
    settingsCache.t = 0;
  }

  async function audit(actor, action, detail) {
    try {
      await pool.query(
        'INSERT INTO admin_audit (actor, action, detail) VALUES ($1, $2, $3)',
        [String(actor || '').slice(0, 80), String(action || '').slice(0, 64), detail || null]
      );
    } catch (e) {
      console.error('[audit]', e && e.message);
    }
  }

  return {
    vipSet,
    isVipUsername,
    isVipUser,
    getSetting,
    setSetting,
    currentSeason,
    invalidate,
    audit,
  };
}

module.exports = {
  SEED_VIPS,
  ADMIN_USERNAMES,
  DEFAULT_LIVES,
  VIP_LIVES,
  REF_DAILY_CAP,
  SUB_CACHE_MS,
  CHANNEL,
  BOT_USERNAME,
  SCHEMA_EXTRA,
  normUser,
  isAdminUsername,
  createMeta,
};

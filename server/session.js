// Player session: upsert, referral qualification, pending life grants.
'use strict';

const { REF_DAILY_CAP, BOT_USERNAME, DEFAULT_LIVES, VIP_LIVES } = require('./meta');

function parseRef(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const m = String(raw).trim().match(/^ref_(\d{1,20})$/);
  if (!m) return null;
  const id = m[1];
  // Must fit in a signed BIGINT and be a safe integer for JS number OR keep as string
  if (!/^[1-9]\d{0,18}$/.test(id)) return null;
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

function createSession(pool, meta, gate) {
  async function upsertPlayer(client, u, vip) {
    const isVip = vip == null ? await meta.isVipUsername(u.username) : !!vip;
    const r = await client.query(
      `INSERT INTO players (tg_id, username, first_name, last_name, photo_url, is_vip)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tg_id) DO UPDATE SET
         username = COALESCE(EXCLUDED.username, players.username),
         first_name = COALESCE(EXCLUDED.first_name, players.first_name),
         last_name = COALESCE(EXCLUDED.last_name, players.last_name),
         photo_url = COALESCE(EXCLUDED.photo_url, players.photo_url),
         is_vip = players.is_vip OR EXCLUDED.is_vip,
         updated_at = now()
       RETURNING is_vip, banned, (xmax = 0) AS inserted, created_at, invited_by`,
      [u.id, u.username, u.first_name, u.last_name, u.photo_url, isVip]
    );
    return r.rows[0];
  }

  async function livesCutoff(client, tgId) {
    const epoch = parseInt(await meta.getSetting('reset_epoch', '0'), 10) || 0;
    const resetAt = await meta.getSetting('reset_at', '');
    let playerAt = null;
    if (tgId) {
      try {
        const r = await client.query('SELECT lives_reset_at FROM players WHERE tg_id = $1', [tgId]);
        playerAt = r.rows[0] && r.rows[0].lives_reset_at;
      } catch (_) {}
    }
    let ts = 0;
    if (resetAt) {
      const d = Date.parse(resetAt);
      if (Number.isFinite(d)) ts = d;
    }
    if (playerAt) {
      const d = new Date(playerAt).getTime();
      if (Number.isFinite(d) && d > ts) ts = d;
    }
    return {
      epoch,
      livesResetAt: ts ? new Date(ts).toISOString() : null,
      cutoff: ts ? new Date(ts) : null,
    };
  }

  function dailyWindow(params, cutoff) {
    if (cutoff) {
      return {
        sql: "created_at > now() - interval '24 hours' AND created_at > $" + (params.length + 1) + '::timestamptz',
        params: params.concat([cutoff.toISOString()]),
      };
    }
    return { sql: "created_at > now() - interval '24 hours'", params: params };
  }

  async function recordBotStart(msg, payload) {
    const from = msg.from || {};
    const chatId = msg.chat && msg.chat.id;
    const tgId = from.id || chatId;
    if (!tgId || !chatId) return;
    await pool.query(
      `INSERT INTO bot_users (tg_id, chat_id, username, first_name, started_at, last_start_at, start_payload)
       VALUES ($1, $2, $3, $4, now(), now(), $5)
       ON CONFLICT (tg_id) DO UPDATE SET
         chat_id = EXCLUDED.chat_id,
         username = COALESCE(EXCLUDED.username, bot_users.username),
         first_name = COALESCE(EXCLUDED.first_name, bot_users.first_name),
         last_start_at = now(),
         start_payload = CASE
           WHEN bot_users.start_payload IS NULL OR bot_users.start_payload = '' THEN EXCLUDED.start_payload
           ELSE bot_users.start_payload
         END`,
      [tgId, chatId, from.username || null, from.first_name || null, payload || null]
    );
  }

  async function resolveStartParam(userId, startParam) {
    let raw = startParam || '';
    if (!parseRef(raw)) {
      try {
        const r = await pool.query('SELECT start_payload FROM bot_users WHERE tg_id = $1', [userId]);
        if (r.rows[0] && r.rows[0].start_payload) raw = r.rows[0].start_payload;
      } catch (_) {}
    }
    return parseRef(raw);
  }

  async function maybeQualifyReferral(client, user, row, inviterId, subOk) {
    if (!inviterId || inviterId === user.id) return { ok: false, reason: 'no_or_self' };
    if (!subOk) return { ok: false, reason: 'gate' };
    // Invitee must be new: first insert, or no prior runs and no prior referral.
    const runs = await client.query('SELECT COUNT(*)::int AS n FROM runs WHERE tg_id = $1', [user.id]);
    if (runs.rows[0].n > 0) return { ok: false, reason: 'not_new' };
    const existing = await client.query('SELECT invitee_tg_id, qualified FROM referrals WHERE invitee_tg_id = $1', [user.id]);
    if (existing.rows.length && existing.rows[0].qualified) return { ok: false, reason: 'already' };

    const inviter = await client.query('SELECT tg_id, banned FROM players WHERE tg_id = $1', [inviterId]);
    // Inviter may not be in players yet — still allow if they /start-ed, else insert a stub? Require existing player or bot_user.
    if (!inviter.rows.length) {
      const bu = await client.query('SELECT tg_id FROM bot_users WHERE tg_id = $1', [inviterId]);
      if (!bu.rows.length) return { ok: false, reason: 'unknown_inviter' };
      await client.query(
        `INSERT INTO players (tg_id, is_vip) VALUES ($1, false) ON CONFLICT (tg_id) DO NOTHING`,
        [inviterId]
      );
    } else if (inviter.rows[0].banned) {
      return { ok: false, reason: 'inviter_banned' };
    }

    if (!existing.rows.length) {
      try {
        await client.query(
          `INSERT INTO referrals (invitee_tg_id, inviter_tg_id, qualified, qualified_at)
           VALUES ($1, $2, true, now())`,
          [user.id, inviterId]
        );
      } catch (e) {
        // unique or self-ref
        return { ok: false, reason: 'dup' };
      }
    } else {
      await client.query(
        `UPDATE referrals SET qualified = true, qualified_at = now()
         WHERE invitee_tg_id = $1 AND qualified = false`,
        [user.id]
      );
    }
    await client.query('UPDATE players SET invited_by = COALESCE(invited_by, $2) WHERE tg_id = $1', [user.id, inviterId]);

    const invCut = await livesCutoff(client, inviterId);
    const win = dailyWindow([inviterId], invCut.cutoff);
    const today = await client.query(
      `SELECT COALESCE(SUM(amount), 0)::int AS n FROM life_grants
       WHERE tg_id = $1 AND kind = 'referral' AND ` + win.sql,
      win.params
    );
    if ((today.rows[0].n || 0) >= REF_DAILY_CAP) {
      return { ok: true, credited: false, reason: 'daily_cap', inviterId };
    }
    await client.query(
      `INSERT INTO life_grants (tg_id, kind, amount, meta) VALUES ($1, 'referral', 1, $2)`,
      [inviterId, JSON.stringify({ invitee: user.id })]
    );
    return { ok: true, credited: true, inviterId };
  }

  async function claimGrants(client, tgId, cutoff) {
    const params = [tgId];
    let sql = `UPDATE life_grants SET claimed_at = now()
       WHERE tg_id = $1 AND claimed_at IS NULL`;
    if (cutoff) {
      params.push(cutoff.toISOString());
      sql += ' AND created_at > $2::timestamptz';
    }
    sql += ' RETURNING id, kind, amount';
    const r = await client.query(sql, params);
    let pending = 0;
    const kinds = {};
    for (const row of r.rows) {
      pending += row.amount;
      kinds[row.kind] = (kinds[row.kind] || 0) + row.amount;
    }
    return { pending, kinds };
  }

  async function referralStats(client, tgId) {
    const r = await client.query(
      `SELECT COUNT(*) FILTER (WHERE qualified)::int AS invited,
              COUNT(*)::int AS total
       FROM referrals WHERE inviter_tg_id = $1`,
      [tgId]
    );
    return { invited: r.rows[0].invited || 0, total: r.rows[0].total || 0 };
  }

  async function grantsLast24h(client, tgId, cutoff) {
    const win = dailyWindow([tgId], cutoff);
    const r = await client.query(
      `SELECT COALESCE(SUM(amount), 0)::int AS n FROM life_grants
       WHERE tg_id = $1 AND ` + win.sql,
      win.params
    );
    return r.rows[0].n || 0;
  }

  async function handleSession(req, res, ctx) {
    const { readJson, send, validateInitData, rateLimit, clientIp } = ctx;
    const ip = clientIp(req);
    if (!rateLimit('ip-session:' + ip, 30, 30 / 60)) return send(req, res, 429, { ok: false, error: 'rate_limited' });
    const body = await readJson(req);
    const auth = validateInitData(body.initData);
    if (!auth.ok) return send(req, res, 401, { ok: false, error: auth.error });
    const u = auth.user;
    const startParam = typeof body.startParam === 'string' ? body.startParam.slice(0, 64) : '';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = await upsertPlayer(client, u);
      if (row.banned) {
        await client.query('COMMIT');
        return send(req, res, 403, { ok: false, error: 'banned' });
      }
      const sub = await gate.checkUser(u, { force: !!body.forceSub, client: client });
      const subOk = !!(sub.subscribed || sub.bypass || sub.inactive || !sub.required);
      const inviterId = await resolveStartParam(u.id, startParam);
      const ref = await maybeQualifyReferral(client, u, row, inviterId, subOk);
      const cut = await livesCutoff(client, u.id);
      const claimed = await claimGrants(client, u.id, cut.cutoff);
      const stats = await referralStats(client, u.id);
      await client.query('COMMIT');
      const vip = !!(row.is_vip) || (await meta.isVipUsername(u.username));
      return send(req, res, 200, {
        ok: true,
        vip,
        resetEpoch: cut.epoch,
        livesResetAt: cut.livesResetAt,
        admin: require('./meta').isAdminUsername(u.username),
        banned: false,
        gate: {
          required: !!sub.required && !sub.bypass && !sub.inactive && sub.gate && sub.gate.active,
          subscribed: !!sub.subscribed,
          open: !!sub.open,
          bypass: sub.bypass || undefined,
          inactive: sub.inactive || undefined,
          flag: sub.flag || undefined,
          channel: require('./meta').CHANNEL.username,
          channelUrl: require('./meta').CHANNEL.url,
        },
        lives: {
          pending: claimed.pending,
          kinds: claimed.kinds,
        },
        referral: {
          invited: stats.invited,
          link: 'https://t.me/' + BOT_USERNAME + '?startapp=ref_' + u.id,
          applied: ref && ref.ok && ref.credited ? true : undefined,
        },
        maxLives: vip ? VIP_LIVES : DEFAULT_LIVES,
      });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw e;
    } finally {
      client.release();
    }
  }

  async function handleSubCheck(req, res, ctx) {
    const { readJson, send, validateInitData, rateLimit, clientIp } = ctx;
    const ip = clientIp(req);
    if (!rateLimit('ip-sub:' + ip, 20, 20 / 60)) return send(req, res, 429, { ok: false, error: 'rate_limited' });
    const body = await readJson(req);
    const auth = validateInitData(body.initData);
    if (!auth.ok) return send(req, res, 401, { ok: false, error: auth.error });
    const u = auth.user;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = await upsertPlayer(client, u);
      if (row.banned) {
        await client.query('COMMIT');
        return send(req, res, 403, { ok: false, error: 'banned', subscribed: false });
      }
      const sub = await gate.checkUser(u, { force: true, client: client });
      const subOk = !!(sub.subscribed || sub.bypass || sub.inactive || !sub.required);
      const startParam = typeof body.startParam === 'string' ? body.startParam.slice(0, 64) : '';
      const inviterId = await resolveStartParam(u.id, startParam);
      await maybeQualifyReferral(client, u, row, inviterId, subOk);
      await client.query('COMMIT');
      return send(req, res, 200, {
        ok: true,
        subscribed: !!sub.subscribed,
        required: !!sub.required && !sub.bypass && !sub.inactive && sub.gate && sub.gate.active,
        open: !!sub.open,
        bypass: sub.bypass || undefined,
        inactive: sub.inactive || undefined,
        error: sub.error || undefined,
        channel: require('./meta').CHANNEL.username,
        channelUrl: require('./meta').CHANNEL.url,
      });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw e;
    } finally {
      client.release();
    }
  }

  return {
    upsertPlayer,
    recordBotStart,
    handleSession,
    handleSubCheck,
    grantsLast24h,
    livesCutoff,
    dailyWindow,
    parseRef,
  };
}

module.exports = { createSession, parseRef };

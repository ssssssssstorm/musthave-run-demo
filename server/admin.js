// Admin API: Telegram initData admins + password session, dashboard, players, seasons, broadcast.
'use strict';

const crypto = require('crypto');
const { isAdminUsername, ADMIN_USERNAMES, CHANNEL, normUser } = require('./meta');
const tgBot = require('./telegram-bot');

const SESSION_TTL_S = 12 * 3600;
const MAX_BROADCAST = 4000;

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf8');
}

function sessionKey() {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  const pw = process.env.ADMIN_PASSWORD || '';
  return crypto.createHmac('sha256', token || 'mh').update('mh-admin-session:' + pw).digest();
}

function signToken(actor) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
  const payload = b64url(JSON.stringify({ typ: 'admin', actor: String(actor).slice(0, 80), exp }));
  const sig = crypto.createHmac('sha256', sessionKey()).update(payload).digest('hex');
  return { token: payload + '.' + sig, exp };
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || token.length > 500) return null;
  const i = token.indexOf('.');
  if (i < 8) return null;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  if (!/^[0-9a-f]{64}$/.test(sig)) return null;
  const calc = crypto.createHmac('sha256', sessionKey()).update(payload).digest();
  try {
    if (!crypto.timingSafeEqual(calc, Buffer.from(sig, 'hex'))) return null;
  } catch (_) { return null; }
  let data;
  try { data = JSON.parse(fromB64url(payload)); } catch (_) { return null; }
  if (!data || data.typ !== 'admin' || !data.actor || !data.exp) return null;
  if (data.exp < Math.floor(Date.now() / 1000)) return null;
  return data;
}

function passwordOk(pw) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof pw !== 'string' || !pw) return false;
  const ha = crypto.createHash('sha256').update('mh-admin-pw:' + pw).digest();
  const hb = crypto.createHash('sha256').update('mh-admin-pw:' + expected).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function createAdmin(pool, meta, gate, sessionApi, helpers) {
  const { send, readJson, validateInitData, checkAdminHmac, clientIp, rateLimit } = helpers;
  const jobs = { broadcast: null };

  function bearer(req) {
    const h = String(req.headers.authorization || '');
    if (h.toLowerCase().indexOf('bearer ') === 0) return h.slice(7).trim();
    return String(req.headers['x-admin-session'] || '').trim();
  }

  async function actorFromInitData(req, body) {
    const raw = (body && body.initData) || req.headers['x-telegram-init-data'];
    if (!raw) return null;
    const auth = validateInitData(String(raw));
    if (!auth.ok) return null;
    if (!isAdminUsername(auth.user.username)) return null;
    return 'tg:' + normUser(auth.user.username);
  }

  async function requireAdmin(req, res, body) {
    const ip = clientIp(req);
    if (!rateLimit('admin:' + ip, 60, 60 / 60)) {
      send(req, res, 429, { ok: false, error: 'rate_limited' });
      return null;
    }
    // 1) long-term HMAC used by scripts (never exposes token to the browser)
    if (typeof checkAdminHmac === 'function') {
      const action = req.headers['x-admin-action'] || 'panel';
      if (checkAdminHmac(req, action) || checkAdminHmac(req, 'panel') || checkAdminHmac(req, 'logs') || checkAdminHmac(req, 'tg')) {
        return 'hmac';
      }
    }
    // 2) session token
    const tok = verifyToken(bearer(req));
    if (tok) return tok.actor;
    // 3) Telegram admin initData
    const actor = await actorFromInitData(req, body);
    if (actor) return actor;
    send(req, res, 403, { ok: false, error: 'forbidden' });
    return null;
  }

  async function handleAuth(req, res) {
    const ip = clientIp(req);
    if (!rateLimit('admin-login:' + ip, 8, 8 / 300)) return send(req, res, 429, { ok: false, error: 'rate_limited' });
    const body = await readJson(req);
    if (body && body.password) {
      if (!process.env.ADMIN_PASSWORD) return send(req, res, 503, { ok: false, error: 'password_not_configured' });
      if (!passwordOk(body.password)) return send(req, res, 403, { ok: false, error: 'bad_password' });
      const s = signToken('password');
      return send(req, res, 200, { ok: true, token: s.token, exp: s.exp, actor: 'password' });
    }
    const actor = await actorFromInitData(req, body);
    if (!actor) return send(req, res, 403, { ok: false, error: 'forbidden' });
    const s = signToken(actor);
    return send(req, res, 200, { ok: true, token: s.token, exp: s.exp, actor });
  }

  async function dashboard() {
    const season = await meta.currentSeason();
    const totals = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM players) AS players,
        (SELECT COUNT(*)::int FROM players WHERE updated_at > now() - interval '1 day' OR created_at > now() - interval '1 day') AS dau,
        (SELECT COUNT(*)::int FROM runs WHERE created_at > date_trunc('day', now())) AS runs_today,
        (SELECT COUNT(*)::int FROM runs WHERE accepted AND created_at > date_trunc('day', now())) AS accepted_today,
        (SELECT COALESCE(AVG(score), 0)::float FROM runs WHERE accepted AND season_id = $1) AS avg_score,
        (SELECT COALESCE(MAX(best_score), 0)::int FROM best_scores WHERE season_id = $1) AS best_score,
        (SELECT COUNT(*)::int FROM best_scores WHERE season_id = $1) AS on_board,
        (SELECT COUNT(*)::int FROM referrals WHERE qualified) AS referrals,
        (SELECT COUNT(*)::int FROM players WHERE banned) AS banned,
        (SELECT COUNT(*)::int FROM bot_users) AS bot_users,
        (SELECT COUNT(*)::int FROM runs WHERE accepted = false) AS rejected
    `, [season]);
    const days = await pool.query(`
      SELECT to_char(d::date, 'YYYY-MM-DD') AS day,
             COALESCE(r.runs, 0)::int AS runs,
             COALESCE(r.accepted, 0)::int AS accepted,
             COALESCE(r.players, 0)::int AS players,
             COALESCE(r.avg, 0)::float AS avg_score,
             COALESCE(r.best, 0)::int AS best
      FROM generate_series((now() AT TIME ZONE 'Europe/Moscow')::date - 13, (now() AT TIME ZONE 'Europe/Moscow')::date, interval '1 day') d
      LEFT JOIN (
        SELECT (created_at AT TIME ZONE 'Europe/Moscow')::date AS day,
               COUNT(*)::int AS runs,
               COUNT(*) FILTER (WHERE accepted)::int AS accepted,
               COUNT(DISTINCT tg_id)::int AS players,
               AVG(score) FILTER (WHERE accepted)::float AS avg,
               MAX(score) FILTER (WHERE accepted)::int AS best
        FROM runs
        WHERE created_at > now() - interval '16 days'
        GROUP BY 1
      ) r ON r.day = d::date
      ORDER BY 1
    `);
    const gst = await gate.gateStatus();
    return {
      season,
      stats: totals.rows[0],
      days: days.rows.map((x) => ({
        day: String(x.day).slice(0, 10),
        runs: x.runs, accepted: x.accepted, players: x.players,
        avgScore: Math.round((x.avg_score || 0) * 10) / 10,
        best: x.best,
      })),
      gate: gst,
    };
  }

  async function leaderboard(season, q, limit) {
    season = season || await meta.currentSeason();
    limit = Math.max(1, Math.min(200, limit || 50));
    const params = [season, limit];
    let where = 'b.season_id = $1';
    if (q) {
      params.push('%' + q.toLowerCase().replace(/[%_]/g, '') + '%');
      where += ` AND (lower(coalesce(p.username,'')) LIKE $3
        OR lower(coalesce(p.first_name,'')) LIKE $3
        OR lower(coalesce(p.last_name,'')) LIKE $3
        OR p.tg_id::text LIKE $3)`;
    }
    const r = await pool.query(
      `SELECT b.tg_id, b.best_score, b.runs_count, b.achieved_at,
              p.username, p.first_name, p.last_name, p.is_vip, p.banned, p.sub_status
       FROM best_scores b JOIN players p ON p.tg_id = b.tg_id
       WHERE ${where}
       ORDER BY b.best_score DESC, b.achieved_at ASC, b.tg_id ASC
       LIMIT $2`,
      params
    );
    return {
      season,
      top: r.rows.map((row, i) => ({
        rank: i + 1,
        id: String(row.tg_id),
        username: row.username,
        name: [row.first_name, row.last_name].filter(Boolean).join(' ') || (row.username ? '@' + row.username : 'Игрок'),
        score: row.best_score,
        runs: row.runs_count,
        vip: row.is_vip,
        banned: row.banned,
        subscribed: row.sub_status === 'ok',
        achievedAt: row.achieved_at,
      })),
    };
  }

  async function playerCard(id) {
    const p = await pool.query(
      `SELECT p.*, (SELECT COUNT(*)::int FROM referrals r WHERE r.inviter_tg_id = p.tg_id AND r.qualified) AS invited,
              (SELECT COUNT(*)::int FROM life_grants g WHERE g.tg_id = p.tg_id) AS grants,
              (SELECT start_payload FROM bot_users b WHERE b.tg_id = p.tg_id) AS start_payload
       FROM players p WHERE p.tg_id = $1`,
      [id]
    );
    if (!p.rows.length) return null;
    const row = p.rows[0];
    const season = await meta.currentSeason();
    const best = await pool.query(
      'SELECT season_id, best_score, runs_count, achieved_at FROM best_scores WHERE tg_id = $1 ORDER BY season_id DESC',
      [id]
    );
    const runs = await pool.query(
      `SELECT id, season_id, score, run_time_ms, fruits, accepted, reject_reason, created_at, stats
       FROM runs WHERE tg_id = $1 ORDER BY created_at DESC LIMIT 40`,
      [id]
    );
    const refs = await pool.query(
      `SELECT invitee_tg_id, qualified, created_at, qualified_at FROM referrals WHERE inviter_tg_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [id]
    );
    return {
      id: String(row.tg_id),
      username: row.username,
      firstName: row.first_name,
      lastName: row.last_name,
      photo: row.photo_url,
      vip: row.is_vip,
      banned: row.banned,
      subStatus: row.sub_status,
      subCheckedAt: row.sub_checked_at,
      invitedBy: row.invited_by ? String(row.invited_by) : null,
      invited: row.invited,
      grants: row.grants,
      firstSeen: row.created_at,
      updatedAt: row.updated_at,
      startPayload: row.start_payload,
      seasons: best.rows,
      currentSeason: season,
      runs: runs.rows,
      referrals: refs.rows.map((x) => ({ invitee: String(x.invitee_tg_id), qualified: x.qualified, createdAt: x.created_at })),
    };
  }

  async function exportCsv(season) {
    season = season || await meta.currentSeason();
    const r = await pool.query(
      `SELECT p.tg_id, p.username, p.first_name, p.last_name, p.created_at, p.sub_status, p.is_vip, p.banned,
              COALESCE(b.best_score, 0) AS best_score,
              COALESCE(b.runs_count, 0) AS runs,
              (SELECT COUNT(*)::int FROM referrals rf WHERE rf.inviter_tg_id = p.tg_id AND rf.qualified) AS referrals
       FROM players p
       LEFT JOIN best_scores b ON b.tg_id = p.tg_id AND b.season_id = $1
       ORDER BY COALESCE(b.best_score, 0) DESC, p.created_at ASC`,
      [season]
    );
    const header = ['id', 'username', 'name', 'best_score', 'runs', 'referrals', 'subscribed', 'vip', 'banned', 'first_seen'];
    const lines = [header.join(',')];
    for (const row of r.rows) {
      const name = [row.first_name, row.last_name].filter(Boolean).join(' ');
      lines.push([
        row.tg_id,
        csvEscape(row.username || ''),
        csvEscape(name),
        row.best_score,
        row.runs,
        row.referrals,
        row.sub_status === 'ok' ? 'yes' : 'no',
        row.is_vip ? 'yes' : 'no',
        row.banned ? 'yes' : 'no',
        row.created_at ? new Date(row.created_at).toISOString() : '',
      ].join(','));
    }
    return { season, csv: lines.join('\n') + '\n' };
  }

  async function rotateSeason(client, cur) {
    await client.query('UPDATE seasons SET ended_at = now() WHERE id = $1 AND ended_at IS NULL', [cur]);
    const next = cur + 1;
    await client.query(
      'INSERT INTO seasons (id, name, started_at) VALUES ($1, $2, now()) ON CONFLICT (id) DO NOTHING',
      [next, 'Сезон #' + next]
    );
    await client.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('current_season', $1, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [String(next)]
    );
    return next;
  }

  function confirmToken(kind, extra) {
    const exp = Math.floor(Date.now() / 1000) + 120;
    const payload = b64url(JSON.stringify({ typ: kind, exp, extra }));
    const sig = crypto.createHmac('sha256', sessionKey()).update(payload).digest('hex');
    return payload + '.' + sig;
  }
  function readConfirm(token, kind) {
    const dataActor = verifyToken; // reuse structure
    if (!token) return null;
    const i = String(token).indexOf('.');
    if (i < 8) return null;
    const payload = token.slice(0, i);
    const sig = token.slice(i + 1);
    const calc = crypto.createHmac('sha256', sessionKey()).update(payload).digest();
    try { if (!crypto.timingSafeEqual(calc, Buffer.from(sig, 'hex'))) return null; } catch (_) { return null; }
    let data;
    try { data = JSON.parse(fromB64url(payload)); } catch (_) { return null; }
    if (!data || data.typ !== kind || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  }

  async function startBroadcast(text, actor) {
    if (jobs.broadcast && jobs.broadcast.running) {
      return { ok: false, error: 'broadcast_running' };
    }
    if (!rateLimit('broadcast:global', 1, 1 / 600)) {
      return { ok: false, error: 'broadcast_rate' };
    }
    const rec = await pool.query('SELECT chat_id, tg_id FROM bot_users');
    const list = rec.rows;
    const job = {
      running: true, total: list.length, sent: 0, failed: 0, startedAt: Date.now(), actor, error: '',
    };
    jobs.broadcast = job;
    (async () => {
      for (let i = 0; i < list.length; i++) {
        const r = await tgBot.sendChatMessage(list[i].chat_id, text);
        if (r && r.ok) job.sent++;
        else job.failed++;
        await new Promise((rs) => setTimeout(rs, 50));
      }
      job.running = false;
      await meta.audit(actor, 'broadcast', { total: job.total, sent: job.sent, failed: job.failed });
    })().catch((e) => { job.running = false; job.error = e && e.message; });
    return { ok: true, total: job.total, sent: 0, running: true };
  }

  async function handle(req, res, url) {
    const path = url.pathname;
    const method = req.method;

    if (path === '/api/admin/auth/methods' && method === 'GET') {
      return send(req, res, 200, {
        ok: true,
        passwordEnabled: !!process.env.ADMIN_PASSWORD,
        telegramAdmins: ADMIN_USERNAMES.slice(),
      });
    }
    if (path === '/api/admin/auth' && method === 'POST') return handleAuth(req, res);

    if (path === '/api/admin/dashboard' && method === 'GET') {
      const actor = await requireAdmin(req, res);
      if (!actor) return;
      const data = await dashboard();
      return send(req, res, 200, Object.assign({ ok: true }, data));
    }
    if (path === '/api/admin/leaderboard' && method === 'GET') {
      const actor = await requireAdmin(req, res);
      if (!actor) return;
      const season = parseInt(url.searchParams.get('season') || '', 10);
      const q = (url.searchParams.get('q') || '').slice(0, 80);
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const data = await leaderboard(Number.isFinite(season) && season > 0 ? season : null, q, limit);
      return send(req, res, 200, Object.assign({ ok: true }, data));
    }
    if (path === '/api/admin/players' && method === 'GET') {
      const actor = await requireAdmin(req, res);
      if (!actor) return;
      const q = (url.searchParams.get('q') || '').slice(0, 80);
      const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '40', 10) || 40));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      const params = [limit, offset];
      let where = 'TRUE';
      if (q) {
        params.push('%' + q.toLowerCase().replace(/[%_]/g, '') + '%');
        where = `(lower(coalesce(username,'')) LIKE $3 OR lower(coalesce(first_name,'')) LIKE $3 OR tg_id::text LIKE $3)`;
      }
      const r = await pool.query(
        `SELECT tg_id, username, first_name, last_name, is_vip, banned, sub_status, created_at, updated_at
         FROM players WHERE ${where} ORDER BY updated_at DESC LIMIT $1 OFFSET $2`,
        params
      );
      const total = await pool.query('SELECT COUNT(*)::int AS n FROM players');
      return send(req, res, 200, {
        ok: true,
        total: total.rows[0].n,
        players: r.rows.map((row) => ({
          id: String(row.tg_id),
          username: row.username,
          name: [row.first_name, row.last_name].filter(Boolean).join(' '),
          vip: row.is_vip, banned: row.banned, subStatus: row.sub_status,
          firstSeen: row.created_at, updatedAt: row.updated_at,
        })),
      });
    }
    const pm = path.match(/^\/api\/admin\/player\/(\d{1,20})$/);
    if (pm && method === 'GET') {
      const actor = await requireAdmin(req, res);
      if (!actor) return;
      const card = await playerCard(pm[1]);
      if (!card) return send(req, res, 404, { ok: false, error: 'not_found' });
      return send(req, res, 200, { ok: true, player: card });
    }
    if (pm && method === 'POST') {
      const body = await readJson(req);
      const actor = await requireAdmin(req, res, body);
      if (!actor) return;
      const id = pm[1];
      const action = body && body.action;
      if (action === 'ban' || action === 'unban') {
        await pool.query('UPDATE players SET banned = $2, updated_at = now() WHERE tg_id = $1', [id, action === 'ban']);
        await meta.audit(actor, action, { id });
        return send(req, res, 200, { ok: true, banned: action === 'ban' });
      }
      if (action === 'delete-score') {
        const season = body.season || await meta.currentSeason();
        const r1 = await pool.query('DELETE FROM best_scores WHERE tg_id = $1 AND season_id = $2', [id, season]);
        const r2 = await pool.query('DELETE FROM runs WHERE tg_id = $1 AND season_id = $2', [id, season]);
        await meta.audit(actor, 'delete-score', { id, season, best: r1.rowCount, runs: r2.rowCount });
        return send(req, res, 200, { ok: true, deleted: { best: r1.rowCount, runs: r2.rowCount } });
      }
      if (action === 'delete-player') {
        const r1 = await pool.query('DELETE FROM runs WHERE tg_id = $1', [id]);
        const r2 = await pool.query('DELETE FROM best_scores WHERE tg_id = $1', [id]);
        const r3 = await pool.query('DELETE FROM players WHERE tg_id = $1', [id]);
        await meta.audit(actor, 'delete-player', { id, runs: r1.rowCount, best: r2.rowCount, players: r3.rowCount });
        return send(req, res, 200, { ok: true, deleted: { runs: r1.rowCount, best: r2.rowCount, players: r3.rowCount } });
      }
      if (action === 'lives') {
        const amount = Math.max(1, Math.min(20, parseInt(body.amount, 10) || 1));
        // Ensure player exists
        const p = await pool.query('SELECT tg_id FROM players WHERE tg_id = $1', [id]);
        if (!p.rows.length) return send(req, res, 404, { ok: false, error: 'not_found' });
        await pool.query(
          `INSERT INTO life_grants (tg_id, kind, amount, meta) VALUES ($1, 'admin', $2, $3)`,
          [id, amount, JSON.stringify({ actor })]
        );
        await meta.audit(actor, 'lives', { id, amount });
        return send(req, res, 200, { ok: true, amount });
      }
      if (action === 'reset-lives') {
        const p = await pool.query('SELECT tg_id FROM players WHERE tg_id = $1', [id]);
        if (!p.rows.length) return send(req, res, 404, { ok: false, error: 'not_found' });
        const r = await pool.query(
          'UPDATE players SET lives_reset_at = now(), updated_at = now() WHERE tg_id = $1 RETURNING lives_reset_at',
          [id]
        );
        const at = r.rows[0] && r.rows[0].lives_reset_at;
        await meta.audit(actor, 'reset-lives', { id, livesResetAt: at });
        return send(req, res, 200, { ok: true, livesResetAt: at ? new Date(at).toISOString() : null });
      }
      if (action === 'vip') {
        const vip = !!body.vip;
        const uname = body.username ? normUser(body.username) : null;
        await pool.query('UPDATE players SET is_vip = $2, updated_at = now() WHERE tg_id = $1', [id, vip]);
        if (uname) {
          if (vip) await pool.query('INSERT INTO vip_usernames (username) VALUES ($1) ON CONFLICT DO NOTHING', [uname]);
          else await pool.query('DELETE FROM vip_usernames WHERE username = $1', [uname]);
          meta.invalidate();
        }
        await meta.audit(actor, 'vip', { id, vip, username: uname });
        return send(req, res, 200, { ok: true, vip });
      }
      return send(req, res, 400, { ok: false, error: 'bad_action' });
    }

    if (path === '/api/admin/seasons' && method === 'GET') {
      const actor = await requireAdmin(req, res);
      if (!actor) return;
      const cur = await meta.currentSeason();
      const r = await pool.query(
        `SELECT s.id, s.name, s.started_at, s.ended_at, s.note,
                (SELECT COUNT(*)::int FROM best_scores b WHERE b.season_id = s.id) AS players,
                (SELECT COALESCE(MAX(best_score),0)::int FROM best_scores b WHERE b.season_id = s.id) AS best
         FROM seasons s ORDER BY s.id DESC`
      );
      return send(req, res, 200, { ok: true, current: cur, seasons: r.rows });
    }
    if (path === '/api/admin/seasons/reset' && method === 'POST') {
      const body = await readJson(req);
      const actor = await requireAdmin(req, res, body);
      if (!actor) return;
      const conf = readConfirm(body.confirm, 'season-reset');
      if (!conf) return send(req, res, 400, { ok: false, error: 'confirm_required' });
      const cur = await meta.currentSeason();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const next = await rotateSeason(client, cur);
        await client.query('COMMIT');
        meta.invalidate();
        await meta.audit(actor, 'season-reset', { from: cur, to: next });
        return send(req, res, 200, { ok: true, from: cur, to: next });
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw e;
      } finally {
        client.release();
      }
    }
    if (path === '/api/admin/seasons/confirm' && method === 'POST') {
      const actor = await requireAdmin(req, res);
      if (!actor) return;
      const cur = await meta.currentSeason();
      return send(req, res, 200, { ok: true, confirm: confirmToken('season-reset', { from: cur }), from: cur });
    }
    if (path === '/api/admin/test-reset/confirm' && method === 'POST') {
      const actor = await requireAdmin(req, res);
      if (!actor) return;
      const cur = await meta.currentSeason();
      const epoch = parseInt(await meta.getSetting('reset_epoch', '0'), 10) || 0;
      return send(req, res, 200, {
        ok: true,
        confirm: confirmToken('test-reset', { from: cur, epoch }),
        from: cur,
        epoch,
        phrase: 'СБРОС',
      });
    }
    if (path === '/api/admin/test-reset' && method === 'POST') {
      const body = await readJson(req);
      const actor = await requireAdmin(req, res, body);
      if (!actor) return;
      const phrase = String((body && body.phrase) || '').trim();
      if (phrase !== 'СБРОС') return send(req, res, 400, { ok: false, error: 'phrase_required' });
      const conf = readConfirm(body.confirm, 'test-reset');
      if (!conf) return send(req, res, 400, { ok: false, error: 'confirm_required' });
      const cur = await meta.currentSeason();
      const epoch = (parseInt(await meta.getSetting('reset_epoch', '0'), 10) || 0) + 1;
      const resetAt = new Date().toISOString();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const next = await rotateSeason(client, cur);
        await client.query(
          `INSERT INTO settings (key, value, updated_at) VALUES ('reset_epoch', $1, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [String(epoch)]
        );
        await client.query(
          `INSERT INTO settings (key, value, updated_at) VALUES ('reset_at', $1, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [resetAt]
        );
        await client.query('COMMIT');
        meta.invalidate();
        await meta.audit(actor, 'test-reset', { from: cur, to: next, epoch, resetAt });
        return send(req, res, 200, { ok: true, from: cur, to: next, resetEpoch: epoch, resetAt });
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw e;
      } finally {
        client.release();
      }
    }

    if (path === '/api/admin/export' && method === 'GET') {
      const actor = await requireAdmin(req, res);
      if (!actor) return;
      const season = parseInt(url.searchParams.get('season') || '', 10);
      const out = await exportCsv(Number.isFinite(season) && season > 0 ? season : null);
      const filename = 'musthave-season-' + out.season + '.csv';
      res.writeHead(200, Object.assign({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="' + filename + '"',
        'Cache-Control': 'no-store',
      }, helpers.corsHeaders ? helpers.corsHeaders(req) : {}));
      return res.end(out.csv);
    }

    if (path === '/api/admin/suspicious' && method === 'GET') {
      const actor = await requireAdmin(req, res);
      if (!actor) return;
      const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') || '80', 10) || 80));
      const r = await pool.query(
        `SELECT r.id, r.tg_id, r.score, r.run_time_ms, r.fruits, r.reject_reason, r.created_at,
                p.username, p.first_name
         FROM runs r JOIN players p ON p.tg_id = r.tg_id
         WHERE r.accepted = false
         ORDER BY r.created_at DESC LIMIT $1`,
        [limit]
      );
      return send(req, res, 200, {
        ok: true,
        runs: r.rows.map((row) => ({
          id: String(row.id),
          tgId: String(row.tg_id),
          username: row.username,
          name: row.first_name,
          score: row.score,
          runTimeMs: row.run_time_ms,
          fruits: row.fruits,
          reason: row.reject_reason,
          createdAt: row.created_at,
        })),
      });
    }

    if (path === '/api/admin/winners' && method === 'GET') {
      const actor = await requireAdmin(req, res);
      if (!actor) return;
      const season = parseInt(url.searchParams.get('season') || '', 10);
      const sid = Number.isFinite(season) && season > 0 ? season : await meta.currentSeason();
      const r = await pool.query(
        `SELECT b.tg_id, b.best_score, b.runs_count, b.achieved_at, p.username, p.first_name, p.last_name
         FROM best_scores b JOIN players p ON p.tg_id = b.tg_id
         WHERE b.season_id = $1
         ORDER BY b.best_score DESC, b.achieved_at ASC, b.tg_id ASC LIMIT 5`,
        [sid]
      );
      return send(req, res, 200, {
        ok: true,
        season: sid,
        winners: r.rows.map((row, i) => ({
          rank: i + 1,
          id: String(row.tg_id),
          username: row.username,
          name: [row.first_name, row.last_name].filter(Boolean).join(' ') || (row.username ? '@' + row.username : 'Игрок'),
          score: row.best_score,
          runs: row.runs_count,
          achievedAt: row.achieved_at,
        })),
      });
    }

    if (path === '/api/admin/gate' && method === 'GET') {
      const actor = await requireAdmin(req, res);
      if (!actor) return;
      const gst = await gate.gateStatus();
      return send(req, res, 200, { ok: true, gate: gst });
    }
    if (path === '/api/admin/gate' && method === 'POST') {
      const body = await readJson(req);
      const actor = await requireAdmin(req, res, body);
      if (!actor) return;
      if (typeof body.enabled !== 'boolean') return send(req, res, 400, { ok: false, error: 'bad_enabled' });
      await meta.setSetting('gate_enabled', body.enabled ? 'true' : 'false');
      await meta.audit(actor, 'gate', { enabled: body.enabled });
      const gst = await gate.gateStatus();
      return send(req, res, 200, { ok: true, gate: gst });
    }

    if (path === '/api/admin/vips' && method === 'GET') {
      const actor = await requireAdmin(req, res);
      if (!actor) return;
      const set = await meta.vipSet();
      return send(req, res, 200, { ok: true, usernames: Array.from(set) });
    }
    if (path === '/api/admin/vips' && method === 'POST') {
      const body = await readJson(req);
      const actor = await requireAdmin(req, res, body);
      if (!actor) return;
      const uname = normUser(body.username);
      if (!uname) return send(req, res, 400, { ok: false, error: 'bad_username' });
      if (body.vip === false) await pool.query('DELETE FROM vip_usernames WHERE username = $1', [uname]);
      else await pool.query('INSERT INTO vip_usernames (username) VALUES ($1) ON CONFLICT DO NOTHING', [uname]);
      await pool.query(
        `UPDATE players SET is_vip = $2, updated_at = now()
         WHERE lower(regexp_replace(coalesce(username,''), '^@', '')) = $1`,
        [uname, body.vip !== false]
      );
      meta.invalidate();
      await meta.audit(actor, 'vip-username', { username: uname, vip: body.vip !== false });
      return send(req, res, 200, { ok: true, username: uname, vip: body.vip !== false });
    }

    if (path === '/api/admin/broadcast/prepare' && method === 'POST') {
      const body = await readJson(req);
      const actor = await requireAdmin(req, res, body);
      if (!actor) return;
      const text = String(body.text || '').trim();
      if (!text || text.length > MAX_BROADCAST) return send(req, res, 400, { ok: false, error: 'bad_text' });
      const n = await pool.query('SELECT COUNT(*)::int AS n FROM bot_users');
      const confirm = confirmToken('broadcast', { sha: crypto.createHash('sha256').update(text).digest('hex'), n: n.rows[0].n });
      return send(req, res, 200, { ok: true, recipients: n.rows[0].n, confirm, preview: text.slice(0, 200) });
    }
    if (path === '/api/admin/broadcast' && method === 'POST') {
      const body = await readJson(req);
      const actor = await requireAdmin(req, res, body);
      if (!actor) return;
      const text = String(body.text || '').trim();
      const conf = readConfirm(body.confirm, 'broadcast');
      if (!conf) return send(req, res, 400, { ok: false, error: 'confirm_required' });
      const sha = crypto.createHash('sha256').update(text).digest('hex');
      if (!conf.extra || conf.extra.sha !== sha) return send(req, res, 400, { ok: false, error: 'confirm_mismatch' });
      const r = await startBroadcast(text, actor);
      const status = r.ok ? 200 : (r.error === 'broadcast_rate' || r.error === 'broadcast_running' ? 429 : 400);
      return send(req, res, status, r);
    }
    if (path === '/api/admin/broadcast/status' && method === 'GET') {
      const actor = await requireAdmin(req, res);
      if (!actor) return;
      const j = jobs.broadcast;
      return send(req, res, 200, { ok: true, job: j ? { running: j.running, total: j.total, sent: j.sent, failed: j.failed, error: j.error || '' } : null });
    }

    if (path === '/api/admin/tgstatus' && method === 'GET') {
      const actor = await requireAdmin(req, res);
      if (!actor) return;
      const st = await tgBot.webhookStatus();
      const gst = await gate.gateStatus();
      return send(req, res, 200, { ok: true, webhook: st, gate: gst, channel: CHANNEL.username });
    }

    return 'next';
  }

  return { handle, requireAdmin, signToken, verifyToken, confirmToken, readConfirm };
}

module.exports = { createAdmin, signToken, verifyToken, passwordOk, isAdminUsername };

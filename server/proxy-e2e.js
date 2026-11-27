// One-shot signed score through the Netlify proxy, then delete the test user.
// Enabled only when PROXY_PROBE=1. Never logs the token or initData.
'use strict';
const crypto = require('crypto');
const https = require('https');

const PROXY = process.env.PROXY_URL || 'https://musthave-run-api.netlify.app';
const UID = String(process.env.PROXY_PROBE_UID || '910000027');
const USER = { id: +UID, first_name: 'ProxyProbe', username: 'proxy_probe' };

function mkInitData(user, token) {
  const p = { auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAH' + crypto.randomBytes(6).toString('hex'), user: JSON.stringify(user) };
  const dcs = Object.keys(p).sort().map((k) => k + '=' + p[k]).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  const usp = new URLSearchParams(p); usp.set('hash', hash);
  return usp.toString();
}

function adminHeaders(id, token) {
  const ts = Math.floor(Date.now() / 1000);
  return { 'X-Admin-Ts': String(ts), 'X-Admin-Sig': crypto.createHmac('sha256', token).update('admin:' + ts + ':' + id).digest('hex') };
}

function request(method, path, body, headers) {
  const url = new URL(path, PROXY);
  const payload = body ? JSON.stringify(body) : '';
  const hdrs = Object.assign({ Origin: 'https://ssssssssstorm.github.io' }, headers || {});
  if (payload) {
    hdrs['Content-Type'] = 'application/json';
    hdrs['Content-Length'] = Buffer.byteLength(payload);
  }
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: hdrs,
    }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        let data = null;
        try { data = JSON.parse(d); } catch (_) {}
        resolve({ status: res.statusCode, cors: res.headers['access-control-allow-origin'] || '', server: res.headers.server || '', data });
      });
    });
    req.on('error', reject);
    req.setTimeout(25000, () => { try { req.destroy(); } catch (_) {} reject(new Error('timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

async function runProxyE2E() {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!token) {
    console.log('[proxy-e2e] skipped no_token');
    return { ok: false, reason: 'no_token' };
  }
  const health = await request('GET', '/api/health');
  if (!health.data || health.data.ok !== true || health.data.db !== true) {
    console.log('[proxy-e2e] health_fail status=' + health.status);
    return { ok: false, reason: 'health' };
  }
  const initData = mkInitData(USER, token);
  const cid = 'pr' + crypto.randomBytes(5).toString('hex');
  const submit = await request('POST', '/api/score', {
    initData, score: 18, clientRunId: cid,
    runStats: { runTimeMs: 20000, fruits: 14, golden: 0 },
  });
  const accepted = !!(submit.data && submit.data.ok);
  const lb = await request('GET', '/api/leaderboard?limit=50', null, { 'X-Telegram-Init-Data': initData });
  const me = lb.data && lb.data.me;
  const top = (lb.data && lb.data.top) || [];
  const seen = !!(me && (me.username === 'proxy_probe' || Number(me.best || me.score || 0) >= 18))
    || top.some((r) => r.username === 'proxy_probe' || String(r.tg_id || r.id || '') === UID);
  const del = await request('DELETE', '/api/admin/player/' + UID, null, adminHeaders(UID, token));
  const deleted = !!(del.data && del.data.ok);
  const lb2 = await request('GET', '/api/leaderboard?limit=50');
  const top2 = (lb2.data && lb2.data.top) || [];
  const gone = !top2.some((r) => r.username === 'proxy_probe' || String(r.tg_id || r.id || '') === UID);
  const ok = accepted && seen && deleted && gone && health.server.toLowerCase() === 'netlify';
  console.log('[proxy-e2e] ok=' + ok +
    ' via=' + health.server +
    ' cors=' + health.cors +
    ' submit=' + submit.status +
    ' accepted=' + accepted +
    ' rank=' + (submit.data && submit.data.rank) +
    ' best=' + (submit.data && submit.data.best) +
    ' seen=' + seen +
    ' deleted=' + deleted +
    ' gone=' + gone);
  return { ok };
}

module.exports = { runProxyE2E };
if (require.main === module) {
  runProxyE2E().then((r) => process.exit(r.ok ? 0 : 1)).catch((e) => { console.error('[proxy-e2e] fail', e.message); process.exit(1); });
}

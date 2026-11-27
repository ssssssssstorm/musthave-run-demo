// Reverse proxy for the Render leaderboard API.
// Runs on Netlify (reachable from RU in late-2026 measurements) so clients
// do not have to connect to onrender.com / Render IPs directly.
'use strict';

const UPSTREAM = 'https://musthave-run-api.onrender.com';

function allowedOrigin(origin) {
  if (!origin) return '';
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:') return '';
    if (u.hostname === 'ssssssssstorm.github.io') return origin;
    if (u.hostname === 'musthave-run.onrender.com') return origin;
    if (u.hostname === 'netlify.app' || u.hostname.endsWith('.netlify.app')) return origin;
    return '';
  } catch (_) {
    return '';
  }
}

function corsHeaders(origin) {
  const allow = allowedOrigin(origin);
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  };
  if (allow) h['Access-Control-Allow-Origin'] = allow;
  return h;
}

function targetPath(event) {
  let path = '';
  if (event.rawUrl) {
    try { path = new URL(event.rawUrl).pathname || ''; } catch (_) {}
  }
  if (!path) path = event.path || '';
  const marker = '/.netlify/functions/api-proxy';
  if (path.indexOf(marker) === 0) {
    path = path.slice(marker.length) || '/';
    if (path.indexOf('/api/') !== 0 && path !== '/api') {
      path = '/api' + (path.charAt(0) === '/' ? path : '/' + path);
    }
  }
  if (path.indexOf('/api/') !== 0 && path !== '/api') return null;
  return path;
}

exports.handler = async function (event) {
  const origin = event.headers && (event.headers.origin || event.headers.Origin) || '';
  const cors = corsHeaders(origin);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }
  const path = targetPath(event);
  if (!path) {
    return { statusCode: 404, headers: Object.assign({ 'Content-Type': 'application/json' }, cors), body: JSON.stringify({ ok: false, error: 'not_found' }) };
  }
  let qs = event.rawQuery;
  if (qs == null) {
    const params = event.queryStringParameters || {};
    qs = Object.keys(params).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k] == null ? '' : params[k])).join('&');
  }
  const url = UPSTREAM + path + (qs ? '?' + qs : '');
  const headers = {};
  const skip = {
    host: 1, connection: 1, 'content-length': 1, 'accept-encoding': 1,
    'x-forwarded-for': 1, 'x-forwarded-proto': 1, 'x-forwarded-host': 1,
    'x-nf-request-id': 1, 'x-netlify-retry': 1, forwarded: 1,
  };
  Object.keys(event.headers || {}).forEach((k) => {
    if (!skip[k.toLowerCase()]) headers[k] = event.headers[k];
  });
  let body = event.body;
  if (body && event.isBase64Encoded) body = Buffer.from(body, 'base64');
  const method = event.httpMethod || 'GET';
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const out = Object.assign({}, cors);
    const ct = res.headers.get('content-type');
    if (ct) out['Content-Type'] = ct;
    return {
      statusCode: res.status,
      headers: out,
      body: buf.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: Object.assign({ 'Content-Type': 'application/json' }, cors),
      body: JSON.stringify({ ok: false, error: 'proxy_upstream' }),
    };
  }
};

// Telegram bot /start webhook + setWebhook / descriptions on boot.
// Uses TELEGRAM_BOT_TOKEN from the environment. Never logs the token or the webhook secret path.
'use strict';

const https = require('https');
const crypto = require('crypto');

const MENU_URL = process.env.MENU_BUTTON_URL || 'https://ssssssssstorm.github.io/musthave-run-demo/';
const PUBLIC_API = (process.env.API_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'https://musthave-run-api.onrender.com').replace(/\/+$/, '');

const START_HTML = [
  'MUSTHAVE RUN 😍',
  '',
  'Коржик, как самый милый и младший сотрудник лаунжа, был отправлен за новинкой. ',
  '',
  '<b>МАНГО, ПЕРСИК И АНАНАС</b>',
  'Микс сочной мякоти манго и нежного персика с ананасовым соком.',
  '',
  'Помоги Коржику собрать ингредиенты для аромата, преодолевая препятствия:',
  '',
  '▫️один тап – обычный прыжок',
  '▫️двойной тап – высокий прыжок',
  '▫️свайп вниз – пригнуться',
  '',
  'Не упускай возможности собрать все фрукты! Чем больше ингредиентов, тем сильнее похвалят Коржика!',
  '',
  'Первые пять игроков в рейтинге получат от нас блогер-бокс с новым ароматом MUSTHAVE! Удачи 😘 ',
  '',
  'У тебя 5 попыток в сутки. Через 24 часа возвращайся в игру, чтобы ставить новые рекорды! ',
  '',
  'Нажми «Играть 🎮» внизу, чтобы начать забег!',
].join('\n');

const SHORT_DESC = 'Собери фрукты с Коржиком в 8-битном забеге MUSTHAVE! 5 попыток в сутки.';
const LONG_DESC = 'MUSTHAVE RUN — пиксельный раннер про Коржика, самого милого сотрудника лаунжа. Собери манго, персик и ананас, перепрыгивай кальян и пригибайся под стаей птиц. Первые пять в рейтинге получают блогер-бокс с новым ароматом MUSTHAVE. 5 попыток в сутки.';

function secrets() {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!token) return null;
  return {
    token,
    pathKey: crypto.createHmac('sha256', token).update('musthave-run-tg-webhook').digest('hex').slice(0, 32),
    secret: crypto.createHmac('sha256', token).update('musthave-run-tg-secret').digest('hex'),
  };
}

function tg(method, body, token) {
  const tok = token || (process.env.TELEGRAM_BOT_TOKEN || '');
  if (!tok) return Promise.resolve({ ok: false, description: 'no_token' });
  const payload = body ? JSON.stringify(body) : '';
  const options = {
    hostname: 'api.telegram.org',
    path: '/bot' + tok + '/' + method,
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
  };
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (_) { resolve({ ok: false, description: 'bad_json' }); }
      });
    });
    req.on('error', () => resolve({ ok: false, description: 'net' }));
    req.setTimeout(20000, () => { try { req.destroy(); } catch (_) {} resolve({ ok: false, description: 'timeout' }); });
    if (payload) req.write(payload);
    req.end();
  });
}

function isStartCommand(text) {
  if (typeof text !== 'string') return false;
  const first = text.trim().split(/\s+/)[0] || '';
  return first === '/start' || first.indexOf('/start@') === 0;
}

function startPayload() {
  return {
    text: START_HTML,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [[{ text: 'Играть 🎮', web_app: { url: MENU_URL } }]],
    },
  };
}

async function sendStart(chatId) {
  const body = Object.assign({ chat_id: chatId }, startPayload());
  return tg('sendMessage', body);
}

async function handleWebhook(req, res, readJson) {
  const sec = secrets();
  if (!sec) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end('{"ok":false}');
    return;
  }
  const hdr = String(req.headers['x-telegram-bot-api-secret-token'] || '');
  if (hdr !== sec.secret) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end('{"ok":false}');
    return;
  }
  let update;
  try { update = await readJson(req, 64 * 1024); } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end('{"ok":false}');
    return;
  }
  const msg = update && update.message;
  if (msg && isStartCommand(msg.text) && msg.chat && msg.chat.id) {
    const sent = await sendStart(msg.chat.id);
    if (!sent.ok) console.log('[tg] start_send_fail', sent.description || 'err');
    else console.log('[tg] start_ok');
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end('{"ok":true}');
}

function webhookPathSuffix() {
  const sec = secrets();
  return sec ? sec.pathKey : null;
}

function matchesWebhookPath(pathname) {
  const sec = secrets();
  return !!(sec && pathname === '/api/tg/webhook/' + sec.pathKey);
}

async function syncBot() {
  const sec = secrets();
  if (!sec) {
    console.log('[tg] skipped no_token');
    return { ok: false, reason: 'no_token' };
  }
  const hookUrl = PUBLIC_API + '/api/tg/webhook/' + sec.pathKey;
  const setW = await tg('setWebhook', {
    url: hookUrl,
    secret_token: sec.secret,
    allowed_updates: ['message'],
    drop_pending_updates: false,
  }, sec.token);
  const info = await tg('getWebhookInfo', null, sec.token);
  const desc = await tg('setMyDescription', { description: LONG_DESC }, sec.token);
  const shortD = await tg('setMyShortDescription', { short_description: SHORT_DESC }, sec.token);
  const infoUrl = info && info.result && info.result.url ? String(info.result.url) : '';
  const pathOk = infoUrl.indexOf('/api/tg/webhook/') !== -1 && infoUrl.indexOf(sec.pathKey) !== -1;
  const lastErr = (info && info.result && info.result.last_error_message) || '';
  console.log('[tg] webhook set_ok=' + !!setW.ok +
    (setW.description ? ' set_desc=' + String(setW.description).slice(0, 80) : '') +
    ' get_ok=' + !!info.ok +
    ' path_ok=' + pathOk +
    ' pending=' + ((info.result && info.result.pending_update_count) || 0) +
    (lastErr ? ' last_err=' + String(lastErr).slice(0, 80) : '') +
    ' desc_ok=' + !!desc.ok +
    ' short_ok=' + !!shortD.ok);
  return { ok: !!(setW.ok && pathOk), pathOk };
}

async function webhookStatus() {
  const info = await tg('getWebhookInfo');
  const r = (info && info.result) || {};
  const url = String(r.url || '');
  let host = '';
  try { host = url ? new URL(url).host : ''; } catch (_) {}
  const sec = secrets();
  const pathOk = !!(sec && url.indexOf('/api/tg/webhook/' + sec.pathKey) !== -1);
  return {
    ok: !!info.ok,
    host,
    pathSet: pathOk,
    pending: r.pending_update_count || 0,
    lastError: r.last_error_message || '',
    lastErrorAt: r.last_error_date || 0,
    maxConnections: r.max_connections || 0,
  };
}

module.exports = {
  handleWebhook,
  matchesWebhookPath,
  webhookPathSuffix,
  syncBot,
  webhookStatus,
  startPayload,
  isStartCommand,
};

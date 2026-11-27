// Sets the Telegram bot default menu button to the GitHub Pages mirror.
// Uses TELEGRAM_BOT_TOKEN from the environment. Never logs the token.
'use strict';

const https = require('https');

const MENU_URL = process.env.MENU_BUTTON_URL || 'https://ssssssssstorm.github.io/musthave-run-demo/';
const MENU_TEXT = process.env.MENU_BUTTON_TEXT || 'Играть';

function tg(method, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!token) return Promise.resolve({ ok: false, description: 'no_token' });
  const payload = body ? JSON.stringify(body) : '';
  const options = {
    hostname: 'api.telegram.org',
    path: '/bot' + token + '/' + method,
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
    req.setTimeout(15000, () => { try { req.destroy(); } catch (_) {} resolve({ ok: false, description: 'timeout' }); });
    if (payload) req.write(payload);
    req.end();
  });
}

function menuSummary(res) {
  const r = res && res.result ? res.result : {};
  return {
    type: r.type || '',
    text: r.text || '',
    url: r.web_app && r.web_app.url ? r.web_app.url : '',
  };
}

async function syncMenuButton() {
  const setRes = await tg('setChatMenuButton', {
    menu_button: { type: 'web_app', text: MENU_TEXT, web_app: { url: MENU_URL } },
  });
  const getRes = await tg('getChatMenuButton');
  const got = menuSummary(getRes);
  const setDesc = setRes && (setRes.description || setRes.error) ? String(setRes.description || setRes.error) : '';
  console.log('[menu] set_ok=' + !!(setRes && setRes.ok) + (setDesc ? ' set_desc=' + setDesc : '') +
    ' get_ok=' + !!(getRes && getRes.ok) + ' type=' + got.type + ' text=' + got.text + ' url=' + got.url);
  return { setRes, getRes, got };
}

module.exports = { syncMenuButton, MENU_URL, MENU_TEXT };

if (require.main === module) {
  syncMenuButton().then((r) => {
    const ok = r.got && r.got.url === MENU_URL;
    process.exit(ok ? 0 : 1);
  });
}

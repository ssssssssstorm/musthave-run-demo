// Telegram WebApp SDK wrapper + fullscreen / safe-area handling + backend stubs
window.MH_TG = (function () {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  // Online leaderboard API. `?api=<url>` overrides the list for local testing.
  // Try a RU-reachable proxy first (Netlify, once imported — see README), then Render.
  const DEFAULT_API = 'https://musthave-run-api.onrender.com';
  const API_BASES = [
    'https://musthave-run-api.netlify.app',
    DEFAULT_API
  ];
  const apiParam = new URLSearchParams(window.location.search).get('api');
  function isKnownOrigin(origin) {
    if (!origin) return false;
    if (origin === 'https://musthave-run.onrender.com') return true;
    if (origin === 'https://ssssssssstorm.github.io') return true;
    try {
      const host = new URL(origin).hostname;
      if (host === 'netlify.app' || host.slice(-12) === '.netlify.app') return true;
    } catch (_) {}
    return false;
  }
  function resolveApiBases() {
    if (apiParam && /^https?:\/\//.test(apiParam)) return [apiParam.replace(/\/+$/, '')];
    try {
      if (isKnownOrigin(window.location.origin)) {
        const bases = [];
        for (let i = 0; i < API_BASES.length; i++) {
          const b = String(API_BASES[i] || '').replace(/\/+$/, '');
          if (b && bases.indexOf(b) === -1) bases.push(b);
        }
        return bases;
      }
    } catch (_) {}
    return []; // local / unknown origin: skip, so the console isn't filled with CORS errors
  }
  const CONFIG = {
    channelUsername: 'musthavetobacco',
    channelUrl: 'https://t.me/musthavetobacco',
    botUsername: 'tetsbot9145_bot',
    subscriptionApi: null,
    apiBases: resolveApiBases(),
    apiBaseUrl: resolveApiBases()[0] || null,
  };
  const PENDING_KEY = 'mh_pending_scores_v1';

  function tgAtLeast(ver) {
    try {
      if (!tg || typeof tg.isVersionAtLeast !== 'function') return false;
      return !!tg.isVersionAtLeast(ver);
    } catch (e) {
      return false;
    }
  }

  function applySafeAreaVars() {
    const root = document.documentElement;
    if (!tg) return;
    let sa = { top: 0, bottom: 0, left: 0, right: 0 };
    let ca = { top: 0, bottom: 0, left: 0, right: 0 };
    try { if (tg.safeAreaInset) sa = tg.safeAreaInset; } catch (e) {}
    try { if (tg.contentSafeAreaInset) ca = tg.contentSafeAreaInset; } catch (e) {}
    const topTotal = (sa.top || 0) + (ca.top || 0);
    const bottomTotal = (sa.bottom || 0) + (ca.bottom || 0);
    root.style.setProperty('--tg-safe-area-inset-top', `${sa.top || 0}px`);
    root.style.setProperty('--tg-safe-area-inset-bottom', `${sa.bottom || 0}px`);
    root.style.setProperty('--tg-safe-area-inset-left', `${sa.left || 0}px`);
    root.style.setProperty('--tg-safe-area-inset-right', `${sa.right || 0}px`);
    root.style.setProperty('--tg-content-safe-area-inset-top', `${ca.top || 0}px`);
    root.style.setProperty('--tg-content-safe-area-inset-bottom', `${ca.bottom || 0}px`);
    root.style.setProperty('--tg-safe-top-total', `${topTotal}px`);
    root.style.setProperty('--tg-safe-bottom-total', `${bottomTotal}px`);
  }

  function tryFullscreen() {
    if (!tg) return;
    try {
      if (typeof tg.expand === 'function') tg.expand();
      const canFs = typeof tg.requestFullscreen === 'function' && tgAtLeast('8.0');
      if (canFs && !tg.isFullscreen) {
        tg.requestFullscreen();
      }
    } catch (_) {}
  }

  function notifyViewport() {
    applySafeAreaVars();
    window.dispatchEvent(new Event('mh-viewport'));
  }

  function setChromeTheme(kind) {
    if (!tg) return;
    try {
      const col = kind === 'sunset' ? '#2A154B' : '#120624';
      if (typeof tg.setHeaderColor === 'function' && tgAtLeast('6.1')) tg.setHeaderColor(col);
      if (typeof tg.setBackgroundColor === 'function' && tgAtLeast('6.1')) tg.setBackgroundColor(col);
    } catch (_) {}
  }

  function init() {
    warmUp();
    setTimeout(() => { flushPending().catch(() => {}); }, 1500);
    if (!tg) return;
    try {
      if (typeof tg.ready === 'function') tg.ready();
      tryFullscreen();
      if (typeof tg.disableVerticalSwipes === 'function' && tgAtLeast('7.7')) {
        tg.disableVerticalSwipes();
      }
      setChromeTheme('night');
      applySafeAreaVars();

      if (typeof tg.onEvent === 'function') {
        const ev = function (name) {
          try { tg.onEvent(name, notifyViewport); } catch (e) {}
        };
        ev('viewportChanged');
        ev('fullscreenChanged');
        ev('safeAreaChanged');
        ev('contentSafeAreaChanged');
      }

      // Some mobile Telegram clients only allow fullscreen after a user gesture
      const onFirstTap = function () {
        tryFullscreen();
        window.removeEventListener('pointerdown', onFirstTap, true);
        window.removeEventListener('touchstart', onFirstTap, true);
      };
      window.addEventListener('pointerdown', onFirstTap, true);
      window.addEventListener('touchstart', onFirstTap, true);
    } catch (_) {}
  }

  function haptic(type = 'light') {
    if (!tg || !tg.HapticFeedback) return;
    try {
      if (type === 'error' || type === 'success' || type === 'warning') {
        tg.HapticFeedback.notificationOccurred(type);
      } else {
        tg.HapticFeedback.impactOccurred(type);
      }
    } catch (_) {}
  }

  function getInitData() {
    const app = (window.Telegram && window.Telegram.WebApp) || tg;
    return app && typeof app.initData === 'string' && app.initData.length > 20 ? app.initData : '';
  }

  function isTelegram() {
    return !!getInitData();
  }

  function fetchOne(base, path, opts, timeoutMs) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs) : 0;
    const raced = ctl
      ? fetch(base + path, Object.assign({}, opts, { signal: ctl.signal }))
      : Promise.race([
          fetch(base + path, opts),
          new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, timeoutMs); })
        ]);
    return Promise.resolve(raced).then(function (res) {
      return res.json().then(function (data) {
        return { status: res.status, data: data || {}, base: base };
      }).catch(function () {
        return { status: res.status, data: {}, base: base };
      });
    }).then(function (out) {
      if (timer) clearTimeout(timer);
      return out;
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  async function apiFetch(path, opts, timeoutMs) {
    opts = opts || {};
    const bases = CONFIG.apiBases && CONFIG.apiBases.length ? CONFIG.apiBases : (CONFIG.apiBaseUrl ? [CONFIG.apiBaseUrl] : []);
    if (!bases.length) throw new Error('no_api');
    let last = null;
    for (let i = 0; i < bases.length; i++) {
      const many = bases.length > 1;
      const ms = timeoutMs != null ? timeoutMs : (many && i < bases.length - 1 ? 8000 : 25000);
      try {
        const res = await fetchOne(bases[i], path, opts, ms);
        CONFIG.apiBaseUrl = bases[i];
        if (res.status >= 500 && i < bases.length - 1) { last = res; continue; }
        return res;
      } catch (e) {
        last = e;
      }
    }
    if (last && typeof last.status === 'number') return last;
    throw last || new Error('no_api');
  }

  // Free Render services sleep when idle: wake the API as soon as the app opens
  function warmUp() {
    if (!CONFIG.apiBases || !CONFIG.apiBases.length) return;
    // Hit every candidate so a sleeping origin can wake while the proxy answers.
    for (let i = 0; i < CONFIG.apiBases.length; i++) {
      fetchOne(CONFIG.apiBases[i], '/api/health', {}, 60000).catch(function () {});
    }
  }

  function readPending() {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]') || []; } catch (_) { return []; }
  }
  function writePending(list) {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-5))); } catch (_) {}
  }

  async function postScore(item) {
    return apiFetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
  }

  // Retry scores that could not be delivered (offline / server asleep); drops ones the server answered
  async function flushPending() {
    const list = readPending();
    if (!list.length) return;
    const keep = [];
    for (const item of list) {
      try {
        const r = await postScore(item);
        if (r.status >= 500) keep.push(item);
      } catch (_) {
        keep.push(item);
      }
    }
    writePending(keep);
  }

  let lastSubmit = Promise.resolve(null);
  function submitScore(score, runStats, clientRunId) {
    const initData = getInitData();
    if (!initData) {
      lastSubmit = Promise.resolve({ ok: false, offline: true, error: 'not_telegram' });
      return lastSubmit;
    }
    const item = { initData, score, runStats: runStats || {}, clientRunId };
    lastSubmit = (async () => {
      try {
        const r = await postScore(item);
        if (r.status >= 500) throw new Error('server_' + r.status);
        flushPending().catch(() => {});
        return Object.assign({ status: r.status }, r.data);
      } catch (e) {
        writePending(readPending().concat([item]));
        return { ok: false, offline: true, error: 'network' };
      }
    })();
    return lastSubmit;
  }

  async function fetchLeaderboard() {
    await Promise.race([lastSubmit.catch(() => null), new Promise(r => setTimeout(r, 6000))]);
    const initData = getInitData();
    const headers = initData ? { 'X-Telegram-Init-Data': initData } : {};
    const r = await apiFetch('/api/leaderboard?limit=50', { headers });
    if (r.status !== 200 || !r.data.ok) throw new Error('leaderboard_' + r.status);
    return r.data;
  }

  function getWebApp() {
    return (window.Telegram && window.Telegram.WebApp) || tg || null;
  }

  function getUser() {
    const app = getWebApp();
    const u = app && app.initDataUnsafe && app.initDataUnsafe.user ? app.initDataUnsafe.user : null;
    if (u) {
      return {
        id: String(u.id),
        name: u.first_name || u.username || 'Игрок',
        username: u.username || null,
        isTelegram: true,
      };
    }
    return {
      id: 'demo-player',
      name: 'Ты (Гость)',
      username: null,
      isTelegram: false,
    };
  }

  function openTelegramLink(url) {
    const app = getWebApp();
    if (app && typeof app.openTelegramLink === 'function') {
      try { app.openTelegramLink(url); return true; } catch (_) {}
    }
    if (app && typeof app.openLink === 'function') {
      try { app.openLink(url); return true; } catch (_) {}
    }
    try { window.open(url, '_blank', 'noopener'); return true; } catch (_) { return false; }
  }

  function openChannel() {
    openTelegramLink(CONFIG.channelUrl);
  }

  function getStartParam() {
    try {
      const app = getWebApp();
      if (app && app.initDataUnsafe && app.initDataUnsafe.start_param) {
        return String(app.initDataUnsafe.start_param);
      }
    } catch (_) {}
    try {
      const q = new URLSearchParams(window.location.search);
      return q.get('tgWebAppStartParam') || q.get('startapp') || q.get('start') || '';
    } catch (_) { return ''; }
  }

  function referralLink(userId) {
    const id = userId || (getUser() && getUser().id);
    if (!id || id === 'demo-player') return '';
    return 'https://t.me/' + CONFIG.botUsername + '?startapp=ref_' + id;
  }

  function shareReferral(userId) {
    const link = referralLink(userId);
    if (!link) return false;
    const text = 'Сыграй в MUSTHAVE RUN — собери фрукты с Коржиком и помоги ему с новым ароматом!';
    const share = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(text);
    return openTelegramLink(share);
  }

  const SUB_CACHE_KEY = 'mh_sub_ok_v1';
  function readSubCache() {
    try {
      const raw = sessionStorage.getItem(SUB_CACHE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (o && o.t && Date.now() - o.t < 10 * 60 * 1000) return o;
    } catch (_) {}
    return null;
  }
  function writeSubCache(data) {
    try { sessionStorage.setItem(SUB_CACHE_KEY, JSON.stringify({ t: Date.now(), data: data })); } catch (_) {}
  }

  async function postInit(path, extra, timeoutMs) {
    const initData = getInitData();
    if (!initData) return { ok: false, error: 'not_telegram', demo: true };
    const body = Object.assign({ initData: initData, startParam: getStartParam() }, extra || {});
    const r = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, timeoutMs);
    return Object.assign({ status: r.status }, r.data);
  }

  async function openSession() {
    const r = await postInit('/api/session', {}, 20000);
    if (r && r.ok && r.gate && r.gate.subscribed) writeSubCache({ subscribed: true });
    return r;
  }

  async function checkSubscription() {
    const cached = readSubCache();
    if (cached && cached.data && cached.data.subscribed) {
      return Object.assign({ cached: true }, cached.data);
    }
    if (!getInitData()) {
      return { subscribed: true, required: false, open: true, demo: true };
    }
    try {
      const r = await postInit('/api/sub/check', {}, 20000);
      if (r && r.ok && r.subscribed) writeSubCache(r);
      return r;
    } catch (_) {
      return { ok: false, subscribed: false, required: false, open: true, error: 'network' };
    }
  }

  return {
    CONFIG,
    init,
    setChromeTheme,
    haptic,
    getUser,
    openChannel,
    openTelegramLink,
    getStartParam,
    referralLink,
    shareReferral,
    openSession,
    checkSubscription,
    submitScore,
    fetchLeaderboard,
    flushPending,
    warmUp,
    isTelegram,
    getInitData,
  };
})();

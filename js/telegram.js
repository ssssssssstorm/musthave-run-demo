// Telegram WebApp SDK wrapper + fullscreen / safe-area handling + backend stubs
window.MH_TG = (function () {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  // Online leaderboard API (separate Render web service). `?api=<url>` overrides it for local testing.
  const DEFAULT_API = 'https://musthave-run-api.onrender.com';
  const apiParam = new URLSearchParams(window.location.search).get('api');
  function resolveApiBase() {
    if (apiParam && /^https?:\/\//.test(apiParam)) return apiParam.replace(/\/+$/, '');
    try {
      const origin = window.location.origin;
      if (origin === 'https://musthave-run.onrender.com') return DEFAULT_API;
      if (origin === 'https://ssssssssstorm.github.io') return DEFAULT_API;
    } catch (_) {}
    return null; // local / unknown origin: skip, so the console isn't filled with CORS errors
  }
  const CONFIG = {
    channelUsername: 'musthave_tobacco',
    channelUrl: 'https://t.me/musthave_tobacco',
    subscriptionApi: null,
    apiBaseUrl: resolveApiBase(),
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

  async function apiFetch(path, opts = {}, timeoutMs = 25000) {
    if (!CONFIG.apiBaseUrl) throw new Error('no_api');
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : 0;
    try {
      const res = await fetch(CONFIG.apiBaseUrl + path, Object.assign({}, opts, ctl ? { signal: ctl.signal } : {}));
      let data = null;
      try { data = await res.json(); } catch (_) {}
      return { status: res.status, data: data || {} };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Free Render services sleep when idle: wake the API as soon as the app opens
  function warmUp() {
    if (!CONFIG.apiBaseUrl) return;
    apiFetch('/api/health', {}, 60000).catch(() => {});
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

  function openChannel() {
    if (tg && tg.openTelegramLink) {
      try {
        tg.openTelegramLink(CONFIG.channelUrl);
        return;
      } catch (_) {}
    }
    window.open(CONFIG.channelUrl, '_blank', 'noopener');
  }

  async function checkSubscription() {
    // channel-subscription check is still a demo stub (no backend endpoint yet)
    if (CONFIG.subscriptionApi && tg && tg.initData) {
      const res = await fetch(`${CONFIG.subscriptionApi}/api/check-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg.initData }),
      });
      return res.json();
    }
    await new Promise(r => setTimeout(r, 650));
    return { subscribed: true, demo: true };
  }

  return {
    CONFIG,
    init,
    setChromeTheme,
    haptic,
    getUser,
    openChannel,
    checkSubscription,
    submitScore,
    fetchLeaderboard,
    flushPending,
    warmUp,
    isTelegram,
  };
})();

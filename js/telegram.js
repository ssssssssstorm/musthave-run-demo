// Telegram WebApp SDK wrapper + fullscreen / safe-area handling + backend stubs
window.MH_TG = (function () {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  const CONFIG = {
    channelUsername: 'musthave_tobacco',
    channelUrl: 'https://t.me/musthave_tobacco',
    apiBaseUrl: null,
  };

  function applySafeAreaVars() {
    const root = document.documentElement;
    if (!tg) return;
    const sa = tg.safeAreaInset || { top: 0, bottom: 0, left: 0, right: 0 };
    const ca = tg.contentSafeAreaInset || { top: 0, bottom: 0, left: 0, right: 0 };
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
      if (tg.expand) tg.expand();
      const canFs = typeof tg.requestFullscreen === 'function'
        && (!tg.isVersionAtLeast || tg.isVersionAtLeast('8.0'));
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
      if (tg.setHeaderColor) tg.setHeaderColor(col);
      if (tg.setBackgroundColor) tg.setBackgroundColor(col);
    } catch (_) {}
  }

  function init() {
    if (!tg) return;
    try {
      tg.ready();
      tryFullscreen();
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      setChromeTheme('night');
      applySafeAreaVars();

      if (tg.onEvent) {
        tg.onEvent('viewportChanged', notifyViewport);
        tg.onEvent('fullscreenChanged', notifyViewport);
        tg.onEvent('safeAreaChanged', notifyViewport);
        tg.onEvent('contentSafeAreaChanged', notifyViewport);
      }

      // Some mobile Telegram clients only allow fullscreen after a user gesture
      const onFirstTap = () => {
        tryFullscreen();
        window.removeEventListener('pointerdown', onFirstTap, true);
      };
      window.addEventListener('pointerdown', onFirstTap, true);
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

  function getUser() {
    const u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? tg.initDataUnsafe.user : null;
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
    if (CONFIG.apiBaseUrl && tg && tg.initData) {
      const res = await fetch(`${CONFIG.apiBaseUrl}/api/check-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg.initData }),
      });
      return res.json();
    }
    await new Promise(r => setTimeout(r, 650));
    return { subscribed: true, demo: true };
  }

  async function submitScore(score) {
    if (CONFIG.apiBaseUrl && tg && tg.initData) {
      await fetch(`${CONFIG.apiBaseUrl}/api/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg.initData, score }),
      });
    }
    return { ok: true, demo: true };
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
  };
})();

// Telegram WebApp SDK wrapper + clean backend integration stubs
window.MH_TG = (function () {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  // Config placeholders for production deployment
  const CONFIG = {
    channelUsername: 'musthave_tobacco',
    channelUrl: 'https://t.me/musthave_tobacco',
    // Replace with your real backend endpoint (Cloudflare Worker / Vercel / FastAPI / Node)
    // that verifies Telegram initData HMAC & calls Bot API getChatMember.
    apiBaseUrl: null,
  };

  function init() {
    if (!tg) return;
    try {
      tg.ready();
      tg.expand();
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      if (tg.setHeaderColor) tg.setHeaderColor('#261447');
      if (tg.setBackgroundColor) tg.setBackgroundColor('#140C1C');
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

  /**
   * Backend seam: Verify channel subscription.
   * In production, POST window.Telegram.WebApp.initData to `${CONFIG.apiBaseUrl}/api/check-subscription`
   * which validates initData signature and calls Telegram Bot API `getChatMember`.
   */
  async function checkSubscription() {
    if (CONFIG.apiBaseUrl && tg && tg.initData) {
      const res = await fetch(`${CONFIG.apiBaseUrl}/api/check-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg.initData }),
      });
      return res.json(); // expected: { subscribed: boolean }
    }
    // Demo mode mock verification delay
    await new Promise(r => setTimeout(r, 650));
    return { subscribed: true, demo: true };
  }

  /**
   * Backend seam: Submit run score & fetch live leaderboard.
   * In production, also handles referral `?startapp=ref_<userId>` (+1 life).
   */
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
    haptic,
    getUser,
    openChannel,
    checkSubscription,
    submitScore,
  };
})();

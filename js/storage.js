// Persistent player state, daily lives w/ 24h reset, VIP whitelist, debug params & mock leaderboard
window.MH_STORAGE = (function () {
  const STORAGE_KEY = 'musthave_run_v1';
  const DEFAULT_MAX_LIVES = 5;
  const VIP_MAX_LIVES = 100;
  const RESET_MS = 24 * 60 * 60 * 1000;

  // Telegram usernames (no '@'), compared case-insensitively to initDataUnsafe.user.username
  const VIP_USERNAMES = ['pnkmnmr', 'musthave_pinkman', 'ttvwraithh'];

  const MOCK_PLAYERS = [
    { id: 'u1', name: '@vibe_corgi', score: 38 },
    { id: 'u2', name: 'Алина_MH', score: 31 },
    { id: 'u3', name: '@darkside_pro', score: 26 },
    { id: 'u4', name: 'Димон', score: 22 },
    { id: 'u5', name: 'MangoQueen', score: 18 },
    { id: 'u6', name: '@kalyan_master', score: 15 },
    { id: 'u7', name: 'Кирилл', score: 11 },
    { id: 'u8', name: 'Peach_8bit', score: 8 },
    { id: 'u9', name: 'Лёха', score: 5 },
  ];

  function normalizeUsername(raw) {
    return String(raw || '').trim().replace(/^@+/, '').toLowerCase();
  }

  function resolveUsername() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('tguser')) {
      return normalizeUsername(params.get('tguser'));
    }
    try {
      const u = window.MH_TG && MH_TG.getUser && MH_TG.getUser();
      if (u && u.username) return normalizeUsername(u.username);
    } catch (_) {}
    return '';
  }

  function isVip(username) {
    const name = normalizeUsername(username || resolveUsername());
    return VIP_USERNAMES.indexOf(name) !== -1;
  }

  function getMaxLives(username) {
    return isVip(username) ? VIP_MAX_LIVES : DEFAULT_MAX_LIVES;
  }

  function defaultState(maxLives) {
    const cap = maxLives || DEFAULT_MAX_LIVES;
    return {
      lives: cap,
      maxLives: cap,
      depletedAt: null,
      bestScore: 0,
      subscribed: false,
      santaHat: true,
      sound: true,
      music: true,
      gamesPlayed: 0,
    };
  }

  function applyVipUpgrade(state, newMax) {
    const oldMax = state.maxLives || DEFAULT_MAX_LIVES;
    if (newMax <= oldMax) {
      state.maxLives = newMax;
      return state;
    }
    // Preserve attempts already used today: remaining = newMax - used
    const used = state.lives <= 0
      ? oldMax
      : Math.max(0, oldMax - state.lives);
    state.lives = Math.max(0, newMax - used);
    state.maxLives = newMax;
    if (state.lives > 0) {
      state.depletedAt = null;
    }
    return state;
  }

  function load() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset') === '1') {
      localStorage.removeItem(STORAGE_KEY);
    }

    const username = resolveUsername();
    const maxLives = getMaxLives(username);
    let state = defaultState(maxLives);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        state = Object.assign(defaultState(DEFAULT_MAX_LIVES), JSON.parse(raw));
      }
    } catch (_) {}

    // 24h reset (uses the player's current daily cap, including VIP 100)
    if (state.lives <= 0 && state.depletedAt) {
      if (Date.now() - state.depletedAt >= RESET_MS) {
        state.lives = maxLives;
        state.depletedAt = null;
        state.maxLives = maxLives;
      }
    }

    // If a VIP already burned some/all of their previous 5-life cap today, top up immediately
    applyVipUpgrade(state, maxLives);

    // Debug overrides for quick QA
    if (params.has('lives')) {
      const l = parseInt(params.get('lives'), 10);
      if (!Number.isNaN(l)) {
        state.lives = Math.max(0, Math.min(maxLives, l));
        state.depletedAt = state.lives === 0 ? (state.depletedAt || Date.now()) : null;
      }
    }
    if (params.get('sub') === '1') {
      state.subscribed = true;
    }

    save(state);
    return state;
  }

  function save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function spendLife(state) {
    state.lives = Math.max(0, state.lives - 1);
    if (state.lives === 0 && !state.depletedAt) {
      state.depletedAt = Date.now();
    }
    save(state);
  }

  function getRemainingResetMs(state) {
    if (state.lives > 0) return 0;
    const at = state.depletedAt || Date.now();
    return Math.max(0, RESET_MS - (Date.now() - at));
  }

  function getLeaderboard(state, user) {
    const list = MOCK_PLAYERS.map(p => ({ ...p, isMe: false }));
    list.push({
      id: user.id,
      name: user.name,
      score: state.bestScore,
      isMe: true,
    });
    list.sort((a, b) => b.score - a.score || (a.isMe ? -1 : 1));
    return list;
  }

  return {
    MAX_LIVES: DEFAULT_MAX_LIVES,
    DEFAULT_MAX_LIVES,
    VIP_MAX_LIVES,
    VIP_USERNAMES,
    normalizeUsername,
    isVip,
    getMaxLives,
    load,
    save,
    spendLife,
    getRemainingResetMs,
    getLeaderboard,
  };
})();

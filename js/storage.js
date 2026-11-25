// Persistent player state, 5 daily lives w/ 24h reset, debug params & mock leaderboard
window.MH_STORAGE = (function () {
  const STORAGE_KEY = 'musthave_run_v1';
  const MAX_LIVES = 5;
  const RESET_MS = 24 * 60 * 60 * 1000;

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

  function defaultState() {
    return {
      lives: MAX_LIVES,
      depletedAt: null, // timestamp when 5th life was spent -> resets after 24h
      bestScore: 0,
      subscribed: false,
      santaHat: true,
      sound: true,
      gamesPlayed: 0,
    };
  }

  function load() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset') === '1') {
      localStorage.removeItem(STORAGE_KEY);
    }

    let state = defaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        state = Object.assign(state, JSON.parse(raw));
      }
    } catch (_) {}

    // Check 24h reset
    if (state.lives <= 0 && state.depletedAt) {
      if (Date.now() - state.depletedAt >= RESET_MS) {
        state.lives = MAX_LIVES;
        state.depletedAt = null;
      }
    }

    // Debug overrides for quick QA
    if (params.has('lives')) {
      const l = parseInt(params.get('lives'), 10);
      if (!Number.isNaN(l)) {
        state.lives = Math.max(0, Math.min(MAX_LIVES, l));
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
    MAX_LIVES,
    load,
    save,
    spendLife,
    getRemainingResetMs,
    getLeaderboard,
  };
})();

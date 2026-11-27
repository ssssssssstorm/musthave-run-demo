(function () {
  if (!window.MH_SPRITES || !window.MH_STORAGE || !window.MH_AUDIO || !window.MH_TG) {
    if (window.__MH_CRASH) window.__MH_CRASH('DEPS', 'missing library');
    return;
  }
  const stageEl = document.getElementById('phone-stage');
  const canvas = document.getElementById('game-canvas');
  if (!stageEl || !canvas || !canvas.getContext) {
    if (window.__MH_CRASH) window.__MH_CRASH('CANVAS', 'stage missing');
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    if (window.__MH_CRASH) window.__MH_CRASH('CANVAS', 'no 2d context');
    return;
  }
  try { ctx.imageSmoothingEnabled = false; } catch (e) {}

  const goCanvas = document.getElementById('gameover-canvas');
  const goCtx = goCanvas && goCanvas.getContext ? goCanvas.getContext('2d') : null;
  goCtx.imageSmoothingEnabled = false;

  // Dynamic integer-scaled logical canvas size (edge-to-edge on any phone, zero letterboxing!)
  let W = 195;
  let H = 422;
  let GROUND_Y = 253;
  let MENU_GROUND_Y = 253;
  let CORGI_GROUND_TOP = 235;
  const PLAY_SCALE = 1;

  // ============================================================
  // PHYSICS, OBSTACLE HITBOXES & FAIRNESS MODEL
  // ============================================================
  const GRAVITY = 740;
  const JUMP_V = 305;           // first jump impulse (apex ~63px)
  const JUMP2_V = 300;          // second (air) jump impulse
  const AIR_T = (2 * JUMP_V) / GRAVITY;   // airtime of a single jump (~0.82s)
  const DJ_TS = 0.28;           // "natural" moment (s after take-off) of the 2nd jump, used by the fairness model
  const CORGI_HIT_W = 19;
  const REACT_T = 0.28;         // human reaction margin baked into every gap
  const FLIP_DUR = 0.52;        // somersault duration, 8 pixel steps
  const FLIP_STEPS = 8;

  // Speed: calm start, then the original time curve until the first score milestone.
  // At 500 / 1000 / 1500 / ... speed drops a bit and ramps back up (sawtooth, slight net growth).
  const RANK_EVERY = 500;
  const SPEED_MIN = 70;
  const SPEED_MAX = 220;
  const SPEED_DROP = 0.84;
  const SPEED_RAMP = 2.1;
  function baseSpeedAt(t) {
    return Math.min(SPEED_MAX, 105 + SPEED_RAMP * t - 35 * Math.exp(-t / 14));
  }
  function speedAt(t) {
    if (WORLD && WORLD.rankIndex > 0) {
      return Math.min(SPEED_MAX, Math.max(SPEED_MIN, WORLD.speedFloor + SPEED_RAMP * (WORLD.rankTime || 0)));
    }
    return baseSpeedAt(t);
  }

  // time window (s after take-off) during which a single jump keeps the corgi's feet above `h` px
  function singleWindow(h) {
    const disc = JUMP_V * JUMP_V - 2 * GRAVITY * h;
    if (disc <= 0) return null;
    const sq = Math.sqrt(disc);
    return [(JUMP_V - sq) / GRAVITY, (JUMP_V + sq) / GRAVITY];
  }

  // same for a double jump whose second tap lands `ts` seconds after take-off
  function doubleProfile(h, ts = DJ_TS) {
    const r0 = JUMP_V * ts - 0.5 * GRAVITY * ts * ts;
    const c = h - r0;
    const disc = JUMP2_V * JUMP2_V - 2 * GRAVITY * c;
    if (disc <= 0) return null;
    const sq = Math.sqrt(disc);
    const up = ts + Math.max(0, (JUMP2_V - sq) / GRAVITY);
    const down = ts + (JUMP2_V + sq) / GRAVITY;
    const land = ts + (JUMP2_V + Math.sqrt(JUMP2_V * JUMP2_V + 2 * GRAVITY * r0)) / GRAVITY;
    return { up, down, land };
  }

  // Obstacle table: hit rects are in sprite pixels (stem/flask etc. are separate rects, so empty air isn't deadly)
  const OBST = {};
  function defObstacle(kind, spr, rects, big) {
    const bx0 = Math.min(...rects.map(r => r.x));
    const bx1 = Math.max(...rects.map(r => r.x + r.w));
    const by0 = Math.min(...rects.map(r => r.y));
    OBST[kind] = {
      kind, w: spr.width, h: spr.height, rects, bx0, bx1, by0,
      wHit: bx1 - bx0,
      hth: spr.height - by0 - 1,   // how far the corgi's feet must rise to pass over the top of the hit area
      big: !!big,
    };
  }
  defObstacle('hookah', MH_SPRITES.obstacles.hookah, [{ x: 8, y: 4, w: 5, h: 14 }, { x: 6, y: 17, w: 11, h: 12 }]);
  defObstacle('hookahBig', MH_SPRITES.obstacles.hookahBig, [{ x: 16, y: 5, w: 11, h: 43 }, { x: 9, y: 47, w: 24, h: 25 }], true);
  defObstacle('shilavilki', MH_SPRITES.obstacles.shilavilki, [{ x: 2, y: 3, w: 12, h: 10 }, { x: 5, y: 12, w: 6, h: 16 }]);
  defObstacle('coals', MH_SPRITES.obstacles.coals[0], [{ x: 4, y: 4, w: 16, h: 8 }]);
  OBST.hookahBig.dj = doubleProfile(OBST.hookahBig.hth);
  // Duck-only bird flock. The lowest bird uses the old fair window: standing corgi (hit top 14px
  // up) is hit, a duck (hit top 9px) slides under. Higher birds fill the single- and double-jump
  // (and trampoline) arc, so jumping is never a way through. Always a solo pattern with extra gap.
  defObstacle('bird', MH_SPRITES.obstacles.bird[0], [{ x: 2, y: 1, w: 12, h: 15 }]);
  const BIRD_FLOCK = [
    { dx: 0, dy: 0 },
    { dx: 6, dy: -16 },
    { dx: -4, dy: -32 },
    { dx: 8, dy: -48 },
    { dx: -2, dy: -64 },
    { dx: 5, dy: -80 },
    { dx: -6, dy: -96 },
    { dx: 3, dy: -112 },
  ];
  OBST.bird.lift = 18;
  OBST.bird.air = true;
  OBST.bird.duckOnly = true;
  OBST.bird.flock = BIRD_FLOCK;
  OBST.bird.rects = BIRD_FLOCK.map(function (m, i) {
    return { x: 2 + m.dx, y: 1 + m.dy, w: 12, h: i === 0 ? 15 : 14 };
  });
  OBST.bird.bx0 = Math.min.apply(null, OBST.bird.rects.map(function (r) { return r.x; }));
  OBST.bird.bx1 = Math.max.apply(null, OBST.bird.rects.map(function (r) { return r.x + r.w; }));
  OBST.bird.by0 = Math.min.apply(null, OBST.bird.rects.map(function (r) { return r.y; }));
  OBST.bird.wHit = OBST.bird.bx1 - OBST.bird.bx0;
  OBST.bird.hth = 200;
  // MUSTHAVE tin trampoline: no hit rects, it launches the corgi high (with a flip)
  OBST.tramp = { kind: 'tramp', w: 24, h: 10, rects: [], bx0: 0, bx1: 24, by0: 0, wHit: 24, hth: 0, big: false, pad: true };
  const DUCK_TOP = 9;              // ducking hit box reaches 9px above the ground
  const FAST_FALL_V = 430;
  const BIRD_IMPACT_T = 1.22;      // min seconds from spawn to impact (grows with speed)
  const BIRD_GROUND_T = 0.62;      // grounded window required after the previous obstacle
  const BIRD_WARN_T = 1.05;        // edge warning starts this many seconds before impact
  const TUTORIAL_SPEED = 0.65;     // first flock of a run: ease to 65% speed
  const SPEED_EASE = 0.30;         // time constant for speed-scale ease in/out
  function trampHeight() { return Math.max(70, Math.min(130, GROUND_Y - 74)); }
  function trampV() { return Math.sqrt(2 * GRAVITY * trampHeight()); }
  function trampAir() { return (2 * trampV()) / GRAVITY; }

  function obstUpTime(d) {
    if (d.pad || d.duckOnly) return 0;
    return d.big ? d.dj.up : singleWindow(d.hth)[0];
  }
  function obstLandTime(d) {
    if (d.pad) return trampAir() + 0.35;   // the bounce may start until the rear paw leaves the tin
    if (d.duckOnly) return 0.22;          // short recover from a duck before the next jump
    return d.big ? d.dj.land : AIR_T;
  }

  // Features unlock progressively (run seconds) so the early game stays calm
  const UNLOCK = { combo: 0, tramp: 15, golden: 20, magnet: 25, bird: 30, shield: 35, rain: 40, smoke: 50 };
  const RAIN_DUR = 4.6;
  const MAGNET_DUR = 5;
  const MAGNET_R = 78;
  const INVULN_T = 1.3;
  const COMBO_STEPS = [0, 3, 6, 10, 15];   // streak needed for x2, x3, x4, x5
  const HINTS = {
    double: ['ТАП-ТАП!', 'ДВОЙНОЙ ПРЫЖОК'],
    combo: ['КОМБО!', 'ФРУКТЫ ПОДРЯД'],
    tramp: ['ПАЧКА-БАТУТ!', 'ПОДКИНЕТ ВЫСОКО'],
    golden: ['ЗОЛОТОЙ ФРУКТ', '+5 ОЧКОВ'],
    magnet: ['УГОЛЕК-МАГНИТ', 'ТЯНЕТ ФРУКТЫ'],
    bird: ['СТАЯ! ПРИГНИСЬ', 'СВАЙП ВНИЗ'],
    shield: ['КОЛПАК-ЩИТ', 'СПАСЕТ ОТ УДАРА'],
    smoke: ['ДЫМ ОТ УГЛЕЙ!', 'СМОТРИ СКВОЗЬ'],
  };
  // Minimum fair hit-box gap (px) between obstacle a (passed first) and b at world speed v:
  // the corgi has to land from a, react, and be airborne high enough again when it reaches b.
  function requiredGapPx(a, b, v) {
    if (b && b.duckOnly) {
      // Conservative: full land time from a, then a grounded window, so the player is not
      // mid-jump / mid-bounce when the flock arrives. Do not subtract a's up-time.
      const t = obstLandTime(a) + BIRD_GROUND_T;
      return Math.max(8, (v + 6) * t - a.wHit);
    }
    const t = obstLandTime(a) + REACT_T + obstUpTime(b) - obstUpTime(a);
    return Math.max(8, (v + 6) * t - a.wHit);
  }
  function birdLeadX(v) {
    const c = WORLD && WORLD.corgi ? WORLD.corgi : { x: 20 };
    const speed = Math.max(40, v || (WORLD && WORLD.speed) || SPEED_MIN);
    const hitFrom = c.x + 25;
    return Math.max(W + 14, hitFrom + speed * BIRD_IMPACT_T - (OBST.bird.bx0 || 0));
  }
  function birdTimeToImpact(o) {
    const front = (WORLD.corgi && WORLD.corgi.x || 20) + 25;
    const hitX = o.x + (OBST.bird.bx0 || 0);
    return (hitX - front) / Math.max(40, WORLD.speed || SPEED_MIN);
  }
  // Max hit-box gap (px) at which two small obstacles can still both be cleared by ONE jump
  function clusterMaxGap(a, b, v) {
    const w = singleWindow(Math.max(a.hth, b.hth));
    if (!w) return -1;
    return ((w[1] - w[0]) - 0.24) * (v + 6) - (a.wHit + b.wHit + CORGI_HIT_W);
  }

  const HEART_FULL_URI = MH_SPRITES.ui.heartFull.toDataURL();
  const HEART_EMPTY_URI = MH_SPRITES.ui.heartEmpty.toDataURL();
  const PINEAPPLE_URI = MH_SPRITES.fruits.pineapple.toDataURL();

  // DOM Elements
  const hudPills = document.getElementById('hud-pills');
  const btnHudBack = document.getElementById('btn-hud-back');
  const hudFruitIcon = document.getElementById('hud-fruit-icon');
  const hudHeartIcon = document.getElementById('hud-heart-icon');
  const hudScorePill = document.getElementById('hud-score').parentElement;
  const hudScoreEl = document.getElementById('hud-score');
  const hudLivesEl = document.getElementById('hud-lives');

  hudFruitIcon.src = PINEAPPLE_URI;
  hudHeartIcon.src = HEART_FULL_URI;

  const hudComboEl = document.getElementById('hud-combo');
  const hudMagnetEl = document.getElementById('hud-magnet');
  const hudMagnetT = document.getElementById('hud-magnet-t');
  const hudShieldEl = document.getElementById('hud-shield');
  document.getElementById('hud-magnet-icon').src = MH_SPRITES.pickups.coal.toDataURL();
  document.getElementById('hud-shield-icon').src = MH_SPRITES.pickups.hat.toDataURL();

  const topControls = document.getElementById('top-controls');
  const btnHat = document.getElementById('btn-hat');
  const btnSound = document.getElementById('btn-sound');
  const soundLabel = document.getElementById('sound-label');
  const btnMusic = document.getElementById('btn-music');
  const musicIcon = document.getElementById('music-icon');

  const screenStart = document.getElementById('screen-start');
  const startLivesBadge = document.getElementById('start-lives-badge');
  const startLockNote = document.getElementById('start-lock-note');
  const startTimer = document.getElementById('start-timer');
  const btnPlay = document.getElementById('btn-play');
  const btnRating = document.getElementById('btn-rating');
  const btnInvite = document.getElementById('btn-invite');
  const inviteCountEl = document.getElementById('invite-count');
  const btnAdmin = document.getElementById('btn-admin');
  const btnGoInvite = document.getElementById('btn-go-invite');
  const goInviteCountEl = document.getElementById('go-invite-count');
  const appToastEl = document.getElementById('app-toast');

  const screenSub = document.getElementById('screen-sub');
  const subStatus = document.getElementById('sub-status');
  const btnSubscribe = document.getElementById('btn-subscribe');
  const btnCheckSub = document.getElementById('btn-check-sub');
  const btnSubBack = document.getElementById('btn-sub-back');

  const screenGameOver = document.getElementById('screen-gameover');
  const goScoreEl = document.getElementById('go-score');
  const goBestEl = document.getElementById('go-best');
  const goLivesRow = document.getElementById('go-lives-row');
  const goActionsAlive = document.getElementById('go-actions-alive');
  const goActionsLocked = document.getElementById('go-actions-locked');
  const goTimer = document.getElementById('go-timer');
  const btnRetry = document.getElementById('btn-retry');
  const btnGoRating = document.getElementById('btn-go-rating');
  const btnGoMenu = document.getElementById('btn-go-menu');
  const btnGoRatingLocked = document.getElementById('btn-go-rating-locked');
  const btnGoMenuLocked = document.getElementById('btn-go-menu-locked');

  const screenRating = document.getElementById('screen-rating');
  const ratingList = document.getElementById('rating-list');
  const btnRatingBack = document.getElementById('btn-rating-back');

  MH_TG.init();
  const user = MH_TG.getUser();
  let serverMeta = {
    ready: false,
    gateRequired: false,
    subscribed: false,
    invited: 0,
    referralLink: '',
    vip: false,
    banned: false,
  };
  let toastTimer = 0;
  function showAppToast(msg, ms) {
    if (!appToastEl) return;
    appToastEl.textContent = msg;
    appToastEl.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { appToastEl.classList.add('hidden'); }, ms || 2800);
  }
  function updateInviteUI() {
    const n = serverMeta.invited || 0;
    const label = 'Друзей приглашено: ' + n;
    if (inviteCountEl) {
      inviteCountEl.textContent = label;
      inviteCountEl.classList.toggle('hidden', false);
    }
    if (goInviteCountEl) {
      goInviteCountEl.textContent = label;
      goInviteCountEl.classList.toggle('hidden', false);
    }
  }
  function onInviteClick() {
    MH_AUDIO.click();
    MH_TG.haptic('light');
    const ok = MH_TG.shareReferral(user.id);
    if (!ok) showAppToast('Открой игру в Telegram, чтобы пригласить друга');
  }
  if (btnInvite) btnInvite.addEventListener('click', onInviteClick);
  if (btnGoInvite) btnGoInvite.addEventListener('click', onInviteClick);
  if (btnAdmin) btnAdmin.addEventListener('click', function () {
    MH_AUDIO.click();
    try { window.location.href = 'admin.html'; } catch (_) {}
  });

  async function syncServerSession() {
    if (!MH_TG.isTelegram || !MH_TG.isTelegram()) return;
    try {
      const r = await MH_TG.openSession();
      if (!r || !r.ok) return;
      if (r.banned) {
        serverMeta.banned = true;
        showAppToast('Аккаунт заблокирован');
        if (btnPlay) btnPlay.disabled = true;
        return;
      }
      if (r.vip) {
        serverMeta.vip = true;
        const cap = r.maxLives || MH_STORAGE.VIP_MAX_LIVES;
        if (MH_STORAGE.applyVipUpgrade) MH_STORAGE.applyVipUpgrade(saveState, cap);
        else {
          saveState.maxLives = cap;
        }
        MH_STORAGE.save(saveState);
      }
      if (r.lives && r.lives.pending) {
        if (MH_STORAGE.grantLife) MH_STORAGE.grantLife(saveState, r.lives.pending);
        const n = r.lives.pending;
        const kind = r.lives.kinds && r.lives.kinds.referral ? 'referral' : (r.lives.kinds && r.lives.kinds.admin ? 'admin' : '');
        showAppToast(kind === 'admin'
          ? ('+' + n + ' ЖИЗНЬ от админа!')
          : ('+' + n + ' ЖИЗНЬ за друга!'), 3200);
        MH_TG.haptic('success');
      }
      if (r.gate) {
        serverMeta.gateRequired = !!r.gate.required;
        serverMeta.subscribed = !!r.gate.subscribed || !!r.gate.bypass || !r.gate.required;
        if (serverMeta.subscribed) {
          saveState.subscribed = true;
          MH_STORAGE.save(saveState);
        }
      }
      if (r.referral) {
        serverMeta.invited = r.referral.invited || 0;
        serverMeta.referralLink = r.referral.link || '';
      }
      if (r.admin && btnAdmin) btnAdmin.classList.remove('hidden');
      serverMeta.ready = true;
      updateInviteUI();
      refreshStartUI();
    } catch (_) {}
  }
  setTimeout(function () { syncServerSession(); }, 200);
  let saveState;
  try {
    saveState = MH_STORAGE.load();
  } catch (e) {
    saveState = { lives: 5, maxLives: 5, bestScore: 0, gamesPlayed: 0, subscribed: false, music: true, santaHat: false, hints: {} };
    if (window.__MH_CRASH) { /* keep going; storage already has a memory fallback */ }
  }
  MH_AUDIO.setEnabled(saveState.sound);
  MH_AUDIO.setMusicEnabled(saveState.music !== false);

  const params = new URLSearchParams(window.location.search);
  let autoJump = params.get('autojump') === '1';

  // ============================================================
  // CRISP BINARY PIXEL TEXT RENDERER
  // ============================================================
  const textScratch = document.createElement('canvas');
  textScratch.width = 210;
  textScratch.height = 32;
  const textCtx = textScratch.getContext('2d');

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = 210;
  maskCanvas.height = 32;
  const maskCtx = maskCanvas.getContext('2d');

  function drawOutlineTextMask(imgData, w, h, hexColor) {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const out = maskCtx.createImageData(w, h);
    for (let i = 0; i < imgData.data.length; i += 4) {
      if (imgData.data[i + 3] === 255) {
        out.data[i] = r;
        out.data[i + 1] = g;
        out.data[i + 2] = b;
        out.data[i + 3] = 255;
      }
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').putImageData(out, 0, 0);
    return c;
  }

  function drawPixelText(targetCtx, text, x, y, size, color, opts = {}) {
    const str = String(text);
    const pad = 4;
    textCtx.font = `${size}px "PressStart2P", monospace`;
    const metrics = textCtx.measureText(str);
    const tw = Math.min(textScratch.width - pad * 2, Math.ceil(metrics.width) + 4);
    const th = size + 6;
    textCtx.clearRect(0, 0, tw + pad * 2, th + pad * 2);
    textCtx.font = `${size}px "PressStart2P", monospace`;
    textCtx.textBaseline = 'top';
    textCtx.fillStyle = '#FFFFFF';
    textCtx.fillText(str, pad, pad);

    const img = textCtx.getImageData(pad, pad, tw, th);
    const d = img.data;
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] >= 100) {
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
        d[i + 3] = 255;
      } else {
        d[i + 3] = 0;
      }
    }
    textCtx.putImageData(img, pad, pad);

    let dx = Math.round(x);
    if (opts.align === 'center') dx = Math.round(x - metrics.width / 2);
    else if (opts.align === 'right') dx = Math.round(x - metrics.width);
    const dy = Math.round(y);

    if (opts.outline) {
      const oc = drawOutlineTextMask(img, tw, th, opts.outline);
      targetCtx.drawImage(oc, dx - 1, dy);
      targetCtx.drawImage(oc, dx + 1, dy);
      targetCtx.drawImage(oc, dx, dy - 1);
      targetCtx.drawImage(oc, dx, dy + 1);
    } else if (opts.shadow) {
      const sc = drawOutlineTextMask(img, tw, th, opts.shadow);
      targetCtx.drawImage(sc, dx + 1, dy + 1);
    }
    targetCtx.drawImage(textScratch, pad, pad, tw, th, dx, dy, tw, th);
  }

  // Same crisp text, rendered once per (text, size, colour) and then blitted - used for per-frame HUD text
  const textCache = new Map();
  function drawPixelTextCached(targetCtx, text, x, y, size, color, opts = {}) {
    const str = String(text);
    const key = str + '|' + size + '|' + color + '|' + (opts.outline || '');
    let e = textCache.get(key);
    if (!e) {
      textCtx.font = `${size}px "PressStart2P", monospace`;
      const mw = textCtx.measureText(str).width;
      const c = document.createElement('canvas');
      c.width = Math.min(208, Math.ceil(mw) + 8);
      c.height = size + 10;
      const cc = c.getContext('2d');
      cc.imageSmoothingEnabled = false;
      drawPixelText(cc, str, 2, 2, size, color, { outline: opts.outline });
      e = { c, mw };
      if (textCache.size > 240) textCache.clear();
      textCache.set(key, e);
    }
    let dx = Math.round(x);
    if (opts.align === 'center') dx = Math.round(x - e.mw / 2);
    else if (opts.align === 'right') dx = Math.round(x - e.mw);
    targetCtx.drawImage(e.c, dx - 2, Math.round(y) - 2);
  }

  // ============================================================
  // DITHERING & OFFSCREEN CACHED BACKGROUNDS
  // ============================================================
  const BAYER_4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }

  function renderDitheredGradient(sctx, width, height, stops) {
    const img = sctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      const t = y / Math.max(1, height - 1);
      let s = 0;
      while (s < stops.length - 2 && t > stops[s + 1].y) s++;
      const a = stops[s];
      const b = stops[s + 1];
      const localT = Math.max(0, Math.min(1, (t - a.y) / Math.max(0.0001, b.y - a.y)));

      for (let x = 0; x < width; x++) {
        const threshold = (BAYER_4[y & 3][x & 3] + 0.5) / 16;
        const col = localT > threshold ? b.col : a.col;
        const idx = (y * width + x) * 4;
        img.data[idx] = col[0];
        img.data[idx + 1] = col[1];
        img.data[idx + 2] = col[2];
        img.data[idx + 3] = 255;
      }
    }
    sctx.putImageData(img, 0, 0);
  }

  let skyCanvas = null;
  let groundBgCanvas = null;
  let nightBgCanvas = null;
  let sunGlowCanvas = null;
  let vignetteCanvas = null;
  let SUN_CX = 98;
  let SUN_CY = 128;

  function rebuildStaticCanvases() {
    SUN_CX = Math.round(W * 0.5);
    SUN_CY = Math.round(GROUND_Y * 0.50);

    // 1. Sunset Sky Canvas
    skyCanvas = document.createElement('canvas');
    skyCanvas.width = W;
    skyCanvas.height = GROUND_Y;
    const sctx = skyCanvas.getContext('2d');
    renderDitheredGradient(sctx, W, GROUND_Y, [
      { y: 0.00, col: hexToRgb('#2A154B') },
      { y: 0.14, col: hexToRgb('#471F5E') },
      { y: 0.28, col: hexToRgb('#6E2C6E') },
      { y: 0.42, col: hexToRgb('#9B3B7B') },
      { y: 0.55, col: hexToRgb('#CE4B86') },
      { y: 0.67, col: hexToRgb('#F5628D') },
      { y: 0.78, col: hexToRgb('#FF7E75') },
      { y: 0.88, col: hexToRgb('#FF9B68') },
      { y: 0.95, col: hexToRgb('#FFB76B') },
      { y: 1.00, col: hexToRgb('#FFD57A') },
    ]);

    // Vice City Retro Sliced Pixel Sun
    const sunR = 31;
    for (let dy = -sunR; dy <= sunR; dy++) {
      for (let dx = -sunR; dx <= sunR; dx++) {
        if (dx * dx + dy * dy <= sunR * sunR) {
          if (dy > 4) {
            const cutMod = (dy - 4) % 6;
            const cutSize = dy > 20 ? 3 : dy > 11 ? 2 : 1;
            if (cutMod < cutSize) continue;
          }
          const st = (dy + sunR) / (sunR * 2);
          if (st < 0.30) sctx.fillStyle = '#FFF380';
          else if (st < 0.56) sctx.fillStyle = '#FFD100';
          else if (st < 0.78) sctx.fillStyle = '#FF9E1B';
          else sctx.fillStyle = '#FF4A8D';
          sctx.fillRect(SUN_CX + dx, SUN_CY + dy, 1, 1);
        }
      }
    }

    // 2. Bayer-Dithered Pixel Sun Aura (100% crisp 1x1 pixels, zero smooth blur!)
    sunGlowCanvas = document.createElement('canvas');
    sunGlowCanvas.width = 92;
    sunGlowCanvas.height = 92;
    const sgctx = sunGlowCanvas.getContext('2d');
    sgctx.imageSmoothingEnabled = false;
    for (let y = 0; y < 92; y++) {
      for (let x = 0; x < 92; x++) {
        const dx = x - 46;
        const dy = y - 46;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 30 && d < 44) {
          const ringT = 1 - (d - 30) / 14;
          const thr = (BAYER_4[y & 3][x & 3] + 0.5) / 16;
          if (ringT * 0.65 > thr) {
            sgctx.fillStyle = d < 37 ? '#FFE082' : '#FF9CC2';
            sgctx.fillRect(x, y, 1, 1);
          }
        }
      }
    }

    // 3. Soft Sunset-to-Dusk Lower Ground Gradient
    const gh = H - GROUND_Y;
    groundBgCanvas = document.createElement('canvas');
    groundBgCanvas.width = W;
    groundBgCanvas.height = gh;
    const gctx = groundBgCanvas.getContext('2d');
    gctx.imageSmoothingEnabled = false;
    renderDitheredGradient(gctx, W, gh, [
      { y: 0.00, col: hexToRgb('#F7B08A') },
      { y: 0.10, col: hexToRgb('#DE8A84') },
      { y: 0.25, col: hexToRgb('#B86382') },
      { y: 0.48, col: hexToRgb('#844278') },
      { y: 0.74, col: hexToRgb('#542964') },
      { y: 1.00, col: hexToRgb('#311748') },
    ]);

    // 4. Night Vice City Sky + Pixel Distant Skyline + Wet Asphalt (Main Menu)
    nightBgCanvas = document.createElement('canvas');
    nightBgCanvas.width = W;
    nightBgCanvas.height = H;
    const nctx = nightBgCanvas.getContext('2d');
    nctx.imageSmoothingEnabled = false;
    renderDitheredGradient(nctx, W, MENU_GROUND_Y, [
      { y: 0.00, col: hexToRgb('#090316') },
      { y: 0.25, col: hexToRgb('#15082E') },
      { y: 0.55, col: hexToRgb('#280E47') },
      { y: 0.80, col: hexToRgb('#431559') },
      { y: 1.00, col: hexToRgb('#611B66') },
    ]);
    // Distant pixel-art night towers flanking the street
    const farNightPts = [
      { x: 0, w: 22, h: 36, roof: 'step' },
      { x: 20, w: 18, h: 52, roof: 'spire' },
      { x: 36, w: 20, h: 28, roof: 'notch' },
      { x: W - 62, w: 20, h: 34, roof: 'notch' },
      { x: W - 44, w: 22, h: 54, roof: 'step' },
      { x: W - 24, w: 24, h: 32, roof: 'gable' },
    ];
    const nightPal = {
      outline: '#0F0520',
      base: '#210B3B',
      hi: '#451A66',
      shade: '#16072A',
      winA: '#FF6CA8',
      winB: '#FFD166',
      winOff: '#120524',
    };
    for (const b of farNightPts) {
      drawPixelBuilding(nctx, b.x, MENU_GROUND_Y, b.w, b.h, b, nightPal);
    }

    // Sidewalk & Wet Asphalt Road
    const roadH = H - MENU_GROUND_Y;
    const roadImg = document.createElement('canvas');
    roadImg.width = W;
    roadImg.height = roadH;
    renderDitheredGradient(roadImg.getContext('2d'), W, roadH, [
      { y: 0.00, col: hexToRgb('#3D204F') },
      { y: 0.05, col: hexToRgb('#2A133C') },
      { y: 0.14, col: hexToRgb('#180A26') },
      { y: 0.35, col: hexToRgb('#12071E') },
      { y: 1.00, col: hexToRgb('#090312') },
    ]);
    nctx.drawImage(roadImg, 0, MENU_GROUND_Y);
    nctx.fillStyle = '#5B2D6E';
    nctx.fillRect(0, MENU_GROUND_Y, W, 1);
    nctx.fillStyle = '#140822';
    nctx.fillRect(0, MENU_GROUND_Y + 7, W, 1);
    for (let tx = 0; tx < W; tx += 22) {
      nctx.fillStyle = '#140822';
      nctx.fillRect(tx, MENU_GROUND_Y + 1, 1, 6);
    }
    for (let lx = 8; lx < W; lx += 24) {
      nctx.fillStyle = '#4A244C';
      nctx.fillRect(lx, MENU_GROUND_Y + 28, 12, 1);
    }

    // 5. Crisp Bayer-Dithered Pixel Corner Vignette (zero smooth gradients!)
    vignetteCanvas = document.createElement('canvas');
    vignetteCanvas.width = W;
    vignetteCanvas.height = H;
    const vctx = vignetteCanvas.getContext('2d');
    vctx.imageSmoothingEnabled = false;
    const vimg = vctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      const ny = (y / H - 0.48) * 2;
      for (let x = 0; x < W; x++) {
        const nx = (x / W - 0.5) * 2;
        const dist = Math.sqrt(nx * nx * 0.72 + ny * ny * 0.92);
        if (dist > 0.88) {
          const edgeT = Math.min(1, (dist - 0.88) / 0.55);
          const thr = (BAYER_4[y & 3][x & 3] + 0.5) / 16;
          if (edgeT * 0.45 > thr) {
            const idx = (y * W + x) * 4;
            vimg.data[idx] = 14;
            vimg.data[idx + 1] = 6;
            vimg.data[idx + 2] = 28;
            vimg.data[idx + 3] = 115;
          }
        }
      }
    }
    vctx.putImageData(vimg, 0, 0);
  }

  // ============================================================
  // 8-BIT PIXEL ART BUILDING GENERATOR (OUTLINES, DITHER, ROOFLINES)
  // ============================================================
  function drawPixelBuilding(bctx, x, baseY, w, h, opts, pal, extras) {
    const top = baseY - h;
    // 1. Irregular stepped pixel roofline (all integer 1x1 logical pixels)
    if (opts.roof === 'step') {
      bctx.fillStyle = pal.outline;
      bctx.fillRect(x + 2, top - 4, w - 4, 4);
      bctx.fillRect(x + 5, top - 7, w - 10, 3);
      bctx.fillStyle = pal.base;
      bctx.fillRect(x + 3, top - 3, w - 6, 3);
      bctx.fillRect(x + 6, top - 6, w - 12, 3);
      bctx.fillStyle = pal.hi;
      bctx.fillRect(x + 3, top - 3, w - 7, 1);
      bctx.fillRect(x + 6, top - 6, w - 13, 1);
    } else if (opts.roof === 'notch') {
      for (let rx = x + 1; rx < x + w - 2; rx += 4) {
        bctx.fillStyle = pal.outline;
        bctx.fillRect(rx, top - 3, 3, 3);
        bctx.fillStyle = pal.hi;
        bctx.fillRect(rx + 1, top - 2, 1, 2);
      }
    } else if (opts.roof === 'gable') {
      const steps = Math.min(5, Math.floor((w - 4) / 4));
      for (let s = 1; s <= steps; s++) {
        bctx.fillStyle = pal.outline;
        bctx.fillRect(x + s * 2, top - s, w - s * 4, 1);
        if (w - s * 4 > 4) {
          bctx.fillStyle = pal.base;
          bctx.fillRect(x + s * 2 + 1, top - s, w - s * 4 - 2, 1);
          bctx.fillStyle = pal.hi;
          bctx.fillRect(x + s * 2 + 1, top - s, 1, 1);
        }
      }
    } else if (opts.roof === 'slant') {
      for (let s = 0; s < 5; s++) {
        bctx.fillStyle = pal.outline;
        bctx.fillRect(x + 2 + s * 2, top - s - 1, w - 4 - s * 2, 1);
        if (w - 6 - s * 2 > 2) {
          bctx.fillStyle = pal.base;
          bctx.fillRect(x + 3 + s * 2, top - s - 1, w - 6 - s * 2, 1);
        }
      }
      bctx.fillStyle = pal.hi;
      bctx.fillRect(x + 3, top - 1, 2, 1);
    }

    // 2. Main body with 1px darker outline & sunlit top/left pixel rim
    bctx.fillStyle = pal.outline;
    bctx.fillRect(x, top, w, h);
    bctx.fillStyle = pal.base;
    bctx.fillRect(x + 1, top + 1, w - 2, h - 1);
    bctx.fillStyle = pal.hi;
    bctx.fillRect(x + 1, top + 1, w - 3, 1);
    bctx.fillRect(x + 1, top + 1, 1, h - 1);

    // 3. Dithered pixel shading on right side + horizontal floor bands
    const shadeW = Math.max(3, Math.floor(w * 0.28));
    for (let py = top + 2; py < baseY; py++) {
      if ((py - top) % 7 === 0) {
        bctx.fillStyle = pal.shade;
        bctx.fillRect(x + 2, py, w - 3, 1);
      }
      for (let dx = 0; dx < shadeW; dx++) {
        const px = x + w - 2 - dx;
        if (px <= x + 1) continue;
        if (dx === 0 || (dx < 2 && ((px + py) & 1) === 0) || (dx >= 2 && ((px + py) % 3 === 0))) {
          bctx.fillStyle = pal.shade;
          bctx.fillRect(px, py, 1, 1);
        }
      }
    }

    // 4. Rooftop pixel props (water tower, spire, AC box)
    if (opts.waterTower) {
      const tx = x + 4;
      bctx.fillStyle = pal.outline;
      bctx.fillRect(tx + 1, top - 4, 1, 4);
      bctx.fillRect(tx + 5, top - 4, 1, 4);
      bctx.fillRect(tx + 3, top - 3, 1, 1);
      bctx.fillRect(tx, top - 10, 7, 6);
      bctx.fillStyle = pal.base;
      bctx.fillRect(tx + 1, top - 9, 5, 4);
      bctx.fillStyle = pal.hi;
      bctx.fillRect(tx + 1, top - 11, 5, 1);
      bctx.fillStyle = pal.shade;
      bctx.fillRect(tx + 4, top - 9, 2, 4);
    }
    if (opts.ac) {
      bctx.fillStyle = pal.outline;
      bctx.fillRect(x + w - 10, top - 4, 7, 4);
      bctx.fillStyle = pal.shade;
      bctx.fillRect(x + w - 9, top - 3, 5, 2);
      bctx.fillStyle = pal.hi;
      bctx.fillRect(x + w - 9, top - 3, 2, 1);
    }
    if (opts.spire) {
      const sx = x + Math.floor(w / 2);
      const sy = top - (opts.roof === 'step' ? 14 : 10);
      bctx.fillStyle = pal.outline;
      bctx.fillRect(sx - 1, sy + 5, 3, 2);
      bctx.fillStyle = pal.hi;
      bctx.fillRect(sx, sy, 1, top - sy);
      if (extras && extras.blinkers) extras.blinkers.push({ x: sx, y: sy, phase: x * 0.13 });
    }

    // 5. Chunky pixel windows (2x2 or 1x2) with 1px dark sill/frame
    const winStepX = opts.winWide ? 5 : 4;
    const winW = opts.winWide ? 2 : 1;
    for (let wy = top + 4; wy < baseY - 4; wy += 5) {
      for (let wx = x + 3; wx < x + w - 4; wx += winStepX) {
        const hash = (wx * 7 + wy * 13 + x) % 9;
        bctx.fillStyle = pal.outline;
        bctx.fillRect(wx, wy + 2, winW, 1);
        if (hash === 0 || hash === 4) {
          bctx.fillStyle = ((wx + wy) % 3 === 0) ? pal.winA : pal.winB;
          bctx.fillRect(wx, wy, winW, 2);
          if (hash === 4 && extras && extras.flickers) {
            extras.flickers.push({ x: wx, y: wy, w: winW, phase: (wx + wy) * 0.7, offCol: pal.winOff });
          }
        } else if (hash === 2 || hash === 6) {
          bctx.fillStyle = pal.winOff;
          bctx.fillRect(wx, wy, winW, 2);
        }
      }
    }
  }

  // ============================================================
  // MULTI-LAYER PARALLAX CITY (FAR HAZY + MID DETAILED + NEON)
  // ============================================================
  const FAR_SKY_W = 280;
  const farSkylineCanvas = (function buildFarSkyline() {
    const c = document.createElement('canvas');
    c.width = FAR_SKY_W;
    c.height = 60;
    const sctx = c.getContext('2d');
    sctx.imageSmoothingEnabled = false;
    const pal = {
      outline: '#A13F70',
      base: '#C45587',
      hi: '#E27A9E',
      shade: '#B04677',
      winA: '#F7AAC1',
      winB: '#FCD0A1',
      winOff: '#AD4273',
    };
    const towers = [
      { x: 0, w: 24, h: 28, roof: 'step' },
      { x: 26, w: 18, h: 42, roof: 'spire', spire: true },
      { x: 46, w: 26, h: 24, roof: 'notch' },
      { x: 74, w: 20, h: 46, roof: 'gable' },
      { x: 96, w: 22, h: 32, roof: 'slant' },
      { x: 120, w: 26, h: 38, roof: 'step' },
      { x: 148, w: 18, h: 26, roof: 'notch' },
      { x: 168, w: 24, h: 48, roof: 'spire', spire: true },
      { x: 194, w: 20, h: 30, roof: 'slant' },
      { x: 216, w: 24, h: 36, roof: 'gable' },
      { x: 242, w: 20, h: 24, roof: 'step' },
      { x: 264, w: 16, h: 32, roof: 'notch' },
    ];
    for (const b of towers) {
      drawPixelBuilding(sctx, b.x, 60, b.w, b.h, b, pal);
    }
    return c;
  })();

  const MID_SKY_W = 340;
  const MID_BLINKERS = [];
  const MID_FLICKER_WINDOWS = [];
  const MID_NEON_SIGNS = [];

  const midSkylineCanvas = (function buildMidSkyline() {
    const c = document.createElement('canvas');
    c.width = MID_SKY_W;
    c.height = 68;
    const sctx = c.getContext('2d');
    sctx.imageSmoothingEnabled = false;
    const pal = {
      outline: '#481845',
      base: '#732D6A',
      hi: '#9D4B8C',
      shade: '#592054',
      winA: '#FF9CC2',
      winB: '#FFE082',
      winOff: '#4E1B4B',
    };
    const buildings = [
      { x: 0, w: 22, h: 24, roof: 'notch', waterTower: true, winWide: true },
      { x: 24, w: 18, h: 36, roof: 'step', spire: true },
      { x: 44, w: 28, h: 22, roof: 'notch', neon: 'MH', winWide: true },
      { x: 74, w: 20, h: 44, roof: 'gable', spire: true },
      { x: 96, w: 18, h: 18, roof: 'slant', ac: true },
      { x: 116, w: 28, h: 30, roof: 'step', hotelStrip: true, winWide: true },
      { x: 146, w: 20, h: 48, roof: 'step', spire: true },
      { x: 168, w: 24, h: 24, roof: 'notch', waterTower: true, winWide: true },
      { x: 194, w: 22, h: 34, roof: 'slant', ac: true },
      { x: 218, w: 22, h: 20, roof: 'notch', neon: 'PALM', winWide: true },
      { x: 242, w: 24, h: 40, roof: 'gable', spire: true },
      { x: 268, w: 22, h: 26, roof: 'step', ac: true, winWide: true },
      { x: 292, w: 24, h: 32, roof: 'slant', waterTower: true },
      { x: 318, w: 20, h: 22, roof: 'notch' },
    ];
    for (const b of buildings) {
      const top = 68 - b.h;
      drawPixelBuilding(sctx, b.x, 68, b.w, b.h, b, pal, {
        blinkers: MID_BLINKERS,
        flickers: MID_FLICKER_WINDOWS,
      });
      if (b.hotelStrip) {
        sctx.fillStyle = '#481845';
        sctx.fillRect(b.x + 2, top + 3, 4, b.h - 6);
        sctx.fillStyle = '#FF9CC2';
        sctx.fillRect(b.x + 3, top + 4, 2, b.h - 8);
      }
      if (b.neon === 'MH') {
        MID_NEON_SIGNS.push({ x: b.x + 4, y: top - 10, w: 20, h: 7, kind: 'MH' });
        sctx.fillStyle = '#481845';
        sctx.fillRect(b.x + 6, top - 4, 1, 4);
        sctx.fillRect(b.x + 21, top - 4, 1, 4);
      } else if (b.neon === 'PALM') {
        MID_NEON_SIGNS.push({ x: b.x + 3, y: top + 4, w: 14, h: 5, kind: 'BAR' });
      }
    }
    return c;
  })();

  // Swaying Palm Silhouettes (cached trunk + 3-frame canopy)
  const PALM_TRUNK = (function () {
    const rows = [
      '...........GG...........',
      '...........GG...........',
      '..........GGG...........',
      '..........GG............',
      '..........GG............',
      '.........GGG............',
      '.........GG.............',
      '.........GG.............',
      '........GGG.............',
      '........GG..............',
      '........GG..............',
      '........GG..............',
      '.......GGG..............',
      '.......GG...............',
      '.......GG...............',
      '.......GG...............',
      '......GGGG..............',
    ];
    return bakeSprite(rows, { '.': null, 'G': '#5A255E' });
  })();

  const PALM_FRONDS = [
    bakeSprite([
      '.....GGGGGG..GGGGGG.....',
      '...GGGGGGGGGGGGGGGGGG...',
      '.GGGG..GGGGGGGGGG..GGGG.',
      'GGG....GGGGGGGGGG....GGG',
      '.......GGG.GG.GGG.......',
      '......GGG..GG..GGG......',
    ], { '.': null, 'G': '#682C6B' }),
    bakeSprite([
      '....GGGGGG...GGGGGG.....',
      '..GGGGGGGGGGGGGGGGGGG...',
      'GGGG...GGGGGGGGGG...GGG.',
      'GG.....GGGGGGGGGG.....GG',
      '......GGG..GG..GGG......',
      '.....GGG...GG...GGG.....',
    ], { '.': null, 'G': '#682C6B' }),
    bakeSprite([
      '......GGGGGG..GGGGGG....',
      '....GGGGGGGGGGGGGGGGGG..',
      '..GGGG..GGGGGGGGGG..GGGG',
      '.GGG....GGGGGGGGGG....GG',
      '........GGG.GG.GGG......',
      '.......GGG..GG..GGG.....',
    ], { '.': null, 'G': '#682C6B' }),
  ];

  // ============================================================
  // PIXEL NEON SIGN GLYPHS (MUSTHAVE RUN) FOR NIGHT MENU
  // ============================================================
  const NEON_GLYPHS = {
    M: ['K...K', 'KK.KK', 'K.K.K', 'K...K', 'K...K', 'K...K', 'K...K'],
    U: ['K...K', 'K...K', 'K...K', 'K...K', 'K...K', 'K...K', '.KKK.'],
    S: ['.KKKK', 'K....', 'K....', '.KKK.', '....K', '....K', 'KKKK.'],
    T: ['KKKKK', '..K..', '..K..', '..K..', '..K..', '..K..', '..K..'],
    H: ['K...K', 'K...K', 'K...K', 'KKKKK', 'K...K', 'K...K', 'K...K'],
    A: ['.KKK.', 'K...K', 'K...K', 'KKKKK', 'K...K', 'K...K', 'K...K'],
    V: ['K...K', 'K...K', 'K...K', 'K...K', 'K...K', '.K.K.', '..K..'],
    E: ['KKKKK', 'K....', 'K....', 'KKKK.', 'K....', 'K....', 'KKKKK'],
    R: ['KKKK.', 'K...K', 'K...K', 'KKKK.', 'K.K..', 'K..K.', 'K...K'],
    N: ['K...K', 'KK..K', 'K.K.K', 'K..KK', 'K...K', 'K...K', 'K...K'],
  };

  function drawNeonGlyph(targetCtx, ch, x, y, scale, tubeCol, coreCol, glowCol, brightness) {
    const g = NEON_GLYPHS[ch];
    if (!g) return;
    if (brightness <= 0.08) {
      // Unlit dark glass tube
      targetCtx.fillStyle = 'rgba(65, 28, 72, 0.72)';
      for (let r = 0; r < g.length; r++) {
        for (let c = 0; c < g[r].length; c++) {
          if (g[r][c] === 'K') targetCtx.fillRect(x + c * scale, y + r * scale, scale, scale);
        }
      }
      return;
    }

    targetCtx.save();
    targetCtx.globalAlpha = Math.min(1, brightness);

    // Outer colored tube + crisp white-hot inner core
    for (let r = 0; r < g.length; r++) {
      for (let c = 0; c < g[r].length; c++) {
        if (g[r][c] === 'K') {
          const px = x + c * scale;
          const py = y + r * scale;
          targetCtx.fillStyle = tubeCol;
          targetCtx.fillRect(px - 1, py, scale + 2, scale);
          targetCtx.fillRect(px, py - 1, scale, scale + 2);
        }
      }
    }
    for (let r = 0; r < g.length; r++) {
      for (let c = 0; c < g[r].length; c++) {
        if (g[r][c] === 'K') {
          targetCtx.fillStyle = coreCol;
          targetCtx.fillRect(x + c * scale, y + r * scale, scale, scale);
        }
      }
    }
    targetCtx.restore();
  }


  const MINI_3X5 = {
    M: ['K.K', 'KKK', 'K.K', 'K.K', 'K.K'],
    A: ['.K.', 'K.K', 'KKK', 'K.K', 'K.K'],
    N: ['K.K', 'KKK', 'KKK', 'K.K', 'K.K'],
    G: ['.KK', 'K..', 'K.K', 'K.K', '.KK'],
    O: ['.K.', 'K.K', 'K.K', 'K.K', '.K.'],
    P: ['KK.', 'K.K', 'KK.', 'K..', 'K..'],
    E: ['KKK', 'K..', 'KK.', 'K..', 'KKK'],
    C: ['.KK', 'K..', 'K..', 'K..', '.KK'],
    H: ['K.K', 'K.K', 'KKK', 'K.K', 'K.K'],
    I: ['KKK', '.K.', '.K.', '.K.', 'KKK'],
    L: ['K..', 'K..', 'K..', 'K..', 'KKK'],
    '.': ['...', '...', '.K.', '...', '...'],
    ' ': ['...', '...', '...', '...', '...'],
  };

  function drawMiniNeonFlavors(targetCtx, cx, y) {
    const segs = [
      { text: 'MANGO', col: '#FF9E1B' },
      { text: ' . ', col: '#FF85B3' },
      { text: 'PEACH', col: '#FF8066' },
      { text: ' . ', col: '#FF85B3' },
      { text: 'PINEAPPLE', col: '#FFD100' },
    ];
    const totalChars = segs.reduce((acc, s) => acc + s.text.length, 0);
    let x = cx - Math.floor((totalChars * 4 - 1) / 2);
    for (const seg of segs) {
      targetCtx.fillStyle = seg.col;
      for (const ch of seg.text) {
        const g = MINI_3X5[ch];
        if (g) {
          for (let r = 0; r < 5; r++) {
            for (let c = 0; c < 3; c++) {
              if (g[r][c] === 'K') targetCtx.fillRect(x + c, y + r, 1, 1);
            }
          }
        }
        x += 4;
      }
    }
  }

  // ============================================================
  // HAT ANCHOR TABLE
  // ============================================================
  const HAT_ANCHORS = {
    hero: { x: 14, y: -2 },
    heroWag: { x: 14, y: -2 },
    front: { x: 6, y: -3 },
    backA: { x: 5, y: -3 },
    backB: { x: 5, y: -3 },
    backRight: { x: 9, y: -3 },
    frontRight: { x: 6, y: -3 },
    sideRight: { x: 15, y: -2 },
    run0: { x: 15, y: -2 },
    run1: { x: 15, y: -1 },
    run2: { x: 15, y: -1 },
    run3: { x: 15, y: -1 },
    run4: { x: 15, y: -2 },
    run5: { x: 15, y: -1 },
    crouch: { x: 15, y: -1 },
    jump: { x: 15, y: -2 },
    sleep: { x: 24, y: -1 },
    slide0: { x: 19, y: -4 },
    slide1: { x: 19, y: -4 },
  };

  function drawCorgiPose(targetCtx, poseKey, x, y, scale = 1) {
    const sprites = MH_SPRITES.corgi;
    let sprite = sprites.sideRight;
    let anchor = HAT_ANCHORS[poseKey] || { x: 14, y: -3 };

    if (poseKey.startsWith('run')) {
      const idx = parseInt(poseKey.slice(3), 10) || 0;
      sprite = sprites.run[idx];
    } else if (poseKey.startsWith('slide')) {
      sprite = sprites.slide[parseInt(poseKey.slice(5), 10) || 0];
    } else if (poseKey === 'sideLeft') {
      sprite = sprites.sideLeft;
      anchor = { x: sprite.width - HAT_ANCHORS.sideRight.x - MH_SPRITES.santaHat.width, y: HAT_ANCHORS.sideRight.y };
    } else if (poseKey === 'frontLeft') {
      sprite = sprites.frontLeft;
      anchor = { x: sprite.width - HAT_ANCHORS.frontRight.x - MH_SPRITES.santaHat.width, y: HAT_ANCHORS.frontRight.y };
    } else if (poseKey === 'backLeft') {
      sprite = sprites.backLeft;
      anchor = { x: sprite.width - HAT_ANCHORS.backRight.x - MH_SPRITES.santaHat.width, y: HAT_ANCHORS.backRight.y };
    } else if (sprites[poseKey]) {
      sprite = sprites[poseKey];
    }

    const px = Math.round(x);
    const py = Math.round(y);
    targetCtx.drawImage(sprite, px, py, sprite.width * scale, sprite.height * scale);

    if (saveState.santaHat) {
      const hat = MH_SPRITES.santaHat;
      targetCtx.drawImage(
        hat,
        px + anchor.x * scale,
        py + anchor.y * scale,
        hat.width * scale,
        hat.height * scale
      );
    }

    if (poseKey === 'run0' || poseKey === 'run2' || poseKey === 'heroWag') {
      const wy = poseKey === 'run0' ? py + 6 * scale : poseKey === 'heroWag' ? py + 9 * scale : py + 2 * scale;
      const wx = poseKey === 'heroWag' ? px - 2 * scale : px - 3 * scale;
      targetCtx.fillStyle = '#FFF9F2';
      targetCtx.fillRect(wx, wy, 2 * scale, 1 * scale);
      targetCtx.fillStyle = '#FF4A8D';
      targetCtx.fillRect(wx - 1 * scale, wy + 2 * scale, 2 * scale, 1 * scale);
    }
  }

  // ============================================================
  // GAME & AMBIENT WORLD STATE
  // ============================================================
  let mode = 'menu';
  let prevModeBeforeRating = 'menu';

  const STARS = Array.from({ length: 28 }, (_, i) => ({
    x: (i * 53 + 11) % 240 + 4,
    y: (i * 29 + 7) % 86 + 6,
    phase: i * 0.85,
    big: i % 6 === 0,
  }));

  const WORLD = {
    time: 0,
    menuTime: 0,
    transitionAlpha: 0,
    scrollFarSky: 0,
    scrollSkyline: 0,
    scrollPalms: 0,
    scrollGround: 0,
    clouds: [
      { x: 18, y: 38, speed: 2.3, kind: 'wisp' },
      { x: 132, y: 48, speed: 2.8, kind: 'wisp' },
      { x: 24, y: 74, speed: 5.2, kind: 'small' },
      { x: 148, y: 62, speed: 5.8, kind: 'small' },
      { x: 86, y: 98, speed: 7.4, kind: 'large' },
    ],
    birds: [
      // Far flock (3 seagulls)
      { x: 46, y: 58, speed: 12, depth: 'far', phase: 0.0 },
      { x: 37, y: 54, speed: 12, depth: 'far', phase: 1.4 },
      { x: 38, y: 63, speed: 12, depth: 'far', phase: 2.5 },
      // Closer gliding pair
      { x: 158, y: 84, speed: 18, depth: 'near', phase: 0.7 },
      { x: 170, y: 89, speed: 18, depth: 'near', phase: 2.2 },
    ],
    skyCraft: { x: 168, y: 42, kind: 'blimp', speed: 6.5, cooldown: 0 },
    shootingStar: { active: false, x: 150, y: 20, vx: -72, vy: 28, life: 0, cooldown: 5.5 },
    windStreaks: [],
    windCooldown: 1.8,
    petals: Array.from({ length: 8 }, (_, i) => ({
      x: (i * 31) % 210,
      y: 110 + (i * 23) % 120,
      vx: -14 - (i % 3) * 4,
      vy: 4 + (i % 2) * 3,
      phase: i * 1.1,
      color: i % 3 === 0 ? '#FFB7D5' : i % 3 === 1 ? '#FF9E6D' : '#FFD57A',
    })),
    // Night menu street ambients
    steamPuffs: [],
    steamTimer: 0,
    carPass: { active: false, x: -40, dir: 1, cooldown: 2.0 },
    speed: 105,
    score: 0,
    runTime: 0,
    introTime: 0,
    introSpinStep: -1,
    crashFlash: 0,
    hitFreeze: 0,
    menuIdle: { kind: "wag", timer: 0, dur: 2.4, hopDustDone: false },
    corgi: {
      x: 20,
      y: CORGI_GROUND_TOP,
      vy: 0,
      grounded: true,
      jumpBuffer: 0,
      animTimer: 0,
      runFrame: 0,
      sparkleTimer: 0,
      jumps: 0,
      airTime: 0,
      flipT: -1,
      wasDucking: false,
    },
    obstacles: [],
    fruits: [],
    particles: [],
    popups: [],
    puffs: [],
    pending: null,
    tail: null,
    patternCount: 0,
    hintT: 0,
    spawnLog: [],
    spawnCooldown: 1.0,
    dustTimer: 0,
    // feature round 3
    pickups: [],
    combo: 0,
    mult: 1,
    magnetT: 0,
    shield: false,
    invulnT: 0,
    softFlash: 0,
    rain: null,
    nextRainAt: UNLOCK.rain,
    smoke: null,
    nextSmokeAt: UNLOCK.smoke,
    nextPickupAt: UNLOCK.magnet,
    lastGoldenAt: -99,
    toasts: [],
    banner: null,
    duckKey: false,
    duckTouch: false,
    duckMinUntil: 0,
    duckBuffered: false,
    botDuck: false,
    birdHintsThisRun: 0,
    speedScale: 1,
    speedScaleTarget: 1,
    tutorialBirdDone: false,
    stats: null,
  };

  function newStats() {
    return {
      tramps: 0, bounces: 0, birds: 0, birdsPassed: 0, ducks: 0, fastFalls: 0,
      magnets: 0, shields: 0, shieldBreaks: 0, golden: 0, goldenSpawned: 0,
      fruits: 0, pickupsSpawned: 0, rains: 0, rainFruit: 0, smokes: 0, maxMult: 1, comboBreaks: 0, missed: 0,
      bonusLives: 0,
    };
  }
  WORLD.stats = newStats();

  function syncViewportSize() {
    const sw = Math.max(300, stageEl.clientWidth || 390);
    const sh = Math.max(480, stageEl.clientHeight || 844);
    const pxScale = Math.max(2, Math.round(sw / 195));
    const nextW = Math.max(168, Math.ceil(sw / pxScale));
    const nextH = Math.max(280, Math.ceil(sh / pxScale));
    if (nextW !== W || nextH !== H || !skyCanvas) {
      W = nextW;
      H = nextH;
      GROUND_Y = Math.round(H * 0.60);
      MENU_GROUND_Y = GROUND_Y;
      CORGI_GROUND_TOP = GROUND_Y - 18;
      canvas.width = W;
      canvas.height = H;
      ctx.imageSmoothingEnabled = false;
      if (WORLD.corgi.grounded) WORLD.corgi.y = CORGI_GROUND_TOP;
      rebuildStaticCanvases();
    }
  }

  window.addEventListener('resize', syncViewportSize);
  window.addEventListener('mh-viewport', syncViewportSize);
  syncViewportSize();

  function getDailyMaxLives() {
    return (saveState && saveState.maxLives) || MH_STORAGE.getMaxLives();
  }

  function updateHUDPills(popScore = false) {
    hudScoreEl.textContent = String(WORLD.score);
    const maxL = getDailyMaxLives();
    hudLivesEl.textContent = maxL > 5 ? ('×' + saveState.lives) : String(saveState.lives);
    if (popScore) {
      hudScorePill.classList.remove('score-pop');
      void hudScorePill.offsetWidth;
      hudScorePill.classList.add('score-pop');
    }
  }

  function resetRunWorld() {
    WORLD.bonusAwarded = [false, false, false];
    WORLD.rankIndex = 0;
    WORLD.rankTime = 0;
    WORLD.speedFloor = 0;
    WORLD.speed = speedAt(0);
    WORLD.score = 0;
    WORLD.runTime = 0;
    WORLD.introTime = 0;
    WORLD.introSpinStep = -1;
    WORLD.crashFlash = 0;
    WORLD.hitFreeze = 0;
    WORLD.transitionAlpha = 0.72;
    WORLD.corgi.x = 20;
    WORLD.corgi.y = CORGI_GROUND_TOP;
    WORLD.corgi.vy = 0;
    WORLD.corgi.grounded = true;
    WORLD.corgi.jumpBuffer = 0;
    WORLD.corgi.animTimer = 0;
    WORLD.corgi.runFrame = 0;
    WORLD.corgi.sparkleTimer = 0;
    WORLD.corgi.jumps = 0;
    WORLD.corgi.airTime = 0;
    WORLD.corgi.flipT = -1;
    WORLD.obstacles = [];
    WORLD.fruits = [];
    WORLD.particles = [];
    WORLD.popups = [];
    WORLD.puffs = [];
    WORLD.pending = null;
    WORLD.tail = null;
    WORLD.patternCount = 0;
    WORLD.hintT = 0;
    WORLD.spawnLog = [];
    WORLD.spawnCooldown = 1.0;
    WORLD.dustTimer = 0;
    WORLD.pickups = [];
    WORLD.combo = 0;
    WORLD.mult = 1;
    WORLD.magnetT = 0;
    WORLD.shield = false;
    WORLD.invulnT = 0;
    WORLD.softFlash = 0;
    WORLD.rain = null;
    WORLD.nextRainAt = UNLOCK.rain;
    WORLD.smoke = null;
    WORLD.nextSmokeAt = UNLOCK.smoke;
    WORLD.nextPickupAt = UNLOCK.magnet;
    WORLD.lastGoldenAt = -99;
    WORLD.toasts = [];
    WORLD.banner = null;
    WORLD.duckKey = false;
    WORLD.duckTouch = false;
    WORLD.duckMinUntil = 0;
    WORLD.duckBuffered = false;
    WORLD.botDuck = false;
    WORLD.birdHintsThisRun = 0;
    WORLD.speedScale = 1;
    WORLD.speedScaleTarget = 1;
    WORLD.tutorialBirdDone = false;
    WORLD.corgi.wasDucking = false;
    WORLD.stats = newStats();
    WORLD.runId = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    if (window.MH_AUDIO && typeof MH_AUDIO.setTrack === 'function') {
      try { MH_AUDIO.setTrack(0, 0.25); } catch (e) {}
    }
    updateHUDPills(false);
    updateStatusHUD(true);
  }

  // Combo / magnet / shield pills under the score (DOM only touched when something changes)
  let statusKey = '';
  let lastMultShown = 1;
  function updateStatusHUD(force = false) {
    const mult = WORLD.mult;
    const mag = WORLD.magnetT > 0 ? Math.ceil(WORLD.magnetT) : 0;
    const key = mult + '|' + mag + '|' + (WORLD.shield ? 1 : 0);
    if (key === statusKey && !force) return;
    statusKey = key;
    hudComboEl.classList.toggle('hidden', mult < 2);
    if (mult >= 2) {
      hudComboEl.textContent = 'x' + mult;
      if (mult > lastMultShown) {
        hudComboEl.classList.remove('pop');
        void hudComboEl.offsetWidth;
        hudComboEl.classList.add('pop');
      }
    }
    lastMultShown = mult;
    hudMagnetEl.classList.toggle('hidden', mag <= 0);
    hudMagnetEl.classList.toggle('low', mag > 0 && mag <= 1);
    if (mag > 0) hudMagnetT.textContent = String(mag);
    hudShieldEl.classList.toggle('hidden', !WORLD.shield);
  }

  // One-time pixel toasts, remembered in the save so each feature is explained only once
  let lastInputKeyboard = false;
  // Popup "СМАХНИ ВНИЗ" + pixel arrow when a bird approaches. Shown every time in the first
  // few runs, and for the first several birds of later runs — not only once.
  const BIRD_HINT_PER_RUN = 4;
  const BIRD_HINT_EARLY_GAMES = 3;
  function maybeShowBirdHint(o) {
    if (o.hintArmed) return;
    if (o.x + o.w < WORLD.corgi.x + 4) return;
    const tti = birdTimeToImpact(o);
    // Tutorial: show as soon as the flock exists. Later: once time-to-impact is ~1.35s.
    if (!o.tutorial && tti > 1.35) return;
    o.hintArmed = true;
    const early = (saveState.gamesPlayed || 0) < BIRD_HINT_EARLY_GAMES;
    if (!o.tutorial && !early && WORLD.birdHintsThisRun >= BIRD_HINT_PER_RUN) return;
    o.hintT = 0;
    o.showHint = true;
    WORLD.birdHintsThisRun += 1;
  }
  function drawDownArrow(targetCtx, cx, y, color) {
    const x = Math.round(cx);
    const y0 = Math.round(y);
    targetCtx.fillStyle = color;
    targetCtx.fillRect(x - 1, y0, 3, 1);
    targetCtx.fillRect(x - 1, y0 + 1, 3, 2);
    targetCtx.fillRect(x - 3, y0 + 3, 7, 1);
    targetCtx.fillRect(x - 2, y0 + 4, 5, 1);
    targetCtx.fillRect(x - 1, y0 + 5, 3, 1);
    targetCtx.fillRect(x, y0 + 6, 1, 1);
  }
  function featureSeen(key) {
    if (!saveState.hints || typeof saveState.hints !== 'object') saveState.hints = {};
    if (saveState.hints[key]) return;
    saveState.hints[key] = true;
    MH_STORAGE.save(saveState);
    let lines = HINTS[key];
    if (key === 'bird' && lastInputKeyboard) lines = ['ПТИЦА! ПРИГНИСЬ', 'СТРЕЛКА ВНИЗ / S'];
    if (WORLD.toasts.length < 4) WORLD.toasts.push({ key, lines, t: 0, dur: 2.6 });
  }

  // ============================================================
  // PARTICLES & POPUPS
  // ============================================================
  function spawnDust(x, y, count = 4, spread = 1) {
    for (let i = 0; i < count; i++) {
      const dir = spread > 1 && i % 2 === 1 ? 1 : -1;
      WORLD.particles.push({
        x: x + (Math.random() - 0.5) * 6 * spread,
        y: y - Math.random() * 3,
        vx: dir * (12 + Math.random() * 26) - (spread === 1 ? 14 : 0),
        vy: -8 - Math.random() * 20,
        life: 0.28 + Math.random() * 0.2,
        maxLife: 0.48,
        size: Math.random() > 0.55 ? 2 : 1,
        color: Math.random() > 0.4 ? '#FFF0E6' : '#FFB3C6',
        grav: 85,
      });
    }
  }

  function spawnFruitSparkles(x, y, kind, text = '+1') {
    const palette = kind === 'golden'
      ? ['#FFD100', '#FFF9F2', '#FFF1A0', '#FFB000']
      : kind === 'pineapple'
      ? ['#FFD100', '#FFF9F2', '#3ED568']
      : kind === 'peach'
        ? ['#FF8066', '#FF4A8D', '#FFD100']
        : ['#FF9E1B', '#FFD100', '#FFF9F2'];
    const nSp = kind === 'golden' ? 22 : 14;
    for (let i = 0; i < nSp; i++) {
      const ang = (Math.PI * 2 * i) / nSp + Math.random() * 0.3;
      const spd = 28 + Math.random() * 46;
      WORLD.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 12,
        life: 0.36 + Math.random() * 0.18,
        maxLife: 0.54,
        size: i % 3 === 0 ? 2 : 1,
        color: palette[i % palette.length],
        grav: 90,
      });
    }
    WORLD.popups.push({
      x,
      y: y - 4,
      text,
      life: 0.72,
      maxLife: 0.72,
    });
  }

  function addPopup(x, y, text, color = '#FFD100', life = 0.8) {
    WORLD.popups.push({ x, y, text, color, life, maxLife: life });
  }

  const BONUS_AT = [500, 1000, 1250];
  function grantBonusLife() {
    WORLD.stats.bonusLives = (WORLD.stats.bonusLives || 0) + 1;
    if (MH_STORAGE.grantLife) MH_STORAGE.grantLife(saveState, 1);
    else { saveState.lives = (saveState.lives || 0) + 1; MH_STORAGE.save(saveState); }
    updateHUDPills(true);
    const c = WORLD.corgi;
    addPopup(Math.round(W / 2), Math.round(H * 0.36), '+1 ЖИЗНЬ!', '#FF4A8D', 1.45);
    spawnRing(c.x + 14, c.y + 4, 12, ['#FF4A8D', '#FFD100', '#FFF9F2'], 42, 0.7);
    if (MH_AUDIO.lifeUp) MH_AUDIO.lifeUp();
    MH_TG.haptic('medium');
  }
  function applyRankUp(n) {
    const cur = WORLD.speed || baseSpeedAt(WORLD.runTime || 0);
    WORLD.speedFloor = Math.max(SPEED_MIN, Math.round(cur * SPEED_DROP));
    WORLD.speed = WORLD.speedFloor;
    WORLD.rankTime = 0;
    WORLD.rankIndex = n;
    if (window.MH_AUDIO && typeof MH_AUDIO.setTrack === 'function') {
      try { MH_AUDIO.setTrack(n, 0.45); } catch (e) {}
    }
    if (MH_AUDIO.rankUp) MH_AUDIO.rankUp();
    WORLD.banner = { lines: ['НОВЫЙ РАНГ', String(n * RANK_EVERY)], t: 0, dur: 2.2 };
    MH_TG.haptic('medium');
  }
  function onScoreChanged(prev) {
    const next = WORLD.score;
    if (!(next > prev)) return;
    if (!WORLD.bonusAwarded) WORLD.bonusAwarded = [false, false, false];
    for (let i = 0; i < BONUS_AT.length; i++) {
      if (!WORLD.bonusAwarded[i] && prev < BONUS_AT[i] && next >= BONUS_AT[i]) {
        WORLD.bonusAwarded[i] = true;
        grantBonusLife();
      }
    }
    const prevM = Math.floor(Math.max(0, prev) / RANK_EVERY);
    const nextM = Math.floor(Math.max(0, next) / RANK_EVERY);
    if (nextM > prevM && next >= RANK_EVERY) {
      applyRankUp(nextM);
    }
  }

  function spawnRing(x, y, count, colors, speed, life) {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count;
      WORLD.particles.push({
        x, y,
        vx: Math.cos(ang) * speed * (i % 2 ? 1 : 0.7),
        vy: Math.sin(ang) * speed * (i % 2 ? 1 : 0.7),
        life, maxLife: life, size: i % 3 === 0 ? 2 : 1,
        color: colors[i % colors.length], grav: 30,
      });
    }
  }

  // ============================================================
  // OBSTACLE & FRUIT SPAWNER
  // ============================================================
  const FRUIT_KINDS = ['pineapple', 'peach', 'mango'];
  const FRUIT_SPACING = 20;
  let lastKinds = [];
  let hintShown = false;
  let doubleJumpCount = 0;

  function randRange(a, b) {
    return a + Math.random() * (b - a);
  }

  function randomFruitKind() {
    return FRUIT_KINDS[Math.floor(Math.random() * FRUIT_KINDS.length)];
  }
  // rare golden fruit (+5): unlocked at UNLOCK.golden, never more often than once per 8 s
  function rollGolden(chance = 0.07) {
    if (WORLD.runTime < UNLOCK.golden || WORLD.runTime - WORLD.lastGoldenAt < 8) return false;
    if (Math.random() >= chance) return false;
    WORLD.lastGoldenAt = WORLD.runTime;
    WORLD.stats.goldenSpawned += 1;
    return true;
  }
  function makeFruit(kind, x, y, extra) {
    const fs = MH_SPRITES.fruits[kind];
    return Object.assign({ kind, x, baseY: y, w: fs.width, h: fs.height, phase: Math.random() * Math.PI * 2, collected: false }, extra || {});
  }

  function pickSmallKind() {
    let kind = 'coals';
    for (let i = 0; i < 4; i++) {
      const r = Math.random();
      kind = r < 0.3 ? 'hookah' : r < 0.6 ? 'shilavilki' : 'coals';
      const n = lastKinds.length;
      const triple = n >= 2 && lastKinds[n - 1] === kind && lastKinds[n - 2] === kind;
      const repeat = n >= 1 && lastKinds[n - 1] === kind && Math.random() < 0.5;
      if (!triple && !repeat) break;
    }
    return kind;
  }

  // One pattern = a single obstacle, a "cluster" of two small ones (only when ONE jump can clear both) or a BIG hookah
  function buildPattern(v) {
    const rt = WORLD.runTime;
    const lastK = lastKinds[lastKinds.length - 1];
    const rs = Math.random();
    // specials: the tin trampoline and the low bird are always solo patterns (never clustered with ground obstacles)
    if (rt >= UNLOCK.tramp && WORLD.patternCount >= 3 && lastK !== 'tramp' && lastK !== 'hookahBig' && rs < 0.1) {
      return [{ kind: 'tramp', off: 0 }];
    }
    if (rt >= UNLOCK.bird && WORLD.patternCount >= 3 && lastK !== 'bird' && rs >= 0.1 && rs < 0.24) {
      return [{ kind: 'bird', off: 0 }];
    }
    const r = Math.random();
    if (rt >= 12 && WORLD.patternCount >= 3 && r < 0.2) {
      return [{ kind: 'hookahBig', off: 0 }];
    }
    if (rt >= 8 && r < 0.38) {
      const ka = pickSmallKind();
      const kb = pickSmallKind();
      const a = OBST[ka];
      const b = OBST[kb];
      const gMax = clusterMaxGap(a, b, v);
      if (gMax >= 5) {
        const g = Math.round(randRange(4, Math.max(4.5, gMax * 0.85)));
        return [{ kind: ka, off: 0 }, { kind: kb, off: a.bx1 + g - b.bx0 }];
      }
    }
    return [{ kind: pickSmallKind(), off: 0 }];
  }

  // Choose the NEXT pattern and the distance to it: always >= the fair minimum, then short / medium / long on top
  function planNext() {
    const v = WORLD.speed;
    const items = buildPattern(v);
    const first = OBST[items[0].kind];
    const tail = WORLD.tail;
    const early = WORLD.runTime < 15;
    const r = Math.random();
    let bucket = early
      ? (r < 0.12 ? 'short' : r < 0.62 ? 'medium' : 'long')
      : (r < 0.3 ? 'short' : r < 0.72 ? 'medium' : 'long');
    if (first.big && bucket === 'short') bucket = 'medium';
    if (first.duckOnly && bucket === 'short') bucket = 'medium';
    const extra = bucket === 'short' ? randRange(0.02, 0.14) : bucket === 'medium' ? randRange(0.28, 0.65) : randRange(0.85, 1.5);
    const req = requiredGapPx(tail.def, first, v);
    const gap = req + extra * v;
    WORLD.pending = { items, bucket, gap, req };
    WORLD.spawnCooldown = (gap + tail.off + tail.def.bx1 - first.bx0) / v;
    if (scheduleRainIfDue(tail, first, v)) return;
    if (tail.def.pad) return;   // the stretch after a tin is under the bounce arc (its fruit is placed up high)
    placeGapFruit(tail, gap, v, bucket);
  }

  // Fruit rain: hold the next obstacle back so the stretch is obstacle-free, then let fruit pour from the sky
  function scheduleRainIfDue(tail, first, v) {
    if (WORLD.rain || WORLD.runTime < WORLD.nextRainAt) return false;
    const front = WORLD.corgi.x + 25;
    const startIn = Math.max(0.2, (W + 14 + tail.off + tail.def.bx0 - front) / v + obstLandTime(tail.def) - obstUpTime(tail.def) + 0.2);
    const need = startIn + RAIN_DUR + 0.9 - (W + 14 + first.bx0 - front) / v;
    WORLD.spawnCooldown = Math.max(WORLD.spawnCooldown, need);
    WORLD.rain = { startIn, t: 0, dur: RAIN_DUR, active: false, spawnT: 0, goldenDone: false };
    WORLD.nextRainAt = WORLD.runTime + startIn + randRange(30, 38);
    if (WORLD.smoke) WORLD.smoke.t = Math.max(WORLD.smoke.t, WORLD.smoke.dur - 0.4);
    return true;
  }

  function updateRain(dt) {
    const rn = WORLD.rain;
    if (!rn) return;
    if (!rn.active) {
      rn.startIn -= dt;
      if (rn.startIn <= 0) {
        rn.active = true;
        WORLD.banner = { lines: ['ФРУКТОВЫЙ', 'ДОЖДЬ!'], t: 0, dur: 2.2 };
        WORLD.stats.rains += 1;
        MH_AUDIO.rain();
        MH_TG.haptic('light');
      }
      return;
    }
    rn.t += dt;
    rn.spawnT -= dt;
    const front = WORLD.corgi.x + 25;
    const v = WORLD.speed;
    if (rn.t < rn.dur - 0.4 && rn.spawnT <= 0) {
      rn.spawnT = 0.075 + Math.random() * 0.04;
      const remain = rn.dur - rn.t;
      const xMin = front + v * 0.5;
      const xMax = Math.min(W + 6, front + v * (remain + 0.2));
      if (xMax > xMin) {
        let kind = randomFruitKind();
        if (!rn.goldenDone && rn.t > 1.0 && WORLD.runTime >= UNLOCK.golden && Math.random() < 0.2) {
          kind = 'golden';
          rn.goldenDone = true;
          WORLD.stats.goldenSpawned += 1;
        }
        const targetY = GROUND_Y - 22 - Math.random() * 50;
        WORLD.fruits.push(makeFruit(kind, xMin + Math.random() * (xMax - xMin), -18 - Math.random() * 10, {
          targetY, vy: 250 + Math.random() * 70, rain: true,
        }));
        WORLD.stats.rainFruit += 1;
      }
    }
    if (rn.t >= rn.dur) WORLD.rain = null;
  }

  // Coal smoke: a short drifting dithered patch over the ground ahead; obstacles under it stay faintly visible
  function buildSmokeCanvas() {
    const w = Math.round(W * 0.55) + 24;
    const h = 66;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const sctx = c.getContext('2d');
    const blobs = [];
    for (let i = 0; i < 7; i++) {
      blobs.push({ x: 12 + (i * (w - 24)) / 6 + randRange(-5, 5), y: h - 16 - Math.random() * 28, r: 13 + Math.random() * 10 });
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let d = 0;
        for (const b of blobs) {
          const k = 1 - Math.hypot((x - b.x) * 0.85, y - b.y) / b.r;
          if (k > d) d = k;
        }
        if (y > h - 6) d = Math.max(d, 0.25);
        if (d <= 0) continue;
        const dens = Math.min(0.72, d * 1.4);
        const thr = (BAYER_4[y & 3][x & 3] + 0.5) / 16;
        if (dens <= thr) continue;
        sctx.fillStyle = d > 0.55 ? '#E8D6D8' : d > 0.3 ? '#C9B6D3' : '#9F8AB8';
        sctx.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }
  function startSmoke() {
    WORLD.smoke = { t: 0, dur: 2.3, x0: Math.round(W * 0.4), canvas: buildSmokeCanvas() };
    WORLD.stats.smokes += 1;
    WORLD.nextSmokeAt = WORLD.runTime + randRange(22, 32);
    featureSeen('smoke');
  }

  // Power-up pickups ride in obstacle-free gaps (one at a time, with a cooldown)
  function pickPickupKind() {
    const rt = WORLD.runTime;
    if (rt < WORLD.nextPickupAt || WORLD.pickups.length) return null;
    const opts = [];
    if (rt >= UNLOCK.magnet && WORLD.magnetT <= 0) opts.push('magnet');
    if (rt >= UNLOCK.shield && !WORLD.shield) opts.push('shield');
    if (!opts.length || Math.random() >= 0.6) return null;
    const fresh = opts.filter(k => !(saveState.hints && saveState.hints[k]));
    const pool = fresh.length ? fresh : opts;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Fruit in an obstacle-free stretch: a single one, an arc or a row, at jump height
  function placeGapFruit(tail, gap, v, bucket) {
    const chance = bucket === 'long' ? 0.85 : bucket === 'medium' ? 0.5 : 0;
    if (Math.random() >= chance) return;
    const fk = FRUIT_KINDS[Math.floor(Math.random() * FRUIT_KINDS.length)];
    const fs = MH_SPRITES.fruits[fk];
    const marginL = 0.3 * v;
    const marginR = 0.75 * v;
    const avail = gap - marginL - marginR;
    const nMax = Math.floor((avail - fs.width) / FRUIT_SPACING) + 1;
    if (nMax < 1) return;
    const pk = pickPickupKind();
    if (pk) {
      const px = W + 14 + tail.off + tail.def.bx1 + marginL + Math.random() * Math.max(0, avail - 12);
      WORLD.pickups.push({ kind: pk, x: px, baseY: GROUND_Y - 58 - Math.random() * 8, w: 12, h: 12, phase: Math.random() * 6 });
      WORLD.nextPickupAt = WORLD.runTime + randRange(12, 18);
      WORLD.stats.pickupsSpawned += 1;
      return;
    }
    let shape = 'single';
    let n = 1;
    const r = Math.random();
    if (nMax >= 3 && r < 0.45) {
      shape = 'arc';
      n = nMax >= 5 && Math.random() < 0.5 ? 5 : 3;
    } else if (nMax >= 3 && r < 0.75) {
      shape = 'row';
      n = Math.min(nMax, Math.random() < 0.4 ? 4 : 3);
    }
    const groupW = (n - 1) * FRUIT_SPACING + fs.width;
    const startX = W + 14 + tail.off + tail.def.bx1 + marginL + Math.random() * Math.max(0, avail - groupW);
    const rowY = GROUND_Y - 50 - Math.random() * 14;
    const singleY = GROUND_Y - 48 - Math.random() * 20;
    const mid = (n - 1) / 2;
    const goldIdx = rollGolden() ? Math.floor(mid) : -1;
    for (let i = 0; i < n; i++) {
      let y = singleY;
      if (shape === 'row') y = rowY;
      else if (shape === 'arc') {
        const k = 1 - Math.pow((i - mid) / mid, 2);
        y = GROUND_Y - 46 - 26 * k;
      }
      WORLD.fruits.push(makeFruit(i === goldIdx ? 'golden' : fk, startX + i * FRUIT_SPACING, y));
    }
  }

  // Fruit arc along the tin's bounce trajectory (fruit positions are relative to the tin, which moves with the world)
  function placeTrampFruit(padX) {
    const v = WORLD.speed;
    const V = trampV();
    const T = trampAir();
    const fk = randomFruitKind();
    const ks = [0.24, 0.37, 0.5, 0.63, 0.76];
    const goldK = rollGolden(0.35) ? 2 : -1;
    ks.forEach((k, i) => {
      const t = T * k;
      const rise = V * t - 0.5 * GRAVITY * t * t;
      const centerRel = 2 - 9.5 + v * t;
      WORLD.fruits.push(makeFruit(i === goldK ? 'golden' : fk, padX + centerRel - 7, GROUND_Y - 15.5 - rise, { high: true }));
    });
  }

  // The classic fruit hovering over an obstacle (a BIG hookah gets a high one that needs the double jump)
  function placeFruitAbove(items) {
    if (items.some(it => OBST[it.kind].pad || OBST[it.kind].air)) return;
    const first = items[0];
    const last = items[items.length - 1];
    const dF = OBST[first.kind];
    const dL = OBST[last.kind];
    const big = items.some(it => OBST[it.kind].big);
    if (Math.random() >= (big ? 0.9 : 0.78)) return;
    const fk = FRUIT_KINDS[Math.floor(Math.random() * FRUIT_KINDS.length)];
    const fs = MH_SPRITES.fruits[fk];
    const topH = Math.max(...items.map(it => OBST[it.kind].h));
    const cx = W + 14 + (first.off + dF.bx0 + last.off + dL.bx1) / 2;
    const topClear = GROUND_Y - topH - fs.height - 14 - Math.random() * 12;
    const baseY = big
      ? GROUND_Y - 98 - Math.random() * 8
      : Math.max(GROUND_Y - 72, Math.min(GROUND_Y - 46, topClear));
    WORLD.fruits.push(makeFruit(rollGolden() ? 'golden' : fk, cx - fs.width / 2 + Math.round((Math.random() - 0.5) * 6), baseY));
  }

  function spawnPattern(p) {
    const hasBird = p.items.some(function (it) { return it.kind === 'bird'; });
    const birdX0 = hasBird ? birdLeadX(WORLD.speed) : (W + 14);
    for (const it of p.items) {
      const d = OBST[it.kind];
      const ox = (d.duckOnly ? birdX0 : (W + 14)) + it.off;
      const obst = { kind: it.kind, x: ox, y: GROUND_Y - d.h - (d.lift || 0), w: d.w, h: d.h, squash: 0 };
      if (d.duckOnly) {
        if (!WORLD.tutorialBirdDone) {
          obst.tutorial = true;
          WORLD.tutorialBirdDone = true;
          WORLD.speedScaleTarget = TUTORIAL_SPEED;
        }
      }
      WORLD.obstacles.push(obst);
      lastKinds.push(it.kind);
      if (d.pad) { WORLD.stats.tramps += 1; placeTrampFruit(ox); }
      if (d.air) {
        WORLD.stats.birds += 1;
        maybeShowBirdHint(obst);
      }
    }
    if (lastKinds.length > 6) lastKinds = lastKinds.slice(-6);
    const lastIt = p.items[p.items.length - 1];
    WORLD.tail = { def: OBST[lastIt.kind], off: lastIt.off };
    WORLD.patternCount += 1;
    WORLD.spawnLog.push({
      t: +WORLD.runTime.toFixed(2),
      kinds: p.items.map(it => it.kind),
      bucket: p.bucket,
      gap: Math.round(p.gap || 0),
      req: Math.round(p.req || 0),
      v: Math.round(WORLD.speed),
    });
    if (WORLD.spawnLog.length > 600) WORLD.spawnLog.shift();
    placeFruitAbove(p.items);
    planNext();
  }

  function spawnNextPattern() {
    if (!WORLD.pending) {
      WORLD.pending = { items: [{ kind: Math.random() < 0.5 ? 'coals' : 'hookah', off: 0 }], bucket: 'start', gap: 0, req: 0 };
    }
    const p = WORLD.pending;
    WORLD.pending = null;
    spawnPattern(p);
  }

  // ============================================================
  // INPUT & JUMP
  // ============================================================
  function requestJump() {
    if (mode !== 'playing') return;
    const c = WORLD.corgi;
    if (c.grounded) {
      c.jumpBuffer = 0.13;
      WORLD.duckMinUntil = 0;   // a tap while sliding stands up and jumps
      WORLD.duckTouch = false;
      return;
    }
    const heightAboveGround = CORGI_GROUND_TOP - c.y;
    const aboutToLand = c.vy > 0 && heightAboveGround < 14;
    if (c.jumps < 2 && c.airTime > 0.04 && !aboutToLand) {
      executeDoubleJump();
    } else {
      c.jumpBuffer = 0.13;   // tap just before landing -> jump right on touchdown
    }
  }

  function executeJump() {
    const c = WORLD.corgi;
    c.vy = -JUMP_V;
    c.grounded = false;
    c.jumpBuffer = 0;
    c.jumps = 1;
    c.airTime = 0;
    c.flipT = -1;
    spawnDust(c.x + 12, GROUND_Y, 6, 1.4);
    MH_AUDIO.jump();
    MH_TG.haptic('light');
  }

  function executeDoubleJump() {
    const c = WORLD.corgi;
    c.vy = -JUMP2_V;
    c.jumps = 2;
    c.jumpBuffer = 0;
    c.flipT = 0;
    doubleJumpCount += 1;
    // tiny minimalist puff under the paws
    const px = c.x + 14;
    const py = c.y + 17;
    WORLD.puffs.push({ x: px, y: py, t: 0 });
    for (let i = 0; i < 8; i++) {
      const ang = Math.PI * (0.1 + 0.8 * (i / 7));
      WORLD.particles.push({
        x: px,
        y: py,
        vx: Math.cos(ang) * 46 * (i % 2 ? 1 : 0.7) * (i < 4 ? -1 : 1) * 0.6 + (i - 3.5) * 4,
        vy: Math.sin(ang) * 26,
        life: 0.3,
        maxLife: 0.3,
        size: 1,
        color: i % 2 ? '#FFF9F2' : '#FFC2D4',
        grav: 10,
      });
    }
    if (!saveState.doubleSeen) {
      saveState.doubleSeen = true;
      MH_STORAGE.save(saveState);
    }
    MH_AUDIO.doubleJump();
    MH_TG.haptic('medium');
  }

  // ---- duck / slide & fast fall ----
  function isDucking() {
    const c = WORLD.corgi;
    return c.grounded && (WORLD.duckKey || WORLD.duckTouch || WORLD.botDuck || WORLD.time < WORLD.duckMinUntil);
  }
  function startDuck(fromTouch) {
    if (mode !== 'playing') return;
    const c = WORLD.corgi;
    if (fromTouch) {
      WORLD.duckTouch = true;
      WORLD.duckMinUntil = WORLD.time + (c.grounded ? 0.42 : 0.95);
    }
    c.jumpBuffer = 0;
    if (!c.grounded) {
      WORLD.duckBuffered = true;
      WORLD.duckMinUntil = Math.max(WORLD.duckMinUntil, WORLD.time + 0.95);
      if (c.vy < FAST_FALL_V) {
        c.vy = FAST_FALL_V;          // swipe down in the air = fast fall, then duck on landing
        c.flipT = -1;
        WORLD.stats.fastFalls += 1;
        WORLD.particles.push({ x: c.x + 14, y: c.y - 2, vx: 0, vy: -30, life: 0.18, maxLife: 0.18, size: 1, color: '#FFF9F2', grav: 0 });
      }
    }
  }

  // Touch: a tap jumps, a swipe down ducks. A press waits TAP_DELAY ms for a downward move before it
  // counts as a tap, so swipes never trigger jumps; a late (slow) swipe while airborne becomes a fast fall.
  const TAP_DELAY_MS = 45;
  const SWIPE_PX = 14;
  const touch = { id: null, x0: 0, y0: 0, t0: 0, pending: false, swiped: false, timer: 0 };
  function firePendingTap() {
    if (!touch.pending) return;
    touch.pending = false;
    clearTimeout(touch.timer);
    requestJump();
  }
  function pointerIdOf(e) {
    return (e.pointerId || e.identifier || 1);
  }
  function onPtrDown(e) {
    if (e.preventDefault) e.preventDefault();
    if (mode !== 'playing') return;
    lastInputKeyboard = false;
    const pid = pointerIdOf(e);
    if (touch.id !== null && pid !== touch.id) {
      // second finger: always an immediate tap (stand up + jump / double jump)
      if (touch.pending) firePendingTap();
      WORLD.duckTouch = false;
      requestJump();
      return;
    }
    touch.id = pid;
    touch.x0 = e.clientX;
    touch.y0 = e.clientY;
    touch.t0 = performance.now();
    touch.swiped = false;
    touch.pending = true;
    clearTimeout(touch.timer);
    touch.timer = setTimeout(firePendingTap, TAP_DELAY_MS);
    try { if (e.pointerId != null && canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  function onPtrMove(e) {
    if (pointerIdOf(e) !== touch.id || touch.swiped || mode !== 'playing') return;
    const dy = e.clientY - touch.y0;
    const dx = e.clientX - touch.x0;
    if (dy >= SWIPE_PX && dy > Math.abs(dx) * 1.3 && performance.now() - touch.t0 < 500) {
      touch.swiped = true;
      if (touch.pending) {
        touch.pending = false;
        clearTimeout(touch.timer);
      }
      startDuck(true);
      WORLD.stats.ducks += 1;
    }
  }
  function endTouch(e) {
    if (pointerIdOf(e) !== touch.id) return;
    if (touch.pending) firePendingTap();
    if (touch.swiped) {
      if (WORLD.corgi && !WORLD.corgi.grounded) WORLD.duckBuffered = true;
      else WORLD.duckTouch = false;
    }
    touch.id = null;
    touch.swiped = false;
  }
  if (window.PointerEvent) {
    canvas.addEventListener('pointerdown', onPtrDown);
    canvas.addEventListener('pointermove', onPtrMove);
    canvas.addEventListener('pointerup', endTouch);
    canvas.addEventListener('pointercancel', endTouch);
  } else {
    // iOS 12 / older Android WebViews have no PointerEvent
    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      const t = e.changedTouches[0] || e.touches[0];
      if (t) onPtrDown(t);
    }, false);
    canvas.addEventListener('touchmove', function (e) {
      e.preventDefault();
      const t = e.changedTouches[0] || e.touches[0];
      if (t) onPtrMove(t);
    }, false);
    canvas.addEventListener('touchend', function (e) {
      const t = (e.changedTouches && e.changedTouches[0]) || { identifier: touch.id };
      endTouch(t);
    }, false);
    canvas.addEventListener('touchcancel', function (e) {
      const t = (e.changedTouches && e.changedTouches[0]) || { identifier: touch.id };
      endTouch(t);
    }, false);
    canvas.addEventListener('mousedown', function (e) { onPtrDown({ pointerId: 1, clientX: e.clientX, clientY: e.clientY, preventDefault: function () { e.preventDefault(); } }); });
    canvas.addEventListener('mousemove', function (e) { onPtrMove({ pointerId: 1, clientX: e.clientX, clientY: e.clientY }); });
    canvas.addEventListener('mouseup', function () { endTouch({ pointerId: 1 }); });
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      if (mode === 'playing') {
        e.preventDefault();
        lastInputKeyboard = true;
        if (!e.repeat) requestJump();
      }
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      if (mode === 'playing') {
        e.preventDefault();
        lastInputKeyboard = true;
        if (!e.repeat) {
          WORLD.duckKey = true;
          WORLD.stats.ducks += 1;
          startDuck(false);
        }
      }
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowDown' || e.code === 'KeyS') WORLD.duckKey = false;
  });
  window.addEventListener('blur', () => { WORLD.duckKey = false; WORLD.duckTouch = false; });

  // ============================================================
  // UI / SCREEN TRANSITIONS
  // ============================================================
  function formatTimeMs(ms) {
    const total = Math.ceil(ms / 1000);
    const h = String(Math.floor(total / 3600)).padStart(2, '0');
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function renderPixelHeartsHTML(count, total) {
    if (total > 5) {
      const src = count > 0 ? HEART_FULL_URI : HEART_EMPTY_URI;
      return `<span class="hearts-inline hearts-counter"><img class="px-heart-img" src="${src}" alt="" /><span class="lives-x">×${count}</span></span>`;
    }
    let html = '<span class="hearts-inline">';
    for (let i = 0; i < total; i++) {
      html += `<img class="px-heart-img" src="${i < count ? HEART_FULL_URI : HEART_EMPTY_URI}" alt="" />`;
    }
    html += '</span>';
    return html;
  }

  function refreshStartUI() {
    saveState = MH_STORAGE.load();
    updateInviteUI();
    const maxL = getDailyMaxLives();
    const shownMax = Math.max(maxL, saveState.lives);
    startLivesBadge.innerHTML = `<span>ЖИЗНИ: ${saveState.lives}/${maxL}</span>${renderPixelHeartsHTML(saveState.lives, shownMax)}`;

    if (saveState.lives <= 0) {
      btnPlay.disabled = true;
      startLockNote.classList.remove('hidden');
      startTimer.textContent = formatTimeMs(MH_STORAGE.getRemainingResetMs(saveState));
    } else {
      btnPlay.disabled = false;
      startLockNote.classList.add('hidden');
    }

    btnHat.classList.toggle('off', !saveState.santaHat);
    soundLabel.textContent = saveState.sound ? 'ЗВУК: ВКЛ' : 'ЗВУК: ВЫКЛ';
    btnSound.classList.toggle('off', !saveState.sound);
  }

  function showScreen(name) {
    screenStart.classList.add('hidden');
    screenSub.classList.add('hidden');
    screenGameOver.classList.add('hidden');
    screenRating.classList.add('hidden');
    topControls.classList.add('hidden');
    hudPills.classList.add('hidden');

    if (name === 'menu') {
      const wasMenu = mode === 'menu' || mode === 'sub' || mode === 'rating';
      mode = 'menu';
      if (!wasMenu) {
        WORLD.menuTime = 0;
        WORLD.transitionAlpha = 0.55;
        WORLD.menuIdle = { kind: 'wag', timer: 0, dur: 2.4, hopDustDone: false };
      }
      MH_TG.setChromeTheme('night');
      refreshStartUI();
      screenStart.classList.remove('hidden');
      topControls.classList.remove('hidden');
    } else if (name === 'sub') {
      mode = 'sub';
      subStatus.classList.add('hidden');
      subStatus.classList.remove('ok');
      screenSub.classList.remove('hidden');
    } else if (name === 'intro') {
      mode = 'intro';
      MH_TG.setChromeTheme('sunset');
      resetRunWorld();
      hudPills.classList.remove('hidden');
    } else if (name === 'gameover') {
      mode = 'gameover';
      populateGameOver();
      screenGameOver.classList.remove('hidden');
    } else if (name === 'rating') {
      mode = 'rating';
      populateRating();
      screenRating.classList.remove('hidden');
    }
  }

  function populateGameOver() {
    goScoreEl.textContent = String(WORLD.score);
    goBestEl.textContent = String(saveState.bestScore);
    const maxL = getDailyMaxLives();
    const shownMax = Math.max(maxL, saveState.lives);
    goLivesRow.innerHTML = `<span>ОСТАЛОСЬ ЖИЗНЕЙ: ${saveState.lives}/${maxL}</span>${renderPixelHeartsHTML(saveState.lives, shownMax)}`;
    const tease = document.getElementById('go-tease');
    if (tease) {
      tease.textContent = saveState.lives <= 0
        ? '«Ну все, хватит беготни, пора на перекур!»'
        : '«Эх, ещё чуть-чуть...»';
    }

    if (saveState.lives > 0) {
      goActionsAlive.classList.remove('hidden');
      goActionsLocked.classList.add('hidden');
    } else {
      goActionsAlive.classList.add('hidden');
      goActionsLocked.classList.remove('hidden');
      goTimer.textContent = formatTimeMs(MH_STORAGE.getRemainingResetMs(saveState));
    }
  }

  // ---------------- ONLINE LEADERBOARD ----------------
  const ratingSeasonEl = document.querySelector('#screen-rating .rating-season');
  let ratingReq = 0;

  function ratingRow(entry) {
    const row = document.createElement('div');
    row.className = 'rating-row' + (entry.isMe ? ' me' : '') + (entry.pinned ? ' pinned' : '');
    const left = document.createElement('div');
    left.className = 'rating-left';
    const rank = document.createElement('span');
    const r = entry.rank;
    rank.className = 'rating-rank' + (r === 1 ? ' r1' : r === 2 ? ' r2' : r === 3 ? ' r3' : '');
    rank.textContent = r ? String(r) : '–';
    const name = document.createElement('span');
    name.className = 'rating-name';
    name.textContent = entry.name;
    left.appendChild(rank);
    left.appendChild(name);
    const scoreWrap = document.createElement('span');
    scoreWrap.className = 'rating-score-wrap';
    const score = document.createElement('span');
    score.className = 'rating-score';
    score.textContent = String(entry.score);
    const icon = document.createElement('img');
    icon.className = 'px-fruit-mini';
    icon.src = PINEAPPLE_URI;
    icon.alt = '';
    scoreWrap.appendChild(score);
    scoreWrap.appendChild(icon);
    row.appendChild(left);
    row.appendChild(scoreWrap);
    return row;
  }

  function ratingNote(text, cls = '') {
    const d = document.createElement('div');
    d.className = 'rating-note' + (cls ? ' ' + cls : '');
    d.textContent = text;
    return d;
  }

  function ratingSpinner() {
    const wrap = document.createElement('div');
    wrap.className = 'rating-loading';
    const sp = document.createElement('div');
    sp.className = 'px-spinner';
    for (let i = 0; i < 8; i++) sp.appendChild(document.createElement('i'));
    wrap.appendChild(sp);
    wrap.appendChild(ratingNote('ЗАГРУЗКА...'));
    return wrap;
  }

  function myLocalName() {
    return user.username ? '@' + user.username : (user.isTelegram ? user.name : 'ТЫ');
  }

  function renderRatingOffline() {
    ratingList.innerHTML = '';
    ratingList.appendChild(ratingNote('НЕТ СВЯЗИ С СЕРВЕРОМ', 'warn'));
    ratingList.appendChild(ratingNote('ПОКАЗАН ТВОЙ ЛОКАЛЬНЫЙ РЕКОРД'));
    ratingList.appendChild(ratingRow({ rank: null, name: myLocalName() + ' (ЛОКАЛЬНО)', score: saveState.bestScore || 0, isMe: true }));
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'px-btn px-btn-white px-btn-sm rating-retry';
    retry.textContent = 'ПОВТОРИТЬ';
    retry.addEventListener('click', (e) => { e.stopPropagation(); MH_AUDIO.click(); populateRating(); });
    ratingList.appendChild(retry);
  }

  function renderRatingOnline(data) {
    ratingList.innerHTML = '';
    const inTg = MH_TG.isTelegram();
    if (!inTg) ratingList.appendChild(ratingNote('ОТКРОЙ ИГРУ В TELEGRAM, ЧТОБЫ ПОПАСТЬ В РЕЙТИНГ', 'hint'));
    const top = data.top || [];
    if (!top.length) ratingList.appendChild(ratingNote('ПОКА ПУСТО — СТАНЬ ПЕРВЫМ!'));
    top.forEach((e) => ratingList.appendChild(ratingRow(e)));
    const me = data.me;
    if (inTg && me && !me.inTop) {
      ratingList.appendChild(ratingNote('• • •', 'gap'));
      ratingList.appendChild(ratingRow({
        rank: me.rank,
        name: me.rank ? (me.name || myLocalName()) : myLocalName() + ' • НЕТ ОЧКОВ',
        score: me.best || 0,
        isMe: true,
        pinned: true,
      }));
    }
    if (ratingSeasonEl) ratingSeasonEl.textContent = 'СЕЗОН #' + (data.season || 1) + ' • ОНЛАЙН • ИГРОКОВ: ' + (data.total || 0);
    const meRow = ratingList.querySelector('.rating-row.me:not(.pinned)');
    if (meRow && meRow.scrollIntoView) meRow.scrollIntoView({ block: 'nearest' });
  }

  function populateRating() {
    const req = ++ratingReq;
    if (ratingSeasonEl) ratingSeasonEl.textContent = 'СЕЗОН #1 • ОНЛАЙН';
    ratingList.innerHTML = '';
    ratingList.appendChild(ratingSpinner());
    MH_TG.fetchLeaderboard()
      .then((data) => { if (req === ratingReq) renderRatingOnline(data); })
      .catch(() => { if (req === ratingReq) renderRatingOffline(); });
  }


  btnHudBack.addEventListener('click', () => {
    MH_AUDIO.click();
    showScreen('menu');
  });

  btnHat.addEventListener('click', () => {
    saveState.santaHat = !saveState.santaHat;
    MH_STORAGE.save(saveState);
    MH_AUDIO.click();
    refreshStartUI();
  });

  function refreshMusicUI() {
    const on = saveState.music !== false;
    musicIcon.src = (on ? MH_SPRITES.ui.noteOn : MH_SPRITES.ui.noteOff).toDataURL();
    btnMusic.classList.toggle('off', !on);
    btnMusic.setAttribute('aria-pressed', String(on));
    btnMusic.title = on ? 'Музыка: вкл' : 'Музыка: выкл';
  }
  refreshMusicUI();
  btnMusic.addEventListener('click', () => {
    saveState.music = saveState.music === false;
    MH_STORAGE.save(saveState);
    MH_AUDIO.setMusicEnabled(saveState.music);
    refreshMusicUI();
    MH_AUDIO.click();
  });

  btnSound.addEventListener('click', () => {
    saveState.sound = !saveState.sound;
    MH_AUDIO.setEnabled(saveState.sound);
    MH_STORAGE.save(saveState);
    if (saveState.sound) MH_AUDIO.click();
    refreshStartUI();
  });

  btnPlay.addEventListener('click', () => {
    MH_AUDIO.click();
    MH_TG.haptic('light');
    if (saveState.lives <= 0) {
      refreshStartUI();
      return;
    }
    const forceGate = new URLSearchParams(window.location.search).get('gate') === '1';
    const needGate = forceGate || (serverMeta.gateRequired && !serverMeta.subscribed && !saveState.subscribed);
    if (needGate) {
      showScreen('sub');
    } else {
      showScreen('intro');
    }
  });

  btnRating.addEventListener('click', () => {
    MH_AUDIO.click();
    prevModeBeforeRating = 'menu';
    showScreen('rating');
  });

  btnSubscribe.addEventListener('click', () => {
    MH_AUDIO.click();
    MH_TG.openChannel();
    subStatus.textContent = 'Канал открыт! Нажми «Я подписался — проверить»';
    subStatus.classList.remove('hidden', 'ok');
  });

  btnCheckSub.addEventListener('click', async () => {
    MH_AUDIO.click();
    btnCheckSub.disabled = true;
    subStatus.textContent = 'Проверяем подписку...';
    subStatus.classList.remove('hidden', 'ok');
    try {
      const res = await MH_TG.checkSubscription();
      if (res && (res.subscribed || res.bypass || res.inactive || res.open && !res.required)) {
        saveState.subscribed = true;
        serverMeta.subscribed = true;
        serverMeta.gateRequired = !!(res.required && !res.bypass && !res.inactive);
        MH_STORAGE.save(saveState);
        subStatus.textContent = 'Подписка подтверждена!';
        subStatus.classList.add('ok');
        MH_TG.haptic('success');
        setTimeout(() => {
          btnCheckSub.disabled = false;
          showScreen('intro');
        }, 420);
        syncServerSession();
      } else {
        btnCheckSub.disabled = false;
        subStatus.textContent = 'Подписка не найдена. Подпишись на канал!';
      }
    } catch (_) {
      btnCheckSub.disabled = false;
      subStatus.textContent = 'Ошибка проверки. Попробуй снова.';
    }
  });

  btnSubBack.addEventListener('click', () => {
    MH_AUDIO.click();
    showScreen('menu');
  });

  btnRetry.addEventListener('click', () => {
    MH_AUDIO.click();
    if (saveState.lives <= 0) {
      populateGameOver();
      return;
    }
    showScreen('intro');
  });

  btnGoRating.addEventListener('click', () => {
    MH_AUDIO.click();
    prevModeBeforeRating = 'gameover';
    showScreen('rating');
  });

  btnGoRatingLocked.addEventListener('click', () => {
    MH_AUDIO.click();
    prevModeBeforeRating = 'gameover';
    showScreen('rating');
  });

  btnGoMenu.addEventListener('click', () => {
    MH_AUDIO.click();
    showScreen('menu');
  });

  btnGoMenuLocked.addEventListener('click', () => {
    MH_AUDIO.click();
    showScreen('menu');
  });

  btnRatingBack.addEventListener('click', () => {
    MH_AUDIO.click();
    showScreen(prevModeBeforeRating === 'gameover' ? 'gameover' : 'menu');
  });

  // ============================================================
  // UPDATE LOOP
  // ============================================================
  const INTRO_SPIN_POSES = [
    'backA', 'backRight', 'sideRight', 'frontRight', 'front',
    'frontLeft', 'sideLeft', 'backLeft', 'backA', 'backRight', 'sideRight',
  ];

  function getIntroPose(t) {
    if (t < 0.62) {
      return Math.floor(t * 7) % 2 === 0 ? 'backA' : 'backB';
    }
    if (t < 1.52) {
      const p = (t - 0.62) / 0.90;
      const idx = Math.min(INTRO_SPIN_POSES.length - 1, Math.floor(p * INTRO_SPIN_POSES.length));
      return INTRO_SPIN_POSES[idx];
    }
    return 'crouch';
  }

  function updateAmbientSky(dt, mult) {
    // 3-speed clouds
    for (const cl of WORLD.clouds) {
      cl.x -= cl.speed * mult * dt;
      if (cl.x < -38) cl.x = W + 12;
    }

    // Flocks of birds at 2 parallax depths
    for (const b of WORLD.birds) {
      const bSpeed = b.speed * (mode === 'playing' ? 1.25 : 1);
      b.x -= bSpeed * dt;
      if (b.x < -14) {
        b.x = W + 16 + (b.phase * 11) % 36;
      }
    }

    // Distant passing blimp / plane
    const sc = WORLD.skyCraft;
    if (sc.cooldown > 0) {
      sc.cooldown -= dt;
    } else {
      sc.x -= sc.speed * dt;
      if (sc.x < -28) {
        sc.kind = sc.kind === 'blimp' ? 'plane' : 'blimp';
        sc.x = W + 24;
        sc.y = sc.kind === 'blimp' ? 40 : 54;
        sc.speed = sc.kind === 'blimp' ? 5.5 : 14;
        sc.cooldown = 10;
      }
    }

    // Occasional shooting star
    const ss = WORLD.shootingStar;
    if (ss.active) {
      ss.x += ss.vx * dt;
      ss.y += ss.vy * dt;
      ss.life -= dt;
      if (ss.life <= 0) {
        ss.active = false;
        ss.cooldown = 8 + Math.random() * 6;
      }
    } else {
      ss.cooldown -= dt;
      if (ss.cooldown <= 0) {
        ss.active = true;
        ss.x = W * (0.55 + Math.random() * 0.4);
        ss.y = 10 + Math.random() * 28;
        ss.life = 0.55;
      }
    }

    // Wind streaks
    WORLD.windCooldown -= dt;
    if (WORLD.windCooldown <= 0) {
      WORLD.windCooldown = 1.4 + Math.random() * 1.8;
      WORLD.windStreaks.push({
        x: W + 10,
        y: Math.round(GROUND_Y * 0.38 + Math.random() * (GROUND_Y * 0.52)),
        len: 10 + Math.floor(Math.random() * 12),
        speed: 130 + Math.random() * 55,
      });
    }
    for (let i = WORLD.windStreaks.length - 1; i >= 0; i--) {
      const ws = WORLD.windStreaks[i];
      ws.x -= ws.speed * dt;
      if (ws.x + ws.len < -4) WORLD.windStreaks.splice(i, 1);
    }

    // Drifting blossom petals / leaves
    for (const pt of WORLD.petals) {
      pt.x += (pt.vx - (mode === 'playing' ? WORLD.speed * 0.18 : 0)) * dt;
      pt.y += (pt.vy + Math.sin(WORLD.time * 3.5 + pt.phase) * 7) * dt;
      if (pt.x < -6) {
        pt.x = W + 6 + Math.random() * 24;
        pt.y = GROUND_Y - 12 - Math.random() * 110;
      }
      if (pt.y > GROUND_Y + 6) {
        pt.y = GROUND_Y - 110;
      }
    }
  }

  function updateMenuStreet(dt) {
    WORLD.menuTime += dt;

    // Street steam grate puffs
    WORLD.steamTimer += dt;
    if (WORLD.steamTimer >= 0.28) {
      WORLD.steamTimer = 0;
      WORLD.steamPuffs.push({
        x: Math.round(W * 0.5) + 34 + (Math.random() - 0.5) * 4,
        y: MENU_GROUND_Y + 2,
        vx: -4 - Math.random() * 4,
        vy: -13 - Math.random() * 8,
        life: 1.1,
        maxLife: 1.1,
      });
    }
    for (let i = WORLD.steamPuffs.length - 1; i >= 0; i--) {
      const sp = WORLD.steamPuffs[i];
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.life -= dt;
      if (sp.life <= 0) WORLD.steamPuffs.splice(i, 1);
    }

    // Passing headlights along wet road
    const cp = WORLD.carPass;
    if (!cp.active) {
      cp.cooldown -= dt;
      if (cp.cooldown <= 0) {
        cp.active = true;
        cp.dir = Math.random() > 0.3 ? 1 : -1;
        cp.x = cp.dir > 0 ? -42 : W + 42;
        cp.cooldown = 3.8 + Math.random() * 3.0;
      }
    } else {
      cp.x += cp.dir * 135 * dt;
      if ((cp.dir > 0 && cp.x > W + 54) || (cp.dir < 0 && cp.x < -54)) {
        cp.active = false;
      }
    }

    // Corgi runs around the corner into position (0..1.05s)
    if (WORLD.menuTime < 1.05 && Math.floor(WORLD.menuTime * 8) !== Math.floor((WORLD.menuTime - dt) * 8)) {
      const cx = Math.round(W * 0.5) - 46;
      const tNorm = WORLD.menuTime / 1.05;
      const runX = -26 + (cx + 26) * tNorm;
      spawnDust(runX + 6, MENU_GROUND_Y, 2, 1);
    }

    // Menu corgi lively idle state machine (wag, look, sniff, hop, yawn, chaseMoth)
    if (WORLD.menuTime >= 1.40) {
      const idle = WORLD.menuIdle;
      idle.timer += dt;
      if (idle.kind === 'hop' && !idle.hopDustDone && idle.timer > 0.55) {
        idle.hopDustDone = true;
        spawnDust(Math.round(W * 0.5) - 18, MENU_GROUND_Y, 4, 1.4);
      }
      if (idle.timer >= idle.dur) {
        const actions = ['wag', 'look', 'sniff', 'hop', 'yawn', 'chaseMoth'];
        const curIdx = actions.indexOf(idle.kind);
        // Cycle naturally with variety
        const nextIdx = (curIdx + 1 + Math.floor(Math.random() * 2)) % actions.length;
        idle.kind = actions[nextIdx];
        idle.timer = 0;
        idle.dur = idle.kind === 'yawn' ? 2.1 : idle.kind === 'hop' ? 1.5 : 2.5;
        idle.hopDustDone = false;
      }
    }
    updateParticles(dt);
  }

  function update(dt) {
    WORLD.time += dt;
    if (WORLD.transitionAlpha > 0) {
      WORLD.transitionAlpha = Math.max(0, WORLD.transitionAlpha - dt * 1.9);
    }

    if (saveState.lives <= 0) {
      const rem = formatTimeMs(MH_STORAGE.getRemainingResetMs(saveState));
      if (mode === 'menu') startTimer.textContent = rem;
      if (mode === 'gameover') goTimer.textContent = rem;
    }

    if (mode === 'menu' || mode === 'sub' || mode === 'rating') {
      updateMenuStreet(dt);
      // Shooting star in night menu sky too
      const ss = WORLD.shootingStar;
      if (ss.active) {
        ss.x += ss.vx * dt;
        ss.y += ss.vy * dt;
        ss.life -= dt;
        if (ss.life <= 0) { ss.active = false; ss.cooldown = 7; }
      } else {
        ss.cooldown -= dt;
        if (ss.cooldown <= 0) { ss.active = true; ss.x = W * 0.78; ss.y = 14; ss.life = 0.5; }
      }
      return;
    }

    updateAmbientSky(dt, mode === 'playing' ? 1.55 : 1);

    if (mode === 'intro') {
      WORLD.introTime += dt;
      const t = WORLD.introTime;
      const step = Math.floor((t - 0.62) / 0.085);
      if (t >= 0.62 && t < 1.52 && step !== WORLD.introSpinStep) {
        WORLD.introSpinStep = step;
        spawnDust(WORLD.corgi.x + 12, GROUND_Y, 2, 1);
        MH_AUDIO.spin();
      }
      if (t >= 1.52 && WORLD.introSpinStep !== 999) {
        WORLD.introSpinStep = 999;
        spawnDust(WORLD.corgi.x + 12, GROUND_Y, 5, 1.3);
        MH_AUDIO.ready();
      }
      if (t >= 2.02) {
        mode = 'playing';
      }
      updateParticles(dt);
      return;
    }

    if (mode !== 'playing') return;

    if (WORLD.hitFreeze > 0) {
      WORLD.hitFreeze -= dt;
      if (WORLD.crashFlash > 0) WORLD.crashFlash = Math.max(0, WORLD.crashFlash - dt);
      if (WORLD.hitFreeze <= 0) {
        showScreen('gameover');
      }
      return;
    }

    if (WORLD.crashFlash > 0) WORLD.crashFlash = Math.max(0, WORLD.crashFlash - dt);

    WORLD.runTime += dt;
    if (WORLD.rankIndex > 0) WORLD.rankTime += dt;
    const easeK = 1 - Math.exp(-dt / SPEED_EASE);
    WORLD.speedScale += (WORLD.speedScaleTarget - WORLD.speedScale) * easeK;
    if (Math.abs(WORLD.speedScale - WORLD.speedScaleTarget) < 0.003) WORLD.speedScale = WORLD.speedScaleTarget;
    WORLD.speed = speedAt(WORLD.runTime) * WORLD.speedScale;

    WORLD.scrollFarSky = (WORLD.scrollFarSky + WORLD.speed * 0.065 * dt) % FAR_SKY_W;
    WORLD.scrollSkyline = (WORLD.scrollSkyline + WORLD.speed * 0.14 * dt) % MID_SKY_W;
    WORLD.scrollPalms = (WORLD.scrollPalms + WORLD.speed * 0.34 * dt) % 140;
    WORLD.scrollGround = (WORLD.scrollGround + WORLD.speed * dt) % 48;

    if (autoJump) runAutopilot();

    const c = WORLD.corgi;
    if (c.jumpBuffer > 0) c.jumpBuffer -= dt;
    if (c.grounded && c.jumpBuffer > 0) {
      executeJump();
    }

    if (!c.grounded) {
      c.airTime += dt;
      if (c.flipT >= 0) {
        c.flipT += dt;
        if (c.flipT >= FLIP_DUR) c.flipT = -1;
      }
      c.vy += GRAVITY * dt;
      c.y += c.vy * dt;
      // Airborne jump sparkle trail
      c.sparkleTimer += dt;
      if (c.sparkleTimer >= 0.048) {
        c.sparkleTimer = 0;
        WORLD.particles.push({
          x: c.x + 4 + Math.random() * 6,
          y: c.y + 11 + Math.random() * 4,
          vx: -28 - Math.random() * 14,
          vy: 4 + Math.random() * 10,
          life: 0.22,
          maxLife: 0.22,
          size: 1,
          color: Math.random() > 0.45 ? '#FFD100' : '#FF85B3',
          grav: 15,
        });
      }
      if (c.y >= CORGI_GROUND_TOP) {
        c.y = CORGI_GROUND_TOP;
        c.vy = 0;
        c.grounded = true;
        c.jumps = 0;
        c.airTime = 0;
        c.flipT = -1;
        spawnDust(c.x + 14, GROUND_Y, 7, 1.8);
        if (WORLD.duckBuffered) {
          WORLD.duckBuffered = false;
          WORLD.duckMinUntil = Math.max(WORLD.duckMinUntil, WORLD.time + 0.5);
        }
      }
    } else {
      c.animTimer += dt * (12.5 + (WORLD.speed - 105) * 0.05);
      c.runFrame = Math.floor(c.animTimer) % 6;
      WORLD.dustTimer += dt;
      if (WORLD.dustTimer >= (c.wasDucking ? 0.07 : 0.16)) {
        WORLD.dustTimer = 0;
        spawnDust(c.x + (c.wasDucking ? 18 : 5), GROUND_Y, 2, 1);
      }
    }
    const ducking = isDucking();
    if (ducking && !c.wasDucking) {
      MH_AUDIO.duck();
      spawnDust(c.x + 20, GROUND_Y, 4, 1.4);
    }
    c.wasDucking = ducking;

    // timers: power-ups, toasts, banner, events
    if (WORLD.magnetT > 0) WORLD.magnetT = Math.max(0, WORLD.magnetT - dt);
    if (WORLD.invulnT > 0) WORLD.invulnT = Math.max(0, WORLD.invulnT - dt);
    if (WORLD.softFlash > 0) WORLD.softFlash = Math.max(0, WORLD.softFlash - dt);
    if (WORLD.toasts.length) {
      WORLD.toasts[0].t += dt;
      if (WORLD.toasts[0].t >= WORLD.toasts[0].dur) WORLD.toasts.shift();
    }
    if (WORLD.banner) {
      WORLD.banner.t += dt;
      if (WORLD.banner.t >= WORLD.banner.dur) WORLD.banner = null;
    }
    updateRain(dt);
    if (!WORLD.smoke && !WORLD.rain && WORLD.runTime >= WORLD.nextSmokeAt) startSmoke();
    if (WORLD.smoke) {
      WORLD.smoke.t += dt;
      if (WORLD.smoke.t >= WORLD.smoke.dur) WORLD.smoke = null;
    }

    WORLD.spawnCooldown -= dt;
    if (WORLD.spawnCooldown <= 0) {
      spawnNextPattern();
    }

    // one-time hints the first time each thing appears on screen
    if (!saveState.doubleSeen && WORLD.obstacles.some(o => o.kind === 'hookahBig' && o.x < W - 12)) featureSeen('double');
    for (const o of WORLD.obstacles) {
      if (o.x < W - 14 && (o.kind === 'tramp' || o.kind === 'bird')) featureSeen(o.kind);
      if (o.kind === 'bird') maybeShowBirdHint(o);
    }
    for (const pk of WORLD.pickups) if (pk.x < W - 14) featureSeen(pk.kind);
    if (WORLD.fruits.some(f => f.kind === 'golden' && f.x < W - 14 && f.baseY > 0)) featureSeen('golden');
    for (let i = WORLD.puffs.length - 1; i >= 0; i--) {
      const pf = WORLD.puffs[i];
      pf.t += dt;
      pf.x -= WORLD.speed * dt * 0.8;
      if (pf.t > 0.32) WORLD.puffs.splice(i, 1);
    }

    const cx1 = c.x + 6;
    const cy1 = ducking ? GROUND_Y - DUCK_TOP : c.y + 4;
    const cx2 = c.x + 25;
    const cy2 = c.y + 17;

    let hitDone = false;
    for (let i = WORLD.obstacles.length - 1; i >= 0; i--) {
      const o = WORLD.obstacles[i];
      o.x -= WORLD.speed * dt;
      if (o.x + o.w < -16) {
        WORLD.obstacles.splice(i, 1);
        continue;
      }
      const def = OBST[o.kind];
      if (def.pad) {
        if (o.squash > 0) o.squash -= dt;
        if (cx2 > o.x + 2 && cx1 < o.x + o.w - 2 && cy2 >= o.y - 2 && (c.grounded || c.vy > 0)) bounceOn(o);
        continue;
      }
      if (def.air && !o.passed && o.x + def.bx1 < cx1) {
        o.passed = true;
        WORLD.stats.birdsPassed += 1;
        o.showHint = false;
        o.showWarn = false;
        if (o.tutorial) WORLD.speedScaleTarget = 1;
      }
      if (o.showHint) {
        o.hintT = (o.hintT || 0) + dt;
        if (ducking || o.hintT > (o.tutorial ? 3.6 : 2.8)) o.showHint = false;
      }
      const tti = def.air ? birdTimeToImpact(o) : 99;
      o.showWarn = !!(def.air && !o.passed && tti <= BIRD_WARN_T && tti > 0.05 && o.x > W - 22);
      if (WORLD.invulnT > 0 || hitDone) continue;
      for (const r of def.rects) {
        const ox1 = o.x + r.x;
        const oy1 = o.y + r.y;
        const ox2 = ox1 + r.w;
        const oy2 = oy1 + r.h;
        if (cx1 < ox2 && cx2 > ox1 && cy1 < oy2 && cy2 > oy1) {
          if (WORLD.shield) {
            breakShield();
            hitDone = true;
            break;
          }
          triggerCrash();
          return;
        }
      }
    }

    // fruit: falling rain fruit, magnet pull, combo bookkeeping
    const mcx = c.x + 15.5;
    const mcy = (cy1 + cy2) / 2;
    for (let i = WORLD.fruits.length - 1; i >= 0; i--) {
      const f = WORLD.fruits[i];
      f.x -= WORLD.speed * dt;
      if (f.vy) {
        f.baseY += f.vy * dt;
        if (f.baseY >= f.targetY) { f.baseY = f.targetY; f.vy = 0; }
      }
      if (WORLD.magnetT > 0 && f.x < W) {
        const dx = mcx - (f.x + f.w / 2);
        const dy = mcy - (f.baseY + f.h / 2);
        const d = Math.hypot(dx, dy);
        if (f.mag || d < MAGNET_R) {
          f.mag = true;
          const stepD = Math.min(d, 300 * dt);
          if (d > 0.01) {
            f.x += (dx / d) * stepD + WORLD.speed * dt * 0.6;
            f.baseY += (dy / d) * stepD;
          }
          f.vy = 0;
        }
      }
      const fy = (f.mag || f.vy) ? f.baseY : f.baseY + Math.sin(WORLD.time * 5 + f.phase) * 2.5;
      if (f.x + f.w < -16 || f.collected) {
        WORLD.fruits.splice(i, 1);
        continue;
      }
      if (cx1 - 2 < f.x + f.w && cx2 + 2 > f.x && cy1 - 3 < fy + f.h && cy2 > fy) {
        collectFruit(f, fy);
        WORLD.fruits.splice(i, 1);
        continue;
      }
      if (!f.rain && !f.mag && !f.missed && f.x + f.w < cx1 - 1) {
        f.missed = true;
        WORLD.stats.missed += 1;
        if (WORLD.combo > 0) breakCombo();
      }
      if (f.kind === 'golden' && Math.random() < dt * 9) {
        WORLD.particles.push({
          x: f.x + Math.random() * f.w, y: fy + Math.random() * f.h, vx: -10, vy: -14,
          life: 0.35, maxLife: 0.35, size: 1, color: Math.random() < 0.5 ? '#FFF9F2' : '#FFD100', grav: 0,
        });
      }
    }

    for (let i = WORLD.pickups.length - 1; i >= 0; i--) {
      const pk = WORLD.pickups[i];
      pk.x -= WORLD.speed * dt;
      if (pk.x + pk.w < -16) {
        WORLD.pickups.splice(i, 1);
        continue;
      }
      const py = pk.baseY + Math.sin(WORLD.time * 4 + pk.phase) * 2;
      if (cx1 - 2 < pk.x + pk.w && cx2 + 2 > pk.x && cy1 - 3 < py + pk.h && cy2 > py) {
        applyPickup(pk, py);
        WORLD.pickups.splice(i, 1);
      }
    }

    updateStatusHUD();
    updateParticles(dt);
  }

  function collectFruit(f, fy) {
    f.collected = true;
    WORLD.combo += 1;
    let m = 1;
    for (let i = COMBO_STEPS.length - 1; i > 0; i--) {
      if (WORLD.combo >= COMBO_STEPS[i]) { m = i + 1; break; }
    }
    const up = m > WORLD.mult;
    WORLD.mult = m;
    if (m > WORLD.stats.maxMult) WORLD.stats.maxMult = m;
    const golden = f.kind === 'golden';
    WORLD.stats.fruits += 1;
    const pts = (golden ? 5 : 1) * m;
    const prevScore = WORLD.score;
    WORLD.score += pts;
    onScoreChanged(prevScore);
    updateHUDPills(true);
    spawnFruitSparkles(f.x + f.w / 2, fy + f.h / 2, f.kind, '+' + pts);
    if (golden) {
      WORLD.stats.golden += 1;
      MH_AUDIO.golden();
      MH_TG.haptic('medium');
    } else {
      MH_AUDIO.fruit();
      MH_TG.haptic('light');
    }
    if (up) {
      addPopup(WORLD.corgi.x + 22, WORLD.corgi.y - 24, 'x' + m + '!', '#FF4A8D', 0.9);
      MH_AUDIO.comboUp();
      if (m === 2) featureSeen('combo');
    }
  }

  function breakCombo() {
    if (WORLD.combo >= COMBO_STEPS[1]) WORLD.stats.comboBreaks += 1;
    WORLD.combo = 0;
    WORLD.mult = 1;
  }

  function applyPickup(pk, py) {
    const x = pk.x + pk.w / 2;
    const y = py + pk.h / 2;
    if (pk.kind === 'magnet') {
      WORLD.magnetT = MAGNET_DUR;
      WORLD.stats.magnets += 1;
      addPopup(x, y - 8, 'МАГНИТ!', '#FF9E1B', 0.9);
      spawnRing(x, y, 14, ['#FFD100', '#FF9E1B', '#E62E4D'], 46, 0.4);
    } else {
      WORLD.shield = true;
      WORLD.stats.shields += 1;
      addPopup(x, y - 8, 'ЩИТ!', '#8FF5EA', 0.9);
      spawnRing(x, y, 14, ['#8FF5EA', '#FFF9F2', '#E62E4D'], 46, 0.4);
    }
    MH_AUDIO.pickup();
    MH_TG.haptic('medium');
    updateStatusHUD(true);
  }

  // Shield (Santa cap) eats one hit: bubble pops, short blink-invulnerability, no shake - only a soft flash
  function breakShield() {
    const c = WORLD.corgi;
    WORLD.shield = false;
    WORLD.invulnT = INVULN_T;
    WORLD.softFlash = 0.18;
    WORLD.stats.shieldBreaks += 1;
    const x = c.x + 15;
    const y = c.y + 9;
    spawnRing(x, y, 20, ['#8FF5EA', '#FFF9F2', '#FFC2D4'], 70, 0.45);
    addPopup(x, c.y - 10, 'ЩИТ!', '#FFF9F2', 0.8);
    breakCombo();
    MH_AUDIO.shieldBreak();
    MH_TG.haptic('medium');
    updateStatusHUD(true);
  }

  // MUSTHAVE tin trampoline: launches the corgi very high with a somersault
  function bounceOn(o) {
    const c = WORLD.corgi;
    c.vy = -trampV();
    c.y = Math.min(c.y, CORGI_GROUND_TOP);
    c.grounded = false;
    c.jumps = 2;
    c.airTime = 0;
    c.flipT = 0;
    c.jumpBuffer = 0;
    WORLD.duckMinUntil = 0;
    WORLD.duckTouch = false;
    o.squash = 0.22;
    WORLD.stats.bounces += 1;
    spawnDust(o.x + 12, GROUND_Y, 8, 1.8);
    WORLD.puffs.push({ x: c.x + 14, y: c.y + 17, t: 0 });
    for (let i = 0; i < 6; i++) {
      WORLD.particles.push({
        x: o.x + 3 + i * 4, y: o.y, vx: (i - 2.5) * 10, vy: -50 - Math.random() * 30,
        life: 0.35, maxLife: 0.35, size: 1, color: i % 2 ? '#FFD100' : '#FF9E1B', grav: 120,
      });
    }
    MH_AUDIO.bounce();
    MH_TG.haptic('medium');
  }

  // Debug/demo autopilot (?autojump=1): jumps over obstacle groups, double-jumps the BIG hookah, grabs fruit when safe
  function runAutopilot() {
    const c = WORLD.corgi;
    const v = WORLD.speed;
    const front = c.x + 25;
    const rear = c.x + 6;
    // flock: start the slide ~0.4s early (and fast-fall if still airborne) until it has fully passed
    WORLD.botDuck = WORLD.obstacles.some(function (o) {
      return o.kind === 'bird' && o.x + OBST.bird.bx1 > rear - 2 && o.x + OBST.bird.bx0 - front < v * 0.42;
    });
    if (WORLD.botDuck && !c.grounded) startDuck(false);
    const list = WORLD.obstacles
      .filter(o => !OBST[o.kind].pad)
      .map(o => { const d = OBST[o.kind]; return { d, l: o.x + d.bx0, r: o.x + d.bx1 }; })
      .filter(e => e.r > rear)
      .sort((a, b) => a.l - b.l);
    let target = null;
    let groupR = 0;
    if (list.length) {
      target = list[0];
      groupR = target.r;
      for (let i = 1; i < list.length; i++) {
        if (list[i].l - groupR < 45) groupR = Math.max(groupR, list[i].r);
        else break;
      }
    }
    if (target && target.d.air) return;   // ducking handles the bird; no fruit chasing right before it
    if (target) {
      const t = (target.l - front) / v;
      if (c.grounded) {
        // take off as late as is still safe (the fairness model assumes the player may do exactly that)
        let hMax = target.d.hth;
        for (const e of list) if (e.l <= groupR) hMax = Math.max(hMax, e.d.hth);
        const lead = target.d.big ? 0.36 : singleWindow(hMax)[0] + 0.05;
        if (t <= lead) { requestJump(); return; }
      } else if (target.d.big && c.jumps === 1 && c.airTime >= DJ_TS - 0.02 && t <= 0.3 && t > -0.3) {
        requestJump();
        return;
      }
    }
    if (c.grounded) {
      // next obstacle: the visible one, or the one that is about to roll in (the bot may peek at the spawn timer)
      const tVisible = target ? (target.l - front) / v : 99;
      const tObs = Math.min(tVisible, WORLD.spawnCooldown + (W + 14 - front) / v);
      const f = WORLD.fruits.concat(WORLD.pickups).find(fr => !fr.collected && !fr.vy && fr.x > front - 8 && (fr.x - front) / v < 0.26 && fr.baseY > GROUND_Y - 80 && fr.baseY < GROUND_Y - 30);
      if (f && tObs > (target && target.d.big ? 1.6 : 1.25)) requestJump();
    }
  }

  // Somersault frames: jump pose (+ santa hat) rotated in 45-degree nearest-neighbour steps, pre-baked once
  const flipFrames = {};
  function getFlipFrame(step, hat) {
    const key = step + (hat ? 'h' : 'n');
    if (flipFrames[key]) return flipFrames[key];
    const spr = MH_SPRITES.corgi.jump;
    const M = 6;
    let cw = spr.width + M * 2;
    let ch = spr.height + M * 2;
    if (cw % 2) cw += 1;
    if (ch % 2) ch += 1;
    const comp = document.createElement('canvas');
    comp.width = cw;
    comp.height = ch;
    const cctx = comp.getContext('2d');
    cctx.imageSmoothingEnabled = false;
    const ox = Math.floor((cw - spr.width) / 2);
    const oy = Math.floor((ch - spr.height) / 2);
    cctx.drawImage(spr, ox, oy);
    if (hat) cctx.drawImage(MH_SPRITES.santaHat, ox + HAT_ANCHORS.jump.x, oy + HAT_ANCHORS.jump.y);
    let D = Math.ceil(Math.hypot(cw, ch));
    if (D % 2) D += 1;
    const out = document.createElement('canvas');
    out.width = D;
    out.height = D;
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = false;
    octx.translate(D / 2, D / 2);
    octx.rotate((step * Math.PI * 2) / FLIP_STEPS);
    octx.drawImage(comp, -cw / 2, -ch / 2);
    flipFrames[key] = { canvas: out, D, cx: cw / 2 - ox, cy: ch / 2 - oy };
    return flipFrames[key];
  }

  function updateParticles(dt) {
    for (let i = WORLD.particles.length - 1; i >= 0; i--) {
      const p = WORLD.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.grav !== undefined ? p.grav : 90) * dt;
      p.life -= dt;
      if (p.life <= 0) WORLD.particles.splice(i, 1);
    }
    for (let i = WORLD.popups.length - 1; i >= 0; i--) {
      const pop = WORLD.popups[i];
      pop.y -= 26 * dt;
      pop.life -= dt;
      if (pop.life <= 0) WORLD.popups.splice(i, 1);
    }
  }

  function triggerCrash() {
    WORLD.hitFreeze = 0.24;
    WORLD.crashFlash = 0.24;
    MH_AUDIO.crash();
    MH_TG.haptic('error');

    if (WORLD.score > saveState.bestScore) {
      saveState.bestScore = WORLD.score;
    }
    saveState.gamesPlayed += 1;
    MH_STORAGE.spendLife(saveState);
    updateHUDPills(false);
    const st = WORLD.stats || {};
    MH_TG.submitScore(WORLD.score, {
      v: 'r3',
      runTimeMs: Math.round(WORLD.runTime * 1000),
      fruits: st.fruits || 0,
      golden: st.golden || 0,
      maxMult: st.maxMult || 1,
      bounces: st.bounces || 0,
      birdsPassed: st.birdsPassed || 0,
      magnets: st.magnets || 0,
      shields: st.shields || 0,
      shieldBreaks: st.shieldBreaks || 0,
      rains: st.rains || 0,
      smokes: st.smokes || 0,
      comboBreaks: st.comboBreaks || 0,
      missed: st.missed || 0,
      bonusLives: st.bonusLives || 0,
      doubles: doubleJumpCount,
    }, WORLD.runId).catch(() => {});
  }

  // ============================================================
  // NIGHT VICE CITY NEON STREET MENU RENDERER
  // ============================================================
  function drawSwayingPalm(x, bottomY, scale, phaseOffset) {
    const sw = Math.sin(WORLD.time * 2.1 + phaseOffset);
    const frondIdx = sw < -0.35 ? 1 : sw > 0.35 ? 2 : 0;
    const fSpr = PALM_FRONDS[frondIdx];
    const tSpr = PALM_TRUNK;
    ctx.drawImage(tSpr, Math.round(x), Math.round(bottomY - tSpr.height * scale), tSpr.width * scale, tSpr.height * scale);
    ctx.drawImage(
      fSpr,
      Math.round(x + (sw > 0.35 ? 1 : sw < -0.35 ? -1 : 0)),
      Math.round(bottomY - (tSpr.height + fSpr.height - 1) * scale),
      fSpr.width * scale,
      fSpr.height * scale
    );
  }

  function renderNightMenuScene() {
    ctx.drawImage(nightBgCanvas, 0, 0);

    // Twinkling night stars
    for (const s of STARS) {
      if (s.x >= W - 3 || s.y >= MENU_GROUND_Y - 82) continue;
      const pulse = Math.sin(WORLD.time * 2.3 + s.phase);
      if (pulse > -0.25) {
        ctx.fillStyle = pulse > 0.65 ? '#FFF9F2' : '#C9B3FF';
        ctx.fillRect(s.x, s.y, s.big ? 2 : 1, s.big ? 2 : 1);
      }
    }

    // Shooting star
    if (WORLD.shootingStar.active) {
      const ss = WORLD.shootingStar;
      for (let t = 0; t < 5; t++) {
        ctx.fillStyle = t === 0 ? '#FFF9F2' : `rgba(255, 160, 215, ${(0.8 - t * 0.16).toFixed(2)})`;
        ctx.fillRect(Math.round(ss.x + t * 2.2), Math.round(ss.y - t * 0.9), 1, 1);
      }
    }

    // Glowing pastel crescent moon in upper-right night sky
    const mx = W - 28;
    const my = Math.max(22, Math.min(42, MENU_GROUND_Y - 178));
    ctx.drawImage(MH_SPRITES.ambient.moon, mx, my);

    // Integer 1x swaying night palms flanking the street (no fractional scaling!)
    const swR = Math.sin(WORLD.time * 2.1 + 0.5);
    const frR = PALM_FRONDS[swR < -0.35 ? 1 : swR > 0.35 ? 2 : 0];
    const tMenu = MH_SPRITES.ambient.palmMenuTrunk;
    ctx.drawImage(tMenu, W - 26, MENU_GROUND_Y - tMenu.height);
    ctx.drawImage(frR, W - 25 + (swR > 0.35 ? 1 : swR < -0.35 ? -1 : 0), MENU_GROUND_Y - tMenu.height - frR.height + 1);
    drawSwayingPalm(-2, MENU_GROUND_Y, 1, 2.1);

    const cx = Math.round(W * 0.5);
    const mt = WORLD.menuTime;

    // 8-bit Pixel-Art Storefront (1px dark outline, staggered pixel bricks, stepped gable!)
    const bH = Math.min(92, Math.max(72, MENU_GROUND_Y - 104));
    const bW = Math.min(132, W - 36);
    const bX = cx - Math.floor(bW / 2) + 4;
    const bTop = MENU_GROUND_Y - bH;

    // Stepped art-deco pixel gable
    ctx.fillStyle = '#0E041A';
    ctx.fillRect(bX + 7, bTop - 7, bW - 14, 7);
    ctx.fillStyle = '#331250';
    ctx.fillRect(bX + 8, bTop - 6, bW - 16, 6);
    ctx.fillStyle = '#FF4A8D';
    ctx.fillRect(bX + 8, bTop - 6, bW - 16, 1);

    // Outer 1px pixel outline & base facade
    ctx.fillStyle = '#0E041A';
    ctx.fillRect(bX - 1, bTop - 1, bW + 2, bH + 1);
    ctx.fillStyle = '#230D3C';
    ctx.fillRect(bX, bTop, bW, bH);
    ctx.fillStyle = '#5B2475';
    ctx.fillRect(bX, bTop, bW - 1, 1);
    ctx.fillRect(bX, bTop, 1, bH);
    for (let py = bTop + 1; py < MENU_GROUND_Y; py++) {
      for (let dx = 0; dx < 6; dx++) {
        const px = bX + bW - 1 - dx;
        if (dx < 2 || ((px + py) & 1) === 0) {
          ctx.fillStyle = '#170829';
          ctx.fillRect(px, py, 1, 1);
        }
      }
    }
    const awY = MENU_GROUND_Y - 52;
    for (let by = bTop + 4; by < awY - 2; by += 4) {
      const off = ((by - bTop) % 8 === 4) ? 0 : 4;
      for (let bx = bX + 3 + off; bx < bX + bW - 8; bx += 8) {
        ctx.fillStyle = '#2E124D';
        ctx.fillRect(bx, by, 5, 2);
      }
    }

    // Chunky pixel-art striped awning with 1px dark outline & scalloped teeth
    ctx.fillStyle = '#0E041A';
    ctx.fillRect(bX + 5, awY - 1, bW - 10, 9);
    for (let ax = bX + 6; ax < bX + bW - 10; ax += 6) {
      const stripeW = Math.min(6, bX + bW - 6 - ax);
      const isPink = ((ax - bX) % 12 === 0);
      ctx.fillStyle = isPink ? '#FF4A8D' : '#351454';
      ctx.fillRect(ax, awY, stripeW, 6);
      ctx.fillStyle = isPink ? '#FF9CC2' : '#53227D';
      ctx.fillRect(ax, awY, stripeW, 1);
      ctx.fillStyle = isPink ? '#C82868' : '#240C3B';
      ctx.fillRect(ax + 1, awY + 6, Math.max(1, stripeW - 2), 1);
    }

    // Dark pixel-framed doorway alcove behind corgi (clean silhouette!)
    const doorX = cx - 46;
    ctx.fillStyle = '#0E041A';
    ctx.fillRect(doorX - 1, awY + 10, 46, 42);
    ctx.fillStyle = '#150726';
    ctx.fillRect(doorX, awY + 11, 44, 41);
    ctx.fillStyle = '#4B1C63';
    ctx.fillRect(doorX, awY + 11, 44, 1);
    ctx.fillRect(doorX, awY + 11, 1, 41);

    // Pixel-framed glowing shop window to the RIGHT of the corgi
    const winX = cx + 18;
    const winY = awY + 12;
    const winW = Math.min(42, bX + bW - winX - 8);
    const winH = 30;
    ctx.fillStyle = '#0E041A';
    ctx.fillRect(winX - 2, winY - 2, winW + 4, winH + 4);
    ctx.fillStyle = '#4B1C63';
    ctx.fillRect(winX - 1, winY - 1, winW + 2, 1);
    ctx.fillStyle = '#FF914B';
    ctx.fillRect(winX, winY, winW, winH);
    for (let wy = winY; wy < winY + 12; wy++) {
      for (let wx = winX; wx < winX + winW; wx++) {
        if (wy < winY + 6 || ((wx + wy) & 1) === 0) {
          ctx.fillStyle = '#FFD180';
          ctx.fillRect(wx, wy, 1, 1);
        }
      }
    }
    ctx.fillStyle = '#2B1045';
    ctx.fillRect(winX + Math.floor(winW / 2), winY, 1, winH);
    ctx.drawImage(MH_SPRITES.obstacles.hookah, winX + Math.floor((winW - 12) / 2), winY + 11);
    // Tiny warm 'OPEN' pixel sign in upper window corner
    if (mt > 1.2) {
      ctx.fillStyle = '#FF4A8D';
      ctx.fillRect(winX + 3, winY + 3, 9, 4);
      ctx.fillStyle = '#FFF9F2';
      ctx.fillRect(winX + 4, winY + 4, 7, 2);
    }
    ctx.fillStyle = '#4B1C63';
    ctx.fillRect(winX - 2, winY + winH + 1, winW + 4, 2);

    // Pixel poster pinned between doorway and shop window
    const postX = cx + 2;
    const postY = awY + 15;
    ctx.fillStyle = '#0E041A';
    ctx.fillRect(postX, postY, 11, 14);
    ctx.fillStyle = '#FF4A8D';
    ctx.fillRect(postX + 1, postY + 1, 9, 6);
    ctx.fillStyle = '#FFD100';
    ctx.fillRect(postX + 1, postY + 7, 9, 6);
    ctx.fillStyle = '#140822';
    ctx.fillRect(postX + 3, postY + 3, 5, 2);
    ctx.fillRect(postX + 2, postY + 9, 7, 1);

    // Pixel trash can beside right side of storefront
    const trashSpr = MH_SPRITES.ambient.trashCan;
    ctx.drawImage(trashSpr, bX + bW - 11, MENU_GROUND_Y - trashSpr.height);

    // Pixel cat perched on top right parapet of storefront, flicking tail
    const catFrame = ((Math.floor(WORLD.time * 2.4) % 2) + 2) % 2;
    const catSpr = MH_SPRITES.ambient.catRoof[catFrame];
    ctx.drawImage(catSpr, bX + bW - 22, bTop - catSpr.height);

    // Flickering retro street lamp on left sidewalk with dithered warm amber cone
    const lampX = 14;
    const lampTop = MENU_GROUND_Y - 72;
    const lampOn = Math.sin(WORLD.time * 13) > -0.82;
    ctx.fillStyle = '#0E041A';
    ctx.fillRect(lampX - 1, lampTop, 4, 72);
    ctx.fillStyle = '#4A245C';
    ctx.fillRect(lampX, lampTop + 1, 2, 71);
    // Curved neck & lantern head
    ctx.fillStyle = '#0E041A';
    ctx.fillRect(lampX, lampTop - 2, 9, 4);
    ctx.fillRect(lampX + 5, lampTop + 1, 5, 4);
    if (lampOn) {
      ctx.fillStyle = '#FFE082';
      ctx.fillRect(lampX + 6, lampTop + 2, 3, 2);
      // Bayer-dithered amber streetlamp light cone onto sidewalk
      for (let ly = lampTop + 6; ly < MENU_GROUND_Y + 4; ly += 2) {
        const spread = Math.floor((ly - lampTop) * 0.22);
        for (let lx = lampX + 7 - spread; lx <= lampX + 7 + spread; lx += 2) {
          if (lx >= 0 && lx < W && ((lx + ly) & 3) === 0) {
            ctx.fillStyle = 'rgba(255, 210, 120, 0.25)';
            ctx.fillRect(lx, ly, 1, 1);
          }
        }
      }
    }

    // Big Pixel Neon Sign "MUSTHAVE" + "RUN" mounted cleanly above storefront
    const signW = Math.min(144, W - 24);
    const signH = 56;
    const signY = Math.max(34, bTop - 64);
    const signX = cx - Math.floor(signW / 2);

    // Mounting struts
    ctx.fillStyle = '#160824';
    ctx.fillRect(signX + 14, signY + signH, 3, bTop - (signY + signH));
    ctx.fillRect(signX + signW - 17, signY + signH, 3, bTop - (signY + signH));

    // Neon sign dark backing frame + pulsing neon border tube
    ctx.fillStyle = 'rgba(14, 5, 28, 0.92)';
    ctx.fillRect(signX, signY, signW, signH);
    const borderPulse = mt > 0.1 ? (0.8 + 0.2 * Math.sin(WORLD.time * 4)) : 0.2;
    ctx.fillStyle = `rgba(255, 74, 141, ${borderPulse.toFixed(2)})`;
    ctx.fillRect(signX, signY, signW, 2);
    ctx.fillRect(signX, signY + signH - 2, signW, 2);
    ctx.fillRect(signX, signY, 2, signH);
    ctx.fillRect(signX + signW - 2, signY, 2, signH);

    // Ambient halo behind neon sign
    ctx.fillStyle = 'rgba(255, 74, 141, 0.13)';
    ctx.fillRect(signX - 6, signY - 6, signW + 12, signH + 12);

    // Soft shared neon tube bloom behind MUSTHAVE & RUN
    if (mt > 0.25) {
      ctx.fillStyle = 'rgba(255, 74, 141, 0.14)';
      ctx.fillRect(signX + 12, signY + 5, signW - 24, 18);
    }
    if (mt >= 1.08) {
      ctx.fillStyle = 'rgba(255, 158, 27, 0.14)';
      ctx.fillRect(cx - 26, signY + 24, 52, 18);
    }

    // Letter-by-letter light-up + realistic buzz flicker!
    const word1 = 'MUSTHAVE';
    const scale1 = 2;
    const step1 = 13;
    const startX1 = cx - Math.floor((word1.length * step1 - 3) / 2);

    // Periodic random letter flicker every ~2.8s
    const flickCycle = WORLD.time % 2.9;
    const flickIdx = Math.floor(WORLD.time / 2.9) % word1.length;

    for (let i = 0; i < word1.length; i++) {
      const igniteAt = 0.12 + i * 0.11;
      let bright = 0;
      if (mt >= igniteAt) {
        bright = Math.min(1, (mt - igniteAt) / 0.12);
        // Ignition double-flash
        if (mt - igniteAt < 0.18 && Math.floor((mt - igniteAt) * 30) % 2 === 0) {
          bright = 0.35;
        }
        // Ongoing buzzing flicker on one letter
        if (i === flickIdx && flickCycle > 2.3 && flickCycle < 2.48) {
          bright = Math.sin(flickCycle * 90) > 0 ? 0.25 : 1.0;
        }
      }
      drawNeonGlyph(
        ctx,
        word1[i],
        startX1 + i * step1,
        signY + 7,
        scale1,
        '#FF4A8D',
        '#FFF9F2',
        'rgba(255, 74, 141, 0.28)',
        bright
      );
    }

    // Second line: "RUN" in neon orange + mango-gold
    const word2 = 'RUN';
    const step2 = 15;
    const startX2 = cx - Math.floor((word2.length * step2 - 5) / 2);
    for (let i = 0; i < word2.length; i++) {
      const igniteAt = 1.05 + i * 0.10;
      let bright = mt >= igniteAt ? 1 : 0;
      if (mt >= igniteAt && mt - igniteAt < 0.16 && Math.floor((mt - igniteAt) * 28) % 2 === 0) {
        bright = 0.4;
      }
      drawNeonGlyph(
        ctx,
        word2[i],
        startX2 + i * step2,
        signY + 26,
        2,
        '#FF9E1B',
        '#FFF6C7',
        'rgba(255, 158, 27, 0.28)',
        bright
      );
    }
    // Decorative neon side bars beside RUN
    const barBright = mt >= 1.25 ? 0.95 : 0.15;
    ctx.fillStyle = `rgba(255, 209, 0, ${barBright})`;
    ctx.fillRect(signX + 12, signY + 32, 20, 2);
    ctx.fillRect(signX + signW - 32, signY + 32, 20, 2);

    // Crisp 3x5 mini neon flavor sub-bar fitting comfortably inside sign frame
    if (mt >= 1.32) {
      drawMiniNeonFlavors(ctx, cx, signY + 45);
    }

    // Moths fluttering near the glowing neon sign
    const mothSpr = MH_SPRITES.ambient.moth[Math.floor(WORLD.time * 12) % 2];
    const m1x = signX + signW - 14 + Math.round(Math.sin(WORLD.time * 3.1) * 7);
    const m1y = signY + 8 + Math.round(Math.cos(WORLD.time * 4.4) * 5);
    ctx.drawImage(mothSpr, m1x, m1y);
    const m2x = signX + 10 + Math.round(Math.cos(WORLD.time * 2.6) * 6);
    const m2y = signY + 22 + Math.round(Math.sin(WORLD.time * 3.8) * 4);
    ctx.drawImage(mothSpr, m2x, m2y);

    // Street steam grate puffs
    for (const sp of WORLD.steamPuffs) {
      const a = Math.max(0, sp.life / sp.maxLife) * 0.45;
      ctx.fillStyle = `rgba(220, 195, 240, ${a.toFixed(2)})`;
      ctx.fillRect(Math.round(sp.x), Math.round(sp.y), sp.life < 0.5 ? 3 : 2, 2);
    }

    // Wet sidewalk & asphalt neon puddle reflections (shimmering horizontally!)
    for (let ry = 0; ry < 28; ry += 2) {
      const py = MENU_GROUND_Y + 9 + ry;
      const jit = Math.round(Math.sin(WORLD.time * 4.5 + ry * 0.7) * 3);
      const pinkW = Math.max(18, 66 - ry);
      ctx.fillStyle = ry % 4 === 0 ? 'rgba(255, 74, 141, 0.34)' : 'rgba(255, 158, 27, 0.24)';
      ctx.fillRect(cx - Math.floor(pinkW / 2) + jit, py, pinkW, 1);
      // Warm shop window reflection
      ctx.fillStyle = 'rgba(255, 209, 0, 0.16)';
      ctx.fillRect(winX + 4 - jit, py, 24, 1);
    }

    // Passing car headlights & taillights across wet road
    if (WORLD.carPass.active) {
      const cp = WORLD.carPass;
      const lx = Math.round(cp.x);
      const ly = MENU_GROUND_Y + 17;
      // Soft light cone on wet asphalt
      ctx.fillStyle = 'rgba(255, 240, 175, 0.24)';
      if (cp.dir > 0) {
        ctx.fillRect(lx, ly - 1, 36, 5);
        ctx.fillStyle = '#FFF9D6';
        ctx.fillRect(lx - 2, ly, 4, 3);
        ctx.fillStyle = '#FF3B6B';
        ctx.fillRect(lx - 18, ly, 3, 2);
      } else {
        ctx.fillRect(lx - 36, ly - 1, 36, 5);
        ctx.fillStyle = '#FFF9D6';
        ctx.fillRect(lx - 2, ly, 4, 3);
        ctx.fillStyle = '#FF3B6B';
        ctx.fillRect(lx + 15, ly, 3, 2);
      }
    }

    // Corgi runs around the left corner, turns, sits & wags butt under the neon sign!
    const targetCorgiX = cx - 46;
    if (mt < 1.05) {
      const tNorm = mt / 1.05;
      const runX = -26 + (targetCorgiX + 26) * tNorm;
      const rf = Math.floor(mt * 14) % 6;
      const poseSpr = MH_SPRITES.corgi.run[rf];
      ctx.fillStyle = 'rgba(10, 4, 18, 0.55)';
      ctx.fillRect(Math.round(runX + 6), MENU_GROUND_Y + 1, 42, 2);
      drawCorgiPose(ctx, `run${rf}`, runX, MENU_GROUND_Y - poseSpr.height * 2, 2);
    } else if (mt < 1.40) {
      const turnIdx = mt < 1.22 ? 'sideRight' : 'frontRight';
      const hop = mt < 1.25 ? -2 : 0;
      const tSpr = MH_SPRITES.corgi[turnIdx];
      ctx.fillStyle = 'rgba(10, 4, 18, 0.55)';
      ctx.fillRect(targetCorgiX + 6, MENU_GROUND_Y + 1, 44, 2);
      drawCorgiPose(ctx, turnIdx, targetCorgiX, MENU_GROUND_Y - tSpr.height * 2 + hop, 2);
    } else {
      const idle = WORLD.menuIdle;
      const it = idle.timer;
      const heroSpr = MH_SPRITES.corgi.hero;
      let pose = 'hero';
      let drawX = targetCorgiX;
      let drawY = MENU_GROUND_Y - heroSpr.height * 2;
      let shadowW = 46;

      if (idle.kind === 'wag') {
        const wagOn = Math.floor(it * 5.0) % 2 === 1;
        pose = wagOn ? 'heroWag' : 'hero';
        if (wagOn) drawY -= 1;
        if (Math.sin(it * 3.5) > 0.4) {
          ctx.drawImage(MH_SPRITES.ui.heartFull, targetCorgiX + 44, drawY - 12);
        }
      } else if (idle.kind === 'look') {
        const seq = ['hero', 'frontRight', 'front', 'frontLeft', 'heroBlink', 'hero'];
        pose = seq[Math.min(seq.length - 1, Math.floor((it / idle.dur) * seq.length))];
        const pSpr = MH_SPRITES.corgi[pose] || heroSpr;
        drawY = MENU_GROUND_Y - pSpr.height * 2;
        if (pose.startsWith('front')) drawX = targetCorgiX + 4;
      } else if (idle.kind === 'sniff') {
        pose = it < 0.4 ? 'sideRight' : it < 1.9 ? 'crouch' : 'sideRight';
        const pSpr = MH_SPRITES.corgi[pose];
        const bobSniff = pose === 'crouch' ? (Math.floor(it * 8) % 2) : 0;
        drawY = MENU_GROUND_Y - pSpr.height * 2 + bobSniff;
        if (pose === 'crouch' && Math.floor(it * 4) % 2 === 0) {
          drawPixelText(ctx, '?', targetCorgiX + 46, drawY - 12, 8, '#FFD100', { outline: '#140822' });
        }
      } else if (idle.kind === 'hop') {
        if (it < 0.25) {
          pose = 'crouch';
          drawY = MENU_GROUND_Y - MH_SPRITES.corgi.crouch.height * 2;
        } else if (it < 0.65) {
          const arc = Math.sin(((it - 0.25) / 0.40) * Math.PI);
          pose = 'jump';
          drawY = MENU_GROUND_Y - MH_SPRITES.corgi.jump.height * 2 - Math.round(arc * 10);
          shadowW = Math.round(46 - arc * 14);
        } else {
          pose = Math.floor(it * 6) % 2 === 0 ? 'heroWag' : 'hero';
        }
      } else if (idle.kind === 'yawn') {
        pose = (it > 0.35 && it < 1.45) ? 'heroYawn' : 'heroBlink';
        if (pose === 'heroYawn') {
          ctx.drawImage(MH_SPRITES.zSmall, targetCorgiX + 44, drawY - 10 - Math.round(it * 3));
        }
      } else if (idle.kind === 'chaseMoth') {
        const hopUp = (it > 0.4 && it < 0.85) || (it > 1.2 && it < 1.65);
        pose = hopUp ? 'jump' : (Math.floor(it * 6) % 2 === 0 ? 'heroWag' : 'hero');
        const pSpr = MH_SPRITES.corgi[pose];
        drawY = MENU_GROUND_Y - pSpr.height * 2 - (hopUp ? 6 : 0);
        if (hopUp) {
          drawPixelText(ctx, '!', targetCorgiX + 46, drawY - 12, 8, '#FF4A8D', { outline: '#140822' });
        }
      }

      ctx.fillStyle = 'rgba(10, 4, 18, 0.55)';
      ctx.fillRect(targetCorgiX + Math.round((56 - shadowW) / 2), MENU_GROUND_Y + 1, shadowW, 2);
      drawCorgiPose(ctx, pose, drawX, drawY, 2);
    }

    // Particles (corner dust)
    for (const p of WORLD.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }

    ctx.drawImage(vignetteCanvas, 0, 0);
  }

  // ============================================================
  // SUNSET PLAY SCENE RENDERER
  // ============================================================
  function drawSoftGround() {
    ctx.drawImage(groundBgCanvas, 0, GROUND_Y);

    const gx = Math.round(WORLD.scrollGround);
    ctx.fillStyle = '#140C1C';
    ctx.fillRect(0, GROUND_Y, W, 2);

    for (let x = -gx; x < W; x += 48) {
      ctx.fillStyle = '#140C1C';
      ctx.fillRect(x + 12, GROUND_Y - 1, 4, 1);
      ctx.fillRect(x + 34, GROUND_Y - 1, 2, 1);

      ctx.fillStyle = '#FFD59E';
      ctx.fillRect(x + 4, GROUND_Y + 2, 10, 1);
      ctx.fillRect(x + 28, GROUND_Y + 2, 6, 1);

      ctx.fillStyle = '#8F4270';
      ctx.fillRect(x + 8, GROUND_Y + 9, 5, 1);
      ctx.fillRect(x + 26, GROUND_Y + 14, 2, 1);
      ctx.fillRect(x + 38, GROUND_Y + 22, 6, 1);

      ctx.fillStyle = '#6A2E5C';
      ctx.fillRect(x + 16, GROUND_Y + 34, 8, 1);
      ctx.fillRect(x + 3, GROUND_Y + 48, 3, 1);
      ctx.fillRect(x + 30, GROUND_Y + 62, 5, 1);

      ctx.fillStyle = '#4E224F';
      ctx.fillRect(x + 10, GROUND_Y + 86, 7, 1);
      ctx.fillRect(x + 34, GROUND_Y + 102, 4, 1);
    }

    if (mode === 'playing' && WORLD.runTime < 3.5) {
      const blink = Math.floor(WORLD.time * 3.5) % 2 === 0;
      if (blink) {
        drawPixelText(ctx, 'ТАПНИ — ПРЫЖОК', W / 2, H - 36, 8, '#FFF9F2', {
          align: 'center',
          shadow: '#140C1C',
        });
      }
    }
  }

  function drawSunsetBackdrop() {
    ctx.drawImage(skyCanvas, 0, 0);

    // Sun glow pulse
    const glowAlpha = 0.45 + 0.25 * Math.sin(WORLD.time * 1.9);
    ctx.save();
    ctx.globalAlpha = glowAlpha;
    ctx.drawImage(sunGlowCanvas, SUN_CX - 46, SUN_CY - 46);
    ctx.restore();

    // Subtle horizontal sunset shimmer glints across lower sun
    const shimShift = Math.round(Math.sin(WORLD.time * 3.2) * 3);
    ctx.fillStyle = 'rgba(255, 245, 190, 0.35)';
    ctx.fillRect(SUN_CX - 16 + shimShift, SUN_CY + 14, 10, 1);
    ctx.fillRect(SUN_CX + 6 - shimShift, SUN_CY + 20, 8, 1);

    // Twinkling stars in upper sky
    for (const s of STARS) {
      if (s.x >= W - 3 || s.y >= GROUND_Y - 120) continue;
      const pulse = Math.sin(WORLD.time * 2.4 + s.phase);
      if (pulse > -0.15) {
        ctx.fillStyle = pulse > 0.6 ? '#FFF9F2' : '#FFB3D1';
        ctx.fillRect(s.x, s.y, s.big ? 2 : 1, s.big ? 2 : 1);
        if (s.big && pulse > 0.78) {
          ctx.fillRect(s.x - 1, s.y, 1, 1);
          ctx.fillRect(s.x + 2, s.y, 1, 1);
        }
      }
    }

    // Rare shooting star
    if (WORLD.shootingStar.active) {
      const ss = WORLD.shootingStar;
      for (let t = 0; t < 5; t++) {
        ctx.fillStyle = t === 0 ? '#FFF9F2' : `rgba(255, 208, 224, ${(0.82 - t * 0.16).toFixed(2)})`;
        ctx.fillRect(Math.round(ss.x + t * 2.2), Math.round(ss.y - t * 0.9), 1, 1);
      }
    }

    // High-altitude clouds (3 speeds)
    for (const cl of WORLD.clouds) {
      const spr = MH_SPRITES.clouds[cl.kind] || MH_SPRITES.clouds.small;
      ctx.drawImage(spr, Math.round(cl.x), Math.round(cl.y));
    }

    // Distant blimp / plane
    if (WORLD.skyCraft.cooldown <= 0) {
      const sc = WORLD.skyCraft;
      const spr = sc.kind === 'blimp' ? MH_SPRITES.ambient.blimp : MH_SPRITES.ambient.plane;
      ctx.drawImage(spr, Math.round(sc.x), Math.round(sc.y));
      if (sc.kind === 'plane' && Math.floor(WORLD.time * 4) % 2 === 0) {
        ctx.fillStyle = '#FF4A8D';
        ctx.fillRect(Math.round(sc.x) + 4, Math.round(sc.y) + 1, 1, 1);
      }
    }

    // Far birds
    for (const b of WORLD.birds) {
      if (b.depth !== 'far') continue;
      const fr = Math.floor(WORLD.time * 5.5 + b.phase) % 2;
      ctx.drawImage(MH_SPRITES.ambient.birdFar[fr], Math.round(b.x), Math.round(b.y));
    }

    // Far hazy skyline (low-contrast rose-plum)
    const farY = GROUND_Y - farSkylineCanvas.height;
    const fx = Math.round(WORLD.scrollFarSky);
    for (let tx = -fx; tx < W; tx += FAR_SKY_W) {
      ctx.drawImage(farSkylineCanvas, tx, farY);
    }

    // Mid detailed skyline (cached) + animated blinking antennas, flickering windows & MUSTHAVE neon
    const midY = GROUND_Y - midSkylineCanvas.height;
    const sx = Math.round(WORLD.scrollSkyline);
    for (let tx = -sx; tx < W; tx += MID_SKY_W) {
      ctx.drawImage(midSkylineCanvas, tx, midY);

      // Flickering chunky pixel windows
      for (const fw of MID_FLICKER_WINDOWS) {
        if (Math.sin(WORLD.time * 3.1 + fw.phase) < -0.55) {
          ctx.fillStyle = fw.offCol;
          ctx.fillRect(tx + fw.x, midY + fw.y, fw.w, 2);
        }
      }

      // Blinking red antenna lights
      for (const bl of MID_BLINKERS) {
        const on = Math.sin(WORLD.time * 3.4 + bl.phase) > 0.15;
        if (on) {
          ctx.fillStyle = 'rgba(255, 74, 141, 0.35)';
          ctx.fillRect(tx + bl.x - 1, midY + bl.y - 1, 3, 3);
          ctx.fillStyle = '#FF3B6B';
          ctx.fillRect(tx + bl.x, midY + bl.y, 1, 1);
        }
      }

      // Subtle MUSTHAVE neon & bar neon on mid skyline
      for (const ns of MID_NEON_SIGNS) {
        const pulse = Math.sin(WORLD.time * 4.5 + ns.x) > -0.75;
        if (ns.kind === 'MH') {
          ctx.fillStyle = '#3B1540';
          ctx.fillRect(tx + ns.x, midY + ns.y, ns.w, ns.h);
          if (pulse) {
            ctx.fillStyle = 'rgba(255, 74, 141, 0.30)';
            ctx.fillRect(tx + ns.x - 1, midY + ns.y - 1, ns.w + 2, ns.h + 2);
            ctx.fillStyle = '#FF6CA8';
            ctx.fillRect(tx + ns.x + 1, midY + ns.y + 1, ns.w - 2, 1);
            ctx.fillRect(tx + ns.x + 1, midY + ns.y + ns.h - 2, ns.w - 2, 1);
            // Tiny pixel 'M H' inside rooftop sign
            ctx.fillStyle = '#FFD100';
            const sx0 = tx + ns.x + 4;
            const sy0 = midY + ns.y + 2;
            ctx.fillRect(sx0, sy0, 1, 3); ctx.fillRect(sx0 + 2, sy0, 1, 3); ctx.fillRect(sx0 + 1, sy0 + 1, 1, 1);
            ctx.fillRect(sx0 + 5, sy0, 1, 3); ctx.fillRect(sx0 + 7, sy0, 1, 3); ctx.fillRect(sx0 + 6, sy0 + 1, 1, 1);
          }
        } else if (pulse) {
          ctx.fillStyle = '#FFAE70';
          ctx.fillRect(tx + ns.x, midY + ns.y, ns.w, 2);
        }
      }
    }

    // Closer birds in front of skyline
    for (const b of WORLD.birds) {
      if (b.depth !== 'near') continue;
      const fr = Math.floor(WORLD.time * 6.5 + b.phase) % 4;
      ctx.drawImage(MH_SPRITES.ambient.birdNear[fr], Math.round(b.x), Math.round(b.y));
    }

    // Swaying 1x pixel palms (snapped to whole logical pixels)
    const px = Math.round(WORLD.scrollPalms);
    for (let i = -1; i < Math.ceil(W / 70) + 1; i++) {
      const treeX = Math.round(i * 70 - (px % 70));
      drawSwayingPalm(treeX, GROUND_Y, 1, i * 1.6);
    }

    // Wind streaks
    for (const ws of WORLD.windStreaks) {
      ctx.fillStyle = 'rgba(255, 240, 232, 0.28)';
      ctx.fillRect(Math.round(ws.x), Math.round(ws.y), ws.len, 1);
    }

    // Blown blossom petals
    for (const pt of WORLD.petals) {
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x), Math.round(pt.y), 2, 1);
    }

    drawSoftGround();
  }

  function drawCoalSmoke(x, y) {
    const ribbons = [7, 13, 18];
    for (let r = 0; r < ribbons.length; r++) {
      const baseX = x + ribbons[r];
      for (let h = 1; h <= 18; h++) {
        const wave = Math.round(Math.sin(WORLD.time * 5.5 + h * 0.48 + r * 2.1) * 1.4);
        const alpha = Math.max(0.22, 0.85 - h * 0.036);
        ctx.fillStyle = h < 6
          ? `rgba(255, 240, 232, ${alpha.toFixed(2)})`
          : `rgba(255, 192, 214, ${alpha.toFixed(2)})`;
        ctx.fillRect(Math.round(baseX + wave), Math.round(y - h), h % 3 === 0 ? 2 : 1, 1);
      }
    }
    // Heat shimmer & rising glowing ember sparks
    for (let e = 0; e < 3; e++) {
      const et = (WORLD.time * 1.6 + e * 0.37) % 1;
      const ex = x + 6 + e * 6 + Math.round(Math.sin(WORLD.time * 8 + e * 2) * 1.5);
      const ey = y - 3 - Math.round(et * 14);
      ctx.fillStyle = et < 0.5 ? '#FFD100' : 'rgba(255, 128, 102, 0.65)';
      ctx.fillRect(Math.round(ex), Math.round(ey), 1, 1);
    }
    const shX = x + 4 + Math.round(Math.sin(WORLD.time * 14) * 2);
    ctx.fillStyle = 'rgba(255, 230, 170, 0.32)';
    ctx.fillRect(shX, y - 5, 5, 1);
    ctx.fillRect(shX + 7, y - 8, 4, 1);
  }

  // pixel ellipse outline points (cached per size) for the shield bubble / magnet aura / pickup bubbles
  const ringCache = {};
  function ringPoints(rx, ry) {
    const key = rx + 'x' + ry;
    if (ringCache[key]) return ringCache[key];
    const pts = [];
    const seen = new Set();
    const n = Math.ceil(Math.PI * 2 * Math.max(rx, ry) * 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.round(Math.cos(a) * rx);
      const y = Math.round(Math.sin(a) * ry);
      const k = x + ',' + y;
      if (!seen.has(k)) { seen.add(k); pts.push([x, y]); }
    }
    ringCache[key] = pts;
    return pts;
  }
  function drawPixelRing(cx, cy, rx, ry, colors, phase, every = 1) {
    const pts = ringPoints(rx, ry);
    const x0 = Math.round(cx);
    const y0 = Math.round(cy);
    const off = Math.floor(phase);
    for (let i = 0; i < pts.length; i += every) {
      ctx.fillStyle = colors[((((i + off) >> 2) % colors.length) + colors.length) % colors.length];
      ctx.fillRect(x0 + pts[i][0], y0 + pts[i][1], 1, 1);
    }
  }

  function drawObstacleSprite(o) {
    const ox = Math.round(o.x);
    const oy = Math.round(o.y);
    if (o.kind === 'hookah') {
      ctx.drawImage(MH_SPRITES.obstacles.hookah, ox, oy);
    } else if (o.kind === 'hookahBig') {
      ctx.drawImage(MH_SPRITES.obstacles.hookahBig, ox, oy);
    } else if (o.kind === 'shilavilki') {
      ctx.drawImage(MH_SPRITES.obstacles.shilavilki, ox, oy);
    } else if (o.kind === 'coals') {
      ctx.drawImage(MH_SPRITES.obstacles.coals[Math.floor(WORLD.time * 6) % 2], ox, oy);
    } else if (o.kind === 'bird') {
      const flock = (OBST.bird && OBST.bird.flock) || [{ dx: 0, dy: 0 }];
      for (let i = 0; i < flock.length; i++) {
        const fr = Math.floor(WORLD.time * 7 + o.x * 0.01 + i * 1.7) % 2;
        ctx.drawImage(MH_SPRITES.obstacles.bird[fr], ox + flock[i].dx, oy + flock[i].dy);
      }
    } else if (o.kind === 'tramp') {
      if (o.squash > 0) ctx.drawImage(MH_SPRITES.obstacles.trampSquash, ox, oy + 3);
      else ctx.drawImage(MH_SPRITES.obstacles.tramp, ox, oy);
    }
  }

  function drawBirdWarning(o) {
    const pulse = 0.5 + 0.5 * Math.abs(Math.sin(WORLD.time * 9));
    const edgeX = W - 18;
    const baseY = GROUND_Y - (OBST.bird.h || 16) - (OBST.bird.lift || 18);
    const flock = OBST.bird.flock || [{ dx: 0, dy: 0 }];
    ctx.save();
    ctx.globalAlpha = 0.28 + 0.22 * pulse;
    const spr = MH_SPRITES.obstacles.bird[Math.floor(WORLD.time * 8) % MH_SPRITES.obstacles.bird.length] || MH_SPRITES.obstacles.bird[0];
    for (let i = 0; i < flock.length; i++) {
      const m = flock[i];
      const bx = Math.round(edgeX + (m.dx || 0) * 0.4);
      const by = Math.round(baseY + (m.dy || 0));
      if (by < 4) continue;
      ctx.drawImage(spr, bx, by);
    }
    ctx.globalAlpha = 0.7 + 0.3 * pulse;
    ctx.fillStyle = '#140C1C';
    ctx.fillRect(edgeX - 2, baseY - 118, 16, 2);
    ctx.fillRect(edgeX - 2, GROUND_Y - 2, 16, 2);
    ctx.restore();
    drawPixelTextCached(ctx, '!', W - 10, baseY - 124, 16, '#FFD100', { align: 'center', outline: '#140C1C' });
    drawDownArrow(ctx, W - 10, baseY - 104, '#FFD100');
  }

  function drawToastAndBanner() {
    if (mode !== 'playing') return;
    const ts = WORLD.toasts[0];
    if (ts) {
      const appear = Math.min(1, ts.t / 0.16);
      const fadeOut = Math.max(0, Math.min(1, (ts.dur - ts.t) / 0.3));
      const maxLen = Math.max(...ts.lines.map(l => l.length));
      const bw = Math.min(W - 6, maxLen * 8 + 12);
      const bh = ts.lines.length * 11 + 6;
      const bx = Math.round(W / 2 - bw / 2);
      const by = Math.round(H * 0.17) - Math.round((1 - appear) * 5);
      ctx.save();
      ctx.globalAlpha = fadeOut;
      ctx.fillStyle = 'rgba(20, 12, 28, 0.86)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#FF4A8D';
      ctx.fillRect(bx, by, bw, 1);
      ctx.fillRect(bx, by + bh - 1, bw, 1);
      ctx.fillRect(bx, by, 1, bh);
      ctx.fillRect(bx + bw - 1, by, 1, bh);
      ts.lines.forEach((ln, i) => {
        drawPixelTextCached(ctx, ln, Math.round(W / 2), by + 4 + i * 11, 8, i === 0 ? '#FFD100' : '#FFF9F2', { align: 'center' });
      });
      ctx.restore();
    }
    const bn = WORLD.banner;
    if (bn) {
      const k = bn.t;
      const fade = Math.max(0, Math.min(1, (bn.dur - k) / 0.35));
      const pop = k < 0.12 ? -3 : 0;
      ctx.save();
      ctx.globalAlpha = fade;
      const y0 = Math.round(H * 0.27) + pop;
      const wob = (i) => Math.round(Math.sin(k * 9 + i * 1.7) * 1);
      drawPixelTextCached(ctx, bn.lines[0], Math.round(W / 2), y0 + wob(0), 16, '#FFD100', { align: 'center', outline: '#140C1C' });
      drawPixelTextCached(ctx, bn.lines[1], Math.round(W / 2), y0 + 20 + wob(1), 16, '#FF4A8D', { align: 'center', outline: '#140C1C' });
      ctx.restore();
    }
  }

  function renderMainCanvas() {
    ctx.save();


    if (mode === 'menu' || mode === 'sub' || mode === 'rating') {
      renderNightMenuScene();
      if (WORLD.transitionAlpha > 0) {
        ctx.fillStyle = `rgba(18, 6, 36, ${WORLD.transitionAlpha.toFixed(2)})`;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
      return;
    }

    drawSunsetBackdrop();

    // Draw Obstacles (1x, deep #140C1C silhouette pops cleanly!)
    for (const o of WORLD.obstacles) {
      drawObstacleSprite(o);
      const ox = Math.round(o.x);
      const oy = Math.round(o.y);
      if (o.kind === 'coals') {
        drawCoalSmoke(ox, oy + 2);
      } else if (o.kind === 'tramp' && !(o.squash > 0)) {
        // tiny bouncing chevrons: "jump on me"
        const b = Math.floor(WORLD.time * 4) % 3;
        ctx.fillStyle = '#FFD100';
        const ay = oy - 5 - b;
        ctx.fillRect(ox + 11, ay, 2, 1);
        ctx.fillRect(ox + 10, ay + 1, 1, 1);
        ctx.fillRect(ox + 13, ay + 1, 1, 1);
      } else if (o.kind === 'bird') {
        ctx.fillStyle = 'rgba(20, 12, 28, 0.22)';
        ctx.fillRect(ox + 3, GROUND_Y + 2, 10, 1);
        if (mode === 'playing' && o.showWarn && o.x > W - 8) drawBirdWarning(o);
        if (o.showHint && mode === 'playing') {
          const rawHx = ox + Math.round(o.w / 2);
          const hx = Math.max(50, Math.min(W - 50, rawHx));
          const hy = Math.min(oy - 20, GROUND_Y - 148) + Math.round(Math.sin((o.hintT || 0) * 9) * 1);
          drawPixelTextCached(ctx, 'СМАХНИ ВНИЗ', hx, hy, 8, '#FFD100', { align: 'center', outline: '#140C1C' });
          drawDownArrow(ctx, hx, hy + 11, '#FFD100');
        }
      }
    }

    // Draw Fruits with gentle bob + soft glow + orbiting glint
    for (const f of WORLD.fruits) {
      const fx = Math.round(f.x);
      const fy = Math.round((f.mag || f.vy) ? f.baseY : f.baseY + Math.sin(WORLD.time * 5 + f.phase) * 2.5);
      if (fy < -20) continue;
      const golden = f.kind === 'golden';
      const haloA = (golden ? 0.34 : 0.22) + 0.10 * Math.sin(WORLD.time * 4 + f.phase);
      ctx.fillStyle = golden ? `rgba(255, 220, 90, ${haloA.toFixed(2)})` : `rgba(255, 242, 180, ${haloA.toFixed(2)})`;
      ctx.fillRect(fx + 1, fy - 1, f.w - 2, f.h + 2);
      ctx.fillRect(fx - 1, fy + 1, f.w + 2, f.h - 2);
      if (golden) {
        ctx.fillRect(fx + 3, fy - 3, f.w - 6, 2);
        ctx.fillRect(fx + 3, fy + f.h + 1, f.w - 6, 2);
      }
      if (f.vy) {
        ctx.fillStyle = 'rgba(255, 249, 242, 0.35)';
        ctx.fillRect(fx + 6, fy - 6, 1, 4);
      }
      ctx.drawImage(MH_SPRITES.fruits[f.kind], fx, fy);
      // Orbiting 1px sparkle glint (golden: two, plus a 4-point star)
      const gx = fx + Math.round(f.w / 2 + Math.cos(WORLD.time * 4.5 + f.phase) * 7);
      const gy = fy + Math.round(f.h / 2 + Math.sin(WORLD.time * 4.5 + f.phase) * 5);
      ctx.fillStyle = '#FFF9F2';
      ctx.fillRect(gx, gy, 1, 1);
      if (golden) {
        ctx.fillRect(fx + f.w - gx + fx, fy + f.h - gy + fy, 1, 1);
        if (Math.floor(WORLD.time * 3 + f.phase) % 2 === 0) {
          const sx = fx + f.w - 1;
          const sy = fy + 1;
          ctx.fillRect(sx, sy - 2, 1, 5);
          ctx.fillRect(sx - 2, sy, 5, 1);
        }
      }
    }

    // Power-up pickups: glowing coal (magnet) and Santa cap (shield) in a bubble
    for (const pk of WORLD.pickups) {
      const px = Math.round(pk.x);
      const py = Math.round(pk.baseY + Math.sin(WORLD.time * 4 + pk.phase) * 2);
      if (pk.kind === 'magnet') {
        const ga = 0.22 + 0.12 * Math.sin(WORLD.time * 7);
        ctx.fillStyle = `rgba(255, 158, 27, ${ga.toFixed(2)})`;
        ctx.fillRect(px - 1, py, 14, 11);
        ctx.fillRect(px + 1, py - 2, 10, 15);
        ctx.drawImage(MH_SPRITES.pickups.coal, px, py + 1);
        if (Math.floor(WORLD.time * 8 + pk.phase) % 3 === 0) {
          ctx.fillStyle = '#FFD100';
          ctx.fillRect(px + 5, py - 4, 1, 1);
        }
      } else {
        drawPixelRing(px + 6, py + 5, 9, 8, ['#8FF5EA', '#FFF9F2'], WORLD.time * 10);
        ctx.drawImage(MH_SPRITES.pickups.hat, px + 1, py + 2);
      }
    }

    // Coal smoke event: dithered, drifting, fading; obstacles stay faintly visible on top
    if (WORLD.smoke) {
      const sm = WORLD.smoke;
      const a = Math.max(0, Math.min(1, sm.t / 0.35, (sm.dur - sm.t) / 0.5));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.drawImage(sm.canvas, Math.round(sm.x0 - sm.t * 16), GROUND_Y + 4 - sm.canvas.height);
      ctx.globalAlpha = 0.42 * a;
      for (const o of WORLD.obstacles) drawObstacleSprite(o);
      ctx.restore();
    }

    // Ground shadow under corgi
    const heightAboveGround = Math.max(0, CORGI_GROUND_TOP - WORLD.corgi.y);
    const shadowW = Math.max(10, Math.round(22 - heightAboveGround * 0.2));
    ctx.fillStyle = 'rgba(20, 12, 28, 0.38)';
    ctx.fillRect(Math.round(WORLD.corgi.x + 14 - shadowW / 2), GROUND_Y + 2, shadowW, 1);

    // Draw Corgi (Intro or Gameplay)
    if (mode === 'intro') {
      const pose = getIntroPose(WORLD.introTime);
      const poseRows = pose === 'crouch' ? 14 : pose === 'sideRight' || pose === 'sideLeft' ? 17 : pose.startsWith('back') || pose.startsWith('front') ? 21 : 18;
      drawCorgiPose(ctx, pose, WORLD.corgi.x, GROUND_Y - poseRows, PLAY_SCALE);

      if (WORLD.introTime < 0.62) {
        drawPixelText(ctx, 'ХМ..?', WORLD.corgi.x + 12, GROUND_Y - 36, 8, '#FFF9F2', {
          align: 'center',
          outline: '#140C1C',
        });
      } else if (WORLD.introTime >= 1.52) {
        drawPixelText(ctx, 'ПОЕХАЛИ!', WORLD.corgi.x + 28, GROUND_Y - 34, 8, '#FFD100', {
          align: 'center',
          outline: '#140C1C',
        });
      }
    } else {
      const cg = WORLD.corgi;
      const blinkOn = WORLD.invulnT > 0 && Math.floor(WORLD.invulnT * 14) % 2 === 0;
      if (blinkOn) {
        ctx.save();
        ctx.globalAlpha = 0.3;
      }
      if (!cg.grounded && cg.flipT >= 0) {
        const step = Math.min(FLIP_STEPS - 1, Math.floor((cg.flipT / FLIP_DUR) * FLIP_STEPS));
        const fr = getFlipFrame(step, saveState.santaHat);
        ctx.drawImage(
          fr.canvas,
          Math.round(cg.x + MH_SPRITES.corgi.jump.width / 2 - fr.cx - 0) | 0,
          Math.round(cg.y + MH_SPRITES.corgi.jump.height / 2 - fr.cy) | 0
        );
      } else if (cg.grounded && cg.wasDucking) {
        drawCorgiPose(ctx, 'slide' + (Math.floor(WORLD.time * 10) % 2), cg.x, GROUND_Y - 10, PLAY_SCALE);
      } else {
        const pose = cg.grounded ? `run${cg.runFrame}` : 'jump';
        drawCorgiPose(ctx, pose, cg.x, cg.y, PLAY_SCALE);
      }
      if (blinkOn) ctx.restore();
      const ccx = cg.x + 15;
      const ccy = cg.grounded && cg.wasDucking ? GROUND_Y - 6 : cg.y + 9;
      if (WORLD.shield) {
        drawPixelRing(ccx, ccy, 18, 13, ['#8FF5EA', '#FFF9F2', '#8FF5EA', '#FFC2D4'], WORLD.time * 14);
      }
      if (WORLD.magnetT > 0) {
        const blinkEnd = WORLD.magnetT < 1 && Math.floor(WORLD.time * 8) % 2 === 0;
        if (!blinkEnd) {
          for (let i = 0; i < 5; i++) {
            const a = WORLD.time * 5 + (i * Math.PI * 2) / 5;
            ctx.fillStyle = i % 2 ? '#FFD100' : '#FF9E1B';
            ctx.fillRect(Math.round(ccx + Math.cos(a) * 21), Math.round(ccy + Math.sin(a) * 15), 1, 1);
          }
        }
      }
    }

    // double-jump puffs (tiny, pixel-clean)
    for (const pf of WORLD.puffs) {
      const k = pf.t / 0.32;
      const px = Math.round(pf.x);
      const py = Math.round(pf.y);
      ctx.fillStyle = '#FFF9F2';
      if (k < 0.34) {
        ctx.fillRect(px - 3, py - 1, 6, 2);
      } else if (k < 0.67) {
        ctx.fillRect(px - 5, py - 2, 10, 2);
        ctx.fillStyle = '#FFC2D4';
        ctx.fillRect(px - 4, py, 8, 1);
      } else {
        ctx.fillRect(px - 7, py - 3, 2, 1);
        ctx.fillRect(px + 5, py - 3, 2, 1);
        ctx.fillRect(px - 5, py - 1, 1, 1);
        ctx.fillRect(px + 4, py - 1, 1, 1);
        ctx.fillStyle = '#FFC2D4';
        ctx.fillRect(px - 2, py, 1, 1);
        ctx.fillRect(px + 1, py, 1, 1);
      }
    }

    for (const p of WORLD.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }

    for (const pop of WORLD.popups) {
      const popScaleY = pop.life > pop.maxLife - 0.12 ? -2 : 0;
      drawPixelTextCached(ctx, pop.text, Math.max(14, pop.x), pop.y + popScaleY, 8, pop.color || '#FFD100', {
        align: 'center',
        outline: '#140C1C',
      });
    }

    drawToastAndBanner();

    ctx.drawImage(vignetteCanvas, 0, 0);

    if (WORLD.softFlash > 0) {
      ctx.fillStyle = `rgba(200, 255, 250, ${(WORLD.softFlash * 1.4).toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (WORLD.crashFlash > 0) {
      const cf = Math.min(0.45, WORLD.crashFlash * 1.8);
      ctx.fillStyle = `rgba(255, 190, 220, ${cf.toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (WORLD.transitionAlpha > 0) {
      ctx.fillStyle = `rgba(18, 6, 36, ${WORLD.transitionAlpha.toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
  }

  function renderGameOverDiorama() {
    if (mode !== 'gameover' || !goCtx || !goCanvas) return;
    goCtx.clearRect(0, 0, goCanvas.width, goCanvas.height);

    goCtx.fillStyle = '#140C1C';
    goCtx.fillRect(0, 29, goCanvas.width, 7);
    goCtx.fillStyle = '#FF4A8D';
    goCtx.fillRect(0, 29, goCanvas.width, 1);

    drawCorgiPose(goCtx, 'sleep', 16, 18, 1);
    goCtx.drawImage(MH_SPRITES.bowl, 57, 21);

    const phase = WORLD.time * 1.4;
    const zItems = [
      { spr: MH_SPRITES.zSmall, x0: 47, y0: 14, off: 0.0 },
      { spr: MH_SPRITES.zSmall, x0: 54, y0: 10, off: 0.7 },
      { spr: MH_SPRITES.zBig,   x0: 61, y0: 5,  off: 1.4 },
    ];
    for (const z of zItems) {
      const bob = Math.round(Math.sin(phase * 2.2 + z.off) * 1.5);
      const drift = Math.round(Math.cos(phase * 1.6 + z.off) * 1);
      goCtx.drawImage(z.spr, z.x0 + drift, Math.max(1, z.y0 + bob));
    }
  }

  let debugFrozen = false;
  let lastTs = performance.now();
  function loop(ts) {
    const dt = Math.max(0, Math.min(0.05, (ts - lastTs) / 1000));
    lastTs = ts;
    if (!debugFrozen) update(dt);
    renderMainCanvas();
    renderGameOverDiorama();
    requestAnimationFrame(loop);
  }

  window.__MH_DEBUG = {
    getState: () => ({ mode, score: WORLD.score, lives: saveState.lives, runTime: WORLD.runTime, W, H, GROUND_Y, invited: serverMeta.invited, gateRequired: serverMeta.gateRequired, subscribed: !!(serverMeta.subscribed || saveState.subscribed) }),
    showScreen,
    showAppToast,
    setServerMeta: (o) => { serverMeta = Object.assign(serverMeta, o || {}); updateInviteUI(); },
    setMenuTime: (t) => { WORLD.menuTime = t; },
    setMenuIdle: (kind, timer = 0.6) => { WORLD.menuTime = 2.0; WORLD.menuIdle = { kind, timer, dur: 2.5, hopDustDone: false }; },
    clearWorld: () => {
      WORLD.obstacles = [];
      WORLD.fruits = [];
      WORLD.corgi.y = CORGI_GROUND_TOP;
      WORLD.corgi.vy = 0;
      WORLD.corgi.grounded = true;
      WORLD.spawnCooldown = 3.0;
      WORLD.pending = null;
      WORLD.tail = null;
      WORLD.puffs = [];
      WORLD.hitFreeze = 0;
      WORLD.crashFlash = 0;
      WORLD.corgi.jumps = 0;
      WORLD.corgi.airTime = 0;
      WORLD.corgi.flipT = -1;
      WORLD.pickups = [];
      WORLD.rain = null;
      WORLD.smoke = null;
      WORLD.nextSmokeAt = (WORLD.runTime || 0) + 999;
      WORLD.nextRainAt = (WORLD.runTime || 0) + 999;
      WORLD.banner = null;
      WORLD.toasts = [];
      WORLD.particles = [];
      WORLD.popups = [];
      WORLD.invulnT = 0;
      WORLD.softFlash = 0;
      WORLD.speedScale = 1;
      WORLD.speedScaleTarget = 1;
      WORLD.duckBuffered = false;
      WORLD.duckKey = false;
      WORLD.duckTouch = false;
      WORLD.duckMinUntil = 0;
      WORLD.botDuck = false;
    },
    setScore: (s) => {
      const prev = WORLD.score;
      WORLD.score = s;
      if (s > saveState.bestScore) {
        saveState.bestScore = s;
        MH_STORAGE.save(saveState);
      }
      onScoreChanged(prev);
      updateHUDPills(false);
    },
    spawnObstacle: (kind, x = 112) => {
      const d = OBST[kind];
      WORLD.obstacles.push({ kind, x, y: GROUND_Y - d.h - (d.lift || 0), w: d.w, h: d.h, squash: 0 });
      if (d.pad) placeTrampFruit(x);
    },
    spawnPickup: (kind, x = 120, y = GROUND_Y - 60) => {
      WORLD.pickups.push({ kind, x, baseY: y, w: 12, h: 12, phase: 0 });
    },
    startRain: () => {
      WORLD.obstacles = [];
      WORLD.pending = null;
      WORLD.tail = null;
      WORLD.spawnCooldown = RAIN_DUR + 1.2;
      WORLD.rain = { startIn: 0.01, t: 0, dur: RAIN_DUR, active: false, spawnT: 0, goldenDone: false };
      WORLD.nextRainAt = WORLD.runTime + 34;
    },
    startSmoke: () => startSmoke(),
    setShield: (on) => { WORLD.shield = !!on; updateStatusHUD(true); },
    setMagnet: (sec = MAGNET_DUR) => { WORLD.magnetT = sec; updateStatusHUD(true); },
    setCombo: (n) => {
      WORLD.combo = n;
      let m = 1;
      for (let i = COMBO_STEPS.length - 1; i > 0; i--) if (n >= COMBO_STEPS[i]) { m = i + 1; break; }
      WORLD.mult = m;
      updateStatusHUD(true);
    },
    duck: (on) => { WORLD.duckKey = !!on; if (on) startDuck(false); },
    markHintsSeen: () => {
      saveState.hints = {};
      for (const k of Object.keys(HINTS)) saveState.hints[k] = true;
      saveState.doubleSeen = true;
      WORLD.toasts = [];
    },
    resetHints: () => { saveState.hints = {}; },
    hints: () => Object.assign({}, saveState.hints || {}),
    toasts: () => WORLD.toasts.map(t => t.key),
    unlocks: () => Object.assign({}, UNLOCK),
    getWorld: () => ({
      speed: WORLD.speed,
      runTime: WORLD.runTime,
      score: WORLD.score,
      corgi: { x: WORLD.corgi.x, y: WORLD.corgi.y, vy: WORLD.corgi.vy, grounded: WORLD.corgi.grounded, jumps: WORLD.corgi.jumps, airTime: WORLD.corgi.airTime, flipT: WORLD.corgi.flipT },
      obstacles: WORLD.obstacles.map(function (o) {
        return {
          kind: o.kind, x: o.x, y: o.y, w: o.w, h: o.h,
          showHint: !!o.showHint, hintT: o.hintT || 0,
          tutorial: !!o.tutorial, showWarn: !!o.showWarn,
          tti: o.kind === 'bird' ? birdTimeToImpact(o) : null,
          passed: !!o.passed,
        };
      }),
      fruits: WORLD.fruits.map(f => ({ kind: f.kind, x: f.x, baseY: f.baseY })),
      hitFreeze: WORLD.hitFreeze,
      doubles: doubleJumpCount,
      combo: WORLD.combo,
      mult: WORLD.mult,
      magnetT: WORLD.magnetT,
      shield: WORLD.shield,
      invulnT: WORLD.invulnT,
      ducking: isDucking(),
      rain: WORLD.rain ? { active: WORLD.rain.active, t: WORLD.rain.t, startIn: WORLD.rain.startIn } : null,
      smoke: WORLD.smoke ? { t: WORLD.smoke.t } : null,
      pickups: WORLD.pickups.map(p => ({ kind: p.kind, x: p.x, baseY: p.baseY })),
      stats: Object.assign({}, WORLD.stats),
      toast: WORLD.toasts.length ? WORLD.toasts[0].key : null,
      banner: WORLD.banner ? { lines: WORLD.banner.lines.slice(), t: WORLD.banner.t } : null,
      popups: WORLD.popups.map(function (x) { return x.text; }),
      rankIndex: WORLD.rankIndex || 0,
      bonusLives: (WORLD.stats && WORLD.stats.bonusLives) || 0,
      speedScale: WORLD.speedScale,
      speedScaleTarget: WORLD.speedScaleTarget,
      tutorialBirdDone: !!WORLD.tutorialBirdDone,
      duckBuffered: !!WORLD.duckBuffered,
      spawnLog: WORLD.spawnLog.slice(),
      groundY: GROUND_Y,
    }),
    setAutoJump: (on) => { autoJump = !!on; },
    setFrozen: (on) => { debugFrozen = !!on; },
    markDoubleSeen: () => { saveState.doubleSeen = true; WORLD.hintT = 0; WORLD.toasts = WORLD.toasts.filter(t => t.key !== 'double'); },
    step: (frames = 1) => { for (let i = 0; i < frames; i++) update(1 / 60); },
    setRunTime: (t) => { WORLD.runTime = t; if (!WORLD.rankIndex) WORLD.speed = baseSpeedAt(t); },
    // fast-forward the playing world without rendering (for gap/fairness statistics)
    simulate: (seconds, dt = 1 / 60) => {
      const n = Math.round(seconds / dt);
      for (let i = 0; i < n && mode === 'playing'; i++) update(dt);
      return { mode, runTime: WORLD.runTime, score: WORLD.score };
    },
    OBST: () => JSON.parse(JSON.stringify(OBST)),
    constants: () => ({ AIR_T, DJ_TS, JUMP_V, JUMP2_V, GRAVITY, big: OBST.hookahBig.dj, SPEED_DROP, RANK_EVERY, BONUS_AT, BIRD_IMPACT_T, BIRD_GROUND_T, BIRD_WARN_T, TUTORIAL_SPEED }),
    birdLeadX: (v) => birdLeadX(v),
    requiredGapPx: (a, b, v) => requiredGapPx(OBST[a], OBST[b], v),
    startTutorialBird: () => {
      WORLD.tutorialBirdDone = false;
      WORLD.speedScale = 1;
      WORLD.speedScaleTarget = 1;
      const x = birdLeadX(WORLD.speed);
      const d = OBST.bird;
      const obst = { kind: 'bird', x: x, y: GROUND_Y - d.h - (d.lift || 0), w: d.w, h: d.h, squash: 0, tutorial: true };
      WORLD.tutorialBirdDone = true;
      WORLD.speedScaleTarget = TUTORIAL_SPEED;
      WORLD.obstacles.push(obst);
      maybeShowBirdHint(obst);
      return obst.x;
    },
    spawnBirdLead: () => {
      WORLD.tutorialBirdDone = true;
      const x = birdLeadX(WORLD.speed);
      const d = OBST.bird;
      const obst = { kind: 'bird', x: x, y: GROUND_Y - d.h - (d.lift || 0), w: d.w, h: d.h, squash: 0 };
      WORLD.obstacles.push(obst);
      maybeShowBirdHint(obst);
      return obst.x;
    },
    spawnFruit: (kind, x = 114, y = GROUND_Y - 56) => {
      const fs = MH_SPRITES.fruits[kind];
      WORLD.fruits.push({ kind, x, baseY: y, w: fs.width, h: fs.height, phase: 0, collected: false });
    },
    forceGameOver: (livesLeft, score = 14) => {
      WORLD.score = score;
      if (score > saveState.bestScore) saveState.bestScore = score;
      saveState.lives = livesLeft;
      saveState.depletedAt = livesLeft === 0 ? Date.now() : null;
      MH_STORAGE.save(saveState);
      updateHUDPills(false);
      showScreen('gameover');
    },
    jump: () => requestJump(),
  };

  function bootGame() {
    if (window.__MH_BOOTED) return;
    window.__MH_BOOTED = true;
    try {
      showScreen('menu');
      requestAnimationFrame(loop);
    } catch (err) {
      window.__MH_BOOTED = false;
      if (window.__MH_CRASH) window.__MH_CRASH('BOOT', err && err.stack ? err.stack : String(err));
    }
  }
  const fontReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  const fontCap = new Promise(function (resolve) { setTimeout(resolve, 400); });
  Promise.race([fontReady, fontCap]).then(bootGame).catch(bootGame);
  setTimeout(bootGame, 2500);
})();

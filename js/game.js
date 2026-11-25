(function () {
  const W = 195;
  const H = 422;
  const GROUND_Y = 252;      // ~60% down screen (matching 6_scale_reference.png)
  const MENU_GROUND_Y = 254;
  const PLAY_SCALE = 1;      // Corgi 27px / 195px ≈ 1/7.2 screen width (airy Dino scale!)

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const goCanvas = document.getElementById('gameover-canvas');
  const goCtx = goCanvas.getContext('2d');
  goCtx.imageSmoothingEnabled = false;

  const HEART_FULL_URI = MH_SPRITES.ui.heartFull.toDataURL();
  const HEART_EMPTY_URI = MH_SPRITES.ui.heartEmpty.toDataURL();
  const PINEAPPLE_URI = MH_SPRITES.fruits.pineapple.toDataURL();

  // DOM Elements
  const hudPills = document.getElementById('hud-pills');
  const btnHudBack = document.getElementById('btn-hud-back');
  const hudFruitIcon = document.getElementById('hud-fruit-icon');
  const hudHeartIcon = document.getElementById('hud-heart-icon');
  const hudScoreEl = document.getElementById('hud-score');
  const hudLivesEl = document.getElementById('hud-lives');

  hudFruitIcon.src = PINEAPPLE_URI;
  hudHeartIcon.src = HEART_FULL_URI;

  const topControls = document.getElementById('top-controls');
  const btnHat = document.getElementById('btn-hat');
  const btnSound = document.getElementById('btn-sound');
  const soundLabel = document.getElementById('sound-label');

  const screenStart = document.getElementById('screen-start');
  const startLivesBadge = document.getElementById('start-lives-badge');
  const startLockNote = document.getElementById('start-lock-note');
  const startTimer = document.getElementById('start-timer');
  const btnPlay = document.getElementById('btn-play');
  const btnRating = document.getElementById('btn-rating');

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
  let saveState = MH_STORAGE.load();
  MH_AUDIO.setEnabled(saveState.sound);

  const params = new URLSearchParams(window.location.search);
  const autoJump = params.get('autojump') === '1';

  // Crisp binary pixel text renderer for Canvas
  const textScratch = document.createElement('canvas');
  textScratch.width = 188;
  textScratch.height = 24;
  const textCtx = textScratch.getContext('2d');

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = 188;
  maskCanvas.height = 24;
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

  // ============================================================
  // SMOOTH 10-STOP 8-BIT VICE CITY SUNSET SKY + RETRO SUN + SOFT GROUND GRADIENT
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
      const localT = Math.max(0, Math.min(1, (t - a.y) / (b.y - a.y)));

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

  const skyCanvas = (function buildSky() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = MENU_GROUND_Y;
    const sctx = c.getContext('2d');
    const stops = [
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
    ];
    renderDitheredGradient(sctx, W, MENU_GROUND_Y, stops);

    // Vice City Pixel Sun
    const sunCx = 98;
    const sunCy = 128;
    const sunR = 32;
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
          sctx.fillRect(sunCx + dx, sunCy + dy, 1, 1);
        }
      }
    }
    return c;
  })();

  // Soft pastel-sunset dusk gradient for the lower ground (no harsh dark wall!)
  const groundBgCanvas = (function buildGroundBg() {
    const gh = H - GROUND_Y;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = gh;
    const gctx = c.getContext('2d');
    const stops = [
      { y: 0.00, col: hexToRgb('#F7B08A') }, // warm sunlit sand/curb glow
      { y: 0.10, col: hexToRgb('#DE8A84') },
      { y: 0.25, col: hexToRgb('#B86382') },
      { y: 0.48, col: hexToRgb('#844278') },
      { y: 0.74, col: hexToRgb('#542964') },
      { y: 1.00, col: hexToRgb('#311748') }, // calm soft dusk purple at bottom edge
    ];
    renderDitheredGradient(gctx, W, gh, stops);
    return c;
  })();

  const STARS = Array.from({ length: 20 }, (_, i) => ({
    x: (i * 47 + 13) % (W - 6) + 3,
    y: (i * 23 + 9) % 82 + 6,
    phase: i * 0.9,
    big: i % 5 === 0,
  }));

  // ============================================================
  // DELICATE HORIZON SKYLINE & PALMS
  // ============================================================
  const SKYLINE_W = 260;
  const skylineCanvas = (function buildSkyline() {
    const c = document.createElement('canvas');
    c.width = SKYLINE_W;
    c.height = 48;
    const sctx = c.getContext('2d');
    const buildings = [
      { x: 0, w: 22, h: 20, spire: false, deco: true },
      { x: 24, w: 18, h: 30, spire: true, deco: false },
      { x: 44, w: 26, h: 18, spire: false, deco: true },
      { x: 72, w: 20, h: 34, spire: true, deco: true },
      { x: 94, w: 16, h: 15, spire: false, deco: false },
      { x: 112, w: 28, h: 26, spire: false, deco: true },
      { x: 142, w: 18, h: 38, spire: true, deco: true },
      { x: 162, w: 24, h: 20, spire: false, deco: false },
      { x: 188, w: 22, h: 30, spire: false, deco: true },
      { x: 212, w: 20, h: 17, spire: false, deco: false },
      { x: 234, w: 24, h: 25, spire: true, deco: true },
    ];
    for (const b of buildings) {
      const top = 48 - b.h;
      sctx.fillStyle = '#92457D';
      sctx.fillRect(b.x, top, b.w, b.h);
      sctx.fillStyle = '#B25C95';
      sctx.fillRect(b.x, top, b.w, 1);
      if (b.deco) {
        sctx.fillStyle = '#92457D';
        sctx.fillRect(b.x + 3, top - 3, b.w - 6, 3);
      }
      if (b.spire) {
        sctx.fillStyle = '#A04E89';
        sctx.fillRect(b.x + Math.floor(b.w / 2), top - 7, 1, 7);
      }
      for (let wy = top + 5; wy < 44; wy += 5) {
        for (let wx = b.x + 4; wx < b.x + b.w - 4; wx += 5) {
          if (((wx * 7 + wy * 13) % 6) === 0) {
            sctx.fillStyle = ((wx + wy) % 3 === 0) ? '#FF9CC2' : '#FFE082';
            sctx.fillRect(wx, wy, 2, 2);
          }
        }
      }
    }
    return c;
  })();

  const PALM_SPRITE = (function buildPalm() {
    const rows = [
      '.....GGGGGG..GGGGGG.....',
      '...GGGGGGGGGGGGGGGGGG...',
      '.GGGG..GGGGGGGGGG..GGGG.',
      'GGG....GGGGGGGGGG....GGG',
      '.......GGG.GG.GGG.......',
      '......GGG..GG..GGG......',
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

  // ============================================================
  // HAT ANCHOR TABLE (sleek 10x6 Santa Hat)
  // ============================================================
  const HAT_ANCHORS = {
    hero: { x: 14, y: -2 },
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
  };

  function drawCorgiPose(targetCtx, poseKey, x, y, scale = 1) {
    const sprites = MH_SPRITES.corgi;
    let sprite = sprites.sideRight;
    let anchor = HAT_ANCHORS[poseKey] || { x: 14, y: -3 };

    if (poseKey.startsWith('run')) {
      const idx = parseInt(poseKey.slice(3), 10) || 0;
      sprite = sprites.run[idx];
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

    // Signature cute butt-wiggle motion ticks on peak run frames
    if (poseKey === 'run0' || poseKey === 'run2') {
      const wy = poseKey === 'run0' ? py + 6 * scale : py + 2 * scale;
      targetCtx.fillStyle = '#FFF9F2';
      targetCtx.fillRect(px - 3 * scale, wy, 2 * scale, 1 * scale);
      targetCtx.fillStyle = '#FF4A8D';
      targetCtx.fillRect(px - 4 * scale, wy + 2 * scale, 2 * scale, 1 * scale);
    }
  }

  // ============================================================
  // GAME STATE
  // ============================================================
  let mode = 'menu';
  let prevModeBeforeRating = 'menu';

  const CORGI_GROUND_TOP = GROUND_Y - 18; // 252 - 17 = 235

  const WORLD = {
    time: 0,
    scrollSkyline: 0,
    scrollPalms: 0,
    scrollGround: 0,
    clouds: [
      { x: 14, y: 66, speed: 5.5, kind: 'small' },
      { x: 82, y: 92, speed: 4.0, kind: 'large' },
      { x: 146, y: 58, speed: 6.5, kind: 'small' },
      { x: 178, y: 118, speed: 4.8, kind: 'small' },
    ],
    speed: 105,
    score: 0,
    runTime: 0,
    introTime: 0,
    introSpinStep: -1,
    shakeTime: 0,
    hitFreeze: 0,
    corgi: {
      x: 20,
      y: CORGI_GROUND_TOP,
      vy: 0,
      grounded: true,
      jumpBuffer: 0,
      animTimer: 0,
      runFrame: 0,
    },
    obstacles: [],
    fruits: [],
    particles: [],
    popups: [],
    spawnCooldown: 1.0,
    dustTimer: 0,
  };

  function updateHUDPills() {
    hudScoreEl.textContent = String(WORLD.score);
    hudLivesEl.textContent = String(saveState.lives);
  }

  function resetRunWorld() {
    WORLD.speed = 105;
    WORLD.score = 0;
    WORLD.runTime = 0;
    WORLD.introTime = 0;
    WORLD.introSpinStep = -1;
    WORLD.shakeTime = 0;
    WORLD.hitFreeze = 0;
    WORLD.corgi.x = 20;
    WORLD.corgi.y = CORGI_GROUND_TOP;
    WORLD.corgi.vy = 0;
    WORLD.corgi.grounded = true;
    WORLD.corgi.jumpBuffer = 0;
    WORLD.corgi.animTimer = 0;
    WORLD.corgi.runFrame = 0;
    WORLD.obstacles = [];
    WORLD.fruits = [];
    WORLD.particles = [];
    WORLD.popups = [];
    WORLD.spawnCooldown = 0.85;
    WORLD.dustTimer = 0;
    updateHUDPills();
  }

  // ============================================================
  // PARTICLES & POPUPS
  // ============================================================
  function spawnDust(x, y, count = 4) {
    for (let i = 0; i < count; i++) {
      WORLD.particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y - Math.random() * 3,
        vx: -24 - Math.random() * 34,
        vy: -10 - Math.random() * 22,
        life: 0.25 + Math.random() * 0.2,
        maxLife: 0.4,
        size: Math.random() > 0.5 ? 2 : 1,
        color: Math.random() > 0.4 ? '#FFF0E6' : '#FF8066',
      });
    }
  }

  function spawnFruitSparkles(x, y, kind) {
    const palette = kind === 'pineapple'
      ? ['#FFD100', '#FFF9F2', '#3ED568']
      : kind === 'peach'
        ? ['#FF8066', '#FF4A8D', '#FFD100']
        : ['#FF9E1B', '#FFD100', '#FFF9F2'];
    for (let i = 0; i < 12; i++) {
      const ang = (Math.PI * 2 * i) / 12 + Math.random() * 0.3;
      const spd = 28 + Math.random() * 44;
      WORLD.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 12,
        life: 0.34 + Math.random() * 0.18,
        maxLife: 0.52,
        size: i % 3 === 0 ? 2 : 1,
        color: palette[i % palette.length],
      });
    }
    WORLD.popups.push({
      x,
      y: y - 4,
      text: '+1',
      life: 0.7,
      maxLife: 0.7,
    });
  }

  // ============================================================
  // OBSTACLE & FRUIT SPAWNER (1x airy Chrome-Dino proportions)
  // ============================================================
  let lastObstacleKind = '';
  function spawnObstacleWave() {
    const kinds = ['hookah', 'shilavilki', 'coals'];
    let kind = kinds[Math.floor(Math.random() * kinds.length)];
    if (kind === lastObstacleKind) {
      kind = kinds[(kinds.indexOf(kind) + 1) % kinds.length];
    }
    lastObstacleKind = kind;

    let spr = MH_SPRITES.obstacles.hookah;
    if (kind === 'shilavilki') spr = MH_SPRITES.obstacles.shilavilki;
    else if (kind === 'coals') spr = MH_SPRITES.obstacles.coals[0];

    const obs = {
      kind,
      x: W + 14,
      y: GROUND_Y - spr.height,
      w: spr.width,
      h: spr.height,
    };
    WORLD.obstacles.push(obs);

    const fruitKinds = ['pineapple', 'peach', 'mango'];
    if (Math.random() < 0.78) {
      const fk = fruitKinds[Math.floor(Math.random() * fruitKinds.length)];
      const fs = MH_SPRITES.fruits[fk];
      const topClear = obs.y - fs.height - 14 - Math.random() * 12;
      WORLD.fruits.push({
        kind: fk,
        x: obs.x + Math.round((obs.w - fs.width) / 2) + Math.round((Math.random() - 0.5) * 6),
        baseY: Math.max(GROUND_Y - 72, Math.min(GROUND_Y - 46, topClear)),
        w: fs.width,
        h: fs.height,
        phase: Math.random() * Math.PI * 2,
        collected: false,
      });
    } else {
      const fk = fruitKinds[Math.floor(Math.random() * fruitKinds.length)];
      const fs = MH_SPRITES.fruits[fk];
      WORLD.fruits.push({
        kind: fk,
        x: obs.x + 68,
        baseY: GROUND_Y - 44 - Math.random() * 18,
        w: fs.width,
        h: fs.height,
        phase: Math.random() * Math.PI * 2,
        collected: false,
      });
    }
  }

  // ============================================================
  // INPUT & JUMP
  // ============================================================
  function requestJump() {
    if (mode !== 'playing') return;
    WORLD.corgi.jumpBuffer = 0.13;
  }

  function executeJump() {
    const c = WORLD.corgi;
    c.vy = -305;
    c.grounded = false;
    c.jumpBuffer = 0;
    spawnDust(c.x + 12, GROUND_Y, 5);
    MH_AUDIO.jump();
    MH_TG.haptic('light');
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (mode === 'playing') requestJump();
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      if (mode === 'playing') {
        e.preventDefault();
        requestJump();
      }
    }
  });

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
    let html = '<span class="hearts-inline">';
    for (let i = 0; i < total; i++) {
      html += `<img class="px-heart-img" src="${i < count ? HEART_FULL_URI : HEART_EMPTY_URI}" alt="" />`;
    }
    html += '</span>';
    return html;
  }

  function refreshStartUI() {
    saveState = MH_STORAGE.load();
    startLivesBadge.innerHTML = `<span>ЖИЗНИ: ${saveState.lives}/${MH_STORAGE.MAX_LIVES}</span>${renderPixelHeartsHTML(saveState.lives, MH_STORAGE.MAX_LIVES)}`;

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
      mode = 'menu';
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
    goLivesRow.innerHTML = `<span>ОСТАЛОСЬ ЖИЗНЕЙ: ${saveState.lives}/${MH_STORAGE.MAX_LIVES}</span>${renderPixelHeartsHTML(saveState.lives, MH_STORAGE.MAX_LIVES)}`;

    if (saveState.lives > 0) {
      goActionsAlive.classList.remove('hidden');
      goActionsLocked.classList.add('hidden');
    } else {
      goActionsAlive.classList.add('hidden');
      goActionsLocked.classList.remove('hidden');
      goTimer.textContent = formatTimeMs(MH_STORAGE.getRemainingResetMs(saveState));
    }
  }

  function populateRating() {
    const list = MH_STORAGE.getLeaderboard(saveState, user);
    ratingList.innerHTML = '';
    list.forEach((entry, i) => {
      const row = document.createElement('div');
      row.className = 'rating-row' + (entry.isMe ? ' me' : '');

      const left = document.createElement('div');
      left.className = 'rating-left';

      const rank = document.createElement('span');
      rank.className = 'rating-rank' + (i === 0 ? ' r1' : i === 1 ? ' r2' : i === 2 ? ' r3' : '');
      rank.textContent = String(i + 1);

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
      ratingList.appendChild(row);
    });
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
    if (!saveState.subscribed) {
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
    subStatus.textContent = 'Канал открыт! Нажми «Проверить подписку»';
    subStatus.classList.remove('hidden', 'ok');
  });

  btnCheckSub.addEventListener('click', async () => {
    MH_AUDIO.click();
    btnCheckSub.disabled = true;
    subStatus.textContent = 'Проверяем подписку...';
    subStatus.classList.remove('hidden', 'ok');
    try {
      const res = await MH_TG.checkSubscription();
      if (res && res.subscribed) {
        saveState.subscribed = true;
        MH_STORAGE.save(saveState);
        subStatus.textContent = 'Подписка подтверждена!';
        subStatus.classList.add('ok');
        MH_TG.haptic('success');
        setTimeout(() => {
          btnCheckSub.disabled = false;
          showScreen('intro');
        }, 420);
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
    'backA',
    'backRight',
    'sideRight',
    'frontRight',
    'front',
    'frontLeft',
    'sideLeft',
    'backLeft',
    'backA',
    'backRight',
    'sideRight',
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

  function update(dt) {
    WORLD.time += dt;

    for (const cl of WORLD.clouds) {
      const mult = mode === 'playing' ? 1.8 : 1;
      cl.x -= cl.speed * mult * dt;
      if (cl.x < -34) cl.x = W + 10;
    }

    if (saveState.lives <= 0) {
      const rem = formatTimeMs(MH_STORAGE.getRemainingResetMs(saveState));
      if (mode === 'menu') startTimer.textContent = rem;
      if (mode === 'gameover') goTimer.textContent = rem;
    }

    if (mode === 'menu') {
      WORLD.scrollSkyline = (WORLD.scrollSkyline + 4 * dt) % SKYLINE_W;
      WORLD.scrollPalms = (WORLD.scrollPalms + 10 * dt) % 140;
      WORLD.scrollGround = (WORLD.scrollGround + 14 * dt) % 48;
      return;
    }

    if (mode === 'intro') {
      WORLD.introTime += dt;
      const t = WORLD.introTime;
      const step = Math.floor((t - 0.62) / 0.085);
      if (t >= 0.62 && t < 1.52 && step !== WORLD.introSpinStep) {
        WORLD.introSpinStep = step;
        spawnDust(WORLD.corgi.x + 12, GROUND_Y, 2);
        MH_AUDIO.spin();
      }
      if (t >= 1.52 && WORLD.introSpinStep !== 999) {
        WORLD.introSpinStep = 999;
        spawnDust(WORLD.corgi.x + 12, GROUND_Y, 5);
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
      if (WORLD.hitFreeze <= 0) {
        showScreen('gameover');
      }
      return;
    }

    if (WORLD.shakeTime > 0) WORLD.shakeTime -= dt;

    WORLD.runTime += dt;
    WORLD.speed = Math.min(220, 105 + WORLD.runTime * 2.1);

    WORLD.scrollSkyline = (WORLD.scrollSkyline + WORLD.speed * 0.14 * dt) % SKYLINE_W;
    WORLD.scrollPalms = (WORLD.scrollPalms + WORLD.speed * 0.36 * dt) % 140;
    WORLD.scrollGround = (WORLD.scrollGround + WORLD.speed * dt) % 48;

    if (autoJump && WORLD.corgi.grounded) {
      const danger = WORLD.obstacles.find(o => o.x > WORLD.corgi.x + 15 && o.x < WORLD.corgi.x + 44 + WORLD.speed * 0.13);
      const bonusFruit = WORLD.fruits.find(f => !f.collected && f.x > WORLD.corgi.x + 8 && f.x < WORLD.corgi.x + 34);
      if (danger || bonusFruit) {
        requestJump();
      }
    }

    const c = WORLD.corgi;
    if (c.jumpBuffer > 0) c.jumpBuffer -= dt;
    if (c.grounded && c.jumpBuffer > 0) {
      executeJump();
    }

    if (!c.grounded) {
      c.vy += 740 * dt;
      c.y += c.vy * dt;
      if (c.y >= CORGI_GROUND_TOP) {
        c.y = CORGI_GROUND_TOP;
        c.vy = 0;
        c.grounded = true;
        spawnDust(c.x + 14, GROUND_Y, 5);
      }
    } else {
      c.animTimer += dt * (12.5 + (WORLD.speed - 105) * 0.05);
      c.runFrame = Math.floor(c.animTimer) % 6;
      WORLD.dustTimer += dt;
      if (WORLD.dustTimer >= 0.16) {
        WORLD.dustTimer = 0;
        spawnDust(c.x + 5, GROUND_Y, 2);
      }
    }

    WORLD.spawnCooldown -= dt;
    if (WORLD.spawnCooldown <= 0) {
      spawnObstacleWave();
      const minGapTime = 1.05 * (105 / WORLD.speed);
      WORLD.spawnCooldown = Math.max(0.68, minGapTime + Math.random() * 0.65);
    }

    const cx1 = c.x + 6;
    const cy1 = c.y + 4;
    const cx2 = c.x + 25;
    const cy2 = c.y + 17;

    for (let i = WORLD.obstacles.length - 1; i >= 0; i--) {
      const o = WORLD.obstacles[i];
      o.x -= WORLD.speed * dt;
      if (o.x + o.w < -16) {
        WORLD.obstacles.splice(i, 1);
        continue;
      }
      const ox1 = o.x + (o.kind === 'hookah' ? 5 : 4);
      const oy1 = o.y + 4;
      const ox2 = o.x + o.w - 4;
      const oy2 = o.y + o.h;
      if (cx1 < ox2 && cx2 > ox1 && cy1 < oy2 && cy2 > oy1) {
        triggerCrash();
        return;
      }
    }

    for (let i = WORLD.fruits.length - 1; i >= 0; i--) {
      const f = WORLD.fruits[i];
      f.x -= WORLD.speed * dt;
      const fy = f.baseY + Math.sin(WORLD.time * 5 + f.phase) * 2.5;
      if (f.x + f.w < -16 || f.collected) {
        WORLD.fruits.splice(i, 1);
        continue;
      }
      if (cx1 - 2 < f.x + f.w && cx2 + 2 > f.x && cy1 - 3 < fy + f.h && cy2 > fy) {
        f.collected = true;
        WORLD.score += 1;
        updateHUDPills();
        spawnFruitSparkles(f.x + f.w / 2, fy + f.h / 2, f.kind);
        MH_AUDIO.fruit();
        MH_TG.haptic('light');
        WORLD.fruits.splice(i, 1);
      }
    }

    updateParticles(dt);
  }

  function updateParticles(dt) {
    for (let i = WORLD.particles.length - 1; i >= 0; i--) {
      const p = WORLD.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 90 * dt;
      p.life -= dt;
      if (p.life <= 0) WORLD.particles.splice(i, 1);
    }
    for (let i = WORLD.popups.length - 1; i >= 0; i--) {
      const pop = WORLD.popups[i];
      pop.y -= 24 * dt;
      pop.life -= dt;
      if (pop.life <= 0) WORLD.popups.splice(i, 1);
    }
  }

  function triggerCrash() {
    WORLD.hitFreeze = 0.24;
    WORLD.shakeTime = 0.24;
    MH_AUDIO.crash();
    MH_TG.haptic('error');

    if (WORLD.score > saveState.bestScore) {
      saveState.bestScore = WORLD.score;
    }
    saveState.gamesPlayed += 1;
    MH_STORAGE.spendLife(saveState);
    updateHUDPills();
    MH_TG.submitScore(WORLD.score).catch(() => {});
  }

  // ============================================================
  // RENDERING — Airy Vice City Sky + Soft Gradient Sand/Road Below
  // ============================================================
  function drawSoftGround(groundY, isMenu) {
    // Soft sunset-tinted gradient continuing cleanly down (no harsh black band)
    ctx.drawImage(groundBgCanvas, 0, groundY);

    // Crisp Chrome-Dino horizon line with subtle notches
    const gx = Math.round(WORLD.scrollGround);
    ctx.fillStyle = '#140C1C';
    ctx.fillRect(0, groundY, W, 2);

    // Horizon pixel notches & gentle sand/road texture continuing down
    for (let x = -gx; x < W; x += 48) {
      // Little ground bump on horizon line (like 6_scale_reference.png!)
      ctx.fillStyle = '#140C1C';
      ctx.fillRect(x + 12, groundY - 1, 4, 1);
      ctx.fillRect(x + 34, groundY - 1, 2, 1);

      // Subtle warm highlight & scrolling road/sand pebbles at multiple depths
      ctx.fillStyle = '#FFD59E';
      ctx.fillRect(x + 4, groundY + 2, 10, 1);
      ctx.fillRect(x + 28, groundY + 2, 6, 1);

      ctx.fillStyle = '#8F4270';
      ctx.fillRect(x + 8, groundY + 9, 5, 1);
      ctx.fillRect(x + 26, groundY + 14, 2, 1);
      ctx.fillRect(x + 38, groundY + 22, 6, 1);

      ctx.fillStyle = '#6A2E5C';
      ctx.fillRect(x + 16, groundY + 34, 8, 1);
      ctx.fillRect(x + 3, groundY + 48, 3, 1);
      ctx.fillRect(x + 30, groundY + 62, 5, 1);

      ctx.fillStyle = '#4E224F';
      ctx.fillRect(x + 10, groundY + 86, 7, 1);
      ctx.fillRect(x + 34, groundY + 102, 4, 1);
    }

    if (!isMenu && mode === 'playing' && WORLD.runTime < 3.5) {
      const blink = Math.floor(WORLD.time * 3.5) % 2 === 0;
      if (blink) {
        drawPixelText(ctx, 'ТАПНИ — ПРЫЖОК', W / 2, H - 36, 8, '#FFF9F2', {
          align: 'center',
          shadow: '#140C1C',
        });
      }
    }
  }

  function drawBackdrop(groundY, isMenu) {
    ctx.drawImage(skyCanvas, 0, 0);

    for (const s of STARS) {
      const pulse = Math.sin(WORLD.time * 2.4 + s.phase);
      if (pulse > -0.2) {
        ctx.fillStyle = pulse > 0.55 ? '#FFF9F2' : '#FFB3D1';
        ctx.fillRect(s.x, s.y, s.big ? 2 : 1, s.big ? 2 : 1);
      }
    }

    for (const cl of WORLD.clouds) {
      const spr = cl.kind === 'large' ? MH_SPRITES.clouds.large : MH_SPRITES.clouds.small;
      ctx.drawImage(spr, Math.round(cl.x), Math.round(cl.y));
    }

    const skyY = groundY - skylineCanvas.height;
    const sx = Math.round(WORLD.scrollSkyline);
    ctx.drawImage(skylineCanvas, -sx, skyY);
    ctx.drawImage(skylineCanvas, SKYLINE_W - sx, skyY);

    const px = Math.round(WORLD.scrollPalms);
    for (let i = -1; i < 4; i++) {
      const treeX = i * 70 - (px % 70);
      const scale = i % 2 === 0 ? 1 : 1;
      const pw = PALM_SPRITE.width * scale;
      const ph = PALM_SPRITE.height * scale;
      ctx.drawImage(PALM_SPRITE, treeX, groundY - ph, pw, ph);
    }

    drawSoftGround(groundY, isMenu);
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
  }

  function renderMainCanvas() {
    ctx.save();
    if (WORLD.shakeTime > 0) {
      const sx = Math.round((Math.random() - 0.5) * 6);
      const sy = Math.round((Math.random() - 0.5) * 6);
      ctx.translate(sx, sy);
    }

    if (mode === 'menu' || mode === 'sub' || mode === 'rating') {
      drawBackdrop(MENU_GROUND_Y, true);

      // Start Screen Showcase: cute 3_corgi.png-faithful Hero pose at 2x!
      const bob = Math.sin(WORLD.time * 4) > 0.35 ? -1 : 0;
      const heroSpr = MH_SPRITES.corgi.hero;
      drawCorgiPose(ctx, 'hero', 24, MENU_GROUND_Y - heroSpr.height * 2 + bob, 2);

      // 2x Hookah silhouette on the right
      const hSpr = MH_SPRITES.obstacles.hookah;
      ctx.drawImage(hSpr, 130, MENU_GROUND_Y - hSpr.height * 2, hSpr.width * 2, hSpr.height * 2);

      // Floating 2x Pineapple above left
      const fSpr = MH_SPRITES.fruits.pineapple;
      const fbob = Math.round(Math.sin(WORLD.time * 3.5) * 3);
      ctx.drawImage(fSpr, 24, MENU_GROUND_Y - 84 + fbob, fSpr.width * 2, fSpr.height * 2);

      ctx.restore();
      return;
    }

    drawBackdrop(GROUND_Y, false);

    // Draw Obstacles (1x)
    for (const o of WORLD.obstacles) {
      const ox = Math.round(o.x);
      const oy = Math.round(o.y);
      if (o.kind === 'hookah') {
        ctx.drawImage(MH_SPRITES.obstacles.hookah, ox, oy);
      } else if (o.kind === 'shilavilki') {
        ctx.drawImage(MH_SPRITES.obstacles.shilavilki, ox, oy);
      } else if (o.kind === 'coals') {
        const frame = Math.floor(WORLD.time * 6) % 2;
        ctx.drawImage(MH_SPRITES.obstacles.coals[frame], ox, oy);
        drawCoalSmoke(ox, oy + 2);
      }
    }

    // Draw Fruits (1x)
    for (const f of WORLD.fruits) {
      const fy = Math.round(f.baseY + Math.sin(WORLD.time * 5 + f.phase) * 2.5);
      ctx.drawImage(MH_SPRITES.fruits[f.kind], Math.round(f.x), fy);
    }

    // Ground shadow under corgi
    const heightAboveGround = Math.max(0, CORGI_GROUND_TOP - WORLD.corgi.y);
    const shadowW = Math.max(10, Math.round(22 - heightAboveGround * 0.2));
    ctx.fillStyle = 'rgba(20, 12, 28, 0.38)';
    ctx.fillRect(Math.round(WORLD.corgi.x + 14 - shadowW / 2), GROUND_Y + 2, shadowW, 1);

    // Draw Corgi (Intro or Gameplay, 1x -> ~1/7 screen width)
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
      const pose = WORLD.corgi.grounded ? `run${WORLD.corgi.runFrame}` : 'jump';
      drawCorgiPose(ctx, pose, WORLD.corgi.x, WORLD.corgi.y, PLAY_SCALE);
    }

    for (const p of WORLD.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }

    for (const pop of WORLD.popups) {
      drawPixelText(ctx, pop.text, pop.x, pop.y, 8, '#FFD100', {
        align: 'center',
        outline: '#140C1C',
      });
    }

    ctx.restore();
  }

  function renderGameOverDiorama() {
    if (mode !== 'gameover') return;
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

  let lastTs = performance.now();
  function loop(ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    update(dt);
    renderMainCanvas();
    renderGameOverDiorama();
    requestAnimationFrame(loop);
  }

  window.__MH_DEBUG = {
    getState: () => ({ mode, score: WORLD.score, lives: saveState.lives, runTime: WORLD.runTime }),
    showScreen,
    clearWorld: () => {
      WORLD.obstacles = [];
      WORLD.fruits = [];
      WORLD.corgi.y = CORGI_GROUND_TOP;
      WORLD.corgi.vy = 0;
      WORLD.corgi.grounded = true;
      WORLD.spawnCooldown = 3.0;
    },
    setScore: (s) => {
      WORLD.score = s;
      if (s > saveState.bestScore) {
        saveState.bestScore = s;
        MH_STORAGE.save(saveState);
      }
      updateHUDPills();
    },
    spawnObstacle: (kind) => {
      let spr = MH_SPRITES.obstacles.hookah;
      if (kind === 'shilavilki') spr = MH_SPRITES.obstacles.shilavilki;
      if (kind === 'coals') spr = MH_SPRITES.obstacles.coals[0];
      WORLD.obstacles.push({ kind, x: 112, y: GROUND_Y - spr.height, w: spr.width, h: spr.height });
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
      updateHUDPills();
      showScreen('gameover');
    },
    jump: () => requestJump(),
  };

  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    showScreen('menu');
    requestAnimationFrame(loop);
  });
})();

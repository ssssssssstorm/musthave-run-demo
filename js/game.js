(function () {
  const stageEl = document.getElementById('phone-stage');
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const goCanvas = document.getElementById('gameover-canvas');
  const goCtx = goCanvas.getContext('2d');
  goCtx.imageSmoothingEnabled = false;

  // Dynamic integer-scaled logical canvas size (edge-to-edge on any phone, zero letterboxing!)
  let W = 195;
  let H = 422;
  let GROUND_Y = 253;
  let MENU_GROUND_Y = 253;
  let CORGI_GROUND_TOP = 235;
  const PLAY_SCALE = 1;

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

  // ============================================================
  // CRISP BINARY PIXEL TEXT RENDERER
  // ============================================================
  const textScratch = document.createElement('canvas');
  textScratch.width = 210;
  textScratch.height = 24;
  const textCtx = textScratch.getContext('2d');

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = 210;
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
    },
    obstacles: [],
    fruits: [],
    particles: [],
    popups: [],
    spawnCooldown: 1.0,
    dustTimer: 0,
  };

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
    WORLD.speed = 105;
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
    WORLD.obstacles = [];
    WORLD.fruits = [];
    WORLD.particles = [];
    WORLD.popups = [];
    WORLD.spawnCooldown = 0.85;
    WORLD.dustTimer = 0;
    updateHUDPills(false);
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

  function spawnFruitSparkles(x, y, kind) {
    const palette = kind === 'pineapple'
      ? ['#FFD100', '#FFF9F2', '#3ED568']
      : kind === 'peach'
        ? ['#FF8066', '#FF4A8D', '#FFD100']
        : ['#FF9E1B', '#FFD100', '#FFF9F2'];
    for (let i = 0; i < 14; i++) {
      const ang = (Math.PI * 2 * i) / 14 + Math.random() * 0.3;
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
      text: '+1',
      life: 0.72,
      maxLife: 0.72,
    });
  }

  // ============================================================
  // OBSTACLE & FRUIT SPAWNER
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
    spawnDust(c.x + 12, GROUND_Y, 6, 1.4);
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
    const maxL = getDailyMaxLives();
    startLivesBadge.innerHTML = `<span>ЖИЗНИ: ${saveState.lives}/${maxL}</span>${renderPixelHeartsHTML(saveState.lives, maxL)}`;

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
    goLivesRow.innerHTML = `<span>ОСТАЛОСЬ ЖИЗНЕЙ: ${saveState.lives}/${maxL}</span>${renderPixelHeartsHTML(saveState.lives, maxL)}`;

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
    WORLD.speed = Math.min(220, 105 + WORLD.runTime * 2.1);

    WORLD.scrollFarSky = (WORLD.scrollFarSky + WORLD.speed * 0.065 * dt) % FAR_SKY_W;
    WORLD.scrollSkyline = (WORLD.scrollSkyline + WORLD.speed * 0.14 * dt) % MID_SKY_W;
    WORLD.scrollPalms = (WORLD.scrollPalms + WORLD.speed * 0.34 * dt) % 140;
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
        spawnDust(c.x + 14, GROUND_Y, 7, 1.8);
      }
    } else {
      c.animTimer += dt * (12.5 + (WORLD.speed - 105) * 0.05);
      c.runFrame = Math.floor(c.animTimer) % 6;
      WORLD.dustTimer += dt;
      if (WORLD.dustTimer >= 0.16) {
        WORLD.dustTimer = 0;
        spawnDust(c.x + 5, GROUND_Y, 2, 1);
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
        updateHUDPills(true);
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
    MH_TG.submitScore(WORLD.score).catch(() => {});
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
    const catFrame = Math.floor(WORLD.time * 2.4) % 2;
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

    // Draw Fruits with gentle bob + soft glow + orbiting glint
    for (const f of WORLD.fruits) {
      const fx = Math.round(f.x);
      const fy = Math.round(f.baseY + Math.sin(WORLD.time * 5 + f.phase) * 2.5);
      const haloA = 0.22 + 0.10 * Math.sin(WORLD.time * 4 + f.phase);
      ctx.fillStyle = `rgba(255, 242, 180, ${haloA.toFixed(2)})`;
      ctx.fillRect(fx + 1, fy - 1, f.w - 2, f.h + 2);
      ctx.fillRect(fx - 1, fy + 1, f.w + 2, f.h - 2);
      ctx.drawImage(MH_SPRITES.fruits[f.kind], fx, fy);
      // Orbiting 1px sparkle glint
      const gx = fx + Math.round(f.w / 2 + Math.cos(WORLD.time * 4.5 + f.phase) * 7);
      const gy = fy + Math.round(f.h / 2 + Math.sin(WORLD.time * 4.5 + f.phase) * 5);
      ctx.fillStyle = '#FFF9F2';
      ctx.fillRect(gx, gy, 1, 1);
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
      const pose = WORLD.corgi.grounded ? `run${WORLD.corgi.runFrame}` : 'jump';
      drawCorgiPose(ctx, pose, WORLD.corgi.x, WORLD.corgi.y, PLAY_SCALE);
    }

    for (const p of WORLD.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }

    for (const pop of WORLD.popups) {
      const popScaleY = pop.life > pop.maxLife - 0.12 ? -2 : 0;
      drawPixelText(ctx, pop.text, pop.x, pop.y + popScaleY, 8, '#FFD100', {
        align: 'center',
        outline: '#140C1C',
      });
    }

    ctx.drawImage(vignetteCanvas, 0, 0);

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
    getState: () => ({ mode, score: WORLD.score, lives: saveState.lives, runTime: WORLD.runTime, W, H, GROUND_Y }),
    showScreen,
    setMenuTime: (t) => { WORLD.menuTime = t; },
    setMenuIdle: (kind, timer = 0.6) => { WORLD.menuTime = 2.0; WORLD.menuIdle = { kind, timer, dur: 2.5, hopDustDone: false }; },
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
      updateHUDPills(false);
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
      updateHUDPills(false);
      showScreen('gameover');
    },
    jump: () => requestJump(),
  };

  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    showScreen('menu');
    requestAnimationFrame(loop);
  });
})();

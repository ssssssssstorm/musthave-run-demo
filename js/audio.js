// Lightweight 8-bit Web Audio API: chiptune SFX + looping chiptune background music.
// SFX and music are independent (separate on/off switches, separate buses).
window.MH_AUDIO = (function () {
  let ctx = null;
  let enabled = true;        // SFX switch
  let musicEnabled = true;   // music switch
  let sfxBus = null;
  let masterBus = null;
  let hiddenPaused = false;

  const MUSIC_LEVEL = 0.8;   // overall music loudness (kept low so it never fights the SFX)

  function getCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
      } catch (e) {
        return null;
      }
      masterBus = ctx.createGain();
      masterBus.gain.value = 1;
      masterBus.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 1;
      sfxBus.connect(masterBus);
    }
    if (ctx.state === 'suspended' && !hiddenPaused) {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function ensureCtx() {
    if (!enabled) return null;
    return getCtx();
  }

  function tone(freq, duration, type = 'square', volume = 0.06, slideTo = null, delay = 0) {
    const c = ensureCtx();
    if (!c) return;
    const now = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    }
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(sfxBus);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  // ============================================================
  // MUSIC: 4 looping chiptune tracks. Milestones crossfade to the next.
  // ============================================================
  const NOTE_IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midi(name) {
    const m = /^([A-G])(#?)(\d)$/.exec(name);
    return 12 * (parseInt(m[3], 10) + 1) + NOTE_IDX[m[1]] + (m[2] ? 1 : 0);
  }
  function hz(name) {
    return 440 * Math.pow(2, (midi(name) - 69) / 12);
  }

  const CH = {
    C:  { root: 'C3',  fifth: 'G3',  stab: ['E4', 'G4', 'C5'] },
    G:  { root: 'G2',  fifth: 'D3',  stab: ['D4', 'G4', 'B4'] },
    A:  { root: 'A2',  fifth: 'E3',  stab: ['C4', 'E4', 'A4'] },
    F:  { root: 'F2',  fifth: 'C3',  stab: ['C4', 'F4', 'A4'] },
    Dm: { root: 'D3',  fifth: 'A3',  stab: ['D4', 'F4', 'A4'] },
    Em: { root: 'E2',  fifth: 'B2',  stab: ['E4', 'G4', 'B4'] },
    Bb: { root: 'A#2', fifth: 'F3',  stab: ['D4', 'F4', 'A#4'] },
    D:  { root: 'D3',  fifth: 'A3',  stab: ['F#4', 'A4', 'D5'] },
    E:  { root: 'E3',  fifth: 'B3',  stab: ['G#4', 'B4', 'E5'] },
    Am: { root: 'A2',  fifth: 'E3',  stab: ['C4', 'E4', 'A4'] },
  };

  const TRACKS = [
    {
      name: 'Mango Beach',
      bpm: 118,
      prog: ['C', 'G', 'A', 'F', 'C', 'G', 'F', 'G'],
      melody: [
        [[0, 'E5', 2], [2, 'G5', 2], [4, 'A5', 2], [6, 'G5', 2], [8, 'E5', 4], [12, 'D5', 2], [14, 'E5', 2]],
        [[0, 'G5', 2], [2, 'A5', 2], [4, 'B5', 2], [6, 'A5', 2], [8, 'G5', 4], [12, 'D5', 4]],
        [[0, 'A5', 2], [2, 'C6', 2], [4, 'E6', 3], [7, 'D6', 1], [8, 'C6', 2], [10, 'A5', 2], [12, 'E5', 4]],
        [[0, 'F5', 2], [2, 'A5', 2], [4, 'C6', 2], [6, 'A5', 2], [8, 'F5', 2], [10, 'G5', 2], [12, 'A5', 4]],
        [[0, 'E5', 2], [2, 'G5', 2], [4, 'C6', 2], [6, 'D6', 2], [8, 'E6', 4], [12, 'D6', 2], [14, 'C6', 2]],
        [[0, 'B5', 2], [2, 'D6', 2], [4, 'G6', 3], [7, 'D6', 1], [8, 'B5', 2], [10, 'G5', 2], [12, 'A5', 2], [14, 'B5', 2]],
        [[0, 'A5', 2], [2, 'C6', 2], [4, 'F6', 3], [7, 'E6', 1], [8, 'C6', 4], [12, 'A5', 4]],
        [[0, 'G5', 2], [2, 'B5', 2], [4, 'D6', 2], [6, 'B5', 2], [8, 'G5', 2], [10, 'A5', 2], [12, 'B5', 2], [14, 'D6', 2]],
      ],
    },
    {
      name: 'Peach Bounce',
      bpm: 126,
      prog: ['Am', 'F', 'C', 'G', 'Am', 'F', 'Dm', 'E'],
      melody: [
        [[0, 'C5', 2], [2, 'E5', 2], [4, 'A5', 3], [7, 'G5', 1], [8, 'E5', 2], [10, 'C5', 2], [12, 'D5', 4]],
        [[0, 'A4', 2], [2, 'C5', 2], [4, 'F5', 2], [6, 'A5', 2], [8, 'G5', 4], [12, 'F5', 4]],
        [[0, 'G5', 2], [2, 'E5', 2], [4, 'C6', 3], [7, 'B5', 1], [8, 'G5', 2], [10, 'E5', 2], [12, 'C5', 4]],
        [[0, 'D5', 2], [2, 'G5', 2], [4, 'B5', 2], [6, 'D6', 2], [8, 'B5', 2], [10, 'G5', 2], [12, 'A5', 4]],
        [[0, 'A5', 2], [2, 'C6', 2], [4, 'E6', 2], [6, 'C6', 2], [8, 'A5', 4], [12, 'E5', 4]],
        [[0, 'F5', 2], [2, 'A5', 2], [4, 'C6', 3], [7, 'A5', 1], [8, 'F5', 2], [10, 'D5', 2], [12, 'F5', 4]],
        [[0, 'D5', 2], [2, 'F5', 2], [4, 'A5', 2], [6, 'F5', 2], [8, 'D5', 4], [12, 'A4', 4]],
        [[0, 'E5', 2], [2, 'G#5', 2], [4, 'B5', 2], [6, 'E6', 2], [8, 'B5', 2], [10, 'G#5', 2], [12, 'E5', 4]],
      ],
    },
    {
      name: 'Pineapple Parade',
      bpm: 132,
      prog: ['G', 'D', 'Em', 'C', 'G', 'D', 'C', 'D'],
      melody: [
        [[0, 'D5', 2], [2, 'G5', 2], [4, 'B5', 2], [6, 'G5', 2], [8, 'D5', 2], [10, 'E5', 2], [12, 'G5', 4]],
        [[0, 'F#5', 2], [2, 'A5', 2], [4, 'D6', 3], [7, 'A5', 1], [8, 'F#5', 4], [12, 'D5', 4]],
        [[0, 'E5', 2], [2, 'G5', 2], [4, 'B5', 2], [6, 'E6', 2], [8, 'B5', 4], [12, 'G5', 4]],
        [[0, 'E5', 2], [2, 'G5', 2], [4, 'C6', 3], [7, 'G5', 1], [8, 'E5', 2], [10, 'C5', 2], [12, 'D5', 4]],
        [[0, 'G5', 2], [2, 'B5', 2], [4, 'D6', 2], [6, 'G6', 2], [8, 'D6', 4], [12, 'B5', 4]],
        [[0, 'A5', 2], [2, 'F#5', 2], [4, 'D6', 2], [6, 'A5', 2], [8, 'F#5', 4], [12, 'D5', 4]],
        [[0, 'C6', 2], [2, 'G5', 2], [4, 'E5', 2], [6, 'G5', 2], [8, 'C6', 4], [12, 'E6', 4]],
        [[0, 'D6', 2], [2, 'A5', 2], [4, 'F#5', 2], [6, 'A5', 2], [8, 'D6', 2], [10, 'F#6', 2], [12, 'A6', 4]],
      ],
    },
    {
      name: 'Vice Sunset',
      bpm: 108,
      prog: ['Am', 'Em', 'F', 'G', 'Am', 'Dm', 'F', 'E'],
      melody: [
        [[0, 'A4', 4], [4, 'C5', 2], [6, 'E5', 2], [8, 'A5', 4], [12, 'G5', 4]],
        [[0, 'B4', 2], [2, 'E5', 2], [4, 'G5', 4], [8, 'E5', 4], [12, 'B4', 4]],
        [[0, 'C5', 2], [2, 'F5', 2], [4, 'A5', 3], [7, 'G5', 1], [8, 'F5', 4], [12, 'C5', 4]],
        [[0, 'D5', 2], [2, 'G5', 2], [4, 'B5', 4], [8, 'G5', 2], [10, 'D5', 2], [12, 'G4', 4]],
        [[0, 'A5', 4], [4, 'E5', 2], [6, 'C5', 2], [8, 'A4', 4], [12, 'C5', 4]],
        [[0, 'F5', 2], [2, 'A5', 2], [4, 'D6', 4], [8, 'A5', 4], [12, 'F5', 4]],
        [[0, 'C6', 2], [2, 'A5', 2], [4, 'F5', 4], [8, 'C5', 4], [12, 'A4', 4]],
        [[0, 'G#5', 2], [2, 'E5', 2], [4, 'B4', 2], [6, 'E5', 2], [8, 'G#5', 4], [12, 'B5', 4]],
      ],
    },
  ];

  function trackTiming(tr) {
    const step = 60 / tr.bpm / 4;
    return { step: step, barLen: step * 16, bars: tr.prog.length };
  }

  let pulseWave = null;
  let noiseBuf = null;

  function makePulse(c, duty) {
    const n = 32;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    }
    return c.createPeriodicWave(real, imag);
  }

  function makeNoise(c) {
    const len = Math.floor(c.sampleRate * 0.25);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function note(c, bus, t, freq, dur, vol, wave, opts) {
    const osc = c.createOscillator();
    const g = c.createGain();
    if (wave === 'pulse') osc.setPeriodicWave(pulseWave);
    else osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    if (opts && opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
    const atk = (opts && opts.atk) || 0.006;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noiseHit(c, bus, t, dur, vol, hpFreq) {
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = hpFreq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp);
    hp.connect(g);
    g.connect(bus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function scheduleBar(c, bus, t0, barIdx, track) {
    const tr = track || TRACKS[currentTrack] || TRACKS[0];
    const tm = trackTiming(tr);
    if (!pulseWave || pulseWave.__c !== c) {
      pulseWave = makePulse(c, 0.25);
      pulseWave.__c = c;
    }
    if (!noiseBuf || noiseBuf.__c !== c) {
      noiseBuf = makeNoise(c);
      noiseBuf.__c = c;
    }
    const bars = tr.prog.length;
    const ch = CH[tr.prog[barIdx % bars]];
    const melody = tr.melody[barIdx % bars];
    const STEP = tm.step;

    for (let i = 0; i < melody.length; i++) {
      const st = melody[i][0], nm = melody[i][1], len = melody[i][2];
      const t = t0 + st * STEP;
      const d = len * STEP * 0.92;
      note(c, bus, t, hz(nm), d, 0.05, 'pulse', { atk: 0.01 });
      if (len >= 4) note(c, bus, t + STEP * 2, hz(nm) * 2, STEP * 1.6, 0.012, 'square');
    }

    note(c, bus, t0, hz(ch.root), STEP * 3, 0.13, 'triangle');
    note(c, bus, t0 + STEP * 3, hz(ch.root), STEP * 1.5, 0.1, 'triangle');
    note(c, bus, t0 + STEP * 8, hz(ch.fifth), STEP * 3, 0.12, 'triangle');
    note(c, bus, t0 + STEP * 11, hz(ch.root) * 2, STEP * 1.5, 0.08, 'triangle');

    const stabs = [2, 6, 10, 14];
    for (let s = 0; s < stabs.length; s++) {
      for (let n = 0; n < ch.stab.length; n++) {
        note(c, bus, t0 + stabs[s] * STEP, hz(ch.stab[n]), STEP * 1.1, 0.011, 'square', { atk: 0.003 });
      }
    }

    const kicks = [0, 8];
    for (let k = 0; k < kicks.length; k++) {
      note(c, bus, t0 + kicks[k] * STEP, 120, 0.12, 0.2, 'sine', { slideTo: 42, atk: 0.002 });
    }
    note(c, bus, t0 + 11 * STEP, 110, 0.09, 0.09, 'sine', { slideTo: 42, atk: 0.002 });
    const claps = [4, 12];
    for (let k = 0; k < claps.length; k++) {
      noiseHit(c, bus, t0 + claps[k] * STEP, 0.09, 0.05, 1500);
    }
    for (let st = 0; st < 16; st += 2) {
      noiseHit(c, bus, t0 + st * STEP, 0.03, st % 4 === 2 ? 0.035 : 0.018, 7000);
    }
  }

  let musicBus = null;
  let musicTimer = null;
  let nextBarTime = 0;
  let barIdx = 0;
  let musicPlaying = false;
  let currentTrack = 0;

  function fadeOutBus(bus, sec) {
    if (!bus || !ctx) return;
    try {
      bus.gain.cancelScheduledValues(ctx.currentTime);
      bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), ctx.currentTime);
      bus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + sec);
    } catch (e) { /* noop */ }
    setTimeout(function () {
      try { bus.disconnect(); if (bus.__lp) bus.__lp.disconnect(); } catch (e2) { /* noop */ }
    }, Math.ceil((sec + 0.08) * 1000));
  }

  function attachMusicBus(c, fadeSec) {
    const bus = c.createGain();
    const start = fadeSec > 0 ? 0.0001 : MUSIC_LEVEL;
    bus.gain.setValueAtTime(start, c.currentTime);
    if (fadeSec > 0) bus.gain.linearRampToValueAtTime(MUSIC_LEVEL, c.currentTime + fadeSec);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5200;
    bus.connect(lp);
    lp.connect(masterBus);
    bus.__lp = lp;
    return bus;
  }

  function musicTick() {
    if (!ctx || !musicBus) return;
    const tm = trackTiming(TRACKS[currentTrack] || TRACKS[0]);
    while (nextBarTime < ctx.currentTime + 0.7) {
      scheduleBar(ctx, musicBus, nextBarTime, barIdx, TRACKS[currentTrack]);
      nextBarTime += tm.barLen;
      barIdx = (barIdx + 1) % tm.bars;
    }
  }

  function startMusic() {
    if (!musicEnabled) return;
    const c = getCtx();
    if (!c) return;
    if (musicPlaying) return;
    musicBus = attachMusicBus(c, 0);
    nextBarTime = c.currentTime + 0.08;
    barIdx = 0;
    musicPlaying = true;
    musicTick();
    musicTimer = setInterval(musicTick, 180);
  }

  function setTrack(idx, fadeSec) {
    fadeSec = fadeSec == null ? 0.45 : fadeSec;
    const n = TRACKS.length;
    idx = ((idx % n) + n) % n;
    if (!musicEnabled) { currentTrack = idx; return; }
    if (musicPlaying && currentTrack === idx) return;
    currentTrack = idx;
    if (!unlocked) return;
    const c = getCtx();
    if (!c) return;
    if (!musicPlaying) {
      startMusic();
      return;
    }
    fadeOutBus(musicBus, fadeSec);
    musicBus = attachMusicBus(c, fadeSec);
    nextBarTime = c.currentTime + 0.06;
    barIdx = 0;
    musicTick();
  }

  function stopMusic() {
    if (!musicPlaying) return;
    musicPlaying = false;
    clearInterval(musicTimer);
    musicTimer = null;
    const bus = musicBus;
    musicBus = null;
    fadeOutBus(bus, 0.12);
  }

  // First user gesture unlocks audio and starts the music
  let unlocked = false;
  function unlock(skipMusic) {
    const c = getCtx();
    if (c && c.state === 'suspended' && !hiddenPaused) c.resume().catch(() => {});
    if (!unlocked) {
      unlocked = true;
      if (musicEnabled && !skipMusic) startMusic();
    }
  }
  ['pointerdown', 'touchstart', 'mousedown', 'keydown', 'click'].forEach((evt) => {
    window.addEventListener(evt, function onFirst(e) {
      const onMusicBtn = !!(e && e.target && e.target.closest && e.target.closest('#btn-music'));
      unlock(onMusicBtn);
      if (unlocked && ctx && ctx.state === 'running') {
        ['pointerdown', 'touchstart', 'mousedown', 'keydown', 'click'].forEach((e2) => window.removeEventListener(e2, onFirst, true));
      }
    }, true);
  });

  // Pause everything while the app is hidden / in the background
  function pauseAll() {
    hiddenPaused = true;
    if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
  }
  function resumeAll() {
    hiddenPaused = false;
    if (ctx && ctx.state === 'suspended' && unlocked) ctx.resume().catch(() => {});
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseAll();
    else resumeAll();
  });
  window.addEventListener('pagehide', pauseAll);
  window.addEventListener('pageshow', () => { if (!document.hidden) resumeAll(); });
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg && tg.onEvent) {
      tg.onEvent('deactivated', pauseAll);
      tg.onEvent('activated', resumeAll);
    }
  } catch (e) { /* noop */ }

  return {
    setEnabled(val) {
      enabled = !!val;
    },
    isEnabled() {
      return enabled;
    },
    setMusicEnabled(val) {
      musicEnabled = !!val;
      if (!musicEnabled) stopMusic();
      else if (unlocked) startMusic();
    },
    isMusicEnabled() {
      return musicEnabled;
    },
    isMusicPlaying() {
      return musicPlaying && !!ctx && ctx.state === 'running';
    },
    getDebug() {
      return { state: ctx ? ctx.state : 'none', playing: musicPlaying, unlocked, hiddenPaused, track: currentTrack, trackName: (TRACKS[currentTrack] || TRACKS[0]).name };
    },
    unlock,
    startMusic,
    stopMusic,
    setTrack,
    getTrack() { return currentTrack; },
    trackCount() { return TRACKS.length; },
    lifeUp() {
      tone(523, 0.08, 'square', 0.05, 784);
      tone(659, 0.10, 'square', 0.05, null, 0.07);
      tone(1047, 0.16, 'triangle', 0.06, null, 0.14);
    },
    rankUp() {
      tone(392, 0.08, 'square', 0.05, 523);
      tone(523, 0.09, 'square', 0.05, null, 0.07);
      tone(659, 0.10, 'square', 0.05, null, 0.14);
      tone(784, 0.18, 'triangle', 0.06, null, 0.22);
    },
    // test helper: render N bars of the music offline and return summary stats
    renderMusicStats(bars = 8) {
      const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const sr = 22050;
      const tm = trackTiming(TRACKS[0]);
      const oc = new AC(1, Math.ceil(sr * tm.barLen * bars), sr);
      const bus = oc.createGain();
      bus.gain.value = MUSIC_LEVEL;
      bus.connect(oc.destination);
      for (let b = 0; b < bars; b++) scheduleBar(oc, bus, b * tm.barLen, b, TRACKS[0]);
      return oc.startRendering().then((buf) => {
        const d = buf.getChannelData(0);
        let peak = 0, sum = 0;
        for (let i = 0; i < d.length; i++) {
          const a = Math.abs(d[i]);
          if (a > peak) peak = a;
          sum += d[i] * d[i];
        }
        return { seconds: buf.duration, peak, rms: Math.sqrt(sum / d.length), samples: Array.from(d) };
      });
    },
    click() {
      tone(520, 0.05, 'square', 0.04, 680);
    },
    jump() {
      tone(280, 0.11, 'square', 0.05, 620);
    },
    doubleJump() {
      tone(420, 0.09, 'square', 0.05, 900);
      tone(630, 0.12, 'square', 0.04, 1260, 0.05);
    },
    fruit() {
      tone(660, 0.06, 'square', 0.055);
      tone(990, 0.10, 'square', 0.055, null, 0.055);
    },
    spin() {
      tone(340, 0.06, 'triangle', 0.04, 480);
    },
    ready() {
      tone(440, 0.06, 'square', 0.045);
      tone(660, 0.09, 'square', 0.045, null, 0.07);
    },
    bounce() {
      tone(160, 0.22, 'square', 0.05, 720);
      tone(320, 0.16, 'triangle', 0.05, 1100, 0.06);
    },
    pickup() {
      tone(523, 0.06, 'square', 0.05);
      tone(659, 0.06, 'square', 0.05, null, 0.06);
      tone(988, 0.12, 'square', 0.05, null, 0.12);
    },
    golden() {
      tone(784, 0.06, 'square', 0.055);
      tone(1175, 0.06, 'square', 0.05, null, 0.05);
      tone(1568, 0.14, 'triangle', 0.06, null, 0.1);
    },
    comboUp() {
      tone(880, 0.05, 'square', 0.04, 1320);
      tone(1320, 0.08, 'square', 0.035, 1760, 0.05);
    },
    shieldBreak() {
      tone(1200, 0.12, 'triangle', 0.06, 300);
      tone(600, 0.16, 'square', 0.035, 150, 0.04);
    },
    duck() {
      tone(300, 0.07, 'triangle', 0.035, 160);
    },
    rain() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.09, 'square', 0.045, null, i * 0.07));
    },
    crash() {
      tone(220, 0.14, 'sawtooth', 0.06, 95);
      tone(130, 0.18, 'square', 0.05, 60, 0.09);
    },
  };
})();

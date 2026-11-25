// Lightweight 8-bit Web Audio API chiptune SFX
window.MH_AUDIO = (function () {
  let ctx = null;
  let enabled = true;

  function ensureCtx() {
    if (!enabled) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
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
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  return {
    setEnabled(val) {
      enabled = !!val;
    },
    isEnabled() {
      return enabled;
    },
    click() {
      tone(520, 0.05, 'square', 0.04, 680);
    },
    jump() {
      tone(280, 0.11, 'square', 0.05, 620);
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
    crash() {
      tone(220, 0.14, 'sawtooth', 0.06, 95);
      tone(130, 0.18, 'square', 0.05, 60, 0.09);
    },
  };
})();

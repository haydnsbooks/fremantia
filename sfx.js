// ============================================================================
// SFX — small, synthesized sound effects for gameplay feedback.
//
// No audio files are used: every sound is generated on the fly with the Web
// Audio API (oscillators + short gain envelopes, plus a tiny noise burst for
// percussive hits). This keeps the game fully self-contained and each sound
// tiny/instant. All playback is best-effort: if Web Audio isn't available,
// or the browser blocks audio before a user gesture, calls simply do nothing
// rather than throwing — sound must never be able to break gameplay.
// ============================================================================

const SFX = (() => {
  let ctx = null;

  function getCtx() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return ctx;
    } catch (e) {
      return null;
    }
  }

  // A single tone with a short attack + exponential decay so it never clicks.
  // freqEnd (optional) glides the pitch across the note's duration.
  function tone(freq, { type = "sine", duration = 0.15, delay = 0, gain = 0.16, freqEnd = null, attack = 0.008 } = {}) {
    const c = getCtx();
    if (!c) return;
    try {
      const t0 = c.currentTime + delay;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(1, freq), t0);
      if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(g).connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.03);
    } catch (e) { /* ignore — sound is never allowed to break gameplay */ }
  }

  // Short filtered noise burst — used for percussive/impact sounds.
  function noiseBurst({ duration = 0.08, delay = 0, gain = 0.16, filterFreq = 1200 } = {}) {
    const c = getCtx();
    if (!c) return;
    try {
      const t0 = c.currentTime + delay;
      const size = Math.max(1, Math.floor(c.sampleRate * duration));
      const buffer = c.createBuffer(1, size, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
      const src = c.createBufferSource();
      src.buffer = buffer;
      const filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = filterFreq;
      const g = c.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      src.connect(filter).connect(g).connect(c.destination);
      src.start(t0);
      src.stop(t0 + duration + 0.03);
    } catch (e) { /* ignore */ }
  }

  function sequence(notes) { notes.forEach(n => tone(n.freq, n)); }

  // Wrap every public method so a thrown error never propagates into the game.
  function safe(fn) {
    return (...args) => { try { fn(...args); } catch (e) { /* ignore */ } };
  }

  return {
    // ---- 4 element realms --------------------------------------------------
    correctAnswer: safe(() => {
      sequence([
        { freq: 660.00, duration: 0.10, delay: 0,    type: "triangle", gain: 0.16 },
        { freq: 880.00, duration: 0.14, delay: 0.08, type: "triangle", gain: 0.18 }
      ]);
    }),
    incorrectAnswer: safe(() => {
      // Deliberately soft — a single low, gentle tone, not a harsh buzzer.
      tone(220, { duration: 0.22, type: "sine", gain: 0.11, freqEnd: 175, attack: 0.015 });
    }),
    monsterClear: safe(() => {
      sequence([
        { freq: 523.25, duration: 0.11, delay: 0,    type: "triangle", gain: 0.15 },
        { freq: 659.25, duration: 0.11, delay: 0.09, type: "triangle", gain: 0.16 },
        { freq: 784.00, duration: 0.22, delay: 0.18, type: "triangle", gain: 0.18 }
      ]);
    }),
    battleFailed: safe(() => {
      sequence([
        { freq: 392.00, duration: 0.22, delay: 0,    type: "sine", gain: 0.13 },
        { freq: 329.63, duration: 0.22, delay: 0.16, type: "sine", gain: 0.12 },
        { freq: 261.63, duration: 0.38, delay: 0.32, type: "sine", gain: 0.12, freqEnd: 210 }
      ]);
    }),
    keyEarned: safe(() => {
      sequence([
        { freq: 784.00,  duration: 0.10, delay: 0,    type: "sine", gain: 0.13 },
        { freq: 987.77,  duration: 0.10, delay: 0.07, type: "sine", gain: 0.14 },
        { freq: 1174.66, duration: 0.10, delay: 0.14, type: "sine", gain: 0.15 },
        { freq: 1567.98, duration: 0.28, delay: 0.21, type: "sine", gain: 0.17 }
      ]);
    }),

    // ---- Combat realm -------------------------------------------------------
    attributeLevelUp: safe(() => {
      tone(220, { duration: 0.30, type: "sawtooth", gain: 0.12, freqEnd: 880 });
    }),
    shopPurchase: safe(() => {
      sequence([
        { freq: 1046.50, duration: 0.08, delay: 0,    type: "square", gain: 0.09 },
        { freq: 1568.00, duration: 0.16, delay: 0.06, type: "square", gain: 0.11 }
      ]);
    }),
    petTap: safe(() => {
      // Random pitch each time so repeated taps feel alive, not robotic.
      const freq = 900 + Math.random() * 500;
      tone(freq, { duration: 0.09, type: "sine", gain: 0.13, freqEnd: freq * 1.4, attack: 0.004 });
    }),
    attackOnMonster: safe(() => {
      noiseBurst({ duration: 0.07, gain: 0.15, filterFreq: 2200 });
      tone(180, { duration: 0.05, type: "square", gain: 0.07 });
    }),
    monsterAttackOnHero: safe(() => {
      tone(110, { duration: 0.14, type: "triangle", gain: 0.14, freqEnd: 80 });
      noiseBurst({ duration: 0.06, gain: 0.07, filterFreq: 450 });
    }),
    combatMonsterClear: safe(() => {
      sequence([
        { freq: 392.00,  duration: 0.10, delay: 0,    type: "square", gain: 0.11 },
        { freq: 523.25,  duration: 0.10, delay: 0.09, type: "square", gain: 0.12 },
        { freq: 659.25,  duration: 0.10, delay: 0.18, type: "square", gain: 0.13 },
        { freq: 1046.50, duration: 0.28, delay: 0.27, type: "square", gain: 0.14 }
      ]);
    }),
    combatMonsterLoss: safe(() => {
      sequence([
        { freq: 196.00, duration: 0.24, delay: 0,    type: "sawtooth", gain: 0.11, freqEnd: 150 },
        { freq: 146.83, duration: 0.36, delay: 0.20, type: "sawtooth", gain: 0.11, freqEnd: 100 }
      ]);
    })
  };
})();

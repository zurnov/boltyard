// Trailer score, rendered offline in the browser (OfflineAudioContext) from a spec written by
// tools/trailer.py. Original music, synthesised here: drones, drums, a driving saw bass, chord stabs,
// braam hits and risers, in A minor like the game's battle track. On top of it the spec places the
// game's own CC0 sound effects (gunshots, explosions, clanks) at the times they happen on screen.
//
// window.renderScore(spec) -> Promise<base64 WAV (48 kHz, 16-bit stereo)>
/* eslint-disable no-unused-vars */
(() => {
  const SR = 48000;
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  window.renderScore = async (spec) => {
    const beat = 60 / spec.bpm;
    const bar = beat * 4;
    const dur = spec.seconds + 3;
    const ac = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);

    // ---------- buses: music and sfx -> glue compressor -> limiter
    const limiter = ac.createDynamicsCompressor();
    Object.assign(limiter, {});
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.12;
    const glue = ac.createDynamicsCompressor();
    glue.threshold.value = -16; glue.knee.value = 8; glue.ratio.value = 3; glue.attack.value = 0.01; glue.release.value = 0.2;
    const master = ac.createGain(); master.gain.value = 0.9;
    // keep the infrasonic rumble out: it eats headroom and makes the limiter flatten everything
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 32; hp.Q.value = 0.7;
    glue.connect(hp); hp.connect(master); master.connect(limiter); limiter.connect(ac.destination);
    const music = ac.createGain(); music.gain.value = 0.8; music.connect(glue);
    const sfx = ac.createGain(); sfx.gain.value = 0.85; sfx.connect(glue);
    // music duck: the score dips under big on-screen hits
    const duck = ac.createGain(); duck.gain.value = 1; duck.connect(music);

    // reverb: generated stereo impulse, ~2.6 s tail
    const verb = ac.createConvolver();
    {
      const len = Math.floor(SR * 2.6), ir = ac.createBuffer(2, len, SR);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        let seed = 1234 + c * 77;
        for (let i = 0; i < len; i++) { seed = (seed * 16807) % 2147483647; d[i] = ((seed / 2147483647) * 2 - 1) * Math.pow(1 - i / len, 3.2); }
      }
      verb.buffer = ir;
    }
    const verbIn = ac.createGain(); verbIn.gain.value = 0.35; verbIn.connect(verb);
    const verbOut = ac.createGain(); verbOut.gain.value = 0.9; verb.connect(verbOut); verbOut.connect(glue);

    // noise
    const noise = ac.createBuffer(1, SR * 2, SR);
    { const d = noise.getChannelData(0); let s = 99; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; } }
    const noiseSrc = (t, len) => { const n = ac.createBufferSource(); n.buffer = noise; n.loop = true; n.start(t, Math.random() * 1.5); n.stop(t + len); return n; };
    const env = (g, t, a, peak, d, end = 0.0001) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); };
    const drive = (amt) => { const ws = ac.createWaveShaper(); const n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / n) * 2 - 1; c[i] = Math.tanh(x * amt) / Math.tanh(amt); } ws.curve = c; ws.oversample = '2x'; return ws; };
    const out = (node, bus = duck, send = 0) => { node.connect(bus); if (send) { const s = ac.createGain(); s.gain.value = send; node.connect(s); s.connect(verbIn); } };

    // ---------- instruments
    const kick = (t, g = 1) => {
      const o = ac.createOscillator(), a = ac.createGain();
      o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      env(a, t, 0.002, 1.0 * g, 0.38); o.connect(a); out(a);
      o.start(t); o.stop(t + 0.45);
      const c = noiseSrc(t, 0.02), cf = ac.createBiquadFilter(), cg = ac.createGain(); cf.type = 'highpass'; cf.frequency.value = 2500;
      env(cg, t, 0.001, 0.25 * g, 0.015); c.connect(cf); cf.connect(cg); out(cg);
    };
    const snare = (t, g = 1, send = 0.35) => {
      const n = noiseSrc(t, 0.3), f = ac.createBiquadFilter(), a = ac.createGain();
      f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7; env(a, t, 0.002, 0.7 * g, 0.2); n.connect(f); f.connect(a); out(a, duck, send);
      const o = ac.createOscillator(), b = ac.createGain(); o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
      env(b, t, 0.002, 0.5 * g, 0.12); o.connect(b); out(b); o.start(t); o.stop(t + 0.2);
    };
    const hat = (t, g = 1, open = false) => {
      const n = noiseSrc(t, open ? 0.35 : 0.06), f = ac.createBiquadFilter(), a = ac.createGain();
      f.type = 'highpass'; f.frequency.value = 7500; env(a, t, 0.001, 0.22 * g, open ? 0.28 : 0.035); n.connect(f); f.connect(a); out(a);
    };
    const tom = (t, f0 = 110, g = 1) => {
      const o = ac.createOscillator(), a = ac.createGain(); o.frequency.setValueAtTime(f0 * 1.6, t); o.frequency.exponentialRampToValueAtTime(f0, t + 0.12);
      env(a, t, 0.003, 0.8 * g, 0.4); o.connect(a); out(a, duck, 0.25); o.start(t); o.stop(t + 0.5);
    };
    const crash = (t, g = 1) => {
      const n = noiseSrc(t, 2.2), f = ac.createBiquadFilter(), a = ac.createGain(); f.type = 'highpass'; f.frequency.value = 4000;
      env(a, t, 0.003, 0.28 * g, 2.0); n.connect(f); f.connect(a); out(a, duck, 0.3);
    };
    const bass = (t, len, note, cutoff = 900, g = 1, amt = 3) => {
      const a = ac.createGain(), f = ac.createBiquadFilter(), ws = drive(amt);
      f.type = 'lowpass'; f.Q.value = 6; f.frequency.setValueAtTime(cutoff * 2.2, t); f.frequency.exponentialRampToValueAtTime(cutoff, t + Math.min(0.12, len));
      for (const det of [-7, 7]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(note); o.detune.value = det; o.connect(ws); o.start(t); o.stop(t + len + 0.05); }
      const sub = ac.createOscillator(); sub.frequency.value = midi(note - 12); const sg = ac.createGain(); sg.gain.value = 0.3; sub.connect(sg); sg.connect(a); sub.start(t); sub.stop(t + len + 0.05);
      ws.connect(f); f.connect(a);
      a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(0.32 * g, t + 0.005); a.gain.setValueAtTime(0.32 * g, t + len * 0.8); a.gain.exponentialRampToValueAtTime(0.0001, t + len);
      out(a);
    };
    const stab = (t, len, notes, g = 1, cutoff = 2600) => {
      const a = ac.createGain(), f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(500, t + len);
      for (const n of notes) for (const det of [-9, 0, 9]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det; o.connect(f); o.start(t); o.stop(t + len + 0.1); }
      f.connect(a); env(a, t, 0.004, 0.06 * g, len); out(a, duck, 0.4);
    };
    const drone = (t0, t1, notes, cutoff = 320, g = 1) => {
      const a = ac.createGain(), f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 2;
      const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.18; lg.gain.value = cutoff * 0.45; lfo.connect(lg); lg.connect(f.frequency); lfo.start(t0); lfo.stop(t1);
      for (const n of notes) for (const det of [-12, 12]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det; o.connect(f); o.start(t0); o.stop(t1 + 0.1); }
      f.connect(a);
      a.gain.setValueAtTime(0.0001, t0); a.gain.exponentialRampToValueAtTime(0.09 * g, t0 + Math.min(2, (t1 - t0) / 2)); a.gain.setValueAtTime(0.09 * g, Math.max(t0 + 0.01, t1 - 0.6)); a.gain.exponentialRampToValueAtTime(0.0001, t1);
      out(a, duck, 0.5);
    };
    const subBoom = (t, g = 1, len = 2.2) => {
      const o = ac.createOscillator(), a = ac.createGain(); o.frequency.setValueAtTime(72, t); o.frequency.exponentialRampToValueAtTime(38, t + len);
      env(a, t, 0.005, 0.45 * g, len); o.connect(a); out(a, music); o.start(t); o.stop(t + len + 0.1);
    };
    const braam = (t, g = 1, len = 2.6) => {
      const a = ac.createGain(), f = ac.createBiquadFilter(), ws = drive(6);
      f.type = 'lowpass'; f.Q.value = 3; f.frequency.setValueAtTime(220, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.08); f.frequency.exponentialRampToValueAtTime(260, t + len);
      for (const n of [33, 40, 45, 48]) for (const det of [-14, 0, 14]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det; o.connect(ws); o.start(t); o.stop(t + len + 0.1); }
      ws.connect(f); f.connect(a); env(a, t, 0.01, 0.22 * g, len); out(a, music, 0.5);
      subBoom(t, g, len);
      crash(t, 0.8 * g);
      const n = noiseSrc(t, 0.5), nf = ac.createBiquadFilter(), ng = ac.createGain(); nf.type = 'lowpass'; nf.frequency.value = 1200; env(ng, t, 0.002, 0.5 * g, 0.4); n.connect(nf); nf.connect(ng); out(ng, music, 0.6);
    };
    const hit = (t, g = 1) => { // shorter cinematic impact for title cards
      kick(t, 1.2 * g); tom(t, 70, g); crash(t, 0.5 * g); subBoom(t, 0.6 * g, 1.2);
      const n = noiseSrc(t, 0.25), f = ac.createBiquadFilter(), a = ac.createGain(); f.type = 'bandpass'; f.frequency.value = 900; env(a, t, 0.002, 0.45 * g, 0.22); n.connect(f); f.connect(a); out(a, music, 0.7);
    };
    const riser = (t0, t1, g = 1) => {
      const n = noiseSrc(t0, t1 - t0 + 0.05), f = ac.createBiquadFilter(), a = ac.createGain();
      f.type = 'bandpass'; f.Q.value = 4; f.frequency.setValueAtTime(300, t0); f.frequency.exponentialRampToValueAtTime(7000, t1);
      a.gain.setValueAtTime(0.0001, t0); a.gain.exponentialRampToValueAtTime(0.35 * g, t1 - 0.02); a.gain.linearRampToValueAtTime(0, t1);
      n.connect(f); f.connect(a); out(a, music, 0.4);
      const o = ac.createOscillator(), b = ac.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(880, t1);
      const of = ac.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 2400;
      b.gain.setValueAtTime(0.0001, t0); b.gain.exponentialRampToValueAtTime(0.05 * g, t1 - 0.02); b.gain.linearRampToValueAtTime(0, t1);
      o.connect(of); of.connect(b); out(b, music, 0.3); o.start(t0); o.stop(t1 + 0.02);
    };
    const whoosh = (t, len = 0.35, g = 1) => {
      const n = noiseSrc(t - len, len + 0.05), f = ac.createBiquadFilter(), a = ac.createGain();
      f.type = 'bandpass'; f.Q.value = 1.5; f.frequency.setValueAtTime(400, t - len); f.frequency.exponentialRampToValueAtTime(3500, t);
      a.gain.setValueAtTime(0.0001, t - len); a.gain.exponentialRampToValueAtTime(0.25 * g, t - 0.01); a.gain.linearRampToValueAtTime(0, t + 0.03);
      n.connect(f); f.connect(a); out(a, sfx);
    };
    const tick = (t, g = 1) => {
      const o = ac.createOscillator(), a = ac.createGain(), f = ac.createBiquadFilter(); o.type = 'square'; o.frequency.value = 2200; f.type = 'bandpass'; f.frequency.value = 2200;
      env(a, t, 0.001, 0.05 * g, 0.03); o.connect(f); f.connect(a); out(a, duck, 0.2); o.start(t); o.stop(t + 0.05);
    };

    // ---------- samples (the game's own sounds)
    const buffers = {};
    // one at a time with retries: small local servers drop bursts of parallel requests
    for (const [k, url] of Object.entries(spec.samples)) {
      for (let tries = 0; ; tries++) {
        try { const r = await fetch(url); buffers[k] = await ac.decodeAudioData(await r.arrayBuffer()); break; }
        catch (err) { if (tries >= 4) throw err; await new Promise((res) => setTimeout(res, 300)); }
      }
    }
    const play = (e) => {
      const b = buffers[e.s]; if (!b) return;
      const src = ac.createBufferSource(); src.buffer = b; src.playbackRate.value = e.rate ?? 1;
      const g = ac.createGain(); g.gain.value = e.g ?? 1;
      const p = ac.createStereoPanner(); p.pan.value = e.pan ?? 0;
      src.connect(g); g.connect(p); out(p, sfx, e.verb ?? 0.15);
      src.start(e.t);
    };

    // ---------- arrangement, section by section on the bar grid
    const T = (b, bt = 0) => b * bar + bt * beat;
    const A = { chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]], bass: [33, 29, 31, 28] }; // Am F G Em
    // the trailer's dynamic shape: quiet intro, build, full drop, slow-motion dip, last hits
    const LEVEL = { intro: 0.38, title: 0.75, build: 0.55, swap: 0.72, break: 0.95, drop: 1, breakdown: 0.62, riser: 0.9, final: 1, end: 0.85 };
    music.gain.setValueAtTime(0.8 * LEVEL.intro, 0);
    for (const sec of spec.sections) music.gain.setTargetAtTime(0.8 * (LEVEL[sec.name] ?? 1), Math.max(0, sec.from * bar - 0.02), 0.015);
    for (const sec of spec.sections) {
      const { name, from, to } = sec;
      for (let b = from; b < to; b++) {
        const i = b - from, ci = b % 4;
        if (name === 'intro') {
          if (i === 0) drone(T(from), T(to) + 0.3, [33, 40], 300, 1);
          if (i === 0 || i === 2) { subBoom(T(b), 0.5, 2.6); }
          if (b >= from + 2) for (let k = 0; k < 8; k++) tick(T(b, k / 2), 0.4 + 0.6 * ((b - from - 2) * 8 + k) / 16);
          if (b === to - 1) riser(T(b), T(to), 0.9);
        } else if (name === 'title') {
          braam(T(b), 1.0, 2.8);
          drone(T(b), T(to) + 0.2, [33, 45], 420, 0.8);
        } else if (name === 'build') {
          for (let k = 0; k < 8; k++) bass(T(b, k / 2), beat / 2 * 0.9, A.bass[0] + (k % 4 === 3 ? 12 : 0), 380 + i * 160, 0.75, 2);
          kick(T(b, 0), 0.8); kick(T(b, 2), 0.8);
          for (let k = 0; k < 16; k++) hat(T(b, k / 4), k % 4 === 2 ? 0.9 : 0.45);
          if (b === to - 1) riser(T(b, 2), T(to), 0.6);
        } else if (name === 'swap') {
          for (let k = 0; k < 8; k++) bass(T(b, k / 2), beat / 2 * 0.9, A.bass[ci] + (k % 2 ? 12 : 0), 650 + i * 220, 0.85, 3);
          kick(T(b, 0)); kick(T(b, 2)); snare(T(b, 1), 0.8); snare(T(b, 3), 0.8);
          for (let k = 0; k < 8; k++) hat(T(b, k / 2), 0.6);
          stab(T(b, 0), beat * 1.5, A.chords[ci], 0.8);
        } else if (name === 'break') {
          // "Break theirs.": braam on the downbeat, snare roll, then one beat of silence
          braam(T(b), 1.1, 1.8);
          for (let k = 0; k < 12; k++) snare(T(b, 1 + k / 4 * 0.75 * 1.0), 0.25 + 0.06 * k, 0.15);
          riser(T(b, 1), T(b, 3), 0.8);
        } else if (name === 'drop') {
          const hard = i % 4 === 3; // fill every 4th bar
          kick(T(b, 0), 1.15); kick(T(b, 1.5), 0.9); kick(T(b, 2), 1.1); if (!hard) kick(T(b, 3.5), 0.7);
          snare(T(b, 1), 1); snare(T(b, 3), 1);
          for (let k = 0; k < 8; k++) hat(T(b, k / 2 + 0.25), 0.5, k === 7);
          for (let k = 0; k < 8; k++) { const n = A.bass[ci] + ([0, 0, 12, 0, 7, 0, 12, 10][k]); bass(T(b, k / 2), beat / 2 * 0.85, n, 1100, 1, 4); }
          stab(T(b, 0), beat * 0.9, A.chords[ci].map((n) => n + 12), 1.0, 3800);
          stab(T(b, 2.5), beat * 0.5, A.chords[ci].map((n) => n + 12), 0.7, 3200);
          if (i % 4 === 0) crash(T(b), 1);
          if (hard) { tom(T(b, 3), 140, 0.9); tom(T(b, 3.25), 115, 0.9); tom(T(b, 3.5), 95, 1); tom(T(b, 3.75), 78, 1); }
        } else if (name === 'breakdown') {
          // half-time, filtered: the slow-motion beat
          if (i === 0) { drone(T(b), T(to), [33, 40, 45], 600, 1.1); subBoom(T(b), 0.8, 3); }
          kick(T(b, 0), 0.9); snare(T(b, 2), 0.7, 0.6);
          for (let k = 0; k < 2; k++) bass(T(b, k * 2), beat * 1.9, A.bass[ci], 260, 0.8, 2);
          stab(T(b, 0), bar * 0.95, A.chords[ci], 0.7, 900);
        } else if (name === 'riser') {
          for (let k = 0; k < 16; k++) snare(T(b, k / 4), 0.35 + 0.045 * k, 0.1);
          for (let k = 0; k < 8; k++) kick(T(b, k / 2), 0.6 + 0.05 * k);
          riser(T(b), T(to), 1.1);
        } else if (name === 'final') {
          braam(T(b), 1.25, 3.2);
          drone(T(b), T(to) + 0.5, [33, 40], 380, 0.8);
        } else if (name === 'end') {
          if (i === 0) { braam(T(b), 1.1, 3.8); hit(T(b), 1.0); drone(T(b), T(to) + 2.5, [33, 45, 52], 500, 1.2); stab(T(b), 3.5, [57, 60, 64, 69], 1.1, 2200); }
        }
      }
    }
    // extra hits and whooshes the edit asked for
    for (const h of spec.hits ?? []) {
      if (h.k === 'hit') hit(h.t, h.g ?? 1);
      else if (h.k === 'braam') braam(h.t, h.g ?? 1);
      else if (h.k === 'whoosh') whoosh(h.t, h.len ?? 0.35, h.g ?? 1);
      else if (h.k === 'boom') subBoom(h.t, h.g ?? 1, h.len ?? 1.6);
      else if (h.k === 'duck') { duck.gain.setTargetAtTime(h.to, h.t, 0.03); }
    }
    for (const e of spec.events ?? []) play(e);

    // ---------- render and pack as 16-bit WAV
    const buf = await ac.startRendering();
    const n = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1);
    const ab = new ArrayBuffer(44 + n * 4), v = new DataView(ab);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, SR, true); v.setUint32(28, SR * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 4, true);
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const l = Math.max(-1, Math.min(1, L[i])), r = Math.max(-1, Math.min(1, R[i]));
      peak = Math.max(peak, Math.abs(l), Math.abs(r));
      v.setInt16(44 + i * 4, l * 32767, true); v.setInt16(46 + i * 4, r * 32767, true);
    }
    const blob = new Blob([ab]);
    const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
    return { wav: b64, peak };
  };
})();

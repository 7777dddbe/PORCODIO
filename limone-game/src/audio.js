// Audio sintetizzato con WebAudio: motori, spari, onde, sirene, passi... niente file esterni
export class AudioSys {
  constructor() { this.ctx = null; this.on = false; this.eng = null; this.sirenOn = false; this.muted = false; }
  start() {
    if (this.ctx) { this.ctx.resume && this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; const c = this.ctx = new C();
      this.master = c.createGain(); this.master.gain.value = 0.7; this.master.connect(c.destination);
      // buffer rumore
      const n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      let last = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.5 + last * 3; }
      this.noise = b;
      // onde del lago + vento (sempre attivi)
      this.amb = this.loopNoise(420, 0.1); this.windG = this.loopNoise(900, 0.04, 'bandpass');
      const lfo = c.createOscillator(); lfo.frequency.value = 0.12; const lg = c.createGain(); lg.gain.value = 0.05; lfo.connect(lg); lg.connect(this.amb.gain); lfo.start();
      this.on = true;
    } catch (e) { this.ctx = null; }
  }
  loopNoise(freq, gain, type = 'lowpass') {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = c.createGain(); g.gain.value = gain; s.connect(f); f.connect(g); g.connect(this.master); s.start(); return g;
  }
  burst(o) { // rumore filtrato con inviluppo
    if (!this.on) return; const c = this.ctx, t = c.currentTime, s = c.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = o.rate || 1;
    const f = c.createBiquadFilter(); f.type = o.type || 'lowpass'; f.frequency.setValueAtTime(o.f0 || 3000, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1 || 300), t + (o.dur || 0.2));
    const g = c.createGain(); g.gain.setValueAtTime((o.vol || 0.5) * (o.pan === undefined ? 1 : 1), t); g.gain.exponentialRampToValueAtTime(0.001, t + (o.dur || 0.2));
    let out = g; if (o.pan !== undefined && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan; g.connect(p); out = p; }
    s.connect(f); f.connect(g); out.connect(this.master); s.start(t, Math.random() * 1.5, (o.dur || 0.2) + 0.05);
  }
  tone(freq, dur, vol = 0.15, type = 'sine', slide = 0) {
    if (!this.on) return; const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  shot(kind, vol = 1, pan) {
    if (kind === 'pistol') { this.burst({ f0: 5000, f1: 500, dur: 0.14, vol: 0.9 * vol, pan }); this.tone(160, 0.12, 0.35 * vol, 'sine', -90); }
    else if (kind === 'smg') { this.burst({ f0: 6000, f1: 700, dur: 0.09, vol: 0.7 * vol, pan }); this.tone(190, 0.07, 0.22 * vol, 'sine', -100); }
    else if (kind === 'shotgun') { this.burst({ f0: 3500, f1: 200, dur: 0.38, vol: 1.1 * vol, pan, rate: 0.6 }); this.tone(90, 0.3, 0.5 * vol, 'sine', -50); }
    else if (kind === 'punch') { this.burst({ f0: 900, f1: 120, dur: 0.1, vol: 0.5 * vol }); }
    else if (kind === 'click') { this.tone(1200, 0.03, 0.1, 'square'); }
  }
  splash(vol = 1) { this.burst({ f0: 2500, f1: 250, dur: 0.6, vol: 0.55 * vol, rate: 0.8 }); }
  hit(vol = 1) { this.burst({ f0: 2600, f1: 500, type: 'bandpass', dur: 0.08, vol: 0.4 * vol }); }
  crash(vol = 1) { this.burst({ f0: 1800, f1: 120, dur: 0.45, vol: 0.9 * vol, rate: 0.7 }); this.tone(70, 0.3, 0.4 * vol, 'sawtooth', -30); }
  boom() { this.burst({ f0: 1400, f1: 50, dur: 1.5, vol: 1.4, rate: 0.45 }); this.tone(55, 1.0, 0.7, 'sine', -25); }
  pickup() { this.tone(660, 0.09, 0.14, 'triangle'); setTimeout(() => this.tone(990, 0.14, 0.14, 'triangle'), 80); }
  money() { this.tone(1200, 0.06, 0.1, 'square'); setTimeout(() => this.tone(1600, 0.1, 0.1, 'square'), 60); }
  horn() { if (!this.on || this._horn) return; this._horn = true; this.tone(420, 0.35, 0.18, 'sawtooth'); this.tone(530, 0.35, 0.14, 'sawtooth'); setTimeout(() => { this._horn = false; }, 380); }
  step(vol = 0.2) { this.burst({ f0: 1200, f1: 300, dur: 0.07, vol }); }
  // motore: due oscillatori + rumore
  engineStart(kind) {
    if (!this.on) return; this.engineStop();
    const c = this.ctx, g = c.createGain(); g.gain.value = 0; g.connect(this.master);
    const o1 = c.createOscillator(), o2 = c.createOscillator(); o1.type = kind === 'jet' || kind === 'bike' ? 'square' : 'sawtooth'; o2.type = 'triangle';
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
    o1.connect(f); o2.connect(f); f.connect(g); o1.start(); o2.start();
    this.eng = { g, o1, o2, f, kind };
  }
  engineSet(speed01, throttle) {
    if (!this.eng) return; const e = this.eng, t = this.ctx.currentTime;
    const base = e.kind === 'bike' ? 55 : e.kind === 'jet' ? 48 : e.kind === 'boat' ? 40 : 38;
    const f = base + speed01 * (e.kind === 'car' ? 110 : 150) + throttle * 18;
    e.o1.frequency.setTargetAtTime(f, t, 0.08); e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    e.f.frequency.setTargetAtTime(300 + speed01 * 900 + throttle * 500, t, 0.1);
    e.g.gain.setTargetAtTime(0.05 + throttle * 0.05 + speed01 * 0.05, t, 0.1);
  }
  engineStop() { if (!this.eng) return; const e = this.eng, t = this.ctx.currentTime; e.g.gain.setTargetAtTime(0, t, 0.08); setTimeout(() => { try { e.o1.stop(); e.o2.stop(); } catch (x) { /* ok */ } }, 400); this.eng = null; }
  siren(vol) {
    if (!this.on) return;
    if (!this.sir) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = 700; g.gain.value = 0;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800; o.connect(f); f.connect(g); g.connect(this.master); o.start(); this.sir = { o, g };
    }
    const t = this.ctx.currentTime, ph = (performance.now() / 1000) % 1;
    this.sir.o.frequency.setTargetAtTime(ph < 0.5 ? 650 : 880, t, 0.01);
    this.sir.g.gain.setTargetAtTime(vol * 0.08, t, 0.1);
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.7; }
  setUnderwater(u) { if (this.amb) this.amb.gain.value = u ? 0.02 : 0.1; }
}

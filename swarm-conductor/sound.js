// All sound is synthesised live with the Web Audio API, so there are no audio files.
// - a rotor hum that rises with the swarm's speed
// - a note for every drone that locks in (each shape plays a little melody)
// - a chord and firework pops when a shape is finished

const SCALE = [0, 2, 4, 7, 9]; // major pentatonic: any order sounds good

export class Sound {
  constructor() { this.ctx = null; }

  // Must be called from a click or tap (browsers block audio until then).
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();

    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(comp);

    // A simple echo gives the notes some space.
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = 0.27;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.echo.connect(fb).connect(this.echo);
    this.echo.connect(wet).connect(this.master);

    // Rotor hum: filtered noise plus two slightly detuned saws.
    this.hum = ctx.createGain();
    this.hum.gain.value = 0;
    this.humFilter = ctx.createBiquadFilter();
    this.humFilter.type = 'lowpass';
    this.humFilter.frequency.value = 500;
    this.humFilter.connect(this.hum).connect(this.master);
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(2);
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 220;
    band.Q.value = 0.7;
    noise.connect(band).connect(this.humFilter);
    noise.start();
    this.saws = [110, 110.8].map((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      o.connect(g).connect(this.humFilter);
      o.start();
      return o;
    });
  }

  noiseBuffer(seconds) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // speed: average drone speed in m/s.
  swarm(speed) {
    if (!this.ctx) return;
    const k = Math.min(speed / 0.6, 1);
    const now = this.ctx.currentTime;
    this.hum.gain.setTargetAtTime(0.025 + 0.07 * k, now, 0.15);
    this.humFilter.frequency.setTargetAtTime(350 + 1100 * k, now, 0.15);
    this.saws.forEach((o, i) => o.frequency.setTargetAtTime(105 + 50 * k + i * 0.8, now, 0.2));
  }

  note(freq, when = 0, length = 0.6, volume = 0.22, type = 'triangle') {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + length);
    o.connect(g);
    g.connect(this.master);
    g.connect(this.echo);
    o.start(t);
    o.stop(t + length + 0.05);
  }

  pitch(step, root = 523.25) {
    const octave = Math.floor(step / SCALE.length);
    return root * Math.pow(2, (SCALE[step % SCALE.length] + 12 * octave) / 12);
  }

  // The n-th drone of the shape locked in: climb the scale.
  lock(n) {
    if (!this.ctx) return;
    const f = this.pitch(Math.min(n, 12));
    this.note(f, 0, 0.7, 0.2);
    this.note(f * 2, 0, 0.35, 0.05, 'sine');
  }

  complete(act) {
    if (!this.ctx) return;
    const root = [261.63, 293.66, 329.63, 349.23, 392][act % 5];
    [0, 4, 7, 12, 16, 19, 24].forEach((semi, i) => this.note(root * Math.pow(2, semi / 12), i * 0.07, 1.6, 0.13));
  }

  firework() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.6);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900 + Math.random() * 1500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    // Crackle afterwards.
    for (let i = 0; i < 6; i++) this.note(2000 + Math.random() * 3000, 0.15 + Math.random() * 0.4, 0.05, 0.03, 'square');
  }

  whoosh() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(1.2);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(3000, t + 0.6);
    f.frequency.exponentialRampToValueAtTime(300, t + 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }
}

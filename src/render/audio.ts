// Effetti sonori sintetizzati con WebAudio: nessun file audio da scaricare.

export type SfxName =
  | 'laser'
  | 'flak'
  | 'cannon'
  | 'beam'
  | 'boomSmall'
  | 'boomBig'
  | 'build'
  | 'capture'
  | 'lost'
  | 'alert'
  | 'click'
  | 'error'
  | 'victory'
  | 'defeat';

const MIN_GAP: Partial<Record<SfxName, number>> = {
  laser: 0.06,
  flak: 0.09,
  cannon: 0.15,
  beam: 0.1,
  boomSmall: 0.08,
  boomBig: 0.2,
  click: 0.03,
};

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<SfxName, number>();
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('nd-muted') === '1';
    } catch {
      /* storage non disponibile */
    }
  }

  /** Va chiamato dentro un gesto dell'utente (click o tasto). */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    try {
      localStorage.setItem('nd-muted', this.muted ? '1' : '0');
    } catch {
      /* storage non disponibile */
    }
    return this.muted;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, vol: number, f0: number, f1: number, type: BiquadFilterType = 'lowpass'): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name: SfxName, volume = 1): void {
    if (!this.ctx || this.muted || this.ctx.state !== 'running' || volume <= 0.01) return;
    const now = this.ctx.currentTime;
    const gap = MIN_GAP[name] ?? 0.05;
    if (now - (this.last.get(name) ?? -1) < gap) return;
    this.last.set(name, now);
    const v = Math.min(1, volume);
    switch (name) {
      case 'laser':
        this.tone('square', 1400, 300, 0.07, 0.035 * v);
        break;
      case 'beam':
        this.tone('sawtooth', 700, 260, 0.1, 0.04 * v);
        break;
      case 'flak':
        this.burst(0.08, 0.12 * v, 2500, 600, 'bandpass');
        this.tone('sine', 220, 90, 0.08, 0.06 * v);
        break;
      case 'cannon':
        this.tone('sine', 150, 38, 0.4, 0.25 * v);
        this.burst(0.25, 0.12 * v, 900, 120);
        break;
      case 'boomSmall':
        this.burst(0.35, 0.22 * v, 1500, 120);
        break;
      case 'boomBig':
        this.burst(1.1, 0.4 * v, 900, 40);
        this.tone('sine', 90, 28, 0.9, 0.3 * v);
        break;
      case 'build':
        this.tone('sine', 660, 660, 0.09, 0.08);
        this.tone('sine', 990, 990, 0.12, 0.08, 0.09);
        break;
      case 'capture':
        [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 0.16, 0.09, i * 0.08));
        break;
      case 'lost':
        [784, 622, 523].forEach((f, i) => this.tone('triangle', f, f * 0.98, 0.2, 0.09, i * 0.1));
        break;
      case 'alert':
        [440, 330, 440, 330].forEach((f, i) => this.tone('square', f, f, 0.1, 0.05, i * 0.12));
        break;
      case 'click':
        this.tone('sine', 1300, 900, 0.035, 0.05);
        break;
      case 'error':
        this.tone('square', 170, 140, 0.14, 0.06);
        break;
      case 'victory':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone('triangle', f, f, 0.35, 0.1, i * 0.14));
        break;
      case 'defeat':
        [392, 330, 262, 196].forEach((f, i) => this.tone('sawtooth', f, f * 0.97, 0.4, 0.06, i * 0.2));
        break;
    }
  }
}

export const sfx = new Sfx();

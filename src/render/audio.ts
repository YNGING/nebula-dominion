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

interface AudioSettings {
  music: number;
  sfx: number;
  muted: boolean;
}

const AUDIO_KEY = 'nd-audio';

function loadAudioSettings(): AudioSettings {
  const def: AudioSettings = { music: 0.6, sfx: 0.8, muted: false };
  try {
    const raw = localStorage.getItem(AUDIO_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<AudioSettings>;
      const clamp = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : d);
      return { music: clamp(s.music, def.music), sfx: clamp(s.sfx, def.sfx), muted: !!s.muted };
    }
    // migrazione dalla vecchia impostazione
    def.muted = localStorage.getItem('nd-muted') === '1';
  } catch {
    /* storage non disponibile */
  }
  return def;
}

/**
 * Motore audio: un solo AudioContext con due bus (effetti e musica) e un riverbero.
 * Gli effetti sonori sono sintetizzati al volo; la musica (music.ts) usa `musicBus` e `reverb`.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<SfxName, number>();
  private unlockListeners: (() => void)[] = [];
  private settings: AudioSettings;

  constructor() {
    this.settings = loadAudioSettings();
  }

  get muted(): boolean {
    return this.settings.muted;
  }

  get musicVolume(): number {
    return this.settings.music;
  }

  get sfxVolume(): number {
    return this.settings.sfx;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  get musicBus(): GainNode | null {
    return this.musicGain;
  }

  get reverb(): ConvolverNode | null {
    return this.reverbNode;
  }

  get noiseBuffer(): AudioBuffer | null {
    return this.noise;
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Esegue `fn` appena l'audio è sbloccato (subito, se lo è già). */
  onUnlock(fn: () => void): void {
    if (this.ctx) fn();
    else this.unlockListeners.push(fn);
  }

  /** Va chiamato dentro un gesto dell'utente (click o tasto). */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicGain = ctx.createGain();
      this.musicGain.connect(this.master);
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      // riverbero: risposta all'impulso di rumore che decade
      const irLen = Math.floor(ctx.sampleRate * 2.5);
      const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3);
      }
      this.reverbNode = ctx.createConvolver();
      this.reverbNode.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.35;
      this.reverbNode.connect(wet).connect(this.master);
      this.applyVolumes();
      const listeners = this.unlockListeners;
      this.unlockListeners = [];
      for (const fn of listeners) fn();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master?.gain.setTargetAtTime(this.settings.muted ? 0 : 0.6, t, 0.05);
    this.sfxBus?.gain.setTargetAtTime(this.settings.sfx, t, 0.05);
    this.musicGain?.gain.setTargetAtTime(this.settings.music * 0.7, t, 0.1);
  }

  private save(): void {
    try {
      localStorage.setItem(AUDIO_KEY, JSON.stringify(this.settings));
    } catch {
      /* storage non disponibile */
    }
  }

  setMusicVolume(v: number): void {
    this.settings.music = Math.min(1, Math.max(0, v));
    this.applyVolumes();
    this.save();
  }

  setSfxVolume(v: number): void {
    this.settings.sfx = Math.min(1, Math.max(0, v));
    this.applyVolumes();
    this.save();
  }

  setMuted(m: boolean): void {
    this.settings.muted = m;
    this.applyVolumes();
    this.save();
  }

  toggleMute(): boolean {
    this.setMuted(!this.settings.muted);
    return this.settings.muted;
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
    o.connect(g).connect(this.sfxBus!);
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
    src.connect(filt).connect(g).connect(this.sfxBus!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name: SfxName, volume = 1): void {
    if (!this.ctx || this.settings.muted || this.ctx.state !== 'running' || volume <= 0.01) return;
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

export const sfx = new AudioEngine();

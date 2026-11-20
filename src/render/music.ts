import { sfx } from './audio';
import {
  THEMES,
  bpmFor,
  chordNotes,
  noteFreq,
  smoothIntensity,
  stepDuration,
  type Chord,
  type ThemeName,
} from './musicTheory';

/**
 * Musica generativa: un sequencer a sedicesimi con lookahead programma pad, basso,
 * arpeggio e percussioni sintetiche. L'intensità (0..1) arriva dal gioco.
 */
class MusicEngine {
  theme: ThemeName = 'menu';
  private pending: ThemeName | null = null;
  private target = 0;
  intensity = 0;
  private timer: number | null = null;
  private nextStepTime = 0;
  private step = 0;
  private bar = 0;
  private chordIndex = 0;
  private lastTick = 0;
  private padFilter: BiquadFilterNode | null = null;
  private delay: DelayNode | null = null;
  private dryBus: GainNode | null = null;
  private arpIndex = 0;

  constructor() {
    sfx.onUnlock(() => this.start());
  }

  /** Stato per debug e smoke test. */
  get state(): { running: boolean; theme: ThemeName; intensity: number; bar: number } {
    return { running: this.timer !== null && sfx.running, theme: this.theme, intensity: this.intensity, bar: this.bar };
  }

  /** Cambia tema alla prossima battuta (i temi di fine partita partono subito). */
  setTheme(t: ThemeName): void {
    if (t === this.theme && !this.pending) return;
    if (t === 'victory' || t === 'defeat') {
      this.switchTo(t);
      return;
    }
    this.pending = t;
  }

  /** Aggiunge intensità (spari, esplosioni, ondate). */
  bump(amount: number): void {
    this.target = Math.min(1, this.target + amount);
  }

  private start(): void {
    const ctx = sfx.context;
    const bus = sfx.musicBus;
    if (!ctx || !bus || this.timer !== null) return;
    this.dryBus = ctx.createGain();
    this.dryBus.connect(bus);
    if (sfx.reverb) this.dryBus.connect(sfx.reverb);
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 600;
    this.padFilter.Q.value = 0.7;
    this.padFilter.connect(this.dryBus);
    // eco per l'arpeggio
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.375;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(this.dryBus);
    this.nextStepTime = ctx.currentTime + 0.1;
    this.lastTick = ctx.currentTime;
    this.timer = window.setInterval(() => this.tick(), 50);
  }

  private switchTo(t: ThemeName): void {
    this.theme = t;
    this.pending = null;
    this.step = 0;
    this.bar = 0;
    this.chordIndex = 0;
    const ctx = sfx.context;
    if (!ctx) return;
    const stinger = THEMES[t].stinger;
    stinger.forEach((n, i) => this.pluck(noteFreq(n), ctx.currentTime + 0.05 + i * 0.16, 0.9, 0.11, 'triangle', true));
  }

  private tick(): void {
    const ctx = sfx.context;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const dt = Math.min(0.5, now - this.lastTick);
    this.lastTick = now;
    const th = THEMES[this.theme];
    // il bersaglio decade da solo: senza combattimenti la musica si calma
    this.target = Math.max(0, this.target - dt * 0.07);
    this.intensity = smoothIntensity(this.intensity, th.fixedIntensity ?? this.target, dt);
    this.padFilter?.frequency.setTargetAtTime(500 + 2000 * this.intensity, now, 0.5);
    if (this.nextStepTime < now - 0.5) this.nextStepTime = now + 0.05; // dopo una pausa lunga
    while (this.nextStepTime < now + 0.2) {
      this.scheduleStep(this.nextStepTime);
      this.nextStepTime += stepDuration(bpmFor(THEMES[this.theme], this.intensity));
    }
  }

  private scheduleStep(t: number): void {
    if (this.step === 0 && this.pending && this.bar % THEMES[this.theme].barsPerChord === 0) {
      this.theme = this.pending;
      this.pending = null;
      this.bar = 0;
      this.chordIndex = 0;
    }
    const th = THEMES[this.theme];
    const sd = stepDuration(bpmFor(th, this.intensity));
    const chord = th.progression[this.chordIndex % th.progression.length];
    const I = this.intensity;

    if (this.step === 0 && this.bar % th.barsPerChord === 0) {
      this.pad(chord, t, sd * 16 * th.barsPerChord);
    }
    // basso
    if (I > 0.2 && (this.step === 0 || this.step === 8)) {
      this.pluck(noteFreq(chord.root - 12), t, sd * 6, 0.16 * Math.min(1, I + 0.3), 'sine', false);
    }
    // arpeggio sugli ottavi
    if (this.step % 2 === 0) {
      const p = this.theme === 'game' ? 0.12 + 0.75 * I : 0.3;
      if (Math.random() < p) {
        const notes = chordNotes(chord, 1);
        const n = notes[this.arpIndex++ % notes.length] + (Math.random() < 0.25 ? 12 : 0);
        this.pluck(noteFreq(n), t, sd * 3, 0.05 + 0.04 * I, I > 0.6 ? 'square' : 'triangle', true);
      }
    }
    // percussioni
    if (th.drums) {
      if (I > 0.45 && (this.step === 0 || this.step === 8 || (I > 0.8 && (this.step === 4 || this.step === 12)))) this.kick(t);
      if (I > 0.5 && this.step % 4 === 2) this.hat(t, 0.05 + 0.05 * I);
      if (I > 0.75 && (this.step === 4 || this.step === 12)) this.snare(t);
    }

    this.step++;
    if (this.step === 16) {
      this.step = 0;
      this.bar++;
      if (this.bar % th.barsPerChord === 0) this.chordIndex++;
    }
  }

  // ------------------------------------------------------------ strumenti

  private pad(chord: Chord, t: number, dur: number): void {
    const ctx = sfx.context!;
    const level = 0.035;
    for (const n of chordNotes(chord, 0)) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(level, t + 1.2);
      g.gain.setValueAtTime(level, t + dur);
      g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.6);
      g.connect(this.padFilter!);
      for (const detune of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = noteFreq(n);
        o.detune.value = detune;
        o.connect(g);
        o.start(t);
        o.stop(t + dur + 1.8);
      }
    }
  }

  private pluck(freq: number, t: number, dur: number, vol: number, type: OscillatorType, echo: boolean): void {
    const ctx = sfx.context!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.08, dur));
    o.connect(g);
    g.connect(this.dryBus!);
    if (echo && this.delay) g.connect(this.delay);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(t: number): void {
    const ctx = sfx.context!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(sfx.musicBus!);
    o.start(t);
    o.stop(t + 0.32);
  }

  private noise(t: number, dur: number, vol: number, type: BiquadFilterType, freq: number): void {
    const ctx = sfx.context!;
    const src = ctx.createBufferSource();
    src.buffer = sfx.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(sfx.musicBus!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private hat(t: number, vol: number): void {
    this.noise(t, 0.05, vol, 'highpass', 7000);
  }

  private snare(t: number): void {
    this.noise(t, 0.18, 0.16, 'bandpass', 1800);
    this.pluck(190, t, 0.08, 0.08, 'triangle', false);
  }
}

export const music = new MusicEngine();

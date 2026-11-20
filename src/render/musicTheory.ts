// Funzioni pure per la musica generativa (testabili senza WebAudio).

export type ThemeName = 'menu' | 'game' | 'victory' | 'defeat';
export type ChordQuality = 'maj' | 'min' | 'maj7' | 'min7' | 'sus2' | 'add9' | 'min9';

const INTERVALS: Record<ChordQuality, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  sus2: [0, 2, 7],
  add9: [0, 4, 7, 14],
  min9: [0, 3, 7, 14],
};

export interface Chord {
  /** nota MIDI della fondamentale */
  root: number;
  quality: ChordQuality;
}

export interface ThemeDef {
  progression: Chord[];
  /** battute per accordo */
  barsPerChord: number;
  minBpm: number;
  maxBpm: number;
  drums: boolean;
  /** intensità fissa (temi d'atmosfera); null = segue il gioco */
  fixedIntensity: number | null;
  /** stacco melodico suonato all'ingresso del tema */
  stinger: number[];
}

export const THEMES: Record<ThemeName, ThemeDef> = {
  menu: {
    progression: [
      { root: 50, quality: 'min9' },
      { root: 46, quality: 'maj7' },
      { root: 53, quality: 'maj7' },
      { root: 48, quality: 'sus2' },
    ],
    barsPerChord: 2,
    minBpm: 66,
    maxBpm: 66,
    drums: false,
    fixedIntensity: 0.15,
    stinger: [],
  },
  game: {
    progression: [
      { root: 45, quality: 'min7' },
      { root: 41, quality: 'maj7' },
      { root: 48, quality: 'add9' },
      { root: 43, quality: 'sus2' },
    ],
    barsPerChord: 2,
    minBpm: 72,
    maxBpm: 96,
    drums: true,
    fixedIntensity: null,
    stinger: [],
  },
  victory: {
    progression: [
      { root: 48, quality: 'maj7' },
      { root: 53, quality: 'add9' },
      { root: 43, quality: 'sus2' },
      { root: 48, quality: 'maj' },
    ],
    barsPerChord: 2,
    minBpm: 76,
    maxBpm: 76,
    drums: false,
    fixedIntensity: 0.3,
    stinger: [72, 76, 79, 84, 88],
  },
  defeat: {
    progression: [
      { root: 50, quality: 'min' },
      { root: 46, quality: 'maj' },
      { root: 43, quality: 'min' },
      { root: 45, quality: 'maj' },
    ],
    barsPerChord: 2,
    minBpm: 60,
    maxBpm: 60,
    drums: false,
    fixedIntensity: 0.1,
    stinger: [74, 70, 67, 62],
  },
};

export function noteFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function chordNotes(chord: Chord, octaveShift = 0): number[] {
  return INTERVALS[chord.quality].map((i) => chord.root + i + octaveShift * 12);
}

/** Durata di un sedicesimo in secondi. */
export function stepDuration(bpm: number): number {
  return 60 / bpm / 4;
}

export function bpmFor(theme: ThemeDef, intensity: number): number {
  return theme.minBpm + (theme.maxBpm - theme.minBpm) * intensity;
}

/** L'intensità sale in fretta (circa 1 s) e scende lentamente (circa 6 s); resta tra 0 e 1. */
export function smoothIntensity(current: number, target: number, dt: number): number {
  const tau = target > current ? 1 : 6;
  const k = 1 - Math.exp(-dt / tau);
  return Math.min(1, Math.max(0, current + (target - current) * k));
}

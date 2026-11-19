export type Difficulty = 'easy' | 'normal' | 'hard';

export interface FactionStyle {
  name: string;
  color: number;
  css: string;
}

/** Stili delle fazioni: l'indice 0 è sempre il giocatore umano. */
export const FACTION_STYLES: FactionStyle[] = [
  { name: 'Lega Azzurra', color: 0x4fc3f7, css: '#4fc3f7' },
  { name: 'Impero Cremisi', color: 0xff5a52, css: '#ff5a52' },
  { name: 'Sciame Smeraldo', color: 0x69f0ae, css: '#69f0ae' },
  { name: 'Consorzio Ambra', color: 0xffc04d, css: '#ffc04d' },
];

export const NEUTRAL_COLOR = 0x8a93a6;

export interface DifficultyParams {
  label: string;
  /** ogni quanti tick l'IA ragiona */
  think: number;
  maxMiners: number;
  /** moltiplicatore sui minerali raccolti */
  incomeBonus: number;
  /** supply dell'esercito necessaria per la prima ondata */
  firstWave: number;
  waveGrowth: number;
  maxWave: number;
  turrets: boolean;
  counter: boolean;
  expandSquad: number;
  /** secondi prima della prima ondata d'attacco */
  attackDelay: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyParams> = {
  easy: {
    label: 'Facile',
    think: 40,
    maxMiners: 6,
    incomeBonus: 0.8,
    firstWave: 14,
    waveGrowth: 4,
    maxWave: 36,
    turrets: false,
    counter: false,
    expandSquad: 2,
    attackDelay: 300,
  },
  normal: {
    label: 'Normale',
    think: 20,
    maxMiners: 9,
    incomeBonus: 1,
    firstWave: 14,
    waveGrowth: 6,
    maxWave: 60,
    turrets: true,
    counter: true,
    expandSquad: 3,
    attackDelay: 180,
  },
  hard: {
    label: 'Difficile',
    think: 10,
    maxMiners: 12,
    incomeBonus: 1.3,
    firstWave: 12,
    waveGrowth: 8,
    maxWave: 80,
    turrets: true,
    counter: true,
    expandSquad: 3,
    attackDelay: 120,
  },
};

import type { UnitKind } from './units';

export type Difficulty = 'easy' | 'normal' | 'hard';

export type DoctrineId = 'engineering' | 'armor' | 'swarm' | 'arsenal';

/** Modificatori di una dottrina: i moltiplicatori valgono 1 se assenti. */
export interface DoctrineMods {
  /** punti scafo delle navi (non delle strutture) */
  hp?: number;
  /** velocità e accelerazione delle navi */
  speed?: number;
  mineRate?: number;
  /** gittata di tutte le armi */
  range?: number;
  researchCost?: number;
  costOverride?: Partial<Record<UnitKind, number>>;
  costMult?: Partial<Record<UnitKind, number>>;
  buildTimeMult?: Partial<Record<UnitKind, number>>;
}

export interface DoctrineDef {
  id: DoctrineId;
  name: string;
  motto: string;
  /** righe di descrizione per menu e HUD */
  traits: string[];
  mods: DoctrineMods;
}

export const DOCTRINES: Record<DoctrineId, DoctrineDef> = {
  engineering: {
    id: 'engineering',
    name: 'Ingegneria',
    motto: 'Economia solida e difese a buon prezzo',
    traits: ['Estrazione +30%', 'Torrette −30% costo'],
    mods: { mineRate: 1.3, costMult: { turret: 0.7 } },
  },
  armor: {
    id: 'armor',
    name: 'Corazze',
    motto: 'Flotte lente ma difficili da abbattere',
    traits: ['Scafi +15%', 'Corazzate costruite il 20% più in fretta', 'Velocità −5%'],
    mods: { hp: 1.15, speed: 0.95, buildTimeMult: { battleship: 0.8 } },
  },
  swarm: {
    id: 'swarm',
    name: 'Sciame',
    motto: 'Numeri e velocità',
    traits: ['Caccia a 50 minerali', 'Velocità +8%', 'Scafi −5%'],
    mods: { speed: 1.08, hp: 0.95, costOverride: { fighter: 50 } },
  },
  arsenal: {
    id: 'arsenal',
    name: 'Arsenale',
    motto: 'Colpire da lontano, ricercare in fretta',
    traits: ['Gittata +15%', 'Ricerca −30% costo'],
    mods: { range: 1.15, researchCost: 0.7 },
  },
};

export const DOCTRINE_ORDER: DoctrineId[] = ['engineering', 'armor', 'swarm', 'arsenal'];

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
  /** l'IA svolge ricerche */
  research: boolean;
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
    research: false,
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
    research: true,
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
    research: true,
  },
};

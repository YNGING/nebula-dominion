// Statistiche di navi, strutture e armi. Tutte le grandezze sono in pixel e secondi.

export type ArmorClass = 'light' | 'medium' | 'heavy' | 'structure';
export type UnitKind =
  | 'miner'
  | 'fighter'
  | 'frigate'
  | 'battleship'
  | 'support'
  | 'mothership'
  | 'turret';
export type WeaponKind = 'laser' | 'flak' | 'cannon' | 'beam';

export interface WeaponDef {
  kind: WeaponKind;
  name: string;
  damage: number;
  /** secondi tra un colpo e l'altro */
  cooldown: number;
  range: number;
  projectileSpeed: number;
  /** raggio del danno ad area (0 = nessuno) */
  splash: number;
  /** moltiplicatore di danno per classe di armatura del bersaglio */
  mult: Record<ArmorClass, number>;
  /** dispersione angolare in radianti */
  spread: number;
}

export interface UnitDef {
  kind: UnitKind;
  name: string;
  role: string;
  description: string;
  hp: number;
  speed: number;
  accel: number;
  turnRate: number;
  radius: number;
  armor: ArmorClass;
  cost: number;
  supply: number;
  buildTime: number;
  vision: number;
  structure: boolean;
  /** può conquistare pianeti */
  capture: boolean;
  weapon?: WeaponDef;
  cargo?: number;
  mineRate?: number;
  repairRate?: number;
  repairRange?: number;
}

export const ARMOR_LABEL: Record<ArmorClass, string> = {
  light: 'leggera',
  medium: 'media',
  heavy: 'pesante',
  structure: 'struttura',
};

export const UNITS: Record<UnitKind, UnitDef> = {
  miner: {
    kind: 'miner',
    name: 'Minatore',
    role: 'Raccolta',
    description: 'Estrae minerali dagli asteroidi e li porta alla Nave Madre. Disarmato.',
    hp: 80,
    speed: 80,
    accel: 160,
    turnRate: 3,
    radius: 10,
    armor: 'light',
    cost: 50,
    supply: 1,
    buildTime: 6,
    vision: 260,
    structure: false,
    capture: false,
    cargo: 40,
    mineRate: 10,
  },
  fighter: {
    kind: 'fighter',
    name: 'Caccia',
    role: 'Incursore veloce',
    description: 'Velocissimo e fragile. Ottimo contro Minatori e Corazzate, debole contro le Fregate.',
    hp: 60,
    speed: 200,
    accel: 520,
    turnRate: 6,
    radius: 8,
    armor: 'light',
    cost: 60,
    supply: 1,
    buildTime: 5,
    vision: 380,
    structure: false,
    capture: true,
    weapon: {
      kind: 'laser',
      name: 'Laser rapido',
      damage: 6,
      cooldown: 0.35,
      range: 150,
      projectileSpeed: 650,
      splash: 0,
      spread: 0.04,
      mult: { light: 1, medium: 0.8, heavy: 1.5, structure: 0.5 },
    },
  },
  frigate: {
    kind: 'frigate',
    name: 'Fregata',
    role: 'Linea di battaglia',
    description: 'Nave equilibrata con cannoni flak ad area: distrugge gli sciami di Caccia.',
    hp: 220,
    speed: 115,
    accel: 220,
    turnRate: 3,
    radius: 13,
    armor: 'medium',
    cost: 125,
    supply: 2,
    buildTime: 9,
    vision: 330,
    structure: false,
    capture: true,
    weapon: {
      kind: 'flak',
      name: 'Cannone flak',
      damage: 10,
      cooldown: 0.8,
      range: 210,
      projectileSpeed: 420,
      splash: 42,
      spread: 0.06,
      mult: { light: 1.8, medium: 1, heavy: 0.5, structure: 0.7 },
    },
  },
  battleship: {
    kind: 'battleship',
    name: 'Corazzata',
    role: 'Assedio pesante',
    description: 'Lenta ma devastante a lunga gittata contro Fregate e strutture. I bersagli piccoli le sfuggono.',
    hp: 900,
    speed: 55,
    accel: 70,
    turnRate: 1.2,
    radius: 24,
    armor: 'heavy',
    cost: 350,
    supply: 5,
    buildTime: 18,
    vision: 420,
    structure: false,
    capture: true,
    weapon: {
      kind: 'cannon',
      name: 'Cannone pesante',
      damage: 60,
      cooldown: 2.2,
      range: 330,
      projectileSpeed: 360,
      splash: 0,
      spread: 0.02,
      mult: { light: 0.25, medium: 1.6, heavy: 1.2, structure: 2 },
    },
  },
  support: {
    kind: 'support',
    name: 'Nave Supporto',
    role: 'Riparazioni',
    description: 'Ripara automaticamente le navi e le strutture alleate vicine. Disarmata.',
    hp: 150,
    speed: 105,
    accel: 220,
    turnRate: 3,
    radius: 12,
    armor: 'medium',
    cost: 150,
    supply: 2,
    buildTime: 10,
    vision: 300,
    structure: false,
    capture: true,
    repairRate: 14,
    repairRange: 150,
  },
  mothership: {
    kind: 'mothership',
    name: 'Nave Madre',
    role: 'Base',
    description: 'Produce le navi e raccoglie i minerali. Se viene distrutta, la fazione è sconfitta.',
    hp: 3000,
    speed: 0,
    accel: 0,
    turnRate: 0.05,
    radius: 48,
    armor: 'structure',
    cost: 0,
    supply: 0,
    buildTime: 0,
    vision: 520,
    structure: true,
    capture: false,
    weapon: {
      kind: 'beam',
      name: 'Batteria difensiva',
      damage: 15,
      cooldown: 0.8,
      range: 300,
      projectileSpeed: 520,
      splash: 0,
      spread: 0.03,
      mult: { light: 1, medium: 1, heavy: 1, structure: 1 },
    },
  },
  turret: {
    kind: 'turret',
    name: 'Torretta',
    role: 'Difesa planetaria',
    description: 'Difende un pianeta conquistato. Finché resiste, il pianeta non può essere preso.',
    hp: 450,
    speed: 0,
    accel: 0,
    turnRate: 4,
    radius: 14,
    armor: 'structure',
    cost: 150,
    supply: 0,
    buildTime: 12,
    vision: 360,
    structure: true,
    capture: false,
    weapon: {
      kind: 'beam',
      name: 'Laser difensivo',
      damage: 14,
      cooldown: 0.7,
      range: 270,
      projectileSpeed: 520,
      splash: 0,
      spread: 0.03,
      mult: { light: 1.1, medium: 1, heavy: 0.9, structure: 0.5 },
    },
  },
};

/** Navi che la Nave Madre può produrre, nell'ordine dei tasti rapidi Q W E R T. */
export const BUILDABLE_SHIPS: UnitKind[] = ['miner', 'fighter', 'frigate', 'battleship', 'support'];
export const BUILD_HOTKEYS = ['Q', 'W', 'E', 'R', 'T'];

export const ECONOMY = {
  startMinerals: 250,
  startMiners: 2,
  baseSupply: 12,
  maxSupply: 120,
  turretsPerPlanet: 2,
  queueLimit: 6,
  /** navi costruite in parallelo dalla Nave Madre */
  productionSlots: 2,
  /** distanza oltre il raggio del pianeta entro cui si conquista */
  captureMargin: 90,
  /** visione garantita dai pianeti posseduti */
  planetVision: 360,
};

/** Distanza oltre la gittata entro cui una nave inattiva ingaggia i nemici. */
export const AGGRO_EXTRA = 150;
/** Distanza massima dalla posizione di guardia durante un inseguimento. */
export const LEASH = 520;

import type { Difficulty, DoctrineId } from '../data/factions';
import type { ResearchLevels, ResearchTrack } from '../data/research';
import type { UnitKind, WeaponKind } from '../data/units';

export type FactionId = number;
export const NEUTRAL: FactionId = -1;

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

export type OrderType = 'idle' | 'move' | 'attackMove' | 'attack' | 'harvest' | 'hold';

export interface Order {
  type: OrderType;
  x: number;
  y: number;
  targetId: number;
}

export type MineState = 'toAsteroid' | 'mining' | 'returning';

export interface ProdItem {
  kind: UnitKind;
  progress: number;
}

export interface Unit {
  id: number;
  kind: UnitKind;
  faction: FactionId;
  x: number;
  y: number;
  /** posizione al tick precedente (per l'interpolazione grafica) */
  px: number;
  py: number;
  vx: number;
  vy: number;
  angle: number;
  pangle: number;
  hp: number;
  maxHp: number;
  radius: number;
  order: Order;
  guardX: number;
  guardY: number;
  destX: number;
  destY: number;
  hasDest: boolean;
  stopDist: number;
  stuckTicks: number;
  weaponTarget: number;
  cooldown: number;
  cargo: number;
  mineState: MineState | null;
  asteroidId: number;
  queue: ProdItem[];
  rallyX: number;
  rallyY: number;
  planetId: number;
  repairTarget: number;
  lastDamagedTick: number;
  dead: boolean;
}

export interface Asteroid {
  id: number;
  x: number;
  y: number;
  radius: number;
  amount: number;
  maxAmount: number;
  variant: number;
  angle: number;
  spin: number;
}

export interface Planet {
  id: number;
  name: string;
  x: number;
  y: number;
  radius: number;
  income: number;
  supply: number;
  style: number;
  owner: FactionId;
  captureFaction: FactionId;
  /** 0..1 */
  progress: number;
  contested: boolean;
  queue: ProdItem[];
  turretIds: number[];
}

export interface Projectile {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  damage: number;
  splash: number;
  kind: WeaponKind;
  faction: FactionId;
  sourceKind: UnitKind;
  ttl: number;
  dead: boolean;
}

export interface FactionStats {
  mined: number;
  income: number;
  built: number;
  lost: number;
  killed: number;
  planetsCaptured: number;
}

export interface Faction {
  id: FactionId;
  name: string;
  color: number;
  controller: 'human' | 'ai';
  difficulty: Difficulty;
  doctrine: DoctrineId | null;
  team: number;
  invader: boolean;
  research: ResearchLevels;
  /** ricerca in corso sulla Nave Madre (una alla volta) */
  researching: { track: ResearchTrack; progress: number; cost: number } | null;
  minerals: number;
  incomeBonus: number;
  alive: boolean;
  eliminatedAt: number;
  lastAlertTick: number;
  stats: FactionStats;
}

export type GameEvent =
  | { t: 'fire'; weapon: WeaponKind; x: number; y: number; faction: FactionId }
  | { t: 'hit'; weapon: WeaponKind; x: number; y: number; splash: number; faction: FactionId }
  | { t: 'death'; x: number; y: number; radius: number; kind: UnitKind; faction: FactionId }
  | { t: 'built'; faction: FactionId; kind: UnitKind; x: number; y: number }
  | { t: 'captured'; planetId: number; faction: FactionId; prev: FactionId }
  | { t: 'underAttack'; faction: FactionId; x: number; y: number }
  | { t: 'eliminated'; faction: FactionId }
  | { t: 'research'; faction: FactionId; track: ResearchTrack; level: number }
  | { t: 'wave'; wave: number; x: number; y: number }
  | { t: 'gameOver'; winner: FactionId | null };

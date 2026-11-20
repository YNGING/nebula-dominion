import { DIFFICULTIES, type Difficulty, type DoctrineId } from '../data/factions';
import { emptyLevels } from '../data/research';
import type { MapDef } from '../data/maps';
import { ECONOMY, UNITS, type UnitDef, type UnitKind } from '../data/units';
import { updateCapture } from './capture';
import { updateProjectiles, updateRepair, updateWeapon } from './combat';
import { updateIncome, updateProduction, updateResearch } from './economy';
import { dist2 } from './math';
import { moveUnit } from './movement';
import { updateOrder } from './orders';
import { Rng } from './rng';
import { SpatialGrid } from './spatialGrid';
import { computeTable, type DefTable } from './stats';
import {
  NEUTRAL,
  type Asteroid,
  type Faction,
  type FactionId,
  type GameEvent,
  type Planet,
  type Projectile,
  type Unit,
} from './types';

export interface FactionSetup {
  name: string;
  color: number;
  controller: 'human' | 'ai';
  difficulty: Difficulty;
  /** null = nessuna dottrina (statistiche base) */
  doctrine?: DoctrineId | null;
  /** squadra: fazioni della stessa squadra sono alleate (predefinita: una squadra per fazione) */
  team?: number;
  /** fazione senza Nave Madre (ondate della sopravvivenza): mai eliminata, esclusa dalla vittoria */
  invader?: boolean;
  /** nessuna Nave Madre né Minatori iniziali (le unità le crea la missione) */
  noBase?: boolean;
  /** minerali iniziali (predefiniti: ECONOMY.startMinerals) */
  minerals?: number;
}

/** Restrizioni di una missione. */
export interface WorldRules {
  /** navi producibili (predefinite: tutte) */
  allowedShips?: UnitKind[];
  research?: boolean;
  turrets?: boolean;
}

export interface WorldSetup {
  map: MapDef;
  factions: FactionSetup[];
  seed: number;
  /** false nei test: nessuna Nave Madre/Minatore iniziale */
  startUnits?: boolean;
  /** true: nessuna vittoria possibile, solo la sconfitta (sopravvivenza) */
  endless?: boolean;
  /** true: vittoria e sconfitta le decide la missione (World.finish) */
  scripted?: boolean;
  /** posizioni di partenza fissate (indici di map.spawns, nell'ordine delle fazioni con base) */
  spawnOrder?: number[];
  rules?: WorldRules;
}

export class World {
  readonly map: MapDef;
  readonly width: number;
  readonly height: number;
  readonly rng: Rng;
  readonly grid: SpatialGrid<Unit>;
  tick = 0;
  units: Unit[] = [];
  asteroids: Asteroid[] = [];
  planets: Planet[] = [];
  projectiles: Projectile[] = [];
  factions: Faction[] = [];
  /** eventi dell'ultimo tick (per grafica e audio) */
  events: GameEvent[] = [];
  over = false;
  winner: FactionId | null = null;
  readonly endless: boolean;
  readonly scripted: boolean;
  readonly rules: WorldRules;
  /** motivo della fine partita (missioni) */
  overReason = '';
  private readonly spawnOrder: number[] | undefined;
  /** punto di partenza di ogni fazione */
  spawnOf: { x: number; y: number }[] = [];

  private nextId = 1;
  private byId = new Map<number, Unit>();
  private asteroidById = new Map<number, Asteroid>();
  private motherships: (Unit | null)[] = [];
  private defTables: DefTable[] = [];

  constructor(setup: WorldSetup) {
    this.map = setup.map;
    this.width = setup.map.width;
    this.height = setup.map.height;
    this.rng = new Rng(setup.seed);
    this.endless = setup.endless ?? false;
    this.scripted = setup.scripted ?? false;
    this.rules = setup.rules ?? {};
    this.spawnOrder = setup.spawnOrder;
    this.grid = new SpatialGrid<Unit>(this.width, this.height, 128);

    this.factions = setup.factions.map((fs, i) => ({
      id: i,
      name: fs.name,
      color: fs.color,
      controller: fs.controller,
      difficulty: fs.difficulty,
      doctrine: fs.doctrine ?? null,
      team: fs.team ?? i,
      invader: fs.invader ?? false,
      research: emptyLevels(),
      researching: null,
      minerals: fs.minerals ?? ECONOMY.startMinerals,
      noBase: fs.noBase ?? false,
      incomeBonus: fs.controller === 'ai' ? DIFFICULTIES[fs.difficulty].incomeBonus : 1,
      alive: true,
      eliminatedAt: -1,
      lastAlertTick: -9999,
      stats: { mined: 0, income: 0, built: 0, lost: 0, killed: 0, planetsCaptured: 0 },
    }));
    this.motherships = this.factions.map(() => null);
    this.defTables = this.factions.map((f) => computeTable(f.doctrine, f.research));

    this.planets = setup.map.planets.map((pd, i) => ({
      id: i,
      name: pd.name,
      x: pd.x,
      y: pd.y,
      radius: pd.radius,
      income: pd.income,
      supply: pd.supply,
      style: pd.style,
      owner: NEUTRAL,
      captureFaction: NEUTRAL,
      progress: 0,
      contested: false,
      queue: [],
      turretIds: [],
    }));

    this.generateAsteroids();
    if (setup.startUnits !== false) this.placeStartUnits();
  }

  // ---------------------------------------------------------------- setup

  private generateAsteroids(): void {
    let id = 1;
    for (const field of this.map.fields) {
      const placed: Asteroid[] = [];
      let attempts = 0;
      while (placed.length < field.count && attempts < 400) {
        attempts++;
        const a = this.rng.range(0, Math.PI * 2);
        const r = Math.sqrt(this.rng.next()) * field.spread;
        const x = field.x + Math.cos(a) * r;
        const y = field.y + Math.sin(a) * r;
        const radius = this.rng.range(15, 26);
        if (placed.some((o) => dist2(o.x, o.y, x, y) < (o.radius + radius + 16) ** 2)) continue;
        const ast: Asteroid = {
          id: id++,
          x,
          y,
          radius,
          amount: field.amount,
          maxAmount: field.amount,
          variant: this.rng.int(0, 3),
          angle: this.rng.range(0, Math.PI * 2),
          spin: this.rng.range(-0.3, 0.3),
        };
        placed.push(ast);
      }
      for (const a of placed) {
        this.asteroids.push(a);
        this.asteroidById.set(a.id, a);
      }
    }
  }

  private placeStartUnits(): void {
    const players = this.factions.filter((f) => !f.invader && !f.noBase);
    const n = players.length;
    const spawns = this.map.spawns;
    let order: number[];
    if (this.spawnOrder) {
      order = this.spawnOrder;
    } else if (spawns.length < 2) {
      order = [0];
    } else if (n <= 2) {
      const pairs = spawns.length >= 4 ? [[0, 1], [1, 0], [2, 3], [3, 2]] : [[0, 1], [1, 0]];
      order = this.rng.pick(pairs);
    } else {
      order = this.rng.shuffle(spawns.map((_, i) => i)).slice(0, n);
    }
    const cx = this.width / 2;
    const cy = this.height / 2;
    players.forEach((f, i) => {
      const s = spawns[order[i]];
      this.spawnOf[f.id] = { x: s.x, y: s.y };
      const toCenter = Math.atan2(cy - s.y, cx - s.x);
      const m = this.spawnUnit('mothership', f.id, s.x, s.y, toCenter);
      m.rallyX = s.x + Math.cos(toCenter) * 170;
      m.rallyY = s.y + Math.sin(toCenter) * 170;
      for (let k = 0; k < ECONOMY.startMiners; k++) {
        const a = toCenter + Math.PI / 2 + k * Math.PI;
        const miner = this.spawnUnit('miner', f.id, s.x + Math.cos(a) * 75, s.y + Math.sin(a) * 75, a);
        this.sendToHarvest(miner);
      }
    });
  }

  // ---------------------------------------------------------------- accesso

  unit(id: number): Unit | undefined {
    const u = this.byId.get(id);
    return u && !u.dead ? u : undefined;
  }

  asteroid(id: number): Asteroid | undefined {
    return this.asteroidById.get(id);
  }

  planet(id: number): Planet | undefined {
    return this.planets[id];
  }

  /** Statistiche effettive (dottrina + ricerca) di un tipo di nave per una fazione. */
  def(f: FactionId, kind: UnitKind): UnitDef {
    return this.defTables[f]?.[kind] ?? UNITS[kind];
  }

  /** Ricalcola le statistiche dopo una ricerca e adegua gli hp delle unità esistenti. */
  refreshDefs(fid: FactionId): void {
    const f = this.factions[fid];
    if (!f) return;
    this.defTables[fid] = computeTable(f.doctrine, f.research);
    for (const u of this.units) {
      if (u.faction !== fid || u.dead) continue;
      const max = this.defTables[fid][u.kind].hp;
      if (max !== u.maxHp) {
        u.hp = Math.max(1, u.hp + (max - u.maxHp));
        u.maxHp = max;
      }
    }
  }

  mothershipOf(f: FactionId): Unit | null {
    const m = this.motherships[f];
    return m && !m.dead ? m : null;
  }

  isEnemy(a: FactionId, b: FactionId): boolean {
    if (a === b || a === NEUTRAL || b === NEUTRAL) return false;
    return this.factions[a].team !== this.factions[b].team;
  }

  teamOf(f: FactionId): number {
    return this.factions[f]?.team ?? -1;
  }

  supplyUsed(f: FactionId): number {
    let s = 0;
    for (const u of this.units) {
      if (u.faction !== f || u.dead) continue;
      s += UNITS[u.kind].supply;
      for (const q of u.queue) s += UNITS[q.kind].supply;
    }
    return s;
  }

  supplyCap(f: FactionId): number {
    let cap = ECONOMY.baseSupply;
    for (const p of this.planets) if (p.owner === f) cap += p.supply;
    return Math.min(ECONOMY.maxSupply, cap);
  }

  incomeRate(f: FactionId): number {
    let r = 0;
    for (const p of this.planets) if (p.owner === f) r += p.income;
    return r * this.factions[f].incomeBonus;
  }

  // ---------------------------------------------------------------- entità

  spawnUnit(kind: UnitKind, faction: FactionId, x: number, y: number, angle = 0): Unit {
    const def = this.def(faction, kind);
    const u: Unit = {
      id: this.nextId++,
      kind,
      faction,
      x,
      y,
      px: x,
      py: y,
      vx: 0,
      vy: 0,
      angle,
      pangle: angle,
      hp: def.hp,
      maxHp: def.hp,
      radius: def.radius,
      order: { type: 'idle', x, y, targetId: -1 },
      guardX: x,
      guardY: y,
      destX: x,
      destY: y,
      hasDest: false,
      stopDist: 0,
      stuckTicks: 0,
      weaponTarget: -1,
      cooldown: this.rng.range(0, def.weapon?.cooldown ?? 0),
      cargo: 0,
      mineState: null,
      asteroidId: -1,
      queue: [],
      rallyX: x,
      rallyY: y,
      planetId: -1,
      repairTarget: -1,
      lastDamagedTick: -9999,
      dead: false,
    };
    this.units.push(u);
    this.byId.set(u.id, u);
    if (kind === 'mothership') this.motherships[faction] = u;
    return u;
  }

  /** Manda un minatore all'asteroide libero più vicino. */
  sendToHarvest(u: Unit, nearX = u.x, nearY = u.y): boolean {
    const ast = this.findAsteroid(nearX, nearY, u.faction);
    if (!ast) return false;
    u.order = { type: 'harvest', x: ast.x, y: ast.y, targetId: ast.id };
    u.asteroidId = ast.id;
    u.mineState = u.cargo >= (UNITS[u.kind].cargo ?? 0) ? 'returning' : 'toAsteroid';
    return true;
  }

  /** Asteroide con minerali più conveniente, penalizzando quelli già affollati. */
  findAsteroid(x: number, y: number, faction: FactionId): Asteroid | undefined {
    const crowd = new Map<number, number>();
    for (const u of this.units) {
      if (u.faction === faction && u.kind === 'miner' && u.order.type === 'harvest' && !u.dead) {
        crowd.set(u.asteroidId, (crowd.get(u.asteroidId) ?? 0) + 1);
      }
    }
    let best: Asteroid | undefined;
    let bestScore = Infinity;
    for (const a of this.asteroids) {
      if (a.amount <= 0) continue;
      const score = Math.sqrt(dist2(x, y, a.x, a.y)) + 70 * (crowd.get(a.id) ?? 0);
      if (score < bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return best;
  }

  damage(target: Unit, amount: number, attacker: FactionId): void {
    if (target.dead) return;
    target.hp -= amount;
    target.lastDamagedTick = this.tick;
    const f = this.factions[target.faction];
    if (f && this.tick - f.lastAlertTick > 8 * 20) {
      f.lastAlertTick = this.tick;
      this.events.push({ t: 'underAttack', faction: target.faction, x: target.x, y: target.y });
    }
    if (target.hp <= 0) {
      const af = this.factions[attacker];
      if (af) af.stats.killed++;
      this.kill(target);
    }
  }

  kill(u: Unit): void {
    if (u.dead) return;
    u.dead = true;
    u.hp = 0;
    const f = this.factions[u.faction];
    if (f) f.stats.lost++;
    this.events.push({ t: 'death', x: u.x, y: u.y, radius: u.radius, kind: u.kind, faction: u.faction });
    if (u.kind === 'turret' && u.planetId >= 0) {
      const p = this.planets[u.planetId];
      if (p) p.turretIds = p.turretIds.filter((id) => id !== u.id);
    }
    if (u.kind === 'mothership') this.eliminate(u.faction);
  }

  eliminate(fid: FactionId): void {
    const f = this.factions[fid];
    if (!f || !f.alive) return;
    f.alive = false;
    f.eliminatedAt = this.tick;
    f.researching = null;
    for (const u of this.units) if (u.faction === fid && !u.dead) this.kill(u);
    for (const p of this.planets) {
      if (p.owner === fid) {
        p.owner = NEUTRAL;
        p.queue = [];
        p.progress = 0;
        p.captureFaction = NEUTRAL;
      }
    }
    this.events.push({ t: 'eliminated', faction: fid });
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (const u of this.units) if (!u.dead) this.grid.insert(u);
  }

  private checkVictory(): void {
    // gli invasori non contano: la partita si decide tra le fazioni con una Nave Madre
    const contenders = this.factions.filter((f) => !f.invader);
    const alive = contenders.filter((f) => f.alive);
    const teams = new Set(alive.map((f) => f.team));
    const human = this.factions.find((f) => f.controller === 'human');
    const pickWinner = (): FactionId | null => {
      if (teams.size !== 1 || alive.length === 0) return null;
      return human && human.alive ? human.id : alive[0].id;
    };
    if ((human && !human.alive) || alive.length === 0) {
      this.over = true;
      this.winner = pickWinner();
    } else if (!this.endless && !this.scripted && teams.size <= 1 && new Set(contenders.map((f) => f.team)).size > 1) {
      this.over = true;
      this.winner = pickWinner();
    }
    if (this.over) this.events.push({ t: 'gameOver', winner: this.winner });
  }

  /** Chiude la partita (usato dalle missioni). */
  finish(winner: FactionId | null, reason = ''): void {
    if (this.over) return;
    this.over = true;
    this.winner = winner;
    this.overReason = reason;
    this.events.push({ t: 'gameOver', winner });
  }

  // ---------------------------------------------------------------- loop

  /**
   * Avanza di un tick. `keepEvents`: non svuotare gli eventi già emessi in questo tick
   * dai controller esterni (ondate, missioni), che girano prima della simulazione.
   */
  step(keepEvents = false): void {
    if (this.over) return;
    if (!keepEvents) this.events.length = 0;
    this.tick++;

    for (const u of this.units) {
      u.px = u.x;
      u.py = u.y;
      u.pangle = u.angle;
    }
    for (const a of this.asteroids) a.angle += a.spin / 20;

    this.rebuildGrid();
    updateProduction(this);
    updateResearch(this);
    for (const u of this.units) if (!u.dead) updateOrder(this, u);
    for (const u of this.units) if (!u.dead) moveUnit(this, u);
    this.rebuildGrid();
    for (const u of this.units) {
      if (u.dead) continue;
      updateWeapon(this, u);
      updateRepair(this, u);
    }
    updateProjectiles(this);
    updateCapture(this);
    updateIncome(this);

    if (this.units.some((u) => u.dead)) {
      for (const u of this.units) if (u.dead) this.byId.delete(u.id);
      this.units = this.units.filter((u) => !u.dead);
    }
    if (this.projectiles.some((p) => p.dead)) {
      this.projectiles = this.projectiles.filter((p) => !p.dead);
    }
    this.checkVictory();
  }
}

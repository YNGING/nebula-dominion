import type { UnitKind } from '../../data/units';
import { issueCommand } from '../../sim/commands';
import { turretSlot } from '../../sim/economy';
import { TICK_RATE, type FactionId, type Unit } from '../../sim/types';
import type { World } from '../../sim/World';
import type { HighlightArea, MissionDef, MissionUI, Objective } from './types';

const NO_UI: MissionUI = { selectedKinds: () => [], cameraTravel: () => 0 };

export interface SpawnOptions {
  label?: string;
  tag?: string;
  /** scafo massimo (sovrascrive quello del tipo) */
  hp?: number;
  /** distanza tra le navi del gruppo */
  spacing?: number;
}

/**
 * Esegue una missione: espone alla logica della missione un piccolo "contesto"
 * (dialoghi, obiettivi, unità, timer) e allo HUD lo stato da mostrare.
 */
export class MissionController {
  readonly player: FactionId = 0;
  objectives: Objective[] = [];
  dialog: { speaker: string; text: string; seq: number } | null = null;
  highlight: HighlightArea = null;
  beacon: { x: number; y: number } | null = null;
  timer: { label: string; endTick: number } | null = null;
  ui: MissionUI = NO_UI;
  /** stato libero della missione */
  data: Record<string, number> = {};
  private seq = 0;
  private scheduled: { tick: number; fn: () => void }[] = [];

  constructor(
    readonly world: World,
    readonly def: MissionDef,
  ) {}

  start(): void {
    this.def.setup(this);
  }

  update(): void {
    const w = this.world;
    if (w.over) return;
    const due = this.scheduled.filter((s) => s.tick <= w.tick);
    if (due.length) {
      this.scheduled = this.scheduled.filter((s) => s.tick > w.tick);
      for (const s of due) s.fn();
    }
    if (w.over) return;
    this.def.update(this);
  }

  // ------------------------------------------------------------ tempo

  /** Secondi dall'inizio della missione. */
  get elapsed(): number {
    return this.world.tick / TICK_RATE;
  }

  after(seconds: number, fn: () => void): void {
    this.scheduled.push({ tick: this.world.tick + Math.round(seconds * TICK_RATE), fn });
  }

  setTimer(label: string, seconds: number): void {
    this.timer = { label, endTick: this.world.tick + Math.round(seconds * TICK_RATE) };
  }

  clearTimer(): void {
    this.timer = null;
  }

  /** Secondi rimasti sul timer (Infinity se non c'è). */
  timeLeft(): number {
    return this.timer ? Math.max(0, (this.timer.endTick - this.world.tick) / TICK_RATE) : Infinity;
  }

  // ------------------------------------------------------------ dialoghi e guida

  say(speaker: string, text: string): void {
    this.dialog = { speaker, text, seq: ++this.seq };
  }

  setHighlight(area: HighlightArea): void {
    this.highlight = area;
  }

  setBeacon(p: { x: number; y: number } | null): void {
    this.beacon = p ? { x: p.x, y: p.y } : null;
  }

  // ------------------------------------------------------------ obiettivi

  objective(id: string, text: string, opts: { optional?: boolean; progress?: string } = {}): void {
    const o = this.objectives.find((x) => x.id === id);
    if (o) {
      o.text = text;
      if (opts.progress !== undefined) o.progress = opts.progress;
      return;
    }
    this.objectives.push({ id, text, status: 'active', optional: opts.optional, progress: opts.progress });
  }

  setProgress(id: string, progress: string): void {
    const o = this.objectives.find((x) => x.id === id);
    if (o) o.progress = progress;
  }

  complete(id: string): void {
    const o = this.objectives.find((x) => x.id === id);
    if (o && o.status === 'active') o.status = 'done';
  }

  fail(id: string): void {
    const o = this.objectives.find((x) => x.id === id);
    if (o && o.status === 'active') o.status = 'failed';
  }

  status(id: string): Objective['status'] | undefined {
    return this.objectives.find((x) => x.id === id)?.status;
  }

  /** Rimuove gli obiettivi (es. al cambio di passo del tutorial). */
  clearObjectives(): void {
    this.objectives = [];
  }

  win(): void {
    for (const o of this.objectives) if (!o.optional) this.complete(o.id);
    this.world.finish(this.player, '');
  }

  lose(reason: string): void {
    this.world.finish(null, reason);
  }

  // ------------------------------------------------------------ unità

  unitsOf(f: FactionId, kind?: UnitKind): Unit[] {
    return this.world.units.filter((u) => u.faction === f && !u.dead && (!kind || u.kind === kind));
  }

  byTag(tag: string): Unit | undefined {
    return this.world.units.find((u) => u.tag === tag && !u.dead);
  }

  ownedPlanets(f: FactionId = this.player): number {
    return this.world.planets.filter((p) => p.owner === f).length;
  }

  /** Crea n navi in gruppo attorno a (x, y). */
  spawn(kind: UnitKind, f: FactionId, x: number, y: number, n = 1, opts: SpawnOptions = {}): Unit[] {
    const w = this.world;
    const out: Unit[] = [];
    const sp = opts.spacing ?? 34;
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996;
      const r = i === 0 ? 0 : sp * Math.sqrt(i);
      const px = Math.min(w.width - 30, Math.max(30, x + Math.cos(a) * r));
      const py = Math.min(w.height - 30, Math.max(30, y + Math.sin(a) * r));
      const u = w.spawnUnit(kind, f, px, py, Math.atan2(w.height / 2 - py, w.width / 2 - px));
      if (opts.label) u.label = opts.label;
      if (opts.tag) u.tag = opts.tag;
      if (opts.hp) {
        u.maxHp = opts.hp;
        u.hp = opts.hp;
      }
      u.guardX = u.x;
      u.guardY = u.y;
      out.push(u);
    }
    return out;
  }

  attackMove(units: Unit[], x: number, y: number): void {
    if (!units.length) return;
    issueCommand(this.world, units[0].faction, { type: 'attackMove', ids: units.map((u) => u.id), x, y });
  }

  attack(units: Unit[], target: Unit): void {
    if (!units.length) return;
    issueCommand(this.world, units[0].faction, { type: 'attack', ids: units.map((u) => u.id), targetId: target.id });
  }

  /** Assegna un pianeta a una fazione, con torrette già costruite. */
  givePlanet(planetId: number, f: FactionId, turrets = 0): void {
    const w = this.world;
    const p = w.planets[planetId];
    p.owner = f;
    for (let i = 0; i < turrets; i++) {
      const pos = turretSlot(p, i);
      const t = w.spawnUnit('turret', f, pos.x, pos.y, Math.atan2(pos.y - p.y, pos.x - p.x));
      t.planetId = p.id;
      t.order.targetId = i;
      p.turretIds.push(t.id);
    }
  }
}

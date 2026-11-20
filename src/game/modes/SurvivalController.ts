import type { Difficulty } from '../../data/factions';
import { MAX_RESEARCH_LEVEL } from '../../data/research';
import { UNITS, type UnitKind } from '../../data/units';
import { issueCommand } from '../../sim/commands';
import { dist2 } from '../../sim/math';
import { TICK_RATE, type FactionId, type Unit } from '../../sim/types';
import type { World } from '../../sim/World';

/** Parametri della sopravvivenza per difficoltà. */
export const SURVIVAL_PARAMS: Record<Difficulty, { strength: number; firstWave: number; interval: number; minInterval: number }> = {
  easy: { strength: 0.75, firstWave: 150, interval: 80, minInterval: 60 },
  normal: { strength: 1, firstWave: 120, interval: 75, minInterval: 50 },
  hard: { strength: 1.3, firstWave: 100, interval: 70, minInterval: 45 },
};

/** Supply complessiva dell'ondata n (da 1). */
export function waveBudget(wave: number, strength: number): number {
  return Math.round((4 + 3 * wave + Math.pow(Math.max(0, wave - 8), 1.5)) * strength);
}

/** Composizione di un'ondata: i tipi di nave si sbloccano gradualmente, Corazzate "boss" ogni 5 ondate. */
export function waveComposition(wave: number, strength: number, rand: () => number): UnitKind[] {
  let budget = waveBudget(wave, strength);
  const out: UnitKind[] = [];
  if (wave % 5 === 0) {
    for (let i = 0; i < Math.floor(wave / 5) && budget >= UNITS.battleship.supply; i++) {
      out.push('battleship');
      budget -= UNITS.battleship.supply;
    }
  }
  const pool: [UnitKind, number][] = [['fighter', 3]];
  if (wave >= 3) pool.push(['frigate', 2]);
  if (wave >= 6) pool.push(['battleship', 0.6]);
  if (wave >= 8) pool.push(['support', 0.4]);
  const total = pool.reduce((s, [, w]) => s + w, 0);
  let guard = 0;
  while (budget > 0 && guard++ < 200) {
    let r = rand() * total;
    let kind: UnitKind = 'fighter';
    for (const [k, w] of pool) {
      r -= w;
      if (r <= 0) {
        kind = k;
        break;
      }
    }
    const s = UNITS[kind].supply;
    if (s > budget) {
      if (budget >= 1) {
        out.push('fighter');
        budget -= 1;
      }
      continue;
    }
    out.push(kind);
    budget -= s;
  }
  return out;
}

/**
 * Modalità sopravvivenza: ondate sempre più forti di invasori arrivano dai bordi
 * della mappa e puntano ai pianeti e alla Nave Madre del giocatore.
 */
export class SurvivalController {
  wave = 0;
  nextWaveTick: number;
  private readonly params: (typeof SURVIVAL_PARAMS)[Difficulty];

  constructor(
    private readonly w: World,
    readonly invader: FactionId,
    readonly player: FactionId,
    difficulty: Difficulty,
  ) {
    this.params = SURVIVAL_PARAMS[difficulty];
    this.nextWaveTick = this.params.firstWave * TICK_RATE;
  }

  /** Secondi alla prossima ondata. */
  get secondsToNext(): number {
    return Math.max(0, (this.nextWaveTick - this.w.tick) / TICK_RATE);
  }

  /** Invasori ancora in campo. */
  get invadersLeft(): number {
    return this.w.units.filter((u) => u.faction === this.invader).length;
  }

  update(): void {
    const w = this.w;
    if (w.over) return;
    if (w.tick >= this.nextWaveTick) this.spawnWave();
    if (w.tick % 40 === 0) this.retarget();
  }

  private interval(): number {
    return Math.max(this.params.minInterval, this.params.interval - this.wave * 1.5);
  }

  /** Punto sul bordo della mappa lontano dalla base del giocatore. */
  private edgePoint(): { x: number; y: number } {
    const w = this.w;
    const m = w.mothershipOf(this.player);
    const mx = m?.x ?? w.width / 2;
    const my = m?.y ?? w.height / 2;
    let best = { x: 0, y: 0 };
    let bestD = -1;
    for (let i = 0; i < 6; i++) {
      const side = w.rng.int(0, 3);
      const t = w.rng.range(0.1, 0.9);
      const p =
        side === 0
          ? { x: t * w.width, y: 120 }
          : side === 1
            ? { x: w.width - 120, y: t * w.height }
            : side === 2
              ? { x: t * w.width, y: w.height - 120 }
              : { x: 120, y: t * w.height };
      const d = dist2(p.x, p.y, mx, my);
      // lontano dalla base, ma con un po' di varietà
      const score = d * w.rng.range(0.7, 1);
      if (score > bestD) {
        bestD = score;
        best = p;
      }
    }
    return best;
  }

  private spawnWave(): void {
    const w = this.w;
    this.wave++;
    this.nextWaveTick = w.tick + this.interval() * TICK_RATE;

    // gli invasori migliorano col tempo: +1 livello di Armi e Scafi ogni 4 ondate
    const inv = w.factions[this.invader];
    const lvl = Math.min(MAX_RESEARCH_LEVEL, Math.floor(this.wave / 4));
    if (inv.research.weapons !== lvl) {
      inv.research.weapons = lvl;
      inv.research.hulls = lvl;
      w.refreshDefs(this.invader);
    }

    const kinds = waveComposition(this.wave, this.params.strength, () => w.rng.next());
    const groups = this.wave >= 8 ? 2 : 1;
    let firstPoint = { x: 0, y: 0 };
    for (let g = 0; g < groups; g++) {
      const p = this.edgePoint();
      if (g === 0) firstPoint = p;
      const part = kinds.filter((_, i) => i % groups === g);
      const ids: number[] = [];
      part.forEach((kind, i) => {
        const a = (i / Math.max(1, part.length)) * Math.PI * 2;
        const r = 30 + Math.sqrt(i) * 26;
        const x = Math.min(w.width - 40, Math.max(40, p.x + Math.cos(a) * r));
        const y = Math.min(w.height - 40, Math.max(40, p.y + Math.sin(a) * r));
        const u = w.spawnUnit(kind, this.invader, x, y, Math.atan2(w.height / 2 - y, w.width / 2 - x));
        ids.push(u.id);
      });
      const target = this.targetFor(p);
      issueCommand(w, this.invader, { type: 'attackMove', ids, x: target.x, y: target.y });
    }
    w.events.push({ t: 'wave', wave: this.wave, x: firstPoint.x, y: firstPoint.y });
  }

  /** Obiettivo: il pianeta del giocatore più vicino, oppure la sua Nave Madre. */
  private targetFor(from: { x: number; y: number }): { x: number; y: number } {
    const w = this.w;
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const p of w.planets) {
      if (p.owner !== this.player) continue;
      const d = dist2(from.x, from.y, p.x, p.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    const m = w.mothershipOf(this.player);
    // dalle ondate avanzate si punta direttamente alla Nave Madre
    if (m && (!best || this.wave >= 10 || w.rng.next() < 0.3)) return { x: m.x, y: m.y };
    return best ?? { x: w.width / 2, y: w.height / 2 };
  }

  /** Gli invasori fermi ripartono verso il bersaglio più vicino. */
  private retarget(): void {
    const w = this.w;
    const idle: Unit[] = w.units.filter((u) => u.faction === this.invader && u.order.type === 'idle');
    if (!idle.length) return;
    let cx = 0;
    let cy = 0;
    for (const u of idle) {
      cx += u.x;
      cy += u.y;
    }
    const t = this.targetFor({ x: cx / idle.length, y: cy / idle.length });
    issueCommand(w, this.invader, { type: 'attackMove', ids: idle.map((u) => u.id), x: t.x, y: t.y });
  }
}

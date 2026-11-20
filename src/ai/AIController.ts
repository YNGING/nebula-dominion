import { DIFFICULTIES, type DifficultyParams } from '../data/factions';
import { RESEARCH_ORDER } from '../data/research';
import { ECONOMY, UNITS, type UnitKind } from '../data/units';
import { researchCost } from '../sim/stats';
import { issueCommand, type Command } from '../sim/commands';
import { dist, dist2 } from '../sim/math';
import { TICK_RATE, type FactionId, type Planet, type Unit } from '../sim/types';
import type { World } from '../sim/World';

type Role = 'free' | 'expand' | 'wave';

interface Target {
  x: number;
  y: number;
  planetId: number;
  unitId: number;
}

/**
 * IA a macchina a stati, una per fazione: gestisce economia, produzione,
 * espansione sui pianeti, difesa e ondate d'attacco. Vede tutta la mappa.
 */
export class AIController {
  readonly params: DifficultyParams;
  private readonly roles = new Map<number, Role>();
  private readonly expansions = new Map<number, number[]>();
  private waveSize: number;
  private attacking = false;
  private target: Target | null = null;
  private nextKind: UnitKind | null = null;
  private readonly offset: number;

  constructor(
    private readonly w: World,
    readonly fid: FactionId,
  ) {
    this.params = DIFFICULTIES[w.factions[fid].difficulty];
    this.waveSize = this.params.firstWave;
    this.offset = fid * 7;
  }

  private cmd(c: Command): string | null {
    return issueCommand(this.w, this.fid, c);
  }

  update(): void {
    const w = this.w;
    const f = w.factions[this.fid];
    if (!f.alive || w.over) return;
    if ((w.tick + this.offset) % this.params.think !== 0) return;
    const mother = w.mothershipOf(this.fid);
    if (!mother) return;

    const miners: Unit[] = [];
    const army: Unit[] = [];
    for (const u of w.units) {
      if (u.faction !== this.fid || u.dead) continue;
      if (u.kind === 'miner') miners.push(u);
      else if (!UNITS[u.kind].structure) army.push(u);
    }
    for (const id of [...this.roles.keys()]) if (!w.unit(id)) this.roles.delete(id);
    for (const u of army) if (!this.roles.has(u.id)) this.roles.set(u.id, 'free');

    this.manageMiners(mother, miners);
    this.manageProduction(mother, miners, army);
    this.manageTurrets(mother);
    this.manageResearch(army);

    const threat = this.findThreat(mother);
    if (threat) this.defend(threat, army);
    else {
      this.manageExpansion(mother, army);
      this.manageWave(mother, army);
      this.gatherFree(mother, army);
    }
  }

  // ------------------------------------------------------------ economia

  private manageMiners(mother: Unit, miners: Unit[]): void {
    for (const m of miners) {
      if (m.order.type === 'idle') this.w.sendToHarvest(m, mother.x, mother.y);
    }
  }

  private minerTarget(): number {
    const minutes = this.w.tick / TICK_RATE / 60;
    return Math.min(this.params.maxMiners, 4 + Math.floor(minutes * 2.5));
  }

  private manageProduction(mother: Unit, miners: Unit[], army: Unit[]): void {
    const w = this.w;
    const f = w.factions[this.fid];
    if (mother.queue.length >= ECONOMY.productionSlots + 1) return;
    const queuedMiners = mother.queue.filter((q) => q.kind === 'miner').length;
    if (miners.length + queuedMiners < this.minerTarget() && w.asteroids.some((a) => a.amount > 0)) {
      // prima i minatori, ma senza restare del tutto indifesi
      const needArmy = miners.length >= 5 && army.length < 3;
      if (f.minerals >= w.def(this.fid, 'miner').cost && !needArmy) {
        this.cmd({ type: 'build', structureId: mother.id, kind: 'miner' });
        return;
      }
    }
    if (!this.nextKind) this.nextKind = this.chooseShip(army);
    const def = w.def(this.fid, this.nextKind);
    if (f.minerals < def.cost) {
      // se il risparmio dura troppo, ripiega su una nave più economica
      if (this.nextKind === 'battleship' && w.rng.next() < 0.1) this.nextKind = null;
      return;
    }
    const err = this.cmd({ type: 'build', structureId: mother.id, kind: this.nextKind });
    if (!err) this.nextKind = null;
  }

  private chooseShip(army: Unit[]): UnitKind {
    const w = this.w;
    const minutes = w.tick / TICK_RATE / 60;
    let fighters = 0;
    let frigates = 0;
    let battleships = 0;
    let total = 0;
    for (const u of w.units) {
      if (!w.isEnemy(this.fid, u.faction) || u.dead) continue;
      const s = UNITS[u.kind].supply;
      if (u.kind === 'fighter') fighters += s;
      else if (u.kind === 'frigate') frigates += s;
      else if (u.kind === 'battleship') battleships += s;
      else continue;
      total += s;
    }
    const weights: [UnitKind, number][] = [
      ['fighter', 1],
      ['frigate', 1],
      ['battleship', minutes > 3 ? 0.6 : 0],
    ];
    if (this.params.counter && total > 0) {
      weights[0][1] += (battleships / total) * 2.5;
      weights[1][1] += (fighters / total) * 2.5;
      weights[2][1] += minutes > 2 ? (frigates / total) * 2.5 : 0;
    }
    const supports = army.filter((u) => u.kind === 'support').length;
    if (this.params.counter && army.length >= 8 && supports < army.length / 8) weights.push(['support', 0.4]);
    const sum = weights.reduce((s, [, v]) => s + v, 0);
    let r = w.rng.next() * sum;
    for (const [k, v] of weights) {
      r -= v;
      if (r <= 0) return k;
    }
    return 'fighter';
  }

  private manageTurrets(mother: Unit): void {
    if (!this.params.turrets) return;
    const w = this.w;
    const f = w.factions[this.fid];
    if (f.minerals < 350) return;
    const supplyFull = w.supplyUsed(this.fid) >= w.supplyCap(this.fid) - 2;
    if (!supplyFull && f.minerals < 900) return;
    let best: Planet | undefined;
    let bestD = Infinity;
    for (const p of w.planets) {
      if (p.owner !== this.fid || p.turretIds.length + p.queue.length >= ECONOMY.turretsPerPlanet) continue;
      // le torrette servono sui pianeti più esposti (lontani dalla base)
      const d = -dist(p.x, p.y, mother.x, mother.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best) this.cmd({ type: 'buildTurret', planetId: best.id });
  }

  /** Ricerca con i minerali in eccesso, solo se l'esercito non è sguarnito. */
  private manageResearch(army: Unit[]): void {
    if (!this.params.research) return;
    const w = this.w;
    const f = w.factions[this.fid];
    if (f.researching || w.tick < 120 * 20 || this.armySupply(army) < 6) return;
    // priorità: armi, scafi, estrazione, motori, difese; prima i livelli bassi
    const priority = ['weapons', 'hulls', 'mining', 'engines', 'defense'] as const;
    const options = RESEARCH_ORDER.filter((t) => researchCost(f.doctrine, f.research, t) !== null).sort(
      (a, b) => f.research[a] - f.research[b] || priority.indexOf(a) - priority.indexOf(b),
    );
    const track = options[0];
    if (!track) return;
    const cost = researchCost(f.doctrine, f.research, track)!;
    if (f.minerals >= cost + 150) this.cmd({ type: 'research', track });
  }

  // ------------------------------------------------------------ militare

  private armySupply(units: Unit[]): number {
    return units.reduce((s, u) => s + UNITS[u.kind].supply, 0);
  }

  private findThreat(mother: Unit): { x: number; y: number } | null {
    const w = this.w;
    const zones: { x: number; y: number; r: number }[] = [{ x: mother.x, y: mother.y, r: 800 }];
    for (const p of w.planets) if (p.owner === this.fid) zones.push({ x: p.x, y: p.y, r: p.radius + 260 });
    let sx = 0;
    let sy = 0;
    let n = 0;
    let supply = 0;
    for (const u of w.units) {
      if (u.dead || !w.isEnemy(this.fid, u.faction)) continue;
      const def = UNITS[u.kind];
      if (!def.weapon || def.structure) continue;
      for (const z of zones) {
        if (dist2(u.x, u.y, z.x, z.y) < z.r * z.r) {
          sx += u.x;
          sy += u.y;
          n++;
          supply += def.supply;
          break;
        }
      }
    }
    return n > 0 && supply >= 2 ? { x: sx / n, y: sy / n } : null;
  }

  private defend(threat: { x: number; y: number }, army: Unit[]): void {
    const ids = army
      .filter((u) => UNITS[u.kind].weapon || u.kind === 'support')
      .filter((u) => !(u.order.type === 'attackMove' && dist(u.order.x, u.order.y, threat.x, threat.y) < 200))
      .map((u) => u.id);
    if (ids.length) this.cmd({ type: 'attackMove', ids, x: threat.x, y: threat.y });
  }

  private freeUnits(army: Unit[]): Unit[] {
    return army.filter((u) => this.roles.get(u.id) === 'free');
  }

  private manageExpansion(mother: Unit, army: Unit[]): void {
    const w = this.w;
    // libera le squadre il cui pianeta è stato preso o perso
    for (const [pid, ids] of [...this.expansions]) {
      const alive = ids.filter((id) => w.unit(id));
      const p = w.planets[pid];
      if (p.owner === this.fid || alive.length === 0) {
        for (const id of alive) this.roles.set(id, 'free');
        this.expansions.delete(pid);
      } else this.expansions.set(pid, alive);
    }
    if (this.expansions.size >= 2) return;

    const candidates = w.planets
      .filter((p) => p.owner === -1 && !this.expansions.has(p.id))
      .sort((a, b) => dist2(a.x, a.y, mother.x, mother.y) - dist2(b.x, b.y, mother.x, mother.y));
    const target = candidates[0];
    if (!target) return;
    const free = this.freeUnits(army)
      .filter((u) => UNITS[u.kind].weapon && u.kind !== 'battleship')
      .sort((a, b) => dist2(a.x, a.y, target.x, target.y) - dist2(b.x, b.y, target.x, target.y));
    // al limite flotta non si può aspettare una squadra completa
    const blocked = w.supplyUsed(this.fid) >= w.supplyCap(this.fid) - 2;
    const need = blocked ? 1 : this.params.expandSquad;
    if (free.length < need) return;
    const squad = free.slice(0, Math.max(need, Math.min(free.length, this.params.expandSquad)));
    for (const u of squad) this.roles.set(u.id, 'expand');
    this.expansions.set(target.id, squad.map((u) => u.id));
    this.cmd({ type: 'attackMove', ids: squad.map((u) => u.id), x: target.x, y: target.y });
  }

  private chooseTarget(from: { x: number; y: number }, big: boolean): Target | null {
    const w = this.w;
    let best: Target | null = null;
    let bestScore = Infinity;
    for (const p of w.planets) {
      if (p.owner < 0 || !w.isEnemy(this.fid, p.owner)) continue;
      const score = dist(from.x, from.y, p.x, p.y) + p.turretIds.length * 400;
      if (score < bestScore) {
        bestScore = score;
        best = { x: p.x, y: p.y, planetId: p.id, unitId: -1 };
      }
    }
    for (const f of w.factions) {
      if (!f.alive || !w.isEnemy(this.fid, f.id)) continue;
      const m = w.mothershipOf(f.id);
      if (!m) continue;
      const score = dist(from.x, from.y, m.x, m.y) * (big ? 0.6 : 1.4);
      if (score < bestScore) {
        bestScore = score;
        best = { x: m.x, y: m.y, planetId: -1, unitId: m.id };
      }
    }
    // nessun nemico possiede pianeti vicini: prendi quelli neutrali rimasti
    if (!best) {
      for (const p of w.planets) {
        if (p.owner === this.fid) continue;
        const score = dist(from.x, from.y, p.x, p.y);
        if (score < bestScore) {
          bestScore = score;
          best = { x: p.x, y: p.y, planetId: p.id, unitId: -1 };
        }
      }
    }
    return best;
  }

  private targetDone(t: Target): boolean {
    if (t.unitId >= 0) return !this.w.unit(t.unitId);
    return this.w.planets[t.planetId].owner === this.fid;
  }

  private manageWave(mother: Unit, army: Unit[]): void {
    const w = this.w;
    const seconds = w.tick / TICK_RATE;
    const wave = army.filter((u) => this.roles.get(u.id) === 'wave');
    const free = this.freeUnits(army).filter((u) => UNITS[u.kind].weapon || u.kind === 'support');

    if (!this.attacking) {
      // al limite flotta la soglia dell'ondata può diventare irraggiungibile: si attacca con ciò che si ha
      const capped = w.supplyUsed(this.fid) >= w.supplyCap(this.fid) - 2 && this.armySupply(free) >= 8;
      if (!capped) {
        if (seconds < this.params.attackDelay && this.armySupply(free) < this.waveSize * 1.5) return;
        if (this.armySupply(free) < this.waveSize) return;
      }
      this.attacking = true;
      for (const u of free) this.roles.set(u.id, 'wave');
      wave.push(...free);
      this.waveSize = Math.min(this.params.maxWave, this.waveSize + this.params.waveGrowth);
      this.target = null;
    }

    if (this.armySupply(wave) < Math.max(4, this.waveSize * 0.2)) {
      // ritirata: l'ondata è stata decimata
      this.attacking = false;
      this.target = null;
      for (const u of wave) this.roles.set(u.id, 'free');
      if (wave.length) this.cmd({ type: 'move', ids: wave.map((u) => u.id), x: mother.x, y: mother.y });
      return;
    }

    // rinforzi: le nuove navi raggiungono l'ondata a gruppi, non una alla volta
    if (this.params.counter && this.armySupply(free) >= 8) {
      for (const u of free) {
        this.roles.set(u.id, 'wave');
        wave.push(u);
      }
    }

    let cx = 0;
    let cy = 0;
    for (const u of wave) {
      cx += u.x;
      cy += u.y;
    }
    cx /= wave.length;
    cy /= wave.length;

    if (!this.target || this.targetDone(this.target)) {
      this.target = this.chooseTarget({ x: cx, y: cy }, this.armySupply(wave) >= 30);
      if (!this.target) return;
      this.cmd({ type: 'attackMove', ids: wave.map((u) => u.id), x: this.target.x, y: this.target.y });
      return;
    }
    // chi è rimasto inattivo lontano dall'obiettivo riparte
    const t = this.target;
    const idle = wave.filter((u) => u.order.type === 'idle' && dist(u.x, u.y, t.x, t.y) > 350);
    if (idle.length) {
      if (t.unitId >= 0) this.cmd({ type: 'attack', ids: idle.map((u) => u.id), targetId: t.unitId });
      else this.cmd({ type: 'attackMove', ids: idle.map((u) => u.id), x: t.x, y: t.y });
    }
  }

  private gatherFree(mother: Unit, army: Unit[]): void {
    const w = this.w;
    const a = Math.atan2(w.height / 2 - mother.y, w.width / 2 - mother.x);
    const sx = mother.x + Math.cos(a) * 260;
    const sy = mother.y + Math.sin(a) * 260;
    const ids = this.freeUnits(army)
      .filter((u) => u.order.type === 'idle' && dist(u.x, u.y, sx, sy) > 300)
      .map((u) => u.id);
    if (ids.length) this.cmd({ type: 'move', ids, x: sx, y: sy });
  }
}

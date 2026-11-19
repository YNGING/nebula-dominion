import { UNITS, type UnitKind } from '../data/units';
import { cancelShip, cancelTurret, enqueueShip, enqueueTurret } from './economy';
import { dist2 } from './math';
import type { FactionId, Order, Unit } from './types';
import type { World } from './World';

export type Command =
  | { type: 'move'; ids: number[]; x: number; y: number }
  | { type: 'attackMove'; ids: number[]; x: number; y: number }
  | { type: 'attack'; ids: number[]; targetId: number }
  | { type: 'harvest'; ids: number[]; asteroidId: number }
  | { type: 'returnCargo'; ids: number[] }
  | { type: 'stop'; ids: number[] }
  | { type: 'hold'; ids: number[] }
  | { type: 'build'; structureId: number; kind: UnitKind }
  | { type: 'cancel'; structureId: number; index: number }
  | { type: 'rally'; structureId: number; x: number; y: number }
  | { type: 'buildTurret'; planetId: number }
  | { type: 'cancelTurret'; planetId: number; index: number };

/** Unità mobili della fazione tra gli id indicati. */
function ownShips(w: World, f: FactionId, ids: number[]): Unit[] {
  const out: Unit[] = [];
  for (const id of ids) {
    const u = w.unit(id);
    if (u && u.faction === f && !UNITS[u.kind].structure) out.push(u);
  }
  return out;
}

/**
 * Posizioni in formazione attorno al punto (spirale "girasole"), spostate fuori dai pianeti.
 * Le navi più vicine al punto prendono gli slot centrali.
 */
export function formationSlots(w: World, units: Unit[], x: number, y: number): Map<number, { x: number; y: number }> {
  const res = new Map<number, { x: number; y: number }>();
  if (units.length === 0) return res;
  const maxR = Math.max(...units.map((u) => u.radius));
  const spacing = maxR * 2 + 10;
  const sorted = [...units].sort((a, b) => dist2(a.x, a.y, x, y) - dist2(b.x, b.y, x, y));
  sorted.forEach((u, i) => {
    const r = i === 0 ? 0 : spacing * Math.sqrt(i) * 0.75;
    const a = i * 2.39996;
    let sx = x + Math.cos(a) * r;
    let sy = y + Math.sin(a) * r;
    for (const p of w.planets) {
      const min = p.radius + u.radius + 14;
      const d2 = dist2(sx, sy, p.x, p.y);
      if (d2 < min * min) {
        const d = Math.sqrt(d2);
        const ang = d > 1 ? Math.atan2(sy - p.y, sx - p.x) : Math.atan2(u.y - p.y, u.x - p.x);
        sx = p.x + Math.cos(ang) * (min + (i % 3) * 18);
        sy = p.y + Math.sin(ang) * (min + (i % 3) * 18);
      }
    }
    res.set(u.id, { x: Math.min(Math.max(sx, 20), w.width - 20), y: Math.min(Math.max(sy, 20), w.height - 20) });
  });
  return res;
}

function setOrder(u: Unit, order: Order): void {
  u.order = order;
  u.stuckTicks = 0;
  if (u.kind === 'miner' && order.type !== 'harvest') u.mineState = null;
}

/** Applica un comando del giocatore o dell'IA. Restituisce un messaggio d'errore oppure null. */
export function issueCommand(w: World, f: FactionId, cmd: Command): string | null {
  if (!w.factions[f]?.alive) return null;
  switch (cmd.type) {
    case 'move':
    case 'attackMove': {
      const units = ownShips(w, f, cmd.ids);
      const slots = formationSlots(w, units, cmd.x, cmd.y);
      for (const u of units) {
        const s = slots.get(u.id)!;
        const type = cmd.type === 'attackMove' && UNITS[u.kind].weapon ? 'attackMove' : 'move';
        setOrder(u, { type, x: s.x, y: s.y, targetId: -1 });
      }
      return null;
    }
    case 'attack': {
      const t = w.unit(cmd.targetId);
      if (!t || !w.isEnemy(f, t.faction)) return null;
      for (const u of ownShips(w, f, cmd.ids)) setOrder(u, { type: 'attack', x: t.x, y: t.y, targetId: t.id });
      return null;
    }
    case 'harvest': {
      const ast = w.asteroid(cmd.asteroidId);
      if (!ast || ast.amount <= 0) return 'Asteroide esaurito';
      const units = ownShips(w, f, cmd.ids);
      const others: Unit[] = [];
      for (const u of units) {
        if (u.kind === 'miner') {
          setOrder(u, { type: 'harvest', x: ast.x, y: ast.y, targetId: ast.id });
          u.asteroidId = ast.id;
          u.mineState = u.cargo >= (UNITS.miner.cargo ?? 0) ? 'returning' : 'toAsteroid';
        } else others.push(u);
      }
      if (others.length) issueCommand(w, f, { type: 'move', ids: others.map((u) => u.id), x: ast.x, y: ast.y });
      return null;
    }
    case 'returnCargo': {
      for (const u of ownShips(w, f, cmd.ids)) {
        if (u.kind !== 'miner') continue;
        if (u.order.type !== 'harvest' && !w.sendToHarvest(u)) continue;
        if (u.cargo > 0) u.mineState = 'returning';
      }
      return null;
    }
    case 'stop':
    case 'hold': {
      for (const u of ownShips(w, f, cmd.ids)) {
        setOrder(u, { type: cmd.type === 'stop' ? 'idle' : 'hold', x: u.x, y: u.y, targetId: -1 });
        u.guardX = u.x;
        u.guardY = u.y;
      }
      return null;
    }
    case 'build': {
      const m = w.unit(cmd.structureId);
      if (!m || m.faction !== f) return null;
      return enqueueShip(w, m, cmd.kind);
    }
    case 'cancel': {
      const m = w.unit(cmd.structureId);
      if (m && m.faction === f) cancelShip(w, m, cmd.index);
      return null;
    }
    case 'rally': {
      const m = w.unit(cmd.structureId);
      if (m && m.faction === f) {
        m.rallyX = cmd.x;
        m.rallyY = cmd.y;
      }
      return null;
    }
    case 'buildTurret': {
      const p = w.planet(cmd.planetId);
      if (!p) return null;
      return enqueueTurret(w, p, f);
    }
    case 'cancelTurret': {
      const p = w.planet(cmd.planetId);
      if (p && p.owner === f) cancelTurret(w, p, cmd.index);
      return null;
    }
  }
}

import { AGGRO_EXTRA, LEASH, UNITS, type UnitDef } from '../data/units';
import { DT, type Unit } from './types';
import { dist, dist2 } from './math';
import type { World } from './World';

const buf: Unit[] = [];

export function setDest(u: Unit, x: number, y: number, stopDist: number): void {
  u.hasDest = true;
  u.destX = x;
  u.destY = y;
  u.stopDist = stopDist;
}

export function toIdle(u: Unit): void {
  u.order = { type: 'idle', x: u.x, y: u.y, targetId: -1 };
  u.guardX = u.x;
  u.guardY = u.y;
  u.hasDest = false;
}

/** Nemico più vicino entro il raggio (solo unità vive e ostili). */
export function findEnemyNear(w: World, u: Unit, range: number): Unit | undefined {
  w.grid.query(u.x, u.y, range, buf);
  let best: Unit | undefined;
  let bestD = Infinity;
  for (const o of buf) {
    if (o.dead || !w.isEnemy(u.faction, o.faction)) continue;
    const d = dist2(u.x, u.y, o.x, o.y) - o.radius * o.radius;
    if (d < range * range && d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function engage(u: Unit, t: Unit, def: UnitDef): void {
  const range = def.weapon ? def.weapon.range : 0;
  const want = range * 0.85 + t.radius;
  if (dist(u.x, u.y, t.x, t.y) > want) setDest(u, t.x, t.y, want);
}

function arrived(u: Unit, x: number, y: number): boolean {
  const d = dist(u.x, u.y, x, y);
  if (d < Math.max(10, u.radius * 0.8)) return true;
  // bloccato (es. punto dentro un pianeta o nella calca): basta essere vicini
  return u.stuckTicks > 30 && d < 160;
}

/** Decide dove deve andare l'unità in questo tick in base al suo ordine. */
export function updateOrder(w: World, u: Unit): void {
  const def = UNITS[u.kind];
  u.hasDest = false;
  if (def.structure) return;
  const o = u.order;
  switch (o.type) {
    case 'move': {
      setDest(u, o.x, o.y, 0);
      if (arrived(u, o.x, o.y)) toIdle(u);
      break;
    }
    case 'attackMove': {
      if (def.weapon) {
        const e = findEnemyNear(w, u, def.weapon.range + AGGRO_EXTRA);
        if (e) {
          engage(u, e, def);
          break;
        }
      }
      setDest(u, o.x, o.y, 0);
      if (arrived(u, o.x, o.y)) toIdle(u);
      break;
    }
    case 'attack': {
      const t = w.unit(o.targetId);
      if (!t || !w.isEnemy(u.faction, t.faction)) {
        toIdle(u);
        break;
      }
      if (def.weapon) engage(u, t, def);
      else setDest(u, t.x, t.y, t.radius + u.radius + 20);
      break;
    }
    case 'idle': {
      if (def.weapon) {
        const e = findEnemyNear(w, u, def.weapon.range + AGGRO_EXTRA);
        if (e && dist(e.x, e.y, u.guardX, u.guardY) < LEASH) {
          engage(u, e, def);
          break;
        }
      }
      if (dist(u.x, u.y, u.guardX, u.guardY) > 80) setDest(u, u.guardX, u.guardY, 0);
      break;
    }
    case 'hold':
      break;
    case 'harvest':
      updateMiner(w, u, def);
      break;
  }
}

function updateMiner(w: World, u: Unit, def: UnitDef): void {
  const cap = def.cargo ?? 0;
  if (cap <= 0) {
    toIdle(u);
    return;
  }
  if (u.mineState === null) u.mineState = u.cargo >= cap ? 'returning' : 'toAsteroid';

  if (u.mineState !== 'returning') {
    let ast = w.asteroid(u.asteroidId);
    if (!ast || ast.amount <= 0) {
      ast = w.findAsteroid(ast?.x ?? u.x, ast?.y ?? u.y, u.faction);
      if (!ast) {
        if (u.cargo > 0) u.mineState = 'returning';
        else {
          toIdle(u);
          return;
        }
      } else {
        u.asteroidId = ast.id;
        u.order.x = ast.x;
        u.order.y = ast.y;
        u.mineState = 'toAsteroid';
      }
    }
    if (ast && u.mineState === 'toAsteroid') {
      const reach = ast.radius + u.radius + 4;
      setDest(u, ast.x, ast.y, reach);
      if (dist(u.x, u.y, ast.x, ast.y) <= reach + 8) u.mineState = 'mining';
    } else if (ast && u.mineState === 'mining') {
      const reach = ast.radius + u.radius + 4;
      if (dist(u.x, u.y, ast.x, ast.y) > reach + 20) {
        u.mineState = 'toAsteroid';
        return;
      }
      const take = Math.min((def.mineRate ?? 0) * DT, ast.amount, cap - u.cargo);
      u.cargo += take;
      ast.amount -= take;
      if (u.cargo >= cap - 1e-6 || (ast.amount <= 0 && u.cargo > 0)) u.mineState = 'returning';
    }
  }

  if (u.mineState === 'returning') {
    const m = w.mothershipOf(u.faction);
    if (!m) {
      toIdle(u);
      return;
    }
    const reach = m.radius + u.radius + 6;
    setDest(u, m.x, m.y, reach);
    if (dist(u.x, u.y, m.x, m.y) <= reach + 10) {
      const f = w.factions[u.faction];
      const gained = u.cargo * f.incomeBonus;
      f.minerals += gained;
      f.stats.mined += gained;
      u.cargo = 0;
      u.mineState = 'toAsteroid';
    }
  }
}

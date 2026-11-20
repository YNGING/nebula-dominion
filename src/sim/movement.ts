import { UNITS } from '../data/units';
import { clamp, rotateTowards } from './math';
import { DT, type Unit } from './types';
import type { World } from './World';

const buf: Unit[] = [];

/** Steering semplice: arrivo morbido, separazione tra navi, ostacoli (pianeti e strutture). */
export function moveUnit(w: World, u: Unit): void {
  const def = w.def(u.faction, u.kind);
  if (def.speed <= 0) {
    // le strutture ruotano lentamente verso il bersaglio
    const t = u.weaponTarget >= 0 ? w.unit(u.weaponTarget) : undefined;
    if (t && u.kind === 'turret') {
      u.angle = rotateTowards(u.angle, Math.atan2(t.y - u.y, t.x - u.x), def.turnRate * DT);
    } else if (u.kind === 'mothership') {
      u.angle += def.turnRate * DT;
    }
    return;
  }

  let ax: number;
  let ay: number;
  if (u.hasDest) {
    const dx = u.destX - u.x;
    const dy = u.destY - u.y;
    const d = Math.hypot(dx, dy);
    const remaining = d - u.stopDist;
    if (remaining > 2 && d > 0) {
      const brake = Math.max((def.speed * def.speed) / (2 * def.accel), 18);
      const sp = remaining < brake ? def.speed * Math.max(0.15, remaining / brake) : def.speed;
      ax = (dx / d) * sp - u.vx;
      ay = (dy / d) * sp - u.vy;
    } else {
      ax = -u.vx;
      ay = -u.vy;
    }
  } else {
    ax = -u.vx;
    ay = -u.vy;
  }
  const amax = def.accel * DT;
  const al = Math.hypot(ax, ay);
  if (al > amax) {
    ax *= amax / al;
    ay *= amax / al;
  }
  u.vx += ax;
  u.vy += ay;
  const sp = Math.hypot(u.vx, u.vy);
  if (sp > def.speed) {
    u.vx *= def.speed / sp;
    u.vy *= def.speed / sp;
  }

  u.x += u.vx * DT;
  u.y += u.vy * DT;

  // separazione: le navi si spingono a vicenda (ognuna sposta sé stessa di metà sovrapposizione)
  w.grid.query(u.x, u.y, u.radius + 40, buf);
  for (const o of buf) {
    if (o === u || o.dead) continue;
    const odef = UNITS[o.kind];
    const dx = u.x - o.x;
    const dy = u.y - o.y;
    const d = Math.hypot(dx, dy) || 0.01;
    if (odef.structure) {
      const min = o.radius + u.radius + 2;
      if (d < min) {
        u.x = o.x + (dx / d) * min;
        u.y = o.y + (dy / d) * min;
      }
    } else {
      const min = o.radius + u.radius + 3;
      if (d < min) {
        const push = (min - d) * 0.25;
        u.x += (dx / d) * push;
        u.y += (dy / d) * push;
      }
    }
  }

  // pianeti: ostacoli solidi
  for (const p of w.planets) {
    const dx = u.x - p.x;
    const dy = u.y - p.y;
    const min = p.radius + u.radius + 4;
    const d2 = dx * dx + dy * dy;
    if (d2 < min * min) {
      const d = Math.sqrt(d2) || 0.01;
      const nx = dx / d;
      const ny = dy / d;
      u.x = p.x + nx * min;
      u.y = p.y + ny * min;
      const vn = u.vx * nx + u.vy * ny;
      if (vn < 0) {
        u.vx -= vn * nx;
        u.vy -= vn * ny;
      }
    }
  }

  u.x = clamp(u.x, u.radius, w.width - u.radius);
  u.y = clamp(u.y, u.radius, w.height - u.radius);

  // rilevamento blocco: vuole muoversi ma è quasi fermo
  if (u.hasDest && Math.hypot(u.x - u.px, u.y - u.py) < def.speed * DT * 0.2) u.stuckTicks++;
  else u.stuckTicks = 0;

  // orientamento
  const speed = Math.hypot(u.vx, u.vy);
  let desired = u.angle;
  if (speed > def.speed * 0.15) desired = Math.atan2(u.vy, u.vx);
  else {
    const t = u.weaponTarget >= 0 ? w.unit(u.weaponTarget) : undefined;
    if (t) desired = Math.atan2(t.y - u.y, t.x - u.x);
  }
  u.angle = rotateTowards(u.angle, desired, def.turnRate * DT);
}

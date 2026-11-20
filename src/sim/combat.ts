import { UNITS, type WeaponDef } from '../data/units';
import { dist2, segmentCircle } from './math';
import { DT, type Projectile, type Unit } from './types';
import type { World } from './World';

const buf: Unit[] = [];

function inRange(u: Unit, t: Unit, range: number): boolean {
  const r = range + t.radius;
  return dist2(u.x, u.y, t.x, t.y) <= r * r;
}

/** Sceglie il bersaglio migliore entro gittata: priorità al moltiplicatore di danno, poi alla vicinanza. */
function pickTarget(w: World, u: Unit, wp: WeaponDef): Unit | undefined {
  w.grid.query(u.x, u.y, wp.range + 50, buf);
  let best: Unit | undefined;
  let bestScore = -Infinity;
  for (const o of buf) {
    if (o.dead || !w.isEnemy(u.faction, o.faction) || !inRange(u, o, wp.range)) continue;
    const odef = UNITS[o.kind];
    const armed = odef.weapon || odef.repairRate ? 30 : 0;
    const score =
      wp.mult[odef.armor] * 100 + armed - Math.sqrt(dist2(u.x, u.y, o.x, o.y)) / 8 - (o.hp / o.maxHp) * 10;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}

export function updateWeapon(w: World, u: Unit): void {
  const def = w.def(u.faction, u.kind);
  const wp = def.weapon;
  if (!wp) return;
  if (u.cooldown > 0) u.cooldown -= DT;

  let target: Unit | undefined;
  if (u.order.type === 'attack') {
    const t = w.unit(u.order.targetId);
    if (t && inRange(u, t, wp.range)) target = t;
  }
  if (!target && u.weaponTarget >= 0) {
    const t = w.unit(u.weaponTarget);
    if (t && w.isEnemy(u.faction, t.faction) && inRange(u, t, wp.range)) target = t;
  }
  // nuova ricerca solo se serve, e scaglionata nel tempo per risparmiare CPU
  if (!target && (u.weaponTarget >= 0 || (w.tick + u.id) % 3 === 0)) target = pickTarget(w, u, wp);
  u.weaponTarget = target ? target.id : -1;

  if (target && u.cooldown <= 0) {
    fire(w, u, target, wp);
    u.cooldown += wp.cooldown;
    if (u.cooldown < 0) u.cooldown = wp.cooldown;
  } else if (u.cooldown < 0) {
    u.cooldown = 0;
  }
}

function fire(w: World, u: Unit, t: Unit, wp: WeaponDef): void {
  // mira con anticipo sulla traiettoria del bersaglio
  const d = Math.sqrt(dist2(u.x, u.y, t.x, t.y));
  const time = d / wp.projectileSpeed;
  const ax = t.x + t.vx * time;
  const ay = t.y + t.vy * time;
  const a = Math.atan2(ay - u.y, ax - u.x) + w.rng.range(-wp.spread, wp.spread);
  const muzzle = u.radius * 0.8;
  const sx = u.x + Math.cos(a) * muzzle;
  const sy = u.y + Math.sin(a) * muzzle;
  const p: Projectile = {
    x: sx,
    y: sy,
    px: sx,
    py: sy,
    vx: Math.cos(a) * wp.projectileSpeed,
    vy: Math.sin(a) * wp.projectileSpeed,
    damage: wp.damage,
    splash: wp.splash,
    kind: wp.kind,
    faction: u.faction,
    sourceKind: u.kind,
    ttl: (wp.range * 1.3 + t.radius) / wp.projectileSpeed,
    dead: false,
  };
  w.projectiles.push(p);
  w.events.push({ t: 'fire', weapon: wp.kind, x: sx, y: sy, faction: u.faction });
}

export function updateProjectiles(w: World): void {
  for (const p of w.projectiles) {
    if (p.dead) continue;
    p.px = p.x;
    p.py = p.y;
    p.x += p.vx * DT;
    p.y += p.vy * DT;
    p.ttl -= DT;

    const wp = UNITS[p.sourceKind].weapon!;
    const mx = (p.x + p.px) / 2;
    const my = (p.y + p.py) / 2;
    const half = Math.hypot(p.x - p.px, p.y - p.py) / 2;
    // il flak ha la spoletta di prossimità
    const fuse = p.kind === 'flak' ? 10 : 0;
    w.grid.query(mx, my, half + 60, buf);
    let hit: Unit | undefined;
    let hitT = Infinity;
    for (const o of buf) {
      if (o.dead || !w.isEnemy(p.faction, o.faction)) continue;
      const t = segmentCircle(p.px, p.py, p.x, p.y, o.x, o.y, o.radius + fuse);
      if (t >= 0 && t < hitT) {
        hitT = t;
        hit = o;
      }
    }

    if (hit) {
      const hx = p.px + (p.x - p.px) * hitT;
      const hy = p.py + (p.y - p.py) * hitT;
      explode(w, p, wp, hx, hy, hit);
    } else if (p.ttl <= 0) {
      if (p.splash > 0) explode(w, p, wp, p.x, p.y, undefined);
      p.dead = true;
    }
  }
}

function explode(w: World, p: Projectile, wp: WeaponDef, x: number, y: number, direct: Unit | undefined): void {
  p.dead = true;
  if (direct) w.damage(direct, p.damage * wp.mult[UNITS[direct.kind].armor], p.faction);
  if (p.splash > 0) {
    w.grid.query(x, y, p.splash + 30, buf);
    for (const o of buf) {
      if (o === direct || o.dead || !w.isEnemy(p.faction, o.faction)) continue;
      const r = p.splash + o.radius;
      if (dist2(x, y, o.x, o.y) <= r * r) {
        w.damage(o, p.damage * 0.5 * wp.mult[UNITS[o.kind].armor], p.faction);
      }
    }
  }
  w.events.push({ t: 'hit', weapon: p.kind, x, y, splash: p.splash, faction: p.faction });
}

/** Le Navi Supporto riparano l'alleato più danneggiato a portata. */
export function updateRepair(w: World, u: Unit): void {
  const def = w.def(u.faction, u.kind);
  if (!def.repairRate || !def.repairRange) return;
  let t = u.repairTarget >= 0 ? w.unit(u.repairTarget) : undefined;
  const r2 = def.repairRange * def.repairRange;
  if (!t || t.hp >= t.maxHp || dist2(u.x, u.y, t.x, t.y) > r2 || (w.tick + u.id) % 10 === 0) {
    t = undefined;
    w.grid.query(u.x, u.y, def.repairRange, buf);
    let worst = 1;
    for (const o of buf) {
      if (o === u || o.dead || o.faction !== u.faction || o.hp >= o.maxHp) continue;
      if (dist2(u.x, u.y, o.x, o.y) > r2) continue;
      const frac = o.hp / o.maxHp;
      if (frac < worst) {
        worst = frac;
        t = o;
      }
    }
  }
  u.repairTarget = t ? t.id : -1;
  if (t) t.hp = Math.min(t.maxHp, t.hp + def.repairRate * DT);
}

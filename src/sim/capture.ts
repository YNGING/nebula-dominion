import { ECONOMY, UNITS } from '../data/units';
import { DT, NEUTRAL, type FactionId, type Unit } from './types';
import type { World } from './World';

const buf: Unit[] = [];
const counts = new Map<FactionId, number>();

/**
 * Conquista dei pianeti: se nella zona c'è una sola fazione, la barra avanza.
 * Il proprietario (con navi o torrette) blocca la conquista finché resiste.
 */
export function updateCapture(w: World): void {
  for (const p of w.planets) {
    const zone = p.radius + ECONOMY.captureMargin;
    counts.clear();
    w.grid.query(p.x, p.y, zone + 30, buf);
    for (const u of buf) {
      if (u.dead) continue;
      const dx = u.x - p.x;
      const dy = u.y - p.y;
      if (dx * dx + dy * dy > (zone + u.radius) ** 2) continue;
      const def = UNITS[u.kind];
      const isOwnerPresence = u.faction === p.owner && (def.capture || u.kind === 'turret');
      if (def.capture || isOwnerPresence) counts.set(u.faction, (counts.get(u.faction) ?? 0) + 1);
    }

    p.contested = counts.size > 1;
    if (counts.size === 0) {
      p.progress = Math.max(0, p.progress - 0.05 * DT);
      if (p.progress === 0) p.captureFaction = NEUTRAL;
      continue;
    }
    if (counts.size > 1) continue;

    const [f, n] = counts.entries().next().value as [FactionId, number];
    if (f === p.owner) {
      p.progress = Math.max(0, p.progress - 0.2 * DT);
      if (p.progress === 0) p.captureFaction = NEUTRAL;
      continue;
    }
    const rate = 0.08 * Math.min(3, 1 + 0.35 * (n - 1));
    if (p.captureFaction !== f && p.progress > 0) {
      p.progress = Math.max(0, p.progress - rate * DT);
      if (p.progress === 0) p.captureFaction = f;
      continue;
    }
    p.captureFaction = f;
    p.progress += rate * DT;
    if (p.progress >= 1) {
      const prev = p.owner;
      p.owner = f;
      p.progress = 0;
      p.captureFaction = NEUTRAL;
      p.queue = [];
      w.factions[f].stats.planetsCaptured++;
      w.events.push({ t: 'captured', planetId: p.id, faction: f, prev });
    }
  }
}

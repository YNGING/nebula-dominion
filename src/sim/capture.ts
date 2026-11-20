import { ECONOMY, UNITS } from '../data/units';
import { DT, NEUTRAL, type FactionId, type Unit } from './types';
import type { World } from './World';

const buf: Unit[] = [];
/** presenze per squadra: numero di navi e prima fazione incontrata */
const counts = new Map<number, { n: number; faction: FactionId }>();

/**
 * Conquista dei pianeti: se nella zona c'è una sola squadra, la barra avanza.
 * Il proprietario (con navi o torrette) blocca la conquista finché resiste.
 * Gli alleati non si contendono il pianeta.
 */
export function updateCapture(w: World): void {
  for (const p of w.planets) {
    const zone = p.radius + ECONOMY.captureMargin;
    const ownerTeam = p.owner >= 0 ? w.teamOf(p.owner) : null;
    counts.clear();
    w.grid.query(p.x, p.y, zone + 30, buf);
    for (const u of buf) {
      if (u.dead) continue;
      const dx = u.x - p.x;
      const dy = u.y - p.y;
      if (dx * dx + dy * dy > (zone + u.radius) ** 2) continue;
      const def = UNITS[u.kind];
      const team = w.teamOf(u.faction);
      const isOwnerPresence = team === ownerTeam && (def.capture || u.kind === 'turret');
      if (!def.capture && !isOwnerPresence) continue;
      const c = counts.get(team);
      if (c) c.n++;
      else counts.set(team, { n: 1, faction: u.faction });
    }

    p.contested = counts.size > 1;
    if (counts.size === 0) {
      p.progress = Math.max(0, p.progress - 0.05 * DT);
      if (p.progress === 0) p.captureFaction = NEUTRAL;
      continue;
    }
    if (counts.size > 1) continue;

    const [team, { n, faction: f }] = counts.entries().next().value as [number, { n: number; faction: FactionId }];
    if (team === ownerTeam) {
      p.progress = Math.max(0, p.progress - 0.2 * DT);
      if (p.progress === 0) p.captureFaction = NEUTRAL;
      continue;
    }
    const rate = 0.08 * Math.min(3, 1 + 0.35 * (n - 1));
    if (p.captureFaction !== NEUTRAL && w.teamOf(p.captureFaction) !== team && p.progress > 0) {
      p.progress = Math.max(0, p.progress - rate * DT);
      if (p.progress === 0) p.captureFaction = f;
      continue;
    }
    if (p.captureFaction === NEUTRAL || w.teamOf(p.captureFaction) !== team) p.captureFaction = f;
    p.progress += rate * DT;
    if (p.progress >= 1) {
      const prev = p.owner;
      const winner = p.captureFaction;
      p.owner = winner;
      p.progress = 0;
      p.captureFaction = NEUTRAL;
      p.queue = [];
      w.factions[winner].stats.planetsCaptured++;
      w.events.push({ t: 'captured', planetId: p.id, faction: winner, prev });
    }
  }
}

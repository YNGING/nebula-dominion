import { RESEARCH, type ResearchTrack } from '../data/research';
import { BUILDABLE_SHIPS, ECONOMY, type UnitKind } from '../data/units';
import { researchCost, researchTime } from './stats';
import { DT, type Planet, type Unit } from './types';
import type { World } from './World';

/** Mette in coda una nave sulla Nave Madre. Restituisce un messaggio d'errore o null. */
export function enqueueShip(w: World, m: Unit, kind: UnitKind): string | null {
  if (m.kind !== 'mothership' || m.dead) return 'Struttura non valida';
  if (!BUILDABLE_SHIPS.includes(kind)) return 'Non producibile';
  const f = w.factions[m.faction];
  const def = w.def(m.faction, kind);
  if (m.queue.length >= ECONOMY.queueLimit) return 'Coda di produzione piena';
  if (f.minerals < def.cost) return 'Minerali insufficienti';
  if (w.supplyUsed(f.id) + def.supply > w.supplyCap(f.id)) return 'Limite flotta raggiunto: conquista altri pianeti';
  f.minerals -= def.cost;
  m.queue.push({ kind, progress: 0 });
  return null;
}

/** Annulla un elemento in coda e rimborsa il costo. */
export function cancelShip(w: World, m: Unit, index: number): void {
  const item = m.queue[index];
  if (!item) return;
  m.queue.splice(index, 1);
  w.factions[m.faction].minerals += w.def(m.faction, item.kind).cost;
}

export function enqueueTurret(w: World, p: Planet, faction: number): string | null {
  if (p.owner !== faction) return 'Il pianeta non è tuo';
  const def = w.def(faction, 'turret');
  if (p.turretIds.length + p.queue.length >= ECONOMY.turretsPerPlanet) return 'Massimo 2 torrette per pianeta';
  const f = w.factions[faction];
  if (f.minerals < def.cost) return 'Minerali insufficienti';
  f.minerals -= def.cost;
  p.queue.push({ kind: 'turret', progress: 0 });
  return null;
}

export function cancelTurret(w: World, p: Planet, index: number): void {
  const item = p.queue[index];
  if (!item || p.owner < 0) return;
  p.queue.splice(index, 1);
  w.factions[p.owner].minerals += w.def(p.owner, 'turret').cost;
}

/** Posizioni fisse delle torrette attorno a un pianeta. */
export function turretSlot(p: Planet, index: number): { x: number; y: number } {
  const a = (p.id * 1.7 + index * Math.PI) % (Math.PI * 2);
  const r = p.radius + 34;
  return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
}

export function updateProduction(w: World): void {
  for (const m of w.units) {
    if (m.dead || m.queue.length === 0 || m.kind !== 'mothership') continue;
    const slots = Math.min(ECONOMY.productionSlots, m.queue.length);
    for (let i = 0; i < slots; i++) m.queue[i].progress += DT;
    const done = m.queue.findIndex((q, i) => i < slots && q.progress >= w.def(m.faction, q.kind).buildTime);
    if (done < 0) continue;
    const [item] = m.queue.splice(done, 1);
    const def = w.def(m.faction, item.kind);
    const a = Math.atan2(m.rallyY - m.y, m.rallyX - m.x) + w.rng.range(-0.5, 0.5);
    const r = m.radius + def.radius + 6;
    const u = w.spawnUnit(item.kind, m.faction, m.x + Math.cos(a) * r, m.y + Math.sin(a) * r, a);
    w.factions[m.faction].stats.built++;
    w.events.push({ t: 'built', faction: m.faction, kind: item.kind, x: u.x, y: u.y });
    if (item.kind === 'miner') {
      if (!w.sendToHarvest(u, m.x, m.y)) u.order = { type: 'move', x: m.rallyX, y: m.rallyY, targetId: -1 };
    } else {
      const jx = w.rng.range(-40, 40);
      const jy = w.rng.range(-40, 40);
      u.order = { type: 'move', x: m.rallyX + jx, y: m.rallyY + jy, targetId: -1 };
    }
  }

  for (const p of w.planets) {
    if (p.queue.length === 0 || p.owner < 0) continue;
    const item = p.queue[0];
    item.progress += DT;
    if (item.progress < w.def(p.owner, 'turret').buildTime) continue;
    p.queue.shift();
    const used = new Set(p.turretIds.map((id) => w.unit(id)?.order.targetId ?? -1));
    let slot = 0;
    while (used.has(slot)) slot++;
    const pos = turretSlot(p, slot);
    const t = w.spawnUnit('turret', p.owner, pos.x, pos.y, Math.atan2(pos.y - p.y, pos.x - p.x));
    t.planetId = p.id;
    t.order.targetId = slot; // le torrette non si muovono: usiamo targetId per ricordare lo slot
    p.turretIds.push(t.id);
    w.factions[p.owner].stats.built++;
    w.events.push({ t: 'built', faction: p.owner, kind: 'turret', x: t.x, y: t.y });
  }
}

export function updateIncome(w: World): void {
  for (const p of w.planets) {
    if (p.owner < 0) continue;
    const f = w.factions[p.owner];
    const gain = p.income * f.incomeBonus * DT;
    f.minerals += gain;
    f.stats.income += gain;
  }
}

/** Avvia una ricerca sulla Nave Madre. Restituisce un messaggio d'errore o null. */
export function startResearch(w: World, fid: number, track: ResearchTrack): string | null {
  const f = w.factions[fid];
  if (!f?.alive || !w.mothershipOf(fid)) return 'Serve la Nave Madre';
  if (f.researching) return 'È già in corso una ricerca';
  const cost = researchCost(f.doctrine, f.research, track);
  if (cost === null) return `${RESEARCH[track].name}: livello massimo raggiunto`;
  if (f.minerals < cost) return 'Minerali insufficienti';
  f.minerals -= cost;
  f.researching = { track, progress: 0, cost };
  return null;
}

export function cancelResearch(w: World, fid: number): void {
  const f = w.factions[fid];
  if (!f?.researching) return;
  f.minerals += f.researching.cost;
  f.researching = null;
}

export function updateResearch(w: World): void {
  for (const f of w.factions) {
    const r = f.researching;
    if (!r || !f.alive) continue;
    r.progress += DT;
    if (r.progress < researchTime(f.research, r.track)) continue;
    f.research[r.track]++;
    f.researching = null;
    w.refreshDefs(f.id);
    w.events.push({ t: 'research', faction: f.id, track: r.track, level: f.research[r.track] });
  }
}

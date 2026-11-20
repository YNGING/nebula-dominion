import { DOCTRINES, type DoctrineId } from '../data/factions';
import { MAX_RESEARCH_LEVEL, RESEARCH, type ResearchLevels, type ResearchTrack } from '../data/research';
import { UNITS, type UnitDef, type UnitKind } from '../data/units';

export type DefTable = Record<UnitKind, UnitDef>;

/**
 * Statistiche effettive di una nave per una fazione: base + dottrina + ricerca.
 * Armatura, raggio e ruolo restano quelli base.
 */
export function computeDef(kind: UnitKind, doctrine: DoctrineId | null, levels: ResearchLevels): UnitDef {
  const base = UNITS[kind];
  const mods = doctrine ? DOCTRINES[doctrine].mods : {};
  const ship = !base.structure;

  const hpMult = ship
    ? (mods.hp ?? 1) * (1 + RESEARCH.hulls.perLevel * levels.hulls)
    : 1 + RESEARCH.defense.perLevel * levels.defense;
  const speedMult = ship ? (mods.speed ?? 1) * (1 + RESEARCH.engines.perLevel * levels.engines) : 1;
  const dmgMult = ship
    ? 1 + RESEARCH.weapons.perLevel * levels.weapons
    : 1 + RESEARCH.defense.perLevel * levels.defense;

  const cost = mods.costOverride?.[kind] ?? Math.round(base.cost * (mods.costMult?.[kind] ?? 1));
  const def: UnitDef = {
    ...base,
    hp: Math.round(base.hp * hpMult),
    speed: base.speed * speedMult,
    accel: base.accel * speedMult,
    cost,
    buildTime: base.buildTime * (mods.buildTimeMult?.[kind] ?? 1),
  };
  if (base.weapon) {
    def.weapon = {
      ...base.weapon,
      damage: base.weapon.damage * dmgMult,
      range: base.weapon.range * (mods.range ?? 1),
    };
  }
  if (base.mineRate) def.mineRate = base.mineRate * (mods.mineRate ?? 1) * (1 + RESEARCH.mining.perLevel * levels.mining);
  return def;
}

export function computeTable(doctrine: DoctrineId | null, levels: ResearchLevels): DefTable {
  const out = {} as DefTable;
  for (const k of Object.keys(UNITS) as UnitKind[]) out[k] = computeDef(k, doctrine, levels);
  return out;
}

/** Costo del prossimo livello di una ricerca, oppure null se già al massimo. */
export function researchCost(doctrine: DoctrineId | null, levels: ResearchLevels, track: ResearchTrack): number | null {
  const lvl = levels[track];
  if (lvl >= MAX_RESEARCH_LEVEL) return null;
  const mult = doctrine ? (DOCTRINES[doctrine].mods.researchCost ?? 1) : 1;
  return Math.round(RESEARCH[track].costs[lvl] * mult);
}

export function researchTime(levels: ResearchLevels, track: ResearchTrack): number {
  return RESEARCH[track].times[Math.min(levels[track], MAX_RESEARCH_LEVEL - 1)];
}

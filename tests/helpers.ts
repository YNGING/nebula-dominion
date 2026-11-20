import type { DoctrineId } from '../src/data/factions';
import type { MapDef } from '../src/data/maps';
import type { UnitKind } from '../src/data/units';
import { World } from '../src/sim/World';

export function emptyMap(extra: Partial<MapDef> = {}): MapDef {
  return {
    id: 'test',
    name: 'Test',
    description: '',
    width: 3000,
    height: 3000,
    maxPlayers: 4,
    spawns: [],
    planets: [],
    fields: [],
    ...extra,
  };
}

export function sandbox(nFactions = 2, map: MapDef = emptyMap(), doctrines: (DoctrineId | null)[] = []): World {
  const factions = Array.from({ length: nFactions }, (_, i) => ({
    name: `F${i}`,
    color: 0xffffff,
    controller: 'ai' as const,
    difficulty: 'normal' as const,
    doctrine: doctrines[i] ?? null,
  }));
  return new World({ map, factions, seed: 42, startUnits: false });
}

export function run(w: World, seconds: number, until?: () => boolean): number {
  const ticks = Math.round(seconds * 20);
  for (let i = 0; i < ticks; i++) {
    w.step();
    if (until?.()) return i + 1;
  }
  return ticks;
}

/** Due gruppi si scontrano: restituisce gli HP rimasti per fazione. */
export function battle(a: [UnitKind, number], b: [UnitKind, number], seconds = 90): [number, number] {
  const w = sandbox(2);
  const spawn = (kind: UnitKind, n: number, f: number, x: number) => {
    for (let i = 0; i < n; i++) {
      const u = w.spawnUnit(kind, f, x + (i % 3) * 30, 1400 + Math.floor(i / 3) * 30 + (i % 2) * 10);
      u.order = { type: 'attackMove', x: f === 0 ? 2000 : 1000, y: 1500, targetId: -1 };
    }
  };
  spawn(a[0], a[1], 0, 1000);
  spawn(b[0], b[1], 1, 2000);
  const hp = (f: number) => w.units.filter((u) => u.faction === f).reduce((s, u) => s + u.hp, 0);
  run(w, seconds, () => hp(0) === 0 || hp(1) === 0);
  return [hp(0), hp(1)];
}

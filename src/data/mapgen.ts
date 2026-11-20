import { Rng } from '../sim/rng';
import type { FieldDef, MapDef, PlanetDef } from './maps';

// Generatore di mappe casuali simmetriche: si genera il settore di un giocatore
// e lo si replica (simmetria centrale per 2 giocatori, rotazione di 90° per 4).

export type MapSize = 'small' | 'medium' | 'large';
export type Richness = 'poor' | 'normal' | 'rich';

export interface RandomMapOptions {
  seed: number;
  players: 2 | 4;
  size: MapSize;
  richness: Richness;
}

export const SIZE_LABEL: Record<MapSize, string> = { small: 'Piccola', medium: 'Media', large: 'Grande' };
export const RICHNESS_LABEL: Record<Richness, string> = { poor: 'Scarse', normal: 'Normali', rich: 'Abbondanti' };
export const SIZES: MapSize[] = ['small', 'medium', 'large'];
export const RICHNESSES: Richness[] = ['poor', 'normal', 'rich'];

const DIMS2: Record<MapSize, [number, number]> = { small: [3600, 2200], medium: [4400, 2600], large: [5400, 3200] };
const DIMS4: Record<MapSize, number> = { small: 3400, medium: 4000, large: 4800 };
const EXTRA_PLANETS: Record<MapSize, number> = { small: 1, medium: 2, large: 3 };
const RICH_FIELDS: Record<MapSize, number> = { small: 1, medium: 1, large: 2 };
const RICHNESS: Record<Richness, { mult: number; extra: number }> = {
  poor: { mult: 0.7, extra: 0 },
  normal: { mult: 1, extra: 0 },
  rich: { mult: 1.4, extra: 1 },
};

const NAMES = [
  'Aldebaran', 'Bellatrix', 'Canopo', 'Dione', 'Enceladus', 'Fomalhaut', 'Gliese', 'Hyperion', 'Ishtar',
  'Janus', 'Kastor', 'Lacerta', 'Merope', 'Nereide', 'Oberon', 'Pandora', 'Procione', 'Rhea', 'Saiph',
  'Talitha', 'Umbriel', 'Virgo', 'Wezen', 'Xanadu', 'Ymir', 'Zaurak', 'Achernar', 'Elettra', 'Mintaka', 'Spica',
];

/** Distanze minime tra oggetti, oltre ai rispettivi raggi. */
export const GAP = {
  planetPlanet: 300,
  planetField: 120,
  fieldField: 80,
  spawnPlanet: 400,
  spawnField: 200,
  spawnSpawn: 1500,
};

type ObjKind = 'planet' | 'field' | 'spawn';
interface Obj {
  kind: ObjKind;
  x: number;
  y: number;
  /** raggio del pianeta o ampiezza del campo (0 per le basi) */
  r: number;
}

export function randomMapId(o: RandomMapOptions): string {
  return `random:${o.seed}:${o.players}:${o.size}:${o.richness}`;
}

export function parseRandomMapId(id: string): RandomMapOptions | null {
  const parts = id.split(':');
  if (parts.length !== 5 || parts[0] !== 'random') return null;
  const seed = Number(parts[1]);
  const players = Number(parts[2]);
  const size = parts[3] as MapSize;
  const richness = parts[4] as Richness;
  if (!Number.isFinite(seed) || (players !== 2 && players !== 4)) return null;
  if (!SIZES.includes(size) || !RICHNESSES.includes(richness)) return null;
  return { seed, players, size, richness };
}

function minGap(a: Obj, b: Obj): number {
  const key = [a.kind, b.kind].sort().join('-');
  switch (key) {
    case 'planet-planet':
      return a.r + b.r + GAP.planetPlanet;
    case 'field-planet':
      return a.r + b.r + GAP.planetField;
    case 'field-field':
      return a.r + b.r + GAP.fieldField;
    case 'planet-spawn':
      return a.r + b.r + GAP.spawnPlanet;
    case 'field-spawn':
      return a.r + b.r + GAP.spawnField;
    default:
      return GAP.spawnSpawn;
  }
}

/** Copie simmetriche di un punto: la k-esima appartiene al settore del giocatore k. */
export function symmetricImages(players: 2 | 4, w: number, h: number, x: number, y: number): { x: number; y: number }[] {
  if (players === 2) return [{ x, y }, { x: w - x, y: h - y }];
  const cx = w / 2;
  const cy = h / 2;
  const out: { x: number; y: number }[] = [];
  let dx = x - cx;
  let dy = y - cy;
  for (let i = 0; i < 4; i++) {
    out.push({ x: cx + dx, y: cy + dy });
    [dx, dy] = [-dy, dx];
  }
  return out;
}

export function generateMap(o: RandomMapOptions): MapDef {
  const rng = new Rng(o.seed * 7919 + o.players * 31 + SIZES.indexOf(o.size) * 7 + RICHNESSES.indexOf(o.richness));
  const [w, h] = o.players === 2 ? DIMS2[o.size] : [DIMS4[o.size], DIMS4[o.size]];
  const cx = w / 2;
  const cy = h / 2;
  const placed: Obj[] = [];
  const planets: PlanetDef[] = [];
  const fields: FieldDef[] = [];
  const names = rng.shuffle([...NAMES]);
  const rich = RICHNESS[o.richness];

  const images = (x: number, y: number) => symmetricImages(o.players, w, h, x, y);

  const inBounds = (obj: Obj): boolean => {
    // i pianeti hanno l'etichetta sotto: serve più margine in basso
    const m = obj.kind === 'planet' ? obj.r + 120 : obj.kind === 'field' ? obj.r + 60 : 300;
    const bottom = obj.kind === 'planet' ? obj.r + 150 : m;
    return obj.x >= m && obj.x <= w - m && obj.y >= m && obj.y <= h - bottom;
  };

  /** Prova a piazzare un oggetto con tutte le sue copie; true se riesce. */
  const tryPlace = (kind: ObjKind, x: number, y: number, r: number, ignore: Obj[] = []): Obj[] | null => {
    const copies = images(x, y).map((p) => ({ kind, x: p.x, y: p.y, r }));
    for (let i = 0; i < copies.length; i++) {
      const c = copies[i];
      if (!inBounds(c)) return null;
      for (const p of placed) {
        if (ignore.includes(p)) continue;
        if (Math.hypot(p.x - c.x, p.y - c.y) < minGap(c, p)) return null;
      }
      for (let j = i + 1; j < copies.length; j++) {
        if (Math.hypot(copies[j].x - c.x, copies[j].y - c.y) < minGap(c, copies[j])) return null;
      }
    }
    placed.push(...copies);
    return copies;
  };

  const addPlanet = (x: number, y: number, r: number, income: number, supply: number): boolean => {
    const copies = tryPlace('planet', x, y, r);
    if (!copies) return false;
    const style = rng.int(0, 3);
    for (const c of copies) planets.push({ name: names[planets.length % names.length], x: Math.round(c.x), y: Math.round(c.y), radius: r, income, supply, style });
    return true;
  };

  const addField = (x: number, y: number, spread: number, count: number, amount: number, ignore: Obj[] = []): boolean => {
    const copies = tryPlace('field', x, y, spread, ignore);
    if (!copies) return false;
    for (const c of copies) fields.push({ x: Math.round(c.x), y: Math.round(c.y), count: count + rich.extra, spread, amount: Math.round(amount * rich.mult) });
    return true;
  };

  /** Prova più volte a generare una posizione valida. */
  const attempt = (n: number, fn: () => boolean): boolean => {
    for (let i = 0; i < n; i++) if (fn()) return true;
    return false;
  };

  // 1. basi
  let spawn = { x: 0, y: 0 };
  attempt(50, () => {
    spawn =
      o.players === 2
        ? { x: rng.range(430, 600), y: cy + rng.range(-0.22, 0.22) * h }
        : { x: rng.range(430, 600), y: rng.range(430, 600) };
    return tryPlace('spawn', spawn.x, spawn.y, 0) !== null;
  });
  const spawnObjs = placed.filter((p) => p.kind === 'spawn');
  const toCenter = Math.atan2(cy - spawn.y, cx - spawn.x);

  // 2. centro: pianeta ricco (unico, non replicato)
  const centerR = rng.int(80, 100);
  const center: Obj = { kind: 'planet', x: cx, y: cy, r: centerR };
  placed.push(center);
  planets.push({ name: 'Cuore della Nebulosa', x: Math.round(cx), y: Math.round(cy), radius: centerR, income: Math.round(rng.range(3.5, 5) * 2) / 2, supply: 12, style: rng.int(0, 3) });

  // 3. campi di casa: garantiti (se serve si allarga la ricerca dell'angolo)
  const side = rng.next() < 0.5 ? 1 : -1;
  const homeOk = attempt(120, () => {
    const a = toCenter + side * rng.range(0.5, 1.9);
    const d = rng.range(380, 460);
    return addField(spawn.x + Math.cos(a) * d, spawn.y + Math.sin(a) * d, 130, 5, 1200);
  });
  if (!homeOk) {
    // ripiego: campo direttamente verso il centro
    addField(spawn.x + Math.cos(toCenter) * 420, spawn.y + Math.sin(toCenter) * 420, 120, 5, 1200, spawnObjs);
  }
  attempt(80, () => {
    const a = toCenter - side * rng.range(0.6, 2.0);
    const d = rng.range(470, 620);
    return addField(spawn.x + Math.cos(a) * d, spawn.y + Math.sin(a) * d, 110, 4, 1200);
  });

  // 4. pianeta "naturale" vicino alla base
  attempt(80, () => {
    const a = toCenter + rng.range(-0.6, 0.6);
    const d = rng.range(650, 880);
    return addPlanet(spawn.x + Math.cos(a) * d, spawn.y + Math.sin(a) * d, rng.int(44, 52), 1.5, 8);
  });

  // il settore del giocatore 0: metà sinistra (2 giocatori) o quadrante in alto a sinistra (4)
  const sector = (): { x: number; y: number } =>
    o.players === 2
      ? { x: rng.range(200, cx - 100), y: rng.range(200, h - 200) }
      : { x: rng.range(200, cx - 60), y: rng.range(200, cy - 60) };

  // 5. pianeti extra
  for (let i = 0; i < EXTRA_PLANETS[o.size]; i++) {
    attempt(150, () => {
      const p = sector();
      if (Math.hypot(p.x - spawn.x, p.y - spawn.y) < 900) return false;
      return addPlanet(p.x, p.y, rng.int(40, 60), Math.round(rng.range(1.5, 2.5) * 2) / 2, 8);
    });
  }

  // 6. campi ricchi lontani dalla base
  for (let i = 0; i < RICH_FIELDS[o.size]; i++) {
    attempt(150, () => {
      const p = sector();
      if (Math.hypot(p.x - spawn.x, p.y - spawn.y) < 800) return false;
      return addField(p.x, p.y, rng.range(140, 170), rng.int(5, 6), 1600);
    });
  }

  // basi in ordine: le prime due sono opposte
  const spawnImgs = images(spawn.x, spawn.y).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  const spawns = o.players === 2 ? spawnImgs : [spawnImgs[0], spawnImgs[2], spawnImgs[1], spawnImgs[3]];

  return {
    id: randomMapId(o),
    name: `Settore casuale #${o.seed}`,
    description: `Mappa ${SIZE_LABEL[o.size].toLowerCase()}, risorse ${RICHNESS_LABEL[o.richness].toLowerCase()}, ${o.players} basi.`,
    width: w,
    height: h,
    maxPlayers: o.players,
    spawns,
    planets,
    fields,
  };
}

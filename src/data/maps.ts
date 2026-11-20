import { generateMap, parseRandomMapId } from './mapgen';

// Mappe definite come dati. Gli asteroidi vengono generati attorno ai "campi" con un RNG a seme.

export interface PlanetDef {
  name: string;
  x: number;
  y: number;
  radius: number;
  /** minerali al secondo per il proprietario */
  income: number;
  /** aumento del limite flotta */
  supply: number;
  /** stile grafico 0..3 */
  style: number;
}

export interface FieldDef {
  x: number;
  y: number;
  count: number;
  spread: number;
  /** minerali per asteroide */
  amount: number;
}

export interface MapDef {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  maxPlayers: number;
  /** Punti di partenza. I primi due sono sempre ai lati opposti. */
  spawns: { x: number; y: number }[];
  planets: PlanetDef[];
  fields: FieldDef[];
}

const p = (
  name: string,
  x: number,
  y: number,
  radius: number,
  income: number,
  supply: number,
  style: number,
): PlanetDef => ({ name, x, y, radius, income, supply, style });

const f = (x: number, y: number, count: number, amount = 1200, spread = 150): FieldDef => ({
  x,
  y,
  count,
  spread,
  amount,
});

export const MAPS: MapDef[] = [
  {
    id: 'orione',
    name: 'Crocevia di Orione',
    description: 'Quattro angoli, un nucleo ricchissimo al centro. Fino a 4 giocatori.',
    width: 4000,
    height: 4000,
    maxPlayers: 4,
    spawns: [
      { x: 520, y: 520 },
      { x: 3480, y: 3480 },
      { x: 3480, y: 520 },
      { x: 520, y: 3480 },
    ],
    planets: [
      p('Vesta', 1150, 1150, 48, 1.5, 8, 0),
      p('Tethys', 2850, 2850, 48, 1.5, 8, 0),
      p('Calypso', 2850, 1150, 48, 1.5, 8, 2),
      p('Lyra', 1150, 2850, 48, 1.5, 8, 2),
      p('Arcturus', 2000, 430, 56, 2, 8, 1),
      p('Draco', 2000, 3570, 56, 2, 8, 1),
      p('Nyx', 430, 2000, 56, 2, 8, 3),
      p('Helios', 3570, 2000, 56, 2, 8, 3),
      p('Nucleo', 2000, 2000, 92, 4, 12, 1),
    ],
    fields: [
      f(950, 400, 5),
      f(400, 950, 4),
      f(3050, 3600, 5),
      f(3600, 3050, 4),
      f(3050, 400, 5),
      f(3600, 950, 4),
      f(950, 3600, 5),
      f(400, 3050, 4),
      f(2000, 1300, 6, 1600, 170),
      f(2000, 2700, 6, 1600, 170),
      f(1300, 2000, 6, 1600, 170),
      f(2700, 2000, 6, 1600, 170),
    ],
  },
  {
    id: 'gemella',
    name: 'Nebulosa Gemella',
    description: 'Mappa larga per duelli 1 contro 1. Corsa al pianeta centrale.',
    width: 4800,
    height: 2600,
    maxPlayers: 2,
    spawns: [
      { x: 500, y: 1300 },
      { x: 4300, y: 1300 },
    ],
    planets: [
      p('Kepler', 1300, 600, 50, 1.5, 8, 0),
      p('Ganimede', 1300, 2000, 50, 1.5, 8, 2),
      p('Rigel', 3500, 600, 50, 1.5, 8, 2),
      p('Deneb', 3500, 2000, 50, 1.5, 8, 0),
      p('Gemini', 2400, 1300, 84, 3.5, 12, 1),
      p('Altair', 2400, 350, 44, 2, 8, 3),
      p('Vega', 2400, 2250, 44, 2, 8, 3),
    ],
    fields: [
      f(560, 820, 5),
      f(560, 1780, 5),
      f(4240, 820, 5),
      f(4240, 1780, 5),
      f(1700, 1300, 6, 1600, 170),
      f(3100, 1300, 6, 1600, 170),
      f(2400, 800, 4, 1400),
      f(2400, 1800, 4, 1400),
    ],
  },
  {
    id: 'kepler',
    name: 'Anello di Kepler',
    description: 'Basi disposte ad anello attorno a un gigante gassoso. Fino a 4 giocatori.',
    width: 4400,
    height: 4400,
    maxPlayers: 4,
    spawns: [
      { x: 2200, y: 450 },
      { x: 2200, y: 3950 },
      { x: 3950, y: 2200 },
      { x: 450, y: 2200 },
    ],
    planets: [
      p('Titano', 2200, 2200, 100, 5, 14, 1),
      p('Io', 1250, 1250, 52, 2, 8, 0),
      p('Europa', 3150, 1250, 52, 2, 8, 3),
      p('Callisto', 3150, 3150, 52, 2, 8, 0),
      p('Elara', 1250, 3150, 52, 2, 8, 3),
      p('Mira', 2200, 1250, 40, 1.5, 8, 2),
      p('Sirio', 2200, 3150, 40, 1.5, 8, 2),
      p('Antares', 3150, 2200, 40, 1.5, 8, 2),
      p('Polaris', 1250, 2200, 40, 1.5, 8, 2),
    ],
    fields: [
      f(1750, 450, 5),
      f(2650, 450, 4),
      f(1750, 3950, 5),
      f(2650, 3950, 4),
      f(3950, 1750, 5),
      f(3950, 2650, 4),
      f(450, 1750, 5),
      f(450, 2650, 4),
      f(1700, 1700, 4, 1800, 120),
      f(2700, 1700, 4, 1800, 120),
      f(2700, 2700, 4, 1800, 120),
      f(1700, 2700, 4, 1800, 120),
    ],
  },
];

const randomCache = new Map<string, MapDef>();

/** Mappa per id: una delle mappe fisse oppure una casuale ("random:seme:giocatori:dimensione:risorse"). */
export function getMap(id: string): MapDef {
  const fixed = MAPS.find((m) => m.id === id);
  if (fixed) return fixed;
  const opts = parseRandomMapId(id);
  if (!opts) return MAPS[0];
  let map = randomCache.get(id);
  if (!map) {
    map = generateMap(opts);
    if (randomCache.size > 20) randomCache.clear();
    randomCache.set(id, map);
  }
  return map;
}

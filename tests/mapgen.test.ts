import { describe, expect, it } from 'vitest';
import { getMap } from '../src/data/maps';
import {
  GAP,
  RICHNESSES,
  SIZES,
  generateMap,
  parseRandomMapId,
  randomMapId,
  symmetricImages,
  type RandomMapOptions,
} from '../src/data/mapgen';
import { Match } from '../src/game/Match';
import { World } from '../src/sim/World';

const all: RandomMapOptions[] = [];
for (let seed = 1; seed <= 30; seed++)
  for (const players of [2, 4] as const) for (const size of SIZES) all.push({ seed, players, size, richness: 'normal' });

const near = (a: { x: number; y: number }, b: { x: number; y: number }, tol = 2) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

describe('mappe casuali', () => {
  it('rispettano bordi, distanze minime e campi vicino a ogni base', () => {
    for (const o of all) {
      const m = generateMap(o);
      const tag = randomMapId(o);
      expect(m.spawns, tag).toHaveLength(o.players);
      for (const p of m.planets) {
        expect(p.x - p.radius, tag).toBeGreaterThan(0);
        expect(p.y - p.radius, tag).toBeGreaterThan(0);
        expect(p.x + p.radius, tag).toBeLessThan(m.width);
        expect(p.y + p.radius, tag).toBeLessThan(m.height);
      }
      for (let i = 0; i < m.planets.length; i++)
        for (let j = i + 1; j < m.planets.length; j++) {
          const a = m.planets[i];
          const b = m.planets[j];
          expect(Math.hypot(a.x - b.x, a.y - b.y), tag).toBeGreaterThanOrEqual(a.radius + b.radius + GAP.planetPlanet - 1);
        }
      for (const s of m.spawns) {
        for (const p of m.planets) expect(Math.hypot(p.x - s.x, p.y - s.y), tag).toBeGreaterThanOrEqual(p.radius + GAP.spawnPlanet - 1);
        const nearest = Math.min(...m.fields.map((f) => Math.hypot(f.x - s.x, f.y - s.y)));
        expect(nearest, tag).toBeLessThan(650);
      }
      expect(Math.hypot(m.spawns[0].x - m.spawns[1].x, m.spawns[0].y - m.spawns[1].y), tag).toBeGreaterThanOrEqual(1500);
      expect(m.planets.length, tag).toBeGreaterThanOrEqual(1 + o.players * 2);
    }
  });

  it('sono simmetriche', () => {
    for (const o of all) {
      const m = generateMap(o);
      const tag = randomMapId(o);
      for (const p of m.planets) {
        for (const img of symmetricImages(o.players, m.width, m.height, p.x, p.y)) {
          expect(m.planets.some((q) => near(q, img) && q.radius === p.radius && q.income === p.income), tag).toBe(true);
        }
      }
      for (const f of m.fields) {
        for (const img of symmetricImages(o.players, m.width, m.height, f.x, f.y)) {
          expect(m.fields.some((g) => near(g, img) && g.count === f.count && g.amount === f.amount), tag).toBe(true);
        }
      }
    }
  });

  it('sono deterministiche e il loro id si legge e riscrive', () => {
    const o: RandomMapOptions = { seed: 1234, players: 4, size: 'medium', richness: 'rich' };
    expect(generateMap(o)).toEqual(generateMap(o));
    expect(generateMap(o)).not.toEqual(generateMap({ ...o, seed: 1235 }));
    expect(parseRandomMapId(randomMapId(o))).toEqual(o);
    expect(parseRandomMapId('orione')).toBeNull();
    expect(getMap(randomMapId(o)).name).toContain('#1234');
  });

  it('la ricchezza cambia i minerali disponibili', () => {
    const total = (r: (typeof RICHNESSES)[number]) =>
      generateMap({ seed: 5, players: 2, size: 'medium', richness: r }).fields.reduce((s, f) => s + f.count * f.amount, 0);
    expect(total('poor')).toBeLessThan(total('normal'));
    expect(total('normal')).toBeLessThan(total('rich'));
  });

  it('il mondo si crea e ogni base ha asteroidi vicini', () => {
    for (const o of all.slice(0, 40)) {
      const map = generateMap(o);
      const factions = map.spawns.map((_, i) => ({ name: `F${i}`, color: 0xffffff, controller: 'ai' as const, difficulty: 'normal' as const }));
      const w = new World({ map, factions, seed: 3 });
      for (const f of w.factions) {
        const m = w.mothershipOf(f.id)!;
        expect(w.asteroids.filter((a) => Math.hypot(a.x - m.x, a.y - m.y) < 700).length).toBeGreaterThanOrEqual(4);
      }
    }
  });

  const matches: [RandomMapOptions, number][] = [
    [{ seed: 11, players: 2, size: 'medium', richness: 'normal' }, 1],
    [{ seed: 22, players: 4, size: 'small', richness: 'normal' }, 3],
    [{ seed: 33, players: 2, size: 'large', richness: 'rich' }, 1],
  ];
  for (const [o, ai] of matches) {
    it(`IA contro IA su ${randomMapId(o)} si conclude`, () => {
      const match = new Match({ mapId: randomMapId(o), aiCount: ai, difficulty: 'normal', seed: 9, spectate: true });
      const w = match.world;
      while (!w.over && w.tick < 20 * 60 * 40) match.step();
      console.log(`[${randomMapId(o)}] fine dopo ${(w.tick / 1200).toFixed(1)} min, vincitore ${w.winner}`);
      expect(w.over).toBe(true);
    }, 180_000);
  }
});

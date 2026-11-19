import { describe, expect, it } from 'vitest';
import type { PlanetDef } from '../src/data/maps';
import { issueCommand } from '../src/sim/commands';
import { emptyMap, run, sandbox } from './helpers';

const planet: PlanetDef = { name: 'P', x: 1500, y: 1500, radius: 50, income: 2, supply: 8, style: 0 };

describe('conquista dei pianeti', () => {
  it('una nave conquista un pianeta neutrale in circa 12 secondi', () => {
    const w = sandbox(2, emptyMap({ planets: [planet] }));
    const s = w.spawnUnit('fighter', 0, 1500, 1420);
    s.order = { type: 'hold', x: s.x, y: s.y, targetId: -1 };
    const ticks = run(w, 30, () => w.planets[0].owner === 0);
    expect(w.planets[0].owner).toBe(0);
    expect(ticks / 20).toBeGreaterThan(10);
    expect(ticks / 20).toBeLessThan(14);
    expect(w.supplyCap(0)).toBe(20);
  });

  it('i minatori non conquistano e due fazioni presenti bloccano la barra', () => {
    const w = sandbox(2, emptyMap({ planets: [planet] }));
    const m = w.spawnUnit('miner', 0, 1500, 1420);
    m.order = { type: 'hold', x: m.x, y: m.y, targetId: -1 };
    run(w, 5);
    expect(w.planets[0].progress).toBe(0);
    const a = w.spawnUnit('support', 0, 1420, 1500);
    const b = w.spawnUnit('support', 1, 1580, 1500);
    a.order = { type: 'hold', x: a.x, y: a.y, targetId: -1 };
    b.order = { type: 'hold', x: b.x, y: b.y, targetId: -1 };
    run(w, 5);
    expect(w.planets[0].contested).toBe(true);
    expect(w.planets[0].progress).toBe(0);
  });

  it('il pianeta produce reddito e permette torrette', () => {
    const w = sandbox(1, emptyMap({ planets: [planet] }));
    w.planets[0].owner = 0;
    w.factions[0].minerals = 1000;
    expect(issueCommand(w, 0, { type: 'buildTurret', planetId: 0 })).toBeNull();
    expect(issueCommand(w, 0, { type: 'buildTurret', planetId: 0 })).toBeNull();
    expect(issueCommand(w, 0, { type: 'buildTurret', planetId: 0 })).toMatch(/Massimo/);
    run(w, 13);
    expect(w.units.filter((u) => u.kind === 'turret')).toHaveLength(1);
    expect(w.factions[0].minerals).toBeGreaterThan(700 + 2 * 12);
  });
});

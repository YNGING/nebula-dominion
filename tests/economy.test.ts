import { describe, expect, it } from 'vitest';
import { ECONOMY, UNITS } from '../src/data/units';
import { issueCommand } from '../src/sim/commands';
import { emptyMap, run, sandbox } from './helpers';

describe('economia', () => {
  it('un minatore estrae e consegna minerali alla Nave Madre', () => {
    const w = sandbox(1, emptyMap({ fields: [{ x: 1500, y: 1100, count: 1, spread: 0, amount: 500 }] }));
    w.spawnUnit('mothership', 0, 1500, 1500);
    const miner = w.spawnUnit('miner', 0, 1500, 1400);
    expect(w.sendToHarvest(miner)).toBe(true);
    const start = w.factions[0].minerals;
    run(w, 40);
    expect(w.factions[0].minerals).toBeGreaterThanOrEqual(start + 40);
    expect(w.asteroids[0].amount).toBeLessThan(500);
  });

  it('la produzione spende minerali e crea la nave dopo il tempo di costruzione', () => {
    const w = sandbox(1);
    const m = w.spawnUnit('mothership', 0, 1500, 1500);
    expect(issueCommand(w, 0, { type: 'build', structureId: m.id, kind: 'fighter' })).toBeNull();
    expect(w.factions[0].minerals).toBe(ECONOMY.startMinerals - UNITS.fighter.cost);
    run(w, UNITS.fighter.buildTime + 0.2);
    expect(w.units.filter((u) => u.kind === 'fighter')).toHaveLength(1);
  });

  it('rifiuta la produzione senza minerali o oltre il limite flotta', () => {
    const w = sandbox(1);
    const m = w.spawnUnit('mothership', 0, 1500, 1500);
    w.factions[0].minerals = 10;
    expect(issueCommand(w, 0, { type: 'build', structureId: m.id, kind: 'fighter' })).toMatch(/Minerali/);
    w.factions[0].minerals = 10000;
    expect(issueCommand(w, 0, { type: 'build', structureId: m.id, kind: 'battleship' })).toBeNull();
    expect(issueCommand(w, 0, { type: 'build', structureId: m.id, kind: 'battleship' })).toBeNull();
    // 12 di supply base: la terza Corazzata (5) non ci sta
    expect(issueCommand(w, 0, { type: 'build', structureId: m.id, kind: 'battleship' })).toMatch(/flotta/);
  });

  it('annullare la produzione rimborsa il costo', () => {
    const w = sandbox(1);
    const m = w.spawnUnit('mothership', 0, 1500, 1500);
    issueCommand(w, 0, { type: 'build', structureId: m.id, kind: 'frigate' });
    issueCommand(w, 0, { type: 'cancel', structureId: m.id, index: 0 });
    expect(w.factions[0].minerals).toBe(ECONOMY.startMinerals);
  });
});

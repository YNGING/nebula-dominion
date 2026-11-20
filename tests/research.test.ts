import { describe, expect, it } from 'vitest';
import { ECONOMY, UNITS } from '../src/data/units';
import { issueCommand } from '../src/sim/commands';
import { computeDef, researchCost } from '../src/sim/stats';
import { emptyLevels } from '../src/data/research';
import { run, sandbox } from './helpers';

describe('dottrine', () => {
  it('senza dottrina e ricerca le statistiche sono quelle base', () => {
    const d = computeDef('frigate', null, emptyLevels());
    expect(d.hp).toBe(UNITS.frigate.hp);
    expect(d.speed).toBe(UNITS.frigate.speed);
    expect(d.weapon!.damage).toBe(UNITS.frigate.weapon!.damage);
    expect(d.cost).toBe(UNITS.frigate.cost);
  });

  it('applica i modificatori di ogni dottrina', () => {
    const lv = emptyLevels();
    expect(computeDef('miner', 'engineering', lv).mineRate).toBeCloseTo(UNITS.miner.mineRate! * 1.3);
    expect(computeDef('turret', 'engineering', lv).cost).toBe(Math.round(UNITS.turret.cost * 0.7));
    expect(computeDef('frigate', 'armor', lv).hp).toBe(Math.round(UNITS.frigate.hp * 1.15));
    expect(computeDef('battleship', 'armor', lv).buildTime).toBeCloseTo(UNITS.battleship.buildTime * 0.8);
    expect(computeDef('fighter', 'swarm', lv).cost).toBe(50);
    expect(computeDef('battleship', 'arsenal', lv).weapon!.range).toBeCloseTo(UNITS.battleship.weapon!.range * 1.15);
    expect(researchCost('arsenal', lv, 'weapons')).toBe(Math.round(150 * 0.7));
    // le strutture non subiscono i modificatori di scafo delle navi
    expect(computeDef('mothership', 'armor', lv).hp).toBe(UNITS.mothership.hp);
  });

  it('il costo pagato in produzione dipende dalla dottrina', () => {
    const w = sandbox(1, undefined, ['swarm']);
    const m = w.spawnUnit('mothership', 0, 1500, 1500);
    issueCommand(w, 0, { type: 'build', structureId: m.id, kind: 'fighter' });
    expect(w.factions[0].minerals).toBe(ECONOMY.startMinerals - 50);
  });
});

describe('ricerca', () => {
  it('spende minerali, dura il tempo previsto e alza il livello', () => {
    const w = sandbox(1);
    w.spawnUnit('mothership', 0, 1500, 1500);
    const f = w.factions[0];
    f.minerals = 1000;
    expect(issueCommand(w, 0, { type: 'research', track: 'weapons' })).toBeNull();
    expect(f.minerals).toBe(850);
    expect(issueCommand(w, 0, { type: 'research', track: 'hulls' })).toMatch(/già in corso/);
    run(w, 29);
    expect(f.research.weapons).toBe(0);
    run(w, 1.5);
    expect(f.research.weapons).toBe(1);
    expect(w.def(0, 'fighter').weapon!.damage).toBeCloseTo(UNITS.fighter.weapon!.damage * 1.1);
  });

  it('annullare rimborsa e il livello massimo è 3', () => {
    const w = sandbox(1);
    w.spawnUnit('mothership', 0, 1500, 1500);
    const f = w.factions[0];
    f.minerals = 5000;
    issueCommand(w, 0, { type: 'research', track: 'engines' });
    issueCommand(w, 0, { type: 'cancelResearch' });
    expect(f.minerals).toBe(5000);
    f.research.engines = 3;
    expect(issueCommand(w, 0, { type: 'research', track: 'engines' })).toMatch(/massimo/);
  });

  it('Scafi aggiorna gli hp delle navi già in campo', () => {
    const w = sandbox(1);
    w.spawnUnit('mothership', 0, 1500, 1500);
    const fr = w.spawnUnit('frigate', 0, 1000, 1000);
    fr.hp = 100;
    w.factions[0].minerals = 1000;
    issueCommand(w, 0, { type: 'research', track: 'hulls' });
    run(w, 31);
    expect(fr.maxHp).toBe(Math.round(UNITS.frigate.hp * 1.1));
    expect(fr.hp).toBeCloseTo(100 + (fr.maxHp - UNITS.frigate.hp), 0);
  });

  it('senza Nave Madre non si ricerca', () => {
    const w = sandbox(1);
    w.factions[0].minerals = 1000;
    expect(issueCommand(w, 0, { type: 'research', track: 'mining' })).toMatch(/Nave Madre/);
  });
});

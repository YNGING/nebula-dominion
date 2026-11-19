import { describe, expect, it } from 'vitest';
import { UNITS } from '../src/data/units';
import { battle, run, sandbox } from './helpers';

describe('combattimento', () => {
  it('i Caccia battono una Corazzata a parità di costo', () => {
    const [fighters, battleship] = battle(['fighter', 6], ['battleship', 1]);
    expect(fighters).toBeGreaterThan(0);
    expect(battleship).toBe(0);
  });

  it('le Fregate battono i Caccia a parità di costo', () => {
    const [frigates, fighters] = battle(['frigate', 3], ['fighter', 6]);
    expect(frigates).toBeGreaterThan(0);
    expect(fighters).toBe(0);
  });

  it('la Corazzata batte le Fregate a parità di costo', () => {
    const [battleship, frigates] = battle(['battleship', 1], ['frigate', 3]);
    expect(battleship).toBeGreaterThan(0);
    expect(frigates).toBe(0);
  });

  it('applica i moltiplicatori di armatura', () => {
    const w = sandbox(2);
    const a = w.spawnUnit('battleship', 0, 1000, 1000);
    const b = w.spawnUnit('frigate', 1, 1200, 1000);
    a.cooldown = 0;
    // un colpo di cannone su armatura media: 60 * 1.6
    run(w, 1.5, () => b.hp < b.maxHp);
    expect(b.maxHp - b.hp).toBeCloseTo(60 * UNITS.battleship.weapon!.mult.medium, 5);
  });

  it('la distruzione della Nave Madre elimina la fazione e chiude la partita', () => {
    const w = sandbox(2);
    const m = w.spawnUnit('mothership', 1, 1500, 1500);
    w.spawnUnit('fighter', 1, 400, 400);
    w.damage(m, 99999, 0);
    w.step();
    expect(w.factions[1].alive).toBe(false);
    expect(w.units.some((u) => u.faction === 1)).toBe(false);
    expect(w.over).toBe(true);
    expect(w.winner).toBe(0);
  });

  it('la Nave Supporto ripara gli alleati', () => {
    const w = sandbox(1);
    const f = w.spawnUnit('frigate', 0, 1000, 1000);
    f.hp = 50;
    w.spawnUnit('support', 0, 1060, 1000);
    run(w, 5);
    expect(f.hp).toBeGreaterThan(110);
  });
});

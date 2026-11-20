import { describe, expect, it } from 'vitest';
import { UNITS } from '../src/data/units';
import { randomMapId } from '../src/data/mapgen';
import { Match } from '../src/game/Match';
import { SURVIVAL_PARAMS, waveBudget, waveComposition } from '../src/game/modes/SurvivalController';
import { sandbox } from './helpers';

const mapId = randomMapId({ seed: 4242, players: 2, size: 'medium', richness: 'normal' });

describe('sopravvivenza', () => {
  it('crea il giocatore con la Nave Madre e gli invasori senza', () => {
    const m = new Match({ mapId, aiCount: 0, difficulty: 'normal', mode: 'survival', seed: 1 });
    const w = m.world;
    expect(w.factions).toHaveLength(2);
    expect(w.mothershipOf(0)).not.toBeNull();
    expect(w.mothershipOf(1)).toBeNull();
    expect(w.factions[1].invader).toBe(true);
    for (let i = 0; i < 100; i++) m.step();
    expect(w.over).toBe(false);
    expect(m.ais).toHaveLength(0);
  });

  it('le ondate crescono e i tipi di nave si sbloccano', () => {
    let prev = 0;
    for (let n = 1; n <= 20; n++) {
      const b = waveBudget(n, 1);
      expect(b).toBeGreaterThan(prev);
      prev = b;
    }
    const rand = () => 0.5;
    const w1 = waveComposition(1, 1, rand);
    expect(w1.every((k) => k === 'fighter')).toBe(true);
    expect(waveComposition(5, 1, rand)).toContain('battleship');
    const supply = (ks: string[]) => ks.reduce((s, k) => s + UNITS[k as keyof typeof UNITS].supply, 0);
    expect(supply(waveComposition(7, 1, Math.random))).toBe(waveBudget(7, 1));
  });

  it('la prima ondata parte in tempo e punta al giocatore', () => {
    const m = new Match({ mapId, aiCount: 0, difficulty: 'normal', mode: 'survival', seed: 2 });
    const w = m.world;
    const first = SURVIVAL_PARAMS.normal.firstWave * 20;
    while (w.tick < first - 2) m.step();
    expect(w.units.some((u) => u.faction === 1)).toBe(false);
    const events: string[] = [];
    while (w.tick < first + 2) {
      m.step();
      events.push(...w.events.map((e) => e.t));
    }
    expect(events).toContain('wave');
    const inv = w.units.filter((u) => u.faction === 1);
    expect(inv.length).toBeGreaterThan(0);
    expect(inv.every((u) => u.order.type === 'attackMove')).toBe(true);
    expect(m.survival!.wave).toBe(1);
  });

  it('la partita finisce solo con la sconfitta del giocatore', () => {
    const m = new Match({ mapId, aiCount: 0, difficulty: 'hard', mode: 'survival', seed: 3, spectate: true });
    const w = m.world;
    // con il giocatore guidato dall'IA, la sopravvivenza dura parecchie ondate
    expect(m.ais).toHaveLength(1);
    while (!w.over && w.tick < 20 * 60 * 60) m.step();
    console.log(`[sopravvivenza difficile, IA] fine dopo ${(w.tick / 1200).toFixed(1)} min all'ondata ${m.survival!.wave}`);
    expect(w.over).toBe(true);
    expect(w.winner).toBeNull();
    expect(m.survival!.wave).toBeGreaterThanOrEqual(5);
  }, 300_000);

  it('le fazioni della stessa squadra non sono nemiche', () => {
    const w = sandbox(3);
    w.factions[1].team = 0;
    expect(w.isEnemy(0, 1)).toBe(false);
    expect(w.isEnemy(0, 2)).toBe(true);
    const a = w.spawnUnit('fighter', 0, 1000, 1000);
    w.spawnUnit('fighter', 1, 1040, 1000);
    for (let i = 0; i < 40; i++) w.step();
    expect(a.hp).toBe(a.maxHp);
  });
});

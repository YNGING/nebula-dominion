import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/data/maps';
import { Match } from '../src/game/Match';

describe('IA contro IA', () => {
  for (const map of MAPS) {
    it(`la partita su "${map.name}" si conclude con un vincitore`, () => {
      const match = new Match({ mapId: map.id, aiCount: 1, difficulty: 'normal', seed: 7, spectate: true });
      const w = match.world;
      const maxTicks = 20 * 60 * 30;
      let peakUnits = 0;
      while (!w.over && w.tick < maxTicks) {
        match.step();
        peakUnits = Math.max(peakUnits, w.units.length);
      }
      const minutes = (w.tick / 20 / 60).toFixed(1);
      const summary = w.factions.map((f) => `${f.name}: estratti ${Math.round(f.stats.mined)}, costruite ${f.stats.built}, perse ${f.stats.lost}, pianeti ${f.stats.planetsCaptured}`);
      console.log(`[${map.name}] fine dopo ${minutes} min, vincitore ${w.winner}, picco unità ${peakUnits}\n  ${summary.join('\n  ')}`);
      expect(w.over).toBe(true);
      expect(w.winner).not.toBeNull();
    }, 120_000);
  }
});

import { describe, expect, it } from 'vitest';
import { THEMES, bpmFor, chordNotes, noteFreq, smoothIntensity, stepDuration } from '../src/render/musicTheory';

describe('teoria musicale', () => {
  it('converte le note MIDI in frequenze', () => {
    expect(noteFreq(69)).toBeCloseTo(440);
    expect(noteFreq(81)).toBeCloseTo(880);
    expect(noteFreq(60)).toBeCloseTo(261.63, 1);
  });

  it('costruisce gli accordi', () => {
    expect(chordNotes({ root: 57, quality: 'min' })).toEqual([57, 60, 64]);
    expect(chordNotes({ root: 48, quality: 'maj7' }, 1)).toEqual([60, 64, 67, 71]);
  });

  it("l'intensità resta tra 0 e 1, sale in fretta e scende piano", () => {
    let v = 0;
    for (let i = 0; i < 20; i++) v = smoothIntensity(v, 5, 0.1);
    expect(v).toBeLessThanOrEqual(1);
    expect(v).toBeGreaterThan(0.8);
    const up = smoothIntensity(0, 1, 1);
    const down = 1 - smoothIntensity(1, 0, 1);
    expect(up).toBeGreaterThan(down * 3);
    expect(smoothIntensity(0.2, -3, 100)).toBe(0);
  });

  it('i temi hanno progressioni e tempi validi', () => {
    for (const [name, th] of Object.entries(THEMES)) {
      expect(th.progression.length, name).toBeGreaterThanOrEqual(2);
      expect(th.minBpm, name).toBeGreaterThan(40);
      expect(th.maxBpm, name).toBeGreaterThanOrEqual(th.minBpm);
      for (const c of th.progression) expect(noteFreq(c.root - 12), name).toBeGreaterThan(40);
      expect(stepDuration(bpmFor(th, 1)), name).toBeGreaterThan(0.1);
    }
    expect(bpmFor(THEMES.game, 1)).toBeGreaterThan(bpmFor(THEMES.game, 0));
  });
});

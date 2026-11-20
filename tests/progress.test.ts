import { describe, expect, it } from 'vitest';
import { emptyProgress, isUnlocked, loadProgress, recordWin, saveProgress } from '../src/game/missions/progress';

function memStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), data };
}

describe('avanzamento della campagna', () => {
  it('sblocca le missioni in sequenza e tiene il miglior tempo', () => {
    let p = emptyProgress();
    expect(isUnlocked(p, 0)).toBe(true);
    expect(isUnlocked(p, 1)).toBe(false);
    p = recordWin(p, 0, 'tutorial', 5000);
    expect(isUnlocked(p, 1)).toBe(true);
    p = recordWin(p, 0, 'tutorial', 6000);
    expect(p.best.tutorial).toBe(5000);
    p = recordWin(p, 0, 'tutorial', 4000);
    expect(p.best.tutorial).toBe(4000);
    expect(p.unlocked).toBe(1);
  });

  it('salva, ricarica e ignora i dati corrotti', () => {
    const store = memStore();
    saveProgress(recordWin(emptyProgress(), 2, 'testa-di-ponte', 100), store);
    expect(loadProgress(store)).toEqual({ unlocked: 3, best: { 'testa-di-ponte': 100 } });
    expect(loadProgress(memStore({ 'nd-campaign': '{rotto' }))).toEqual(emptyProgress());
    expect(loadProgress(memStore({ 'nd-campaign': '{"unlocked":"x","best":{"a":-3}}' }))).toEqual(emptyProgress());
  });
});

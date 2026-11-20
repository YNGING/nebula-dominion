import { describe, expect, it } from 'vitest';
import { emptyProgress, loadProgress, recordWin, saveProgress } from '../src/game/missions/progress';

function memStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), data };
}

describe('avanzamento della campagna', () => {
  it('tiene il miglior tempo di ogni missione, in qualsiasi ordine', () => {
    let p = emptyProgress();
    p = recordWin(p, 'dominio', 9000);
    p = recordWin(p, 'tutorial', 5000);
    p = recordWin(p, 'tutorial', 6000);
    expect(p.best.tutorial).toBe(5000);
    p = recordWin(p, 'tutorial', 4000);
    expect(p.best).toEqual({ dominio: 9000, tutorial: 4000 });
  });

  it('salva, ricarica e ignora i dati corrotti', () => {
    const store = memStore();
    saveProgress(recordWin(emptyProgress(), 'testa-di-ponte', 100), store);
    expect(loadProgress(store)).toEqual({ best: { 'testa-di-ponte': 100 } });
    expect(loadProgress(memStore({ 'nd-campaign': '{rotto' }))).toEqual(emptyProgress());
    expect(loadProgress(memStore({ 'nd-campaign': '{"best":{"a":-3,"b":"x"}}' }))).toEqual(emptyProgress());
  });

  it('legge i salvataggi del vecchio formato (con lo sblocco) conservando i tempi', () => {
    const old = memStore({ 'nd-campaign': '{"unlocked":2,"best":{"tutorial":4200,"minerali":7000}}' });
    expect(loadProgress(old)).toEqual({ best: { tutorial: 4200, minerali: 7000 } });
  });
});

import type { Difficulty } from '../data/factions';

// Record della sopravvivenza, salvati nel browser (localStorage) per difficoltà.

export interface SurvivalRecord {
  wave: number;
  /** tick di gioco resistiti */
  ticks: number;
}

const KEY = 'nd-survival-records';

function load(): Partial<Record<Difficulty, SurvivalRecord>> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<Difficulty, SurvivalRecord>>;
  } catch {
    return {};
  }
}

export function getSurvivalRecord(d: Difficulty): SurvivalRecord | null {
  const r = load()[d];
  return r && Number.isFinite(r.wave) ? r : null;
}

/** Registra un risultato; restituisce true se è un nuovo record (più ondate, o stesse ondate in più tempo). */
export function submitSurvivalRecord(d: Difficulty, wave: number, ticks: number): boolean {
  const all = load();
  const prev = all[d];
  const better = !prev || wave > prev.wave || (wave === prev.wave && ticks > prev.ticks);
  if (!better) return false;
  all[d] = { wave, ticks };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage non disponibile */
  }
  return true;
}

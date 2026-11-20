// Avanzamento della campagna: missioni completate e miglior tempo, salvati nel browser.
// Tutte le missioni sono giocabili in qualsiasi ordine.

export interface CampaignProgress {
  /** miglior tempo (tick) per id di missione completata */
  best: Record<string, number>;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const KEY = 'nd-campaign';

function defaultStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function emptyProgress(): CampaignProgress {
  return { best: {} };
}

/** Carica l'avanzamento; i campi sconosciuti (es. il vecchio `unlocked`) vengono ignorati. */
export function loadProgress(store: Store | null = defaultStore()): CampaignProgress {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return emptyProgress();
    const p = JSON.parse(raw) as Partial<CampaignProgress>;
    const best: Record<string, number> = {};
    if (p.best && typeof p.best === 'object') {
      for (const [k, v] of Object.entries(p.best)) if (Number.isFinite(Number(v)) && Number(v) > 0) best[k] = Number(v);
    }
    return { best };
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(p: CampaignProgress, store: Store | null = defaultStore()): void {
  try {
    store?.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage non disponibile */
  }
}

/** Registra una vittoria aggiornando il miglior tempo. */
export function recordWin(p: CampaignProgress, missionId: string, ticks: number): CampaignProgress {
  const best = { ...p.best };
  if (!best[missionId] || ticks < best[missionId]) best[missionId] = ticks;
  return { best };
}

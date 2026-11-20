// Avanzamento della campagna: missioni sbloccate e miglior tempo, salvati nel browser.

export interface CampaignProgress {
  /** indice dell'ultima missione sbloccata (0 = solo il tutorial) */
  unlocked: number;
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
  return { unlocked: 0, best: {} };
}

export function loadProgress(store: Store | null = defaultStore()): CampaignProgress {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return emptyProgress();
    const p = JSON.parse(raw) as Partial<CampaignProgress>;
    const unlocked = Number.isFinite(Number(p.unlocked)) ? Math.max(0, Math.floor(Number(p.unlocked))) : 0;
    const best: Record<string, number> = {};
    if (p.best && typeof p.best === 'object') {
      for (const [k, v] of Object.entries(p.best)) if (Number.isFinite(Number(v)) && Number(v) > 0) best[k] = Number(v);
    }
    return { unlocked, best };
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

/** La missione `index` è giocabile se è la prima o la precedente è stata completata. */
export function isUnlocked(p: CampaignProgress, index: number): boolean {
  return index <= p.unlocked;
}

/** Registra una vittoria: sblocca la missione successiva e aggiorna il miglior tempo. */
export function recordWin(p: CampaignProgress, index: number, missionId: string, ticks: number): CampaignProgress {
  const best = { ...p.best };
  if (!best[missionId] || ticks < best[missionId]) best[missionId] = ticks;
  return { unlocked: Math.max(p.unlocked, index + 1), best };
}

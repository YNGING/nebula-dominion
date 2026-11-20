// Impostazioni grafiche salvate nel browser.

export type GfxQuality = 'high' | 'low';

const KEY = 'nd-gfx';

function load(): GfxQuality {
  try {
    return localStorage.getItem(KEY) === 'low' ? 'low' : 'high';
  } catch {
    return 'high';
  }
}

export const gfx = {
  quality: load(),
  set(q: GfxQuality): void {
    this.quality = q;
    try {
      localStorage.setItem(KEY, q);
    } catch {
      /* storage non disponibile */
    }
  },
  /** scie, fumo e lampi di sparo */
  get rich(): boolean {
    return this.quality === 'high';
  },
};

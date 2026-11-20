// Ricerca: 5 linee con 3 livelli ciascuna, svolte dalla Nave Madre in una corsia separata dalla produzione.

export type ResearchTrack = 'weapons' | 'hulls' | 'engines' | 'mining' | 'defense';

export interface ResearchDef {
  track: ResearchTrack;
  name: string;
  description: string;
  /** effetto per livello, come frazione (0.1 = +10%) */
  perLevel: number;
  costs: number[];
  /** secondi per livello */
  times: number[];
}

export const MAX_RESEARCH_LEVEL = 3;

const COSTS = [150, 250, 350];
const TIMES = [30, 40, 50];

export const RESEARCH: Record<ResearchTrack, ResearchDef> = {
  weapons: {
    track: 'weapons',
    name: 'Armi',
    description: 'Danno delle armi di tutte le navi',
    perLevel: 0.1,
    costs: COSTS,
    times: TIMES,
  },
  hulls: {
    track: 'hulls',
    name: 'Scafi',
    description: 'Punti scafo di tutte le navi (anche quelle già in campo)',
    perLevel: 0.1,
    costs: COSTS,
    times: TIMES,
  },
  engines: {
    track: 'engines',
    name: 'Motori',
    description: 'Velocità e accelerazione di tutte le navi',
    perLevel: 0.08,
    costs: COSTS,
    times: TIMES,
  },
  mining: {
    track: 'mining',
    name: 'Estrazione',
    description: 'Velocità di estrazione dei Minatori',
    perLevel: 0.15,
    costs: COSTS,
    times: TIMES,
  },
  defense: {
    track: 'defense',
    name: 'Difese',
    description: 'Danno e resistenza di torrette e Nave Madre',
    perLevel: 0.15,
    costs: COSTS,
    times: TIMES,
  },
};

/** Ordine dei pulsanti nell'HUD (tasti rapidi Shift + Q W E R T). */
export const RESEARCH_ORDER: ResearchTrack[] = ['weapons', 'hulls', 'engines', 'mining', 'defense'];

export type ResearchLevels = Record<ResearchTrack, number>;

export function emptyLevels(): ResearchLevels {
  return { weapons: 0, hulls: 0, engines: 0, mining: 0, defense: 0 };
}

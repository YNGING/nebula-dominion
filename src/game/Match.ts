import { AIController } from '../ai/AIController';
import { FACTION_STYLES, type Difficulty } from '../data/factions';
import { getMap } from '../data/maps';
import { World } from '../sim/World';

export interface MatchConfig {
  mapId: string;
  aiCount: number;
  difficulty: Difficulty;
  seed?: number;
  /** solo IA (simulazioni di bilanciamento) */
  spectate?: boolean;
}

/** Una partita: il mondo simulato più i controller delle fazioni IA. */
export class Match {
  readonly world: World;
  readonly ais: AIController[];
  readonly humanId: number;

  constructor(readonly config: MatchConfig) {
    const map = getMap(config.mapId);
    const n = Math.min(map.maxPlayers, config.aiCount + 1);
    const factions = Array.from({ length: n }, (_, i) => ({
      name: i === 0 && !config.spectate ? 'Tu' : FACTION_STYLES[i].name,
      color: FACTION_STYLES[i].color,
      controller: (i === 0 && !config.spectate ? 'human' : 'ai') as 'human' | 'ai',
      difficulty: config.difficulty,
    }));
    this.world = new World({ map, factions, seed: config.seed ?? (Date.now() & 0x7fffffff) });
    this.humanId = config.spectate ? -1 : 0;
    this.ais = this.world.factions.filter((f) => f.controller === 'ai').map((f) => new AIController(this.world, f.id));
  }

  step(): void {
    for (const ai of this.ais) ai.update();
    this.world.step();
  }
}

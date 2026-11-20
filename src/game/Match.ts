import { AIController } from '../ai/AIController';
import { DOCTRINE_ORDER, FACTION_STYLES, INVADER_STYLE, type Difficulty, type DoctrineId } from '../data/factions';
import { getMap } from '../data/maps';
import { Rng } from '../sim/rng';
import { World, type FactionSetup } from '../sim/World';
import { getMission } from './missions/campaign';
import { MissionController } from './missions/MissionController';
import { SurvivalController } from './modes/SurvivalController';

export type GameMode = 'skirmish' | 'survival' | 'mission';

export interface MatchConfig {
  mapId: string;
  aiCount: number;
  difficulty: Difficulty;
  seed?: number;
  /** solo IA (simulazioni di bilanciamento) */
  spectate?: boolean;
  /** dottrina del giocatore; le IA ne ricevono una casuale */
  doctrine?: DoctrineId;
  /** predefinita: schermaglia */
  mode?: GameMode;
  /** id della missione (modalità 'mission') */
  missionId?: string;
}

/** Una partita: il mondo simulato più i controller (IA, ondate). */
export class Match {
  readonly world: World;
  readonly ais: AIController[];
  readonly humanId: number;
  readonly mode: GameMode;
  readonly survival: SurvivalController | null = null;
  readonly mission: MissionController | null = null;

  constructor(readonly config: MatchConfig) {
    this.mode = config.mode ?? 'skirmish';
    if (this.mode === 'mission') {
      const def = getMission(config.missionId ?? '');
      this.world = new World({
        map: def.map(),
        factions: def.factions,
        seed: config.seed ?? def.seed,
        scripted: true,
        spawnOrder: def.spawnOrder,
        rules: def.rules,
      });
      this.humanId = config.spectate ? -1 : 0;
      this.ais = this.world.factions
        .filter((f) => f.controller === 'ai' && !f.invader && !f.noBase)
        .map((f) => new AIController(this.world, f.id));
      this.mission = new MissionController(this.world, def);
      this.mission.start();
      return;
    }
    const map = getMap(config.mapId);
    const seed = config.seed ?? (Date.now() & 0x7fffffff);
    const doctrineRng = new Rng(seed ^ 0x5eed);
    const human = !config.spectate;
    const player = (i: number): FactionSetup => ({
      name: i === 0 && human ? 'Tu' : FACTION_STYLES[i].name,
      color: FACTION_STYLES[i].color,
      controller: i === 0 && human ? 'human' : 'ai',
      difficulty: config.difficulty,
      doctrine: i === 0 && human && config.doctrine ? config.doctrine : doctrineRng.pick(DOCTRINE_ORDER),
    });

    let factions: FactionSetup[];
    if (this.mode === 'survival') {
      factions = [
        player(0),
        {
          name: INVADER_STYLE.name,
          color: INVADER_STYLE.color,
          controller: 'ai',
          difficulty: config.difficulty,
          doctrine: null,
          invader: true,
        },
      ];
    } else {
      const n = Math.min(map.maxPlayers, config.aiCount + 1);
      factions = Array.from({ length: n }, (_, i) => player(i));
    }

    this.world = new World({ map, factions, seed, endless: this.mode === 'survival' });
    this.humanId = human ? 0 : -1;
    // gli invasori non hanno un'IA strategica: li guida il controller delle ondate
    this.ais = this.world.factions
      .filter((f) => f.controller === 'ai' && !f.invader)
      .map((f) => new AIController(this.world, f.id));
    if (this.mode === 'survival') this.survival = new SurvivalController(this.world, 1, 0, config.difficulty);
  }

  step(): void {
    if (this.world.over) return;
    this.world.events.length = 0;
    for (const ai of this.ais) ai.update();
    this.survival?.update();
    this.mission?.update();
    this.world.step(true);
  }
}

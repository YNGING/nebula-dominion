import type { MapDef } from '../../data/maps';
import type { UnitKind } from '../../data/units';
import type { FactionSetup, WorldRules } from '../../sim/World';
import type { MissionController } from './MissionController';

export type ObjectiveStatus = 'active' | 'done' | 'failed';

export interface Objective {
  id: string;
  text: string;
  status: ObjectiveStatus;
  /** testo di avanzamento, es. "1240/2000" */
  progress?: string;
  /** facoltativo: non serve per vincere */
  optional?: boolean;
}

/** Aree dell'HUD che il tutorial può evidenziare. */
export type HighlightArea = 'card' | 'minimap' | 'resources' | 'panel' | null;

/** Ciò che la missione può sapere dell'interfaccia (fornito da GameScene, finto nei test). */
export interface MissionUI {
  selectedKinds(): UnitKind[];
  /** pixel di mondo percorsi dalla camera dall'inizio */
  cameraTravel(): number;
}

export interface MissionDef {
  id: string;
  title: string;
  subtitle: string;
  briefing: string[];
  map: () => MapDef;
  seed: number;
  /** la fazione 0 è il giocatore */
  factions: FactionSetup[];
  spawnOrder?: number[];
  rules?: WorldRules;
  setup(ctx: MissionController): void;
  update(ctx: MissionController): void;
}

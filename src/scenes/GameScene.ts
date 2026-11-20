import Phaser from 'phaser';
import { RESEARCH, type ResearchTrack } from '../data/research';
import type { UnitKind } from '../data/units';
import { randomMapId } from '../data/mapgen';
import { getMap } from '../data/maps';
import { Match, type MatchConfig } from '../game/Match';
import { getSurvivalRecord, submitSurvivalRecord, type SurvivalRecord } from '../game/records';
import { CAMPAIGN, missionIndex } from '../game/missions/campaign';
import { loadProgress, recordWin, saveProgress } from '../game/missions/progress';
import { InputController } from '../input/InputController';
import { sfx } from '../render/audio';
import { music } from '../render/music';
import { WorldRenderer } from '../render/WorldRenderer';
import { issueCommand, type Command } from '../sim/commands';
import { DT, type GameEvent, type Unit } from '../sim/types';
import type { World } from '../sim/World';
import type { HudScene } from './HudScene';

export const SPEEDS = [0.5, 1, 1.5, 2, 3];

export class GameScene extends Phaser.Scene {
  match!: Match;
  world!: World;
  view!: WorldRenderer;
  controls!: InputController;
  hud: HudScene | null = null;
  humanId = 0;
  config!: MatchConfig;

  selection = new Set<number>();
  selectedPlanet = -1;
  groups = new Map<number, number[]>();
  paused = false;
  speedIndex = 1;
  /** esito della sopravvivenza, calcolato a fine partita */
  survivalResult: { wave: number; ticks: number; isRecord: boolean; record: SurvivalRecord | null } | null = null;
  /** esito della missione: id della missione successiva (offerta dopo una vittoria) */
  missionResult: { won: boolean; reason: string; nextId: string | null } | null = null;
  private cameraTravel = 0;
  private lastScroll = { x: 0, y: 0 };
  private acc = 0;
  private overHandled = false;

  constructor() {
    super('Game');
  }

  init(config: MatchConfig): void {
    this.config = config;
    this.selection = new Set();
    this.selectedPlanet = -1;
    this.groups = new Map();
    this.paused = false;
    this.speedIndex = 1;
    this.acc = 0;
    this.overHandled = false;
    this.hud = null;
    this.survivalResult = null;
    this.missionResult = null;
    this.cameraTravel = 0;
  }

  create(): void {
    this.match = new Match(this.config);
    this.world = this.match.world;
    this.humanId = this.match.humanId;
    this.view = new WorldRenderer(this, this.world, this.humanId);

    const cam = this.cameras.main;
    cam.setBounds(-500, -500, this.world.width + 1000, this.world.height + 1000);
    cam.setZoom(0.85);
    const m = this.mothership();
    const first = this.world.units.find((u) => u.faction === this.humanId);
    if (m) cam.centerOn(m.x, m.y);
    else if (first) cam.centerOn(first.x + 300, first.y);
    else cam.centerOn(this.world.width / 2, this.world.height / 2);

    this.controls = new InputController(this);
    music.setTheme('game');
    this.lastScroll = { x: cam.scrollX, y: cam.scrollY };
    if (this.match.mission) {
      this.match.mission.ui = {
        selectedKinds: () => this.ownSelected().map((u) => u.kind),
        cameraTravel: () => this.cameraTravel,
      };
    }
    this.scene.launch('Hud');
    this.scene.bringToTop('Hud');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.controls.destroy());
  }

  get speed(): number {
    return SPEEDS[this.speedIndex];
  }

  mothership(): Unit | null {
    return this.humanId >= 0 ? this.world.mothershipOf(this.humanId) : null;
  }

  /** Unità selezionate ancora vive. */
  selectedUnits(): Unit[] {
    const out: Unit[] = [];
    for (const id of this.selection) {
      const u = this.world.unit(id);
      if (u && this.view.isVisible(u)) out.push(u);
      else this.selection.delete(id);
    }
    return out;
  }

  ownSelected(): Unit[] {
    return this.selectedUnits().filter((u) => u.faction === this.humanId);
  }

  select(ids: number[], add = false): void {
    if (!add) this.selection.clear();
    for (const id of ids) this.selection.add(id);
    this.selectedPlanet = -1;
  }

  selectPlanet(id: number): void {
    this.selection.clear();
    this.selectedPlanet = id;
  }

  issue(cmd: Command, silentError = false): string | null {
    if (this.humanId < 0) return null;
    const err = issueCommand(this.world, this.humanId, cmd);
    if (err && !silentError) {
      this.hud?.message(err, '#ff8a80');
      sfx.play('error');
    }
    return err;
  }

  build(kind: UnitKind): void {
    const m = this.mothership();
    if (!m) return;
    if (!this.issue({ type: 'build', structureId: m.id, kind })) sfx.play('click');
  }

  research(track: ResearchTrack): void {
    if (!this.issue({ type: 'research', track })) sfx.play('click');
  }

  centerOn(x: number, y: number): void {
    this.cameras.main.centerOn(x, y);
  }

  togglePause(): void {
    if (this.world.over) return;
    this.paused = !this.paused;
  }

  changeSpeed(delta: number): void {
    this.speedIndex = Phaser.Math.Clamp(this.speedIndex + delta, 0, SPEEDS.length - 1);
    this.hud?.message(`Velocità di gioco: ${this.speed}x`);
  }

  restart(): void {
    this.scene.stop('Hud');
    let mapId = this.config.mapId;
    if (this.match.mode === 'survival') {
      // la sopravvivenza si rigioca su una nuova mappa casuale della stessa dimensione
      const size = getMap(mapId).width > 5000 ? 'large' : getMap(mapId).width > 4000 ? 'medium' : 'small';
      mapId = randomMapId({ seed: Math.floor(Math.random() * 90000) + 10000, players: 2, size, richness: 'normal' });
    }
    this.scene.restart({ ...this.config, mapId, seed: undefined });
  }

  /** Avvia una missione della campagna. */
  startMission(id: string): void {
    this.scene.stop('Hud');
    this.scene.restart({ mode: 'mission', missionId: id, mapId: '', aiCount: 0, difficulty: 'normal' } satisfies MatchConfig);
  }

  toMenu(): void {
    this.scene.stop('Hud');
    this.scene.start('Menu');
  }

  private onEvent(e: GameEvent): void {
    this.view.handleEvent(e);
    const me = this.humanId;
    if (e.t === 'gameOver' && !this.overHandled) {
      this.overHandled = true;
      this.selection.clear();
      const won = e.winner === me;
      const sv = this.match.survival;
      if (sv && me >= 0) {
        const isRecord = submitSurvivalRecord(this.config.difficulty, sv.wave, this.world.tick);
        this.survivalResult = { wave: sv.wave, ticks: this.world.tick, isRecord, record: getSurvivalRecord(this.config.difficulty) };
      }
      const mission = this.match.mission;
      if (mission && me >= 0) {
        const idx = missionIndex(mission.def.id);
        if (won) saveProgress(recordWin(loadProgress(), mission.def.id, this.world.tick));
        const next = CAMPAIGN[idx + 1];
        this.missionResult = {
          won,
          reason: this.world.overReason || (won ? '' : 'La Nave Madre è stata distrutta.'),
          nextId: won && next ? next.id : null,
        };
      }
      const good = won || !!this.survivalResult?.isRecord || me < 0;
      if (me >= 0) sfx.play(good ? 'victory' : 'defeat');
      music.setTheme(good ? 'victory' : 'defeat');
      this.time.delayedCall(1200, () => this.hud?.showGameOver(won));
      return;
    }
    // intensità della musica: solo ciò che il giocatore vede
    if (e.t === 'fire' && this.view.onScreen(e.x, e.y)) music.bump(e.weapon === 'cannon' ? 0.03 : 0.012);
    else if (e.t === 'death' && this.view.onScreen(e.x, e.y)) music.bump(e.kind === 'mothership' ? 0.5 : 0.07);
    else if (e.t === 'wave') music.bump(0.3);
    if (!this.hud || me < 0) return;
    switch (e.t) {
      case 'captured': {
        const p = this.world.planets[e.planetId];
        if (e.faction === me) {
          this.hud.message(`Pianeta ${p.name} conquistato! +${p.supply} flotta, +${p.income}/s`, '#9cff9c');
          sfx.play('capture');
        } else if (e.prev === me) {
          this.hud.message(`Abbiamo perso il pianeta ${p.name}!`, '#ff8a80');
          sfx.play('lost');
        }
        break;
      }
      case 'underAttack':
        if (e.faction === me && !this.cameras.main.worldView.contains(e.x, e.y)) {
          this.hud.message('Siamo sotto attacco!', '#ff8a80', { x: e.x, y: e.y });
          sfx.play('alert');
        }
        break;
      case 'wave':
        this.hud.message(`Ondata ${e.wave} in arrivo!`, '#d9a6ff', { x: e.x, y: e.y });
        sfx.play('alert');
        break;
      case 'research':
        if (e.faction === me) {
          this.hud.message(`Ricerca completata: ${RESEARCH[e.track].name} livello ${e.level}`, '#ffd54f');
          sfx.play('capture');
        }
        break;
      case 'eliminated':
        if (e.faction !== me) this.hud.message(`${this.world.factions[e.faction].name} è stato eliminato!`, '#ffd54f');
        break;
      default:
        break;
    }
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, 100) / 1000;
    if (!this.paused && !this.world.over) {
      this.acc += dt * this.speed;
      let steps = 0;
      while (this.acc >= DT && steps < 10) {
        this.match.step();
        for (const e of this.world.events) this.onEvent(e);
        this.acc -= DT;
        steps++;
      }
      if (steps === 10) this.acc = 0;
    }
    this.selectedUnits();
    if (this.selectedPlanet >= 0 && !this.world.planets[this.selectedPlanet]) this.selectedPlanet = -1;
    const cam = this.cameras.main;
    this.cameraTravel += Math.hypot(cam.scrollX - this.lastScroll.x, cam.scrollY - this.lastScroll.y);
    this.lastScroll = { x: cam.scrollX, y: cam.scrollY };
    this.view.draw(this.paused ? 1 : this.acc / DT, this.paused ? 0 : dt, {
      beacon: this.match.mission?.beacon ?? null,
      units: this.selection,
      planet: this.selectedPlanet,
    });
    this.controls.update(dt);
  }
}

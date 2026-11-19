import Phaser from 'phaser';
import type { UnitKind } from '../data/units';
import { Match, type MatchConfig } from '../game/Match';
import { InputController } from '../input/InputController';
import { sfx } from '../render/audio';
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
    if (m) cam.centerOn(m.x, m.y);
    else cam.centerOn(this.world.width / 2, this.world.height / 2);

    this.controls = new InputController(this);
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
    this.scene.restart({ ...this.config, seed: undefined });
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
      if (me >= 0) sfx.play(won ? 'victory' : 'defeat');
      this.time.delayedCall(1200, () => this.hud?.showGameOver(won));
      return;
    }
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
    this.view.draw(this.paused ? 1 : this.acc / DT, this.paused ? 0 : dt, {
      units: this.selection,
      planet: this.selectedPlanet,
    });
    this.controls.update(dt);
  }
}

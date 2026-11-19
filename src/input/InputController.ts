import Phaser from 'phaser';
import { BUILDABLE_SHIPS, BUILD_HOTKEYS, UNITS, type UnitKind } from '../data/units';
import { sfx } from '../render/audio';
import type { Asteroid, Unit } from '../sim/types';
import type { GameScene } from '../scenes/GameScene';

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.6;
const EDGE = 12;

/** Mouse e tastiera: selezione, comandi contestuali, camera e tasti rapidi. */
export class InputController {
  attackMoveArmed = false;
  private dragStart: { x: number; y: number } | null = null;
  private dragging = false;
  private pan: { x: number; y: number; sx: number; sy: number } | null = null;
  private pointerInside = false;
  private lastClick = { time: 0, kind: '' as string };
  private lastGroup = { time: 0, n: -1 };
  private box: Phaser.GameObjects.Graphics;
  private keys: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e);

  constructor(private readonly gs: GameScene) {
    const input = gs.input;
    input.mouse?.disableContextMenu();
    this.box = gs.add.graphics().setDepth(gs.view.boxDepth);
    const kb = input.keyboard!;
    this.keys = {
      up: kb.addKey('UP'),
      down: kb.addKey('DOWN'),
      left: kb.addKey('LEFT'),
      right: kb.addKey('RIGHT'),
    };
    kb.addCapture('SPACE,TAB,F1');
    kb.on('keydown', this.onKey);

    input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.zoomAt(p.x, p.y, dy));
    // lo scorrimento ai bordi si attiva solo dopo che il mouse si è mosso davvero sul gioco
    input.on('pointermove', () => (this.pointerInside = true));
    input.on('gameout', () => (this.pointerInside = false));
  }

  destroy(): void {
    this.gs.input.keyboard?.off('keydown', this.onKey);
  }

  // ------------------------------------------------------------ utilità

  private overHud(p: { x: number; y: number }): boolean {
    return this.gs.hud?.isOver(p.x, p.y) ?? false;
  }

  /** Coordinate del mondo sotto un punto dello schermo (camera con origine al centro). */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const cam = this.gs.cameras.main;
    return {
      x: cam.scrollX + cam.width / 2 + (sx - cam.width / 2) / cam.zoom,
      y: cam.scrollY + cam.height / 2 + (sy - cam.height / 2) / cam.zoom,
    };
  }

  private zoomAt(sx: number, sy: number, dy: number): void {
    if (this.overHud({ x: sx, y: sy })) return;
    const cam = this.gs.cameras.main;
    const before = this.screenToWorld(sx, sy);
    const z = Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.88 : 1.12), MIN_ZOOM, MAX_ZOOM);
    cam.setZoom(z);
    cam.scrollX = before.x - cam.width / 2 - (sx - cam.width / 2) / z;
    cam.scrollY = before.y - cam.height / 2 - (sy - cam.height / 2) / z;
  }

  private pickAsteroid(x: number, y: number, slack: number): Asteroid | undefined {
    return this.gs.world.asteroids.find((a) => a.amount > 0 && Math.hypot(a.x - x, a.y - y) < a.radius + slack);
  }

  private pickPlanet(x: number, y: number): number {
    const p = this.gs.world.planets.find((pl) => Math.hypot(pl.x - x, pl.y - y) < pl.radius + 10);
    return p ? p.id : -1;
  }

  // ------------------------------------------------------------ mouse

  private onDown(p: Phaser.Input.Pointer): void {
    sfx.unlock();
    if (this.overHud(p)) return;
    const gs = this.gs;
    const wp = this.screenToWorld(p.x, p.y);
    if (p.button === 1) {
      this.pan = { x: p.x, y: p.y, sx: gs.cameras.main.scrollX, sy: gs.cameras.main.scrollY };
      return;
    }
    if (p.button === 2) {
      if (this.attackMoveArmed) {
        this.attackMoveArmed = false;
        return;
      }
      this.contextCommand(wp.x, wp.y);
      return;
    }
    if (p.button === 0) {
      if (this.attackMoveArmed) {
        this.attackMoveAt(wp.x, wp.y);
        if (!p.event.shiftKey) this.attackMoveArmed = false;
        return;
      }
      this.dragStart = { x: p.x, y: p.y };
      this.dragging = false;
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.button === 1) {
      this.pan = null;
      return;
    }
    if (p.button !== 0 || !this.dragStart) return;
    const gs = this.gs;
    const shift = p.event.shiftKey;
    if (this.dragging) {
      const a = this.screenToWorld(this.dragStart.x, this.dragStart.y);
      const b = this.screenToWorld(p.x, p.y);
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x, b.x);
      const y0 = Math.min(a.y, b.y);
      const y1 = Math.max(a.y, b.y);
      const inBox = gs.world.units.filter(
        (u) => u.faction === gs.humanId && u.x + u.radius > x0 && u.x - u.radius < x1 && u.y + u.radius > y0 && u.y - u.radius < y1,
      );
      const ships = inBox.filter((u) => !UNITS[u.kind].structure);
      const chosen = ships.length ? ships : inBox.filter((u) => u.kind === 'mothership');
      if (chosen.length || !shift) gs.select(chosen.map((u) => u.id), shift);
    } else {
      this.clickSelect(p.x, p.y, shift);
    }
    this.dragStart = null;
    this.dragging = false;
    this.box.clear();
  }

  private clickSelect(sx: number, sy: number, shift: boolean): void {
    const gs = this.gs;
    const wp = this.screenToWorld(sx, sy);
    const slack = 8 / gs.cameras.main.zoom;
    const u = gs.view.pick(wp.x, wp.y, slack);
    const now = gs.time.now;
    if (u) {
      if (u.faction === gs.humanId) {
        // doppio click: tutte le navi dello stesso tipo visibili
        if (now - this.lastClick.time < 350 && this.lastClick.kind === u.kind && !UNITS[u.kind].structure) {
          const view = gs.cameras.main.worldView;
          const same = gs.world.units.filter((o) => o.faction === gs.humanId && o.kind === u.kind && view.contains(o.x, o.y));
          gs.select(same.map((o) => o.id), shift);
        } else if (shift && gs.selection.has(u.id)) {
          gs.selection.delete(u.id);
        } else {
          gs.select([u.id], shift && !UNITS[u.kind].structure);
        }
        this.lastClick = { time: now, kind: u.kind };
        sfx.play('click');
      } else {
        gs.select([u.id]);
      }
      return;
    }
    const planet = this.pickPlanet(wp.x, wp.y);
    if (planet >= 0) {
      gs.selectPlanet(planet);
      return;
    }
    if (!shift) gs.select([]);
  }

  /** Click destro: muovi, attacca, estrai o punto di raccolta a seconda del bersaglio. */
  private contextCommand(x: number, y: number): void {
    const gs = this.gs;
    const own = gs.ownSelected();
    if (!own.length) return;
    const ships = own.filter((u) => !UNITS[u.kind].structure);
    const mother = own.find((u) => u.kind === 'mothership');
    const slack = 6 / gs.cameras.main.zoom;
    const target = gs.view.pick(x, y, slack);
    const ast = this.pickAsteroid(x, y, slack);

    if (mother && ships.length === 0) {
      gs.issue({ type: 'rally', structureId: mother.id, x, y });
      gs.view.marker(x, y, 0x76ff7a);
      return;
    }
    const ids = ships.map((u) => u.id);
    if (target && gs.world.isEnemy(gs.humanId, target.faction)) {
      gs.issue({ type: 'attack', ids, targetId: target.id });
      gs.view.marker(target.x, target.y, 0xff5252);
    } else if (ast && ships.some((u) => u.kind === 'miner')) {
      gs.issue({ type: 'harvest', ids, asteroidId: ast.id });
      gs.view.marker(ast.x, ast.y, 0x7ff3ff);
    } else if (target && target.kind === 'mothership' && target.faction === gs.humanId && ships.some((u) => u.kind === 'miner')) {
      const miners = ships.filter((u) => u.kind === 'miner');
      gs.issue({ type: 'returnCargo', ids: miners.map((u) => u.id) });
      gs.view.marker(target.x, target.y, 0x7ff3ff);
    } else {
      gs.issue({ type: 'move', ids, x, y });
      gs.view.marker(x, y, 0x76ff7a);
    }
    if (mother) gs.issue({ type: 'rally', structureId: mother.id, x, y });
  }

  attackMoveAt(x: number, y: number): void {
    const gs = this.gs;
    const ships = gs.ownSelected().filter((u) => !UNITS[u.kind].structure);
    if (!ships.length) return;
    const target = gs.view.pick(x, y, 6 / gs.cameras.main.zoom);
    const ids = ships.map((u) => u.id);
    if (target && gs.world.isEnemy(gs.humanId, target.faction)) {
      gs.issue({ type: 'attack', ids, targetId: target.id });
      gs.view.marker(target.x, target.y, 0xff5252);
    } else {
      gs.issue({ type: 'attackMove', ids, x, y });
      gs.view.marker(x, y, 0xff8a80);
    }
  }

  /** Comando di movimento dalla minimappa. */
  moveTo(x: number, y: number): void {
    const gs = this.gs;
    const ships = gs.ownSelected().filter((u) => !UNITS[u.kind].structure);
    if (!ships.length) return;
    if (this.attackMoveArmed) {
      this.attackMoveArmed = false;
      gs.issue({ type: 'attackMove', ids: ships.map((u) => u.id), x, y });
    } else gs.issue({ type: 'move', ids: ships.map((u) => u.id), x, y });
    gs.view.marker(x, y, 0x76ff7a);
  }

  // ------------------------------------------------------------ tastiera

  armAttackMove(): void {
    if (this.gs.ownSelected().some((u) => UNITS[u.kind].weapon && !UNITS[u.kind].structure)) {
      this.attackMoveArmed = true;
    }
  }

  stop(hold: boolean): void {
    const ids = this.gs.ownSelected().map((u) => u.id);
    if (ids.length) this.gs.issue({ type: hold ? 'hold' : 'stop', ids });
  }

  harvest(): void {
    const gs = this.gs;
    const miners = gs.ownSelected().filter((u) => u.kind === 'miner');
    for (const m of miners) gs.world.sendToHarvest(m);
  }

  returnCargo(): void {
    const ids = this.gs.ownSelected().filter((u) => u.kind === 'miner').map((u) => u.id);
    if (ids.length) this.gs.issue({ type: 'returnCargo', ids });
  }

  private selectWhere(pred: (u: Unit) => boolean): Unit[] {
    const gs = this.gs;
    const list = gs.world.units.filter((u) => u.faction === gs.humanId && pred(u));
    gs.select(list.map((u) => u.id));
    return list;
  }

  private handleKey(e: KeyboardEvent): void {
    const gs = this.gs;
    sfx.unlock();
    if (gs.hud?.handleKey(e)) return;
    const code = e.code;

    if (code.startsWith('Digit')) {
      const n = Number(code.slice(5));
      if (e.ctrlKey || e.shiftKey || e.metaKey) {
        e.preventDefault();
        const ids = gs.ownSelected().map((u) => u.id);
        gs.groups.set(n, ids);
        gs.hud?.message(`Gruppo ${n}: ${ids.length} unità`);
      } else {
        const ids = (gs.groups.get(n) ?? []).filter((id) => gs.world.unit(id));
        gs.groups.set(n, ids);
        if (!ids.length) return;
        gs.select(ids);
        const now = gs.time.now;
        if (this.lastGroup.n === n && now - this.lastGroup.time < 350) {
          const u = gs.world.unit(ids[0]);
          if (u) gs.centerOn(u.x, u.y);
        }
        this.lastGroup = { time: now, n };
      }
      return;
    }

    const own = gs.ownSelected();
    const planet = gs.selectedPlanet >= 0 ? gs.world.planets[gs.selectedPlanet] : undefined;
    const hk = BUILD_HOTKEYS.indexOf(code.replace('Key', ''));
    if (hk >= 0 && code.startsWith('Key')) {
      if (own.some((u) => u.kind === 'mothership')) {
        gs.build(BUILDABLE_SHIPS[hk] as UnitKind);
        return;
      }
      if (hk === 0 && planet && planet.owner === gs.humanId) {
        if (!gs.issue({ type: 'buildTurret', planetId: planet.id })) sfx.play('click');
        return;
      }
    }

    switch (code) {
      case 'KeyA':
        this.armAttackMove();
        break;
      case 'KeyS':
        this.stop(false);
        break;
      case 'KeyH':
        this.stop(true);
        break;
      case 'KeyG':
        this.harvest();
        break;
      case 'KeyB':
        this.returnCargo();
        break;
      case 'KeyZ':
        this.selectWhere((u) => !UNITS[u.kind].structure && u.kind !== 'miner');
        break;
      case 'KeyX':
        this.selectWhere((u) => u.kind === 'miner');
        break;
      case 'KeyC': {
        const m = gs.mothership();
        if (m) {
          gs.select([m.id]);
          gs.centerOn(m.x, m.y);
        }
        break;
      }
      case 'Space': {
        if (own.length) {
          const cx = own.reduce((s, u) => s + u.x, 0) / own.length;
          const cy = own.reduce((s, u) => s + u.y, 0) / own.length;
          gs.centerOn(cx, cy);
        } else {
          const m = gs.mothership();
          if (m) gs.centerOn(m.x, m.y);
        }
        break;
      }
      case 'Escape':
        if (this.attackMoveArmed) this.attackMoveArmed = false;
        else gs.select([]);
        break;
      case 'KeyP':
      case 'Pause':
        gs.togglePause();
        break;
      case 'KeyM':
        gs.hud?.message(sfx.toggleMute() ? 'Audio disattivato' : 'Audio attivato');
        break;
      case 'Equal':
      case 'NumpadAdd':
        gs.changeSpeed(1);
        break;
      case 'Minus':
      case 'NumpadSubtract':
        gs.changeSpeed(-1);
        break;
      case 'F1':
        e.preventDefault();
        gs.hud?.toggleHelp();
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------ per frame

  update(dt: number): void {
    const gs = this.gs;
    const cam = gs.cameras.main;
    const p = gs.input.activePointer;

    if (this.pan) {
      cam.scrollX = this.pan.sx - (p.x - this.pan.x) / cam.zoom;
      cam.scrollY = this.pan.sy - (p.y - this.pan.y) / cam.zoom;
    }

    const speed = (900 / cam.zoom) * dt;
    let dx = 0;
    let dy = 0;
    if (this.keys.left.isDown) dx -= 1;
    if (this.keys.right.isDown) dx += 1;
    if (this.keys.up.isDown) dy -= 1;
    if (this.keys.down.isDown) dy += 1;
    if (this.pointerInside && !this.dragStart && !this.pan && document.hasFocus()) {
      if (p.x < EDGE) dx -= 1;
      if (p.x > cam.width - EDGE) dx += 1;
      if (p.y < EDGE) dy -= 1;
      if (p.y > cam.height - EDGE) dy += 1;
    }
    cam.scrollX += Math.sign(dx) * speed;
    cam.scrollY += Math.sign(dy) * speed;

    // riquadro di selezione
    this.box.clear();
    if (this.dragStart && p.isDown) {
      if (!this.dragging && Math.hypot(p.x - this.dragStart.x, p.y - this.dragStart.y) > 6) this.dragging = true;
      if (this.dragging) {
        const a = this.screenToWorld(this.dragStart.x, this.dragStart.y);
        const b = this.screenToWorld(p.x, p.y);
        this.box.fillStyle(0x76ff7a, 0.08);
        this.box.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
        this.box.lineStyle(1 / cam.zoom, 0x76ff7a, 0.8);
        this.box.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      }
    } else if (this.dragStart && !p.isDown) {
      this.dragStart = null;
      this.dragging = false;
    }

    gs.input.setDefaultCursor(this.attackMoveArmed ? 'crosshair' : 'default');
  }
}

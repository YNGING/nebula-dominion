import Phaser from 'phaser';
import { NEUTRAL_COLOR } from '../data/factions';
import { ECONOMY, UNITS, type UnitKind } from '../data/units';
import { Rng } from '../sim/rng';
import type { GameEvent, Unit } from '../sim/types';
import type { World } from '../sim/World';
import { sfx, type SfxName } from './audio';
import { gfx } from './settings';
import { lighten, planetAtmosphere, shipKey, SHIP_TEX_SCALE } from './textures';

interface UnitView {
  body: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
}

interface PlanetView {
  img: Phaser.GameObjects.Image;
  atmo: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  info: Phaser.GameObjects.Text;
}

export interface SelectionView {
  units: ReadonlySet<number>;
  planet: number;
}

const DEPTH = {
  nebula: -10,
  planet: 0,
  asteroid: 1,
  glow: 2,
  structure: 4,
  ship: 5,
  fx: 8,
  overlay: 9,
  fog: 20,
  marker: 21,
  box: 22,
};

/** Disegna lo stato della simulazione con Phaser, interpolando tra un tick e l'altro. */
export class WorldRenderer {
  private units = new Map<number, UnitView>();
  private asteroids = new Map<number, Phaser.GameObjects.Image>();
  private planets: PlanetView[] = [];
  private fx: Phaser.GameObjects.Graphics;
  private overlay: Phaser.GameObjects.Graphics;
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private debris: Phaser.GameObjects.Particles.ParticleEmitter;
  private fogRect: Phaser.GameObjects.Rectangle | null = null;
  private fogShape: Phaser.GameObjects.Graphics | null = null;
  private visibleIds = new Set<number>();
  private frame = 0;
  private time = 0;
  private trails: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  /** lampi riutilizzabili (spari, uscite dalla Nave Madre) */
  private flashes: { img: Phaser.GameObjects.Image; life: number; max: number }[] = [];
  private flashIndex = 0;
  private smokeTimer = 0;
  private visionSources: { x: number; y: number; r: number }[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    /** fazione del giocatore (-1 = spettatore, nessuna nebbia) */
    private readonly humanId: number,
  ) {
    this.createBackdrop();
    this.fx = scene.add.graphics().setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD);
    this.overlay = scene.add.graphics().setDepth(DEPTH.overlay);
    this.sparks = scene.add.particles(0, 0, 'spark', {
      speed: { min: 40, max: 260 },
      lifespan: { min: 250, max: 750 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.sparks.setDepth(DEPTH.fx);
    this.debris = scene.add.particles(0, 0, 'spark', {
      speed: { min: 10, max: 90 },
      lifespan: { min: 900, max: 1800 },
      scale: { start: 0.6, end: 0.1 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xffd180, 0xff8a65, 0xffffff],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.debris.setDepth(DEPTH.fx);
    this.trails = scene.add.particles(0, 0, 'spark', {
      speed: { min: 0, max: 12 },
      lifespan: { min: 300, max: 520 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.7, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.trails.setDepth(DEPTH.glow);
    this.smoke = scene.add.particles(0, 0, 'glow', {
      speedX: { min: -12, max: 12 },
      speedY: { min: -28, max: -8 },
      lifespan: { min: 1200, max: 1900 },
      scale: { start: 0.12, end: 0.42 },
      alpha: { start: 0.45, end: 0 },
      tint: [0x3a3f4b, 0x555b68, 0x2b2f38],
      emitting: false,
    });
    this.smoke.setDepth(DEPTH.fx);
    for (let i = 0; i < 48; i++) {
      const img = scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx).setVisible(false);
      this.flashes.push({ img, life: 0, max: 1 });
    }
    if (humanId >= 0) this.createFog();
  }

  // ------------------------------------------------------------ costruzione

  private createBackdrop(): void {
    const s = this.scene;
    const w = this.world;
    const rng = new Rng(w.map.width * 7 + w.map.height);
    const tints = [0x3b1d6e, 0x14306b, 0x5a1a4a, 0x0f4a5a];
    for (let i = 0; i < 9; i++) {
      s.add
        .image(rng.range(0, w.width), rng.range(0, w.height), 'nebula')
        .setScale(rng.range(5, 10))
        .setTint(rng.pick(tints))
        .setAlpha(rng.range(0.25, 0.45))
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.nebula);
    }
    // bordo della mappa
    s.add
      .rectangle(w.width / 2, w.height / 2, w.width, w.height)
      .setStrokeStyle(2, 0x3a4a7a, 0.5)
      .setDepth(DEPTH.nebula + 1);

    for (const p of w.planets) {
      const scale = p.radius / 120;
      const atmo = s.add
        .image(p.x, p.y, 'glow')
        .setScale((p.radius * 2.9) / 128)
        .setTint(planetAtmosphere(p.style))
        .setAlpha(0.45)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.planet);
      const img = s.add.image(p.x, p.y, `planet${p.style}`).setScale(scale).setDepth(DEPTH.planet);
      const label = s.add
        .text(p.x, p.y + p.radius + 24, p.name.toUpperCase(), {
          fontFamily: 'Rajdhani, sans-serif',
          fontSize: '18px',
          fontStyle: 'bold',
          color: '#cfd8e8',
        })
        .setOrigin(0.5, 0)
        .setAlpha(0.85)
        .setDepth(DEPTH.overlay);
      const info = s.add
        .text(p.x, p.y + p.radius + 44, `+${p.income}/s  ·  +${p.supply} flotta`, {
          fontFamily: 'Rajdhani, sans-serif',
          fontSize: '14px',
          color: '#8fa0bf',
        })
        .setOrigin(0.5, 0)
        .setAlpha(0.8)
        .setDepth(DEPTH.overlay);
      this.planets.push({ img, atmo, label, info });
    }

    for (const a of w.asteroids) {
      const img = s.add.image(a.x, a.y, `asteroid${a.variant}`).setDepth(DEPTH.asteroid).setRotation(a.angle);
      this.asteroids.set(a.id, img);
    }
  }

  private createFog(): void {
    const w = this.world;
    const renderer = this.scene.game.renderer;
    if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;
    const m = 2000;
    this.fogRect = this.scene.add
      .rectangle(w.width / 2, w.height / 2, w.width + m * 2, w.height + m * 2, 0x01020a, 0.55)
      .setDepth(DEPTH.fog);
    this.fogShape = this.scene.make.graphics({}, false);
    const mask = this.fogShape.createGeometryMask();
    mask.setInvertAlpha(true);
    this.fogRect.setMask(mask);
  }

  // ------------------------------------------------------------ visibilità

  /** Punto dentro la visione del giocatore (sempre vero per lo spettatore). */
  pointVisible(x: number, y: number): boolean {
    if (this.humanId < 0) return true;
    return this.visionSources.some((s) => (x - s.x) ** 2 + (y - s.y) ** 2 < s.r * s.r);
  }

  isVisible(u: Unit): boolean {
    return this.humanId < 0 || u.faction === this.humanId || this.visibleIds.has(u.id);
  }

  private updateVisibility(): void {
    const w = this.world;
    const sources = this.visionSources;
    sources.length = 0;
    for (const u of w.units) if (u.faction === this.humanId) sources.push({ x: u.x, y: u.y, r: UNITS[u.kind].vision });
    for (const p of w.planets) if (p.owner === this.humanId) sources.push({ x: p.x, y: p.y, r: p.radius + ECONOMY.planetVision });
    this.visibleIds.clear();
    for (const u of w.units) {
      if (u.faction === this.humanId) continue;
      for (const s of sources) {
        const dx = u.x - s.x;
        const dy = u.y - s.y;
        const r = s.r + u.radius;
        if (dx * dx + dy * dy < r * r) {
          this.visibleIds.add(u.id);
          break;
        }
      }
    }
    if (this.fogShape) {
      const g = this.fogShape;
      g.clear();
      g.fillStyle(0xffffff, 1);
      for (const s of sources) g.fillCircle(s.x, s.y, s.r);
    }
  }

  // ------------------------------------------------------------ eventi

  /** Il punto è nell'inquadratura ed è visibile al giocatore (per musica e suoni). */
  onScreen(x: number, y: number): boolean {
    return this.inView(x, y, 50);
  }

  private inView(x: number, y: number, margin = 100): boolean {
    const v = this.scene.cameras.main.worldView;
    return x > v.x - margin && x < v.right + margin && y > v.y - margin && y < v.bottom + margin;
  }

  private audible(x: number, y: number): number {
    if (!this.inView(x, y, 200)) return 0;
    return Math.min(1, 0.4 + this.scene.cameras.main.zoom * 0.6);
  }

  private colorOf(f: number): number {
    return this.world.factions[f]?.color ?? NEUTRAL_COLOR;
  }

  handleEvent(e: GameEvent): void {
    switch (e.t) {
      case 'fire': {
        const names: Record<string, SfxName> = { laser: 'laser', flak: 'flak', cannon: 'cannon', beam: 'beam' };
        sfx.play(names[e.weapon], this.audible(e.x, e.y) * 0.8);
        if (gfx.rich && this.inView(e.x, e.y, 20) && this.pointVisible(e.x, e.y)) {
          const size = e.weapon === 'cannon' ? 34 : e.weapon === 'flak' ? 18 : 11;
          this.flash(e.x, e.y, size, lighten(this.colorOf(e.faction), 0.5), 0.09);
        }
        break;
      }
      case 'hit': {
        if (!this.inView(e.x, e.y) || !this.pointVisible(e.x, e.y)) break;
        if (e.weapon === 'cannon') {
          this.sparks.setParticleTint(0xffe0b2);
          this.sparks.explode(10, e.x, e.y);
        } else if (e.weapon === 'flak') {
          this.sparks.setParticleTint(0xffab40);
          this.sparks.explode(5, e.x, e.y);
          this.ringPulse(e.x, e.y, e.splash, 0xffab40, 220, 0.5);
        } else {
          this.sparks.setParticleTint(lighten(this.colorOf(e.faction), 0.5));
          this.sparks.explode(2, e.x, e.y);
        }
        break;
      }
      case 'death': {
        const big = e.kind === 'mothership' || e.kind === 'battleship';
        if (this.inView(e.x, e.y, 200)) {
          const n = Math.min(70, 10 + e.radius * 1.4);
          this.sparks.setParticleTint(lighten(this.colorOf(e.faction), 0.3));
          this.sparks.explode(n, e.x, e.y);
          this.sparks.setParticleTint(0xffcc80);
          this.sparks.explode(n * 0.6, e.x, e.y);
          this.debris.explode(Math.round(n / 3), e.x, e.y);
          this.ringPulse(e.x, e.y, e.radius * (big ? 4 : 2.5), 0xffd180, big ? 700 : 400, 0.9);
          const flash = this.scene.add
            .image(e.x, e.y, 'glow')
            .setScale((e.radius * 5) / 128)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(DEPTH.fx)
            .setTint(0xffe0b2);
          this.scene.tweens.add({ targets: flash, alpha: 0, scale: flash.scale * 1.6, duration: big ? 700 : 350, onComplete: () => flash.destroy() });
          if (big) this.scene.cameras.main.shake(e.kind === 'mothership' ? 600 : 200, e.kind === 'mothership' ? 0.012 : 0.004);
        }
        sfx.play(big ? 'boomBig' : 'boomSmall', big ? 1 : this.audible(e.x, e.y));
        break;
      }
      case 'built': {
        if (this.inView(e.x, e.y) && (e.faction === this.humanId || this.pointVisible(e.x, e.y))) {
          // lampo di "salto" all'uscita dall'hangar
          const col = this.colorOf(e.faction);
          this.flash(e.x, e.y, e.kind === 'turret' ? 60 : 46, lighten(col, 0.4), 0.35);
          this.sparks.setParticleTint(lighten(col, 0.5));
          this.sparks.explode(8, e.x, e.y);
        }
        if (e.faction === this.humanId) {
          this.ringPulse(e.x, e.y, 30, this.colorOf(e.faction), 400, 0.8);
          sfx.play('build');
        }
        break;
      }
      case 'wave': {
        this.ringPulse(e.x, e.y, 260, 0xc77dff, 1200, 0.9);
        break;
      }
      case 'research': {
        const m = this.world.mothershipOf(e.faction);
        if (m && e.faction === this.humanId) {
          this.ringPulse(m.x, m.y, m.radius * 3, 0xffd54f, 800, 0.9);
          this.sparks.setParticleTint(0xffd54f);
          this.sparks.explode(40, m.x, m.y);
        }
        break;
      }
      case 'captured': {
        const p = this.world.planets[e.planetId];
        this.ringPulse(p.x, p.y, p.radius * 2.2, this.colorOf(e.faction), 900, 0.9);
        break;
      }
      default:
        break;
    }
  }

  private ringPulse(x: number, y: number, radius: number, color: number, duration: number, alpha: number): void {
    const ring = this.scene.add
      .image(x, y, 'ring')
      .setTint(color)
      .setAlpha(alpha)
      .setScale(0.05)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.fx);
    this.scene.tweens.add({
      targets: ring,
      scale: (radius * 2) / 128,
      alpha: 0,
      duration,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /** Lampo breve con un'immagine del gruppo riutilizzabile. */
  private flash(x: number, y: number, size: number, tint: number, seconds: number): void {
    const f = this.flashes[this.flashIndex++ % this.flashes.length];
    f.life = seconds;
    f.max = seconds;
    f.img.setPosition(x, y).setTint(tint).setScale(size / 64).setAlpha(1).setVisible(true);
  }

  /** Scie dei motori e fumo delle navi danneggiate (solo con effetti alti). */
  private drawEffects(alpha: number, dt: number): void {
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) f.img.setVisible(false);
      else f.img.setAlpha(f.life / f.max);
    }
    if (!gfx.rich || dt <= 0) return;
    const view = this.scene.cameras.main.worldView;
    let budget = 180;
    this.smokeTimer -= dt;
    const smokeNow = this.smokeTimer <= 0;
    if (smokeNow) this.smokeTimer = 0.2;
    for (const u of this.world.units) {
      if (!view.contains(u.x, u.y) || !this.isVisible(u)) continue;
      const def = UNITS[u.kind];
      if (smokeNow && (def.structure || u.kind === 'battleship') && u.hp < u.maxHp * 0.4) {
        const r = u.radius * 0.6;
        this.smoke.emitParticleAt(u.x + (Math.random() - 0.5) * r, u.y + (Math.random() - 0.5) * r, 1);
        if (Math.random() < 0.35) {
          this.sparks.setParticleTint(0xffab40);
          this.sparks.explode(2, u.x + (Math.random() - 0.5) * r, u.y + (Math.random() - 0.5) * r);
        }
      }
      if (def.structure || budget <= 0) continue;
      const speed = Math.hypot(u.vx, u.vy);
      if (speed < def.speed * 0.3) continue;
      // le navi grandi lasciano una scia più fitta
      const every = u.radius >= 12 ? 1 : 2;
      if ((this.frame + u.id) % every !== 0) continue;
      const x = u.px + (u.x - u.px) * alpha;
      const y = u.py + (u.y - u.py) * alpha;
      const back = u.radius * (u.kind === 'battleship' ? 1.1 : 0.95);
      this.trails.setParticleTint(lighten(this.colorOf(u.faction), 0.35));
      this.trails.emitParticleAt(x - Math.cos(u.angle) * back, y - Math.sin(u.angle) * back, 1);
      budget--;
    }
  }

  /** Piccolo segnale nel punto di un comando. */
  marker(x: number, y: number, color: number): void {
    const ring = this.scene.add.image(x, y, 'ring').setTint(color).setScale(0.4).setAlpha(0.9).setDepth(DEPTH.marker);
    this.scene.tweens.add({ targets: ring, scale: 0.08, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
  }

  // ------------------------------------------------------------ disegno

  draw(alpha: number, dt: number, sel: SelectionView): void {
    const w = this.world;
    this.time += dt;
    if (this.frame++ % 4 === 0) this.updateVisibility();
    const lerp = (a: number, b: number) => a + (b - a) * alpha;

    // unità
    const seen = new Set<number>();
    for (const u of w.units) {
      seen.add(u.id);
      let v = this.units.get(u.id);
      if (!v) {
        v = this.createUnitView(u);
        this.units.set(u.id, v);
      }
      const x = lerp(u.px, u.x);
      const y = lerp(u.py, u.y);
      const vis = this.isVisible(u);
      v.body.setVisible(vis).setPosition(x, y).setRotation(u.pangle + Phaser.Math.Angle.Wrap(u.angle - u.pangle) * alpha);
      v.glow.setVisible(vis).setPosition(x, y);
      if (!UNITS[u.kind].structure) v.glow.setAlpha(0.22 + Math.min(0.25, Math.hypot(u.vx, u.vy) / 600));
    }
    for (const [id, v] of this.units) {
      if (!seen.has(id)) {
        v.body.destroy();
        v.glow.destroy();
        this.units.delete(id);
      }
    }

    // asteroidi
    for (const a of w.asteroids) {
      const img = this.asteroids.get(a.id);
      if (!img) continue;
      if (a.amount <= 0) {
        img.setVisible(false);
        continue;
      }
      img.setRotation(a.angle).setScale(((a.radius * 2) / 56) * (0.55 + 0.45 * (a.amount / a.maxAmount)));
    }

    this.drawFx(alpha);
    this.drawEffects(alpha, dt);
    this.drawOverlay(alpha, sel);
  }

  private createUnitView(u: Unit): UnitView {
    const def = UNITS[u.kind];
    const color = this.colorOf(u.faction);
    const glow = this.scene.add
      .image(u.x, u.y, 'glow')
      .setTint(color)
      .setScale((u.radius * (def.structure ? 4 : 3.4)) / 128)
      .setAlpha(def.structure ? 0.35 : 0.25)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.glow);
    const body = this.scene.add
      .image(u.x, u.y, shipKey(u.kind, color))
      .setScale(1 / SHIP_TEX_SCALE)
      .setDepth(def.structure ? DEPTH.structure : DEPTH.ship);
    return { body, glow };
  }

  private drawFx(alpha: number): void {
    const g = this.fx;
    const w = this.world;
    g.clear();
    const view = this.scene.cameras.main.worldView;
    for (const p of w.projectiles) {
      const x = p.px + (p.x - p.px) * alpha;
      const y = p.py + (p.y - p.py) * alpha;
      if (x < view.x - 50 || x > view.right + 50 || y < view.y - 50 || y > view.bottom + 50) continue;
      const col = lighten(this.colorOf(p.faction), 0.45);
      switch (p.kind) {
        case 'laser':
          g.lineStyle(2, col, 1);
          g.lineBetween(x - p.vx * 0.03, y - p.vy * 0.03, x, y);
          break;
        case 'beam':
          g.lineStyle(3, col, 0.9);
          g.lineBetween(x - p.vx * 0.035, y - p.vy * 0.035, x, y);
          break;
        case 'flak':
          g.fillStyle(0xffc46b, 1);
          g.fillCircle(x, y, 2.6);
          break;
        case 'cannon':
          g.fillStyle(col, 0.35);
          g.fillCircle(x, y, 7);
          g.fillStyle(0xffffff, 1);
          g.fillCircle(x, y, 3.5);
          break;
      }
    }

    // raggi di estrazione e riparazione
    for (const u of w.units) {
      if (!this.isVisible(u)) continue;
      const ux = u.px + (u.x - u.px) * alpha;
      const uy = u.py + (u.y - u.py) * alpha;
      if (u.kind === 'miner' && u.mineState === 'mining' && u.order.type === 'harvest') {
        const a = w.asteroid(u.asteroidId);
        if (a) {
          g.lineStyle(1.5, 0x7ff3ff, 0.45 + 0.35 * Math.sin(this.time * 18 + u.id));
          g.lineBetween(ux, uy, a.x, a.y);
        }
      } else if (u.kind === 'support' && u.repairTarget >= 0) {
        const t = w.unit(u.repairTarget);
        if (t) {
          g.lineStyle(2, 0x9cff9c, 0.5 + 0.3 * Math.sin(this.time * 12));
          g.lineBetween(ux, uy, t.px + (t.x - t.px) * alpha, t.py + (t.y - t.py) * alpha);
        }
      }
    }
  }

  private drawOverlay(alpha: number, sel: SelectionView): void {
    const g = this.overlay;
    const w = this.world;
    g.clear();
    const zoom = this.scene.cameras.main.zoom;
    const lw = Math.max(1, 1.5 / zoom);

    // pianeti: anello del proprietario, barra di conquista, zona
    w.planets.forEach((p, i) => {
      const view = this.planets[i];
      const ownerCol = p.owner >= 0 ? this.colorOf(p.owner) : NEUTRAL_COLOR;
      view.label.setColor(p.owner >= 0 ? '#' + lighten(ownerCol, 0.2).toString(16).padStart(6, '0') : '#cfd8e8');
      if (p.owner >= 0) {
        g.lineStyle(3 * lw, ownerCol, 0.85);
        g.strokeCircle(p.x, p.y, p.radius + 9);
      }
      const selected = sel.planet === p.id;
      if (p.progress > 0 || p.contested || selected) {
        const zone = p.radius + ECONOMY.captureMargin;
        const zc = p.contested ? 0xff5252 : p.captureFaction >= 0 ? this.colorOf(p.captureFaction) : 0x8899bb;
        const blink = p.contested ? 0.35 + 0.3 * Math.sin(this.time * 8) : 0.3;
        g.lineStyle(lw, zc, blink);
        const seg = 48;
        for (let k = 0; k < seg; k += 2) {
          const a0 = (k / seg) * Math.PI * 2 + this.time * 0.1;
          const a1 = ((k + 1) / seg) * Math.PI * 2 + this.time * 0.1;
          g.lineBetween(p.x + Math.cos(a0) * zone, p.y + Math.sin(a0) * zone, p.x + Math.cos(a1) * zone, p.y + Math.sin(a1) * zone);
        }
      }
      if (p.progress > 0 && p.captureFaction >= 0) {
        g.lineStyle(5 * lw, 0x000000, 0.5);
        g.strokeCircle(p.x, p.y, p.radius + 18);
        g.lineStyle(5 * lw, this.colorOf(p.captureFaction), 1);
        g.beginPath();
        g.arc(p.x, p.y, p.radius + 18, -Math.PI / 2, -Math.PI / 2 + p.progress * Math.PI * 2);
        g.strokePath();
      }
      if (selected) {
        g.lineStyle(2 * lw, 0xffee58, 0.9);
        g.strokeCircle(p.x, p.y, p.radius + 26);
      }
    });

    // selezione e barre della vita
    for (const u of w.units) {
      if (!this.isVisible(u)) continue;
      const x = u.px + (u.x - u.px) * alpha;
      const y = u.py + (u.y - u.py) * alpha;
      const selected = sel.units.has(u.id);
      if (selected) {
        const own = u.faction === this.humanId;
        g.lineStyle(1.5 * lw, own ? 0x76ff7a : 0xff6e6e, 0.9);
        g.strokeCircle(x, y, u.radius + 5);
        if (u.kind === 'mothership' && own) {
          g.lineStyle(lw, 0x76ff7a, 0.4);
          g.lineBetween(x, y, u.rallyX, u.rallyY);
          g.fillStyle(0x76ff7a, 0.8);
          g.fillTriangle(u.rallyX, u.rallyY - 14, u.rallyX + 10, u.rallyY - 10, u.rallyX, u.rallyY - 6);
          g.lineBetween(u.rallyX, u.rallyY, u.rallyX, u.rallyY - 14);
        }
      }
      const damaged = u.hp < u.maxHp && w.tick - u.lastDamagedTick < 120;
      if (selected || damaged || (UNITS[u.kind].structure && u.hp < u.maxHp)) {
        const bw = Math.max(18, u.radius * 2);
        const bh = Math.max(3, 3 * lw);
        const by = y - u.radius - 9;
        const frac = Math.max(0, u.hp / u.maxHp);
        g.fillStyle(0x000000, 0.6);
        g.fillRect(x - bw / 2 - 1, by - 1, bw + 2, bh + 2);
        g.fillStyle(frac > 0.6 ? 0x66ff88 : frac > 0.3 ? 0xffd54f : 0xff5252, 1);
        g.fillRect(x - bw / 2, by, bw * frac, bh);
      }
      if (u.kind === 'miner' && u.cargo > 0 && u.faction === this.humanId) {
        g.fillStyle(0x7ff3ff, 0.9);
        g.fillCircle(x, y, 2.5 * Math.min(1.5, lw));
      }
    }
  }

  /** Unità da selezionare sotto il cursore (preferendo le proprie). */
  pick(x: number, y: number, slack: number): Unit | undefined {
    let best: Unit | undefined;
    let bestScore = Infinity;
    for (const u of this.world.units) {
      if (!this.isVisible(u)) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d > u.radius + slack) continue;
      const score = d - u.radius + (u.faction === this.humanId ? 0 : 5);
      if (score < bestScore) {
        bestScore = score;
        best = u;
      }
    }
    return best;
  }

  unitKindsTexture(kind: UnitKind): string {
    return shipKey(kind, this.colorOf(this.humanId < 0 ? 0 : this.humanId));
  }

  get boxDepth(): number {
    return DEPTH.box;
  }
}

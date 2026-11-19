import Phaser from 'phaser';
import { DIFFICULTIES } from '../data/factions';
import { ARMOR_LABEL, BUILDABLE_SHIPS, BUILD_HOTKEYS, ECONOMY, UNITS, type UnitKind } from '../data/units';
import { sfx } from '../render/audio';
import { shipKey } from '../render/textures';
import { TICK_RATE, type Unit } from '../sim/types';
import type { GameScene } from './GameScene';

const FONT = 'Rajdhani, sans-serif';
const PANEL = 0x0a0f22;
const BORDER = 0x2b3d6b;
const BTN = 56;
const GAP = 6;
const COLS = 5;

interface ButtonSpec {
  icon: string;
  iconScale?: number;
  hotkey?: string;
  label?: string;
  enabled: boolean;
  progress?: number;
  title: string;
  body: string;
  onClick: () => void;
}

interface CardButton {
  bg: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Image;
  hotkey: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Rectangle;
  spec: ButtonSpec | null;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function text(scene: Phaser.Scene, x: number, y: number, s: string, size: number, color = '#dbe4ff', bold = false) {
  return scene.add.text(x, y, s, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    fontStyle: bold ? 'bold' : 'normal',
  });
}

function fmtTime(ticks: number): string {
  const s = Math.floor(ticks / TICK_RATE);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class HudScene extends Phaser.Scene {
  private gs!: GameScene;
  private bg!: Phaser.GameObjects.Graphics;
  private minimap!: Phaser.GameObjects.Graphics;
  private mmRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private mmScale = 1;
  private topRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private panelRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private cardRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  private minerals!: Phaser.GameObjects.Text;
  private supply!: Phaser.GameObjects.Text;
  private planetsText!: Phaser.GameObjects.Text;
  private clock!: Phaser.GameObjects.Text;
  private topButtons: { t: Phaser.GameObjects.Text; action: () => void }[] = [];

  private panelTitle!: Phaser.GameObjects.Text;
  private panelBody!: Phaser.GameObjects.Text;
  private panelIcons: Phaser.GameObjects.Container[] = [];
  private panelBar!: Phaser.GameObjects.Graphics;
  private panelKey = '';

  private buttons: CardButton[] = [];
  private tooltip!: Phaser.GameObjects.Container;
  private tooltipText!: Phaser.GameObjects.Text;
  private tooltipBg!: Phaser.GameObjects.Rectangle;

  private messages: Phaser.GameObjects.Text[] = [];
  private lastAlert: { x: number; y: number } | null = null;
  private overlay: Phaser.GameObjects.Container | null = null;
  private overlayKind: 'help' | 'confirm' | 'over' | null = null;
  private pauseText!: Phaser.GameObjects.Text;
  private armedText!: Phaser.GameObjects.Text;
  private mmDragging = false;

  constructor() {
    super('Hud');
  }

  create(): void {
    this.gs = this.scene.get('Game') as GameScene;
    this.gs.hud = this;
    this.messages = [];
    this.buttons = [];
    this.topButtons = [];
    this.panelIcons = [];
    this.overlay = null;
    this.overlayKind = null;
    this.panelKey = '';

    this.bg = this.add.graphics();
    this.minimap = this.add.graphics();
    this.panelBar = this.add.graphics();

    this.minerals = text(this, 0, 0, '', 20, '#7ff3ff', true);
    this.supply = text(this, 0, 0, '', 20, '#dbe4ff', true);
    this.planetsText = text(this, 0, 0, '', 20, '#dbe4ff', true);
    this.clock = text(this, 0, 0, '', 20, '#9fb0d8', true).setOrigin(0.5, 0);
    const mk = (label: string, action: () => void) => {
      const t = text(this, 0, 0, label, 17, '#9fb0d8', true).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => t.setColor('#ffffff'));
      t.on('pointerout', () => t.setColor('#9fb0d8'));
      t.on('pointerdown', () => {
        sfx.unlock();
        sfx.play('click');
        action();
      });
      this.topButtons.push({ t, action });
    };
    mk('VELOCITÀ', () => this.gs.changeSpeed(this.gs.speedIndex >= 4 ? -4 : 1));
    mk('PAUSA', () => this.gs.togglePause());
    mk('AUDIO', () => this.message(sfx.toggleMute() ? 'Audio disattivato' : 'Audio attivato'));
    mk('AIUTO', () => this.toggleHelp());
    mk('MENU', () => this.showMenuConfirm());

    this.panelTitle = text(this, 0, 0, '', 20, '#ffffff', true);
    this.panelBody = text(this, 0, 0, '', 16, '#b8c4e6').setLineSpacing(2);

    for (let i = 0; i < COLS * 2; i++) this.buttons.push(this.createButton());

    this.tooltipBg = this.add.rectangle(0, 0, 10, 10, 0x070b1a, 0.96).setOrigin(0, 0).setStrokeStyle(1, BORDER);
    this.tooltipText = text(this, 10, 8, '', 16, '#dbe4ff').setWordWrapWidth(300).setLineSpacing(2);
    this.tooltip = this.add.container(0, 0, [this.tooltipBg, this.tooltipText]).setVisible(false).setDepth(50);

    this.pauseText = text(this, 0, 0, 'PAUSA', 48, '#ffffff', true).setOrigin(0.5).setFontFamily('Orbitron, sans-serif').setVisible(false);
    this.armedText = text(this, 0, 0, 'ATTACCO-MOVIMENTO: clicca un punto o un nemico (Esc annulla)', 18, '#ff8a80', true)
      .setOrigin(0.5)
      .setVisible(false);

    // minimappa
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!inRect(this.mmRect, p.x, p.y) || this.overlay) return;
      const w = this.minimapToWorld(p.x, p.y);
      if (p.button === 2) this.gs.controls.moveTo(w.x, w.y);
      else if (p.button === 0) {
        this.mmDragging = true;
        this.gs.centerOn(w.x, w.y);
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.mmDragging && p.isDown) {
        const w = this.minimapToWorld(p.x, p.y);
        this.gs.centerOn(w.x, w.y);
      }
    });
    this.input.on('pointerup', () => (this.mmDragging = false));

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', this.layout, this));

    if (this.gs.humanId >= 0) {
      this.message('Estrai minerali, conquista i pianeti e distruggi la Nave Madre nemica!', '#ffd54f');
      this.message('Premi F1 o AIUTO per i comandi', '#9fb0d8');
    }
  }

  // ------------------------------------------------------------ layout

  private layout(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const world = this.gs.world;
    const compact = W < 900;

    this.topRect = { x: 0, y: 0, w: W, h: 38 };
    const mmMax = compact ? 130 : 190;
    this.mmScale = Math.min(mmMax / world.width, mmMax / world.height);
    const mmW = world.width * this.mmScale;
    const mmH = world.height * this.mmScale;
    this.mmRect = { x: 10, y: H - mmH - 10, w: mmW, h: mmH };

    const cardW = COLS * BTN + (COLS - 1) * GAP + 16;
    const cardH = 2 * BTN + GAP + 16;
    this.cardRect = { x: W - cardW - 10, y: H - cardH - 10, w: cardW, h: cardH };
    const px = this.mmRect.x + this.mmRect.w + 10;
    const pw = Math.max(160, this.cardRect.x - 10 - px);
    this.panelRect = { x: px, y: H - cardH - 10, w: pw, h: cardH };

    const g = this.bg;
    g.clear();
    g.fillStyle(PANEL, 0.88);
    g.fillRect(0, 0, W, 38);
    g.lineStyle(1, BORDER, 1);
    g.lineBetween(0, 38, W, 38);
    for (const r of [this.panelRect, this.cardRect, { x: this.mmRect.x - 4, y: this.mmRect.y - 4, w: this.mmRect.w + 8, h: this.mmRect.h + 8 }]) {
      g.fillStyle(PANEL, 0.9);
      g.fillRoundedRect(r.x, r.y, r.w, r.h, 6);
      g.lineStyle(1, BORDER, 1);
      g.strokeRoundedRect(r.x, r.y, r.w, r.h, 6);
    }

    this.minerals.setPosition(14, 8);
    this.supply.setPosition(compact ? 150 : 210, 8);
    this.planetsText.setPosition(compact ? 260 : 360, 8);
    this.clock.setPosition(W / 2, 8).setVisible(!compact);
    let x = W - 12;
    for (let i = this.topButtons.length - 1; i >= 0; i--) {
      const t = this.topButtons[i].t;
      t.setPosition(x - t.width, 9);
      x -= t.width + 18;
    }

    this.panelTitle.setPosition(this.panelRect.x + 12, this.panelRect.y + 8);
    this.panelBody.setPosition(this.panelRect.x + 12, this.panelRect.y + 36).setWordWrapWidth(this.panelRect.w - 24);
    this.panelKey = '';

    this.buttons.forEach((b, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const bx = this.cardRect.x + 8 + col * (BTN + GAP);
      const by = this.cardRect.y + 8 + row * (BTN + GAP);
      b.bg.setPosition(bx, by);
      b.icon.setPosition(bx + BTN / 2, by + BTN / 2 - 3);
      b.hotkey.setPosition(bx + 4, by + 2);
      b.label.setPosition(bx + BTN - 4, by + BTN - 2);
      b.bar.setPosition(bx + 2, by + BTN - 5);
    });

    this.pauseText.setPosition(W / 2, H / 2 - 60);
    this.armedText.setPosition(W / 2, 62);
    this.messages.forEach((m, i) => m.setPosition(W / 2, 92 + i * 26));
    if (this.overlay && this.overlayKind) {
      const kind = this.overlayKind;
      this.closeOverlay();
      if (kind === 'help') {
        const wasPaused = this.pausedBeforeHelp;
        this.toggleHelp();
        this.pausedBeforeHelp = wasPaused;
      } else if (kind === 'over') this.showGameOver(this.gs.world.winner === this.gs.humanId);
      else this.showMenuConfirm(true);
    }
  }

  isOver(x: number, y: number): boolean {
    if (this.overlay) return true;
    return [this.topRect, this.panelRect, this.cardRect, this.mmRect].some((r) => inRect(r, x, y));
  }

  // ------------------------------------------------------------ pulsanti

  private createButton(): CardButton {
    const bg = this.add.rectangle(0, 0, BTN, BTN, 0x121a36, 1).setOrigin(0, 0).setStrokeStyle(1, BORDER).setInteractive({ useHandCursor: true });
    const icon = this.add.image(0, 0, 'icon_stop');
    const hotkey = text(this, 0, 0, '', 14, '#ffd54f', true);
    const label = text(this, 0, 0, '', 13, '#7ff3ff', true).setOrigin(1, 1);
    const bar = this.add.rectangle(0, 0, BTN - 4, 3, 0x76ff7a, 1).setOrigin(0, 0);
    const b: CardButton = { bg, icon, hotkey, label, bar, spec: null };
    bg.on('pointerover', () => {
      if (!b.spec) return;
      bg.setStrokeStyle(1, 0x7fa6ff);
      this.showTooltip(b.spec, bg.x, bg.y);
    });
    bg.on('pointerout', () => {
      bg.setStrokeStyle(1, BORDER);
      this.tooltip.setVisible(false);
    });
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!b.spec || p.button !== 0) return;
      sfx.unlock();
      b.spec.onClick();
    });
    return b;
  }

  private setButton(i: number, spec: ButtonSpec | null): void {
    const b = this.buttons[i];
    b.spec = spec;
    const vis = spec !== null;
    b.bg.setVisible(vis);
    b.icon.setVisible(vis);
    b.hotkey.setVisible(vis);
    b.label.setVisible(vis);
    b.bar.setVisible(vis && spec?.progress !== undefined);
    if (!spec) {
      b.bg.disableInteractive();
      return;
    }
    b.bg.setInteractive({ useHandCursor: true });
    b.icon.setTexture(spec.icon).setScale(spec.iconScale ?? 0.75).setAlpha(spec.enabled ? 1 : 0.35);
    b.bg.setFillStyle(spec.enabled ? 0x121a36 : 0x0c1126, 1);
    b.hotkey.setText(spec.hotkey ?? '');
    b.label.setText(spec.label ?? '').setColor(spec.enabled ? '#7ff3ff' : '#5a6c8c');
    if (spec.progress !== undefined) b.bar.width = (BTN - 4) * Math.max(0.02, spec.progress);
  }

  private showTooltip(spec: ButtonSpec, bx: number, by: number): void {
    this.tooltipText.setText([spec.title, '', spec.body]);
    const w = Math.max(220, this.tooltipText.width + 20);
    const h = this.tooltipText.height + 16;
    this.tooltipBg.setSize(w, h);
    const x = Math.min(bx, this.scale.width - w - 8);
    this.tooltip.setPosition(x, by - h - 8).setVisible(true);
  }

  private shipIconScale(kind: UnitKind): number {
    const r = UNITS[kind].radius;
    return Math.min(1.1, 21 / (r * 2.2));
  }

  private buildSpec(kind: UnitKind, hk: string): ButtonSpec {
    const gs = this.gs;
    const def = UNITS[kind];
    const f = gs.world.factions[gs.humanId];
    const supplyOk = gs.world.supplyUsed(gs.humanId) + def.supply <= gs.world.supplyCap(gs.humanId);
    const wp = def.weapon;
    const lines = [def.description, '', `Costo: ${def.cost} minerali  ·  Flotta: ${def.supply}  ·  Tempo: ${def.buildTime}s`];
    lines.push(`Scafo: ${def.hp}  ·  Armatura ${ARMOR_LABEL[def.armor]}  ·  Velocità ${def.speed}`);
    if (wp) lines.push(`${wp.name}: ${Math.round((wp.damage / wp.cooldown) * 10) / 10} danni/s, gittata ${wp.range}`);
    if (!supplyOk) lines.push('', 'Limite flotta raggiunto: conquista altri pianeti.');
    return {
      icon: shipKey(kind, gs.humanId),
      iconScale: this.shipIconScale(kind),
      hotkey: hk,
      label: String(def.cost),
      enabled: f.minerals >= def.cost && supplyOk,
      title: `${def.name} — ${def.role}`,
      body: lines.join('\n'),
      onClick: () => gs.build(kind),
    };
  }

  private refreshCard(): void {
    const gs = this.gs;
    const specs: (ButtonSpec | null)[] = new Array(COLS * 2).fill(null);
    const own = gs.ownSelected();
    const mother = own.find((u) => u.kind === 'mothership');
    const planet = gs.selectedPlanet >= 0 ? gs.world.planets[gs.selectedPlanet] : undefined;

    if (mother && own.length === 1) {
      BUILDABLE_SHIPS.forEach((k, i) => (specs[i] = this.buildSpec(k, BUILD_HOTKEYS[i])));
      mother.queue.slice(0, COLS).forEach((q, i) => {
        const def = UNITS[q.kind];
        const active = i < ECONOMY.productionSlots;
        specs[COLS + i] = {
          icon: shipKey(q.kind, gs.humanId),
          iconScale: this.shipIconScale(q.kind),
          enabled: active,
          progress: active ? q.progress / def.buildTime : 0,
          label: active ? `${Math.ceil(def.buildTime - q.progress)}s` : '',
          title: `${def.name} in ${active ? 'costruzione' : 'coda'}`,
          body: 'Clicca per annullare e recuperare i minerali.',
          onClick: () => {
            gs.issue({ type: 'cancel', structureId: mother.id, index: i });
            sfx.play('click');
          },
        };
      });
    } else if (planet && planet.owner === gs.humanId) {
      const def = UNITS.turret;
      const f = gs.world.factions[gs.humanId];
      const room = planet.turretIds.length + planet.queue.length < ECONOMY.turretsPerPlanet;
      specs[0] = {
        icon: shipKey('turret', gs.humanId),
        iconScale: 0.8,
        hotkey: 'Q',
        label: String(def.cost),
        enabled: room && f.minerals >= def.cost,
        title: 'Torretta — Difesa planetaria',
        body: `${def.description}\n\nCosto: ${def.cost} minerali  ·  Tempo: ${def.buildTime}s\nMassimo ${ECONOMY.turretsPerPlanet} per pianeta.`,
        onClick: () => {
          if (!gs.issue({ type: 'buildTurret', planetId: planet.id })) sfx.play('click');
        },
      };
      planet.queue.forEach((q, i) => {
        specs[COLS + i] = {
          icon: shipKey('turret', gs.humanId),
          iconScale: 0.8,
          enabled: i === 0,
          progress: i === 0 ? q.progress / def.buildTime : 0,
          label: i === 0 ? `${Math.ceil(def.buildTime - q.progress)}s` : '',
          title: 'Torretta in costruzione',
          body: 'Clicca per annullare e recuperare i minerali.',
          onClick: () => gs.issue({ type: 'cancelTurret', planetId: planet.id, index: i }),
        };
      });
    } else {
      const ships = own.filter((u) => !UNITS[u.kind].structure);
      const armed = ships.some((u) => UNITS[u.kind].weapon);
      const miners = ships.some((u) => u.kind === 'miner');
      if (ships.length) {
        let i = 0;
        if (armed)
          specs[i++] = {
            icon: 'icon_attack',
            hotkey: 'A',
            enabled: true,
            title: 'Attacco-movimento',
            body: 'Le navi avanzano verso il punto attaccando ogni nemico incontrato.',
            onClick: () => gs.controls.armAttackMove(),
          };
        specs[i++] = {
          icon: 'icon_stop',
          hotkey: 'S',
          enabled: true,
          title: 'Fermati',
          body: 'Annulla gli ordini. Le navi armate difendono la posizione.',
          onClick: () => gs.controls.stop(false),
        };
        specs[i++] = {
          icon: 'icon_hold',
          hotkey: 'H',
          enabled: true,
          title: 'Mantieni posizione',
          body: 'Le navi non si muovono, ma sparano a chi entra in gittata.',
          onClick: () => gs.controls.stop(true),
        };
        if (miners) {
          specs[i++] = {
            icon: 'icon_harvest',
            hotkey: 'G',
            enabled: true,
            title: 'Estrai',
            body: "I minatori vanno all'asteroide libero più vicino. Puoi anche cliccare col destro su un asteroide.",
            onClick: () => gs.controls.harvest(),
          };
          specs[i++] = {
            icon: 'icon_return',
            hotkey: 'B',
            enabled: true,
            title: 'Rientra',
            body: 'I minatori scaricano subito il carico alla Nave Madre.',
            onClick: () => gs.controls.returnCargo(),
          };
        }
      }
    }
    specs.forEach((s, i) => this.setButton(i, s));
  }

  // ------------------------------------------------------------ pannello selezione

  private refreshPanel(): void {
    const gs = this.gs;
    const units = gs.selectedUnits();
    const planet = gs.selectedPlanet >= 0 ? gs.world.planets[gs.selectedPlanet] : undefined;
    const bar = this.panelBar;
    bar.clear();

    const kindsKey = units.map((u) => u.kind).sort().join(',');
    const key = planet ? `p${planet.id}` : units.length === 1 ? `u${units[0].id}` : `m${kindsKey}`;
    const rebuildIcons = key !== this.panelKey;
    this.panelKey = key;
    if (rebuildIcons) {
      this.panelIcons.forEach((c) => c.destroy());
      this.panelIcons = [];
    }

    const r = this.panelRect;
    if (planet) {
      const owner = planet.owner >= 0 ? gs.world.factions[planet.owner] : null;
      this.panelTitle.setText(`Pianeta ${planet.name}`).setColor('#ffee58');
      const lines = [
        `Controllo: ${owner ? owner.name : 'neutrale'}`,
        `Rendita: +${planet.income} minerali/s  ·  Flotta: +${planet.supply}`,
        `Torrette: ${planet.turretIds.length}/${ECONOMY.turretsPerPlanet}`,
      ];
      if (planet.contested) lines.push('Conteso! Elimina le navi nemiche nella zona.');
      else if (planet.progress > 0 && planet.captureFaction >= 0)
        lines.push(`Conquista (${gs.world.factions[planet.captureFaction].name}): ${Math.round(planet.progress * 100)}%`);
      else if (!owner) lines.push('Porta navi da combattimento nella zona per conquistarlo.');
      this.panelBody.setText(lines);
      return;
    }
    if (units.length === 0) {
      this.panelTitle.setText('').setColor('#ffffff');
      this.panelBody.setText(
        gs.humanId >= 0
          ? ['Nessuna selezione.', 'Clicca o trascina per selezionare le navi. C = Nave Madre, Z = flotta, X = minatori.']
          : ['Modalità spettatore'],
      );
      return;
    }
    if (units.length === 1) {
      const u = units[0];
      const def = UNITS[u.kind];
      const own = u.faction === gs.humanId;
      const fac = gs.world.factions[u.faction];
      this.panelTitle.setText(own ? def.name : `${def.name} (${fac.name})`).setColor(own ? '#ffffff' : '#ff8a80');
      const lines = [`${def.role}  ·  Armatura ${ARMOR_LABEL[def.armor]}`];
      const frac = u.hp / u.maxHp;
      bar.fillStyle(0x000000, 0.6);
      bar.fillRect(r.x + 12, r.y + 36, Math.min(220, r.w - 24), 10);
      bar.fillStyle(frac > 0.6 ? 0x66ff88 : frac > 0.3 ? 0xffd54f : 0xff5252, 1);
      bar.fillRect(r.x + 12, r.y + 36, Math.min(220, r.w - 24) * frac, 10);
      lines.unshift(`Scafo ${Math.ceil(u.hp)} / ${u.maxHp}`);
      if (def.weapon) lines.push(`${def.weapon.name}: ${Math.round((def.weapon.damage / def.weapon.cooldown) * 10) / 10} danni/s  ·  gittata ${def.weapon.range}`);
      if (def.cargo) lines.push(`Carico: ${Math.floor(u.cargo)} / ${def.cargo}  ·  ${this.minerState(u)}`);
      if (def.repairRate) lines.push(`Riparazione: ${def.repairRate} punti/s entro ${def.repairRange}`);
      if (u.kind === 'mothership' && own) lines.push(`In coda: ${u.queue.length}/${ECONOMY.queueLimit}  ·  Click destro: punto di raccolta`);
      this.panelBody.setText(['', ...lines]);
      return;
    }

    // selezione multipla: icone per tipo, cliccabili per filtrare
    this.panelTitle.setText(`${units.length} unità selezionate`).setColor('#ffffff');
    this.panelBody.setText('');
    if (!rebuildIcons) return;
    const counts = new Map<UnitKind, number>();
    for (const u of units) counts.set(u.kind, (counts.get(u.kind) ?? 0) + 1);
    let i = 0;
    for (const [kind, n] of counts) {
      const cx = r.x + 12 + (i % 6) * 60;
      const cy = r.y + 40 + Math.floor(i / 6) * 50;
      const box = this.add.rectangle(0, 0, 54, 44, 0x121a36, 1).setOrigin(0, 0).setStrokeStyle(1, BORDER).setInteractive({ useHandCursor: true });
      const img = this.add.image(27, 20, shipKey(kind, gs.humanId)).setScale(this.shipIconScale(kind) * 0.8);
      const t = text(this, 50, 42, `${n}`, 15, '#ffffff', true).setOrigin(1, 1);
      const c = this.add.container(cx, cy, [box, img, t]);
      box.on('pointerdown', () => {
        gs.select(units.filter((u) => u.kind === kind).map((u) => u.id));
        sfx.play('click');
      });
      this.panelIcons.push(c);
      i++;
    }
  }

  private minerState(u: Unit): string {
    if (u.order.type !== 'harvest') return 'inattivo';
    return u.mineState === 'mining' ? 'estrazione' : u.mineState === 'returning' ? 'rientro' : 'verso asteroide';
  }

  // ------------------------------------------------------------ minimappa

  private minimapToWorld(x: number, y: number): { x: number; y: number } {
    return { x: (x - this.mmRect.x) / this.mmScale, y: (y - this.mmRect.y) / this.mmScale };
  }

  private drawMinimap(): void {
    const g = this.minimap;
    const gs = this.gs;
    const w = gs.world;
    const s = this.mmScale;
    const ox = this.mmRect.x;
    const oy = this.mmRect.y;
    g.clear();
    g.fillStyle(0x03050d, 1);
    g.fillRect(ox, oy, this.mmRect.w, this.mmRect.h);
    g.fillStyle(0x6b625a, 1);
    for (const a of w.asteroids) if (a.amount > 0) g.fillRect(ox + a.x * s - 1, oy + a.y * s - 1, 2, 2);
    for (const p of w.planets) {
      const col = p.owner >= 0 ? w.factions[p.owner].color : 0x56607a;
      g.fillStyle(col, p.owner >= 0 ? 0.9 : 0.6);
      g.fillCircle(ox + p.x * s, oy + p.y * s, Math.max(3, p.radius * s));
      if (p.progress > 0) {
        g.lineStyle(1, 0xffffff, 0.8);
        g.strokeCircle(ox + p.x * s, oy + p.y * s, Math.max(3, p.radius * s) + 2);
      }
    }
    for (const u of w.units) {
      if (!gs.view.isVisible(u)) continue;
      const col = w.factions[u.faction].color;
      const size = u.kind === 'mothership' ? 6 : UNITS[u.kind].structure ? 3 : 2;
      g.fillStyle(gs.selection.has(u.id) ? 0xffffff : col, 1);
      g.fillRect(ox + u.x * s - size / 2, oy + u.y * s - size / 2, size, size);
    }
    if (this.lastAlert && gs.time.now % 600 < 300) {
      g.lineStyle(2, 0xff5252, 1);
      g.strokeCircle(ox + this.lastAlert.x * s, oy + this.lastAlert.y * s, 8);
    }
    const v = gs.cameras.main.worldView;
    g.lineStyle(1, 0xffffff, 0.8);
    const vx = Math.max(ox, ox + v.x * s);
    const vy = Math.max(oy, oy + v.y * s);
    const vr = Math.min(ox + this.mmRect.w, ox + v.right * s);
    const vb = Math.min(oy + this.mmRect.h, oy + v.bottom * s);
    g.strokeRect(vx, vy, Math.max(2, vr - vx), Math.max(2, vb - vy));
  }

  // ------------------------------------------------------------ messaggi

  message(msg: string, color = '#dbe4ff', alert?: { x: number; y: number }): void {
    if (alert) {
      this.lastAlert = alert;
      this.time.delayedCall(4000, () => {
        if (this.lastAlert === alert) this.lastAlert = null;
      });
    }
    if (this.messages.some((m) => m.text === msg)) return;
    const t = text(this, this.scale.width / 2, 0, msg, 20, color, true).setOrigin(0.5, 0).setStroke('#000000', 4);
    this.messages.push(t);
    if (this.messages.length > 4) this.messages.shift()?.destroy();
    this.messages.forEach((m, i) => m.setY(92 + i * 26));
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 3200,
      duration: 600,
      onComplete: () => {
        this.messages = this.messages.filter((m) => m !== t);
        t.destroy();
        this.messages.forEach((m, i) => m.setY(92 + i * 26));
      },
    });
  }

  // ------------------------------------------------------------ overlay

  private closeOverlay(): void {
    this.overlay?.destroy();
    this.overlay = null;
    this.overlayKind = null;
  }

  private makeOverlay(width: number, height: number): { c: Phaser.GameObjects.Container; x: number; y: number } {
    const W = this.scale.width;
    const H = this.scale.height;
    const shade = this.add.rectangle(0, 0, W, H, 0x000000, 0.6).setOrigin(0, 0).setInteractive();
    const bw = Math.min(width, W - 20);
    const bh = Math.min(height, H - 20);
    const x = (W - bw) / 2;
    const y = (H - bh) / 2;
    const box = this.add.rectangle(x, y, bw, bh, PANEL, 0.97).setOrigin(0, 0).setStrokeStyle(2, BORDER);
    const c = this.add.container(0, 0, [shade, box]).setDepth(100);
    this.overlay = c;
    return { c, x, y };
  }

  private overlayButton(c: Phaser.GameObjects.Container, x: number, y: number, label: string, action: () => void): void {
    const t = text(this, x, y, label, 22, '#ffffff', true).setOrigin(0.5).setFontFamily('Orbitron, sans-serif');
    const bg = this.add
      .rectangle(x, y, t.width + 40, 46, 0x1b2a55, 1)
      .setStrokeStyle(2, 0x4f7bd6)
      .setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x27407d));
    bg.on('pointerout', () => bg.setFillStyle(0x1b2a55));
    bg.on('pointerdown', () => {
      sfx.play('click');
      action();
    });
    c.add([bg, t]);
  }

  private pausedBeforeHelp = false;

  toggleHelp(): void {
    if (this.overlayKind === 'help') {
      this.closeOverlay();
      this.gs.paused = this.pausedBeforeHelp;
      return;
    }
    if (this.overlay) return;
    this.pausedBeforeHelp = this.gs.paused;
    if (!this.gs.world.over) this.gs.paused = true;
    this.overlayKind = 'help';
    const { c, x, y } = this.makeOverlay(760, 450);
    const title = text(this, x + 24, y + 18, 'COMANDI', 26, '#ffd54f', true).setFontFamily('Orbitron, sans-serif');
    const left = [
      'Click sinistro — seleziona (Shift: aggiungi)',
      'Trascina — selezione a riquadro',
      'Doppio click — tutte le navi dello stesso tipo',
      'Click destro — muovi / attacca / estrai',
      'A + click — attacco-movimento',
      'S — fermati     H — mantieni posizione',
      'G — estrai     B — rientra col carico',
      'Shift/Ctrl + 1-9 — crea gruppo, 1-9 richiama',
      'Z — tutta la flotta   X — minatori   C — Nave Madre',
    ];
    const right = [
      'Q W E R T — produci (Nave Madre selezionata)',
      'Q — torretta (pianeta tuo selezionato)',
      'Frecce / bordi schermo / tasto centrale — camera',
      'Rotella — zoom     Spazio — centra la selezione',
      'Minimappa: sinistro sposta, destro muove le navi',
      'P — pausa   + / − — velocità   M — audio',
      '',
      'Contromosse: Caccia > Corazzate e Minatori,',
      'Fregate > Caccia, Corazzate > Fregate e strutture.',
      'I pianeti danno minerali e aumentano il limite flotta.',
    ];
    const colW = Math.min(360, (this.scale.width - 80) / 2);
    const l = text(this, x + 24, y + 70, left.join('\n'), 17, '#dbe4ff').setLineSpacing(8).setWordWrapWidth(colW);
    const r = text(this, x + 24 + colW + 16, y + 70, right.join('\n'), 17, '#dbe4ff').setLineSpacing(8).setWordWrapWidth(colW);
    c.add([title, l, r]);
    const box = c.list[1] as Phaser.GameObjects.Rectangle;
    this.overlayButton(c, x + box.width / 2, y + box.height - 40, 'CHIUDI', () => this.toggleHelp());
  }

  private showMenuConfirm(relayout = false): void {
    if (this.overlay) return;
    this.overlayKind = 'confirm';
    if (!relayout) this.pausedBeforeHelp = this.gs.paused;
    this.gs.paused = true;
    const { c, x, y } = this.makeOverlay(460, 200);
    const box = c.list[1] as Phaser.GameObjects.Rectangle;
    c.add(text(this, x + box.width / 2, y + 50, 'Abbandonare la partita?', 24, '#ffffff', true).setOrigin(0.5));
    this.overlayButton(c, x + box.width / 2 - 100, y + 130, 'MENU', () => this.gs.toMenu());
    this.overlayButton(c, x + box.width / 2 + 100, y + 130, 'ANNULLA', () => {
      this.gs.paused = this.pausedBeforeHelp;
      this.closeOverlay();
    });
  }

  showGameOver(won: boolean): void {
    this.closeOverlay();
    this.overlayKind = 'over';
    const gs = this.gs;
    const w = gs.world;
    const { c, x, y } = this.makeOverlay(720, 460);
    const box = c.list[1] as Phaser.GameObjects.Rectangle;
    const spectate = gs.humanId < 0;
    const titleStr = spectate ? 'FINE SIMULAZIONE' : won ? 'VITTORIA' : 'SCONFITTA';
    const title = text(this, x + box.width / 2, y + 44, titleStr, 44, spectate ? '#ffd54f' : won ? '#76ff7a' : '#ff5a52', true)
      .setOrigin(0.5)
      .setFontFamily('Orbitron, sans-serif');
    const sub = text(
      this,
      x + box.width / 2,
      y + 88,
      `Durata ${fmtTime(w.tick)}  ·  ${w.map.name}  ·  IA ${DIFFICULTIES[gs.config.difficulty].label}`,
      18,
      '#9fb0d8',
    ).setOrigin(0.5);
    c.add([title, sub]);
    const cols = ['Fazione', 'Minerali', 'Costruite', 'Distrutte', 'Perse', 'Pianeti'];
    const colX = [0, 190, 290, 390, 490, 570].map((v) => x + 30 + v * Math.min(1, (box.width - 60) / 660));
    cols.forEach((h, i) => c.add(text(this, colX[i], y + 126, h, 17, '#ffd54f', true)));
    w.factions.forEach((f, row) => {
      const vals = [
        f.name + (f.alive ? '' : ' ✝'),
        String(Math.round(f.stats.mined + f.stats.income)),
        String(f.stats.built),
        String(f.stats.killed),
        String(f.stats.lost),
        String(f.stats.planetsCaptured),
      ];
      vals.forEach((v, i) => c.add(text(this, colX[i], y + 158 + row * 30, v, 18, i === 0 ? '#' + f.color.toString(16).padStart(6, '0') : '#dbe4ff', i === 0)));
    });
    this.overlayButton(c, x + box.width / 2 - 120, y + box.height - 50, 'RIGIOCA', () => gs.restart());
    this.overlayButton(c, x + box.width / 2 + 120, y + box.height - 50, 'MENU', () => gs.toMenu());
  }

  /** Tasti gestiti dall'HUD prima dei comandi di gioco. Restituisce true se consumato. */
  handleKey(e: KeyboardEvent): boolean {
    if (this.overlayKind === 'help' && (e.code === 'Escape' || e.code === 'F1')) {
      e.preventDefault();
      this.toggleHelp();
      return true;
    }
    return this.overlay !== null;
  }

  // ------------------------------------------------------------ per frame

  private cardTimer = 0;

  update(_t: number, delta: number): void {
    const gs = this.gs;
    const w = gs.world;
    if (gs.humanId >= 0) {
      const f = w.factions[gs.humanId];
      const inc = w.incomeRate(gs.humanId);
      this.minerals.setText(`◆ ${Math.floor(f.minerals)}${inc > 0 ? `  +${inc.toFixed(1)}/s` : ''}`);
      const used = w.supplyUsed(gs.humanId);
      const cap = w.supplyCap(gs.humanId);
      this.supply.setText(`Flotta ${used}/${cap}`).setColor(used >= cap ? '#ff8a80' : '#dbe4ff');
      this.planetsText.setText(`Pianeti ${w.planets.filter((p) => p.owner === gs.humanId).length}/${w.planets.length}`);
    }
    this.clock.setText(`${fmtTime(w.tick)}${gs.speed !== 1 ? `  ·  ${gs.speed}x` : ''}`);
    this.pauseText.setVisible(gs.paused && !this.overlay);
    this.armedText.setVisible(gs.controls.attackMoveArmed);

    this.cardTimer -= delta;
    if (this.cardTimer <= 0) {
      this.cardTimer = 100;
      this.refreshCard();
      this.refreshPanel();
      // aggiorna il tooltip aperto
      const hovered = this.buttons.find((b) => b.spec && this.tooltip.visible && b.bg.getBounds().contains(this.input.activePointer.x, this.input.activePointer.y));
      if (hovered?.spec) this.showTooltip(hovered.spec, hovered.bg.x, hovered.bg.y);
    }
    this.drawMinimap();
  }
}

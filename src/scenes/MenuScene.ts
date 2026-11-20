import Phaser from 'phaser';
import { DIFFICULTIES, DOCTRINES, DOCTRINE_ORDER, FACTION_STYLES, type Difficulty } from '../data/factions';
import { MAPS } from '../data/maps';
import { BUILDABLE_SHIPS, UNITS } from '../data/units';
import type { MatchConfig } from '../game/Match';
import { sfx } from '../render/audio';
import { shipKey } from '../render/textures';

const FONT = 'Rajdhani, sans-serif';
const TITLE_FONT = 'Orbitron, sans-serif';
const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];

interface Settings {
  mapIndex: number;
  aiCount: number;
  diff: number;
  doctrine: number;
}

function loadSettings(): Settings {
  const def = { mapIndex: 0, aiCount: 1, diff: 1, doctrine: 0 };
  try {
    const raw = localStorage.getItem('nd-settings');
    if (!raw) return def;
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      mapIndex: Phaser.Math.Clamp(Number(s.mapIndex) || 0, 0, MAPS.length - 1),
      aiCount: Phaser.Math.Clamp(Number(s.aiCount) || 1, 1, 3),
      diff: Phaser.Math.Clamp(Number(s.diff ?? 1), 0, 2),
      doctrine: Phaser.Math.Clamp(Number(s.doctrine ?? 0), 0, DOCTRINE_ORDER.length - 1),
    };
  } catch {
    return def;
  }
}

export class MenuScene extends Phaser.Scene {
  private settings!: Settings;
  private root!: Phaser.GameObjects.Container;
  private ships: { img: Phaser.GameObjects.Image; vx: number; vy: number }[] = [];

  constructor() {
    super('Menu');
  }

  create(): void {
    this.settings = loadSettings();
    this.ships = [];
    // navi che attraversano lo sfondo
    for (let i = 0; i < 14; i++) this.spawnShip(true);
    this.build();
    this.scale.on('resize', this.build, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', this.build, this));
    this.input.keyboard?.on('keydown-ENTER', () => this.start());
  }

  private spawnShip(anywhere: boolean): void {
    const { width, height } = this.scale;
    const kinds = ['fighter', 'fighter', 'frigate', 'miner', 'battleship'] as const;
    const kind = kinds[Phaser.Math.Between(0, kinds.length - 1)];
    const f = Phaser.Math.Between(0, 3);
    const dir = f % 2 === 0 ? 1 : -1;
    const speed = (UNITS[kind].speed * 0.4 + 10) * dir;
    const x = anywhere ? Phaser.Math.Between(0, width) : dir > 0 ? -40 : width + 40;
    const img = this.add
      .image(x, Phaser.Math.Between(40, height - 40), shipKey(kind, f))
      .setScale(0.5)
      .setAlpha(0.35)
      .setRotation(dir > 0 ? 0 : Math.PI)
      .setDepth(-1);
    this.ships.push({ img, vx: speed, vy: Phaser.Math.FloatBetween(-6, 6) });
  }

  private saveSettings(): void {
    try {
      localStorage.setItem('nd-settings', JSON.stringify(this.settings));
    } catch {
      /* storage non disponibile */
    }
  }

  private build(): void {
    this.root?.destroy();
    const { width: W, height: H } = this.scale;
    const c = this.add.container(0, 0);
    this.root = c;
    const cx = W / 2;
    const small = H < 700 || W < 760;
    let y = small ? 40 : Math.max(60, H * 0.1);

    const title = this.add
      .text(cx, y, 'NEBULA DOMINION', {
        fontFamily: TITLE_FONT,
        fontSize: `${Math.min(64, W / 12)}px`,
        fontStyle: 'bold',
        color: '#e8f4ff',
      })
      .setOrigin(0.5)
      .setShadow(0, 0, '#4fc3f7', 24, true, true);
    c.add(title);
    y += small ? 44 : 60;
    c.add(
      this.add
        .text(cx, y, 'Estrai. Conquista. Domina la nebulosa.', { fontFamily: FONT, fontSize: '22px', color: '#8fa6d6' })
        .setOrigin(0.5),
    );
    y += small ? 44 : 64;

    const map = MAPS[this.settings.mapIndex];
    const maxAi = map.maxPlayers - 1;
    this.settings.aiCount = Math.min(this.settings.aiCount, maxAi);

    const rows: { label: string; value: string; detail?: string; change: (d: number) => void }[] = [
      {
        label: 'MAPPA',
        value: map.name,
        detail: map.description,
        change: (d) => {
          this.settings.mapIndex = (this.settings.mapIndex + d + MAPS.length) % MAPS.length;
        },
      },
      {
        label: 'AVVERSARI IA',
        value: String(this.settings.aiCount),
        detail: this.settings.aiCount > 1 ? 'Tutti contro tutti' : 'Uno contro uno',
        change: (d) => {
          this.settings.aiCount = Phaser.Math.Clamp(this.settings.aiCount + d, 1, maxAi);
        },
      },
      {
        label: 'DIFFICOLTÀ',
        value: DIFFICULTIES[DIFFS[this.settings.diff]].label,
        detail: ['IA lenta e prudente', 'IA bilanciata', 'IA aggressiva con bonus di estrazione'][this.settings.diff],
        change: (d) => {
          this.settings.diff = Phaser.Math.Clamp(this.settings.diff + d, 0, 2);
        },
      },
      {
        label: 'LA TUA DOTTRINA',
        value: DOCTRINES[DOCTRINE_ORDER[this.settings.doctrine]].name,
        detail: DOCTRINES[DOCTRINE_ORDER[this.settings.doctrine]].traits.join('  ·  '),
        change: (d) => {
          const n = DOCTRINE_ORDER.length;
          this.settings.doctrine = (this.settings.doctrine + d + n) % n;
        },
      },
    ];

    const rowH = small ? 66 : 80;
    for (const row of rows) {
      c.add(this.add.text(cx, y, row.label, { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#ffd54f' }).setOrigin(0.5));
      c.add(this.add.text(cx, y + 26, row.value, { fontFamily: TITLE_FONT, fontSize: '22px', color: '#ffffff' }).setOrigin(0.5));
      if (row.detail)
        c.add(this.add.text(cx, y + 50, row.detail, { fontFamily: FONT, fontSize: '15px', color: '#7f8db0' }).setOrigin(0.5));
      const arrow = (dx: number, d: number, s: string) => {
        const a = this.add
          .text(cx + dx, y + 26, s, { fontFamily: TITLE_FONT, fontSize: '26px', color: '#4fc3f7' })
          .setOrigin(0.5)
          .setInteractive({ useHandCursor: true });
        a.on('pointerover', () => a.setColor('#ffffff'));
        a.on('pointerout', () => a.setColor('#4fc3f7'));
        a.on('pointerdown', () => {
          sfx.unlock();
          sfx.play('click');
          row.change(d);
          this.saveSettings();
          this.build();
        });
        c.add(a);
      };
      const half = Math.min(220, W / 2 - 30);
      arrow(-half, -1, '◀');
      arrow(half, 1, '▶');
      y += rowH;
    }

    // colori delle fazioni in gioco
    const n = this.settings.aiCount + 1;
    const chips = FACTION_STYLES.slice(0, n).map((s, i) => (i === 0 ? `■ Tu` : `■ ${s.name}`));
    const chipText = this.add.text(cx, y, '', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold' }).setOrigin(0.5);
    chipText.setText(chips.join('    ') + '   (dottrine IA casuali)');
    chipText.setColor('#cfd8e8');
    c.add(chipText);
    y += small ? 36 : 48;

    const btn = this.add
      .rectangle(cx, y, 300, 58, 0x1b2a55, 1)
      .setStrokeStyle(2, 0x4fc3f7)
      .setInteractive({ useHandCursor: true });
    const btnText = this.add.text(cx, y, 'INIZIA PARTITA', { fontFamily: TITLE_FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    btn.on('pointerover', () => btn.setFillStyle(0x27407d));
    btn.on('pointerout', () => btn.setFillStyle(0x1b2a55));
    btn.on('pointerdown', () => this.start());
    this.tweens.add({ targets: btn, alpha: 0.75, yoyo: true, repeat: -1, duration: 900 });
    c.add([btn, btnText]);
    y += small ? 50 : 70;

    // legenda delle navi
    if (H - y > 120) {
      const spacing = Math.min(150, (W - 40) / BUILDABLE_SHIPS.length);
      const startX = cx - (spacing * (BUILDABLE_SHIPS.length - 1)) / 2;
      BUILDABLE_SHIPS.forEach((k, i) => {
        const def = UNITS[k];
        const x = startX + i * spacing;
        c.add(this.add.image(x, y + 20, shipKey(k, 0)).setScale(Math.min(0.9, 24 / def.radius) * 0.5));
        c.add(this.add.text(x, y + 48, def.name, { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#dbe4ff' }).setOrigin(0.5));
        c.add(this.add.text(x, y + 68, def.role, { fontFamily: FONT, fontSize: '14px', color: '#7f8db0' }).setOrigin(0.5));
      });
    }

    c.add(
      this.add
        .text(cx, H - 16, 'Click sinistro seleziona · Click destro muove/attacca · F1 durante la partita per tutti i comandi', {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#5d6b8f',
        })
        .setOrigin(0.5, 1),
    );
  }

  private start(): void {
    sfx.unlock();
    sfx.play('click');
    const cfg: MatchConfig = {
      mapId: MAPS[this.settings.mapIndex].id,
      aiCount: this.settings.aiCount,
      difficulty: DIFFS[this.settings.diff],
      doctrine: DOCTRINE_ORDER[this.settings.doctrine],
    };
    this.saveSettings();
    this.scene.start('Game', cfg);
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    const { width } = this.scale;
    for (const s of this.ships) {
      s.img.x += s.vx * dt;
      s.img.y += s.vy * dt;
    }
    const before = this.ships.length;
    this.ships = this.ships.filter((s) => {
      const out = s.img.x < -80 || s.img.x > width + 80;
      if (out) s.img.destroy();
      return !out;
    });
    for (let i = this.ships.length; i < before; i++) this.spawnShip(false);
  }
}

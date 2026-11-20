import Phaser from 'phaser';
import { DIFFICULTIES, DOCTRINES, DOCTRINE_ORDER, FACTION_STYLES, type Difficulty } from '../data/factions';
import { RICHNESSES, RICHNESS_LABEL, SIZES, SIZE_LABEL, randomMapId } from '../data/mapgen';
import { MAPS, getMap } from '../data/maps';
import { BUILDABLE_SHIPS, UNITS } from '../data/units';
import type { MatchConfig } from '../game/Match';
import { sfx } from '../render/audio';
import { drawMapPreview } from '../render/mapPreview';
import { shipKey } from '../render/textures';

const FONT = 'Rajdhani, sans-serif';
const TITLE_FONT = 'Orbitron, sans-serif';
const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];

interface Settings {
  /** indice in MAPS; MAPS.length = mappa casuale */
  mapIndex: number;
  aiCount: number;
  diff: number;
  doctrine: number;
  size: number;
  richness: number;
  seed: number;
}

const RANDOM_INDEX = MAPS.length;

function newSeed(): number {
  return Math.floor(Math.random() * 90000) + 10000;
}

function loadSettings(): Settings {
  const def: Settings = { mapIndex: 0, aiCount: 1, diff: 1, doctrine: 0, size: 1, richness: 1, seed: newSeed() };
  try {
    const raw = localStorage.getItem('nd-settings');
    if (!raw) return def;
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      mapIndex: Phaser.Math.Clamp(Number(s.mapIndex) || 0, 0, RANDOM_INDEX),
      aiCount: Phaser.Math.Clamp(Number(s.aiCount) || 1, 1, 3),
      diff: Phaser.Math.Clamp(Number(s.diff ?? 1), 0, 2),
      doctrine: Phaser.Math.Clamp(Number(s.doctrine ?? 0), 0, DOCTRINE_ORDER.length - 1),
      size: Phaser.Math.Clamp(Number(s.size ?? 1), 0, SIZES.length - 1),
      richness: Phaser.Math.Clamp(Number(s.richness ?? 1), 0, RICHNESSES.length - 1),
      seed: Number(s.seed) > 0 ? Math.floor(Number(s.seed)) : def.seed,
    };
  } catch {
    return def;
  }
}

interface Row {
  label: string;
  value: string;
  detail?: string;
  change: (d: number) => void;
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

  /** Id della mappa scelta (fissa o casuale). */
  private mapId(): string {
    const st = this.settings;
    if (st.mapIndex < RANDOM_INDEX) return MAPS[st.mapIndex].id;
    return randomMapId({
      seed: st.seed,
      players: st.aiCount > 1 ? 4 : 2,
      size: SIZES[st.size],
      richness: RICHNESSES[st.richness],
    });
  }

  private build(): void {
    this.root?.destroy();
    const { width: W, height: H } = this.scale;
    const c = this.add.container(0, 0);
    this.root = c;
    const cx = W / 2;
    const small = H < 700 || W < 760;
    let y = small ? 40 : Math.max(56, H * 0.08);

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
    y += small ? 44 : 56;
    c.add(
      this.add
        .text(cx, y, 'Estrai. Conquista. Domina la nebulosa.', { fontFamily: FONT, fontSize: '22px', color: '#8fa6d6' })
        .setOrigin(0.5),
    );
    y += small ? 40 : 56;

    const st = this.settings;
    const isRandom = st.mapIndex === RANDOM_INDEX;
    const maxAi = isRandom ? 3 : MAPS[st.mapIndex].maxPlayers - 1;
    st.aiCount = Math.min(st.aiCount, maxAi);
    const map = getMap(this.mapId());
    const nMaps = MAPS.length + 1;

    const mapRows: Row[] = [
      {
        label: 'MAPPA',
        value: isRandom ? 'Casuale' : map.name,
        detail: isRandom ? 'Generata da un seme: simmetrica ed equa' : map.description,
        change: (d) => {
          st.mapIndex = (st.mapIndex + d + nMaps) % nMaps;
        },
      },
    ];
    if (isRandom) {
      mapRows.push(
        {
          label: 'DIMENSIONE',
          value: SIZE_LABEL[SIZES[st.size]],
          detail: `${map.width} × ${map.height}  ·  ${map.planets.length} pianeti`,
          change: (d) => {
            st.size = Phaser.Math.Clamp(st.size + d, 0, SIZES.length - 1);
          },
        },
        {
          label: 'RISORSE',
          value: RICHNESS_LABEL[RICHNESSES[st.richness]],
          detail: ['Minerali ×0,7', 'Minerali normali', 'Minerali ×1,4 e asteroidi in più'][st.richness],
          change: (d) => {
            st.richness = Phaser.Math.Clamp(st.richness + d, 0, RICHNESSES.length - 1);
          },
        },
        {
          label: 'SEME',
          value: `#${st.seed}`,
          detail: 'Frecce: nuova mappa  ·  stesso seme = stessa mappa',
          change: () => {
            st.seed = newSeed();
          },
        },
      );
    }
    const gameRows: Row[] = [
      {
        label: 'AVVERSARI IA',
        value: String(st.aiCount),
        detail: st.aiCount > 1 ? 'Tutti contro tutti' : 'Uno contro uno',
        change: (d) => {
          st.aiCount = Phaser.Math.Clamp(st.aiCount + d, 1, maxAi);
        },
      },
      {
        label: 'DIFFICOLTÀ',
        value: DIFFICULTIES[DIFFS[st.diff]].label,
        detail: ['IA lenta e prudente', 'IA bilanciata', 'IA aggressiva con bonus di estrazione'][st.diff],
        change: (d) => {
          st.diff = Phaser.Math.Clamp(st.diff + d, 0, 2);
        },
      },
      {
        label: 'LA TUA DOTTRINA',
        value: DOCTRINES[DOCTRINE_ORDER[st.doctrine]].name,
        detail: DOCTRINES[DOCTRINE_ORDER[st.doctrine]].traits.join('  ·  '),
        change: (d) => {
          const n = DOCTRINE_ORDER.length;
          st.doctrine = (st.doctrine + d + n) % n;
        },
      },
    ];

    const twoCol = W >= 760;
    const compact = !twoCol;
    const rowH = compact ? 50 : H < 760 ? 72 : 76;
    const drawRows = (rows: Row[], x: number, y0: number, half: number): number => {
      let yy = y0;
      for (const row of rows) {
        this.drawRow(c, compact ? { ...row, detail: undefined } : row, x, yy, half);
        yy += rowH;
      }
      return yy;
    };

    if (twoCol) {
      const colGap = Math.min(270, W / 4);
      const half = Math.min(200, colGap - 24);
      let leftEnd = drawRows(mapRows, cx - colGap, y, half);
      let rightEnd = drawRows(gameRows, cx + colGap, y, half);
      // anteprima sotto la colonna più corta, se resta spazio per il pulsante
      const previewH = Math.min(150, H - Math.min(leftEnd, rightEnd) - 190);
      if (previewH >= 90) {
        const onLeft = leftEnd <= rightEnd;
        const px = onLeft ? cx - colGap : cx + colGap;
        const top = (onLeft ? leftEnd : rightEnd) + 6;
        c.add(this.add.text(px, top, 'ANTEPRIMA', { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#5d6b8f' }).setOrigin(0.5, 0));
        c.add(drawMapPreview(this, map, px, top + 22 + previewH / 2, 2 * half - 20, previewH, map.spawns.length));
        const end = top + 30 + previewH;
        if (onLeft) leftEnd = end;
        else rightEnd = end;
      }
      y = Math.max(leftEnd, rightEnd) + 4;
    } else {
      y = drawRows([...mapRows, ...gameRows], cx, y, Math.min(220, W / 2 - 30));
    }

    // colori delle fazioni in gioco
    const n = st.aiCount + 1;
    const chips = FACTION_STYLES.slice(0, n).map((s, i) => (i === 0 ? `■ Tu` : `■ ${s.name}`));
    c.add(
      this.add
        .text(cx, y, chips.join('    ') + '   (dottrine IA casuali)', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#cfd8e8' })
        .setOrigin(0.5),
    );
    y += small ? 36 : 44;

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
    y += small ? 50 : 64;

    // legenda delle navi, solo se c'è spazio
    if (H - y > 120 && W >= 640) {
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
          align: 'center',
        })
        .setOrigin(0.5, 1)
        .setWordWrapWidth(W - 20),
    );
  }

  private drawRow(c: Phaser.GameObjects.Container, row: Row, x: number, y: number, half: number): void {
    c.add(this.add.text(x, y, row.label, { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#ffd54f' }).setOrigin(0.5));
    c.add(this.add.text(x, y + 25, row.value, { fontFamily: TITLE_FONT, fontSize: '21px', color: '#ffffff' }).setOrigin(0.5));
    if (row.detail)
      c.add(
        this.add
          .text(x, y + 48, row.detail, { fontFamily: FONT, fontSize: '15px', color: '#7f8db0', align: 'center' })
          .setOrigin(0.5)
          .setWordWrapWidth(half * 2 - 10),
      );
    const arrow = (dx: number, d: number, s: string) => {
      const a = this.add
        .text(x + dx, y + 25, s, { fontFamily: TITLE_FONT, fontSize: '26px', color: '#4fc3f7' })
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
    arrow(-half, -1, '◀');
    arrow(half, 1, '▶');
  }

  private start(): void {
    sfx.unlock();
    sfx.play('click');
    const cfg: MatchConfig = {
      mapId: this.mapId(),
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

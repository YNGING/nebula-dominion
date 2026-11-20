import Phaser from 'phaser';
import { DIFFICULTIES, DOCTRINES, DOCTRINE_ORDER, FACTION_STYLES, type Difficulty } from '../data/factions';
import { RICHNESSES, RICHNESS_LABEL, SIZES, SIZE_LABEL, randomMapId } from '../data/mapgen';
import { MAPS, getMap } from '../data/maps';
import { BUILDABLE_SHIPS, UNITS } from '../data/units';
import type { MatchConfig } from '../game/Match';
import { getSurvivalRecord } from '../game/records';
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
  /** dimensione della mappa in sopravvivenza */
  survSize: number;
}

const RANDOM_INDEX = MAPS.length;

function fmtTicks(ticks: number): string {
  const sec = Math.floor(ticks / 20);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function newSeed(): number {
  return Math.floor(Math.random() * 90000) + 10000;
}

function loadSettings(): Settings {
  const def: Settings = { mapIndex: 0, aiCount: 1, diff: 1, doctrine: 0, size: 1, richness: 1, seed: newSeed(), survSize: 1 };
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
      survSize: Phaser.Math.Clamp(Number(s.survSize ?? 1), 0, SIZES.length - 1),
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
  private page: 'main' | 'skirmish' | 'survival' = 'main';
  private root!: Phaser.GameObjects.Container;
  private ships: { img: Phaser.GameObjects.Image; vx: number; vy: number }[] = [];

  constructor() {
    super('Menu');
  }

  create(): void {
    this.settings = loadSettings();
    this.page = 'main';
    this.ships = [];
    // navi che attraversano lo sfondo
    for (let i = 0; i < 14; i++) this.spawnShip(true);
    this.build();
    this.scale.on('resize', this.build, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', this.build, this));
    this.input.keyboard?.on('keydown-ENTER', () => (this.page === 'main' ? this.goto('skirmish') : this.start()));
    this.input.keyboard?.on('keydown-ESC', () => this.goto('main'));
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
      .image(x, Phaser.Math.Between(40, height - 40), shipKey(kind, FACTION_STYLES[f].color))
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

  private goto(page: 'main' | 'skirmish' | 'survival'): void {
    if (this.page === page) return;
    this.page = page;
    this.build();
  }

  /** Pulsante grande del menu; `enabled` false = grigio e non cliccabile. */
  private bigButton(
    c: Phaser.GameObjects.Container,
    x: number,
    y: number,
    w: number,
    label: string,
    sub: string,
    onClick: () => void,
    enabled = true,
  ): void {
    const h = sub ? 70 : 58;
    const bg = this.add.rectangle(x, y, w, h, enabled ? 0x1b2a55 : 0x111830, 1).setStrokeStyle(2, enabled ? 0x4fc3f7 : 0x2b3d6b);
    const t = this.add
      .text(x, sub ? y - 12 : y, label, { fontFamily: TITLE_FONT, fontSize: '22px', fontStyle: 'bold', color: enabled ? '#ffffff' : '#5d6b8f' })
      .setOrigin(0.5);
    c.add([bg, t]);
    if (sub) c.add(this.add.text(x, y + 16, sub, { fontFamily: FONT, fontSize: '16px', color: enabled ? '#8fa6d6' : '#4a5675' }).setOrigin(0.5));
    if (!enabled) return;
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x27407d));
    bg.on('pointerout', () => bg.setFillStyle(0x1b2a55));
    bg.on('pointerdown', () => {
      sfx.unlock();
      sfx.play('click');
      onClick();
    });
  }

  private backButton(c: Phaser.GameObjects.Container): void {
    const b = this.add
      .text(20, 18, '◀ MENU', { fontFamily: TITLE_FONT, fontSize: '18px', color: '#4fc3f7' })
      .setInteractive({ useHandCursor: true });
    b.on('pointerover', () => b.setColor('#ffffff'));
    b.on('pointerout', () => b.setColor('#4fc3f7'));
    b.on('pointerdown', () => {
      sfx.play('click');
      this.goto('main');
    });
    c.add(b);
  }

  private footer(c: Phaser.GameObjects.Container, W: number, H: number): void {
    c.add(
      this.add
        .text(W / 2, H - 16, 'Click sinistro seleziona · Click destro muove/attacca · F1 durante la partita per tutti i comandi', {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#5d6b8f',
          align: 'center',
        })
        .setOrigin(0.5, 1)
        .setWordWrapWidth(W - 20),
    );
  }

  private shipLegend(c: Phaser.GameObjects.Container, W: number, y: number): void {
    const cx = W / 2;
    const spacing = Math.min(150, (W - 40) / BUILDABLE_SHIPS.length);
    const startX = cx - (spacing * (BUILDABLE_SHIPS.length - 1)) / 2;
    BUILDABLE_SHIPS.forEach((k, i) => {
      const def = UNITS[k];
      const x = startX + i * spacing;
      c.add(this.add.image(x, y + 20, shipKey(k, FACTION_STYLES[0].color)).setScale(Math.min(0.9, 24 / def.radius) * 0.5));
      c.add(this.add.text(x, y + 48, def.name, { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#dbe4ff' }).setOrigin(0.5));
      c.add(this.add.text(x, y + 68, def.role, { fontFamily: FONT, fontSize: '14px', color: '#7f8db0' }).setOrigin(0.5));
    });
  }

  /** Pagina principale: scelta della modalità. */
  private buildMain(c: Phaser.GameObjects.Container, y: number, W: number, H: number): void {
    const cx = W / 2;
    const bw = Math.min(420, W - 40);
    const step = H < 700 ? 82 : 96;
    y += 20;
    this.bigButton(c, cx, y, bw, 'SCHERMAGLIA', 'Tu contro 1-3 IA, su mappe fisse o casuali', () => this.goto('skirmish'));
    y += step;
    const rec = getSurvivalRecord(DIFFS[this.settings.diff]);
    const recText = rec ? `Record (${DIFFICULTIES[DIFFS[this.settings.diff]].label}): ondata ${rec.wave}` : 'Resisti a ondate di invasori sempre più forti';
    this.bigButton(c, cx, y, bw, 'SOPRAVVIVENZA', recText, () => this.goto('survival'));
    y += step;
    this.bigButton(c, cx, y, bw, 'CAMPAGNA', 'In arrivo: tutorial e missioni', () => undefined, false);
    y += step;
    if (H - y > 130 && W >= 640) this.shipLegend(c, W, y);
    this.footer(c, W, H);
  }

  /** Pagina della sopravvivenza. */
  private buildSurvival(c: Phaser.GameObjects.Container, y: number, W: number, H: number): void {
    const cx = W / 2;
    const st = this.settings;
    const diff = DIFFS[st.diff];
    const rows: Row[] = [
      {
        label: 'DIFFICOLTÀ',
        value: DIFFICULTIES[diff].label,
        detail: ['Ondate più rade e deboli', 'Ondate bilanciate', 'Ondate frequenti e più forti'][st.diff],
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
      {
        label: 'MAPPA',
        value: SIZE_LABEL[SIZES[st.survSize]],
        detail: 'Mappa casuale diversa a ogni partita',
        change: (d) => {
          st.survSize = Phaser.Math.Clamp(st.survSize + d, 0, SIZES.length - 1);
        },
      },
    ];
    const rowH = H < 760 ? 72 : 76;
    const half = Math.min(220, W / 2 - 30);
    for (const row of rows) {
      this.drawRow(c, row, cx, y, half);
      y += rowH;
    }
    const rec = getSurvivalRecord(diff);
    const lines = [
      'Sei solo contro lo Sciame del Vuoto: ogni ondata arriva da un bordo della mappa,',
      'più numerosa e meglio armata della precedente. Resisti il più a lungo possibile.',
      rec ? `Record a difficoltà ${DIFFICULTIES[diff].label}: ondata ${rec.wave} (${fmtTicks(rec.ticks)})` : 'Nessun record ancora a questa difficoltà.',
    ];
    c.add(
      this.add
        .text(cx, y, lines.join('\n'), { fontFamily: FONT, fontSize: '16px', color: '#9fb0d8', align: 'center', lineSpacing: 4 })
        .setOrigin(0.5, 0)
        .setWordWrapWidth(W - 40),
    );
    y += 100;
    this.bigButton(c, cx, y, 360, 'INIZIA SOPRAVVIVENZA', '', () => this.start());
    this.backButton(c);
    this.footer(c, W, H);
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

    if (this.page === 'main') {
      this.buildMain(c, y, W, H);
      return;
    }
    if (this.page === 'survival') {
      this.buildSurvival(c, y, W, H);
      return;
    }
    this.backButton(c);

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

    if (H - y > 120 && W >= 640) this.shipLegend(c, W, y);
    this.footer(c, W, H);
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
    if (this.page === 'survival') {
      const st = this.settings;
      this.saveSettings();
      this.scene.start('Game', {
        mode: 'survival',
        mapId: randomMapId({ seed: newSeed(), players: 2, size: SIZES[st.survSize], richness: 'normal' }),
        aiCount: 0,
        difficulty: DIFFS[st.diff],
        doctrine: DOCTRINE_ORDER[st.doctrine],
      } satisfies MatchConfig);
      return;
    }
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

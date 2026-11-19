import Phaser from 'phaser';
import { FACTION_STYLES, NEUTRAL_COLOR } from '../data/factions';
import { UNITS, type UnitKind } from '../data/units';
import { Rng } from '../sim/rng';

// Tutta la grafica è generata a runtime con Phaser.Graphics: nessun file immagine da caricare.

type Pt = [number, number];

/** Sagome delle navi, in unità di raggio, con la prua verso +x. */
const SHAPES: Record<UnitKind, Pt[]> = {
  fighter: [
    [1.5, 0],
    [-0.9, 0.9],
    [-0.45, 0],
    [-0.9, -0.9],
  ],
  miner: [
    [1.15, 0.65],
    [0.55, 0.65],
    [0.45, 0.35],
    [-0.95, 0.75],
    [-1.1, 0],
    [-0.95, -0.75],
    [0.45, -0.35],
    [0.55, -0.65],
    [1.15, -0.65],
    [1.15, -0.25],
    [0.8, -0.2],
    [0.8, 0.2],
    [1.15, 0.25],
  ],
  frigate: [
    [1.45, 0],
    [0.6, 0.42],
    [-0.15, 0.5],
    [-0.4, 1.0],
    [-1.0, 1.0],
    [-0.8, 0.4],
    [-1.1, 0],
    [-0.8, -0.4],
    [-1.0, -1.0],
    [-0.4, -1.0],
    [-0.15, -0.5],
    [0.6, -0.42],
  ],
  battleship: [
    [1.35, 0],
    [1.05, 0.26],
    [0.35, 0.34],
    [0.15, 0.62],
    [-0.55, 0.62],
    [-0.7, 0.36],
    [-1.15, 0.36],
    [-1.15, -0.36],
    [-0.7, -0.36],
    [-0.55, -0.62],
    [0.15, -0.62],
    [0.35, -0.34],
    [1.05, -0.26],
  ],
  support: [
    [1.0, 0],
    [0.7, 0.7],
    [0, 1.0],
    [-0.7, 0.7],
    [-1.0, 0],
    [-0.7, -0.7],
    [0, -1.0],
    [0.7, -0.7],
  ],
  mothership: [],
  turret: [],
};

export function darken(c: number, f: number): number {
  const r = ((c >> 16) & 255) * f;
  const g = ((c >> 8) & 255) * f;
  const b = (c & 255) * f;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

export function lighten(c: number, f: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  return (
    (Math.round(r + (255 - r) * f) << 16) | (Math.round(g + (255 - g) * f) << 8) | Math.round(b + (255 - b) * f)
  );
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (
    (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t)
  );
}

export function shipKey(kind: UnitKind, faction: number): string {
  return `ship_${kind}_${faction < 0 ? 'n' : faction}`;
}

/** Scala con cui disegnare la texture di una nave: le texture sono generate a 2x per nitidezza. */
export const SHIP_TEX_SCALE = 2;

function poly(pts: Pt[], cx: number, cy: number, s: number): Phaser.Math.Vector2[] {
  return pts.map(([x, y]) => new Phaser.Math.Vector2(cx + x * s, cy + y * s));
}

function drawShip(scene: Phaser.Scene, kind: UnitKind, color: number, key: string): void {
  const r = UNITS[kind].radius * SHIP_TEX_SCALE;
  const size = Math.ceil(r * 3.2) + 8;
  const c = size / 2;
  const g = scene.make.graphics({}, false);
  const fill = darken(color, 0.32);
  const line = lighten(color, 0.15);
  const lw = 2 * SHIP_TEX_SCALE * (kind === 'fighter' ? 0.7 : 1);

  if (kind === 'mothership') {
    // stazione ottagonale con anello e bracci di attracco
    const oct: Pt[] = [];
    for (let i = 0; i < 8; i++) oct.push([Math.cos((i / 8) * Math.PI * 2 + Math.PI / 8), Math.sin((i / 8) * Math.PI * 2 + Math.PI / 8)]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.lineStyle(lw * 2.2, darken(color, 0.5), 1);
      g.lineBetween(c, c, c + Math.cos(a) * r * 1.25, c + Math.sin(a) * r * 1.25);
      g.fillStyle(fill, 1);
      g.fillCircle(c + Math.cos(a) * r * 1.25, c + Math.sin(a) * r * 1.25, r * 0.13);
      g.lineStyle(lw * 0.7, line, 1);
      g.strokeCircle(c + Math.cos(a) * r * 1.25, c + Math.sin(a) * r * 1.25, r * 0.13);
    }
    const pts = poly(oct, c, c, r * 0.9);
    g.fillStyle(fill, 1);
    g.fillPoints(pts, true);
    g.lineStyle(lw, line, 1);
    g.strokePoints(pts, true, true);
    g.lineStyle(lw * 0.7, color, 0.8);
    g.strokeCircle(c, c, r * 0.62);
    g.fillStyle(darken(color, 0.55), 1);
    g.fillCircle(c, c, r * 0.4);
    g.fillStyle(lighten(color, 0.5), 1);
    g.fillCircle(c, c, r * 0.18);
    g.lineStyle(lw * 0.5, lighten(color, 0.6), 0.7);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.lineBetween(c + Math.cos(a) * r * 0.42, c + Math.sin(a) * r * 0.42, c + Math.cos(a) * r * 0.62, c + Math.sin(a) * r * 0.62);
    }
  } else if (kind === 'turret') {
    g.fillStyle(fill, 1);
    g.fillCircle(c, c, r * 0.9);
    g.lineStyle(lw, line, 1);
    g.strokeCircle(c, c, r * 0.9);
    g.fillStyle(lighten(color, 0.3), 1);
    g.fillRect(c, c - r * 0.18, r * 1.4, r * 0.36);
    g.fillStyle(darken(color, 0.6), 1);
    g.fillCircle(c, c, r * 0.45);
    g.lineStyle(lw * 0.7, line, 1);
    g.strokeCircle(c, c, r * 0.45);
  } else {
    // motore
    const back = kind === 'support' ? -0.9 : -1.0;
    g.fillStyle(lighten(color, 0.6), 0.9);
    g.fillCircle(c + back * r, c, r * (kind === 'battleship' ? 0.22 : 0.3));
    if (kind === 'battleship' || kind === 'frigate') {
      g.fillCircle(c + back * r, c - r * 0.55, r * 0.18);
      g.fillCircle(c + back * r, c + r * 0.55, r * 0.18);
    }
    const pts = poly(SHAPES[kind], c, c, r);
    g.fillStyle(fill, 1);
    g.fillPoints(pts, true);
    g.lineStyle(lw, line, 1);
    g.strokePoints(pts, true, true);
    g.lineStyle(lw * 0.6, color, 0.9);
    switch (kind) {
      case 'fighter':
        g.lineBetween(c - r * 0.2, c, c + r * 0.9, c);
        break;
      case 'miner':
        g.fillStyle(darken(color, 0.6), 1);
        g.fillRect(c - r * 0.6, c - r * 0.3, r * 0.8, r * 0.6);
        g.lineStyle(lw * 0.5, lighten(color, 0.4), 1);
        g.strokeRect(c - r * 0.6, c - r * 0.3, r * 0.8, r * 0.6);
        break;
      case 'frigate':
        g.fillStyle(lighten(color, 0.3), 1);
        g.fillCircle(c + r * 0.35, c, r * 0.18);
        g.fillCircle(c - r * 0.45, c, r * 0.15);
        break;
      case 'battleship':
        g.lineBetween(c - r * 1.0, c, c + r * 1.1, c);
        g.fillStyle(lighten(color, 0.25), 1);
        for (const x of [0.75, 0.15, -0.45]) {
          g.fillCircle(c + r * x, c, r * 0.16);
          g.fillRect(c + r * x, c - r * 0.04, r * 0.32, r * 0.08);
        }
        break;
      case 'support':
        g.fillStyle(0xeafff2, 1);
        g.fillRect(c - r * 0.5, c - r * 0.15, r * 1.0, r * 0.3);
        g.fillRect(c - r * 0.15, c - r * 0.5, r * 0.3, r * 1.0);
        break;
    }
  }
  g.generateTexture(key, size, size);
  g.destroy();
}

function softCircle(scene: Phaser.Scene, key: string, size: number, power: number, maxAlpha: number): void {
  const g = scene.make.graphics({}, false);
  const r = size / 2;
  const steps = Math.min(48, r);
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    g.fillStyle(0xffffff, maxAlpha * (1 - Math.pow(t, power)) / steps * 3);
    g.fillCircle(r, r, r * t);
  }
  g.generateTexture(key, size, size);
  g.destroy();
}

const PLANET_PALETTES = [
  { dark: 0x2b1a14, base: 0x8d6e63, light: 0xe0c9b8, accent: 0x5d4037 }, // roccioso
  { dark: 0x4a2300, base: 0xe08a2e, light: 0xffe2b8, accent: 0xb5651d }, // gigante gassoso
  { dark: 0x061a36, base: 0x2f7fd0, light: 0xbfe8ff, accent: 0x3fa266 }, // oceanico
  { dark: 0x24303a, base: 0x8fa6b5, light: 0xffffff, accent: 0xdff3ff }, // ghiacciato
];

export function planetAtmosphere(style: number): number {
  return PLANET_PALETTES[style % 4].light;
}

function drawPlanet(scene: Phaser.Scene, style: number): void {
  const size = 256;
  const R = 120;
  const c = size / 2;
  const pal = PLANET_PALETTES[style % 4];
  const rng = new Rng(1000 + style * 77);
  const g = scene.make.graphics({}, false);

  // ombreggiatura sferica: cerchi concentrici spostati verso la luce (in alto a sinistra)
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const col = t < 0.6 ? lerpColor(pal.dark, pal.base, t / 0.6) : lerpColor(pal.base, pal.light, (t - 0.6) / 0.4 * 0.7);
    const off = R * t * 0.32;
    g.fillStyle(col, 1);
    g.fillCircle(c - off * 0.75, c - off * 0.75, R * (1 - t * 0.68));
  }

  const chord = (y: number, h: number, col: number, a: number) => {
    const yy = Math.max(-R + 1, Math.min(R - 1, y));
    const hw = Math.sqrt(R * R - yy * yy) * 0.98;
    g.fillStyle(col, a);
    g.fillRect(c - hw, c + y, hw * 2, h);
  };

  if (style === 1) {
    for (let y = -R + 8; y < R - 8; y += rng.range(10, 22)) chord(y, rng.range(4, 10), pal.accent, 0.22);
  } else if (style === 0) {
    for (let i = 0; i < 16; i++) {
      const a = rng.range(0, Math.PI * 2);
      const cr = rng.range(5, 16);
      const d = rng.range(0, R - cr - 6);
      g.fillStyle(pal.accent, 0.35);
      g.fillCircle(c + Math.cos(a) * d, c + Math.sin(a) * d, cr);
      g.lineStyle(1.5, pal.light, 0.15);
      g.strokeCircle(c + Math.cos(a) * d - 1, c + Math.sin(a) * d - 1, cr);
    }
  } else if (style === 2) {
    for (let k = 0; k < 6; k++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0, R * 0.6);
      const bx = c + Math.cos(a) * d;
      const by = c + Math.sin(a) * d;
      for (let i = 0; i < 6; i++) {
        const cr = rng.range(8, 20);
        const ox = rng.range(-18, 18);
        const oy = rng.range(-12, 12);
        if (Math.hypot(bx + ox - c, by + oy - c) + cr > R - 4) continue;
        g.fillStyle(pal.accent, 0.55);
        g.fillCircle(bx + ox, by + oy, cr);
      }
    }
    for (let y = -R + 20; y < R - 20; y += rng.range(18, 34)) chord(y, 3, 0xffffff, 0.12);
  } else {
    chord(-R + 2, 26, 0xffffff, 0.55);
    chord(R - 24, 22, 0xffffff, 0.45);
    for (let y = -R + 30; y < R - 30; y += rng.range(14, 26)) chord(y, 2, pal.dark, 0.12);
  }

  // terminatore: ombra sul lato opposto alla luce
  for (let i = 0; i < 14; i++) {
    const t = i / 14;
    g.lineStyle(6, 0x000000, 0.06 + t * 0.03);
    g.beginPath();
    g.arc(c, c, R - 3 - i * 2.2, -0.2, Math.PI * 0.95);
    g.strokePath();
  }
  g.lineStyle(2, pal.light, 0.35);
  g.strokeCircle(c, c, R);
  g.generateTexture(`planet${style}`, size, size);
  g.destroy();
}

function drawAsteroid(scene: Phaser.Scene, variant: number): void {
  const size = 64;
  const c = size / 2;
  const rng = new Rng(500 + variant * 31);
  const g = scene.make.graphics({}, false);
  const n = 10;
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 28 * rng.range(0.7, 1);
    pts.push(new Phaser.Math.Vector2(c + Math.cos(a) * r, c + Math.sin(a) * r));
  }
  g.fillStyle(0x3d3833, 1);
  g.fillPoints(pts, true);
  g.fillStyle(0x6b625a, 1);
  g.fillPoints(
    pts.map((p) => new Phaser.Math.Vector2(c + (p.x - c) * 0.82 - 2, c + (p.y - c) * 0.82 - 2)),
    true,
  );
  g.lineStyle(1.5, 0x9a8f84, 0.9);
  g.strokePoints(pts, true, true);
  for (let i = 0; i < 4; i++) {
    g.fillStyle(0x3d3833, 0.6);
    g.fillCircle(c + rng.range(-12, 12), c + rng.range(-12, 12), rng.range(2, 5));
  }
  // cristalli di minerale
  for (let i = 0; i < 5; i++) {
    const x = c + rng.range(-14, 14);
    const y = c + rng.range(-14, 14);
    g.fillStyle(0x7ff3ff, 0.95);
    g.fillTriangle(x, y - 4, x + 3, y + 2, x - 3, y + 2);
  }
  g.generateTexture(`asteroid${variant}`, size, size);
  g.destroy();
}

function drawStars(scene: Phaser.Scene, key: string, count: number, maxSize: number, seed: number): void {
  const size = 1024;
  const rng = new Rng(seed);
  const g = scene.make.graphics({}, false);
  for (let i = 0; i < count; i++) {
    const tint = rng.pick([0xffffff, 0xcfe8ff, 0xfff1d6, 0xd6dcff]);
    g.fillStyle(tint, rng.range(0.25, 1));
    g.fillCircle(rng.range(0, size), rng.range(0, size), rng.range(0.4, maxSize));
  }
  g.generateTexture(key, size, size);
  g.destroy();
}

function drawIcons(scene: Phaser.Scene): void {
  const mk = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    const g = scene.make.graphics({}, false);
    draw(g);
    g.generateTexture(key, 48, 48);
    g.destroy();
  };
  mk('icon_attack', (g) => {
    g.lineStyle(3, 0xff8a80, 1);
    g.strokeCircle(24, 24, 13);
    g.lineBetween(24, 4, 24, 16);
    g.lineBetween(24, 32, 24, 44);
    g.lineBetween(4, 24, 16, 24);
    g.lineBetween(32, 24, 44, 24);
  });
  mk('icon_stop', (g) => {
    g.fillStyle(0xffcdd2, 1);
    g.fillRect(12, 12, 24, 24);
  });
  mk('icon_hold', (g) => {
    g.fillStyle(0xb3e5fc, 1);
    g.fillPoints(
      [new Phaser.Math.Vector2(24, 6), new Phaser.Math.Vector2(40, 12), new Phaser.Math.Vector2(37, 30), new Phaser.Math.Vector2(24, 42), new Phaser.Math.Vector2(11, 30), new Phaser.Math.Vector2(8, 12)],
      true,
    );
  });
  mk('icon_harvest', (g) => {
    g.fillStyle(0x7ff3ff, 1);
    g.fillTriangle(24, 6, 34, 24, 14, 24);
    g.fillTriangle(14, 24, 34, 24, 24, 42);
    g.lineStyle(2, 0xffffff, 0.8);
    g.lineBetween(24, 6, 24, 42);
  });
  mk('icon_return', (g) => {
    g.lineStyle(4, 0xc5e1a5, 1);
    g.lineBetween(38, 24, 12, 24);
    g.fillStyle(0xc5e1a5, 1);
    g.fillTriangle(8, 24, 20, 14, 20, 34);
  });
  mk('icon_mineral', (g) => {
    g.fillStyle(0x7ff3ff, 1);
    g.fillTriangle(24, 4, 38, 24, 10, 24);
    g.fillStyle(0x3fb8c9, 1);
    g.fillTriangle(10, 24, 38, 24, 24, 44);
  });
}

export function generateTextures(scene: Phaser.Scene): void {
  const kinds = Object.keys(UNITS) as UnitKind[];
  FACTION_STYLES.forEach((s, i) => {
    for (const k of kinds) drawShip(scene, k, s.color, shipKey(k, i));
  });
  for (const k of kinds) drawShip(scene, k, NEUTRAL_COLOR, shipKey(k, -1));
  softCircle(scene, 'glow', 128, 1.6, 0.9);
  softCircle(scene, 'nebula', 256, 1.2, 0.5);
  const sg = scene.make.graphics({}, false);
  sg.fillStyle(0xffffff, 1);
  sg.fillCircle(4, 4, 4);
  sg.generateTexture('spark', 8, 8);
  sg.clear();
  sg.lineStyle(4, 0xffffff, 1);
  sg.strokeCircle(64, 64, 60);
  sg.generateTexture('ring', 128, 128);
  sg.destroy();
  for (let i = 0; i < 4; i++) drawPlanet(scene, i);
  for (let i = 0; i < 4; i++) drawAsteroid(scene, i);
  drawStars(scene, 'stars0', 700, 1.1, 11);
  drawStars(scene, 'stars1', 160, 1.8, 23);
  drawIcons(scene);
}

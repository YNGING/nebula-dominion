import Phaser from 'phaser';
import type { MapDef } from '../data/maps';
import { planetAtmosphere } from './textures';

/**
 * Anteprima di una mappa: pianeti (con la rendita), campi di asteroidi e basi.
 * `bases` = numero di basi occupate nella partita (le altre sono mostrate spente).
 */
export function drawMapPreview(
  scene: Phaser.Scene,
  map: MapDef,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  bases: number,
): Phaser.GameObjects.Container {
  const s = Math.min(maxW / map.width, maxH / map.height);
  const w = map.width * s;
  const h = map.height * s;
  const ox = x - w / 2;
  const oy = y - h / 2;
  const g = scene.add.graphics();
  g.fillStyle(0x03050d, 0.92);
  g.fillRect(ox, oy, w, h);
  g.lineStyle(1, 0x2b3d6b, 1);
  g.strokeRect(ox, oy, w, h);

  for (const f of map.fields) {
    const n = f.count;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + f.x * 0.01;
      const r = f.spread * s * (i % 2 ? 0.55 : 0.25);
      g.fillStyle(0x7ff3ff, 0.75);
      g.fillCircle(ox + f.x * s + Math.cos(a) * r, oy + f.y * s + Math.sin(a) * r, 1.6);
    }
  }
  for (const p of map.planets) {
    const px = ox + p.x * s;
    const py = oy + p.y * s;
    const r = Math.max(3, p.radius * s);
    g.fillStyle(planetAtmosphere(p.style), 0.25);
    g.fillCircle(px, py, r + 3);
    g.fillStyle(planetAtmosphere(p.style), 0.9);
    g.fillCircle(px, py, r);
  }
  map.spawns.forEach((sp, i) => {
    const active = i < bases;
    const px = ox + sp.x * s;
    const py = oy + sp.y * s;
    g.lineStyle(2, 0xffffff, active ? 0.95 : 0.25);
    g.strokeCircle(px, py, 6);
    if (active) {
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(px, py, 2.5);
    }
  });
  return scene.add.container(0, 0, [g]);
}

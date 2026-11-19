import Phaser from 'phaser';
import { BackgroundScene } from './scenes/BackgroundScene';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { MenuScene } from './scenes/MenuScene';

async function waitFonts(): Promise<void> {
  if (!document.fonts) return;
  const load = Promise.all([
    document.fonts.load('20px Orbitron'),
    document.fonts.load('bold 20px Orbitron'),
    document.fonts.load('20px Rajdhani'),
    document.fonts.load('bold 20px Rajdhani'),
  ]).catch(() => undefined);
  await Promise.race([load, new Promise((r) => setTimeout(r, 2500))]);
}

void waitFonts().then(() => {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    backgroundColor: '#04050d',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    render: { antialias: true },
    scene: [BootScene, BackgroundScene, MenuScene, GameScene, HudScene],
  });
  (window as unknown as { __game: Phaser.Game }).__game = game;
});

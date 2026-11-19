import Phaser from 'phaser';

/** Campo stellare in parallasse, disegnato sotto tutte le altre scene. */
export class BackgroundScene extends Phaser.Scene {
  private layers: { t: Phaser.GameObjects.TileSprite; f: number }[] = [];
  private drift = 0;

  constructor() {
    super('Background');
  }

  create(): void {
    const { width, height } = this.scale;
    this.layers = [
      { t: this.add.tileSprite(0, 0, width, height, 'stars0').setOrigin(0).setAlpha(0.7), f: 0.08 },
      { t: this.add.tileSprite(0, 0, width, height, 'stars1').setOrigin(0).setAlpha(0.9), f: 0.18 },
    ];
    this.scale.on('resize', (s: Phaser.Structs.Size) => {
      for (const l of this.layers) l.t.setSize(s.width, s.height);
    });
  }

  update(_t: number, delta: number): void {
    const game = this.scene.get('Game');
    let sx: number;
    let sy: number;
    if (game && this.scene.isActive('Game')) {
      const cam = game.cameras.main;
      sx = cam.scrollX + cam.width / 2;
      sy = cam.scrollY + cam.height / 2;
    } else {
      this.drift += delta * 0.02;
      sx = this.drift;
      sy = this.drift * 0.3;
    }
    for (const l of this.layers) {
      l.t.tilePositionX = sx * l.f;
      l.t.tilePositionY = sy * l.f;
    }
  }
}

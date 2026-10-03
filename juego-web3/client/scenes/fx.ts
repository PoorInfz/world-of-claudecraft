import Phaser from 'phaser';
import { worldToScreen } from '../../shared/iso.ts';
import { FONT_KEY } from '../gfx/font.ts';

/**
 * Efectos visuales: particulas pixeladas (emisores compartidos por color) y
 * numeros flotantes de combate con pool de objetos.
 */

const PALETTES = {
  fuego: [0xffe28a, 0xffa02a, 0xe8501a],
  hielo: [0xffffff, 0xbfe8ff, 0x6ab8ff],
  arcano: [0xffffff, 0xe0a8ff, 0xa060ff],
  sombra: [0xd08aff, 0x8a3ad0, 0x3a1050],
  sagrado: [0xffffff, 0xfff4b0, 0xf2c14e],
  sangre: [0xff5a4a, 0xb02020],
  polvo: [0xc8b08a, 0x8a7050],
  acero: [0xffffff, 0xc8d0d8],
  sanacion: [0xb0ffb0, 0x4ae05a],
} as const;
export type FxPalette = keyof typeof PALETTES;

interface FloatText {
  obj: Phaser.GameObjects.BitmapText;
  born: number;
  life: number;
  x: number;
  y: number;
  vy: number;
}

export class Fx {
  private emitters = new Map<FxPalette, Phaser.GameObjects.Particles.ParticleEmitter>();
  private texts: FloatText[] = [];
  private free: Phaser.GameObjects.BitmapText[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    for (const [name, colors] of Object.entries(PALETTES) as [FxPalette, readonly number[]][]) {
      const em = scene.add.particles(0, 0, 'px', {
        emitting: false,
        lifespan: { min: 300, max: 700 },
        speed: { min: 15, max: 55 },
        angle: { min: 0, max: 360 },
        gravityY: name === 'polvo' || name === 'sangre' ? 60 : -20,
        alpha: { start: 1, end: 0 },
        tint: [...colors],
        quantity: 1,
        blendMode:
          name === 'polvo' || name === 'sangre' ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD,
      });
      em.setDepth(900000);
      this.emitters.set(name, em);
    }
  }

  /** Estallido de particulas en un punto del mundo (coordenadas de baldosa). */
  burst(palette: FxPalette, wx: number, wy: number, count = 12, lift = 14): void {
    const s = worldToScreen(wx, wy);
    this.emitters.get(palette)?.explode(count, Math.round(s.x), Math.round(s.y - lift));
  }

  /** Anillo en el suelo de radio r baldosas (novas, torbellino). */
  ring(palette: FxPalette, wx: number, wy: number, r: number, count = 28): void {
    const em = this.emitters.get(palette);
    if (!em) return;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const s = worldToScreen(wx + Math.cos(a) * r, wy + Math.sin(a) * r);
      em.explode(1, Math.round(s.x), Math.round(s.y - 2));
    }
  }

  /** Numero o texto flotante sobre una entidad. */
  float(text: string, wx: number, wy: number, color: number, big = false): void {
    const s = worldToScreen(wx, wy);
    const obj = this.free.pop() ?? this.scene.add.bitmapText(0, 0, FONT_KEY, '').setOrigin(0.5, 1);
    obj
      .setText(text)
      .setTint(color)
      .setScale(big ? 2 : 1)
      .setVisible(true)
      .setAlpha(1)
      .setDepth(1e6 + 10);
    const jitter = ((this.texts.length * 7) % 13) - 6;
    this.texts.push({
      obj,
      born: this.scene.time.now,
      life: big ? 1100 : 850,
      x: Math.round(s.x + jitter),
      y: Math.round(s.y - 38),
      vy: big ? 18 : 24,
    });
  }

  update(now: number): void {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i] as FloatText;
      const age = now - t.born;
      if (age >= t.life) {
        t.obj.setVisible(false);
        this.free.push(t.obj);
        this.texts.splice(i, 1);
        continue;
      }
      const k = age / t.life;
      t.obj.setPosition(t.x, Math.round(t.y - (age / 1000) * t.vy));
      t.obj.setAlpha(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
    }
  }
}

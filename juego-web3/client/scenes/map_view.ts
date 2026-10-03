import Phaser from 'phaser';
import { TILE_H, TILE_W } from '../../shared/constants.ts';
import { worldToScreen } from '../../shared/iso.ts';
import type { MapData } from '../../shared/map.ts';
import { TILE } from '../../shared/tiles.ts';

/**
 * Render del mapa por trozos (chunks) de 16x16 baldosas. El suelo de cada
 * trozo se pinta UNA vez en una RenderTexture; la decoracion son imagenes
 * con profundidad por y. Solo se crean y muestran los trozos cercanos a la
 * camara (culling + carga perezosa).
 */
const CHUNK = 16;
const CHUNK_W = (CHUNK * 2 - 1) * (TILE_W / 2) + TILE_W;
const CHUNK_H = (CHUNK * 2 - 2) * (TILE_H / 2) + TILE_H;

interface Chunk {
  rt: Phaser.GameObjects.RenderTexture;
  deco: Phaser.GameObjects.GameObject[];
  visible: boolean;
}

export class MapView {
  private chunks = new Map<number, Chunk>();
  private readonly cols: number;
  private readonly rows: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: MapData,
  ) {
    this.cols = Math.ceil(map.width / CHUNK);
    this.rows = Math.ceil(map.height / CHUNK);
  }

  /** Muestra los trozos que tocan la vista de la camara (con margen). */
  update(view: Phaser.Geom.Rectangle): void {
    const margin = 64;
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const ox = (cx * CHUNK - cy * CHUNK - CHUNK) * (TILE_W / 2);
        const oy = (cx * CHUNK + cy * CHUNK) * (TILE_H / 2);
        // Los arboles sobresalen hacia arriba: margen extra arriba.
        const inView =
          ox < view.right + margin &&
          ox + CHUNK_W > view.x - margin &&
          oy - 48 < view.bottom + margin &&
          oy + CHUNK_H > view.y - margin;
        const key = cy * this.cols + cx;
        let ch = this.chunks.get(key);
        if (inView && !ch) ch = this.build(cx, cy, ox, oy);
        if (ch && ch.visible !== inView) {
          ch.visible = inView;
          ch.rt.setVisible(inView);
          for (const d of ch.deco) (d as Phaser.GameObjects.Image).setVisible(inView);
        }
      }
    }
  }

  private build(cx: number, cy: number, ox: number, oy: number): Chunk {
    const rt = this.scene.add
      .renderTexture(ox, oy, CHUNK_W, CHUNK_H)
      .setOrigin(0, 0)
      .setDepth(-1e6);
    const deco: Phaser.GameObjects.GameObject[] = [];
    rt.beginDraw();
    for (let ty = cy * CHUNK; ty < Math.min(this.map.height, (cy + 1) * CHUNK); ty++) {
      for (let tx = cx * CHUNK; tx < Math.min(this.map.width, (cx + 1) * CHUNK); tx++) {
        const i = ty * this.map.width + tx;
        const g = this.map.ground[i] as number;
        const s = worldToScreen(tx, ty);
        if (g >= 0) rt.batchDrawFrame('suelo', g, s.x - TILE_W / 2 - ox, s.y - oy);
        const d = this.map.deco[i] as number;
        if (d >= 0 && this.scene.textures.exists(`deco_${d}`)) {
          const c = worldToScreen(tx + 0.5, ty + 0.5);
          const img = this.scene.add
            .image(Math.round(c.x), Math.round(c.y + 3), `deco_${d}`)
            .setOrigin(0.5, 1)
            .setDepth(c.y);
          deco.push(img);
          if (d === TILE.hoguera) {
            const glow = this.scene.add
              .image(Math.round(c.x), Math.round(c.y - 4), 'glow')
              .setBlendMode(Phaser.BlendModes.ADD)
              .setTint(0xff9a3a)
              .setScale(4)
              .setDepth(c.y + 1);
            this.scene.tweens.add({
              targets: glow,
              alpha: { from: 0.55, to: 0.85 },
              duration: 180,
              yoyo: true,
              repeat: -1,
            });
            deco.push(glow);
          }
        }
      }
    }
    rt.endDraw();
    const ch: Chunk = { rt, deco, visible: true };
    this.chunks.set(cy * this.cols + cx, ch);
    return ch;
  }
}

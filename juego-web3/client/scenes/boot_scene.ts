import Phaser from 'phaser';
import { MOBS } from '../../shared/data/mobs.ts';
import { buildSheet, mobLookKey } from '../gfx/characters.ts';
import { registerPixelFont } from '../gfx/font.ts';
import { generateWorldTextures } from '../gfx/world_textures.ts';

/**
 * Genera las texturas procedurales comunes (fuente, mundo, enemigos) y abre
 * la seleccion de personajes. Los personajes jugadores se componen bajo
 * demanda por capas (gfx/paperdoll).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    registerPixelFont(this);
    generateWorldTextures(this);
    for (const m of Object.values(MOBS)) buildSheet(this, mobLookKey(m.look.palette));
    this.scene.start('select');
  }
}

import Phaser from 'phaser';
import { CLASS_IDS } from '../../shared/data/classes.ts';
import { FACTION_IDS } from '../../shared/data/factions.ts';
import { MOBS } from '../../shared/data/mobs.ts';
import { buildSheet, mobLookKey, playerLookKey } from '../gfx/characters.ts';
import { registerPixelFont } from '../gfx/font.ts';
import { generateWorldTextures } from '../gfx/world_textures.ts';

/** Genera todas las texturas procedurales y arranca el mundo y la interfaz. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    registerPixelFont(this);
    generateWorldTextures(this);
    for (const c of CLASS_IDS) for (const f of FACTION_IDS) buildSheet(this, playerLookKey(c, f));
    for (const m of Object.values(MOBS)) buildSheet(this, mobLookKey(m.look.palette));
    this.scene.start('game');
    this.scene.launch('hud');
  }
}

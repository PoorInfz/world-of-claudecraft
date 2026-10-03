import Phaser from 'phaser';
import { MOBS } from '../../shared/data/mobs.ts';
import { worldToScreen } from '../../shared/iso.ts';
import { FLAG } from '../../shared/protocol.ts';
import {
  ANIMS,
  type AnimName,
  animKey,
  FOOT_X,
  FOOT_Y,
  FRAME_H,
  FRAME_W,
  FRAMES_PER_DIR,
  mobLookKey,
  playerLookKey,
  sheetKey,
} from '../gfx/characters.ts';
import { FONT_KEY } from '../gfx/font.ts';
import { SCHOOL_COLORS } from '../gfx/world_textures.ts';
import { T } from '../i18n.ts';
import type { ClientEntity } from '../net/world.ts';

/** Profundidad de una entidad: su y de pantalla (y-sort). */
export function depthOf(sy: number): number {
  return sy;
}

/**
 * Representacion visual de una entidad del mundo. Se reutiliza desde un
 * pool por tipo, asi que bind() deja el objeto como nuevo.
 */
export class EntityView {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly label: Phaser.GameObjects.BitmapText;
  readonly hpBg: Phaser.GameObjects.Rectangle;
  readonly hpFg: Phaser.GameObjects.Rectangle;
  glow: Phaser.GameObjects.Image | null = null;
  id = 0;
  kind: ClientEntity['init']['k'] = 'mob';
  private sheet = '';
  private anim: AnimName = 'idle';
  private animDir = -1;
  private lockUntil = 0;
  private flashUntil = 0;
  private deadShown = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.sprite = scene.add.sprite(0, 0, '__DEFAULT');
    this.label = scene.add.bitmapText(0, 0, FONT_KEY, '').setOrigin(0.5, 1);
    this.hpBg = scene.add.rectangle(0, 0, 18, 3, 0x000000).setOrigin(0.5, 0.5);
    this.hpFg = scene.add.rectangle(0, 0, 16, 1, 0x3ed34a).setOrigin(0, 0.5);
  }

  bind(e: ClientEntity, selfFaction: string, selfId: number): void {
    this.id = e.id;
    this.kind = e.init.k;
    this.anim = 'idle';
    this.animDir = -1;
    this.lockUntil = 0;
    this.flashUntil = 0;
    this.deadShown = false;
    this.sprite
      .setVisible(true)
      .setActive(true)
      .clearTint()
      .setAlpha(1)
      .setAngle(0)
      .setBlendMode(Phaser.BlendModes.NORMAL);
    this.label.setVisible(false);
    this.hpBg.setVisible(false);
    this.hpFg.setVisible(false);
    const init = e.init;
    if (init.k === 'player' || init.k === 'mob') {
      const look =
        init.k === 'player'
          ? playerLookKey(init.cls ?? 'guerrero', init.fac ?? 'luz')
          : mobLookKey(MOBS[init.mob ?? '']?.look.palette ?? 'lobo');
      this.sheet = sheetKey(look);
      this.sprite.setTexture(this.sheet, 0).setOrigin(FOOT_X / FRAME_W, FOOT_Y / FRAME_H);
      this.label.setText(init.n);
      // Enemigos en rojo; jugadores de la propia faccion en azul claro; uno mismo en blanco.
      const hostileName = init.k === 'mob' || (init.fac !== undefined && init.fac !== selfFaction);
      this.label.setTint(hostileName ? 0xff4a3a : e.id === selfId ? 0xffffff : 0x8ad0ff);
    } else if (init.k === 'loot') {
      this.sheet = '';
      this.sprite.setTexture('loot').setOrigin(0.5, 1);
      this.label.setText(T.loot).setTint(0xf2c14e);
    } else {
      this.sheet = '';
      const arrow = !init.ab;
      this.sprite.setTexture(arrow ? 'arrow' : 'orb').setOrigin(0.5, 0.5);
      const color = SCHOOL_COLORS[init.sc ?? 'fisico'] ?? 0xffffff;
      if (!arrow) this.sprite.setTint(color);
      if (!arrow) {
        this.glow =
          this.glow ?? this.scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD);
        this.glow.setVisible(true).setTint(color).setScale(2).setAlpha(0.8);
      }
    }
  }

  release(): void {
    this.sprite.setVisible(false).setActive(false);
    this.sprite.anims.stop();
    this.label.setVisible(false);
    this.hpBg.setVisible(false);
    this.hpFg.setVisible(false);
    this.glow?.setVisible(false);
  }

  /** Reproduce una animacion de un solo uso (ataque, golpe recibido). */
  oneShot(anim: 'attack' | 'hit', now: number): void {
    if (!this.sheet) return;
    if (anim === 'hit' && now < this.lockUntil) return;
    this.anim = anim;
    this.animDir = -1;
    this.lockUntil = now + (ANIMS[anim].count / ANIMS[anim].fps) * 1000;
  }

  flash(now: number): void {
    this.flashUntil = now + 90;
  }

  update(
    e: ClientEntity,
    now: number,
    opts: { moving: boolean; showName: boolean; showHp: boolean; hovered: boolean },
  ): void {
    const s = worldToScreen(e.x, e.y);
    const sx = Math.round(s.x);
    const sy = Math.round(s.y);
    const depth = depthOf(sy);

    if (this.kind === 'proj') {
      this.sprite.setPosition(sx, sy - 14).setDepth(depth + 1);
      // Las flechas miran al oeste en las direcciones SO, O y NO.
      if (this.sprite.texture.key === 'arrow') this.sprite.setFlipX(e.dir >= 1 && e.dir <= 3);
      this.glow?.setPosition(sx, sy - 14).setDepth(depth);
      return;
    }
    if (this.kind === 'loot') {
      const bob = Math.floor(now / 400) % 2;
      this.sprite.setPosition(sx, sy - bob).setDepth(depth);
      this.label
        .setVisible(opts.hovered)
        .setPosition(sx, sy - 14)
        .setDepth(1e6);
      this.sprite.setTint(opts.hovered ? 0xffffaa : 0xffffff);
      return;
    }

    // Unidades: elegir animacion.
    const dead = (e.flags & FLAG.dead) !== 0;
    let want: AnimName = 'idle';
    if (dead) want = 'death';
    else if (now < this.lockUntil) want = this.anim;
    else if (e.flags & FLAG.casting) want = 'cast';
    else if (opts.moving && !(e.flags & FLAG.stunned)) want = 'walk';
    if (want !== this.anim || e.dir !== this.animDir) {
      const key = animKey(this.sheet, want, e.dir);
      if (want === 'death' && this.deadShown) {
        this.sprite.anims.stop();
        this.sprite.setFrame(e.dir * FRAMES_PER_DIR + ANIMS.death.start + ANIMS.death.count - 1);
      } else {
        // Al cambiar solo de direccion se conserva el progreso de la animacion.
        const progress =
          want === this.anim && this.sprite.anims.isPlaying ? this.sprite.anims.getProgress() : 0;
        this.sprite.play(key);
        if (progress > 0 && ANIMS[want].repeat === -1) this.sprite.anims.setProgress(progress);
      }
      this.anim = want;
      this.animDir = e.dir;
      if (want === 'death') this.deadShown = true;
    }
    if (!dead) this.deadShown = false;

    this.sprite.setPosition(sx, sy).setDepth(depth);
    if (now < this.flashUntil) this.sprite.setTintFill(0xffffff);
    else if (opts.hovered && !dead) this.sprite.setTint(0xffe6a0);
    else if (e.flags & FLAG.stunned) this.sprite.setTint(0xc0c0ff);
    else if (e.flags & FLAG.rooted) this.sprite.setTint(0x9ad8ff);
    else this.sprite.clearTint();
    this.sprite.setAlpha(dead ? 0.85 : 1);

    const top = sy - 34;
    this.label
      .setVisible(opts.showName && !dead)
      .setPosition(sx, top - 4)
      .setDepth(1e6);
    const showHp = opts.showHp && !dead;
    this.hpBg.setVisible(showHp);
    this.hpFg.setVisible(showHp);
    if (showHp) {
      const frac = Math.max(0, Math.min(1, e.hp / Math.max(1, e.mhp)));
      this.hpBg.setPosition(sx, top).setDepth(1e6);
      this.hpFg.setPosition(sx - 8, top).setDepth(1e6 + 1);
      this.hpFg.width = Math.max(0, Math.round(16 * frac));
      this.hpFg.fillColor = frac > 0.5 ? 0x3ed34a : frac > 0.2 ? 0xf2c14e : 0xe83a2a;
    }
  }
}

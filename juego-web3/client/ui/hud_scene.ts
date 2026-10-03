import Phaser from 'phaser';
import { RESPAWN_SECONDS } from '../../shared/constants.ts';
import { ABILITIES, AURAS } from '../../shared/data/abilities.ts';
import { CLASSES } from '../../shared/data/classes.ts';
import { FACTIONS } from '../../shared/data/factions.ts';
import { ITEMS, RARITY_COLORS } from '../../shared/data/items.ts';
import { MOBS } from '../../shared/data/mobs.ts';
import type { AbilityDef } from '../../shared/data/types.ts';
import { ZONES } from '../../shared/data/zones.ts';
import { formatCoins } from '../../shared/money.ts';
import { FLAG } from '../../shared/protocol.ts';
import { FONT_KEY } from '../gfx/font.ts';
import { fmt, T } from '../i18n.ts';
import type { GameScene, HudBridge } from '../scenes/game_scene.ts';
import type { GameSession } from '../session.ts';
import { drawBar, drawPanel, type TipLine, Tooltip, UI } from './widgets.ts';

const SLOT = 22;
const SLOT_GAP = 2;
const INV_COLS = 4;
const INV_CELL = 20;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const inside = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

/**
 * Interfaz en pixel art sobre el mundo: marcos de jugador y objetivo, barra
 * de accion con reutilizaciones, barra de lanzamiento, bolsa, mensajes y
 * tooltips. Lee el estado del ClientWorld; las acciones las delega en la
 * escena del juego (que envia intenciones al servidor).
 */
export class HudScene extends Phaser.Scene implements HudBridge {
  private session!: GameSession;
  private game3!: GameScene;
  private g!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private tip!: Tooltip;
  private t: Record<string, Phaser.GameObjects.BitmapText> = {};
  private slotIcons: Phaser.GameObjects.Image[] = [];
  private slotKeys: Phaser.GameObjects.BitmapText[] = [];
  private slotCd: Phaser.GameObjects.BitmapText[] = [];
  private auraIcons: Phaser.GameObjects.Image[] = [];
  private invIcons: Phaser.GameObjects.Image[] = [];
  private invQty: Phaser.GameObjects.BitmapText[] = [];
  private logLines: { obj: Phaser.GameObjects.BitmapText; born: number }[] = [];
  private errorUntil = 0;
  private diedAt = 0;
  private invOpen = false;
  private uiRects: Rect[] = [];
  private slotRects: Rect[] = [];
  private bagRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private exitRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private invRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private fpsAcc = { frames: 0, since: 0, fps: 60 };

  constructor() {
    super('hud');
  }

  init(): void {
    this.t = {};
    this.slotIcons = [];
    this.slotKeys = [];
    this.slotCd = [];
    this.auraIcons = [];
    this.invIcons = [];
    this.invQty = [];
    this.logLines = [];
    this.errorUntil = 0;
    this.diedAt = 0;
    this.invOpen = false;
    this.uiRects = [];
    this.slotRects = [];
  }

  create(): void {
    this.session = this.registry.get('session') as GameSession;
    this.game3 = this.scene.get('game') as GameScene;
    this.game3.hud = this;
    this.g = this.add.graphics();
    this.overlay = this.add.graphics().setDepth(10);
    this.tip = new Tooltip(this);
    const text = (
      key: string,
      origin: [number, number] = [0, 0],
    ): Phaser.GameObjects.BitmapText => {
      const b = this.add.bitmapText(0, 0, FONT_KEY, '').setOrigin(origin[0], origin[1]).setDepth(5);
      this.t[key] = b;
      return b;
    };
    text('name');
    text('hp', [0.5, 0]);
    text('res', [0.5, 0]);
    text('tname');
    text('tlvl', [1, 0]);
    text('thp', [0.5, 0]);
    text('zone', [1, 0]);
    text('zkind', [1, 0]);
    text('ping', [1, 0]);
    text('gold', [1, 1]);
    text('cast', [0.5, 1]);
    text('error', [0.5, 0]).setTint(0xff5a4a);
    text('dead', [0.5, 0.5]).setScale(2).setTint(0xff5a4a);
    text('respawn', [0.5, 0]);
    text('bag', [0.5, 0.5]);
    text('invTitle');
    text('exit', [0.5, 0.5]).setText(T.exit);
    this.t.bag?.setText('I');
    this.t.invTitle?.setText(T.inventory);

    const cls = CLASSES[this.session.cls];
    cls.abilities.forEach((id, i) => {
      const ab = ABILITIES[id];
      this.slotIcons.push(
        this.add
          .image(0, 0, `icon_${ab?.icon ?? 'espada'}`)
          .setOrigin(0, 0)
          .setDepth(3),
      );
      this.slotKeys.push(
        this.add
          .bitmapText(0, 0, FONT_KEY, String(i + 1))
          .setDepth(6)
          .setTint(0xd8d0b8),
      );
      this.slotCd.push(this.add.bitmapText(0, 0, FONT_KEY, '').setOrigin(0.5, 0.5).setDepth(7));
    });

    const zone = ZONES[this.session.zoneId];
    this.t.zone?.setText(zone?.name ?? '');
    this.t.zkind?.setText(T.zoneKind[zone?.kind ?? 'neutral'] ?? '').setTint(0xf2c14e);

    const kb = this.input.keyboard as Phaser.Input.Keyboard.KeyboardPlugin;
    kb.on('keydown-I', () => (this.invOpen = !this.invOpen));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onClick(p));
  }

  // ------------------------------------------------------------ HudBridge
  isOverUi(x: number, y: number): boolean {
    return this.uiRects.some((r) => inside(r, x, y));
  }

  showError(text: string): void {
    this.t.error?.setText(text).setAlpha(1);
    this.errorUntil = this.time.now + 2000;
  }

  log(text: string, color: number = UI.text): void {
    const obj = this.add.bitmapText(0, 0, FONT_KEY, text).setTint(color).setDepth(5);
    this.logLines.push({ obj, born: this.time.now });
    if (this.logLines.length > 6) this.logLines.shift()?.obj.destroy();
  }

  onSelfDied(): void {
    this.diedAt = this.time.now;
  }

  // ------------------------------------------------------------ entrada
  private onClick(p: Phaser.Input.Pointer): void {
    if (!p.leftButtonDown()) return;
    if (inside(this.exitRect, p.x, p.y)) {
      this.session.leaving = true;
      this.session.conn.close();
      return;
    }
    const slot = this.slotRects.findIndex((r) => inside(r, p.x, p.y));
    if (slot >= 0) {
      this.game3.useSlot(slot);
      return;
    }
    if (inside(this.bagRect, p.x, p.y)) this.invOpen = !this.invOpen;
  }

  // ------------------------------------------------------------ dibujo
  update(time: number, delta: number): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const world = this.session.world;
    const me = world.me;
    const self = world.self;
    const g = this.g;
    g.clear();
    this.overlay.clear();
    this.uiRects = [];
    const pointer = this.input.activePointer;
    let tipShown = false;

    // --- Marco del jugador
    const fac = FACTIONS[this.session.faction];
    drawPanel(g, 6, 6, 124, 34, fac.colors.primary);
    this.uiRects.push({ x: 6, y: 6, w: 124, h: 34 });
    g.fillStyle(fac.colors.dark, 1).fillRect(10, 10, 26, 26);
    g.fillStyle(fac.colors.primary, 1).fillRect(10, 10, 26, 1).fillRect(10, 35, 26, 1);
    this.t.name?.setText(this.session.name).setPosition(40, 9);
    if (self) {
      drawBar(g, 40, 19, 86, 9, self.hp / self.mhp, self.hp / self.mhp > 0.25 ? UI.hp : UI.hpLow);
      const rageCls = CLASSES[this.session.cls].resource === 'ira';
      drawBar(g, 40, 29, 86, 8, self.res / self.mres, rageCls ? UI.rage : UI.mana);
      this.t.hp?.setText(`${self.hp}/${self.mhp}`).setPosition(83, 20);
      this.t.res?.setText(`${self.res}/${self.mres}`).setPosition(83, 30);
    }
    this.classBadge(g, 23, 23);

    // --- Auras propias
    let ai = 0;
    for (const a of self?.auras ?? []) {
      const def = AURAS[a.id];
      if (!def) continue;
      const icon = this.auraIcon(ai++, iconForAura(a.id));
      const x = 6 + (ai - 1) * 18;
      icon.setPosition(x, 44).setVisible(true);
      g.lineStyle(1, def.harmful ? 0xc0281e : 0x3ed34a, 1).strokeRect(x - 0.5, 43.5, 17, 17);
      if (inside({ x, y: 44, w: 16, h: 16 }, pointer.x, pointer.y)) {
        this.tip.show(`aura:${a.id}`, x, 42, [
          { text: def.name, color: 0xffffff },
          { text: def.description, color: 0xffd100 },
          { text: T.seconds(fmt(a.left, 0)), color: UI.muted },
        ]);
        tipShown = true;
      }
    }

    // --- Marco del objetivo
    const tgt = this.game3.targetId ? world.entities.get(this.game3.targetId) : undefined;
    if (tgt && (tgt.init.k === 'mob' || tgt.init.k === 'player')) {
      const hostile = tgt.init.k === 'mob' || tgt.init.fac !== this.session.faction;
      drawPanel(g, 136, 6, 124, 34, hostile ? 0xa02a3a : 0x3a8a3a);
      this.uiRects.push({ x: 136, y: 6, w: 124, h: 34 });
      this.t.tname
        ?.setText(tgt.init.n)
        .setPosition(140, 9)
        .setTint(hostile ? 0xff6a5a : 0xb0ffb0)
        .setVisible(true);
      this.t.tlvl
        ?.setText(String(tgt.init.lvl))
        .setPosition(256, 9)
        .setTint(0xffd100)
        .setVisible(true);
      drawBar(g, 140, 19, 116, 9, tgt.hp / tgt.mhp, UI.hp);
      this.t.thp?.setText(`${tgt.hp}/${tgt.mhp}`).setPosition(198, 20).setVisible(true);
      if (tgt.flags & FLAG.casting) {
        drawBar(g, 140, 30, 116, 6, (time % 1000) / 1000, UI.cast);
      }
      tgt.auras.forEach((id, i) => {
        const def = AURAS[id];
        if (!def) return;
        const icon = this.auraIcon(ai++, iconForAura(id));
        icon.setPosition(136 + i * 18, 44).setVisible(true);
      });
      if (tgt.init.k === 'mob' && inside({ x: 136, y: 6, w: 124, h: 34 }, pointer.x, pointer.y)) {
        const def = MOBS[tgt.init.mob ?? ''];
        if (def) {
          this.tip.show(`mob:${def.id}`, 136, 50 + 40, [
            { text: def.name, color: 0xff6a5a },
            { text: T.level(def.level), color: UI.muted },
          ]);
          tipShown = true;
        }
      }
    } else {
      this.t.tname?.setVisible(false);
      this.t.tlvl?.setVisible(false);
      this.t.thp?.setVisible(false);
    }
    for (let i = ai; i < this.auraIcons.length; i++) this.auraIcons[i]?.setVisible(false);

    // --- Zona, ping, FPS y salir a la seleccion de personajes
    this.exitRect = { x: W - 44, y: 4, w: 40, h: 14 };
    drawPanel(
      g,
      this.exitRect.x,
      this.exitRect.y,
      this.exitRect.w,
      this.exitRect.h,
      inside(this.exitRect, pointer.x, pointer.y) ? 0xf2c14e : UI.border,
    );
    this.uiRects.push(this.exitRect);
    this.t.exit?.setPosition(W - 24, 12);
    this.t.zone?.setPosition(W - 50, 6);
    this.t.zkind?.setPosition(W - 50, 16);
    this.fpsAcc.frames++;
    this.fpsAcc.since += delta;
    if (this.fpsAcc.since >= 1000) {
      this.fpsAcc.fps = Math.round((this.fpsAcc.frames * 1000) / this.fpsAcc.since);
      this.fpsAcc.frames = 0;
      this.fpsAcc.since = 0;
    }
    this.t.ping
      ?.setText(`${this.fpsAcc.fps} FPS  ${T.ping(Math.round(this.session.conn.rtt))}`)
      .setPosition(W - 6, 26)
      .setTint(UI.muted);

    // --- Barra de accion
    const cls = CLASSES[this.session.cls];
    const barW = cls.abilities.length * (SLOT + SLOT_GAP) - SLOT_GAP;
    const bx = Math.round(W / 2 - barW / 2);
    const by = H - SLOT - 6;
    drawPanel(g, bx - 4, by - 4, barW + 8, SLOT + 8);
    this.uiRects.push({ x: bx - 4, y: by - 4, w: barW + 8, h: SLOT + 8 });
    this.slotRects = [];
    cls.abilities.forEach((id, i) => {
      const ab = ABILITIES[id] as AbilityDef;
      const x = bx + i * (SLOT + SLOT_GAP);
      const r = { x, y: by, w: SLOT, h: SLOT };
      this.slotRects.push(r);
      g.fillStyle(0x000000, 1).fillRect(x, by, SLOT, SLOT);
      const hover = inside(r, pointer.x, pointer.y);
      g.lineStyle(1, hover ? 0xf2c14e : 0x6a5a42, 1).strokeRect(
        x + 0.5,
        by + 0.5,
        SLOT - 1,
        SLOT - 1,
      );
      const icon = this.slotIcons[i] as Phaser.GameObjects.Image;
      icon.setPosition(x + 3, by + 3);
      const cd = Math.max(self?.cds[id] ?? 0, ab.gcd ? (self?.gcd ?? 0) : 0);
      const noRes = (self?.res ?? 0) < ab.cost;
      icon.setTint(noRes ? 0x7070c0 : 0xffffff);
      if (cd > 0) {
        const total = Math.max(ab.cooldown, ab.gcd ? 1.5 : 0, cd);
        const frac = cd / total;
        this.overlay
          .fillStyle(0x000000, 0.65)
          .fillRect(x + 3, by + 3 + Math.round(16 * (1 - frac)), 16, Math.round(16 * frac));
      }
      this.slotKeys[i]?.setPosition(x + 2, by + 1);
      this.slotCd[i]
        ?.setText(cd >= 1.5 && (self?.cds[id] ?? 0) > 0 ? String(Math.ceil(cd)) : '')
        .setPosition(x + SLOT / 2, by + SLOT / 2 + 1);
      if (hover) {
        this.tip.show(`ab:${id}`, x, by - 4, abilityTooltip(ab, cls.resource));
        tipShown = true;
      }
    });

    // --- Barra de lanzamiento propia
    const cast = self?.cast;
    if (cast) {
      const cw = 140;
      const cx = Math.round(W / 2 - cw / 2);
      const cy = by - 22;
      drawPanel(g, cx - 2, cy - 2, cw + 4, 12);
      drawBar(g, cx, cy, cw, 8, 1 - cast.left / cast.total, UI.cast);
      this.t.cast
        ?.setText(ABILITIES[cast.ab]?.name ?? '')
        .setPosition(W / 2, cy - 3)
        .setVisible(true);
    } else {
      this.t.cast?.setVisible(false);
    }

    // --- Oro y bolsa
    this.t.gold
      ?.setText(formatCoins(self?.gold ?? 0))
      .setPosition(W - 30, H - 8)
      .setTint(0xf2c14e);
    this.bagRect = { x: W - 24, y: H - 26, w: 20, h: 20 };
    drawPanel(g, this.bagRect.x, this.bagRect.y, 20, 20, this.invOpen ? 0xf2c14e : UI.border);
    this.t.bag?.setPosition(W - 14, H - 15);
    this.uiRects.push(this.bagRect);
    if (this.drawInventory(g, W, H, pointer)) tipShown = true;

    // --- Mensajes de error
    if (time < this.errorUntil) {
      this.t.error
        ?.setPosition(W / 2, 64)
        .setVisible(true)
        .setAlpha(Math.min(1, (this.errorUntil - time) / 400));
    } else {
      this.t.error?.setVisible(false);
    }

    // --- Registro (abajo a la izquierda)
    this.logLines.forEach((l, i) => {
      const age = time - l.born;
      l.obj
        .setPosition(6, H - 12 - (this.logLines.length - 1 - i) * 10)
        .setAlpha(age > 8000 ? Math.max(0, 1 - (age - 8000) / 2000) : 1);
    });

    // --- Muerte
    const dead = me ? (me.flags & FLAG.dead) !== 0 : false;
    this.t.dead
      ?.setVisible(dead)
      .setText(T.dead)
      .setPosition(W / 2, H / 2 - 30);
    if (dead) {
      const left = Math.max(0, Math.ceil(RESPAWN_SECONDS - (time - this.diedAt) / 1000));
      this.t.respawn
        ?.setVisible(true)
        .setText(T.respawnIn(left))
        .setPosition(W / 2, H / 2 - 12);
      this.overlay.fillStyle(0x000000, 0.35).fillRect(0, 0, W, H);
    } else {
      this.t.respawn?.setVisible(false);
    }

    if (!tipShown) this.tip.hide();
  }

  private classBadge(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    const color = this.session.cls === 'guerrero' ? 0xb8c2cc : 0x7fd8ff;
    g.fillStyle(color, 1).fillRect(cx - 5, cy - 7, 10, 14);
    g.fillStyle(0x000000, 0.4).fillRect(cx - 5, cy + 3, 10, 4);
    g.fillStyle(FACTIONS[this.session.faction].colors.primary, 1).fillRect(cx - 1, cy - 7, 2, 14);
  }

  private auraIcon(i: number, icon: string): Phaser.GameObjects.Image {
    let img = this.auraIcons[i];
    if (!img) {
      img = this.add.image(0, 0, `icon_${icon}`).setOrigin(0, 0).setDepth(4);
      this.auraIcons.push(img);
    }
    img.setTexture(`icon_${icon}`);
    return img;
  }

  /** Devuelve true si muestra un tooltip. */
  private drawInventory(
    g: Phaser.GameObjects.Graphics,
    W: number,
    H: number,
    pointer: Phaser.Input.Pointer,
  ): boolean {
    const inv = this.session.world.inventory;
    if (!this.invOpen) {
      this.t.invTitle?.setVisible(false);
      for (const i of this.invIcons) i.setVisible(false);
      for (const q of this.invQty) q.setVisible(false);
      return false;
    }
    const w = INV_COLS * INV_CELL + 8;
    const h = 4 * INV_CELL + 18;
    const x0 = W - w - 6;
    const y0 = H - h - 34;
    this.invRect = { x: x0, y: y0, w, h };
    this.uiRects.push(this.invRect);
    drawPanel(g, x0, y0, w, h, 0x8a7a5a);
    this.t.invTitle
      ?.setVisible(true)
      .setPosition(x0 + 4, y0 + 4)
      .setTint(0xf2c14e);
    let tip = false;
    for (let i = 0; i < 16; i++) {
      const cx = x0 + 4 + (i % INV_COLS) * INV_CELL;
      const cy = y0 + 14 + Math.floor(i / INV_COLS) * INV_CELL;
      const it = inv[i];
      const def = it ? ITEMS[it.item] : undefined;
      g.fillStyle(0x000000, 1).fillRect(cx, cy, INV_CELL - 2, INV_CELL - 2);
      g.lineStyle(1, def ? RARITY_COLORS[def.rarity] : 0x3a3242, 1).strokeRect(
        cx + 0.5,
        cy + 0.5,
        INV_CELL - 3,
        INV_CELL - 3,
      );
      let icon = this.invIcons[i];
      let qty = this.invQty[i];
      if (!icon) {
        icon = this.add.image(0, 0, 'icon_espada').setOrigin(0, 0).setDepth(4);
        this.invIcons.push(icon);
      }
      if (!qty) {
        qty = this.add.bitmapText(0, 0, FONT_KEY, '').setOrigin(1, 1).setDepth(6);
        this.invQty.push(qty);
      }
      if (def && it) {
        icon
          .setTexture(`icon_${def.icon}`)
          .setPosition(cx + 1, cy + 1)
          .setVisible(true);
        qty
          .setText(it.qty > 1 ? String(it.qty) : '')
          .setPosition(cx + INV_CELL - 2, cy + INV_CELL - 1)
          .setVisible(true);
        if (inside({ x: cx, y: cy, w: INV_CELL, h: INV_CELL }, pointer.x, pointer.y)) {
          const lines: TipLine[] = [{ text: def.name, color: RARITY_COLORS[def.rarity] }];
          if (T.slot[def.slot]) lines.push({ text: T.slot[def.slot] as string });
          for (const [k, v] of Object.entries(def.stats ?? {}))
            lines.push({ text: `+${v} ${T.stat[k] ?? k}` });
          if (def.description) lines.push({ text: `"${def.description}"`, color: 0xffd100 });
          lines.push({ text: T.sellValue(formatCoins(def.value)), color: UI.muted });
          this.tip.show(`item:${i}:${def.id}`, cx, cy - 2, lines);
          tip = true;
        }
      } else {
        icon.setVisible(false);
        qty.setVisible(false);
      }
    }
    return tip;
  }
}

function iconForAura(id: string): string {
  const map: Record<string, string> = {
    grito_guerra: 'grito',
    defensa_ferrea: 'escudo',
    armadura_escarcha: 'armadura',
    quemadura: 'fuego',
    escarcha_lenta: 'hielo',
    congelado: 'nova',
    tendon_cortado: 'tendon',
    aturdido_carga: 'carga',
  };
  return map[id] ?? 'sombra';
}

/** Tooltip de habilidad con valores resueltos desde los datos. */
export function abilityTooltip(ab: AbilityDef, resource: string): TipLine[] {
  const lines: TipLine[] = [{ text: ab.name, color: 0xffffff }];
  if (ab.cost > 0) lines.push({ text: T.cost(ab.cost, T.resource[resource] ?? resource) });
  lines.push({ text: ab.castTime > 0 ? T.castTime(fmt(ab.castTime)) : T.instant });
  if (ab.cooldown > 0)
    lines.push({
      text: T.cooldown(
        ab.cooldown >= 60 ? T.minutes(ab.cooldown / 60) : T.seconds(fmt(ab.cooldown)),
      ),
    });
  if (ab.range > 2) lines.push({ text: T.range(ab.range) });
  else if (ab.range > 0) lines.push({ text: T.meleeRange });
  const dmg = ab.effects.find((e) => e.kind === 'damage');
  const heal = ab.effects.find((e) => e.kind === 'heal');
  let desc = ab.description;
  if (dmg && dmg.kind === 'damage')
    desc = desc.replace('{d}', dmg.min === dmg.max ? String(dmg.min) : `${dmg.min} a ${dmg.max}`);
  if (heal && heal.kind === 'heal') desc = desc.replace('{h}', `${heal.min} a ${heal.max}`);
  lines.push({ text: desc, color: 0xffd100 });
  return lines;
}

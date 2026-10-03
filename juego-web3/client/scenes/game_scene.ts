import Phaser from 'phaser';
import { ABILITIES } from '../../shared/data/abilities.ts';
import { CLASSES } from '../../shared/data/classes.ts';
import { ITEMS, RARITY_COLORS } from '../../shared/data/items.ts';
import { screenToWorld, worldToScreen } from '../../shared/iso.ts';
import { formatCoins } from '../../shared/money.ts';
import { FLAG, type GameEvent } from '../../shared/protocol.ts';
import { SCHOOL_COLORS } from '../gfx/world_textures.ts';
import { ERRORS, T } from '../i18n.ts';
import type { ClientEntity } from '../net/world.ts';
import type { GameSession } from '../session.ts';
import { EntityView } from './entity_view.ts';
import { Fx, type FxPalette } from './fx.ts';
import { MapView } from './map_view.ts';

/** Interfaz minima que el mundo necesita de la escena de HUD. */
export interface HudBridge {
  isOverUi(x: number, y: number): boolean;
  showError(text: string): void;
  log(text: string, color?: number): void;
  onSelfDied(): void;
}

const HOLD_MOVE_MS = 120;
const WASD_MS = 100;

/**
 * Escena del mundo: mapa, entidades, efectos y entrada del jugador
 * (estilo Diablo). Todo lo que se envia al servidor son intenciones.
 */
export class GameScene extends Phaser.Scene {
  session!: GameSession;
  hud: HudBridge | null = null;
  private mapView!: MapView;
  private views = new Map<number, EntityView>();
  private pool: EntityView[] = [];
  private fx!: Fx;
  private ring!: Phaser.GameObjects.Graphics;
  private marker!: Phaser.GameObjects.Graphics;
  private markerUntil = 0;
  /** Objetivo seleccionado localmente (se notifica al servidor). */
  targetId = 0;
  hoveredId = 0;
  private holdingMove = false;
  private lastHoldSend = 0;
  private lastWasd = 0;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('game');
  }

  /** La escena se reutiliza al volver a entrar: todo el estado empieza de cero. */
  init(): void {
    this.views = new Map();
    this.pool = [];
    this.targetId = 0;
    this.hoveredId = 0;
    this.holdingMove = false;
    this.markerUntil = 0;
    this.hud = null;
  }

  create(): void {
    this.session = this.registry.get('session') as GameSession;
    this.events.once('shutdown', () => {
      // Suelta las texturas de personaje contadas por referencias.
      for (const v of this.views.values()) v.dropTexture();
      this.input.setDefaultCursor('default');
    });
    this.mapView = new MapView(this, this.session.map);
    this.fx = new Fx(this);
    this.ring = this.add.graphics();
    this.marker = this.add.graphics().setDepth(-1e5);
    const world = this.session.world;
    world.onEvent((ev) => this.onEvent(ev));
    world.onRemove((id) => this.releaseView(id));

    const kb = this.input.keyboard as Phaser.Input.Keyboard.KeyboardPlugin;
    this.keys = kb.addKeys('W,A,S,D,ONE,TWO,THREE,FOUR,FIVE,SIX,TAB,ESC') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    const slots = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'];
    slots.forEach((k, i) => {
      this.keys[k]?.on('down', () => this.useSlot(i));
    });
    this.keys.TAB?.on('down', () => this.cycleTarget());
    this.keys.ESC?.on('down', () => this.setTarget(0));
    kb.addCapture('TAB');

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.leftButtonReleased()) this.holdingMove = false;
    });
  }

  // ---------------------------------------------------------------- entrada
  private pointerWorld(): { x: number; y: number } {
    const p = this.input.activePointer;
    const cam = this.cameras.main;
    return screenToWorld(p.x + cam.scrollX, p.y + cam.scrollY);
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (this.hud?.isOverUi(p.x, p.y)) return;
    // El clic puede llegar en el mismo frame en que se movio el raton.
    this.updateHover();
    const world = this.session.world;
    if (p.rightButtonDown()) {
      this.useSlot(0);
      return;
    }
    if (!p.leftButtonDown()) return;
    const hovered = this.hoveredId ? world.entities.get(this.hoveredId) : undefined;
    if (hovered) {
      const k = hovered.init.k;
      if (k === 'mob' && !(hovered.flags & FLAG.dead)) {
        this.setTarget(hovered.id);
        world.stopPredicting();
        this.session.conn.send({ t: 'attack', id: hovered.id });
        return;
      }
      if (k === 'loot') {
        world.stopPredicting();
        this.session.conn.send({ t: 'pickup', id: hovered.id });
        return;
      }
      if (k === 'player') {
        this.setTarget(hovered.id);
        return;
      }
    }
    this.holdingMove = true;
    this.moveTo(this.pointerWorld(), true);
  }

  private moveTo(w: { x: number; y: number }, mark: boolean): void {
    this.session.conn.send({ t: 'move', x: w.x, y: w.y });
    this.session.world.predictMove(w.x, w.y);
    if (mark) {
      const s = worldToScreen(w.x, w.y);
      this.marker
        .clear()
        .lineStyle(1, 0xf2c14e, 1)
        .strokeEllipse(Math.round(s.x), Math.round(s.y), 10, 5);
      this.markerUntil = this.time.now + 350;
    }
  }

  setTarget(id: number): void {
    if (this.targetId === id) return;
    this.targetId = id;
    this.session.conn.send({ t: 'target', id: id || null });
  }

  private cycleTarget(): void {
    const world = this.session.world;
    const me = world.me;
    if (!me) return;
    const mobs = [...world.entities.values()]
      .filter(
        (e) =>
          e.init.k === 'mob' && !(e.flags & FLAG.dead) && Math.hypot(e.x - me.x, e.y - me.y) < 14,
      )
      .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
    if (mobs.length === 0) return;
    const idx = mobs.findIndex((m) => m.id === this.targetId);
    this.setTarget((mobs[(idx + 1) % mobs.length] as ClientEntity).id);
  }

  /** Usa la habilidad de la ranura i (0..5) sobre el enemigo bajo el cursor o el objetivo. */
  useSlot(i: number): void {
    const world = this.session.world;
    const abId = CLASSES[this.session.cls].abilities[i];
    const ab = abId ? ABILITIES[abId] : undefined;
    if (!ab) return;
    if (ab.target === 'enemy') {
      const hovered = this.hoveredId ? world.entities.get(this.hoveredId) : undefined;
      const hoverMob =
        hovered && hovered.init.k === 'mob' && !(hovered.flags & FLAG.dead) ? hovered.id : 0;
      const id = hoverMob || this.targetId;
      if (!id) {
        this.hud?.showError(ERRORS.sin_objetivo);
        return;
      }
      this.setTarget(id);
      world.stopPredicting();
      this.session.conn.send({ t: 'cast', ab: ab.id, id });
    } else if (ab.target === 'point') {
      const w = this.pointerWorld();
      world.stopPredicting();
      this.session.conn.send({ t: 'cast', ab: ab.id, x: w.x, y: w.y });
    } else {
      if (ab.castTime > 0) world.stopPredicting();
      this.session.conn.send({ t: 'cast', ab: ab.id });
    }
  }

  private updateHover(): void {
    const p = this.input.activePointer;
    const cam = this.cameras.main;
    const mx = p.x + cam.scrollX;
    const my = p.y + cam.scrollY;
    let best = 0;
    let bestDepth = -Infinity;
    if (!this.hud?.isOverUi(p.x, p.y)) {
      const world = this.session.world;
      for (const [id, v] of this.views) {
        if (id === world.selfId || v.kind === 'proj' || !v.sprite.visible) continue;
        // Los cadaveres no se seleccionan: el botin que dejan queda accesible.
        const e = world.entities.get(id);
        if (!e || e.flags & FLAG.dead) continue;
        const s = v.sprite;
        const w = v.kind === 'loot' ? 14 : 18;
        const h = v.kind === 'loot' ? 14 : 30;
        // El botin tiene prioridad sobre lo que este detras o encima.
        const depth = v.kind === 'loot' ? s.depth + 1e5 : s.depth;
        if (
          mx >= s.x - w / 2 &&
          mx <= s.x + w / 2 &&
          my >= s.y - h &&
          my <= s.y + 2 &&
          depth > bestDepth
        ) {
          best = id;
          bestDepth = depth;
        }
      }
    }
    this.hoveredId = best;
    this.input.setDefaultCursor(best ? 'pointer' : 'default');
  }

  private updateKeyboardMove(now: number): void {
    const k = this.keys;
    const dx = (k.D?.isDown ? 1 : 0) - (k.A?.isDown ? 1 : 0);
    const dy = (k.S?.isDown ? 1 : 0) - (k.W?.isDown ? 1 : 0);
    if (!dx && !dy) return;
    if (now - this.lastWasd < WASD_MS) return;
    this.lastWasd = now;
    const me = this.session.world.me;
    if (!me) return;
    // Direccion de pantalla -> direccion de mundo.
    const w = screenToWorld(dx * 16, dy * 16);
    const len = Math.hypot(w.x, w.y) || 1;
    this.moveTo({ x: me.x + (w.x / len) * 1.5, y: me.y + (w.y / len) * 1.5 }, false);
  }

  // ---------------------------------------------------------------- eventos
  private onEvent(ev: GameEvent): void {
    const world = this.session.world;
    const now = this.time.now;
    switch (ev.e) {
      case 'dmg': {
        const t = world.entities.get(ev.t);
        if (!t) return;
        const mine = ev.t === world.selfId;
        const byMe = ev.s === world.selfId;
        if (ev.r === 'miss' || ev.r === 'dodge') {
          this.fx.float(ev.r === 'miss' ? T.miss : T.dodge, t.x, t.y, 0xb0b0b0);
          return;
        }
        const color = mine
          ? 0xff4a3a
          : ev.sc === 'fisico'
            ? byMe
              ? 0xffffff
              : 0xffe28a
            : (SCHOOL_COLORS[ev.sc] ?? 0xffffff);
        if (mine || byMe || ev.r === 'crit')
          this.fx.float(String(ev.a), t.x, t.y, color, ev.r === 'crit');
        const v = this.views.get(ev.t);
        v?.flash(now);
        if (v && !(t.flags & FLAG.moving)) v.oneShot('hit', now);
        const pal: FxPalette =
          ev.sc === 'fuego'
            ? 'fuego'
            : ev.sc === 'hielo'
              ? 'hielo'
              : ev.sc === 'arcano'
                ? 'arcano'
                : ev.sc === 'sombra'
                  ? 'sombra'
                  : 'sangre';
        this.fx.burst(pal, t.x, t.y, ev.r === 'crit' ? 14 : 6);
        return;
      }
      case 'heal': {
        const t = world.entities.get(ev.t);
        if (!t) return;
        this.fx.float(`+${ev.a}`, t.x, t.y, 0x4ae05a);
        this.fx.burst('sanacion', t.x, t.y, 10);
        return;
      }
      case 'swing': {
        const s = world.entities.get(ev.s);
        const v = this.views.get(ev.s);
        if (s && v && ev.s !== world.selfId) v.oneShot('attack', now);
        if (ev.s === world.selfId) this.views.get(ev.s)?.oneShot('attack', now);
        return;
      }
      case 'fx': {
        const pal: Record<string, [FxPalette, 'ring' | 'burst', number]> = {
          nova_escarcha: ['hielo', 'ring', 3],
          torbellino: ['acero', 'ring', 2],
          explosion_arcana: ['arcano', 'ring', 2.5],
          parpadeo: ['arcano', 'burst', 0],
          carga: ['polvo', 'burst', 0],
          grito_guerra: ['sagrado', 'ring', 1.2],
          defensa_ferrea: ['acero', 'burst', 0],
          armadura_escarcha: ['hielo', 'burst', 0],
        };
        const p = pal[ev.ab];
        if (!p) return;
        if (p[1] === 'ring') {
          this.fx.ring(p[0], ev.x, ev.y, p[2] * 0.5, 16);
          this.fx.ring(p[0], ev.x, ev.y, p[2], 32);
        } else {
          this.fx.burst(p[0], ev.x, ev.y, 18);
        }
        return;
      }
      case 'err':
        this.hud?.showError(ERRORS[ev.code]);
        return;
      case 'loot': {
        if (ev.c > 0) this.hud?.log(T.coins(formatCoins(ev.c)), 0xf2c14e);
        for (const id of ev.items) {
          const def = ITEMS[id];
          if (def) this.hud?.log(T.received(def.name), RARITY_COLORS[def.rarity]);
        }
        return;
      }
      case 'die':
        if (ev.id === world.selfId) this.hud?.onSelfDied();
        if (ev.id === this.targetId) this.setTarget(0);
        return;
      default:
        return;
    }
  }

  // ---------------------------------------------------------------- vistas
  private viewFor(e: ClientEntity): EntityView {
    let v = this.views.get(e.id);
    if (!v) {
      v = this.pool.pop() ?? new EntityView(this);
      v.bind(e, this.session.faction, this.session.world.selfId);
      this.views.set(e.id, v);
    }
    return v;
  }

  private releaseView(id: number): void {
    const v = this.views.get(id);
    if (!v) return;
    v.release();
    this.views.delete(id);
    this.pool.push(v);
    if (this.targetId === id) this.targetId = 0;
  }

  update(time: number, delta: number): void {
    const world = this.session.world;
    world.update(performance.now(), Math.min(0.1, delta / 1000));
    const me = world.me;

    // Camara centrada en el jugador, en pixeles enteros.
    const cam = this.cameras.main;
    if (me) {
      const s = worldToScreen(me.x, me.y);
      cam.setScroll(Math.round(s.x - cam.width / 2), Math.round(s.y - 16 - cam.height / 2));
    }
    this.mapView.update(cam.worldView);
    this.updateHover();
    this.updateKeyboardMove(time);

    if (
      this.holdingMove &&
      this.input.activePointer.leftButtonDown() &&
      time - this.lastHoldSend > HOLD_MOVE_MS
    ) {
      this.lastHoldSend = time;
      this.moveTo(this.pointerWorld(), false);
    }

    const view = cam.worldView;
    for (const e of world.entities.values()) {
      const v = this.viewFor(e);
      const s = worldToScreen(e.x, e.y);
      // Culling: fuera de camara no se actualiza ni se dibuja.
      const visible =
        s.x > view.x - 40 && s.x < view.right + 40 && s.y > view.y - 20 && s.y < view.bottom + 50;
      v.sprite.setVisible(visible);
      if (!visible) {
        v.label.setVisible(false);
        v.hpBg.setVisible(false);
        v.hpFg.setVisible(false);
        continue;
      }
      const isSelf = e.id === world.selfId;
      const moving = isSelf
        ? world.predicting || (e.flags & FLAG.moving) !== 0
        : (e.flags & FLAG.moving) !== 0;
      const isTarget = e.id === this.targetId;
      const hovered = e.id === this.hoveredId;
      const unit = e.init.k === 'mob' || e.init.k === 'player';
      v.update(e, time, {
        moving,
        hovered,
        showName: e.init.k === 'player' ? true : hovered || isTarget,
        showHp: unit && !isSelf && (isTarget || hovered || e.hp < e.mhp),
      });
    }

    // Circulo de seleccion bajo el objetivo.
    this.ring.clear();
    const tgt = this.targetId ? world.entities.get(this.targetId) : undefined;
    if (tgt && !(tgt.flags & FLAG.dead)) {
      const s = worldToScreen(tgt.x, tgt.y);
      const col = tgt.init.k === 'mob' ? 0xe83a2a : 0x3ed34a;
      this.ring
        .lineStyle(1, col, 1)
        .strokeEllipse(Math.round(s.x), Math.round(s.y), 20, 10)
        .setDepth(s.y - 1);
    }
    if (time > this.markerUntil) this.marker.clear();
    this.fx.update(time);
  }
}

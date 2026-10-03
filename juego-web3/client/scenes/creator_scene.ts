import Phaser from 'phaser';
import {
  APPEARANCE_CATEGORIES,
  type Appearance,
  type AppearanceCategory,
  coerceAppearance,
  defaultAppearance,
  encodeAppearance,
  optionCount,
  optionIndex,
  randomizeAppearance,
  withOption,
} from '../../shared/appearance.ts';
import { CLASSES } from '../../shared/data/classes.ts';
import { FACTION_IDS, FACTIONS } from '../../shared/data/factions.ts';
import {
  EYE_COLORS,
  FEATURES,
  HAIR_COLORS,
  HAIR_STYLES,
  RACES,
  racesOfFaction,
  SEXES,
  type Sex,
} from '../../shared/data/races.ts';
import type { ClassId, FactionId } from '../../shared/data/types.ts';
import { validateName } from '../../shared/names.ts';
import { Rng } from '../../shared/rng.ts';
import { type BackgroundId, ensureBackground } from '../gfx/backgrounds.ts';
import { acquireCharacter, releaseCharacter } from '../gfx/paperdoll/index.ts';
import { type AnimName, animKey, FOOT_Y, FRAME_H } from '../gfx/pose.ts';
import { API_ERRORS, T } from '../i18n.ts';
import { type Api, ApiError } from '../net/api.ts';
import { background, button, hexColor, panel, paragraph, text } from '../ui/menu.ts';

const PREVIEW_SCALE = 3;
const PREVIEW_ANIMS: AnimName[] = ['idle', 'walk', 'attack'];

/**
 * Creador de personajes. Primero se elige faccion y luego raza, sexo, clase
 * y apariencia, con vista previa en vivo girable en 8 direcciones y con el
 * equipo inicial de la clase. "Aleatorio" respeta las categorias bloqueadas.
 * El servidor vuelve a validarlo todo al crear.
 */
export class CreatorScene extends Phaser.Scene {
  private api!: Api;
  private ui!: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Image | null = null;
  private step: 'faction' | 'details' = 'faction';
  private faction: FactionId = 'luz';
  private cls: ClassId = 'guerrero';
  private look: Appearance = defaultAppearance('humano', 'm');
  private locked = new Set<AppearanceCategory>();
  private dir = 0;
  private anim: AnimName = 'idle';
  private previewKey = '';
  private factionPreviews: string[] = [];
  private nameInput: HTMLInputElement | null = null;
  private error = '';
  private busy = false;
  private rng = new Rng(Date.now() % 2147483647);

  constructor() {
    super('creator');
  }

  init(): void {
    this.step = 'faction';
    this.error = '';
    this.busy = false;
    this.locked = new Set();
    this.dir = 0;
    this.anim = 'idle';
  }

  create(): void {
    this.api = this.registry.get('api') as Api;
    this.ui = this.add.container(0, 0);
    this.nameInput = document.createElement('input');
    this.nameInput.className = 'pixel-input';
    this.nameInput.maxLength = 12;
    this.nameInput.placeholder = T.name;
    this.nameInput.setAttribute('aria-label', T.name);
    this.nameInput.autocomplete = 'off';
    this.nameInput.spellcheck = false;
    this.nameInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') void this.submit();
    });
    document.body.append(this.nameInput);
    const onResize = (): void => this.render();
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
      this.nameInput?.remove();
      this.nameInput = null;
      this.dropPreviews();
    });
    this.render();
  }

  private dropPreviews(): void {
    if (this.previewKey) releaseCharacter(this, this.previewKey);
    this.previewKey = '';
    for (const k of this.factionPreviews) releaseCharacter(this, k);
    this.factionPreviews = [];
  }

  private setBackground(id: BackgroundId, fill: number): void {
    this.bg?.destroy();
    this.bg = background(this, ensureBackground(this, id), fill);
  }

  // ------------------------------------------------------------ estado
  private chooseFaction(f: FactionId): void {
    this.faction = f;
    const race = racesOfFaction(f)[0];
    if (!race) return;
    this.look = coerceAppearance({ ...this.look, race: race.id });
    if (!race.classes.includes(this.cls)) this.cls = race.classes[0] as ClassId;
    this.step = 'details';
    this.render();
  }

  private chooseRace(id: Appearance['race']): void {
    this.look = coerceAppearance({ ...this.look, race: id });
    if (!RACES[id].classes.includes(this.cls)) this.cls = RACES[id].classes[0] as ClassId;
    this.render();
  }

  private chooseSex(s: Sex): void {
    this.look = coerceAppearance({ ...this.look, sex: s });
    this.render();
  }

  private cycle(cat: AppearanceCategory, delta: number): void {
    this.look = withOption(this.look, cat, optionIndex(this.look, cat) + delta);
    this.render();
  }

  private toggleLock(cat: AppearanceCategory): void {
    if (this.locked.has(cat)) this.locked.delete(cat);
    else this.locked.add(cat);
    this.render();
  }

  private randomize(): void {
    this.look = randomizeAppearance(this.look, this.locked, this.rng);
    this.render();
  }

  private async submit(): Promise<void> {
    if (this.busy || !this.nameInput) return;
    const v = validateName(this.nameInput.value);
    if (!v.ok) {
      this.error = API_ERRORS.nombre_invalido ?? '';
      this.render();
      return;
    }
    this.busy = true;
    this.error = '';
    this.render();
    try {
      const c = await this.api.createCharacter(v.name, this.cls, encodeAppearance(this.look));
      this.scene.start('select', { select: c.id });
    } catch (e) {
      this.busy = false;
      this.error = API_ERRORS[e instanceof ApiError ? e.code : 'red'] ?? '';
      this.render();
    }
  }

  // ------------------------------------------------------------ dibujo
  private render(): void {
    if (!this.ui) return;
    this.ui.removeAll(true);
    // Se adquieren las nuevas texturas antes de soltar las viejas: si el
    // aspecto no ha cambiado, la textura se reutiliza sin recomponerse.
    const old = [this.previewKey, ...this.factionPreviews].filter(Boolean);
    this.previewKey = '';
    this.factionPreviews = [];
    if (this.step === 'faction') this.renderFactions();
    else this.renderDetails();
    for (const k of old) releaseCharacter(this, k);
  }

  private placeInput(x: number, y: number, w: number, h: number, visible: boolean): void {
    const el = this.nameInput;
    if (!el) return;
    el.style.display = visible ? 'block' : 'none';
    if (!visible) return;
    const r = this.game.canvas.getBoundingClientRect();
    const z = r.width / this.scale.width;
    Object.assign(el.style, {
      left: `${r.left + x * z}px`,
      top: `${r.top + y * z}px`,
      width: `${w * z}px`,
      height: `${h * z}px`,
      fontSize: `${Math.max(12, 8 * z)}px`,
    });
  }

  private renderFactions(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const ui = this.ui;
    this.setBackground('facciones', 0x14060c);
    this.placeInput(0, 0, 0, 0, false);
    text(this, ui, W / 2, 10, T.chooseFaction, 0xffffff, [0.5, 0], 2);
    FACTION_IDS.forEach((f, i) => {
      const fac = FACTIONS[f];
      const cx = Math.round(W / 4 + (i * W) / 2);
      const pw = Math.min(220, W / 2 - 24);
      const x = cx - pw / 2;
      const y = 40;
      const h = H - 80;
      panel(this, ui, x, y, pw, h, fac.colors.primary);
      text(this, ui, cx, y + 8, fac.name, fac.colors.primary, [0.5, 0], 3);
      paragraph(this, ui, x + 10, y + 40, pw - 20, fac.motto, 0xf1ead8);
      const race = racesOfFaction(f)[0];
      if (race) {
        const key = acquireCharacter(this, {
          appearance: defaultAppearance(race.id, 'm'),
          cls: 'guerrero',
          faction: f,
        });
        this.factionPreviews.push(key);
        const s = this.add
          .sprite(cx, y + h - 50, key)
          .setOrigin(0.5, FOOT_Y / FRAME_H)
          .setScale(PREVIEW_SCALE);
        s.play(animKey(key, 'idle', 0));
        ui.add(s);
        text(
          this,
          ui,
          cx,
          y + h - 40,
          racesOfFaction(f)
            .map((r) => r.plural)
            .join(', '),
          0xa79e8a,
          [0.5, 0],
        );
      }
      button(this, ui, cx - 60, y + h - 26, 120, 20, fac.name, () => this.chooseFaction(f), {
        accent: fac.colors.primary,
        selected: true,
      });
    });
    button(this, ui, 8, H - 28, 70, 20, T.back, () => this.scene.start('select'));
  }

  private renderDetails(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const ui = this.ui;
    const race = RACES[this.look.race];
    const fac = FACTIONS[this.faction];
    this.setBackground(race.id, race.id === 'orco' ? 0x14060c : 0x2a3a6a);

    // --- Panel izquierdo: raza, sexo, clase y apariencia.
    const lx = 8;
    const lw = 180;
    panel(this, ui, lx, 8, lw, H - 44, fac.colors.primary);
    let y = 14;
    text(this, ui, lx + 6, y, T.race, 0xf2c14e);
    y += 10;
    for (const r of racesOfFaction(this.faction)) {
      button(this, ui, lx + 6, y, lw - 12, 14, r.name, () => this.chooseRace(r.id), {
        selected: r.id === race.id,
      });
      y += 16;
    }
    text(this, ui, lx + 6, y + 2, T.sex, 0xf2c14e);
    y += 12;
    SEXES.forEach((s, i) => {
      const bw = (lw - 14) / 2;
      button(this, ui, lx + 6 + i * (bw + 2), y, bw, 14, T.sexes[s] ?? s, () => this.chooseSex(s), {
        selected: this.look.sex === s,
      });
    });
    y += 18;
    text(this, ui, lx + 6, y, T.class, 0xf2c14e);
    y += 10;
    race.classes.forEach((c, i) => {
      const bw = (lw - 14) / 2;
      button(
        this,
        ui,
        lx + 6 + i * (bw + 2),
        y,
        bw,
        14,
        CLASSES[c].name,
        () => {
          this.cls = c;
          this.render();
        },
        { selected: this.cls === c },
      );
    });
    y += 20;
    for (const cat of APPEARANCE_CATEGORIES) {
      text(this, ui, lx + 6, y, T.categories[cat] ?? cat, 0xd8d0b8);
      y += 10;
      button(this, ui, lx + 6, y, 14, 14, '<', () => this.cycle(cat, -1));
      button(this, ui, lx + lw - 38, y, 14, 14, '>', () => this.cycle(cat, 1));
      const swatch = this.swatchFor(cat);
      const label = this.labelFor(cat);
      if (swatch !== null) {
        const g = this.add.graphics();
        g.fillStyle(0x000000, 1).fillRect(lx + 22, y + 2, 12, 10);
        g.fillStyle(swatch, 1).fillRect(lx + 23, y + 3, 10, 8);
        ui.add(g);
      }
      text(this, ui, lx + (swatch !== null ? 38 : 24), y + 4, label, 0xffffff);
      button(
        this,
        ui,
        lx + lw - 22,
        y,
        16,
        14,
        this.locked.has(cat) ? 'X' : '-',
        () => this.toggleLock(cat),
        {
          selected: this.locked.has(cat),
        },
      );
      y += 17;
    }

    // --- Vista previa.
    const px = Math.round(lx + lw + (W - lx - lw - 160) / 2);
    const py = Math.round(H / 2 + 50);
    this.previewKey = acquireCharacter(this, {
      appearance: this.look,
      cls: this.cls,
      faction: this.faction,
    });
    const s = this.add
      .sprite(px, py, this.previewKey)
      .setOrigin(0.5, FOOT_Y / FRAME_H)
      .setScale(PREVIEW_SCALE);
    s.play(animKey(this.previewKey, this.anim, this.dir));
    ui.add(s);
    button(this, ui, px - 64, py - 60, 16, 16, '<', () => this.turn(1));
    button(this, ui, px + 48, py - 60, 16, 16, '>', () => this.turn(-1));
    PREVIEW_ANIMS.forEach((a, i) => {
      button(
        this,
        ui,
        px - 75 + i * 51,
        py + 10,
        49,
        14,
        T.previewAnims[a] ?? a,
        () => {
          this.anim = a;
          this.render();
        },
        { selected: this.anim === a },
      );
    });

    // --- Panel derecho: descripcion de raza y clase.
    const rw = 150;
    const rx = W - rw - 8;
    panel(this, ui, rx, 8, rw, H - 44, fac.colors.primary);
    let ry = 14;
    text(this, ui, rx + 6, ry, race.name, fac.colors.primary, [0, 0], 2);
    ry += 20;
    ry += paragraph(this, ui, rx + 6, ry, rw - 12, race.description) + 6;
    ry += paragraph(this, ui, rx + 6, ry, rw - 12, T.racialPassive(race.passive.name), 0xf2c14e);
    ry += paragraph(this, ui, rx + 6, ry, rw - 12, race.passive.description, 0x9ae09a) + 8;
    text(this, ui, rx + 6, ry, CLASSES[this.cls].name, 0xffffff);
    ry += 12;
    paragraph(this, ui, rx + 6, ry, rw - 12, CLASSES[this.cls].description, 0xd8d0b8);

    // --- Barra inferior: nombre, aleatorio, volver, crear.
    const by = H - 30;
    button(this, ui, 8, by, 60, 22, T.back, () => {
      this.step = 'faction';
      this.render();
    });
    button(this, ui, 72, by, 80, 22, T.random, () => this.randomize());
    const nx = Math.round(W / 2 - 60);
    panel(this, ui, nx - 2, by - 2, 124, 26);
    this.placeInput(nx, by, 120, 22, true);
    button(this, ui, W - 96, by, 88, 22, T.create, () => void this.submit(), {
      disabled: this.busy,
      selected: true,
      accent: fac.colors.primary,
    });
    if (this.error) text(this, ui, W / 2, by - 12, this.error, 0xff6a5a, [0.5, 0]);
  }

  private turn(delta: number): void {
    this.dir = (this.dir + delta + 8) % 8;
    this.render();
  }

  private swatchFor(cat: AppearanceCategory): number | null {
    const r = RACES[this.look.race];
    if (cat === 'skin') return hexColor(r.skinTones[this.look.skin] ?? '#000000');
    if (cat === 'hairColor') return hexColor(HAIR_COLORS[this.look.hairColor]?.hex ?? '#000000');
    if (cat === 'eyes') return hexColor(EYE_COLORS[this.look.eyes]?.hex ?? '#000000');
    return null;
  }

  private labelFor(cat: AppearanceCategory): string {
    const a = this.look;
    const r = RACES[a.race];
    const pos = `${optionIndex(a, cat) + 1}/${optionCount(a, cat)}`;
    switch (cat) {
      case 'skin':
        return T.tone(a.skin + 1);
      case 'hair':
        return HAIR_STYLES.find((h) => h.id === a.hair)?.name ?? pos;
      case 'hairColor':
        return HAIR_COLORS[a.hairColor]?.name ?? pos;
      case 'face':
        return T.faceN(a.face + 1);
      case 'feature':
        return FEATURES[r.features[a.sex][a.feature] ?? 'ninguno']?.name ?? pos;
      case 'eyes':
        return EYE_COLORS[a.eyes]?.name ?? pos;
    }
  }
}

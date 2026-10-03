import Phaser from 'phaser';
import { decodeAppearance } from '../../shared/appearance.ts';
import { CLASSES } from '../../shared/data/classes.ts';
import { FACTIONS } from '../../shared/data/factions.ts';
import { RACES, type RaceId } from '../../shared/data/races.ts';
import type { FactionId } from '../../shared/data/types.ts';
import { enterWorld } from '../enter_world.ts';
import { ensureBackground } from '../gfx/backgrounds.ts';
import { acquireCharacter, releaseCharacter } from '../gfx/paperdoll/index.ts';
import { animKey } from '../gfx/pose.ts';
import { API_ERRORS, T } from '../i18n.ts';
import { type Api, ApiError, type CharacterSummary } from '../net/api.ts';
import { background, button, panel, text } from '../ui/menu.ts';

const PREVIEW_SCALE = 3;

/**
 * Pantalla de seleccion de personajes: ranuras de la cuenta, vista previa
 * girable, entrar al mundo, crear y borrar.
 */
export class SelectScene extends Phaser.Scene {
  private api!: Api;
  private chars: CharacterSummary[] = [];
  private max = 6;
  private selected = 0;
  private ui!: Phaser.GameObjects.Container;
  private preview: Phaser.GameObjects.Sprite | null = null;
  private previewKey = '';
  private dir = 0;
  private error = '';
  private busy = false;
  private confirmDelete = false;

  constructor() {
    super('select');
  }

  private pendingSelect = 0;

  init(data: { error?: string; select?: number }): void {
    this.error = data?.error ?? '';
    this.chars = [];
    this.selected = 0;
    this.preview = null;
    this.previewKey = '';
    this.busy = false;
    this.confirmDelete = false;
    if (data?.select) this.pendingSelect = data.select;
  }

  create(): void {
    this.api = this.registry.get('api') as Api;
    background(this, ensureBackground(this, 'seleccion'), 0x16121c);
    this.ui = this.add.container(0, 0);
    this.events.once('shutdown', () => this.dropPreview());
    this.scale.on('resize', this.render, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.render, this));
    this.render();
    void this.loadCharacters();
  }

  private async loadCharacters(): Promise<void> {
    try {
      const r = await this.api.characters();
      this.chars = r.personajes;
      this.max = r.max;
      const idx = this.chars.findIndex((c) => c.id === this.pendingSelect);
      this.selected = idx >= 0 ? idx : 0;
      this.pendingSelect = 0;
      this.render();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        location.reload();
        return;
      }
      this.error = API_ERRORS.red ?? '';
      this.render();
    }
  }

  private dropPreview(): void {
    if (this.previewKey) releaseCharacter(this, this.previewKey);
    this.previewKey = '';
    this.preview = null;
  }

  private render(): void {
    if (!this.ui) return;
    this.ui.removeAll(true);
    const oldKey = this.previewKey;
    this.previewKey = '';
    this.preview = null;
    this.events.once('postupdate', () => {
      if (oldKey) releaseCharacter(this, oldKey);
    });
    const W = this.scale.width;
    const H = this.scale.height;
    const ui = this.ui;

    text(this, ui, W / 2, 10, T.selectTitle, 0xf2c14e, [0.5, 0], 2);
    button(this, ui, W - 92, 8, 84, 16, T.logout, () => {
      void this.api.logout().then(() => location.reload());
    });

    // Ranuras.
    const listX = 12;
    const listY = 40;
    panel(this, ui, listX - 4, listY - 4, 168, this.max * 30 + 6);
    for (let i = 0; i < this.max; i++) {
      const c = this.chars[i];
      const y = listY + i * 30;
      if (c) {
        button(
          this,
          ui,
          listX,
          y,
          160,
          26,
          '',
          () => {
            this.selected = i;
            this.confirmDelete = false;
            this.render();
          },
          {
            selected: i === this.selected,
            accent: FACTIONS[c.faction as FactionId].colors.primary,
          },
        );
        text(this, ui, listX + 6, y + 4, c.name, 0xffffff);
        const race = RACES[c.race as RaceId]?.name ?? c.race;
        text(
          this,
          ui,
          listX + 6,
          y + 14,
          T.levelClass(c.level, race, CLASSES[c.cls].name),
          0xa79e8a,
        );
      } else {
        button(this, ui, listX, y, 160, 26, T.emptySlot, () => this.scene.start('creator'), {
          disabled: this.busy,
        });
      }
    }

    // Vista previa.
    const c = this.chars[this.selected];
    const px = Math.round(W / 2);
    const py = Math.round(H / 2 + 70);
    if (c) {
      const ap = decodeAppearance(c.appearance);
      if (ap) {
        this.previewKey = acquireCharacter(this, {
          appearance: ap,
          cls: c.cls,
          faction: c.faction as FactionId,
        });
        this.preview = this.add
          .sprite(px, py, this.previewKey)
          .setOrigin(0.5, 37 / 40)
          .setScale(PREVIEW_SCALE);
        this.preview.play(animKey(this.previewKey, 'idle', this.dir));
        ui.add(this.preview);
      }
      text(this, ui, px, py + 10, c.name, 0xffffff, [0.5, 0], 2);
      const fac = FACTIONS[c.faction as FactionId];
      text(this, ui, px, py + 30, fac.name, fac.colors.primary, [0.5, 0]);
      button(this, ui, px - 90, py - 70, 16, 16, '<', () => this.turn(1));
      button(this, ui, px + 74, py - 70, 16, 16, '>', () => this.turn(-1));
      button(this, ui, px - 70, H - 34, 140, 24, T.enter, () => void this.enter(c), {
        disabled: this.busy,
      });
      button(
        this,
        ui,
        W - 92,
        H - 34,
        84,
        24,
        this.confirmDelete ? T.confirmDelete : T.deleteChar,
        () => void this.remove(c),
        { disabled: this.busy, accent: 0xc0281e, selected: this.confirmDelete },
      );
    }
    if (this.chars.length < this.max) {
      button(this, ui, 12, H - 34, 160, 24, T.createChar, () => this.scene.start('creator'), {
        disabled: this.busy,
      });
    }
    if (this.error) text(this, ui, W / 2, 34, this.error, 0xff6a5a, [0.5, 0]);
    if (this.busy) text(this, ui, W / 2, H - 46, T.loading, 0xa79e8a, [0.5, 0]);
  }

  private turn(delta: number): void {
    this.dir = (this.dir + delta + 8) % 8;
    if (this.preview && this.previewKey)
      this.preview.play(animKey(this.previewKey, 'idle', this.dir));
  }

  private async enter(c: CharacterSummary): Promise<void> {
    this.busy = true;
    this.error = '';
    this.render();
    const err = await enterWorld(this, this.api, c);
    if (err) {
      this.busy = false;
      this.error = err;
      this.render();
    }
  }

  private async remove(c: CharacterSummary): Promise<void> {
    if (!this.confirmDelete) {
      this.confirmDelete = true;
      this.render();
      return;
    }
    this.busy = true;
    this.render();
    try {
      await this.api.deleteCharacter(c.id);
      this.error = '';
    } catch (e) {
      this.error = API_ERRORS[e instanceof ApiError ? e.code : 'red'] ?? '';
    }
    this.busy = false;
    this.confirmDelete = false;
    await this.loadCharacters();
  }
}

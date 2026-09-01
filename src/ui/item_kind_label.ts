// The item tooltip's quality and kind label resolution (the "Junk" line), a
// host-agnostic sibling the HUD composes: pure key lookup plus presentation
// splits for honest materials. A fine-grade material's KIND stays 'junk'
// internally (the downward substitution and the Sell Junk sweep both key off
// it), but its tooltip line reads "Fine Material"; baseMaterialFor answers
// non-undefined for exactly the fine ids (material_grades.ts, the FINE_GRADE
// pairing). Honest materials (recipe reagents, ores, raw cooking catches, etc.)
// that are still kind 'junk' read "Material" via MATERIAL_ITEM_IDS. Grey junk
// that is not in the honest set keeps "Junk". The mech chroma armor plates get
// the same treatment: their KIND stays 'tool' internally (vendor, discard and
// bag-filter rules key off it), but the line reads "Skin", which is what the
// item IS to a player. Extracted from hud.ts (the phase 14 QA): the unit is
// directly importable, so its test drives it without a prototype rig.

import { MECH_CHROMAS, mechChromaItemId } from '../sim/content/skins';
import { MATERIAL_ITEM_IDS } from '../sim/material_taxonomy';
import { baseMaterialFor } from '../sim/professions/material_grades';
import type { ItemDef } from '../sim/types';
import { type TranslationKey, t } from './i18n';

/** The 15 tradable chroma plate ids, derived from the catalog so a new chroma
 *  picks the Skin line up with no edit here. */
const MECH_CHROMA_PLATE_ITEM_IDS: ReadonlySet<string> = new Set(
  MECH_CHROMAS.flatMap((chroma) => mechChromaItemId(chroma.id) ?? []),
);

type ItemQuality = NonNullable<ItemDef['quality']>;

/** Exported so vocabulary consumers (the Exchange sell caption's floor
 *  screen) derive from THIS exhaustive record: a new quality reds the
 *  Record type here and flows everywhere, instead of drifting a hand-kept
 *  copy. */
export const ITEM_QUALITY_LABEL_KEYS: Record<ItemQuality, TranslationKey> = {
  poor: 'itemUi.quality.poor',
  common: 'itemUi.quality.common',
  uncommon: 'itemUi.quality.uncommon',
  rare: 'itemUi.quality.rare',
  epic: 'itemUi.quality.epic',
  legendary: 'itemUi.quality.legendary',
};

const ITEM_KIND_LABEL_KEYS: Record<ItemDef['kind'], TranslationKey> = {
  weapon: 'itemUi.kind.weapon',
  armor: 'itemUi.kind.armor',
  held_offhand: 'itemUi.kind.armor',
  quest: 'itemUi.kind.quest',
  junk: 'itemUi.kind.junk',
  food: 'itemUi.kind.food',
  drink: 'itemUi.kind.drink',
  tool: 'itemUi.kind.tool',
  potion: 'itemUi.kind.potion',
  elixir: 'itemUi.kind.elixir',
  bag: 'itemUi.kind.bag',
  mount: 'itemUi.kind.mount',
};

export function itemQualityLabel(quality: ItemDef['quality']): string {
  return t(ITEM_QUALITY_LABEL_KEYS[quality ?? 'common']);
}

export function itemKindLabel(kind: ItemDef['kind'], itemId?: string): string {
  // The chroma plates: id-specific beats kind-generic (they are kind 'tool').
  if (itemId !== undefined && MECH_CHROMA_PLATE_ITEM_IDS.has(itemId)) {
    return t('itemUi.kind.skin');
  }
  if (kind === 'junk' && itemId !== undefined) {
    // Fine grades first: they are also honest materials, but the line must
    // stay "Fine Material" (not the broader Material label).
    if (baseMaterialFor(itemId) !== undefined) {
      return t('itemUi.kind.fineMaterial');
    }
    if (MATERIAL_ITEM_IDS.has(itemId)) {
      return t('itemUi.kind.material');
    }
  }
  return t(ITEM_KIND_LABEL_KEYS[kind]);
}

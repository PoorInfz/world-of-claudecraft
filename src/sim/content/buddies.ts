// ---------------------------------------------------------------------------
// Buddies: cosmetic followers, the declarative catalog.
//
// A buddy has zero GAMEPLAY effect: no stats, no abilities, no combat, no
// riding-skill gate, no summon channel, no stat recompute. It IS a real
// server-simulated owned mob entity (src/sim/content/buddy_mobs.ts's
// MobTemplate per key, spawned/despawned by src/sim/buddies.ts and heeled by
// src/sim/pet/buddy_ai.ts using the same A*-pathed locomotion as a hunter
// pet), which is the "AI" this catalog has: purely locomotion, never combat.
// Collection model mirrors ground mounts (src/sim/content/mounts.ts): every
// catalog buddy is owned while its summon-whistle item (ItemDef kind
// 'buddy') sits in bags or bank, not soulbound, so ownership travels with
// the item. Summoning is an instant identity flip on Entity.buddyKey
// (src/sim/buddies.ts), which every write site pairs with the matching
// entity spawn/despawn.
//
// Used by the authoritative Sim (ownership + the active-buddy flip + the
// entity itself), the renderer (key -> body via the normal per-mob path,
// MOB_KEYS in src/render/characters/manifest.ts keyed on buddyTemplateId),
// and any future HUD picker. Lives in sim/ so it carries no DOM/render
// imports and runs unchanged on the server, offline, and headless.
// ---------------------------------------------------------------------------

export type BuddyKey =
  | 'ember_fox'
  | 'moss_hare'
  | 'frog'
  | 'crimson_claw_crab'
  | 'golden_sentinel'
  | 'nightfang'
  | 'tuskhorn_boar'
  | 'emerald_wolf'
  | 'tiger'
  | 'cate_coin'
  | 'dragon';

export interface BuddyDef {
  key: BuddyKey;
  /** Canonical English display name (the HUD localizes via hudChrome.buddies.*). */
  name: string;
}

export const BUDDIES: Record<BuddyKey, BuddyDef> = {
  ember_fox: {
    key: 'ember_fox',
    name: 'Ember Fox',
  },
  moss_hare: {
    key: 'moss_hare',
    name: 'Moss Hare',
  },
  // -- rarity-tiered follower set (whistle quality mirrors BuddyKey rarity
  // in src/sim/content/items.ts) -------------------------------------------
  frog: {
    key: 'frog',
    name: 'Frog',
  },
  crimson_claw_crab: {
    key: 'crimson_claw_crab',
    name: 'Crimson Claw Crab',
  },
  golden_sentinel: {
    key: 'golden_sentinel',
    name: 'Golden Sentinel',
  },
  nightfang: {
    key: 'nightfang',
    name: 'Nightfang',
  },
  tuskhorn_boar: {
    key: 'tuskhorn_boar',
    name: 'Tuskhorn Boar',
  },
  emerald_wolf: {
    key: 'emerald_wolf',
    name: 'Emerald Wolf',
  },
  tiger: {
    key: 'tiger',
    name: 'Tiger',
  },
  // rare
  cate_coin: {
    key: 'cate_coin',
    name: 'Cate Coin',
  },
  // epic
  dragon: {
    key: 'dragon',
    name: 'Dragon',
  },
};

/** Catalog order: declaration order. */
export const BUDDY_KEYS = Object.keys(BUDDIES) as readonly BuddyKey[];

export function buddyDef(key: string): BuddyDef | null {
  return (BUDDIES as Record<string, BuddyDef | undefined>)[key] ?? null;
}

/** Coerce a persisted/wire string back to a valid catalog key ('' when
 *  unknown, so a save/wire value from a build that removed a buddy loads
 *  cleanly with none out), mirroring normalizeMountKey. */
export function normalizeBuddyKey(key: string | undefined | null): BuddyKey | '' {
  return key && buddyDef(key) ? (key as BuddyKey) : '';
}

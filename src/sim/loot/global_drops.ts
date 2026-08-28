// Global buddy-whistle drop: independent of any mob's own `loot` table, every
// regular mob kill additionally rolls one chance per whistle rarity tier for
// a random buddy whistle (src/sim/content/items.ts, kind 'buddy') of that
// quality. Consumed by rollLoot (loot_roll.ts), appended to the SAME corpse
// item list as everything else so it rides ordinary party need/greed rules
// for free — see that file's header for why the draw order here matters.
//
// `src/sim`-pure: no DOM/Three/render/ui/game/net imports, no
// Math.random/Date.now.

import { ITEMS } from '../data';

export interface GlobalBuddyDropTier {
  quality: string;
  /** Independent per-kill chance (0..1) that THIS tier drops, checked with
   *  its own ctx.rng.chance() draw regardless of whether any other tier hit. */
  chance: number;
}

// 2026-08-28 owner request: 2% common, 1% uncommon, 0.5% rare, 0.25% epic,
// from every enemy killed. Order fixed here IS the rng draw order (loot_roll.ts
// iterates this array in place), so re-ordering these tiers reshapes the
// parity goldens exactly like adding or removing one would.
export const GLOBAL_BUDDY_DROP_TIERS: readonly GlobalBuddyDropTier[] = [
  { quality: 'common', chance: 0.02 },
  { quality: 'uncommon', chance: 0.01 },
  { quality: 'rare', chance: 0.005 },
  { quality: 'epic', chance: 0.0025 },
];

// Built once at module load from the merged ITEMS catalog (not just
// content/items.ts) so a buddy whistle added anywhere else joins its tier's
// pool automatically. Sorted for a stable, reviewable id order that never
// depends on ITEMS's own merge order.
const BUDDY_WHISTLES_BY_QUALITY: Record<string, string[]> = {};
for (const item of Object.values(ITEMS)) {
  if (item.kind !== 'buddy') continue;
  const quality = item.quality ?? 'common';
  (BUDDY_WHISTLES_BY_QUALITY[quality] ??= []).push(item.id);
}
for (const pool of Object.values(BUDDY_WHISTLES_BY_QUALITY)) pool.sort();

/** Every buddy-whistle item id of `quality`, in a fixed sorted order (empty
 *  when the catalog has none at that quality yet). */
export function buddyWhistlesOfQuality(quality: string): readonly string[] {
  return BUDDY_WHISTLES_BY_QUALITY[quality] ?? [];
}

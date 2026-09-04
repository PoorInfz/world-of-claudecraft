// Global buddy-whistle drop: independent of any mob's own `loot` table, every
// regular mob kill additionally rolls one chance per whistle rarity tier for
// a random buddy whistle (src/sim/content/items.ts, kind 'buddy') of that
// quality. Consumed by rollLoot (loot_roll.ts), appended to the SAME corpse
// item list as everything else so it rides ordinary party need/greed rules
// for free; see that file's header for why the draw order here matters.
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

// 2026-09-03 owner request: 1.5% common and 1% uncommon from every enemy
// killed (normal, elite, dungeon boss and raid boss alike, since rollLoot runs
// this list on every kill), with rare and epic held OUT of the drop table for
// now. Superseded the 2026-08-28 tuning (2% / 1% / 0.5% / 0.25%).
//
// The two withheld tiers stay listed at chance 0 rather than being deleted:
// every tier draws its ctx.rng.chance() unconditionally (loot_roll.ts), so the
// per-kill draw COUNT is what the parity goldens are pinned to, and keeping
// four rows means this retuning changes only which draws can win, never the
// draw order. Re-enabling a tier is then a one-number edit that also cannot
// reshape a golden. chance 0 can never win: Rng.chance is a strict `< p`.
//
// 2026-09-04: rare joins the table at 0.05%, a twentieth of the uncommon rate,
// so a blue companion is a genuine long-odds find rather than vendor-only. The
// three vendor rares (Proud Grunt, Loot Goblin, Penny Goldspark) keep their
// currency counters as the reliable route; this is the lucky one.
//
// Epic stays withheld at chance 0: the one epic with a live source is the
// Crystal Lich, and Nythraxis owns that chase (content/dungeons.ts).
export const GLOBAL_BUDDY_DROP_TIERS: readonly GlobalBuddyDropTier[] = [
  { quality: 'common', chance: 0.015 },
  { quality: 'uncommon', chance: 0.01 },
  { quality: 'rare', chance: 0.0005 },
  { quality: 'epic', chance: 0 },
];

// Built once at module load from the merged ITEMS catalog (not just
// content/items.ts) so a buddy whistle added anywhere else joins its tier's
// pool automatically. Sorted for a stable, reviewable id order that never
// depends on ITEMS's own merge order.
const BUDDY_WHISTLES_BY_QUALITY: Record<string, string[]> = {};
for (const item of Object.values(ITEMS)) {
  if (item.kind !== 'buddy') continue;
  const quality = item.quality ?? 'common';
  if (!BUDDY_WHISTLES_BY_QUALITY[quality]) BUDDY_WHISTLES_BY_QUALITY[quality] = [];
  BUDDY_WHISTLES_BY_QUALITY[quality].push(item.id);
}
for (const pool of Object.values(BUDDY_WHISTLES_BY_QUALITY)) pool.sort();

/** Every buddy-whistle item id of `quality`, in a fixed sorted order (empty
 *  when the catalog has none at that quality yet). */
export function buddyWhistlesOfQuality(quality: string): readonly string[] {
  return BUDDY_WHISTLES_BY_QUALITY[quality] ?? [];
}

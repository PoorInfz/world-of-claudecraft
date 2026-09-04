// The Collections window's source derivation (src/ui/collections/
// collection_sources.ts): the facts it reports must come from the live content
// tables, never from a second authored copy. Each case below picks a
// collectible whose source is stated somewhere else in the repo and checks the
// derivation agrees with THAT, so a content move (a vendor restocked, a drop
// retuned, a tier withheld) reds here instead of quietly showing a player the
// wrong place to farm.

import { beforeEach, describe, expect, it } from 'vitest';
import { HEROIC_VENDOR_STOCK } from '../src/sim/content/heroic_vendor';
import { ITEMS, NPCS } from '../src/sim/data';
import { GLOBAL_BUDDY_DROP_TIERS } from '../src/sim/loot/global_drops';
import {
  collectionItemFacts,
  resetCollectionSourceCache,
} from '../src/ui/collections/collection_sources';

describe('collection source derivation', () => {
  beforeEach(() => {
    resetCollectionSourceCache();
  });

  it('reports an unknown item id as absent rather than inventing a source', () => {
    expect(collectionItemFacts('no_such_item_id')).toBeNull();
  });

  it('derives the honor vendor, its zone and its price for the Proud Grunt whistle', () => {
    const facts = collectionItemFacts('whistle_proud_grunt');
    expect(facts?.obtainable).toBe(true);
    expect(facts?.drops).toEqual([]);
    // Held out of the loot table: rare rides a tier pinned at chance 0.
    expect(facts?.globalDrop).toBeNull();
    expect(facts?.vendors).toHaveLength(1);
    const vendor = facts?.vendors[0];
    expect(vendor?.npcId).toBe('warmarshal_draven_kole');
    expect(vendor?.currency).toBe('honor');
    expect(vendor?.price).toBe(ITEMS.whistle_proud_grunt.priceHonor);
    // Zone comes from the NPC's own authored position, not a second table.
    expect(vendor?.zoneName.length).toBeGreaterThan(0);
    // Tradeable like every other whistle (nothing in the roster binds any
    // more), and it sells to a vendor for the flat 5g.
    expect(facts?.tradeable).toBe(true);
    expect(facts?.sellValue).toBe(50_000);
  });

  it('derives the marks price for the Loot Goblin whistle from the quartermaster stock', () => {
    const facts = collectionItemFacts('whistle_loot_goblin');
    const vendor = facts?.vendors.find((v) => v.currency === 'marks');
    const offer = HEROIC_VENDOR_STOCK.find((o) => o.itemId === 'whistle_loot_goblin');
    expect(vendor?.price).toBe(offer?.marks);
    expect(NPCS[vendor?.npcId ?? ''].heroicVendor).toBe(true);
    expect(facts?.tradeable).toBe(true);
  });

  it('derives the gold price for the Penny Goldspark whistle, and keeps it tradeable', () => {
    const facts = collectionItemFacts('whistle_penny_goldspark');
    const vendor = facts?.vendors.find((v) => v.currency === 'gold');
    expect(vendor?.npcId).toBe('armorer_hode');
    expect(vendor?.price).toBe(ITEMS.whistle_penny_goldspark.buyValue);
    expect(facts?.tradeable).toBe(true);
  });

  it('reports the global whistle tier for a common buddy and nothing for a withheld tier', () => {
    const common = GLOBAL_BUDDY_DROP_TIERS.find((t) => t.quality === 'common');
    const facts = collectionItemFacts('whistle_frog');
    expect(ITEMS.whistle_frog.quality ?? 'common').toBe('common');
    expect(facts?.globalDrop?.chance).toBe(common?.chance);
    expect(facts?.globalDrop?.poolSize).toBeGreaterThan(1);
    // An epic buddy sits on a tier held at 0, so it reports no global drop at
    // all: the window must not offer a chase that can never pay out.
    const epic = collectionItemFacts('whistle_ansem');
    expect(ITEMS.whistle_ansem.quality).toBe('epic');
    expect(epic?.globalDrop).toBeNull();
  });

  it('derives a heroic-only mount drop with its boss, dungeon and authored chance', () => {
    const facts = collectionItemFacts('reins_stormfeather_griffin');
    const drop = facts?.drops.find((d) => d.heroicOnly);
    expect(drop).toBeTruthy();
    expect(drop?.chance).toBeGreaterThan(0);
    expect(drop?.mobName.length).toBeGreaterThan(0);
    expect(facts?.obtainable).toBe(true);
  });

  it('memoizes per item id, so the window can ask once per row per frame', () => {
    const first = collectionItemFacts('whistle_penny_goldspark');
    expect(collectionItemFacts('whistle_penny_goldspark')).toBe(first);
    resetCollectionSourceCache();
    expect(collectionItemFacts('whistle_penny_goldspark')).not.toBe(first);
  });
});

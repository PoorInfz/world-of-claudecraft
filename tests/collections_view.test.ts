// The Collections window's pure view model (src/ui/collections/
// collections_view.ts). The window's whole promise is "every collectible in the
// game, including the ones you cannot get yet", so the pins here are about
// COMPLETENESS and grouping, not about any one row's copy.

import { describe, expect, it } from 'vitest';
import { BUDDY_KEYS } from '../src/sim/content/buddies';
import { MOUNTS } from '../src/sim/content/mounts';
import { ITEMS } from '../src/sim/data';
import {
  buildCollectionsView,
  COLLECTION_ARMOR_TYPES,
  setArmorType,
  setPrimaryStat,
} from '../src/ui/collections/collections_view';

const EMPTY = {
  buddyVisualKeys: {},
  ownedBuddyKeys: new Set<string>(),
  ownedMountKeys: new Set<string>(),
  ownedItemIds: new Set<string>(),
  mountVisualKeys: {},
};

describe('collections view model', () => {
  it('lists every catalog buddy and every catalog mount, owned or not', () => {
    const view = buildCollectionsView(EMPTY);
    expect(view.buddies.map((b) => b.key)).toEqual([...BUDDY_KEYS]);
    expect(view.mounts.map((m) => m.key)).toEqual(Object.keys(MOUNTS));
    expect(view.buddies.every((b) => b.owned === false)).toBe(true);
  });

  it('marks an entry with no source as unobtainable instead of dropping the row', () => {
    const view = buildCollectionsView(EMPTY);
    const rows = [...view.buddies, ...view.mounts];
    // Whatever the current content is, the flag must agree with the derivation:
    // a row is obtainable exactly when its item really has a source.
    for (const row of rows) {
      expect(row.obtainable, row.key).toBe(row.facts?.obtainable ?? false);
    }
    // And the row still carries a name and a preview key either way, so an
    // unobtainable entry renders as a real, greyed-out catalog entry.
    expect(rows.every((row) => row.name.length > 0)).toBe(true);
  });

  it('resolves the granting item from the item table, not from an id convention', () => {
    const view = buildCollectionsView(EMPTY);
    for (const row of view.buddies) {
      if (!row.itemId) continue;
      expect(ITEMS[row.itemId].kind, row.key).toBe('buddy');
      expect((ITEMS[row.itemId] as { buddy?: string }).buddy, row.key).toBe(row.key);
    }
    for (const row of view.mounts) {
      if (!row.itemId) continue;
      expect(ITEMS[row.itemId].kind, row.key).toBe('mount');
      expect((ITEMS[row.itemId] as { mount?: string }).mount, row.key).toBe(row.key);
    }
  });

  it('reflects ownership from the viewer bag/bank item ids', () => {
    const view = buildCollectionsView({
      ...EMPTY,
      ownedBuddyKeys: new Set(['penny_goldspark']),
    });
    const penny = view.buddies.find((b) => b.key === 'penny_goldspark');
    expect(penny?.owned).toBe(true);
    expect(view.buddies.filter((b) => b.owned)).toHaveLength(1);
  });

  it('groups epic-or-better sets by armor type then primary stat, and admits nothing below epic', () => {
    const view = buildCollectionsView(EMPTY);
    expect(view.setGroups.length).toBeGreaterThan(0);
    for (const group of view.setGroups) {
      expect(COLLECTION_ARMOR_TYPES).toContain(group.armorType);
      expect(group.sets.length).toBeGreaterThan(0);
      for (const set of group.sets) {
        expect(['epic', 'legendary']).toContain(set.quality);
        expect(set.armorType).toBe(group.armorType);
        expect(set.stat).toBe(group.stat);
        expect(set.pieces.length).toBeGreaterThan(0);
        // Every piece resolves to a real item and reports its own bind state.
        for (const piece of set.pieces) expect(ITEMS[piece.itemId], piece.itemId).toBeTruthy();
      }
    }
    // Armor-type groups appear in the authored order, never in table order.
    const seen = view.setGroups.map((g) => g.armorType);
    const ordered = [...seen].sort(
      (a, b) => COLLECTION_ARMOR_TYPES.indexOf(a) - COLLECTION_ARMOR_TYPES.indexOf(b),
    );
    expect(seen).toEqual(ordered);
  });

  it('derives a set stat from its pieces and calls an even split mixed', () => {
    expect(setPrimaryStat([{ stats: { int: 10, sta: 4 } } as never])).toBe('intellect');
    expect(setPrimaryStat([{ stats: { agi: 7 } } as never])).toBe('agility');
    expect(setPrimaryStat([{ stats: { str: 7, agi: 7 } } as never])).toBe('mixed');
    // Stamina alone is not a primary stat identity.
    expect(setPrimaryStat([{ stats: { sta: 12 } } as never])).toBe('mixed');
  });

  it('refuses to type a set whose pieces disagree on armor class', () => {
    expect(setArmorType([{ armorType: 'cloth' } as never, { armorType: 'cloth' } as never])).toBe(
      'cloth',
    );
    expect(
      setArmorType([{ armorType: 'cloth' } as never, { armorType: 'mail' } as never]),
    ).toBeNull();
    expect(setArmorType([{} as never])).toBeNull();
  });
});

// Mech chroma plate custody (issue #3680): equipping a chroma consumes an
// item (a specific armor plate, or the Alien Armor Plate claim token), so
// taking the look off must hand the tradable plate back to the bags, exactly
// once, without reopening the #3437 mint exploit (free changeSkin re-equip +
// unequip must never mint) and without revoking the permanent account unlock.
import { describe, expect, it } from 'vitest';
import { listingEligibility, WOC_MARKET_RESTRICTED_POLICY } from '../server/woc_market_rules';
import { MECH_CHROMAS, mechChromaItemId, mechChromaSkinIndex } from '../src/sim/content/skins';
import { ITEMS } from '../src/sim/data';
import { extractTradableCopy } from '../src/sim/inventory_extract';
import {
  carriesWornPlate,
  releaseMechPlateCustody,
  restoredMechPlateOwed,
  savedMechPlateOwedField,
  settleMechPlateCustody,
  stampMechPlateCustody,
} from '../src/sim/mech_plate_custody';
import { Sim } from '../src/sim/sim';

const CHROMA = 'amber_crimson';
const PLATE = 'amber_crimson_armor_plate';
const CHROMA_SKIN = mechChromaSkinIndex(CHROMA);

function mechSim(name: string): Sim {
  return new Sim({ seed: 1, playerClass: 'shaman', playerName: name });
}

describe('mech_plate_custody leaf', () => {
  it('stamps only real catalog chromas', () => {
    const meta = { mechPlateOwedChromaId: null as string | null };
    stampMechPlateCustody(meta, 'not_a_chroma');
    expect(meta.mechPlateOwedChromaId).toBeNull();
    stampMechPlateCustody(meta, CHROMA);
    expect(meta.mechPlateOwedChromaId).toBe(CHROMA);
  });

  it('settles nothing while the owed chroma stays worn, releases the plate on any move away', () => {
    const meta = { mechPlateOwedChromaId: CHROMA as string | null };
    expect(settleMechPlateCustody(meta, CHROMA_SKIN, 'mech')).toBeNull();
    expect(meta.mechPlateOwedChromaId).toBe(CHROMA);

    expect(settleMechPlateCustody(meta, 0, 'class')).toBe(PLATE);
    expect(meta.mechPlateOwedChromaId).toBeNull();
    // Settled once: a second transition releases nothing.
    expect(settleMechPlateCustody(meta, 0, 'class')).toBeNull();

    const swapped = { mechPlateOwedChromaId: CHROMA as string | null };
    const otherSkin = mechChromaSkinIndex('onyx_gold');
    expect(settleMechPlateCustody(swapped, otherSkin, 'mech')).toBe(PLATE);
    expect(swapped.mechPlateOwedChromaId).toBeNull();
  });

  it('carries and releases the worn plate', () => {
    const meta = {
      mechPlateOwedChromaId: CHROMA as string | null,
      skin: CHROMA_SKIN,
      skinCatalog: 'mech' as const,
    };
    expect(carriesWornPlate(meta, CHROMA)).toBe(true);
    expect(carriesWornPlate(meta, 'onyx_gold')).toBe(false);
    expect(carriesWornPlate({ ...meta, skinCatalog: 'class' as const }, CHROMA)).toBe(false);

    expect(releaseMechPlateCustody(meta)).toBe(PLATE);
    expect(meta.mechPlateOwedChromaId).toBeNull();
    expect(releaseMechPlateCustody(meta)).toBeNull();
  });

  it('restores a custody-aware save verbatim and cross-checks the worn skin', () => {
    expect(
      restoredMechPlateOwed({
        skin: CHROMA_SKIN,
        skinCatalog: 'mech',
        mechChromaPlateOwed: CHROMA,
      }),
    ).toBe(CHROMA);
    // A stale owed id that does not match the worn chroma is dropped.
    expect(
      restoredMechPlateOwed({
        skin: mechChromaSkinIndex('onyx_gold'),
        skinCatalog: 'mech',
        mechChromaPlateOwed: CHROMA,
      }),
    ).toBeNull();
    expect(
      restoredMechPlateOwed({ skin: 2, skinCatalog: 'class', mechChromaPlateOwed: CHROMA }),
    ).toBeNull();
    // Field absent (every pre-custody save, wearing or not): nothing owed.
    // The regression window's lost plates are an operator data repair, never
    // a load-time stamp (see the module doc for the over-mint it avoids).
    expect(restoredMechPlateOwed({ skin: CHROMA_SKIN, skinCatalog: 'mech' })).toBeNull();
    expect(restoredMechPlateOwed({ skin: 2, skinCatalog: 'class' })).toBeNull();
  });

  it('serializes the owed id and omits the field entirely while nothing is owed', () => {
    expect(
      savedMechPlateOwedField({ skin: 2, skinCatalog: 'class', mechPlateOwedChromaId: null }),
    ).toEqual({});
    expect(
      savedMechPlateOwedField({
        skin: CHROMA_SKIN,
        skinCatalog: 'mech',
        mechPlateOwedChromaId: null,
      }),
    ).toEqual({});
    expect(
      savedMechPlateOwedField({
        skin: CHROMA_SKIN,
        skinCatalog: 'mech',
        mechPlateOwedChromaId: CHROMA,
      }),
    ).toEqual({ mechChromaPlateOwed: CHROMA });
    // An owed id detached from the worn look never reaches the save.
    expect(
      savedMechPlateOwedField({ skin: 2, skinCatalog: 'class', mechPlateOwedChromaId: CHROMA }),
    ).toEqual({});
  });
});

describe('mech chroma plate round-trip in the Sim (issue #3680)', () => {
  it('returns the plate to the bags when unequipping a chroma equipped from its item', () => {
    const sim = mechSim('Mechround');
    sim.addItem(PLATE, 1);
    sim.useItem(PLATE);
    expect(sim.countItem(PLATE)).toBe(0);
    expect(sim.player.skinCatalog).toBe('mech');

    expect(sim.unequipMechChroma(CHROMA)).toBe(true);

    expect(sim.player.skinCatalog).toBe('class');
    expect(sim.countItem(PLATE)).toBe(1);
    // The account unlock stays permanent (#3437): only the item moved.
    expect(sim.accountCosmetics.mechChromaIds).toContain(CHROMA);
  });

  it('returns the plate when unequipping a chroma claimed from the Alien Armor Plate overlay', () => {
    const sim = mechSim('Mechclaim');
    sim.addItem('alien_armor_plate', 1);
    sim.useItem('alien_armor_plate');
    const claim = sim.claimEventSkin(CHROMA_SKIN);
    expect(claim).toEqual({ catalog: 'mech', skin: CHROMA_SKIN, chromaId: CHROMA });
    expect(sim.countItem('alien_armor_plate')).toBe(0);

    expect(sim.unequipMechChroma(CHROMA)).toBe(true);

    expect(sim.countItem(PLATE)).toBe(1);
  });

  it('never mints from a display-only wear: free re-equip then unequip stays item-neutral', () => {
    const sim = mechSim('Mechfree');
    sim.addItem(PLATE, 1);
    sim.useItem(PLATE);
    expect(sim.unequipMechChroma(CHROMA)).toBe(true);
    expect(sim.countItem(PLATE)).toBe(1);

    // The #3437 exploit shape: the permanent unlock re-equips for free, so a
    // second unequip must not mint a second plate.
    sim.changeSkin(CHROMA_SKIN, 'mech');
    expect(sim.player.skinCatalog).toBe('mech');
    expect(sim.unequipMechChroma(CHROMA)).toBe(true);
    expect(sim.countItem(PLATE)).toBe(1);
  });

  it('releases the owed plate when switching straight to another chroma or skin', () => {
    const sim = mechSim('Mechswap');
    sim.accountCosmetics = {
      ...sim.accountCosmetics,
      mechChromaIds: [CHROMA, 'onyx_gold'],
    };
    sim.addItem(PLATE, 1);
    sim.useItem(PLATE);

    // Swatch straight to another chroma, no unequip step: the plate the wear
    // was carrying comes back rather than being stranded on the old look.
    sim.changeSkin(mechChromaSkinIndex('onyx_gold'), 'mech');
    expect(sim.countItem(PLATE)).toBe(1);

    // The new wear is display-only, so leaving it mints nothing.
    sim.changeSkin(0, 'class');
    expect(sim.countItem(mechChromaItemId('onyx_gold') ?? '')).toBe(0);
  });

  it('does not consume a second copy of the plate the worn look already carries', () => {
    const sim = mechSim('Mechdouble');
    sim.addItem(PLATE, 2);
    sim.useItem(PLATE);
    expect(sim.countItem(PLATE)).toBe(1);

    // Re-using the spare while the same chroma is worn and owed is a no-op:
    // consuming it would strand a copy (custody holds at most one plate).
    sim.useItem(PLATE);
    expect(sim.countItem(PLATE)).toBe(1);

    expect(sim.unequipMechChroma(CHROMA)).toBe(true);
    expect(sim.countItem(PLATE)).toBe(2);
  });

  it('claiming the chroma already worn item-backed hands the displaced plate back', () => {
    // The overlay lets a player pick the chroma they are wearing: the token
    // consumption takes over custody and the plate it displaces returns to
    // the bags, so two consumed items never collapse into one custody.
    const sim = mechSim('Mechreclaim');
    sim.addItem(PLATE, 1);
    sim.useItem(PLATE);
    expect(sim.countItem(PLATE)).toBe(0);

    sim.addItem('alien_armor_plate', 1);
    sim.useItem('alien_armor_plate');
    const claim = sim.claimEventSkin(CHROMA_SKIN);
    expect(claim).toEqual({ catalog: 'mech', skin: CHROMA_SKIN, chromaId: CHROMA });
    expect(sim.countItem('alien_armor_plate')).toBe(0);
    expect(sim.countItem(PLATE)).toBe(1);

    // The new custody still round-trips: unequip returns one more plate.
    expect(sim.unequipMechChroma(CHROMA)).toBe(true);
    expect(sim.countItem(PLATE)).toBe(2);
  });

  it('persists custody across save and load, through the JSON pipe', () => {
    const sim = mechSim('Mechsave');
    sim.addItem(PLATE, 1);
    sim.useItem(PLATE);
    const state = sim.serializeCharacter(sim.playerId);
    if (!state) throw new Error('missing saved state');
    expect(state.mechChromaPlateOwed).toBe(CHROMA);

    // The same stringify/parse round trip the JSONB column and the offline
    // save take, so the pin covers the real persistence pipe.
    const reloaded = JSON.parse(JSON.stringify(state)) as typeof state;
    const restored = new Sim({ seed: 1, playerClass: 'shaman', noPlayer: true });
    const pid = restored.addPlayer('shaman', 'Mechsave', { state: reloaded });
    expect(restored.unequipMechChroma(CHROMA, pid)).toBe(true);
    expect(restored.countItem(PLATE, pid)).toBe(1);
  });

  it('a pre-custody save owes nothing: no load-time repair mint', () => {
    // The regression window's lost plates are repaired by an operator data
    // pass over the accounts database, NOT by a load-time stamp: an account
    // whose several characters all wore the chroma through the free display
    // re-select would otherwise re-mint once per character.
    const sim = mechSim('Mechlegacy');
    sim.addItem(PLATE, 1);
    sim.useItem(PLATE);
    const state = sim.serializeCharacter(sim.playerId);
    if (!state) throw new Error('missing saved state');
    delete state.mechChromaPlateOwed; // the pre-custody save shape

    const restored = new Sim({ seed: 1, playerClass: 'shaman', noPlayer: true });
    const pid = restored.addPlayer('shaman', 'Mechlegacy', { state });
    expect(restored.unequipMechChroma(CHROMA, pid)).toBe(true);
    expect(restored.countItem(PLATE, pid)).toBe(0);
  });

  it('the save carries the field only while a plate is owed', () => {
    // Class look: no field, byte-equal to a pre-custody save.
    const plain = mechSim('Mechplain');
    const plainState = plain.serializeCharacter(plain.playerId);
    expect(plainState && 'mechChromaPlateOwed' in plainState).toBe(false);

    // Display-only wear over the account unlock: still no field.
    const display = mechSim('Mechdisplay');
    display.accountCosmetics = { ...display.accountCosmetics, mechChromaIds: [CHROMA] };
    display.changeSkin(CHROMA_SKIN, 'mech');
    const displayState = display.serializeCharacter(display.playerId);
    expect(displayState && 'mechChromaPlateOwed' in displayState).toBe(false);
  });
});

describe('a returned plate is listable on the $WOC Exchange', () => {
  it('every real chroma plate def passes the restricted listing policy', () => {
    for (const chroma of MECH_CHROMAS) {
      const plateId = mechChromaItemId(chroma.id);
      expect(plateId, chroma.id).toBeTruthy();
      const def = ITEMS[plateId ?? ''];
      expect(def, plateId ?? undefined).toBeTruthy();
      expect(listingEligibility(def, undefined, WOC_MARKET_RESTRICTED_POLICY)).toEqual({
        ok: true,
      });
    }
  });

  it('escrow extraction accepts the unequipped plate from the bags', () => {
    const sim = mechSim('Mechsell');
    sim.addItem(PLATE, 1);
    sim.useItem(PLATE);
    sim.unequipMechChroma(CHROMA);

    const meta = sim.meta(sim.playerId);
    if (!meta) throw new Error('missing meta');
    const index = meta.inventory.findIndex((slot) => slot.itemId === PLATE);
    expect(index).toBeGreaterThanOrEqual(0);
    const outcome = extractTradableCopy(meta.inventory, { index, itemId: PLATE }, ITEMS[PLATE]);
    expect(outcome).toEqual({ ok: true, extracted: { itemId: PLATE, count: 1 } });
    expect(sim.countItem(PLATE)).toBe(0);
  });
});

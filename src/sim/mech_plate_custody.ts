// ---------------------------------------------------------------------------
// Mech chroma plate custody: the item half of the chroma loop (issue #3680).
//
// A mech chroma is item-borne: equipping it CONSUMES something (a specific
// <chromaId>_armor_plate, or the Alien Armor Plate claim token), and taking
// the look off must hand the tradable plate back, exactly once. The permanent
// account-wide unlock (accountCosmetics.mechChromaIds, the #3437 contract) is
// deliberately separate: it gates free display re-selects via changeSkin and
// is never revoked here.
//
// The reconciliation of those two contracts is CUSTODY: when an equip consumes
// an item, the worn look carries the plate (mechPlateOwedChromaId on
// PlayerMeta), and ANY transition away from that look, unequip, a swatch
// change, a fresh claim, releases exactly that plate back to the bags. A
// display-only wear (changeSkin over the account unlock) carries nothing and
// releases nothing, so the #3437 mint exploit (free equip, unequip, repeat)
// stays closed while every consuming flow round-trips its item.
//
// Every mutation of the worn skin goes through Sim.setPlayerSkin, which calls
// settleMechPlateCustody, so the offline Sim and the server's change_skin /
// unequip_mech_chroma dispatches (both land on setPlayerSkin) behave
// identically by construction.
//
// Pure sim leaf: no SimContext, no rng, no clock; a Vitest imports it
// directly (tests/mech_plate_custody.test.ts).
// ---------------------------------------------------------------------------

import { mechChromaForSkin, mechChromaItemId } from './content/skins';
import type { SkinCatalog } from './types';

/** The slice of PlayerMeta this module owns. */
export interface MechPlateCustody {
  /** The chroma whose armor plate this character's WORN look is carrying, or
   *  null for a display-only wear. Non-null only while the matching chroma is
   *  the current skin (settle clears it on every transition away). */
  mechPlateOwedChromaId: string | null;
}

/** Record that the current wear consumed an item: the worn look now carries
 *  the chroma's plate. Unknown chroma ids are ignored (nothing to owe). */
export function stampMechPlateCustody(meta: MechPlateCustody, chromaId: string): void {
  if (mechChromaItemId(chromaId)) meta.mechPlateOwedChromaId = chromaId;
}

/** True when the worn look already carries this chroma's plate: the owed id
 *  matches AND the chroma really is the current skin. The consuming flows
 *  guard on it so a spare copy is never consumed into a custody that can hold
 *  only one plate. */
export function carriesWornPlate(
  meta: MechPlateCustody & { skin: number; skinCatalog: SkinCatalog },
  chromaId: string,
): boolean {
  return (
    meta.mechPlateOwedChromaId === chromaId &&
    meta.skinCatalog === 'mech' &&
    mechChromaForSkin(meta.skin)?.id === chromaId
  );
}

/** Release whatever plate the wear carries right now, regardless of the next
 *  look, returning the plate item id to grant (null when nothing is owed).
 *  For a consuming flow that re-acquires the chroma already worn item-backed
 *  (the claim overlay lets a player pick the chroma they are wearing): the
 *  incoming consumption takes over custody and the plate it displaces goes
 *  back to the bags, so two consumed items never collapse into one custody. */
export function releaseMechPlateCustody(meta: MechPlateCustody): string | null {
  const owed = meta.mechPlateOwedChromaId;
  if (!owed) return null;
  meta.mechPlateOwedChromaId = null;
  return mechChromaItemId(owed);
}

/**
 * Settle custody for a skin transition to (nextSkin, nextCatalog): when the
 * transition leaves the owed chroma, clear the debt and return the plate item
 * id the caller must grant back to the bags. Null when nothing is owed or the
 * owed chroma stays worn.
 */
export function settleMechPlateCustody(
  meta: MechPlateCustody,
  nextSkin: number,
  nextCatalog: SkinCatalog,
): string | null {
  const owed = meta.mechPlateOwedChromaId;
  if (!owed) return null;
  if (nextCatalog === 'mech' && mechChromaForSkin(nextSkin)?.id === owed) return null;
  meta.mechPlateOwedChromaId = null;
  return mechChromaItemId(owed);
}

/**
 * Restore the custody field from a character save.
 *
 * The value is trusted but cross-checked against the worn skin, so a stale or
 * tampered id can never mint a plate for a look that is not on (the drop is
 * warned, dev-channel only: it means some path changed the skin without the
 * settle, or the MECH_CHROMAS order moved under a save, and the plate it
 * strands should be traceable). A save with no field, every save written
 * before custody shipped included, simply owes nothing: the one-time repair
 * for players whose plates the #3680 regression window swallowed is an
 * OPERATOR data pass over the accounts database (the only place "does this
 * account still hold the plate anywhere" is answerable), deliberately NOT a
 * load-time stamp, which would re-mint once per character on accounts whose
 * several characters all wore the chroma through the free display re-select.
 */
export function restoredMechPlateOwed(saved: {
  skin?: number;
  skinCatalog?: SkinCatalog;
  mechChromaPlateOwed?: string | null;
}): string | null {
  const owed = saved.mechChromaPlateOwed;
  if (!owed) return null;
  if (saved.skinCatalog !== 'mech' || mechChromaForSkin(Math.floor(saved.skin ?? 0))?.id !== owed) {
    console.warn(`mech plate custody: dropping owed '${owed}' not matching the saved worn skin`);
    return null;
  }
  return owed;
}

/**
 * The custody field's save form: the owed chroma id, omitted entirely while
 * nothing is owed (zero-default omission, so every pre-custody and
 * display-only save stays byte-equal to what it was). An owed id that no
 * longer matches the worn look is dropped with a warn, same contract as
 * restoredMechPlateOwed above.
 */
export function savedMechPlateOwedField(
  meta: MechPlateCustody & { skin: number; skinCatalog: SkinCatalog },
): { mechChromaPlateOwed: string } | Record<string, never> {
  const owed = meta.mechPlateOwedChromaId;
  if (!owed) return {};
  if (meta.skinCatalog !== 'mech' || mechChromaForSkin(meta.skin)?.id !== owed) {
    console.warn(`mech plate custody: not saving owed '${owed}' not matching the worn skin`);
    return {};
  }
  return { mechChromaPlateOwed: owed };
}

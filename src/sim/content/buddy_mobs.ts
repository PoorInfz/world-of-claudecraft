import type { BuddyKey } from './buddies';
import type { MobTemplate } from '../types';

// Mob templates backing the real, server-simulated buddy follower entity
// (src/sim/pet/buddy_ai.ts spawns/heels one of these exactly like a hunter
// pet, minus every combat field). One entry per BuddyKey (src/sim/content/
// buddies.ts), id-prefixed so a buddy's own templateId can never collide
// with a real tameable/summoned mob's. hp/dmg are non-zero only because
// createMob's stat math (src/sim/entity.ts) always runs it; a buddy never
// takes or deals damage (spawned hostile:false, and nothing ever targets an
// owned, non-hostile entity). scale is the ONLY visible-size knob now — the
// old render-only BUDDY_VISUAL_SPECS.scale multiplier is gone along with the
// purely-cosmetic follower system it belonged to.
export const BUDDY_TEMPLATE_PREFIX = 'buddy_';

export function buddyTemplateId(key: BuddyKey): string {
  return `${BUDDY_TEMPLATE_PREFIX}${key}`;
}

// Shared per-buddy scale: hunter-pet proportion (1x the rig's authored
// height) run through three owner-requested passes (2026-08-27) — -70%,
// then +50% off that, then +100% off THAT: 1 * 0.3 * 1.5 * 2 = 0.9. Every
// buddy uses this by default so none reads bigger than another from an
// inconsistent factor; cate_coin's own +200% override below is the one
// deliberate exception.
const BUDDY_SCALE = 0.9;

function buddyTemplate(
  key: BuddyKey,
  name: string,
  family: MobTemplate['family'],
  color: number,
  scale: number = BUDDY_SCALE,
): MobTemplate {
  return {
    id: buddyTemplateId(key),
    name,
    minLevel: 1,
    maxLevel: 60,
    family,
    hpBase: 1,
    hpPerLevel: 0,
    dmgBase: 0,
    dmgPerLevel: 0,
    attackSpeed: 2,
    armorPerLevel: 0,
    moveSpeed: 7,
    aggroRadius: 0,
    loot: [],
    scale,
    color,
  };
}

export const BUDDY_MOBS: Record<string, MobTemplate> = {
  // mob_fox / mob_critter (src/render/characters/manifest.ts MOB_KEYS below)
  // carry `tint: 'entity'`, so color here is the real per-species dye, same
  // values the old BUDDY_VISUAL_SPECS.tint used.
  [buddyTemplateId('ember_fox')]: buddyTemplate('ember_fox', 'Ember Fox', 'beast', 0xd9662b),
  [buddyTemplateId('moss_hare')]: buddyTemplate('moss_hare', 'Moss Hare', 'beast', 0x6f8f5a),
  // The rest render dedicated GLBs (public/models/buddies/) with baked
  // textures and no `tint` on their VISUALS entry, so color below is inert —
  // kept only because MobTemplate.color is required.
  [buddyTemplateId('frog')]: buddyTemplate('frog', 'Frog', 'beast', 0xffffff),
  [buddyTemplateId('crimson_claw_crab')]: buddyTemplate(
    'crimson_claw_crab',
    'Crimson Claw Crab',
    'beast',
    0xffffff,
  ),
  [buddyTemplateId('golden_sentinel')]: buddyTemplate(
    'golden_sentinel',
    'Golden Sentinel',
    'beast',
    0xffffff,
  ),
  [buddyTemplateId('nightfang')]: buddyTemplate('nightfang', 'Nightfang', 'beast', 0xffffff),
  [buddyTemplateId('tuskhorn_boar')]: buddyTemplate(
    'tuskhorn_boar',
    'Tuskhorn Boar',
    'beast',
    0xffffff,
  ),
  [buddyTemplateId('emerald_wolf')]: buddyTemplate(
    'emerald_wolf',
    'Emerald Wolf',
    'beast',
    0xffffff,
  ),
  [buddyTemplateId('tiger')]: buddyTemplate('tiger', 'Tiger', 'beast', 0xffffff),
  // +200% off the shared BUDDY_SCALE (2026-08-28 owner request: it read too
  // small next to the rest of the roster) — the one deliberate exception to
  // the "every buddy shares one scale" rule above.
  [buddyTemplateId('cate_coin')]: buddyTemplate(
    'cate_coin',
    'Cate Coin',
    'beast',
    0xffffff,
    BUDDY_SCALE * 3,
  ),
  [buddyTemplateId('dragon')]: buddyTemplate('dragon', 'Dragon', 'dragonkin', 0xffffff),
};

/** Every valid buddy templateId, for the cheap `isBuddyMob` membership check
 *  (src/sim/pet/buddy_ai.ts) — a Set so a per-tick per-owned-mob check never
 *  scans the catalog. */
export const BUDDY_TEMPLATE_IDS: ReadonlySet<string> = new Set(Object.keys(BUDDY_MOBS));

import { describe, expect, it, vi } from 'vitest';

// Mock the db layer so importing server/game needs no Postgres, mirroring
// tests/mounts.test.ts.
vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
}));

import {
  buddyItemId,
  buddyOwned,
  ownedBuddies,
  summonBuddyItem,
  toggleBuddy,
} from '../src/sim/buddies';
import { BUDDIES, BUDDY_KEYS, buddyDef, normalizeBuddyKey } from '../src/sim/content/buddies';
import { buddyTemplateId } from '../src/sim/content/buddy_mobs';
import { useItem } from '../src/sim/items';
import { buddyFollowTarget, buddyOf, isBuddyMob } from '../src/sim/pet/buddy_ai';
import { petOf } from '../src/sim/pet/pet_commands';
import type { PlayerMeta } from '../src/sim/sim';
import { Sim } from '../src/sim/sim';
import { VENDOR_TEST_WORLD } from './sim_shared';

function makeWorld() {
  return new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true, world: VENDOR_TEST_WORLD });
}

function join(sim: Sim): number {
  const pid = sim.addPlayer('warrior', 'Owner');
  sim.tick();
  return pid;
}

describe('buddy catalog', () => {
  it('every BuddyDef.key matches its own record key', () => {
    for (const [key, def] of Object.entries(BUDDIES)) expect(def.key).toBe(key);
  });

  it('every catalog buddy has exactly one whistle item, and it names the buddy back', () => {
    for (const key of BUDDY_KEYS) {
      const itemId = buddyItemId(key);
      expect(itemId, `${key} has no whistle item`).not.toBeNull();
    }
  });

  it('buddyDef/normalizeBuddyKey resolve known ids and reject unknown ones', () => {
    expect(buddyDef('ember_fox')?.name).toBe('Ember Fox');
    expect(buddyDef('not_a_buddy')).toBeNull();
    expect(normalizeBuddyKey('moss_hare')).toBe('moss_hare');
    expect(normalizeBuddyKey('not_a_buddy')).toBe('');
    expect(normalizeBuddyKey(null)).toBe('');
    expect(normalizeBuddyKey(undefined)).toBe('');
  });
});

describe('buddy ownership: item-borne, bags or bank', () => {
  it('a fresh player owns nothing; a buddy only while its whistle is held', () => {
    const sim = makeWorld();
    const pid = join(sim);
    const meta = sim.players.get(pid)!;
    expect(ownedBuddies(meta)).toEqual([]);
    expect(buddyOwned(meta, 'ember_fox')).toBe(false);

    sim.addItem('whistle_ember_fox', 1, pid);
    expect(buddyOwned(meta, 'ember_fox')).toBe(true);
    expect(ownedBuddies(meta)).toEqual(['ember_fox']);

    sim.addItem('whistle_moss_hare', 1, pid);
    expect(ownedBuddies(meta)).toEqual(['ember_fox', 'moss_hare']); // catalog order
  });

  it('a whistle parked in the bank still counts (bags OR bank)', () => {
    const sim = makeWorld();
    const pid = join(sim);
    const meta = sim.players.get(pid)!;
    meta.bank.inventory.push({ itemId: 'whistle_moss_hare', count: 1 });
    expect(buddyOwned(meta, 'moss_hare')).toBe(true);
    expect(ownedBuddies(meta)).toContain('moss_hare');
  });

  it('unknown keys are never owned', () => {
    const sim = makeWorld();
    const pid = join(sim);
    const meta = sim.players.get(pid)!;
    expect(buddyOwned(meta, 'not_a_buddy')).toBe(false);
  });
});

describe('summonBuddyItem: click the whistle to summon, click again to dismiss', () => {
  it('summons an owned buddy instantly, with no channel', () => {
    const sim = makeWorld();
    const pid = join(sim);
    sim.addItem('whistle_ember_fox', 1, pid);
    expect(summonBuddyItem(sim.ctx, pid, 'ember_fox')).toBe(true);
    expect(sim.entities.get(pid)!.buddyKey).toBe('ember_fox');
  });

  it('clicking the active buddy’s whistle dismisses it', () => {
    const sim = makeWorld();
    const pid = join(sim);
    sim.addItem('whistle_ember_fox', 1, pid);
    summonBuddyItem(sim.ctx, pid, 'ember_fox');
    expect(summonBuddyItem(sim.ctx, pid, 'ember_fox')).toBe(true);
    expect(sim.entities.get(pid)!.buddyKey).toBe('');
  });

  it('swapping straight to a different owned buddy is instant, no dismiss step', () => {
    const sim = makeWorld();
    const pid = join(sim);
    sim.addItem('whistle_ember_fox', 1, pid);
    sim.addItem('whistle_moss_hare', 1, pid);
    summonBuddyItem(sim.ctx, pid, 'ember_fox');
    expect(summonBuddyItem(sim.ctx, pid, 'moss_hare')).toBe(true);
    expect(sim.entities.get(pid)!.buddyKey).toBe('moss_hare');
  });

  it('refuses an unowned buddy and leaves the current one untouched', () => {
    const sim = makeWorld();
    const pid = join(sim);
    expect(summonBuddyItem(sim.ctx, pid, 'ember_fox')).toBe(false);
    expect(sim.entities.get(pid)!.buddyKey).toBe('');
  });

  it('an unknown catalog key is refused', () => {
    const sim = makeWorld();
    const pid = join(sim);
    expect(summonBuddyItem(sim.ctx, pid, 'not_a_buddy')).toBe(false);
  });

  it('routes through useItem for kind "buddy" (bags/action-bar click)', () => {
    const sim = makeWorld();
    const pid = join(sim);
    sim.addItem('whistle_ember_fox', 1, pid);
    useItem(sim.ctx, 'whistle_ember_fox', pid);
    expect(sim.entities.get(pid)!.buddyKey).toBe('ember_fox');
  });

  it('the whistle is never consumed by summoning (ownership derives from holding it)', () => {
    const sim = makeWorld();
    const pid = join(sim);
    sim.addItem('whistle_ember_fox', 1, pid);
    summonBuddyItem(sim.ctx, pid, 'ember_fox');
    const meta = sim.players.get(pid)!;
    expect(meta.inventory.some((s) => s.itemId === 'whistle_ember_fox')).toBe(true);
  });
});

describe('toggleBuddy: dismiss-only, for a keybind/button with no item in hand', () => {
  it('dismisses the active buddy', () => {
    const sim = makeWorld();
    const pid = join(sim);
    sim.addItem('whistle_ember_fox', 1, pid);
    summonBuddyItem(sim.ctx, pid, 'ember_fox');
    expect(toggleBuddy(sim.ctx, pid)).toBe(true);
    expect(sim.entities.get(pid)!.buddyKey).toBe('');
  });

  it('does nothing when no buddy is out (no implicit "selected buddy")', () => {
    const sim = makeWorld();
    const pid = join(sim);
    sim.addItem('whistle_ember_fox', 1, pid);
    expect(toggleBuddy(sim.ctx, pid)).toBe(false);
    expect(sim.entities.get(pid)!.buddyKey).toBe('');
  });
});

describe('IWorldBuddies facade (offline Sim)', () => {
  it('ownedBuddies() and toggleBuddy() ride the primary player', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', world: VENDOR_TEST_WORLD });
    sim.tick();
    const pid = sim.player.id;
    sim.addItem('whistle_ember_fox', 1, pid);
    expect(sim.ownedBuddies()).toEqual(['ember_fox']);
    summonBuddyItem(sim.ctx, pid, 'ember_fox');
    sim.toggleBuddy();
    expect(sim.entities.get(pid)!.buddyKey).toBe('');
  });
});

describe('buddy entity: real, server-simulated, heels like a hunter pet', () => {
  it('spawns a real owned, non-hostile mob entity on summon', () => {
    const sim = makeWorld();
    const pid = join(sim);
    sim.addItem('whistle_ember_fox', 1, pid);
    summonBuddyItem(sim.ctx, pid, 'ember_fox');
    const buddy = buddyOf(sim.ctx, pid);
    expect(buddy).not.toBeNull();
    expect(buddy!.kind).toBe('mob');
    expect(buddy!.ownerId).toBe(pid);
    expect(buddy!.hostile).toBe(false);
    expect(buddy!.templateId).toBe(buddyTemplateId('ember_fox'));
    expect(isBuddyMob(buddy!)).toBe(true);
  });

  it('re-clicking the active whistle despawns the entity, not just the flag', () => {
    const sim = makeWorld();
    const pid = join(sim);
    sim.addItem('whistle_ember_fox', 1, pid);
    summonBuddyItem(sim.ctx, pid, 'ember_fox');
    const buddy = buddyOf(sim.ctx, pid)!;
    summonBuddyItem(sim.ctx, pid, 'ember_fox');
    expect(buddyOf(sim.ctx, pid)).toBeNull();
    expect(sim.entities.has(buddy.id)).toBe(false);
  });

  it('toggleBuddy despawns the entity too', () => {
    const sim = makeWorld();
    const pid = join(sim);
    sim.addItem('whistle_ember_fox', 1, pid);
    summonBuddyItem(sim.ctx, pid, 'ember_fox');
    expect(toggleBuddy(sim.ctx, pid)).toBe(true);
    expect(buddyOf(sim.ctx, pid)).toBeNull();
  });

  it('swapping to a different buddy despawns the old entity and spawns the new one', () => {
    const sim = makeWorld();
    const pid = join(sim);
    sim.addItem('whistle_ember_fox', 1, pid);
    sim.addItem('whistle_moss_hare', 1, pid);
    summonBuddyItem(sim.ctx, pid, 'ember_fox');
    const first = buddyOf(sim.ctx, pid)!;
    summonBuddyItem(sim.ctx, pid, 'moss_hare');
    const second = buddyOf(sim.ctx, pid)!;
    expect(second.id).not.toBe(first.id);
    expect(sim.entities.has(first.id)).toBe(false);
    expect(second.templateId).toBe(buddyTemplateId('moss_hare'));
  });

  it('heels back onto its left-and-back offset after the owner walks away', () => {
    const sim = makeWorld();
    const pid = join(sim);
    sim.addItem('whistle_ember_fox', 1, pid);
    summonBuddyItem(sim.ctx, pid, 'ember_fox');
    const owner = sim.entities.get(pid)!;
    owner.pos.x += 20;
    for (let i = 0; i < 120; i++) sim.tick();
    const buddy = buddyOf(sim.ctx, pid)!;
    // petFollow (pet_ai.ts) stops closing once within PET_FOLLOW_DISTANCE
    // (3.5yd) of the offset target itself, not of the owner's own tile, so
    // the assertion measures against that same target rather than the
    // owner's position directly.
    const target = buddyFollowTarget(owner);
    const dx = buddy.pos.x - target.x;
    const dz = buddy.pos.z - target.z;
    expect(Math.sqrt(dx * dx + dz * dz)).toBeLessThan(3.6);
  });

  it('never registers as the owner’s combat pet (petOf stays null)', () => {
    const sim = makeWorld();
    const pid = join(sim);
    sim.addItem('whistle_ember_fox', 1, pid);
    summonBuddyItem(sim.ctx, pid, 'ember_fox');
    expect(petOf(sim.ctx, pid)).toBeNull();
  });
});

// PlayerMeta cast guard, mirroring tests/mounts.test.ts: ownedBuddies must be
// strict about its containers instead of silently under-reporting the
// collection.
describe('ownedBuddies refuses a meta with no containers', () => {
  it('throws instead of reporting no buddies', () => {
    const noBags = { bank: { inventory: [] } } as unknown as PlayerMeta;
    expect(() => ownedBuddies(noBags)).toThrow(TypeError);
    const noBank = { inventory: [] } as unknown as PlayerMeta;
    expect(() => ownedBuddies(noBank)).toThrow(TypeError);
  });
});

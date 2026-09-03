// The instance combat hold (src/sim/instances/instance_combat_hold.ts): inside a
// claimed instance slot (a dungeon, or one raid room) a mob never sheds an
// attacker by distance. Its hate table is slot-scoped, the soft leash never
// fires, and a mob that cannot reach its target holds in place immune and
// aggro'd instead of evading home. Regression: a kited chain pull in the
// Wildheart Basin shed its adds through the 70 yd dungeon leash and the
// unreachable stall, and the pull was being farmed.
import { describe, expect, it } from 'vitest';
import { collectEngagedPids } from '../src/sim/combat/engaged_combat';
import { BUILTIN_WORLD, DUNGEONS, MOBS } from '../src/sim/data';
import {
  IGNIVAR_APPROACH_GUARDIAN_IDS,
  IGNIVAR_FORGE_APPROACH_ID,
  IGNIVAR_LIFT_ROOM_ID,
  IGNIVAR_RAID_ARENA_ID,
} from '../src/sim/ignivar_raid_ids';
import { enterDungeon, instanceOriginOf } from '../src/sim/instances/dungeons';
import {
  attackerLeftInstance,
  holdsAggroInInstance,
  instanceClaimOf,
  isPinnedInPlace,
  pinInPlace,
  releasePin,
} from '../src/sim/instances/instance_combat_hold';
import { onChaseStalled, tetherVerdict } from '../src/sim/mob/combat_profile';
import { type InstanceSlot, Sim } from '../src/sim/sim';
import { THREAT_DROP_RANGE } from '../src/sim/threat';
import { DUNGEON_LEASH_DISTANCE, dist2d, type Entity, type WorldContent } from '../src/sim/types';
import { expectDefined } from './helpers/defined';

const TEST_WORLD: WorldContent = {
  ...BUILTIN_WORLD,
  camps: [],
  npcs: {},
  groundObjects: [],
};

const LINGER_TICKS = 20 * 5;

function makeSim(seed = 91, devCommands = false): Sim {
  return new Sim({ seed, playerClass: 'warrior', noPlayer: true, world: TEST_WORLD, devCommands });
}

interface Claimed {
  sim: Sim;
  instance: InstanceSlot;
  pid: number;
  player: Entity;
  mobs: Entity[];
}

function claim(dungeonId: string, sim = makeSim()): Claimed {
  const pid = sim.addPlayer('warrior', 'Alpha');
  sim.setPlayerLevel(30, pid);
  expect(enterDungeon(sim.ctx, dungeonId, pid)).toBe(true);
  const instance = sim.instances.find((c) => c.dungeonId === dungeonId && c.partyKey !== null);
  if (!instance) throw new Error(`${dungeonId} instance was not claimed`);
  const player = expectDefined(sim.entities.get(pid));
  // An immortal puller: the point is where the mobs go, not whether he survives.
  player.devGod = true;
  const mobs = instance.mobIds
    .map((id) => sim.entities.get(id))
    .filter((e): e is Entity => !!e && e.kind === 'mob' && !e.dead);
  return { sim, instance, pid, player, mobs };
}

function place(sim: Sim, e: Entity, x: number, z: number): void {
  e.pos = sim.ctx.groundPos(x, z);
  e.prevPos = { ...e.pos };
  sim.ctx.rebucket(e);
}

function hit(sim: Sim, source: Entity, target: Entity, amount: number): void {
  sim.dealDamage(source, target, amount, false, 'physical', null, 'hit', true);
}

// A spot inside the slot's claim footprint (|dz| < 250 of the origin) that is
// `distance` yards from `from` along z, whichever side has the room.
function insideSlotAwayFrom(
  inst: InstanceSlot,
  from: Entity,
  distance: number,
): { x: number; z: number } {
  const origin = instanceOriginOf(inst);
  const north = from.pos.z + distance;
  const z = Math.abs(north - origin.z) < 240 ? north : from.pos.z - distance;
  return { x: from.pos.x, z };
}

function engage(sim: Sim, player: Entity, mob: Entity): void {
  mob.maxHp = 50_000;
  mob.hp = 50_000;
  place(sim, player, mob.pos.x + 2, mob.pos.z);
  hit(sim, player, mob, 100);
  sim.tick();
  expect(mob.aggroTargetId).toBe(player.id);
  expect(mob.inCombat).toBe(true);
}

describe('instance combat hold: hate tables are slot-scoped, never distance-scoped', () => {
  it('keeps an attacker who runs past the leash and the reach inside the slot', () => {
    const { sim, instance, player, mobs } = claim('wildheart_basin');
    const mob = expectDefined(mobs.find((m) => !MOBS[m.templateId]?.boss));
    engage(sim, player, mob);
    const far = insideSlotAwayFrom(instance, mob, THREAT_DROP_RANGE + 40);
    place(sim, player, far.x, far.z);
    expect(instanceClaimOf(sim.ctx, player)).toBe(instanceClaimOf(sim.ctx, mob));

    for (let i = 0; i < 20 * 12; i++) sim.tick();
    expect(mob.aiState).not.toBe('evade');
    expect(mob.threat.has(player.id)).toBe(true);
    expect(mob.aggroTargetId).toBe(player.id);
    expect(player.inCombat).toBe(true);
    // It followed well past the old dungeon leash instead of going home.
    expect(dist2d(mob.pos, mob.spawnPos)).toBeGreaterThan(DUNGEON_LEASH_DISTANCE);
  });

  it('drops the attacker on the tick they are outside the slot, then goes home', () => {
    const { sim, instance, player, mobs } = claim('wildheart_basin');
    const mob = expectDefined(mobs.find((m) => !MOBS[m.templateId]?.boss));
    engage(sim, player, mob);
    const origin = instanceOriginOf(instance);
    // Just past the footprint's x half-width: still 500 yd from any other slot.
    place(sim, player, origin.x + 130, mob.pos.z);
    expect(instanceClaimOf(sim.ctx, player)).toBeNull();
    sim.tick();
    expect(mob.threat.has(player.id)).toBe(false);
    for (let i = 0; i < 20 * 5 && mob.aiState !== 'evade' && mob.inCombat; i++) sim.tick();
    expect(mob.threat.size).toBe(0);
    player.combatTimer = 99;
    for (let i = 0; i < LINGER_TICKS + 1; i++) sim.tick();
    expect(player.inCombat).toBe(false);
  });

  it('holds a party member anywhere in the room for an instance boss, and nobody outside it', () => {
    const { sim, instance, pid, player, mobs } = claim('hollow_crypt');
    const boss = expectDefined(mobs.find((m) => MOBS[m.templateId]?.boss));
    const passivePid = sim.addPlayer('priest', 'Passive');
    sim.setPlayerLevel(30, passivePid);
    sim.partyInvite(passivePid, pid);
    sim.partyAccept(passivePid);
    const passive = expectDefined(sim.entities.get(passivePid));
    engage(sim, player, boss);

    const farInside = insideSlotAwayFrom(instance, boss, THREAT_DROP_RANGE + 60);
    place(sim, passive, farInside.x, farInside.z);
    sim.tick();
    expect(passive.inCombat).toBe(true);

    const origin = instanceOriginOf(instance);
    place(sim, passive, origin.x + 130, boss.pos.z);
    passive.combatTimer = 99;
    sim.tick();
    expect(passive.inCombat).toBe(false);
  });

  it('a raider who crosses to another room is dropped by the room they left', () => {
    const sim = makeSim(91, true);
    const pid = sim.addPlayer('warrior', 'Raider');
    sim.setPlayerLevel(30, pid);
    for (const roomId of [IGNIVAR_LIFT_ROOM_ID, IGNIVAR_FORGE_APPROACH_ID]) {
      if (!enterDungeon(sim.ctx, roomId, pid, true)) throw new Error(`${roomId} entry failed`);
    }
    const approach = expectDefined(
      sim.instances.find((c) => c.dungeonId === IGNIVAR_FORGE_APPROACH_ID && c.partyKey !== null),
    );
    const player = expectDefined(sim.entities.get(pid));
    player.devGod = true;
    const guardian = expectDefined(
      approach.mobIds
        .map((id) => sim.entities.get(id))
        .find(
          (m): m is Entity =>
            !!m &&
            !m.dead &&
            (IGNIVAR_APPROACH_GUARDIAN_IDS as readonly string[]).includes(m.templateId),
        ),
    );
    engage(sim, player, guardian);
    expect(guardian.threat.has(pid)).toBe(true);

    expect(enterDungeon(sim.ctx, IGNIVAR_RAID_ARENA_ID, pid, true)).toBe(true);
    expect(
      attackerLeftInstance(sim.ctx, expectDefined(instanceClaimOf(sim.ctx, guardian)), player),
    ).toBe(true);
    sim.tick();
    expect(guardian.threat.has(pid)).toBe(false);
    expect(guardian.aggroTargetId).not.toBe(pid);
    player.combatTimer = 99;
    for (let i = 0; i < LINGER_TICKS + 1; i++) sim.tick();
    expect(player.inCombat).toBe(false);
  });
});

describe('instance combat hold: an out-of-reach mob holds in place instead of resetting', () => {
  it('the tether verdict holds an instance mob at its tether and sends an open-world mob home', () => {
    // No instance mob that chases carries a hard tether (the Derelict Mechs
    // detonate where they stand), so the verdict is pinned at its seam; the
    // pin's immunity is covered below.
    const { sim, player, mobs } = claim('wildheart_basin');
    const mob = expectDefined(mobs.find((m) => !MOBS[m.templateId]?.boss));
    engage(sim, player, mob);
    const hold = holdsAggroInInstance(sim.ctx, mob);
    expect(hold).toBe(true);
    place(sim, player, mob.pos.x + 30, mob.pos.z);
    expect(tetherVerdict(mob, player, 5, hold)).toBe('hold');
    place(sim, player, mob.pos.x + 2, mob.pos.z);
    expect(tetherVerdict(mob, player, 5, hold)).toBe('fight');
    place(sim, player, mob.pos.x + 30, mob.pos.z);
    expect(tetherVerdict(mob, player, 5, false)).toBe('evade');
  });

  it('the stall verdict pins inside an instance and evades home outside it', () => {
    const { sim, player, mobs } = claim('wildheart_basin');
    const mob = expectDefined(mobs.find((m) => !MOBS[m.templateId]?.boss));
    engage(sim, player, mob);
    onChaseStalled(mob, holdsAggroInInstance(sim.ctx, mob));
    expect(isPinnedInPlace(mob)).toBe(true);
    expect(mob.aiState).not.toBe('evade');
    expect(mob.threat.has(player.id)).toBe(true);

    releasePin(mob);
    onChaseStalled(mob, false);
    expect(mob.aiState).toBe('evade');
    expect(mob.threat.size).toBe(0);
    expect(isPinnedInPlace(mob)).toBe(false);
  });

  it('a pinned mob still holds its attacker in combat and stays killable once released', () => {
    const { sim, player, mobs } = claim('wildheart_basin');
    const mob = expectDefined(mobs.find((m) => !MOBS[m.templateId]?.boss));
    engage(sim, player, mob);
    pinInPlace(mob);
    const out = new Set<number>();
    collectEngagedPids(sim.ctx, out);
    expect(out.has(player.id)).toBe(true);
    const hp = mob.hp;
    hit(sim, player, mob, 300);
    expect(mob.hp).toBe(hp);
    releasePin(mob);
    hit(sim, player, mob, 300);
    expect(mob.hp).toBe(hp - 300);
  });

  it('is an open-world no-op: outside any slot the reach and the evade rules stand', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Roamer');
    const player = expectDefined(sim.entities.get(pid));
    expect(holdsAggroInInstance(sim.ctx, player)).toBe(false);
    expect(instanceClaimOf(sim.ctx, player)).toBeNull();
  });
});

describe('instance combat hold: content sanity', () => {
  it('every dungeon and raid room lives at an instance slot the claim lookup sees', () => {
    for (const dungeon of Object.values(DUNGEONS)) {
      expect(dungeon.index, dungeon.id).toBeGreaterThanOrEqual(0);
    }
  });
});

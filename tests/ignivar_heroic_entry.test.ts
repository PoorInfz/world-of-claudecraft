// The heroic claim through the REAL Ignivar door path (no dev bypass): the
// overworld keep door claims the forge lift, and every deeper room inherits
// that first claim's difficulty. The lift must therefore be heroic-eligible
// in HEROIC_DUNGEON_IDS, or claimDifficultyForDungeon silently clamps the
// whole chain to normal (the v0.41.0 regression: the forge-lift became the
// chain's first room without a heroic tuning record, and every suite entered
// deeper rooms through the dev arm, the one path that skips the clamp).
import { describe, expect, it } from 'vitest';
import { IGNIVAR_LIFT_RIDE_SECONDS } from '../src/sim/ignivar_forge_lift';
import { IGNIVAR_FORGE_APPROACH_ID, IGNIVAR_LIFT_ROOM_ID } from '../src/sim/ignivar_raid_ids';
import { enterDungeon } from '../src/sim/instances/dungeons';
import { type InstanceSlot, type PlayerMeta, Sim } from '../src/sim/sim';
import type { DungeonDifficulty } from '../src/sim/types';

// A production-shaped sim: no devCommands, so every door decision below runs
// the live-server branch of enterDungeon (bypass stays false throughout).
function raidSim(): { sim: Sim; lead: PlayerMeta } {
  const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: false, noPlayer: true });
  const leadPid = sim.addPlayer('warrior', 'Lead');
  const lead = sim.players.get(leadPid)!;
  for (let i = 0; i < 4; i += 1) {
    const pid = sim.addPlayer('mage', `M${i}`);
    sim.partyInvite(pid, lead.entityId);
    sim.partyAccept(pid);
  }
  sim.convertPartyToRaid(lead.entityId);
  if (sim.ctx.partyOf(lead.entityId)?.raid !== true) throw new Error('test raid did not form');
  return { sim, lead };
}

function liveClaim(sim: Sim, dungeonId: string): InstanceSlot {
  const claim = sim.instances.find(
    (inst) => inst.dungeonId === dungeonId && inst.partyKey !== null,
  );
  if (!claim) throw new Error(`no live claim for ${dungeonId}`);
  return claim;
}

// Walk the whole production path for one difficulty selection: the keep door
// onto the lift, the ride (the gate swaps open at the 1 Hz instance sweep),
// then the opened gate into the Halls. Returns the two claims' difficulties.
function walkIntoHalls(selected: DungeonDifficulty): {
  lift: DungeonDifficulty;
  halls: DungeonDifficulty;
} {
  const { sim, lead } = raidSim();
  if (selected === 'heroic') sim.setDungeonDifficulty('heroic', lead.entityId);
  if (!enterDungeon(sim.ctx, IGNIVAR_LIFT_ROOM_ID, lead.entityId)) {
    throw new Error('lift entry failed');
  }
  const lift = liveClaim(sim, IGNIVAR_LIFT_ROOM_ID).difficulty;
  for (let i = 0; i < 20 * (IGNIVAR_LIFT_RIDE_SECONDS + 2); i += 1) sim.tick();
  if (!enterDungeon(sim.ctx, IGNIVAR_FORGE_APPROACH_ID, lead.entityId)) {
    throw new Error('Halls entry through the opened lift gate failed');
  }
  return { lift, halls: liveClaim(sim, IGNIVAR_FORGE_APPROACH_ID).difficulty };
}

describe('the Ignivar raid claims the selected difficulty through the real door', () => {
  it('a heroic selection claims a heroic lift, and the Halls inherit it', () => {
    const { lift, halls } = walkIntoHalls('heroic');
    expect(lift).toBe('heroic');
    expect(halls).toBe('heroic');
  });

  it('the default selection still claims normal all the way in', () => {
    const { lift, halls } = walkIntoHalls('normal');
    expect(lift).toBe('normal');
    expect(halls).toBe('normal');
  });
});

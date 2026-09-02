// The per-tick player combat flag (src/sim/combat/engaged_combat.ts): the classic
// hate-table rule (anyone a live mob still carries on its hate table stays in
// combat, not only the mob's current target) plus the raid-boss "zone in combat"
// rule (an engaged boss holds every nearby member of its attackers' groups).
//
// Regression: a raid member who stopped acting for 5s dropped combat mid-boss,
// swapped to a healer spec, and mass-resurrected the raid through a "cannot be
// cast in combat" gate. Every case here drives the real tick path.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BOSS_ENCOUNTER_COMBAT_RANGE, PET_COMBAT_LINGER } from '../src/sim/combat/engaged_combat';
import { NORMAL_BOSS_DUMMY_ID } from '../src/sim/content/practice_dummies';
import { BUILTIN_WORLD, MOBS, setActiveWorldContent } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent, WorldContent } from '../src/sim/types';
import { LEASH_DISTANCE } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';
import { expectDefined } from './helpers/defined';

// Every fight here is staged against a hand-spawned mob on open ground, so the
// ambient camps, NPCs, and road colliders are stripped for speed and isolation.
const TEST_WORLD: WorldContent = {
  ...BUILTIN_WORLD,
  camps: [],
  npcs: {},
  groundObjects: [],
  roads: [],
};

beforeAll(() => setActiveWorldContent(TEST_WORLD));
afterAll(() => setActiveWorldContent(null));

// Open ground well away from the Eastbrook hub (the /assist suite's staging spot).
const ARENA_X = 305;
const ARENA_Z = 0;
const LINGER_TICKS = 20 * 5;

interface HealHarness {
  applyHeal(source: Entity, target: Entity, amount: number, ability: string): void;
}

function makeWorld(): Sim {
  return new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true, world: TEST_WORLD });
}

function entity(sim: Sim, id: number): Entity {
  return expectDefined(sim.entities.get(id));
}

function place(sim: Sim, e: Entity, x: number, z: number): void {
  e.pos.x = x;
  e.pos.z = z;
  e.pos.y = terrainHeight(x, z, sim.cfg.seed);
  e.prevPos = { ...e.pos };
}

let nextMobId = 90_001;
function spawnMob(sim: Sim, templateId: string, level: number, x: number, z: number): Entity {
  const mob = createMob(nextMobId++, expectDefined(MOBS[templateId]), level, sim.groundPos(x, z));
  // survive every scripted hit in a case (death wipes the hate table)
  mob.maxHp = 50_000;
  mob.hp = 50_000;
  sim.entities.set(mob.id, mob);
  return mob;
}

function hit(sim: Sim, source: Entity, target: Entity, amount: number): void {
  sim.dealDamage(source, target, amount, false, 'physical', null, 'hit', true);
}

function heal(sim: Sim, source: Entity, target: Entity, amount: number): void {
  (sim as unknown as HealHarness).applyHeal(source, target, amount, 'heal');
}

function formParty(sim: Sim, leader: number, members: number[]): void {
  for (const m of members) {
    sim.partyInvite(m, leader);
    sim.partyAccept(m);
  }
}

// Add a player who can take a few boss swings without dying inside a case.
function addSturdyPlayer(sim: Sim, cls: 'warrior' | 'priest' | 'mage', name: string): number {
  const pid = sim.addPlayer(cls, name);
  sim.setPlayerLevel(30, pid);
  return pid;
}

// Ticks `count` times and reports whether the player was flagged in combat on
// EVERY tick (a single dropped tick is the exploit window).
function inCombatForTicks(sim: Sim, pid: number, count: number): boolean {
  const p = entity(sim, pid);
  for (let i = 0; i < count; i++) {
    sim.tick();
    if (!p.inCombat) return false;
  }
  return true;
}

function errors(events: SimEvent[], pid: number): string[] {
  return events
    .filter((e): e is Extract<SimEvent, { type: 'error' }> => e.type === 'error' && e.pid === pid)
    .map((e) => e.text);
}

// Tank + a second attacker on one wild wolf. The tank out-threats the second
// attacker by a wide margin, so the wolf's aggro target is always the tank.
function wolfFight(): { sim: Sim; wolf: Entity; tank: number; dps: number } {
  const sim = makeWorld();
  const wolf = spawnMob(sim, 'forest_wolf', 5, ARENA_X, ARENA_Z);
  const tank = addSturdyPlayer(sim, 'warrior', 'Tank');
  const dps = addSturdyPlayer(sim, 'warrior', 'Dps');
  place(sim, entity(sim, tank), ARENA_X + 2, ARENA_Z);
  place(sim, entity(sim, dps), ARENA_X + 4, ARENA_Z);
  hit(sim, entity(sim, tank), wolf, 500);
  hit(sim, entity(sim, dps), wolf, 10);
  sim.tick();
  expect(wolf.aggroTargetId).toBe(tank);
  expect(wolf.threat.has(dps)).toBe(true);
  return { sim, wolf, tank, dps };
}

describe('hate-table combat: every attacker on a live mob stays in combat', () => {
  it('keeps a non-target attacker in combat after their own 5s linger has run out', () => {
    const { sim, wolf, dps } = wolfFight();
    entity(sim, dps).combatTimer = 99;
    expect(inCombatForTicks(sim, dps, 20 * 10)).toBe(true);
    expect(wolf.dead).toBe(false);
    expect(wolf.aggroTargetId).not.toBe(dps);
  });

  it('keeps a healer in combat through the healing-threat entry alone', () => {
    const sim = makeWorld();
    const wolf = spawnMob(sim, 'forest_wolf', 5, ARENA_X, ARENA_Z);
    const tank = addSturdyPlayer(sim, 'warrior', 'Tank');
    const healer = addSturdyPlayer(sim, 'priest', 'Healer');
    place(sim, entity(sim, tank), ARENA_X + 2, ARENA_Z);
    place(sim, entity(sim, healer), ARENA_X + 12, ARENA_Z);
    hit(sim, entity(sim, tank), wolf, 200);
    sim.tick();
    entity(sim, tank).hp = Math.max(1, entity(sim, tank).hp - 50);
    heal(sim, entity(sim, healer), entity(sim, tank), 40);
    expect(wolf.threat.has(healer)).toBe(true);
    expect(wolf.aggroTargetId).toBe(tank);

    entity(sim, healer).combatTimer = 99;
    expect(inCombatForTicks(sim, healer, 20 * 10)).toBe(true);
  });

  it('releases the attacker once the mob dies', () => {
    const { sim, wolf, tank, dps } = wolfFight();
    entity(sim, dps).combatTimer = 99;
    sim.tick();
    expect(entity(sim, dps).inCombat).toBe(true);

    hit(sim, entity(sim, tank), wolf, 1_000_000);
    expect(wolf.dead).toBe(true);
    for (let i = 0; i < LINGER_TICKS + 1; i++) sim.tick();
    expect(entity(sim, dps).inCombat).toBe(false);
  });

  it('releases the attacker once the mob leashes home and wipes its hate table', () => {
    const { sim, wolf, tank, dps } = wolfFight();
    const far = ARENA_X + LEASH_DISTANCE * 4;
    place(sim, entity(sim, tank), far, ARENA_Z);
    place(sim, entity(sim, dps), far, ARENA_Z);
    entity(sim, dps).combatTimer = 99;
    for (let i = 0; i < 20 * 60 && wolf.aiState !== 'evade'; i++) sim.tick();
    expect(wolf.aiState).toBe('evade');
    expect(wolf.threat.size).toBe(0);

    entity(sim, dps).combatTimer = 99;
    sim.tick();
    expect(entity(sim, dps).inCombat).toBe(false);
  });

  it('a training dummy still only holds the hitter for the 5s linger', () => {
    const sim = makeWorld();
    const dummy = spawnMob(sim, 'training_effigy', 1, ARENA_X, ARENA_Z);
    const hitter = addSturdyPlayer(sim, 'warrior', 'Hitter');
    place(sim, entity(sim, hitter), ARENA_X + 2, ARENA_Z);
    hit(sim, entity(sim, hitter), dummy, 50);
    sim.tick();
    expect(entity(sim, hitter).inCombat).toBe(true);
    for (let i = 0; i < LINGER_TICKS + 2; i++) sim.tick();
    expect(entity(sim, hitter).inCombat).toBe(false);
  });

  it('a boss-profile practice dummy never holds a passive party member', () => {
    const sim = makeWorld();
    const dummy = spawnMob(sim, NORMAL_BOSS_DUMMY_ID, 20, ARENA_X, ARENA_Z);
    expect(MOBS[NORMAL_BOSS_DUMMY_ID]?.boss).toBe(true);
    const hitter = addSturdyPlayer(sim, 'warrior', 'Hitter');
    const passive = addSturdyPlayer(sim, 'priest', 'Passive');
    formParty(sim, hitter, [passive]);
    place(sim, entity(sim, hitter), ARENA_X + 2, ARENA_Z);
    place(sim, entity(sim, passive), ARENA_X + 10, ARENA_Z);
    hit(sim, entity(sim, hitter), dummy, 50);
    sim.tick();
    expect(entity(sim, passive).inCombat).toBe(false);
  });

  it('exports the pet linger the pass applies to a pet that is not trading blows', () => {
    expect(PET_COMBAT_LINGER).toBe(5);
  });
});

// A boss (gorrak, `boss: true`) engaged by the tank; a party member parks nearby
// and never acts. Under the old rule they were never in combat at all.
function bossFight(memberDistance = 30): {
  sim: Sim;
  boss: Entity;
  tank: number;
  passive: number;
} {
  const sim = makeWorld();
  const boss = spawnMob(sim, 'gorrak', 6, ARENA_X, ARENA_Z);
  const tank = addSturdyPlayer(sim, 'warrior', 'Tank');
  const passive = addSturdyPlayer(sim, 'priest', 'Passive');
  formParty(sim, tank, [passive]);
  place(sim, entity(sim, tank), ARENA_X + 2, ARENA_Z);
  place(sim, entity(sim, passive), ARENA_X + memberDistance, ARENA_Z);
  hit(sim, entity(sim, tank), boss, 500);
  sim.tick();
  expect(boss.aggroTargetId).toBe(tank);
  expect(boss.threat.has(passive)).toBe(false);
  return { sim, boss, tank, passive };
}

describe('boss encounters hold the whole nearby group in combat', () => {
  it('flags a party member who never touched the boss for the whole engagement', () => {
    const { sim, boss, passive } = bossFight();
    expect(entity(sim, passive).inCombat).toBe(true);
    expect(inCombatForTicks(sim, passive, 20 * 10)).toBe(true);
    expect(boss.threat.has(passive)).toBe(false);
  });

  it('releases the passive member once the boss dies', () => {
    const { sim, boss, tank, passive } = bossFight();
    expect(entity(sim, passive).inCombat).toBe(true);
    hit(sim, entity(sim, tank), boss, 1_000_000);
    expect(boss.dead).toBe(true);
    for (let i = 0; i < LINGER_TICKS + 1; i++) sim.tick();
    expect(entity(sim, passive).inCombat).toBe(false);
  });

  it('releases the passive member when the last attacker dies and the boss resets', () => {
    const { sim, boss, tank, passive } = bossFight();
    expect(entity(sim, passive).inCombat).toBe(true);
    hit(sim, boss, entity(sim, tank), 1_000_000);
    expect(entity(sim, tank).dead).toBe(true);
    for (let i = 0; i < 20 * 30 && boss.inCombat; i++) sim.tick();
    expect(boss.inCombat).toBe(false);
    for (let i = 0; i < LINGER_TICKS + 1; i++) sim.tick();
    expect(entity(sim, passive).inCombat).toBe(false);
  });

  it('does not reach a party member beyond the encounter range', () => {
    const { sim, passive } = bossFight(BOSS_ENCOUNTER_COMBAT_RANGE + 20);
    expect(entity(sim, passive).inCombat).toBe(false);
    sim.tick();
    expect(entity(sim, passive).inCombat).toBe(false);
  });

  it('does not reach a bystander outside the party', () => {
    const { sim, boss } = bossFight();
    const bystander = addSturdyPlayer(sim, 'priest', 'Bystander');
    place(sim, entity(sim, bystander), boss.pos.x + 30, boss.pos.z);
    sim.tick();
    expect(entity(sim, bystander).inCombat).toBe(false);
  });

  it('a wild non-boss mob does not pull a passive party member (classic trash rule)', () => {
    const sim = makeWorld();
    const wolf = spawnMob(sim, 'forest_wolf', 5, ARENA_X, ARENA_Z);
    const tank = addSturdyPlayer(sim, 'warrior', 'Tank');
    const passive = addSturdyPlayer(sim, 'priest', 'Passive');
    formParty(sim, tank, [passive]);
    place(sim, entity(sim, tank), ARENA_X + 2, ARENA_Z);
    place(sim, entity(sim, passive), ARENA_X + 30, ARENA_Z);
    hit(sim, entity(sim, tank), wolf, 200);
    sim.tick();
    expect(wolf.aggroTargetId).toBe(tank);
    expect(entity(sim, passive).inCombat).toBe(false);
  });

  it('blocks a mass resurrection by a parked member mid-encounter, and allows it after the kill', () => {
    // The reported exploit, end to end: an arcane mage parks 20 yards from the
    // boss, never acts, and tries to raise a dead party member while the tank
    // is still fighting.
    const sim = new Sim({ seed: 42, playerClass: 'mage', autoEquip: true, world: TEST_WORLD });
    sim.setPlayerLevel(10);
    expect(sim.setSpec('arcane')).toBe(true);
    const mage = sim.playerId;
    const boss = spawnMob(sim, 'gorrak', 6, ARENA_X, ARENA_Z);
    const tank = addSturdyPlayer(sim, 'warrior', 'Tank');
    const victim = addSturdyPlayer(sim, 'priest', 'Victim');
    formParty(sim, mage, [tank, victim]);
    place(sim, sim.player, ARENA_X + 20, ARENA_Z);
    place(sim, entity(sim, tank), ARENA_X + 2, ARENA_Z);
    place(sim, entity(sim, victim), ARENA_X + 6, ARENA_Z);
    hit(sim, entity(sim, tank), boss, 500);
    hit(sim, boss, entity(sim, victim), 1_000_000);
    expect(entity(sim, victim).dead).toBe(true);
    sim.tick();
    expect(boss.aggroTargetId).toBe(tank);

    // Parked for ten seconds: still in combat, so the cast is refused.
    expect(inCombatForTicks(sim, mage, 20 * 10)).toBe(true);
    sim.player.resource = sim.player.maxResource;
    sim.castAbility('collective_reversal');
    const refused = errors(sim.tick(), mage);
    expect(refused.some((text) => /combat/.test(text))).toBe(true);
    expect(sim.player.castingAbility).not.toBe('collective_reversal');

    // Encounter cleared: the group leaves combat and the raise goes through.
    hit(sim, entity(sim, tank), boss, 1_000_000);
    expect(boss.dead).toBe(true);
    for (let i = 0; i < LINGER_TICKS + 1; i++) sim.tick();
    expect(sim.player.inCombat).toBe(false);
    sim.player.resource = sim.player.maxResource;
    sim.player.cooldowns.delete('collective_reversal');
    sim.castAbility('collective_reversal');
    const allowed = errors(sim.tick(), mage);
    expect(allowed.some((text) => /combat/.test(text))).toBe(false);
    expect(sim.player.castingAbility).toBe('collective_reversal');
  });
});

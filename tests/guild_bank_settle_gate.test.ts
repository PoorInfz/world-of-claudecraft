// The unsettled gate, unit: what OTHER sessions' unflushed logs make
// unsettled on a book, and which withdraws / gold withdraws / rung purchases
// that refuses. The server-level pins (the 2026-09-01 two-material swap, the
// flush, the counter, the notice) live in tests/guild_bank_persistence.test.ts.
import { describe, expect, it } from 'vitest';
import {
  GUILD_BANK_GATED_OPS,
  type GuildBankOpRequest,
  guildBankUnsettledRefusal,
  guildBookHolders,
  isGuildBankGatedOp,
  unsettledGuildBook,
} from '../server/guild_bank_settle_gate';
import type { GuildBankOpDelta } from '../src/sim/guild_bank';
import type { InvSlot } from '../src/sim/types';
import type { GuildBankInfo } from '../src/world_api';

const delta = (partial: Partial<GuildBankOpDelta> & { op: GuildBankOpDelta['op'] }) => ({
  itemId: null,
  count: null,
  instance: null,
  craftedRecipeId: null,
  copperDelta: 0,
  purchasedSlotsBefore: 0,
  purchasedSlotsAfter: 0,
  ...partial,
});
const deposit = (itemId: string, count: number, extra: Partial<GuildBankOpDelta> = {}) =>
  delta({ op: 'deposit', itemId, count, ...extra });
const withdraw = (itemId: string, count: number, extra: Partial<GuildBankOpDelta> = {}) =>
  delta({ op: 'withdraw', itemId, count, ...extra });
const gold = (copperDelta: number) =>
  delta({ op: copperDelta > 0 ? 'deposit_gold' : 'withdraw_gold', copperDelta });

function book(slots: InvSlot[], treasury = 0, purchasedSlots = 24): GuildBankInfo {
  return {
    treasury,
    slots,
    capacity: purchasedSlots,
    purchasedSlots,
    nextExpansionPrice: purchasedSlots === 0 ? 10_000 : 50_000,
    canEdit: true,
  };
}

const refusal = (
  op: (typeof GUILD_BANK_GATED_OPS)[number],
  request: GuildBankOpRequest,
  live: GuildBankInfo,
  logs: readonly (readonly GuildBankOpDelta[])[],
) => guildBankUnsettledRefusal(op, request, live, unsettledGuildBook(logs));

describe('unsettledGuildBook (what other sessions have not made durable)', () => {
  it('nets item deltas per identity key, deposits minus removals, across every log', () => {
    const u = unsettledGuildBook([
      [deposit('spider_leg', 20), withdraw('spider_leg', 5)],
      [deposit('spider_leg', 3), delta({ op: 'admin_purge', itemId: 'spider_leg', count: 1 })],
      [deposit('venom_gland', 7)],
    ]);
    expect([...u.items.entries()]).toEqual([
      [expect.stringContaining('spider_leg'), 17],
      [expect.stringContaining('venom_gland'), 7],
    ]);
    expect(u.copper).toBe(0);
    expect(u.ladder).toBe(false);
  });

  it('keeps the three identity dimensions apart (instance payload and craft provenance)', () => {
    const u = unsettledGuildBook([
      [deposit('iron_ore', 5, { instance: { signer: 'BigDamage' } })],
      [deposit('iron_ore', 5)],
      [deposit('iron_ore', 5, { craftedRecipeId: 'smelt_iron' })],
    ]);
    expect(u.items.size).toBe(3);
    for (const net of u.items.values()) expect(net).toBe(5);
  });

  it('nets treasury copper the replay would move: gold both ways and buy_slots, never open_bank', () => {
    const u = unsettledGuildBook([
      [gold(40_000), gold(-15_000)],
      [delta({ op: 'open_bank', copperDelta: -10_000, purchasedSlotsAfter: 24 })],
      [
        delta({
          op: 'buy_slots',
          copperDelta: -5_000,
          purchasedSlotsBefore: 24,
          purchasedSlotsAfter: 30,
        }),
      ],
    ]);
    expect(u.copper).toBe(20_000);
    expect(u.ladder).toBe(true);
  });

  it('ignores a malformed item delta rather than keying on it', () => {
    const u = unsettledGuildBook([[deposit('', 5), withdraw('wolf_fang', Number.NaN)]]);
    expect(u.items.size).toBe(0);
  });
});

describe('guildBankUnsettledRefusal: withdraws', () => {
  const live = book([{ itemId: 'spider_leg', count: 20 }]);

  it("refuses a withdraw of another session's unsettled stack", () => {
    expect(refusal('withdraw', { slot: 0 }, live, [[deposit('spider_leg', 20)]])).toBe('items');
  });

  it('passes the same withdraw once nothing is unsettled (the stack is durable)', () => {
    expect(refusal('withdraw', { slot: 0 }, live, [])).toBeNull();
    expect(refusal('withdraw', { slot: 0 }, live, [[deposit('venom_gland', 20)]])).toBeNull();
  });

  it('lets a PARTIAL withdraw through while it fits inside the settled copies', () => {
    // 30 live copies across two stacks, 20 of them unsettled: 10 are settled.
    const two = book([
      { itemId: 'spider_leg', count: 20 },
      { itemId: 'spider_leg', count: 10 },
    ]);
    const logs = [[deposit('spider_leg', 20)]];
    expect(refusal('withdraw', { slot: 0, count: 10 }, two, logs)).toBeNull();
    expect(refusal('withdraw', { slot: 0, count: 11 }, two, logs)).toBe('items');
    // No count asked means the whole stack.
    expect(refusal('withdraw', { slot: 1 }, two, logs)).toBeNull();
    expect(refusal('withdraw', { slot: 0 }, two, logs)).toBe('items');
  });

  it("is blind to another session's unsettled REMOVAL (the live count already reflects it)", () => {
    expect(refusal('withdraw', { slot: 0 }, live, [[withdraw('spider_leg', 20)]])).toBeNull();
  });

  it('matches on the full identity: a differently signed or crafted copy is a different key', () => {
    const signed = book([{ itemId: 'iron_ore', count: 5, instance: { signer: 'BigDamage' } }]);
    expect(refusal('withdraw', { slot: 0 }, signed, [[deposit('iron_ore', 5)]])).toBeNull();
    expect(
      refusal('withdraw', { slot: 0 }, signed, [
        [deposit('iron_ore', 5, { instance: { signer: 'BigDamage' } })],
      ]),
    ).toBe('items');
    const crafted = book([{ itemId: 'iron_ore', count: 5, craftedRecipeId: 'smelt_iron' }]);
    expect(refusal('withdraw', { slot: 0 }, crafted, [[deposit('iron_ore', 5)]])).toBeNull();
  });

  it('treats an instanced stack as moving whole, whatever count was asked', () => {
    const signed = book([{ itemId: 'iron_ore', count: 5, instance: { signer: 'BigDamage' } }]);
    const logs = [[deposit('iron_ore', 5, { instance: { signer: 'BigDamage' } })]];
    expect(refusal('withdraw', { slot: 0, count: 1 }, signed, logs)).toBe('items');
  });

  it('passes a shape the sim refuses itself (a missing slot, a bad count) unjudged', () => {
    const logs = [[deposit('spider_leg', 20)]];
    expect(refusal('withdraw', { slot: 7 }, live, logs)).toBeNull();
    expect(refusal('withdraw', { slot: -1 }, live, logs)).toBeNull();
    expect(refusal('withdraw', { slot: 0.5 }, live, logs)).toBeNull();
    expect(refusal('withdraw', { slot: 0, count: 0 }, live, logs)).toBeNull();
    expect(refusal('withdraw', {}, live, logs)).toBeNull();
  });
});

describe('guildBankUnsettledRefusal: gold and ladder rungs', () => {
  it('refuses a gold withdraw that exceeds the settled treasury', () => {
    const live = book([], 140_000);
    const logs = [[gold(40_000)]];
    expect(refusal('withdraw_gold', { amount: 100_000 }, live, logs)).toBeNull();
    expect(refusal('withdraw_gold', { amount: 100_001 }, live, logs)).toBe('copper');
  });

  it("is blind to another session's unsettled gold WITHDRAW", () => {
    const live = book([], 60_000);
    expect(refusal('withdraw_gold', { amount: 60_000 }, live, [[gold(-40_000)]])).toBeNull();
  });

  it('passes a non-positive or malformed amount unjudged', () => {
    const live = book([], 40_000);
    const logs = [[gold(40_000)]];
    expect(refusal('withdraw_gold', { amount: 0 }, live, logs)).toBeNull();
    expect(refusal('withdraw_gold', { amount: -5 }, live, logs)).toBeNull();
    expect(refusal('withdraw_gold', {}, live, logs)).toBeNull();
  });

  it('refuses a rung purchase while any rung is unsettled (the ladder is strictly ordered)', () => {
    const live = book([], 500_000, 24);
    const opened = [[delta({ op: 'open_bank', copperDelta: -10_000, purchasedSlotsAfter: 24 })]];
    expect(refusal('buy_slots', {}, live, opened)).toBe('ladder');
    expect(refusal('buy_slots', {}, live, [])).toBeNull();
  });

  it('refuses a treasury-paid rung the settled treasury cannot cover, but never a purse-paid opening', () => {
    // Rung 1+ costs nextExpansionPrice (50_000 here) from the treasury.
    const live = book([], 60_000, 24);
    expect(refusal('buy_slots', {}, live, [[gold(10_000)]])).toBeNull();
    expect(refusal('buy_slots', {}, live, [[gold(10_001)]])).toBe('copper');
    // Rung 0 opens the bank from the acting officer's own purse: no copper rule.
    const unopened = book([], 0, 0);
    expect(refusal('buy_slots', {}, unopened, [[gold(10_000)]])).toBeNull();
  });
});

describe('the gated op set', () => {
  it('gates withdraws, gold withdraws, and rung purchases; never deposits or the operator purge', () => {
    expect([...GUILD_BANK_GATED_OPS]).toEqual(['withdraw', 'withdraw_gold', 'buy_slots']);
    for (const op of ['deposit', 'deposit_gold', 'open_bank', 'admin_purge']) {
      expect(isGuildBankGatedOp(op)).toBe(false);
    }
  });
});

describe('guildBookHolders (which sessions hold unflushed work on a book)', () => {
  const session = (
    dirty: number[],
    flags: { escrowQuarantined?: boolean; left?: boolean } = {},
  ) => ({
    escrowQuarantined: flags.escrowQuarantined ?? false,
    left: flags.left ?? false,
    dirtyGuildBanks: new Map(dirty.map((g) => [g, 1])),
  });

  it('returns every other session with a dirty mark on the guild, never the caller or a quarantined one', () => {
    const me = session([9]);
    const holder = session([9]);
    const otherGuild = session([10]);
    const quarantined = session([9], { escrowQuarantined: true });
    const holders = guildBookHolders([me, holder, otherGuild, quarantined], 9, me, {
      includeLeaving: false,
    });
    expect(holders).toEqual([holder]);
  });

  it('counts a departing session only when asked to (the gate does, the refusal arm does not)', () => {
    const me = session([]);
    const leaving = session([9], { left: true });
    expect(guildBookHolders([me, leaving], 9, me, { includeLeaving: false })).toEqual([]);
    expect(guildBookHolders([me, leaving], 9, me, { includeLeaving: true })).toEqual([leaving]);
  });
});

// The UNSETTLED gate for guild bank ops. A session may take out of the live
// book only what durable truth already holds plus what its OWN unflushed log
// put in. Value another session deposited but has not yet made durable is
// UNSETTLED: consuming it puts a replay dependency on that session into this
// session's escrow log, and the escrow save honours only a ONE-WAY dependency
// (its refusal arm flushes the other session and retries, see
// server/game.ts handleGuildBankEscrowRefusal).
//
// Two sessions that each consumed the other's unsettled value can never
// commit in any order. The 2026-09-01 production incident was exactly that
// shape: officer A deposited spider legs and took B's venom glands, B
// deposited the venom glands and took A's spider legs, all inside one autosave
// window. Each replay was short on the key the other held, the retry bound
// rolled both back, both were disconnected as "taken over", and the
// per-session reverts of an already-consumed deposit clamped on the live book
// and left a PHANTOM stack that rolled back every officer who withdrew it
// until the realm restarted. The design note that only ladder rungs could
// deadlock was true for ONE fungible (gold: one of two nets is always
// non-negative); it is false as soon as two item identities are involved.
//
// Refusing the consume HERE, at the dispatch boundary, makes that whole class
// unreachable in ordinary play: a log can then only carry deposits (always
// applicable), removals of settled copies, and rungs bought on a settled
// ladder, so a replay refusal and the rollback behind it become the backstop
// they were meant to be. The cost is one "try again in a moment" notice when
// an officer reaches for a deposit made moments ago, and the host flushes the
// depositor on the spot so the retry lands a round trip later.
//
// Pure: the host hands over the live book snapshot and the OTHER live
// sessions' unflushed logs; nothing here touches a session or the sim.

import {
  type GuildBankOpDelta,
  guildBankDeltaIdentityKey,
  guildBankRungsBought,
} from '../src/sim/guild_bank';
import type { InvSlot } from '../src/sim/types';
import type { GuildBankInfo } from '../src/world_api';

/** The ops the gate judges. Deposits are never gated: a deposit replays onto
 *  any base. The operator purge is not gated either: it removes only a
 *  DORMANT copy the deposit pipe refuses, which can only be durable. */
export const GUILD_BANK_GATED_OPS = ['withdraw', 'withdraw_gold', 'buy_slots'] as const;
export type GuildBankGatedOp = (typeof GUILD_BANK_GATED_OPS)[number];

export function isGuildBankGatedOp(op: string): op is GuildBankGatedOp {
  return (GUILD_BANK_GATED_OPS as readonly string[]).includes(op);
}

/** The client-supplied inputs of one op, as the dispatch site received them
 *  (already type-checked there; the gate re-validates the shapes it reads). */
export interface GuildBankOpRequest {
  readonly slot?: number;
  readonly count?: number;
  readonly amount?: number;
}

export type GuildBankUnsettledKind = 'items' | 'copper' | 'ladder';

/** How long after a holder was flushed the host must NOT flush it again, in
 *  milliseconds. The flush exists so a refused op's retry lands a round trip
 *  later, and one flush per holder buys exactly that; a second one inside
 *  the window would only stack a save behind one still in flight. The bound
 *  it gives: a refusal costs its sender no more than an op-guard token, so
 *  without it one officer refusing at the guard's rate could force a save per
 *  dirty guildmate per refusal. With it, the fan-out is at most one extra save
 *  per holder per window, whoever is refusing and however often. */
export const GUILD_BOOK_FLUSH_COOLDOWN_MS = 1_000;

/** What OTHER sessions' unflushed logs still hold on one guild's book: the
 *  part of the live book durable truth may not have when the acting session's
 *  replay runs.
 *
 *  Summed PER SESSION, positives only. A commit is atomic per session, so the
 *  worst durable base for the acting replay is every net-REMOVING holder
 *  already committed (durable lowered) and every net-DEPOSITING holder not
 *  yet committed (its copies still unsettled): `live - sum over holders of
 *  max(0, holder's net)`. Netting one holder's withdrawal against another
 *  holder's deposit would hide the deposit (holder C's withdraw of 10 cancels
 *  holder B's deposit of 10, and the acting officer takes B's copies ungated),
 *  which is the same two-identity cycle the gate exists to refuse, one officer
 *  removed. */
export interface UnsettledGuildBook {
  /** Per identity key (the escrow replay's three-dimensional key): the sum
   *  over holders of each holder's POSITIVE net copies (deposits minus its own
   *  removals, floored at zero). */
  readonly items: ReadonlyMap<string, number>;
  /** The sum over holders of each holder's POSITIVE net treasury copper the
   *  replay would MOVE. open_bank is excluded (rung 0 is purse-paid and the
   *  applier never moves it), buy_slots is included (its charge left the
   *  treasury). */
  readonly copper: number;
  /** True while any slot op is outstanding: a rung replays only onto the exact
   *  ladder position its witness names, so a rung bought on top of an
   *  unsettled one can never apply first. */
  readonly ladder: boolean;
}

export function unsettledGuildBook(
  logs: Iterable<readonly GuildBankOpDelta[]>,
): UnsettledGuildBook {
  const items = new Map<string, number>();
  let copper = 0;
  let ladder = false;
  for (const log of logs) {
    // One holder's own net, keyed like the replay; only its positive part
    // joins the total (see the interface note).
    const own = new Map<string, number>();
    let ownCopper = 0;
    for (const d of log) {
      if (d.op === 'open_bank' || d.op === 'buy_slots') {
        ladder = true;
        if (d.op === 'buy_slots') ownCopper += Number(d.copperDelta) || 0;
        continue;
      }
      if (d.op === 'deposit_gold' || d.op === 'withdraw_gold') {
        ownCopper += Number(d.copperDelta) || 0;
        continue;
      }
      if (typeof d.itemId !== 'string' || d.itemId === '') continue;
      const count = Math.max(0, Math.floor(Number(d.count)) || 0);
      if (count === 0) continue;
      const key = guildBankDeltaIdentityKey(d);
      own.set(key, (own.get(key) ?? 0) + (d.op === 'deposit' ? count : -count));
    }
    for (const [key, net] of own) {
      if (net > 0) items.set(key, (items.get(key) ?? 0) + net);
    }
    if (ownCopper > 0) copper += ownCopper;
  }
  return { items, copper, ladder };
}

/** The identity the replay would match this slot's copies on. */
function slotIdentityKey(slot: InvSlot): string {
  return guildBankDeltaIdentityKey({
    itemId: slot.itemId,
    instance: slot.instance ?? null,
    craftedRecipeId: slot.craftedRecipeId ?? null,
  });
}

/** Why the op must be refused, or null when it may run. `live` is the acting
 *  player's book snapshot (guildBankInfoFor); `unsettled` aggregates every
 *  OTHER live session's unflushed log for the same guild. A shape the sim
 *  would refuse anyway (a bad slot, a non-positive amount) passes through
 *  unjudged so the sim's own refusal and wording stay authoritative. */
export function guildBankUnsettledRefusal(
  op: GuildBankGatedOp,
  request: GuildBankOpRequest,
  live: GuildBankInfo,
  unsettled: UnsettledGuildBook,
): GuildBankUnsettledKind | null {
  if (op === 'withdraw') {
    const slot = Number.isInteger(request.slot) ? live.slots[request.slot as number] : undefined;
    if (!slot) return null;
    // An instanced stack moves whole; a plain stack moves the asked count or,
    // with none asked, the whole stack (src/sim/bank.ts moveBetweenContainers).
    const want = slot.instance
      ? slot.count
      : request.count === undefined
        ? slot.count
        : Math.floor(request.count);
    if (!(want > 0)) return null;
    const key = slotIdentityKey(slot);
    const others = unsettled.items.get(key) ?? 0;
    // Others' net REMOVALS only lower the live count, which the sim already
    // bounds the withdraw by; only their net deposits are copies durable truth
    // lacks.
    if (others <= 0) return null;
    let held = 0;
    for (const s of live.slots) if (slotIdentityKey(s) === key) held += s.count;
    return want > held - others ? 'items' : null;
  }
  if (op === 'withdraw_gold') {
    const amount = Math.floor(Number(request.amount));
    if (!(amount > 0) || unsettled.copper <= 0) return null;
    return amount > live.treasury - unsettled.copper ? 'copper' : null;
  }
  // buy_slots: the ladder is strictly ordered, so ANY outstanding rung blocks
  // the next; rung 0 (open_bank) is purse-paid and moves no treasury copper,
  // rungs 1+ charge the treasury the table price and answer to the copper rule.
  if (unsettled.ladder) return 'ladder';
  if (guildBankRungsBought(live.purchasedSlots) === 0 || unsettled.copper <= 0) return null;
  const price = live.nextExpansionPrice ?? 0;
  return price > live.treasury - unsettled.copper ? 'copper' : null;
}

/** The slice of a live session the holder selection reads (structural, so
 *  GameServer's ClientSession satisfies it without the type dragging the
 *  whole class in). */
export interface GuildBookHolderSession {
  readonly escrowQuarantined: boolean;
  readonly left: boolean;
  readonly dirtyGuildBanks: ReadonlyMap<number, number>;
}

/** Sessions other than `except` whose unflushed log still holds work on this
 *  guild's book. A quarantined session is never a holder: its work was undone
 *  on the live book the moment it was quarantined. A LEAVING session's work is
 *  still on the live book until its leave flush commits, so the gate counts it
 *  (`includeLeaving: true`); the escrow refusal arm does not, because a
 *  departing session is neither one to wait on nor one to flush again. */
export function guildBookHolders<S extends GuildBookHolderSession>(
  sessions: Iterable<S>,
  guildId: number,
  except: S,
  opts: { readonly includeLeaving: boolean },
): S[] {
  const holders: S[] = [];
  for (const s of sessions) {
    if (s === except || s.escrowQuarantined) continue;
    if (s.left && !opts.includeLeaving) continue;
    if (s.dirtyGuildBanks.has(guildId)) holders.push(s);
  }
  return holders;
}

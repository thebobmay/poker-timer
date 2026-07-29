import { describe, expect, it } from 'vitest';
import { deriveClock, formatClock, formatElapsed, roundNumbers } from './clock.js';
import { chipAverage, computePayouts, playersRemaining, prizePool, rebuyPeriodOpen, roundUpTo, totalChips } from './derived.js';
import { applyMoves, idealTableCount, mergeTables, occupants, randomizeSeating, rebalanceKind, removeFromTables, shuffle, suggestSeating } from './seating.js';
import type { Table } from '../types.js';
import type { ClockState, Level, PrizeStructure, Tournament } from '../types.js';

const lvl = (sb: number, bb: number, ante = 0, dur = 20, isBreak = false): Level => ({
  smallBlind: sb, bigBlind: bb, ante, durationMins: dur, isBreak,
});

describe('clock', () => {
  it('derives paused clock without change', () => {
    const c: ClockState = { levelIndex: 2, running: false, levelRemainingMs: 5000, totalElapsedMs: 10000, anchorEpochMs: 1000 };
    const live = deriveClock(c, 999999);
    expect(live.remainingMs).toBe(5000);
    expect(live.totalElapsedMs).toBe(10000);
  });

  it('derives running clock by elapsed since anchor', () => {
    const c: ClockState = { levelIndex: 0, running: true, levelRemainingMs: 5000, totalElapsedMs: 10000, anchorEpochMs: 1000 };
    const live = deriveClock(c, 3000); // 2000ms elapsed
    expect(live.remainingMs).toBe(3000);
    expect(live.totalElapsedMs).toBe(12000);
  });

  it('clamps remaining at zero', () => {
    const c: ClockState = { levelIndex: 0, running: true, levelRemainingMs: 1000, totalElapsedMs: 0, anchorEpochMs: 0 };
    expect(deriveClock(c, 99999).remainingMs).toBe(0);
  });

  it('formats clock and elapsed', () => {
    expect(formatClock(59_000)).toBe('00:59');
    expect(formatClock(3_600_000)).toBe('1:00:00');
    expect(formatElapsed(37_000)).toBe('00:00:37');
  });

  it('numbers rounds skipping breaks', () => {
    const levels = [lvl(25, 50), lvl(50, 100), lvl(0, 0, 0, 10, true), lvl(75, 150)];
    expect(roundNumbers(levels)).toEqual([1, 2, null, 3]);
  });
});

describe('derived', () => {
  const stakes = { buyInCash: 20, buyInChips: 2000, rebuyCash: 20, rebuyChips: 2000, addOnCash: 10, addOnChips: 1000, addOnsEnabled: true, maxAddOns: 0, maxRebuys: 0 };
  const t = (
    players: Tournament['players'],
    anon: number | null = null,
    accounting: { entries?: number; rebuys?: number; addOns?: number } = {},
  ): Tournament => ({
    id: 'x', name: 't', blindStructureId: null, prizeStructureId: null, stakes, anonymousCount: anon,
    anonEntries: accounting.entries ?? 0, anonRebuys: accounting.rebuys ?? 0, anonAddOns: accounting.addOns ?? 0,
    players, clock: { levelIndex: 0, running: false, levelRemainingMs: 0, totalElapsedMs: 0, anchorEpochMs: 0 },
    seating: { maxPerTable: 9, tables: [] },
  });
  let pid = 0;
  // Count-based player: chips/cash derive from rebuys/add-ons × stakes.
  const p = (rebuys = 0, addOns = 0, status: 'active' | 'out' = 'active') => ({
    id: 'p' + pid++, name: 'X', status, rebuys, addOns,
  });

  it('total chips = each player buy-in + rebuys + add-ons', () => {
    expect(totalChips(t([p(), p()]))).toBe(4000); // 2 × 2000
    expect(totalChips(t([p(1), p()]))).toBe(6000); // one rebuy adds a stack
    expect(totalChips(t([p(0, 1), p()]))).toBe(5000); // one add-on adds 1000
  });

  it('chip average = total ÷ players remaining', () => {
    expect(chipAverage(t([p(), p()]))).toBe(2000);
  });

  it('chip average is N/A with no players', () => {
    expect(chipAverage(t([]))).toBeNull();
  });

  it('knockout keeps chips in play; rebuy adds a stack (the 25k→30k bug)', () => {
    const five = [p(), p(), p(), p(), p()];
    expect(totalChips(t(five))).toBe(10000); // 5 × 2000
    const oneOut = [p(), p(), p(), p(), p(0, 0, 'out')];
    expect(totalChips(t(oneOut))).toBe(10000); // knockout doesn't reduce total
    const oneRebought = [p(), p(), p(), p(), p(1)];
    expect(totalChips(t(oneRebought))).toBe(12000); // rebuy adds one stack
  });

  it('prize pool sums every player incl. knocked-out, plus rebuys/add-ons', () => {
    expect(prizePool(t([p(), p(0, 0, 'out')]))).toBe(40); // 2 × $20
    expect(prizePool(t([p(1), p()]))).toBe(60); // 2 buy-ins + 1 rebuy
  });

  it('players remaining counts only active', () => {
    expect(playersRemaining(t([p(), p(0, 0, 'out')]))).toBe(1);
  });

  it('rebuy period open through the marked last-rebuy level', () => {
    const lvls = [lvl(25, 50), lvl(50, 100), { ...lvl(0, 0, 0, 10, true), lastRebuy: true }, lvl(75, 150)];
    expect(rebuyPeriodOpen(lvls, 0)).toBe(true);
    expect(rebuyPeriodOpen(lvls, 2)).toBe(true); // at the marked level → still open
    expect(rebuyPeriodOpen(lvls, 3)).toBe(false); // past it → closed
    expect(rebuyPeriodOpen([lvl(25, 50)], 5)).toBe(true); // none marked → always open
  });

  it('respects anonymous count for average via stake chips', () => {
    // 10 players left, 12 entries × 2000 chips = 24000 → avg 2400
    expect(chipAverage(t([], 10, { entries: 12 }))).toBe(2400);
  });

  it('computes anonymous prize pool from entries/rebuys/add-ons × stakes', () => {
    // 12 entries×$20 + 5 rebuys×$20 + 8 add-ons×$10 = 240 + 100 + 80 = 420
    const at = t([], 9, { entries: 12, rebuys: 5, addOns: 8 });
    expect(prizePool(at)).toBe(420);
    // chips: 12×2000 + 5×2000 + 8×1000 = 24000 + 10000 + 8000 = 42000
    expect(totalChips(at)).toBe(42000);
  });

  it('rounds up percentage payouts to integers', () => {
    const prize: PrizeStructure = { id: 'p', name: 'p', mode: 'percentage', places: 3, values: [50, 30, 20], roundTo: 1 };
    expect(computePayouts(prize, 133)).toEqual([67, 40, 27]); // ceil(66.5), ceil(39.9), ceil(26.6)
  });

  it('cash payouts pass through', () => {
    const prize: PrizeStructure = { id: 'p', name: 'p', mode: 'cash', places: 2, values: [50, 35], roundTo: 1 };
    expect(computePayouts(prize, 999)).toEqual([50, 35]);
  });

  it('roundUpTo rounds to step', () => {
    expect(roundUpTo(41, 5)).toBe(45);
    expect(roundUpTo(40, 5)).toBe(40);
  });
});

describe('seating', () => {
  const seq = (nums: number[]): (() => number) => {
    let i = 0;
    return () => nums[i++ % nums.length];
  };

  it('computes ideal table count', () => {
    expect(idealTableCount(0, 9)).toBe(0);
    expect(idealTableCount(9, 9)).toBe(1);
    expect(idealTableCount(10, 9)).toBe(2);
    expect(idealTableCount(19, 9)).toBe(3);
  });

  it('shuffle keeps all items', () => {
    const out = shuffle([1, 2, 3, 4, 5], seq([0.1, 0.5, 0.9, 0.3]));
    expect(out.slice().sort()).toEqual([1, 2, 3, 4, 5]);
  });

  const seatsOf = (ids: Array<string | null>, size: number): Array<string | null> => {
    const out = ids.slice();
    while (out.length < size) out.push(null);
    return out;
  };

  it('randomize distributes evenly across tables with sized seats', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const tables = randomizeSeating(ids, 9);
    expect(tables.length).toBe(2);
    expect(tables.map((t) => t.seats.length)).toEqual([9, 9]); // each padded to max
    const sizes = tables.map((t) => occupants(t).length).sort();
    expect(sizes).toEqual([5, 5]);
    expect(tables.flatMap(occupants).sort()).toEqual(ids.slice().sort());
  });

  it('merge breaks the emptiest table and keeps balance without exceeding max', () => {
    const tables: Table[] = [
      { id: 1, seats: seatsOf(['a', 'b', 'c', 'd'], 9) },
      { id: 2, seats: seatsOf(['e', 'f', 'g', 'h'], 9) },
      { id: 3, seats: seatsOf(['i', 'j'], 9) }, // emptiest -> broken up
    ];
    const res = mergeTables(tables, 9);
    expect(res.ok).toBe(true);
    expect(res.tables.length).toBe(2);
    expect(res.tables.flatMap(occupants).sort()).toEqual('abcdefghij'.split('').sort());
    expect(res.tables.every((t) => occupants(t).length <= 9)).toBe(true);
  });

  it('existing players stay put; movers only fill vacant seats', () => {
    const tables: Table[] = [
      { id: 1, seats: ['a', 'b', null, null] }, // 2 vacancies
      { id: 2, seats: ['c', null, null, null] }, // 3 vacancies
      { id: 3, seats: ['x', 'y', null, null] }, // emptiest of the fuller ones? tie-break
    ];
    // table 2 is emptiest (1 player) -> broken; c moves into a vacancy elsewhere.
    const res = mergeTables(tables, 4, seq([0.99, 0.99, 0.99, 0.99]));
    expect(res.ok).toBe(true);
    // a and b keep seats 1,2 on their table; x,y keep seats 1,2 on theirs.
    const t1 = res.tables.find((t) => t.seats[0] === 'a')!;
    expect([t1.seats[0], t1.seats[1]]).toEqual(['a', 'b']);
    const t3 = res.tables.find((t) => t.seats[0] === 'x')!;
    expect([t3.seats[0], t3.seats[1]]).toEqual(['x', 'y']);
    expect(res.tables.flatMap(occupants).sort()).toEqual(['a', 'b', 'c', 'x', 'y']);
  });

  it('refuses a merge that would exceed max per table', () => {
    const tables: Table[] = [
      { id: 1, seats: ['a', 'b', 'c'] }, // full (max 3)
      { id: 2, seats: ['d', 'e', 'f'] }, // full
      { id: 3, seats: ['g', 'h'] },      // 2 -> nowhere to put them
    ];
    const res = mergeTables(tables, 3);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/don't fit/);
    expect(res.tables).toBe(tables); // unchanged
  });

  it('vacates a player seat on removal (keeps the seat as empty)', () => {
    const tables: Table[] = [{ id: 1, seats: ['a', 'b'] }, { id: 2, seats: ['c'] }];
    expect(removeFromTables(tables, 'b')).toEqual([{ id: 1, seats: ['a', null] }, { id: 2, seats: ['c'] }]);
  });

  it('rebalanceKind detects break, balance, or none', () => {
    const t3: Table[] = [
      { id: 1, seats: seatsOf(['a', 'b', 'c', 'd', 'e'], 9) },
      { id: 2, seats: seatsOf(['f', 'g', 'h', 'i', 'j'], 9) },
      { id: 3, seats: seatsOf(['k', 'l'], 9) },
    ];
    expect(rebalanceKind(t3, 9)).toBe('break'); // 12 fit on 2 tables
    const t2uneven: Table[] = [
      { id: 1, seats: seatsOf(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 9) },
      { id: 2, seats: seatsOf(['i', 'j', 'k', 'l', 'm'], 9) },
    ];
    expect(rebalanceKind(t2uneven, 9)).toBe('balance'); // spread 3
    const t2even: Table[] = [
      { id: 1, seats: seatsOf(['a', 'b', 'c', 'd', 'e'], 9) },
      { id: 2, seats: seatsOf(['f', 'g', 'h', 'i', 'j'], 9) },
    ];
    expect(rebalanceKind(t2even, 9)).toBeNull();
  });

  it('suggestSeating proposes a break of the shortest table', () => {
    const tables: Table[] = [
      { id: 1, seats: seatsOf(['a', 'b', 'c', 'd', 'e'], 9) },
      { id: 2, seats: seatsOf(['f', 'g', 'h', 'i', 'j'], 9) },
      { id: 3, seats: seatsOf(['k', 'l'], 9) },
    ];
    const sug = suggestSeating(tables, 9, seq([0.1, 0.4, 0.7, 0.2]))!;
    expect(sug.kind).toBe('break');
    expect(sug.breakTableId).toBe(3);
    expect(sug.moves.length).toBe(2);
    expect(sug.moves.every((m) => m.fromTableId === 3)).toBe(true);
    expect(sug.moves.map((m) => m.playerId).sort()).toEqual(['k', 'l']);
    expect(sug.moves.every((m) => m.toTableId === 1 || m.toTableId === 2)).toBe(true);
  });

  it('suggestSeating proposes one balancing move fullest -> shortest', () => {
    const tables: Table[] = [
      { id: 1, seats: seatsOf(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 9) },
      { id: 2, seats: seatsOf(['i', 'j', 'k', 'l', 'm'], 9) },
    ];
    const sug = suggestSeating(tables, 9, seq([0, 0]))!;
    expect(sug.kind).toBe('balance');
    expect(sug.moves.length).toBe(1);
    expect(sug.moves[0].fromTableId).toBe(1);
    expect(sug.moves[0].toTableId).toBe(2);
  });

  it('applyMoves relocates a player and drops the emptied table', () => {
    const tables: Table[] = [
      { id: 1, seats: ['a', 'b', null, null] },
      { id: 2, seats: ['c', null, null, null] },
    ];
    const res = applyMoves(tables, [{ playerId: 'c', fromTableId: 2, toTableId: 1, toSeat: 2 }], 4);
    expect(res.ok).toBe(true);
    expect(res.tables.length).toBe(1); // table 2 emptied -> dropped
    expect(occupants(res.tables[0]).sort()).toEqual(['a', 'b', 'c']);
  });

  it('applyMoves refuses stale moves (target seat now taken)', () => {
    const tables: Table[] = [{ id: 1, seats: ['a', 'b'] }, { id: 2, seats: ['c', null] }];
    const res = applyMoves(tables, [{ playerId: 'c', fromTableId: 2, toTableId: 1, toSeat: 0 }], 2);
    expect(res.ok).toBe(false);
    expect(res.tables).toBe(tables);
  });
});

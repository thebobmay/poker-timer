// Pure seating logic: randomize, rebalance, merge. No I/O, no globals — takes
// player ids in and returns Table[]. RNG is injectable for deterministic tests.
// Text-based seating in v1 (CLAUDE.md §6).
//
// Tables use fixed seats: `seats[i]` is the occupant of seat i+1, or null if
// vacant. This lets a merge keep existing players in place while moving players
// fill only the vacant spots (randomly).

import type { SeatMove, Table } from '../types.js';

export type Rng = () => number; // returns [0, 1)

/** Ideal number of tables for a player count at a given max-per-table. */
export function idealTableCount(playerCount: number, maxPerTable: number): number {
  if (playerCount <= 0) return 0;
  const cap = Math.max(1, maxPerTable);
  return Math.max(1, Math.ceil(playerCount / cap));
}

/** Fisher–Yates shuffle (pure: returns a new array). */
export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Occupied (non-null) ids at a table. */
export function occupants(t: Table): string[] {
  return t.seats.filter((s): s is string => s !== null);
}

/** Pad/trim a seat array to exactly `size` seats (vacancies = null). */
function toSize(seats: Array<string | null>, size: number): Array<string | null> {
  const out = seats.slice(0, size);
  while (out.length < size) out.push(null);
  return out;
}

/** Build tables from buckets of ids, packed into the first seats, padded to `size`. */
function pack(buckets: string[][], size: number): Table[] {
  return buckets.map((ids, i) => ({ id: i + 1, seats: toSize(ids.slice(), size) }));
}

/** Fresh random seating for the given players (each table sized to maxPerTable). */
export function randomizeSeating(playerIds: string[], maxPerTable: number, rng: Rng = Math.random): Table[] {
  const count = idealTableCount(playerIds.length, maxPerTable);
  if (count === 0) return [];
  const shuffled = shuffle(playerIds, rng);
  const buckets: string[][] = Array.from({ length: count }, () => []);
  shuffled.forEach((id, i) => buckets[i % count].push(id));
  return pack(buckets, Math.max(1, maxPerTable));
}

/**
 * Re-balance existing tables by re-randomizing everyone across the ideal number
 * of tables. (v1 keeps this simple; a future version could minimize movement.)
 */
export function rebalanceSeating(tables: Table[], maxPerTable: number, rng: Rng = Math.random): Table[] {
  const ids = tables.flatMap(occupants);
  return randomizeSeating(ids, maxPerTable, rng);
}

export interface MergeResult {
  ok: boolean;
  tables: Table[];
  /** Set when ok === false: why the merge was refused. */
  reason?: string;
}

/**
 * Merge: break the emptiest table and reseat its players into the vacant seats
 * of the remaining tables. Rules:
 *  - Never exceed max per table. If everyone can't fit into (tables − 1) tables,
 *    refuse the merge and return a reason (the caller warns; nothing changes).
 *  - Existing players stay in their exact seats.
 *  - Moving players fill only vacant seats, at random positions, balanced across
 *    the remaining tables (least-full first).
 */
export function mergeTables(tables: Table[], maxPerTable: number, rng: Rng = Math.random): MergeResult {
  const cap = Math.max(1, maxPerTable);
  const nonEmpty = tables.filter((t) => occupants(t).length > 0);
  if (nonEmpty.length <= 1) return { ok: true, tables: renumber(nonEmpty, cap) };

  const totalPlayers = nonEmpty.reduce((sum, t) => sum + occupants(t).length, 0);
  // Feasible iff everyone fits into one fewer table without exceeding the cap.
  if (totalPlayers > (nonEmpty.length - 1) * cap) {
    const fewer = nonEmpty.length - 1;
    return {
      ok: false,
      tables,
      reason: `Can't merge: ${totalPlayers} players don't fit on ${fewer} table${fewer === 1 ? '' : 's'} of ${cap}. Raise max per table or knock players out first.`,
    };
  }

  // Break the emptiest table (fewest occupants); keep the rest exactly as they are.
  const sorted = nonEmpty.slice().sort((a, b) => occupants(a).length - occupants(b).length);
  const broken = sorted[0];
  const remaining = sorted.slice(1).map((t) => ({ id: t.id, seats: toSize(t.seats.slice(), cap) }));
  const movers = shuffle(occupants(broken), rng); // random order of who moves

  for (const pid of movers) {
    // Assign to the least-full remaining table that has a vacancy.
    remaining.sort((a, b) => occupants(a).length - occupants(b).length);
    const target = remaining.find((t) => occupants(t).length < cap);
    if (!target) break; // shouldn't happen given the feasibility check
    // Random vacant seat at that table.
    const vacant: number[] = [];
    target.seats.forEach((s, i) => { if (s === null) vacant.push(i); });
    const seatIdx = vacant[Math.floor(rng() * vacant.length)];
    target.seats[seatIdx] = pid;
  }
  return { ok: true, tables: renumber(remaining, cap) };
}

/** Renumber tables 1..n by current order, normalizing seat length. */
function renumber(tables: Table[], size: number): Table[] {
  return tables.map((t, i) => ({ id: i + 1, seats: toSize(t.seats.slice(), size) }));
}

/** Vacate a player's seat in all tables (e.g. on knockout/removal). */
export function removeFromTables(tables: Table[], playerId: string): Table[] {
  return tables.map((t) => ({ ...t, seats: t.seats.map((s) => (s === playerId ? null : s)) }));
}

// ---------------------------------------------------------------------------
// Rebalancing suggestions (director confirms; nothing moves until applied).
// ---------------------------------------------------------------------------

export interface SeatingSuggestion {
  kind: 'break' | 'balance';
  /** The table being emptied (break only). */
  breakTableId?: number;
  moves: SeatMove[];
}

/**
 * Deterministic check for whether seating needs attention (no randomness, safe
 * for badges): 'break' if the field fits on fewer tables, else 'balance' if
 * table sizes differ by ≥ 2, else null.
 */
export function rebalanceKind(tables: Table[], maxPerTable: number): 'break' | 'balance' | null {
  const cap = Math.max(1, maxPerTable);
  const ne = tables.filter((t) => occupants(t).length > 0);
  if (ne.length <= 1) return null;
  const total = ne.reduce((s, t) => s + occupants(t).length, 0);
  if (idealTableCount(total, cap) < ne.length) return 'break';
  const sizes = ne.map((t) => occupants(t).length);
  if (Math.max(...sizes) - Math.min(...sizes) >= 2) return 'balance';
  return null;
}

/**
 * Propose a rebalancing. Break: empty the shortest table, moving its players to
 * random vacant seats on the least-full remaining tables. Balance: move ONE
 * random player from the fullest table to a random vacant seat on the shortest
 * (repeat via re-suggest after each confirm). Returns null when nothing's needed.
 */
export function suggestSeating(tables: Table[], maxPerTable: number, rng: Rng = Math.random): SeatingSuggestion | null {
  const cap = Math.max(1, maxPerTable);
  const kind = rebalanceKind(tables, cap);
  if (!kind) return null;
  const ne = tables.filter((t) => occupants(t).length > 0);

  if (kind === 'break') {
    const sorted = ne.slice().sort((a, b) => occupants(a).length - occupants(b).length);
    const broken = sorted[0];
    const remaining = sorted.slice(1).map((t) => ({ id: t.id, seats: toSize(t.seats.slice(), cap) }));
    const movers = shuffle(occupants(broken), rng);
    const moves: SeatMove[] = [];
    for (const pid of movers) {
      remaining.sort((a, b) => occupants(a as Table).length - occupants(b as Table).length);
      const target = remaining.find((t) => occupants(t as Table).length < cap);
      if (!target) break;
      const seatIdx = randomVacantSeat(target.seats, rng);
      if (seatIdx < 0) break;
      target.seats[seatIdx] = pid; // simulate so balance stays correct across movers
      moves.push({ playerId: pid, fromTableId: broken.id, toTableId: target.id, toSeat: seatIdx });
    }
    return { kind: 'break', breakTableId: broken.id, moves };
  }

  // balance: one player from fullest -> shortest
  const sorted = ne.slice().sort((a, b) => occupants(b).length - occupants(a).length);
  const fullest = sorted[0];
  const shortest = sorted[sorted.length - 1];
  const fullOcc = occupants(fullest);
  const pid = fullOcc[Math.floor(rng() * fullOcc.length)];
  const seatIdx = randomVacantSeat(toSize(shortest.seats.slice(), cap), rng);
  if (seatIdx < 0) return null;
  return { kind: 'balance', moves: [{ playerId: pid, fromTableId: fullest.id, toTableId: shortest.id, toSeat: seatIdx }] };
}

function randomVacantSeat(seats: Array<string | null>, rng: Rng): number {
  const vacant: number[] = [];
  seats.forEach((s, i) => { if (s === null) vacant.push(i); });
  if (vacant.length === 0) return -1;
  return vacant[Math.floor(rng() * vacant.length)];
}

/**
 * Apply a confirmed set of moves, re-validating against current seating so a
 * stray knockout can't corrupt it. Drops emptied tables and renumbers.
 */
export function applyMoves(tables: Table[], moves: SeatMove[], maxPerTable: number): MergeResult {
  const cap = Math.max(1, maxPerTable);
  const work = tables.map((t) => ({ id: t.id, seats: toSize(t.seats.slice(), cap) }));
  const seatOf = (pid: string) => {
    for (const t of work) {
      const i = t.seats.indexOf(pid);
      if (i >= 0) return { t, i };
    }
    return null;
  };
  for (const m of moves) {
    const cur = seatOf(m.playerId);
    const target = work.find((t) => t.id === m.toTableId);
    const stale: MergeResult = { ok: false, tables, reason: 'Seating changed — re-checking the suggestion.' };
    if (!cur || !target) return stale;
    if (m.toSeat < 0 || m.toSeat >= cap) return stale;
    if (target.seats[m.toSeat] !== null && target.seats[m.toSeat] !== m.playerId) return stale;
    cur.t.seats[cur.i] = null;
    target.seats[m.toSeat] = m.playerId;
  }
  return { ok: true, tables: renumber(work.filter((t) => occupants(t as Table).length > 0), cap) };
}

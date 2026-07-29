// Pure derived-value calculations. Never stored — always computed from state so
// the display and phone can't disagree. See CLAUDE.md §5.

import type { Level, PrizeStructure, Stakes, Tournament, TournamentPlayer } from '../types.js';

export function activePlayers(t: Tournament): TournamentPlayer[] {
  return t.players.filter((p) => p.status === 'active');
}

/** Number of players still in (respects anonymous mode). */
export function playersRemaining(t: Tournament): number {
  if (t.anonymousCount != null) return t.anonymousCount;
  return activePlayers(t).length;
}

/** Chips a single player has bought into the tournament (buy-in + rebuys + add-ons). */
export function playerChips(p: TournamentPlayer, s: Stakes): number {
  return s.buyInChips + p.rebuys * s.rebuyChips + p.addOns * s.addOnChips;
}

/** Cash a single player has contributed (buy-in + rebuys + add-ons). */
export function playerCash(p: TournamentPlayer, s: Stakes): number {
  return s.buyInCash + p.rebuys * s.rebuyCash + p.addOns * s.addOnCash;
}

/**
 * Total chips in play. Chips never leave the tournament — a knockout transfers
 * them to the survivors — so this sums EVERY player (active and out), or in
 * anonymous mode derives from the aggregate counts.
 */
export function totalChips(t: Tournament): number {
  if (t.anonymousCount != null) {
    const s = t.stakes;
    return t.anonEntries * s.buyInChips + t.anonRebuys * s.rebuyChips + t.anonAddOns * s.addOnChips;
  }
  return t.players.reduce((sum, p) => sum + playerChips(p, t.stakes), 0);
}

/**
 * Chip average = total chips per remaining player. Returns null when there are
 * no players (display shows N/A). Standard poker chip average — total chips ÷
 * players — confirmed by the reference (400 chips / 2 = 200).
 */
export function chipAverage(t: Tournament): number | null {
  const players = playersRemaining(t);
  if (players <= 0) return null;
  return Math.round(totalChips(t) / players);
}

/** Prize pool = every player's buy-in + rebuys + add-ons (busted players still paid). */
export function prizePool(t: Tournament): number {
  if (t.anonymousCount != null) {
    const s = t.stakes;
    return t.anonEntries * s.buyInCash + t.anonRebuys * s.rebuyCash + t.anonAddOns * s.addOnCash;
  }
  return t.players.reduce((sum, p) => sum + playerCash(p, t.stakes), 0);
}

/**
 * Whether the rebuy/add-on period is still open. Open through (and including)
 * the level marked `lastRebuy`; closed once the clock has advanced past it. If
 * no level is marked, rebuys are always open.
 */
export function rebuyPeriodOpen(levels: Level[], levelIndex: number): boolean {
  const lastIdx = levels.findIndex((l) => l.lastRebuy);
  if (lastIdx < 0) return true;
  return levelIndex <= lastIdx;
}

/** Round up to the nearest `roundTo` dollars (roundTo <= 1 means whole dollars). */
export function roundUpTo(amount: number, roundTo: number): number {
  const step = roundTo && roundTo > 1 ? roundTo : 1;
  return Math.ceil(amount / step) * step;
}

/**
 * Compute integer payouts for each paying place from the prize pool.
 * Percentage mode: roundUp(pool * pct/100). Cash mode: the entered amounts
 * (still rounded to `roundTo`). Always integers.
 */
export function computePayouts(prize: PrizeStructure | null, pool: number): number[] {
  if (!prize) return [];
  const places = Math.max(0, prize.places);
  const out: number[] = [];
  for (let i = 0; i < places; i++) {
    const v = prize.values[i] ?? 0;
    const raw = prize.mode === 'percentage' ? (pool * v) / 100 : v;
    out.push(roundUpTo(raw, prize.roundTo));
  }
  return out;
}

/** Sum of the entered prize values, for the "Used X of Y" validity hint. */
export function prizeUsed(prize: PrizeStructure): number {
  return prize.values.slice(0, prize.places).reduce((s, v) => s + (v || 0), 0);
}

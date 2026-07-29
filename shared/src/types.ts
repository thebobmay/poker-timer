// Core domain types shared by client and server. These are the single source of
// truth for the shape of tournament data. Keep them serialization-friendly
// (plain JSON: no Date objects, no class instances) so the whole state can be
// broadcast over WebSocket and persisted to disk unchanged.

/** A single level in a blind structure. Break rows only use `durationMins`. */
export interface Level {
  smallBlind: number;
  bigBlind: number;
  ante: number;
  durationMins: number;
  isBreak: boolean;
  /** Marks the last level during which rebuys/add-ons are allowed (only one per structure). */
  lastRebuy?: boolean;
}

/** A named, reusable blind structure. */
export interface BlindStructure {
  id: string;
  name: string;
  levels: Level[];
}

export type PrizeMode = 'cash' | 'percentage';

/** A named, reusable prize/payout structure. */
export interface PrizeStructure {
  id: string;
  name: string;
  mode: PrizeMode;
  /** Number of paying places. `values.length` should track this. */
  places: number;
  /** Per-place value: dollars (cash mode) or percent points (percentage mode). */
  values: number[];
  /** Round payouts to the nearest this many dollars (0/1 = whole dollars). */
  roundTo: number;
}

/** A reusable player in the saved roster (for quick re-add across events). */
export interface SavedPlayer {
  id: string;
  name: string;
}

/**
 * Tournament-level buy-in / rebuy / add-on amounts. Used to default the Players
 * actions and to compute the prize pool + chips in play — especially in
 * anonymous (count-only) mode, where there are no per-player records.
 */
export interface Stakes {
  buyInCash: number;
  buyInChips: number;
  rebuyCash: number;
  rebuyChips: number;
  addOnCash: number;
  addOnChips: number;
  /** Whether add-ons are offered at all. */
  addOnsEnabled: boolean;
  /** Per-player add-on cap (0 = unlimited). */
  maxAddOns: number;
  /** Per-player rebuy cap (0 = unlimited). */
  maxRebuys: number;
}

export type PlayerStatus = 'active' | 'out';

/**
 * A player in the live tournament. Chips and cash are DERIVED from the buy-in +
 * rebuy/add-on counts × the tournament stakes (see domain/derived.ts) — not a
 * mutable stack — so a knockout doesn't remove chips from play (they went to the
 * survivors) and a rebuy adds a fresh stack.
 */
export interface TournamentPlayer {
  id: string;
  name: string;
  /** Set when added from the saved roster; used to prevent adding the same person twice. */
  savedPlayerId?: string;
  status: PlayerStatus;
  /** Number of rebuys (editable to correct mistakes). */
  rebuys: number;
  /** Number of add-ons (editable to correct mistakes). */
  addOns: number;
}

/**
 * One table in the seating chart. `seats[i]` is the player at seat i+1, or null
 * for a vacant seat. Fixed positions let existing players keep their seat across
 * a merge while moving players fill only the vacant spots.
 */
export interface Table {
  id: number;
  seats: Array<string | null>;
}

export interface SeatingState {
  maxPerTable: number;
  tables: Table[];
}

/** A single proposed player move (used by seating suggestions). */
export interface SeatMove {
  playerId: string;
  fromTableId: number;
  toTableId: number;
  /** Zero-based seat index at the destination table. */
  toSeat: number;
}

/**
 * Server-authoritative clock. Clients derive live values using the anchor +
 * `serverNow` offset model (see CLAUDE.md §4) so TV and phone never drift.
 */
export interface ClockState {
  /** Index into the active blind structure's `levels`. */
  levelIndex: number;
  running: boolean;
  /** Remaining ms in the current level, as of `anchorEpochMs`. */
  levelRemainingMs: number;
  /** Total elapsed ms across the tournament, as of `anchorEpochMs`. */
  totalElapsedMs: number;
  /** Server epoch ms when the two values above were last set. */
  anchorEpochMs: number;
}

/** The live tournament. Addressable by id so a `tournaments` collection can be added later. */
export interface Tournament {
  id: string;
  name: string;
  blindStructureId: string | null;
  prizeStructureId: string | null;
  /** Buy-in / rebuy / add-on amounts (cash + chips). */
  stakes: Stakes;
  /** When set, players are anonymous and only this count of remaining players matters. */
  anonymousCount: number | null;
  /** Anonymous-mode accounting for prize pool + chips (total buy-ins/rebuys/add-ons purchased). */
  anonEntries: number;
  anonRebuys: number;
  anonAddOns: number;
  players: TournamentPlayer[];
  clock: ClockState;
  seating: SeatingState;
}

/** App-level settings that persist across sessions and seed new tournaments. */
export interface AppSettings {
  stakes: Stakes;
}

/** The complete persisted store. */
export interface DB {
  version: number;
  /** Remembered defaults (buy-in/rebuy/add-on cash + chips), independent of any tournament. */
  settings: AppSettings;
  savedPlayers: SavedPlayer[];
  blindStructures: BlindStructure[];
  prizeStructures: PrizeStructure[];
  /** The single active tournament (v1). Structured to become a collection later. */
  tournament: Tournament;
}

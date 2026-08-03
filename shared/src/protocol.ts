// Wire protocol between client and server. All state changes flow through a
// typed `Command` (client -> server). The server replies by broadcasting
// `ServerMessage`s to every connected client. Adding a feature = add a command
// variant here + a handler on the server. This is the extensibility backbone.

import type { BlindStructure, DB, Format, Level, PrizeStructure, SeatMove, Stakes, TournamentPlayer, TournamentSetup } from './types.js';

// ---------------------------------------------------------------------------
// Commands: client -> server
// ---------------------------------------------------------------------------

export type Command =
  // Clock
  | { type: 'clock/start' }
  | { type: 'clock/pause' }
  | { type: 'clock/toggle' }
  | { type: 'clock/setRemainingMs'; ms: number }
  | { type: 'clock/adjustRemainingMs'; deltaMs: number }
  | { type: 'clock/skip'; delta: number } // +1 next level, -1 previous
  | { type: 'clock/goToLevel'; levelIndex: number }
  | { type: 'clock/reset' }
  // Blind structures
  | { type: 'blinds/save'; structure: BlindStructure } // create or update by id
  | { type: 'blinds/delete'; id: string }
  | { type: 'blinds/select'; id: string }
  // Prize structures
  | { type: 'prizes/save'; structure: PrizeStructure }
  | { type: 'prizes/delete'; id: string }
  | { type: 'prizes/select'; id: string }
  // Saved roster
  | { type: 'roster/add'; name: string }
  | { type: 'roster/remove'; id: string }
  // Tournament players
  | { type: 'players/add'; name: string }
  | { type: 'players/addFromRoster'; savedPlayerId: string }
  | { type: 'players/update'; id: string; patch: Partial<Pick<TournamentPlayer, 'name' | 'rebuys' | 'addOns'>> }
  | { type: 'players/knockout'; id: string }
  | { type: 'players/reinstate'; id: string } // undo a knockout (no rebuy counted)
  | { type: 'players/rebuy'; id: string }
  | { type: 'players/addOn'; id: string }
  | { type: 'players/remove'; id: string }
  | { type: 'players/setAnonymousCount'; count: number | null }
  | { type: 'tournament/setStakes'; patch: Partial<Stakes> }
  | { type: 'tournament/setAnonCounts'; patch: { entries?: number; rebuys?: number; addOns?: number } }
  // One-tap player actions for count-only mode (adjust the aggregate counts).
  | { type: 'tournament/anonAction'; action: 'entry' | 'knockout' | 'rebuy' | 'addon' }
  // Seating
  | { type: 'seating/setMaxPerTable'; maxPerTable: number }
  | { type: 'seating/randomize' }
  | { type: 'seating/rebalance' }
  | { type: 'seating/merge' }
  | { type: 'seating/applyMoves'; moves: SeatMove[] }
  | { type: 'seating/clear' }
  // Tournament meta
  | { type: 'tournament/rename'; name: string }
  | { type: 'tournament/reset' }
  // Tournament lifecycle + format
  | { type: 'tournament/createNew'; setupId?: string } // fresh instance (archives current if real)
  | { type: 'tournament/start' } // setup -> running
  | { type: 'tournament/end' } // running -> complete, archives it
  | { type: 'tournament/setFormat'; format: Format }
  // Saved tournament setups (templates)
  | { type: 'setup/save'; setup: TournamentSetup } // create or update by id
  | { type: 'setup/delete'; id: string }
  | { type: 'setup/apply'; id: string }; // load a setup's config into the current tournament

export type CommandType = Command['type'];

// ---------------------------------------------------------------------------
// Messages: server -> client
// ---------------------------------------------------------------------------

/** An audio cue the display client should play. */
export type AudioCue =
  | { kind: 'blinds-up' }
  | { kind: 'break'; minutes: number };

export type ServerMessage =
  | { type: 'state'; db: DB; serverNow: number }
  | { type: 'audio'; cue: AudioCue; serverNow: number }
  | { type: 'error'; message: string };

/** Envelope for client -> server so we can extend with request ids/auth later. */
export interface ClientEnvelope {
  command: Command;
}

// Re-export a couple of types commonly needed alongside the protocol.
export type { Level };

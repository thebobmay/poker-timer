// Authoritative tournament state machine. Holds the DB, applies typed commands,
// drives the server-owned clock, and notifies listeners (broadcast + audio).
// Framework-agnostic: no Express/ws in here.

import {
  applyMoves,
  defaultStakes,
  deriveClock,
  initialClock,
  levelDurationMs,
  mergeTables,
  newId,
  newTournament,
  randomizeSeating,
  rebalanceSeating,
  rebuyPeriodOpen,
  removeFromTables,
  type AudioCue,
  type BlindStructure,
  type Command,
  type DB,
  type Level,
  type PrizeStructure,
  type Tournament,
  type TournamentPlayer,
} from '@poker/shared';
import type { Store } from './persistence.js';

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export interface EngineListeners {
  onBroadcast: () => void;
  onAudio: (cue: AudioCue) => void;
}

export class Engine {
  private db!: DB;
  private timer: NodeJS.Timeout | null = null;
  private lastSnapshotJson = '';

  constructor(private readonly store: Store, private readonly listeners: EngineListeners) {}

  async init(): Promise<void> {
    this.db = await this.store.load();
    this.normalize();
    // On restart, a running clock would have kept counting while we were down.
    // Re-anchor so it resumes cleanly from where it was persisted rather than
    // jumping forward by the downtime.
    const c = this.db.tournament.clock;
    if (c.running) c.anchorEpochMs = this.now();
    this.lastSnapshotJson = JSON.stringify(this.liveDb());
    this.scheduleClock();
  }

  getDB(): DB {
    return this.db;
  }

  /** Backfill fields that older persisted DBs may lack, so derived math is safe. */
  private normalize(): void {
    const t = this.db.tournament;
    if (!t.stakes) t.stakes = defaultStakes();
    this.fillStakeDefaults(t.stakes);
    if (typeof t.anonEntries !== 'number') t.anonEntries = 0;
    if (typeof t.anonRebuys !== 'number') t.anonRebuys = 0;
    if (typeof t.anonAddOns !== 'number') t.anonAddOns = 0;
    // Player model changed to count-based: ensure required fields exist.
    for (const p of t.players) {
      if (typeof p.name !== 'string' || !p.name.trim()) p.name = 'Player';
      if (typeof p.rebuys !== 'number') p.rebuys = 0;
      if (typeof p.addOns !== 'number') p.addOns = 0;
    }
    // Promote per-tournament stakes to a saved app-level default on first upgrade.
    if (!this.db.settings) this.db.settings = { stakes: { ...t.stakes } };
    if (!this.db.settings.stakes) this.db.settings.stakes = { ...t.stakes };
    this.fillStakeDefaults(this.db.settings.stakes);
  }

  private fillStakeDefaults(s: Tournament['stakes']): void {
    const d = defaultStakes();
    if (typeof s.addOnsEnabled !== 'boolean') s.addOnsEnabled = d.addOnsEnabled;
    if (typeof s.maxAddOns !== 'number') s.maxAddOns = d.maxAddOns;
    if (typeof s.maxRebuys !== 'number') s.maxRebuys = d.maxRebuys;
  }

  /** The db with the clock frozen to the current moment (for snapshots + checkpoints). */
  private liveDb(): DB {
    const clock = this.db.tournament.clock;
    const now = this.now();
    const live = deriveClock(clock, now);
    return {
      ...this.db,
      tournament: {
        ...this.db.tournament,
        clock: {
          levelIndex: live.levelIndex,
          running: live.running,
          levelRemainingMs: live.remainingMs,
          totalElapsedMs: live.totalElapsedMs,
          // Stable when paused so identical states de-dupe; re-anchored when running.
          anchorEpochMs: live.running ? now : clock.anchorEpochMs,
        },
      },
    };
  }

  /** Write an interval recovery snapshot (with live clock), skipping if nothing changed. */
  snapshotNow(): void {
    const snap = this.liveDb();
    const json = JSON.stringify(snap);
    if (json === this.lastSnapshotJson) return;
    this.lastSnapshotJson = json;
    this.store.writeSnapshot(snap).catch((err) => console.error('[store] snapshot failed:', err));
  }

  /**
   * Persist the live clock to db.json while running, so a crash loses at most one
   * checkpoint interval of clock time (not a whole snapshot interval).
   */
  checkpoint(): void {
    if (!this.db.tournament.clock.running) return;
    this.db.tournament.clock = this.liveDb().tournament.clock;
    this.store.save(this.db).catch((err) => console.error('[store] checkpoint save failed:', err));
  }

  /** Replace live state with a restored snapshot: re-anchor clock, persist, broadcast. */
  restore(db: DB): void {
    this.clearTimer();
    this.db = db;
    this.normalize();
    const c = this.db.tournament.clock;
    if (c.running) c.anchorEpochMs = this.now();
    this.lastSnapshotJson = JSON.stringify(this.liveDb());
    this.scheduleClock();
    this.store.save(this.db).catch((err) => console.error('[store] save failed:', err));
    this.listeners.onBroadcast();
  }

  now(): number {
    return Date.now();
  }

  // ---- lookups -----------------------------------------------------------

  private get tournament(): Tournament {
    return this.db.tournament;
  }

  activeStructure(): BlindStructure | null {
    const id = this.tournament.blindStructureId;
    return this.db.blindStructures.find((s) => s.id === id) ?? null;
  }

  activeLevels(): Level[] {
    return this.activeStructure()?.levels ?? [];
  }

  activePrize(): PrizeStructure | null {
    const id = this.tournament.prizeStructureId;
    return this.db.prizeStructures.find((p) => p.id === id) ?? null;
  }

  private player(id: string): TournamentPlayer | undefined {
    return this.tournament.players.find((p) => p.id === id);
  }

  private activePlayerIds(): string[] {
    return this.tournament.players.filter((p) => p.status === 'active').map((p) => p.id);
  }

  /**
   * Ids to seat. In anonymous mode there are no player records, so use stable
   * placeholder ids ("Player 1"…"Player N") that the UI shows verbatim.
   */
  private seatingIds(): string[] {
    const t = this.tournament;
    if (t.anonymousCount != null) {
      return Array.from({ length: t.anonymousCount }, (_, i) => `Player ${i + 1}`);
    }
    return this.activePlayerIds();
  }

  // ---- clock helpers -----------------------------------------------------

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleClock(): void {
    this.clearTimer();
    const t = this.tournament;
    if (!t.clock.running) return;
    const levels = this.activeLevels();
    if (t.clock.levelIndex >= levels.length) return;
    const remaining = deriveClock(t.clock, this.now()).remainingMs;
    this.timer = setTimeout(() => this.advanceLevel(), Math.max(0, remaining));
  }

  /** Re-anchor the clock to `now`, preserving the currently displayed values. */
  private reanchor(patch: { levelIndex?: number; levelRemainingMs?: number; running?: boolean }): void {
    const now = this.now();
    const live = deriveClock(this.tournament.clock, now);
    this.tournament.clock = {
      levelIndex: patch.levelIndex ?? this.tournament.clock.levelIndex,
      running: patch.running ?? this.tournament.clock.running,
      levelRemainingMs: Math.max(0, patch.levelRemainingMs ?? live.remainingMs),
      totalElapsedMs: live.totalElapsedMs,
      anchorEpochMs: now,
    };
  }

  private levelDurationAt(index: number): number {
    const levels = this.activeLevels();
    const lvl = levels[index];
    return lvl ? levelDurationMs(lvl) : 0;
  }

  /** Fired when the current level's time runs out. */
  private advanceLevel(): void {
    const t = this.tournament;
    const levels = this.activeLevels();
    const now = this.now();
    const live = deriveClock(t.clock, now);
    const nextIndex = t.clock.levelIndex + 1;

    if (nextIndex >= levels.length) {
      t.clock = {
        levelIndex: t.clock.levelIndex,
        running: false,
        levelRemainingMs: 0,
        totalElapsedMs: live.totalElapsedMs,
        anchorEpochMs: now,
      };
      this.commit(false);
      return;
    }

    const nextLevel = levels[nextIndex];
    t.clock = {
      levelIndex: nextIndex,
      running: true,
      levelRemainingMs: levelDurationMs(nextLevel),
      totalElapsedMs: live.totalElapsedMs,
      anchorEpochMs: now,
    };
    this.listeners.onAudio(nextLevel.isBreak ? { kind: 'break', minutes: nextLevel.durationMins } : { kind: 'blinds-up' });
    this.commit(true);
  }

  // ---- command entry point ----------------------------------------------

  /** Apply a command. Returns a notice string for the originating client, or null. */
  apply(cmd: Command): string | null {
    let notice: string | null = null;
    switch (cmd.type) {
      // Clock ------------------------------------------------------------
      case 'clock/start':
        if (!this.tournament.clock.running && this.activeLevels().length > 0) {
          this.reanchor({ running: true });
        }
        break;
      case 'clock/pause':
        if (this.tournament.clock.running) this.reanchor({ running: false });
        break;
      case 'clock/toggle':
        this.reanchor({ running: !this.tournament.clock.running });
        break;
      case 'clock/setRemainingMs':
        this.reanchor({ levelRemainingMs: Math.max(0, num(cmd.ms)) });
        break;
      case 'clock/adjustRemainingMs': {
        const live = deriveClock(this.tournament.clock, this.now());
        this.reanchor({ levelRemainingMs: Math.max(0, live.remainingMs + num(cmd.deltaMs)) });
        break;
      }
      case 'clock/skip': {
        const levels = this.activeLevels();
        if (levels.length === 0) break;
        const idx = clamp(this.tournament.clock.levelIndex + Math.trunc(num(cmd.delta)), 0, levels.length - 1);
        this.reanchor({ levelIndex: idx, levelRemainingMs: this.levelDurationAt(idx) });
        break;
      }
      case 'clock/goToLevel': {
        const levels = this.activeLevels();
        if (levels.length === 0) break;
        const idx = clamp(Math.trunc(num(cmd.levelIndex)), 0, levels.length - 1);
        this.reanchor({ levelIndex: idx, levelRemainingMs: this.levelDurationAt(idx) });
        break;
      }
      case 'clock/reset':
        this.tournament.clock = initialClock(this.activeLevels()[0]);
        break;

      // Blind structures -------------------------------------------------
      case 'blinds/save':
        this.upsertBlinds(cmd.structure);
        break;
      case 'blinds/delete':
        this.db.blindStructures = this.db.blindStructures.filter((s) => s.id !== cmd.id);
        if (this.tournament.blindStructureId === cmd.id) {
          this.tournament.blindStructureId = this.db.blindStructures[0]?.id ?? null;
          this.tournament.clock = initialClock(this.activeLevels()[0]);
        }
        break;
      case 'blinds/select':
        if (this.db.blindStructures.some((s) => s.id === cmd.id)) {
          this.tournament.blindStructureId = cmd.id;
          this.tournament.clock = initialClock(this.activeLevels()[0]);
        }
        break;

      // Prize structures -------------------------------------------------
      case 'prizes/save':
        this.upsertPrizes(cmd.structure);
        break;
      case 'prizes/delete':
        this.db.prizeStructures = this.db.prizeStructures.filter((p) => p.id !== cmd.id);
        if (this.tournament.prizeStructureId === cmd.id) {
          this.tournament.prizeStructureId = this.db.prizeStructures[0]?.id ?? null;
        }
        break;
      case 'prizes/select':
        if (this.db.prizeStructures.some((p) => p.id === cmd.id)) {
          this.tournament.prizeStructureId = cmd.id;
        }
        break;

      // Saved roster -----------------------------------------------------
      case 'roster/add': {
        const name = String(cmd.name ?? '').trim();
        if (!name) break;
        if (this.db.savedPlayers.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
          notice = `"${name}" is already a saved player.`;
          break;
        }
        this.db.savedPlayers.push({ id: newId(), name });
        break;
      }
      case 'roster/remove':
        this.db.savedPlayers = this.db.savedPlayers.filter((p) => p.id !== cmd.id);
        break;

      // Tournament players ----------------------------------------------
      case 'players/add':
        notice = this.addPlayer(cmd.name);
        break;
      case 'players/addFromRoster': {
        const saved = this.db.savedPlayers.find((p) => p.id === cmd.savedPlayerId);
        if (!saved) break;
        if (this.tournament.players.some((p) => p.savedPlayerId === saved.id)) {
          notice = `${saved.name} is already in the tournament.`;
          break;
        }
        notice = this.addPlayer(saved.name, saved.id);
        break;
      }
      case 'players/update': {
        const p = this.player(cmd.id);
        if (p) {
          if (cmd.patch.name !== undefined) {
            const nm = String(cmd.patch.name).trim();
            if (nm) p.name = nm;
          }
          if (cmd.patch.rebuys !== undefined) p.rebuys = Math.max(0, Math.trunc(num(cmd.patch.rebuys)));
          if (cmd.patch.addOns !== undefined) p.addOns = Math.max(0, Math.trunc(num(cmd.patch.addOns)));
        }
        break;
      }
      case 'players/knockout': {
        const p = this.player(cmd.id);
        if (p) {
          p.status = 'out';
          this.tournament.seating.tables = removeFromTables(this.tournament.seating.tables, p.id);
        }
        break;
      }
      case 'players/reinstate': {
        // Undo a knockout (mistake): back in, no rebuy counted.
        const p = this.player(cmd.id);
        if (p) p.status = 'active';
        break;
      }
      case 'players/rebuy': {
        const p = this.player(cmd.id);
        if (p) {
          if (!this.rebuysOpen()) {
            notice = 'Rebuy period is closed.';
            break;
          }
          const max = this.tournament.stakes.maxRebuys;
          if (max > 0 && p.rebuys >= max) {
            notice = `Max ${max} rebuy${max === 1 ? '' : 's'} per player reached.`;
            break;
          }
          p.rebuys += 1;
          p.status = 'active'; // a rebuy brings a busted player back in
        }
        break;
      }
      case 'players/addOn': {
        const p = this.player(cmd.id);
        if (p) {
          if (!this.tournament.stakes.addOnsEnabled) {
            notice = 'Add-ons are disabled for this tournament.';
            break;
          }
          if (!this.rebuysOpen()) {
            notice = 'Add-on period is closed.';
            break;
          }
          const max = this.tournament.stakes.maxAddOns;
          if (max > 0 && p.addOns >= max) {
            notice = `Max ${max} add-on${max === 1 ? '' : 's'} per player reached.`;
            break;
          }
          p.addOns += 1;
        }
        break;
      }
      case 'players/remove':
        this.tournament.players = this.tournament.players.filter((p) => p.id !== cmd.id);
        this.tournament.seating.tables = removeFromTables(this.tournament.seating.tables, cmd.id);
        break;
      case 'players/setAnonymousCount':
        if (cmd.count == null) {
          this.tournament.anonymousCount = null;
        } else {
          const c = Math.max(0, Math.trunc(num(cmd.count)));
          this.tournament.anonymousCount = c;
          // Default total entries to at least the current count when enabling.
          if (this.tournament.anonEntries < c) this.tournament.anonEntries = c;
        }
        break;
      case 'tournament/setStakes': {
        const s = this.tournament.stakes;
        const p = cmd.patch;
        const pick = (v: unknown, cur: number) => (v == null ? cur : Math.max(0, num(v)));
        const next = {
          buyInCash: pick(p.buyInCash, s.buyInCash),
          buyInChips: pick(p.buyInChips, s.buyInChips),
          rebuyCash: pick(p.rebuyCash, s.rebuyCash),
          rebuyChips: pick(p.rebuyChips, s.rebuyChips),
          addOnCash: pick(p.addOnCash, s.addOnCash),
          addOnChips: pick(p.addOnChips, s.addOnChips),
          addOnsEnabled: p.addOnsEnabled == null ? s.addOnsEnabled : Boolean(p.addOnsEnabled),
          maxAddOns: p.maxAddOns == null ? s.maxAddOns : Math.max(0, Math.trunc(num(p.maxAddOns))),
          maxRebuys: p.maxRebuys == null ? s.maxRebuys : Math.max(0, Math.trunc(num(p.maxRebuys))),
        };
        this.tournament.stakes = next;
        // Persist as the remembered house default (survives new tournaments + sessions).
        this.db.settings.stakes = { ...next };
        break;
      }
      case 'tournament/setAnonCounts': {
        const p = cmd.patch;
        if (p.entries != null) this.tournament.anonEntries = Math.max(0, Math.trunc(num(p.entries)));
        if (p.rebuys != null) this.tournament.anonRebuys = Math.max(0, Math.trunc(num(p.rebuys)));
        if (p.addOns != null) this.tournament.anonAddOns = Math.max(0, Math.trunc(num(p.addOns)));
        break;
      }
      case 'tournament/anonAction': {
        const t = this.tournament;
        if (t.anonymousCount != null) {
          switch (cmd.action) {
            case 'entry': // new buy-in: +1 player, +1 entry
              t.anonymousCount += 1;
              t.anonEntries += 1;
              break;
            case 'rebuy': // busted player returns: +1 player, +1 rebuy
              t.anonymousCount += 1;
              t.anonRebuys += 1;
              break;
            case 'addon': // top-up chips: no count change
              t.anonAddOns += 1;
              break;
            case 'knockout': // player busts: -1 player (chips stay in play)
              t.anonymousCount = Math.max(0, t.anonymousCount - 1);
              break;
          }
        }
        break;
      }

      // Seating ----------------------------------------------------------
      case 'seating/setMaxPerTable':
        this.tournament.seating.maxPerTable = Math.max(2, Math.trunc(num(cmd.maxPerTable, 9)));
        break;
      case 'seating/randomize':
        this.tournament.seating.tables = randomizeSeating(this.seatingIds(), this.tournament.seating.maxPerTable);
        break;
      case 'seating/rebalance':
        this.tournament.seating.tables = rebalanceSeating(this.tournament.seating.tables, this.tournament.seating.maxPerTable);
        break;
      case 'seating/merge': {
        const res = mergeTables(this.tournament.seating.tables, this.tournament.seating.maxPerTable);
        if (res.ok) this.tournament.seating.tables = res.tables;
        else notice = res.reason ?? 'Merge not possible.';
        break;
      }
      case 'seating/applyMoves': {
        const res = applyMoves(this.tournament.seating.tables, cmd.moves, this.tournament.seating.maxPerTable);
        if (res.ok) this.tournament.seating.tables = res.tables;
        else notice = res.reason ?? 'Could not apply seating change.';
        break;
      }
      case 'seating/clear':
        this.tournament.seating.tables = [];
        break;

      // Tournament meta --------------------------------------------------
      case 'tournament/rename':
        this.tournament.name = String(cmd.name ?? '').trim() || this.tournament.name;
        break;
      case 'tournament/reset': {
        const prev = this.tournament;
        const fresh = newTournament(prev.name, this.db.settings.stakes); // seed from saved defaults
        fresh.blindStructureId = prev.blindStructureId;
        fresh.prizeStructureId = prev.prizeStructureId;
        fresh.seating = { maxPerTable: prev.seating.maxPerTable, tables: [] };
        this.db.tournament = fresh;
        this.db.tournament.clock = initialClock(this.activeLevels()[0]);
        break;
      }

      default: {
        // Exhaustiveness guard: if a new command type is added without a
        // handler, TypeScript flags this line.
        const _never: never = cmd;
        void _never;
      }
    }

    this.commit(true);
    return notice;
  }

  // ---- mutation helpers --------------------------------------------------

  /** Add a named player. Returns a notice (e.g. blank name) or null. */
  private addPlayer(name: string, savedPlayerId?: string): string | null {
    const nm = String(name ?? '').trim();
    if (!nm) return 'Enter a player name before adding.';
    const player: TournamentPlayer = {
      id: newId(),
      name: nm,
      savedPlayerId,
      status: 'active',
      rebuys: 0,
      addOns: 0,
    };
    this.tournament.players.push(player);
    return null;
  }

  private rebuysOpen(): boolean {
    return rebuyPeriodOpen(this.activeLevels(), this.tournament.clock.levelIndex);
  }

  private upsertBlinds(structure: BlindStructure): void {
    let lastRebuySeen = false; // enforce a single last-rebuy marker
    const clean: BlindStructure = {
      id: structure.id || newId(),
      name: String(structure.name ?? 'Structure').trim() || 'Structure',
      levels: (structure.levels ?? []).map((l) => {
        const lastRebuy = Boolean(l.lastRebuy) && !lastRebuySeen;
        if (lastRebuy) lastRebuySeen = true;
        return {
          smallBlind: num(l.smallBlind),
          bigBlind: num(l.bigBlind),
          ante: num(l.ante),
          durationMins: Math.max(0, num(l.durationMins)),
          isBreak: Boolean(l.isBreak),
          lastRebuy,
        };
      }),
    };
    const idx = this.db.blindStructures.findIndex((s) => s.id === clean.id);
    if (idx >= 0) this.db.blindStructures[idx] = clean;
    else this.db.blindStructures.push(clean);

    // If we just edited the active structure, keep the clock index in range.
    if (this.tournament.blindStructureId === clean.id) {
      const maxIdx = Math.max(0, clean.levels.length - 1);
      if (this.tournament.clock.levelIndex > maxIdx) {
        this.tournament.clock.levelIndex = maxIdx;
      }
    }
  }

  private upsertPrizes(structure: PrizeStructure): void {
    const places = Math.max(0, Math.trunc(num(structure.places)));
    const clean: PrizeStructure = {
      id: structure.id || newId(),
      name: String(structure.name ?? 'Prizes').trim() || 'Prizes',
      mode: structure.mode === 'cash' ? 'cash' : 'percentage',
      places,
      values: Array.from({ length: places }, (_, i) => Math.max(0, num(structure.values?.[i]))),
      roundTo: Math.max(1, Math.trunc(num(structure.roundTo, 1))),
    };
    const idx = this.db.prizeStructures.findIndex((p) => p.id === clean.id);
    if (idx >= 0) this.db.prizeStructures[idx] = clean;
    else this.db.prizeStructures.push(clean);
  }

  /** Persist, reschedule the clock, and broadcast. */
  private commit(reschedule: boolean): void {
    if (reschedule) this.scheduleClock();
    this.store.save(this.db).catch((err) => console.error('[store] save failed:', err));
    this.listeners.onBroadcast();
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

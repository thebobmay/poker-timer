// Pure clock math. The server owns the authoritative ClockState; both server
// and client use these helpers to derive live values from an anchor. Clients
// pass a *corrected* now (their clock adjusted by the server offset) so the TV
// and phone agree to the second. See CLAUDE.md §4.

import type { ClockState, Level } from '../types.js';

export interface LiveClock {
  levelIndex: number;
  running: boolean;
  remainingMs: number;
  totalElapsedMs: number;
}

/** Derive the live remaining + total-elapsed for a given moment. */
export function deriveClock(clock: ClockState, nowMs: number): LiveClock {
  if (!clock.running) {
    return {
      levelIndex: clock.levelIndex,
      running: false,
      remainingMs: Math.max(0, clock.levelRemainingMs),
      totalElapsedMs: clock.totalElapsedMs,
    };
  }
  const delta = Math.max(0, nowMs - clock.anchorEpochMs);
  return {
    levelIndex: clock.levelIndex,
    running: true,
    remainingMs: Math.max(0, clock.levelRemainingMs - delta),
    totalElapsedMs: clock.totalElapsedMs + delta,
  };
}

export function levelDurationMs(level: Level): number {
  return Math.max(0, Math.round(level.durationMins * 60_000));
}

/** Format ms as MM:SS (or HH:MM:SS when >= 1 hour). */
export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Format ms as HH:MM:SS (always), for the "total time" readout. */
export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Map each level index to its displayed round number. Break levels are not
 * numbered (return null); playing levels count 1..n excluding breaks.
 */
export function roundNumbers(levels: Level[]): Array<number | null> {
  let round = 0;
  return levels.map((lvl) => {
    if (lvl.isBreak) return null;
    round += 1;
    return round;
  });
}

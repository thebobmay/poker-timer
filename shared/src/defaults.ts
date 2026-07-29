// Factory helpers and seeded default data so the app is usable out of the box
// (approved default: a sensible blind structure + prize split). See CLAUDE.md.

import type { AppSettings, BlindStructure, ClockState, DB, Level, PrizeStructure, Stakes, Tournament } from './types.js';
import { levelDurationMs } from './domain/clock.js';

/** Default buy-in / rebuy / add-on amounts. Edit these in the Players tab. */
export function defaultStakes(): Stakes {
  return {
    buyInCash: 20,
    buyInChips: 2000,
    rebuyCash: 20,
    rebuyChips: 2000,
    addOnCash: 20,
    addOnChips: 2000,
    addOnsEnabled: true,
    maxAddOns: 0,
    maxRebuys: 0,
  };
}

/** UUID that works in both Node 22 and modern browsers. */
export function newId(): string {
  return globalThis.crypto.randomUUID();
}

function level(smallBlind: number, bigBlind: number, ante: number, durationMins: number): Level {
  return { smallBlind, bigBlind, ante, durationMins, isBreak: false };
}

function breakLevel(durationMins: number): Level {
  return { smallBlind: 0, bigBlind: 0, ante: 0, durationMins, isBreak: true };
}

/** A reasonable ~3-hour home-game structure with a break after round 4. */
export function defaultBlindStructure(): BlindStructure {
  return {
    id: 'default-blinds',
    name: 'Default Structure',
    levels: [
      level(25, 50, 0, 20),
      level(50, 100, 0, 20),
      level(75, 150, 0, 20),
      level(100, 200, 25, 20),
      breakLevel(10),
      level(150, 300, 25, 20),
      level(200, 400, 50, 20),
      level(300, 600, 75, 20),
      level(400, 800, 100, 20),
      breakLevel(10),
      level(500, 1000, 100, 20),
      level(700, 1400, 200, 20),
      level(1000, 2000, 300, 20),
      level(1500, 3000, 400, 20),
      level(2000, 4000, 500, 20),
    ],
  };
}

/** A standard top-3 percentage split (50/30/20). */
export function defaultPrizeStructure(): PrizeStructure {
  return {
    id: 'default-prizes',
    name: 'Default 50/30/20',
    mode: 'percentage',
    places: 3,
    values: [50, 30, 20],
    roundTo: 1,
  };
}

export function initialClock(firstLevel: Level | undefined): ClockState {
  return {
    levelIndex: 0,
    running: false,
    levelRemainingMs: firstLevel ? levelDurationMs(firstLevel) : 0,
    totalElapsedMs: 0,
    anchorEpochMs: 0,
  };
}

export function newTournament(name = 'Tournament', stakes: Stakes = defaultStakes()): Tournament {
  const blinds = defaultBlindStructure();
  return {
    id: newId(),
    name,
    blindStructureId: blinds.id,
    prizeStructureId: 'default-prizes',
    stakes: { ...stakes },
    anonymousCount: null,
    anonEntries: 0,
    anonRebuys: 0,
    anonAddOns: 0,
    players: [],
    clock: initialClock(blinds.levels[0]),
    seating: { maxPerTable: 9, tables: [] },
  };
}

export function defaultSettings(): AppSettings {
  return { stakes: defaultStakes() };
}

/** The store as shipped on first run. */
export function defaultDB(): DB {
  return {
    version: 1,
    settings: defaultSettings(),
    savedPlayers: [],
    blindStructures: [defaultBlindStructure()],
    prizeStructures: [defaultPrizeStructure()],
    tournament: newTournament('My Tournament'),
  };
}

// Small client-side selectors over the DB. Domain math lives in @poker/shared.

import type { BlindStructure, DB, Level, PrizeStructure } from '@poker/shared';

export function activeStructure(db: DB): BlindStructure | null {
  return db.blindStructures.find((s) => s.id === db.tournament.blindStructureId) ?? null;
}

export function activeLevels(db: DB): Level[] {
  return activeStructure(db)?.levels ?? [];
}

export function activePrize(db: DB): PrizeStructure | null {
  return db.prizeStructures.find((p) => p.id === db.tournament.prizeStructureId) ?? null;
}

export function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function chips(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export const ORDINALS = [
  '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th',
  '11th', '12th', '13th', '14th', '15th', '16th', '17th', '18th', '19th', '20th',
];

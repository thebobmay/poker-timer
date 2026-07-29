import type { DB } from '@poker/shared';
import { Modal } from './Modal.js';
import { PlayersTab } from '../tabs/PlayersTab.js';
import { BlindsTab } from '../tabs/BlindsTab.js';
import { PrizesTab } from '../tabs/PrizesTab.js';
import { SeatingTab } from '../tabs/SeatingTab.js';

export type TabName = 'players' | 'blinds' | 'prizes' | 'seating';

export const TABS: { key: TabName; label: string }[] = [
  { key: 'players', label: 'Players' },
  { key: 'blinds', label: 'Blinds' },
  { key: 'prizes', label: 'Prizes' },
  { key: 'seating', label: 'Seating' },
];

const TITLES: Record<TabName, string> = {
  players: 'Players',
  blinds: 'Blinds',
  prizes: 'Prizes',
  seating: 'Seating',
};

export function TabModals({ open, onClose, db }: { open: TabName | null; onClose: () => void; db: DB }) {
  if (!open) return null;
  return (
    <Modal title={TITLES[open]} onClose={onClose}>
      {open === 'players' && <PlayersTab db={db} />}
      {open === 'blinds' && <BlindsTab db={db} />}
      {open === 'prizes' && <PrizesTab db={db} />}
      {open === 'seating' && <SeatingTab db={db} />}
    </Modal>
  );
}

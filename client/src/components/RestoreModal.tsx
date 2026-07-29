import { useEffect, useState } from 'react';
import { Modal } from './Modal.js';
import { money } from '../selectors.js';

interface Snap {
  file: string;
  time: number;
  summary: { name: string; round: string; players: number; pool: number; tables: number } | null;
}

export function RestoreModal({ onClose }: { onClose: () => void }) {
  const [snaps, setSnaps] = useState<Snap[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/snapshots').then((r) => r.json()).then(setSnaps).catch(() => setSnaps([]));
  }, []);

  const restore = async (file: string) => {
    if (!window.confirm('Restore this snapshot? The current tournament state will be replaced.')) return;
    setBusy(true);
    try {
      await fetch('/api/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file }) });
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return (
    <Modal title="Restore a snapshot" onClose={onClose}>
      <p className="hint">
        Auto-saved recovery points (newest first). Restoring replaces the live tournament — chips,
        players, prize pool, blinds, prizes, and seating — with the saved state.
      </p>
      {snaps === null && <p className="muted">Loading…</p>}
      {snaps && snaps.length === 0 && <p className="muted">No snapshots yet. They start saving a couple of minutes into play.</p>}
      <ul className="snap-list">
        {snaps?.map((s) => (
          <li key={s.file} className="snap">
            <div className="snap-info">
              <span className="snap-time">{new Date(s.time).toLocaleString()}</span>
              {s.summary ? (
                <span className="snap-summary">
                  {s.summary.name} · {s.summary.round} · {s.summary.players} player{s.summary.players === 1 ? '' : 's'} · {money(s.summary.pool)} · {s.summary.tables} table{s.summary.tables === 1 ? '' : 's'}
                </span>
              ) : (
                <span className="snap-summary muted">(unreadable)</span>
              )}
            </div>
            <button className="btn" disabled={busy || !s.summary} onClick={() => restore(s.file)}>Restore</button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

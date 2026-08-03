import { useState } from 'react';
import { newId, type DB, type Format } from '@poker/shared';
import { Modal } from './Modal.js';
import { useSend } from '../net/store.js';

export function TournamentSettings({ onClose, db }: { onClose: () => void; db: DB }) {
  const send = useSend();
  const t = db.tournament;
  const [name, setName] = useState(t.name);
  const [setupName, setSetupName] = useState('');

  const setFormat = (patch: Partial<Format>) => send({ type: 'tournament/setFormat', format: { ...t.format, ...patch } });

  const saveSetup = () => {
    const nm = setupName.trim();
    if (!nm) return;
    send({
      type: 'setup/save',
      setup: { id: newId(), name: nm, format: t.format, blindStructureId: t.blindStructureId, prizeStructureId: t.prizeStructureId, stakes: t.stakes, maxPerTable: t.seating.maxPerTable },
    });
    setSetupName('');
  };

  const createNew = (setupId?: string) => {
    const real = t.status === 'running' || t.players.length > 0;
    if (real && !window.confirm('Start a new tournament? The current one will be archived first.')) return;
    send({ type: 'tournament/createNew', setupId });
  };

  const endTournament = () => {
    if (window.confirm('End the tournament? Results will be archived and the clock will stop.')) send({ type: 'tournament/end' });
  };

  const statusLabel = t.status === 'running' ? 'IN PLAY' : t.status === 'complete' ? 'COMPLETE' : 'SETUP';
  const statusClass = t.status === 'running' ? 'live' : t.status === 'complete' ? 'done' : 'paused';

  return (
    <Modal title="Tournament" onClose={onClose}>
      <div className="tournament-settings">
        <div className="ts-head">
          <input className="name-input grow" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => send({ type: 'tournament/rename', name })} />
          <span className={`status ${statusClass}`}>{statusLabel}</span>
        </div>

        <div className="ts-section">
          <h3>Format</h3>
          <div className="seg-row">
            <span className="seg-label">Entries</span>
            <div className="seg">
              <button className={t.format.rebuys === 'freezeout' ? 'on' : ''} onClick={() => setFormat({ rebuys: 'freezeout' })}>Freezeout</button>
              <button className={t.format.rebuys === 'rebuy' ? 'on' : ''} onClick={() => setFormat({ rebuys: 'rebuy' })}>Rebuy + add-on</button>
            </div>
          </div>
          <div className="seg-row">
            <span className="seg-label">Bounty</span>
            <div className="seg">
              <button className={t.format.bounty === 'none' ? 'on' : ''} onClick={() => setFormat({ bounty: 'none' })}>None</button>
              <button className={t.format.bounty === 'traditional' ? 'on' : ''} onClick={() => setFormat({ bounty: 'traditional' })}>Traditional</button>
              <button className={t.format.bounty === 'mystery' ? 'on' : ''} onClick={() => setFormat({ bounty: 'mystery' })}>Mystery</button>
            </div>
          </div>
          {t.format.bounty !== 'none' && <p className="hint">Bounty scoring arrives in a later update — for now the format is just saved with the tournament.</p>}
        </div>

        <div className="ts-section ts-lifecycle">
          {t.status === 'setup' && <button className="btn primary" onClick={() => send({ type: 'tournament/start' })}>Start tournament</button>}
          {t.status === 'running' && <button className="btn danger" onClick={endTournament}>End tournament</button>}
          {t.status === 'complete' && <span className="muted">Tournament complete — archived. Create a new one below.</span>}
          <div className="spacer" />
          <button className="btn" onClick={() => createNew()}>New (blank)</button>
        </div>

        <div className="ts-section">
          <h3>Saved setups</h3>
          <div className="add-row">
            <input className="grow" placeholder="Save current config as…" value={setupName} onChange={(e) => setSetupName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveSetup()} />
            <button className="btn" onClick={saveSetup} disabled={!setupName.trim()}>Save setup</button>
          </div>
          <div className="setup-list">
            {db.tournamentSetups.length === 0 && <span className="muted">None saved yet. Configure blinds/prizes/stakes/format, then save it here to reuse next time.</span>}
            {db.tournamentSetups.map((s) => (
              <div key={s.id} className="setup-row">
                <span className="setup-name">{s.name}</span>
                <span className="setup-meta muted">{s.format.rebuys === 'freezeout' ? 'Freezeout' : 'Rebuy'}{s.format.bounty !== 'none' ? ` · ${s.format.bounty} bounty` : ''}</span>
                <button className="btn sm" onClick={() => createNew(s.id)}>New from this</button>
                <button className="btn sm" title="Apply to the current setup" onClick={() => send({ type: 'setup/apply', id: s.id })} disabled={t.status !== 'setup'}>Load</button>
                <button className="icon-btn xs" title="Delete setup" onClick={() => send({ type: 'setup/delete', id: s.id })}>✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

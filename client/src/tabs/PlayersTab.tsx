import { useState } from 'react';
import {
  chipAverage,
  playerChips,
  playersRemaining,
  prizePool,
  rebuyPeriodOpen,
  totalChips,
  type DB,
  type Stakes,
} from '@poker/shared';
import { useSend } from '../net/store.js';
import { activeLevels, chips as fmtChips, money } from '../selectors.js';

export function PlayersTab({ db }: { db: DB }) {
  const send = useSend();
  const t = db.tournament;
  const s = t.stakes;
  const [name, setName] = useState('');
  const [rosterName, setRosterName] = useState('');
  const anon = t.anonymousCount != null;
  const addedRosterIds = new Set(t.players.map((p) => p.savedPlayerId).filter((x): x is string => !!x));
  const rebuyOpen = rebuyPeriodOpen(activeLevels(db), t.clock.levelIndex);

  const setStake = (patch: Partial<Stakes>) => send({ type: 'tournament/setStakes', patch });
  const addPlayer = () => {
    if (!name.trim()) return;
    send({ type: 'players/add', name: name.trim() });
    setName('');
  };

  return (
    <div className="tab players-tab">
      <div className="stat-row">
        <Stat label="Chip Average" value={chipAverage(t) == null ? 'N/A' : fmtChips(chipAverage(t)!)} />
        <Stat label="Total Chips" value={fmtChips(totalChips(t))} />
        <Stat label="Players" value={String(playersRemaining(t))} />
        <Stat label={rebuyOpen ? 'Prize Pool (not final)' : 'Prize Pool'} value={money(prizePool(t))} />
      </div>

      {/* Buy-in / rebuy / add-on amounts + rules drive the prize pool and chip counts. */}
      <div className="stakes-editor">
        <div className="stakes-title">Buy-in, rebuy &amp; add-on amounts <span className="muted">· saved for next time</span></div>
        <div className="stakes-grid">
          <span className="stakes-row-label">Buy-in</span>
          <StakeField label="Cash" value={s.buyInCash} onChange={(v) => setStake({ buyInCash: v })} money />
          <StakeField label="Chips" value={s.buyInChips} onChange={(v) => setStake({ buyInChips: v })} />
          <span className="stakes-row-label">Rebuy</span>
          <StakeField label="Cash" value={s.rebuyCash} onChange={(v) => setStake({ rebuyCash: v })} money />
          <StakeField label="Chips" value={s.rebuyChips} onChange={(v) => setStake({ rebuyChips: v })} />
          <span className="stakes-row-label">Add-on</span>
          <StakeField label="Cash" value={s.addOnCash} onChange={(v) => setStake({ addOnCash: v })} money />
          <StakeField label="Chips" value={s.addOnChips} onChange={(v) => setStake({ addOnChips: v })} />
        </div>
        <div className="stakes-rules">
          <label className="chk"><input type="checkbox" checked={s.addOnsEnabled} onChange={(e) => setStake({ addOnsEnabled: e.target.checked })} /> Allow add-ons</label>
          <label className="field">Max rebuys / player <input className="num" type="number" min={0} value={s.maxRebuys} onChange={(e) => setStake({ maxRebuys: Number(e.target.value) })} /> <span className="muted">(0 = ∞)</span></label>
          <label className="field">Max add-ons / player <input className="num" type="number" min={0} value={s.maxAddOns} onChange={(e) => setStake({ maxAddOns: Number(e.target.value) })} /> <span className="muted">(0 = ∞)</span></label>
        </div>
      </div>

      <div className="anon-toggle">
        <label>
          <input
            type="checkbox"
            checked={anon}
            onChange={(e) => send({ type: 'players/setAnonymousCount', count: e.target.checked ? t.players.filter((p) => p.status === 'active').length : null })}
          />
          Count only (no names)
        </label>
      </div>

      {anon ? (
        <div className="anon-accounting">
          <div className="anon-quick">
            <button className="btn primary" onClick={() => send({ type: 'tournament/anonAction', action: 'entry' })}>+ New entry</button>
            <button className="btn danger" onClick={() => send({ type: 'tournament/anonAction', action: 'knockout' })} disabled={(t.anonymousCount ?? 0) <= 0}>− Knock out</button>
            <button className="btn" onClick={() => send({ type: 'tournament/anonAction', action: 'rebuy' })}>Rebuy (+player)</button>
            <button className="btn" onClick={() => send({ type: 'tournament/anonAction', action: 'addon' })} disabled={!s.addOnsEnabled}>Add-on</button>
          </div>
          <div className="anon-fields">
            <NumField label="Players left" value={t.anonymousCount ?? 0} onChange={(v) => send({ type: 'players/setAnonymousCount', count: v })} />
            <NumField label="Entries (buy-ins)" value={t.anonEntries} onChange={(v) => send({ type: 'tournament/setAnonCounts', patch: { entries: v } })} />
            <NumField label="Rebuys" value={t.anonRebuys} onChange={(v) => send({ type: 'tournament/setAnonCounts', patch: { rebuys: v } })} />
            <NumField label="Add-ons" value={t.anonAddOns} onChange={(v) => send({ type: 'tournament/setAnonCounts', patch: { addOns: v } })} />
          </div>
          <p className="hint">
            Tap as players bust / rebuy — the counts below (which you can also edit directly) drive the pool.
            Prize pool = entries×{money(s.buyInCash)} + rebuys×{money(s.rebuyCash)} + add-ons×{money(s.addOnCash)} = <strong>{money(prizePool(t))}</strong>.
          </p>
        </div>
      ) : (
        <>
          <div className="add-row">
            <input className="grow" placeholder="Player name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPlayer()} />
            <span className="add-note">buys in for {money(s.buyInCash)} / {fmtChips(s.buyInChips)} chips</span>
            <button className="btn primary" onClick={addPlayer} disabled={!name.trim()}>Add Player</button>
          </div>

          <p className="hint">
            {rebuyOpen ? 'Rebuys & add-ons are OPEN.' : 'Rebuy period is CLOSED — buttons disabled (edit counts directly to fix a mistake).'}
            {' '}Mark the last rebuy level on the Blinds tab.
          </p>

          <table className="grid players-grid">
            <thead>
              <tr><th>Name</th><th>Rebuys</th><th>Add-ons</th><th>Chips</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {t.players.length === 0 && (
                <tr><td colSpan={6} className="empty">No players yet.</td></tr>
              )}
              {t.players.map((p) => {
                const rebuyBlocked = !rebuyOpen || (s.maxRebuys > 0 && p.rebuys >= s.maxRebuys);
                const addOnBlocked = !s.addOnsEnabled || !rebuyOpen || (s.maxAddOns > 0 && p.addOns >= s.maxAddOns);
                return (
                  <tr key={p.id} className={p.status === 'out' ? 'out' : ''}>
                    <td>{p.name}</td>
                    <td><input className="num sm" type="number" min={0} value={p.rebuys} onChange={(e) => send({ type: 'players/update', id: p.id, patch: { rebuys: Number(e.target.value) } })} /></td>
                    <td><input className="num sm" type="number" min={0} value={p.addOns} onChange={(e) => send({ type: 'players/update', id: p.id, patch: { addOns: Number(e.target.value) } })} /></td>
                    <td>{fmtChips(playerChips(p, s))}</td>
                    <td>{p.status === 'out' ? 'OUT' : 'IN'}</td>
                    <td className="actions">
                      <button className="btn sm" disabled={rebuyBlocked} title="Rebuy (counts a rebuy)" onClick={() => send({ type: 'players/rebuy', id: p.id })}>Rebuy</button>
                      {s.addOnsEnabled && <button className="btn sm" disabled={addOnBlocked} title="Add-on" onClick={() => send({ type: 'players/addOn', id: p.id })}>Add-on</button>}
                      {p.status === 'active' ? (
                        <button className="btn danger sm" onClick={() => send({ type: 'players/knockout', id: p.id })}>Knock out</button>
                      ) : (
                        <button className="btn sm" title="Undo knockout (no rebuy)" onClick={() => send({ type: 'players/reinstate', id: p.id })}>Undo KO</button>
                      )}
                      <button className="icon-btn" title="Remove" onClick={() => send({ type: 'players/remove', id: p.id })}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="roster">
            <h3>Saved players</h3>
            <div className="add-row">
              <input className="grow" placeholder="Create new saved player" value={rosterName} onChange={(e) => setRosterName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && rosterName.trim()) { send({ type: 'roster/add', name: rosterName.trim() }); setRosterName(''); } }} />
              <button className="btn" onClick={() => { if (rosterName.trim()) { send({ type: 'roster/add', name: rosterName.trim() }); setRosterName(''); } }}>Save player</button>
            </div>
            <div className="chips-list">
              {db.savedPlayers.map((sp) => {
                const added = addedRosterIds.has(sp.id);
                return (
                  <span key={sp.id} className={`chip-tag ${added ? 'added' : ''}`}>
                    {added ? (
                      <span className="link disabled" title="Already in the tournament">✓ {sp.name}</span>
                    ) : (
                      <button className="link" onClick={() => send({ type: 'players/addFromRoster', savedPlayerId: sp.id })}>+ {sp.name}</button>
                    )}
                    <button className="icon-btn xs" title="Delete saved" onClick={() => send({ type: 'roster/remove', id: sp.id })}>✕</button>
                  </span>
                );
              })}
              {db.savedPlayers.length === 0 && <span className="muted">None saved yet.</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function StakeField({ label, value, onChange, money: isMoney }: { label: string; value: number; onChange: (v: number) => void; money?: boolean }) {
  return (
    <label className="field stake-field">
      <span>{label}</span>
      <span className="prefix">{isMoney ? '$' : ''}</span>
      <input className="num" type="number" min={0} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="field num-field">
      <span>{label}</span>
      <input className="num" type="number" min={0} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

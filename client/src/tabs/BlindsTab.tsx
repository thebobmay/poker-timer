import { useEffect, useState } from 'react';
import { newId, roundNumbers, type BlindStructure, type DB, type Level } from '@poker/shared';
import { useSend } from '../net/store.js';
import { activeStructure } from '../selectors.js';

const emptyLevel = (): Level => ({ smallBlind: 0, bigBlind: 0, ante: 0, durationMins: 20, isBreak: false, lastRebuy: false });

export function BlindsTab({ db }: { db: DB }) {
  const send = useSend();
  const active = activeStructure(db);
  const [draft, setDraft] = useState<BlindStructure>(() => clone(active, db));
  const [bulkDur, setBulkDur] = useState('20');

  // Re-sync the editable draft when the selected structure changes.
  useEffect(() => {
    setDraft(clone(activeStructure(db), db));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.tournament.blindStructureId]);

  const rounds = roundNumbers(draft.levels);

  const updateLevel = (i: number, patch: Partial<Level>) =>
    setDraft((d) => ({ ...d, levels: d.levels.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));

  // Only one level can be the last-rebuy level.
  const setLastRebuy = (i: number, checked: boolean) =>
    setDraft((d) => ({ ...d, levels: d.levels.map((l, idx) => ({ ...l, lastRebuy: checked && idx === i })) }));

  const applyDurationToRounds = (includeBreaks: boolean) => {
    const mins = Math.max(0, Number(bulkDur) || 0);
    setDraft((d) => ({ ...d, levels: d.levels.map((l) => (l.isBreak && !includeBreaks ? l : { ...l, durationMins: mins })) }));
  };
  const addRow = () => setDraft((d) => ({ ...d, levels: [...d.levels, emptyLevel()] }));
  const addBreak = () => setDraft((d) => ({ ...d, levels: [...d.levels, { ...emptyLevel(), isBreak: true, durationMins: 10 }] }));
  const removeRow = (i: number) => setDraft((d) => ({ ...d, levels: d.levels.filter((_, idx) => idx !== i) }));

  const save = () => send({ type: 'blinds/save', structure: draft });
  const saveAsNew = () => {
    const copy = { ...draft, id: newId(), name: `${draft.name} copy` };
    send({ type: 'blinds/save', structure: copy });
    send({ type: 'blinds/select', id: copy.id });
  };

  return (
    <div className="tab blinds-tab">
      <div className="toolbar">
        <select value={db.tournament.blindStructureId ?? ''} onChange={(e) => send({ type: 'blinds/select', id: e.target.value })}>
          {db.blindStructures.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input className="name-input" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        <div className="spacer" />
        <button className="btn primary" onClick={save}>Save</button>
        <button className="btn" onClick={saveAsNew}>Save as new</button>
        {db.blindStructures.length > 1 && (
          <button className="btn danger" onClick={() => active && send({ type: 'blinds/delete', id: active.id })}>Delete</button>
        )}
      </div>
      <p className="hint">Selecting a structure resets the clock to level 1. Editing durations mid-game won't change the live clock — use the display's time controls for that.</p>

      <div className="add-row bulk-dur">
        <label className="field">Set every round to
          <input className="num" type="number" min={0} value={bulkDur} onChange={(e) => setBulkDur(e.target.value)} /> mins
        </label>
        <button className="btn" onClick={() => applyDurationToRounds(false)}>Apply to all rounds</button>
        <button className="btn" onClick={() => applyDurationToRounds(true)}>Apply to rounds + breaks</button>
        <span className="hint inline">Then Save.</span>
      </div>

      <table className="grid blinds-grid">
        <thead>
          <tr><th>Round</th><th>Small Blind</th><th>Big Blind</th><th>Ante</th><th>Duration (mins)</th><th>Break</th><th title="Last level rebuys/add-ons are allowed">Last rebuy</th><th></th></tr>
        </thead>
        <tbody>
          {draft.levels.map((l, i) => (
            <tr key={i} className={l.isBreak ? 'break-row' : ''}>
              <td className="round-cell">{l.isBreak ? '—' : rounds[i]}</td>
              <td>{l.isBreak ? '—' : <input className="num" type="number" value={l.smallBlind} onChange={(e) => updateLevel(i, { smallBlind: Number(e.target.value) })} />}</td>
              <td>{l.isBreak ? '—' : <input className="num" type="number" value={l.bigBlind} onChange={(e) => updateLevel(i, { bigBlind: Number(e.target.value) })} />}</td>
              <td>{l.isBreak ? '—' : <input className="num" type="number" value={l.ante} onChange={(e) => updateLevel(i, { ante: Number(e.target.value) })} />}</td>
              <td><input className="num" type="number" value={l.durationMins} onChange={(e) => updateLevel(i, { durationMins: Number(e.target.value) })} /></td>
              <td><input type="checkbox" checked={l.isBreak} onChange={(e) => updateLevel(i, { isBreak: e.target.checked })} /></td>
              <td><input type="checkbox" checked={!!l.lastRebuy} onChange={(e) => setLastRebuy(i, e.target.checked)} /></td>
              <td><button className="icon-btn" title="Remove row" onClick={() => removeRow(i)}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="add-row">
        <button className="btn" onClick={addRow}>+ Add level</button>
        <button className="btn" onClick={addBreak}>+ Add break</button>
      </div>
    </div>
  );
}

function clone(s: BlindStructure | null, db: DB): BlindStructure {
  if (s) return { ...s, levels: s.levels.map((l) => ({ ...l })) };
  return db.blindStructures[0]
    ? { ...db.blindStructures[0], levels: db.blindStructures[0].levels.map((l) => ({ ...l })) }
    : { id: newId(), name: 'New Structure', levels: [emptyLevel()] };
}

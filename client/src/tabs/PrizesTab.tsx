import { useEffect, useState } from 'react';
import { computePayouts, newId, prizePool, prizeUsed, type DB, type PrizeStructure } from '@poker/shared';
import { useSend } from '../net/store.js';
import { activePrize, money, ORDINALS } from '../selectors.js';

export function PrizesTab({ db }: { db: DB }) {
  const send = useSend();
  const active = activePrize(db);
  const [draft, setDraft] = useState<PrizeStructure>(() => clone(active, db));

  useEffect(() => {
    setDraft(clone(activePrize(db), db));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.tournament.prizeStructureId]);

  const pool = prizePool(db.tournament);
  const used = prizeUsed(draft);
  const payouts = computePayouts(draft, pool);

  const setPlaces = (n: number) => {
    const places = Math.max(1, Math.min(20, n));
    setDraft((d) => {
      const values = Array.from({ length: places }, (_, i) => d.values[i] ?? 0);
      return { ...d, places, values };
    });
  };
  const setValue = (i: number, v: number) => setDraft((d) => ({ ...d, values: d.values.map((x, idx) => (idx === i ? v : x)) }));

  const save = () => send({ type: 'prizes/save', structure: draft });
  const saveAsNew = () => {
    const copy = { ...draft, id: newId(), name: `${draft.name} copy` };
    send({ type: 'prizes/save', structure: copy });
    send({ type: 'prizes/select', id: copy.id });
  };

  const target = draft.mode === 'percentage' ? 100 : pool;
  const targetLabel = draft.mode === 'percentage' ? `${used}% of 100%` : `${money(used)} of ${money(pool)}`;
  const over = draft.mode === 'percentage' ? used > 100 : used > pool;

  return (
    <div className="tab prizes-tab">
      <div className="toolbar">
        <select value={db.tournament.prizeStructureId ?? ''} onChange={(e) => send({ type: 'prizes/select', id: e.target.value })}>
          {db.prizeStructures.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
        </select>
        <input className="name-input" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        <div className="spacer" />
        <button className="btn primary" onClick={save}>Save</button>
        <button className="btn" onClick={saveAsNew}>Save as new</button>
        {db.prizeStructures.length > 1 && active && (
          <button className="btn danger" onClick={() => send({ type: 'prizes/delete', id: active.id })}>Delete</button>
        )}
      </div>

      <div className="prize-controls">
        <div className="radios">
          <label><input type="radio" checked={draft.mode === 'cash'} onChange={() => setDraft((d) => ({ ...d, mode: 'cash' }))} /> Cash</label>
          <label><input type="radio" checked={draft.mode === 'percentage'} onChange={() => setDraft((d) => ({ ...d, mode: 'percentage' }))} /> Percentage</label>
        </div>
        <label className="field">Places <input className="num" type="number" min={1} max={20} value={draft.places} onChange={(e) => setPlaces(Number(e.target.value))} /></label>
        <label className="field">Round to <input className="num" type="number" min={1} value={draft.roundTo} onChange={(e) => setDraft((d) => ({ ...d, roundTo: Math.max(1, Number(e.target.value)) }))} /></label>
        <span className={over ? 'used over' : 'used'}>Used: {targetLabel}{target === 0 ? '' : ''}</span>
      </div>

      <table className="grid prize-grid">
        <thead>
          <tr><th>Place</th><th>{draft.mode === 'cash' ? 'Cash' : 'Percent'}</th><th>Payout</th></tr>
        </thead>
        <tbody>
          {Array.from({ length: draft.places }).map((_, i) => (
            <tr key={i}>
              <td>{ORDINALS[i] ?? `${i + 1}th`}</td>
              <td>
                <input className="num" type="number" min={0} value={draft.values[i] ?? 0} onChange={(e) => setValue(i, Number(e.target.value))} />
                {draft.mode === 'percentage' ? ' %' : ''}
              </td>
              <td className="payout">{money(payouts[i] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">Prize pool is {money(pool)} (sum of all buy-ins, rebuys & add-ons). Payouts are integers, rounded up.</p>
    </div>
  );
}

function clone(s: PrizeStructure | null, db: DB): PrizeStructure {
  if (s) return { ...s, values: [...s.values] };
  return db.prizeStructures[0]
    ? { ...db.prizeStructures[0], values: [...db.prizeStructures[0].values] }
    : { id: newId(), name: 'New Prizes', mode: 'percentage', places: 3, values: [50, 30, 20], roundTo: 1 };
}

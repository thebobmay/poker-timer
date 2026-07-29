import { useMemo, useState } from 'react';
import { idealTableCount, suggestSeating, type DB } from '@poker/shared';
import { useSend } from '../net/store.js';
import { money, chips as fmtChips } from '../selectors.js';

export function SeatingTab({ db }: { db: DB }) {
  const send = useSend();
  const t = db.tournament;
  const s = t.stakes;
  const anon = t.anonymousCount != null;
  const nameOf = (id: string) => t.players.find((p) => p.id === id)?.name ?? id;
  const activeCount = anon ? (t.anonymousCount ?? 0) : t.players.filter((p) => p.status === 'active').length;
  const tables = t.seating.tables;
  const max = t.seating.maxPerTable;
  const seatedIds = new Set(tables.flatMap((tb) => tb.seats.filter((x): x is string => x !== null)));
  const seated = seatedIds.size;
  const ideal = idealTableCount(activeCount, max);

  // A signature of the current seating; the suggestion is stable until seating
  // changes (or the director asks for a re-draw).
  const sig = useMemo(() => JSON.stringify(tables.map((tb) => tb.seats)) + '|' + max, [tables, max]);
  const [reroll, setReroll] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const suggestion = useMemo(() => (anon ? null : suggestSeating(tables, max)), [sig, reroll, anon]);
  const showCard = suggestion && suggestion.moves.length > 0 && dismissed !== sig;

  return (
    <div className="tab seating-tab">
      <div className="toolbar">
        <label className="field">Max per table
          <input className="num" type="number" min={2} max={12} value={max} onChange={(e) => send({ type: 'seating/setMaxPerTable', maxPerTable: Number(e.target.value) })} />
        </label>
        <div className="spacer" />
        <button className="btn primary" onClick={() => send({ type: 'seating/randomize' })}>Randomize</button>
        <button className="btn" onClick={() => { setDismissed(null); setReroll((r) => r + 1); }} disabled={tables.length <= 1 || anon}>Suggest seating</button>
        <button className="btn danger" onClick={() => send({ type: 'seating/clear' })} disabled={tables.length === 0}>Clear</button>
      </div>

      {showCard && (
        <div className={`suggestion ${suggestion!.kind}`}>
          <div className="sug-head">
            ⚖ {suggestion!.kind === 'break' ? `Break Table ${suggestion!.breakTableId} — reseat:` : 'Even out the tables — move:'}
          </div>
          <ul className="sug-moves">
            {suggestion!.moves.map((m, i) => (
              <li key={i}>
                <strong>{nameOf(m.playerId)}</strong> · Table {m.fromTableId} → <strong>Table {m.toTableId}, seat {m.toSeat + 1}</strong>
              </li>
            ))}
          </ul>
          <div className="sug-actions">
            <button className="btn primary" onClick={() => send({ type: 'seating/applyMoves', moves: suggestion!.moves })}>Confirm</button>
            <button className="btn" onClick={() => setReroll((r) => r + 1)}>Re-draw seats</button>
            <button className="btn" onClick={() => setDismissed(sig)}>Dismiss</button>
          </div>
        </div>
      )}

      <p className="hint">
        {activeCount} active player{activeCount === 1 ? '' : 's'} · {tables.length} table{tables.length === 1 ? '' : 's'}
        {!anon && seated < activeCount && tables.length > 0 ? ` · ${activeCount - seated} not seated (re-randomize)` : ''}
        {tables.length === 0 && activeCount > 0 ? ` · suggests ${ideal} table${ideal === 1 ? '' : 's'}` : ''}
      </p>

      {tables.length === 0 ? (
        <div className="empty-box">No seating yet. {anon ? 'Set the player count in the Players tab, then Randomize.' : 'Add players, then Randomize.'}</div>
      ) : (
        <div className="tables">
          {tables.map((tb) => {
            const count = tb.seats.filter((x) => x !== null).length;
            return (
              <div key={tb.id} className="table-card">
                <div className="table-head">Table {tb.id} <span className="muted">· {count} player{count === 1 ? '' : 's'}</span></div>
                <ol className="seat-list">
                  {tb.seats.map((pid, i) =>
                    pid === null ? (
                      <li key={`v${i}`} className="vacant"><span className="seat-no">{i + 1}.</span> <span className="muted">empty</span></li>
                    ) : (
                      <li key={pid}>
                        <span className="seat-no">{i + 1}.</span> <span className="seat-name">{nameOf(pid)}</span>
                        {!anon && (
                          <span className="seat-actions">
                            <button className="btn sm" title={`Rebuy +${money(s.rebuyCash)} / ${fmtChips(s.rebuyChips)}`} onClick={() => send({ type: 'players/rebuy', id: pid })}>Rebuy</button>
                            <button className="btn danger sm" title="Knock out (vacates seat)" onClick={() => send({ type: 'players/knockout', id: pid })}>Knock out</button>
                          </span>
                        )}
                      </li>
                    ),
                  )}
                </ol>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

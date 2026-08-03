import { useState } from 'react';
import {
  deriveClock,
  formatClock,
  formatElapsed,
  playersRemaining,
  prizePool,
  rebalanceKind,
  roundNumbers,
  totalChips,
  type Level,
} from '@poker/shared';
import { correctedNow, useDB, useSend } from '../net/store.js';
import { useTick } from '../hooks.js';
import { activeLevels, chips as fmtChips, money } from '../selectors.js';
import { TabModals, TABS, type TabName } from '../components/TabModals.js';
import { RestoreModal } from '../components/RestoreModal.js';
import { TournamentSettings } from '../components/TournamentSettings.js';

export function Control() {
  const db = useDB();
  const send = useSend();
  const [openTab, setOpenTab] = useState<TabName | null>(null);
  const [showRestore, setShowRestore] = useState(false);
  const [showTournament, setShowTournament] = useState(false);
  useTick(250);

  if (!db) return <div className="loading">Connecting…</div>;

  const t = db.tournament;
  const levels = activeLevels(db);
  const live = deriveClock(t.clock, correctedNow());
  const idx = live.levelIndex;
  const current: Level | undefined = levels[idx];
  const next: Level | undefined = levels[idx + 1];
  const rounds = roundNumbers(levels);
  const urgent = live.remainingMs < 60_000 && live.remainingMs > 0;

  const blindText = (l?: Level) => (!l ? '—' : l.isBreak ? 'BREAK' : `${fmtChips(l.smallBlind)} / ${fmtChips(l.bigBlind)}${l.ante > 0 ? ` · ante ${fmtChips(l.ante)}` : ''}`);

  return (
    <div className="control">
      <header className="ctrl-head">
        <span className="tname">{t.name}</span>
        <span className={`status ${t.clock.running ? 'live' : 'paused'}`}>{t.clock.running ? 'IN PLAY' : 'PAUSED'}</span>
      </header>

      {t.anonymousCount == null && rebalanceKind(t.seating.tables, t.seating.maxPerTable) && (
        <button className="seat-alert-card" onClick={() => setOpenTab('seating')}>
          ⚖ Seating needs rebalancing — tap to review moves
        </button>
      )}

      <div className="ctrl-clock">
        <div className="round-pill">{current?.isBreak ? 'BREAK' : current ? `Round ${rounds[idx]}` : '—'}</div>
        <div className={`timer ${urgent ? 'urgent' : ''}`}>{formatClock(live.remainingMs)}</div>
        <div className="total-time">Total {formatElapsed(live.totalElapsedMs)}</div>
        <div className="blind-now">{blindText(current)}</div>
        <div className="blind-next">Next: {blindText(next)}</div>
      </div>

      <button className={`big-toggle ${t.clock.running ? 'pause' : 'play'}`} onClick={() => send({ type: 'clock/toggle' })}>
        {t.clock.running ? '❚❚  Pause' : '▶  Resume'}
      </button>

      <div className="ctrl-grid">
        <button className="cbtn" onClick={() => send({ type: 'clock/skip', delta: -1 })}>⏮ Prev level</button>
        <button className="cbtn" onClick={() => send({ type: 'clock/skip', delta: 1 })}>Next level ⏭</button>
        <button className="cbtn" onClick={() => send({ type: 'clock/adjustRemainingMs', deltaMs: -60_000 })}>−1 min</button>
        <button className="cbtn" onClick={() => send({ type: 'clock/adjustRemainingMs', deltaMs: 60_000 })}>+1 min</button>
      </div>

      <div className="ctrl-stats">
        <Mini label="Players" value={String(playersRemaining(t))} />
        <Mini label="Total Chips" value={fmtChips(totalChips(t))} />
        <Mini label="Prize Pool" value={money(prizePool(t))} />
      </div>

      <div className="ctrl-tabs">
        {TABS.map((tab) => (
          <button key={tab.key} className="cbtn tab-open" onClick={() => setOpenTab(tab.key)}>{tab.label}</button>
        ))}
      </div>

      <div className="ctrl-grid">
        <button className="cbtn" onClick={() => setShowTournament(true)}>⚙ Tournament</button>
        <button className="cbtn" onClick={() => setShowRestore(true)}>⤺ Restore</button>
      </div>

      <TabModals open={openTab} onClose={() => setOpenTab(null)} db={db} />
      {showRestore && <RestoreModal onClose={() => setShowRestore(false)} />}
      {showTournament && <TournamentSettings onClose={() => setShowTournament(false)} db={db} />}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="mini-stat">
      <span className="ms-value">{value}</span>
      <span className="ms-label">{label}</span>
    </div>
  );
}

import { useEffect, useState } from 'react';
import {
  chipAverage,
  computePayouts,
  deriveClock,
  formatClock,
  formatElapsed,
  playersRemaining,
  prizePool,
  rebalanceKind,
  rebuyPeriodOpen,
  roundNumbers,
  totalChips,
  type Level,
} from '@poker/shared';
import { correctedNow, onAudio, useDB, useSend } from '../net/store.js';
import { useTick } from '../hooks.js';
import { armAudio, isArmed, playCue } from '../audio.js';
import { activeLevels, activePrize, chips as fmtChips, money, ORDINALS } from '../selectors.js';
import { TabModals, TABS, type TabName } from '../components/TabModals.js';
import { ConnectModal } from '../components/ConnectModal.js';
import { RestoreModal } from '../components/RestoreModal.js';

export function Display() {
  const db = useDB();
  const send = useSend();
  const [openTab, setOpenTab] = useState<TabName | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [fs, setFs] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const [armed, setArmed] = useState(isArmed());
  useTick(200);

  useEffect(() => onAudio(playCue), []);
  useEffect(() => {
    const onChange = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // In fullscreen, hide the top bar until the mouse moves to the top edge.
  useEffect(() => {
    if (!fs) {
      setNavHidden(false);
      return;
    }
    setNavHidden(true);
    const onMove = (e: MouseEvent) => setNavHidden(e.clientY > 72);
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [fs]);

  const toggleFs = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  };
  const enableSound = () => {
    armAudio();
    setArmed(true);
  };

  if (!db) return <div className="loading">Connecting…</div>;

  const t = db.tournament;
  const levels = activeLevels(db);
  const live = deriveClock(t.clock, correctedNow());
  const idx = live.levelIndex;
  const current: Level | undefined = levels[idx];
  const next: Level | undefined = levels[idx + 1];
  const rounds = roundNumbers(levels);
  const prize = activePrize(db);
  const payouts = computePayouts(prize, prizePool(t));
  const avg = chipAverage(t);
  const poolNotFinal = rebuyPeriodOpen(levels, idx);
  const urgent = live.remainingMs < 60_000 && live.remainingMs > 0;

  const play = () => {
    if (!armed) enableSound();
    send({ type: 'clock/toggle' });
  };

  return (
    <div className={`display${fs ? ' fullscreen' : ''}${fs && navHidden ? ' nav-hidden' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <span className="tname">{t.name}</span>
          <span className={`status ${t.clock.running ? 'live' : 'paused'}`}>{t.clock.running ? 'IN PLAY' : 'PAUSED'}</span>
        </div>
        <nav className="topnav">
          {t.anonymousCount == null && rebalanceKind(t.seating.tables, t.seating.maxPerTable) && (
            <button className="navlink seat-alert" onClick={() => setOpenTab('seating')}>⚖ Seating</button>
          )}
          {TABS.map((tab) => (
            <button key={tab.key} className="navlink" onClick={() => setOpenTab(tab.key)}>{tab.label}</button>
          ))}
          <button className="navlink" onClick={() => setShowConnect(true)}>📱 Phone</button>
          <button className="navlink" onClick={() => setShowRestore(true)}>⤺ Restore</button>
          {!armed && <button className="navlink accent" onClick={enableSound}>🔊 Enable sound</button>}
          <button className="navlink" onClick={toggleFs}>{fs ? '🡼 Exit' : '⛶ Fullscreen'}</button>
        </nav>
      </header>

      <main className="stage">
        <section className="col current">
          <BlindBlock label="Big Blind" value={current?.isBreak ? '—' : fmtChips(current?.bigBlind ?? 0)} big />
          <BlindBlock label="Small Blind" value={current?.isBreak ? '—' : fmtChips(current?.smallBlind ?? 0)} />
          <BlindBlock label="Ante" value={current && !current.isBreak && current.ante > 0 ? fmtChips(current.ante) : '—'} />
        </section>

        <section className="col center">
          <div className="round-pill">{current?.isBreak ? 'BREAK' : current ? `Round ${rounds[idx]}` : 'No structure'}</div>
          <div className={`timer ${urgent ? 'urgent' : ''}`}>{formatClock(live.remainingMs)}</div>
          <div className="total-time">Total time {formatElapsed(live.totalElapsedMs)}</div>
          <div className="clock-controls">
            <button className="round-btn" onClick={() => send({ type: 'clock/skip', delta: -1 })} title="Previous level">⏮</button>
            <button className="round-btn" onClick={() => send({ type: 'clock/adjustRemainingMs', deltaMs: -60_000 })} title="-1 min">−1m</button>
            <button className="play-btn" onClick={play}>{t.clock.running ? '❚❚' : '▶'}</button>
            <button className="round-btn" onClick={() => send({ type: 'clock/adjustRemainingMs', deltaMs: 60_000 })} title="+1 min">+1m</button>
            <button className="round-btn" onClick={() => send({ type: 'clock/skip', delta: 1 })} title="Next level">⏭</button>
          </div>
        </section>

        <section className="col next">
          <BlindBlock label="Next Big Blind" value={nextVal(next, 'big')} muted big />
          <BlindBlock label="Next Small Blind" value={nextVal(next, 'small')} muted />
          <BlindBlock label="Next Ante" value={nextVal(next, 'ante')} muted />
        </section>
      </main>

      <footer className="bottombar">
        <div className="panel">
          <Row label="Chip Average" value={avg == null ? 'N/A' : fmtChips(avg)} />
          <Row label="Total Chips" value={fmtChips(totalChips(t))} />
          <Row label="Players" value={String(playersRemaining(t))} />
        </div>

        <div className="panel schedule">
          <div className="panel-title">Upcoming</div>
          <ul className="mini-schedule">
            {levels.slice(idx + 1, idx + 5).map((l, i) => (
              <li key={idx + 1 + i}>
                {l.isBreak ? <span className="break-label">Break · {l.durationMins}m</span> : <span>{fmtChips(l.smallBlind)} / {fmtChips(l.bigBlind)}{l.ante > 0 ? ` (${fmtChips(l.ante)})` : ''}</span>}
              </li>
            ))}
            {idx + 1 >= levels.length && <li className="muted">End of structure</li>}
          </ul>
        </div>

        <div className="panel prizes-panel">
          <div className="panel-title">Prize Pool{poolNotFinal && <span className="not-final"> · not final</span>} <span className="pool">{money(prizePool(t))}</span></div>
          <div className="payouts">
            {payouts.length === 0 && <span className="muted">No prizes set</span>}
            {payouts.slice(0, 6).map((p, i) => (
              <div key={i} className="payout-cell">
                <span className="place">{ORDINALS[i]}</span>
                <span className="amt">{money(p)}</span>
              </div>
            ))}
          </div>
        </div>
      </footer>

      <TabModals open={openTab} onClose={() => setOpenTab(null)} db={db} />
      {showConnect && <ConnectModal onClose={() => setShowConnect(false)} />}
      {showRestore && <RestoreModal onClose={() => setShowRestore(false)} />}
    </div>
  );
}

function nextVal(next: Level | undefined, which: 'big' | 'small' | 'ante'): string {
  if (!next) return '—';
  if (next.isBreak) return which === 'big' ? 'BREAK' : '—';
  const v = which === 'big' ? next.bigBlind : which === 'small' ? next.smallBlind : next.ante;
  if (which === 'ante' && v === 0) return '—';
  return Math.round(v).toLocaleString('en-US');
}

function BlindBlock({ label, value, big, muted }: { label: string; value: string; big?: boolean; muted?: boolean }) {
  return (
    <div className={`blind-block ${muted ? 'muted' : ''}`}>
      <div className="bb-label">{label}</div>
      <div className={`bb-value ${big ? 'big' : ''}`}>{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-line">
      <span className="sl-label">{label}</span>
      <span className="sl-value">{value}</span>
    </div>
  );
}

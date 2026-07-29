import { useEffect, useRef, useState } from 'react';
import { Display } from './views/Display.js';
import { Control } from './views/Control.js';
import { onNotice, useConnected } from './net/store.js';

/** Minimal path-based routing: /control = phone/operator panel, else the TV display. */
function useRoute(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return path;
}

function useNoticeToast(): string | null {
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => onNotice((message) => {
    setNotice(message);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(null), 6000);
  }), []);
  return notice;
}

export function App() {
  const route = useRoute();
  const connected = useConnected();
  const notice = useNoticeToast();
  const isControl = route.startsWith('/control');

  return (
    <>
      {!connected && <div className="conn-banner">Reconnecting…</div>}
      {notice && <div className="toast" role="alert">{notice}</div>}
      {isControl ? <Control /> : <Display />}
    </>
  );
}

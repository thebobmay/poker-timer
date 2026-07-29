import { useEffect, useState } from 'react';
import { Modal } from './Modal.js';

interface Info { port: number; addresses: string[]; }

export function ConnectModal({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  useEffect(() => {
    fetch('/api/info').then((r) => r.json()).then(setInfo).catch(() => setInfo(null));
  }, []);

  const lan = (info?.addresses ?? []).filter((a) => a !== 'localhost');

  return (
    <Modal title="Connect your phone" onClose={onClose}>
      <div className="connect">
        <p className="hint">
          Put the phone and this laptop on the same network (a phone hotspot works — no internet needed),
          then open one of these addresses in the phone's browser:
        </p>
        {lan.length === 0 && <p className="muted">No LAN address found. Connect to a network/hotspot and reopen.</p>}
        <ul className="url-list">
          {lan.map((a) => (
            <li key={a}><code>http://{a}:{info?.port}/control</code></li>
          ))}
        </ul>
        <p className="hint">The phone stays in sync with this display automatically.</p>
      </div>
    </Modal>
  );
}

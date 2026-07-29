// HTTP + WebSocket host. Serves the built client (production) and runs the
// realtime sync: clients send Commands, the engine mutates state, and the full
// state (+ audio cues) is broadcast to everyone. One process, one port.

import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import {
  playersRemaining,
  prizePool,
  roundNumbers,
  type AudioCue,
  type ClientEnvelope,
  type DB,
  type ServerMessage,
} from '@poker/shared';
import { Engine } from './engine.js';
import { JsonFileStore } from './persistence.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const isProd = process.env.NODE_ENV === 'production';
/** How often to write a recovery snapshot while running (default 2 min). */
const SNAPSHOT_INTERVAL_MS = Number(process.env.SNAPSHOT_INTERVAL_MS ?? 120_000);
/** How often to persist the live clock to db.json (bounds clock loss on a crash). */
const CHECKPOINT_INTERVAL_MS = Number(process.env.CHECKPOINT_INTERVAL_MS ?? 15_000);
const publicDir = path.resolve(__dirname, '../public');
const dataFile = path.resolve(__dirname, '../data/db.json');

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

function broadcast(msg: ServerMessage): void {
  const payload = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

const store = new JsonFileStore(dataFile);
const engine = new Engine(store, {
  onBroadcast: () => broadcast({ type: 'state', db: engine.getDB(), serverNow: Date.now() }),
  onAudio: (cue: AudioCue) => broadcast({ type: 'audio', cue, serverNow: Date.now() }),
});

wss.on('connection', (socket) => {
  // Send a full snapshot immediately so the new client is in sync.
  socket.send(JSON.stringify({ type: 'state', db: engine.getDB(), serverNow: Date.now() } satisfies ServerMessage));

  socket.on('message', (raw) => {
    try {
      const env = JSON.parse(raw.toString()) as ClientEnvelope;
      if (!env || typeof env !== 'object' || !env.command) return;
      const notice = engine.apply(env.command);
      if (notice) socket.send(JSON.stringify({ type: 'error', message: notice } satisfies ServerMessage));
    } catch (err) {
      console.error('[ws] bad message:', err);
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid command' } satisfies ServerMessage));
    }
  });
});

app.use(express.json());

// LAN info so the UI can show a "connect your phone" URL.
app.get('/api/info', (_req, res) => {
  res.json({ port: PORT, addresses: lanAddresses() });
});

// List recovery snapshots (newest first) with a short summary of each.
app.get('/api/snapshots', async (_req, res) => {
  const list = await store.listSnapshots();
  const withSummary = await Promise.all(
    list.map(async (s) => {
      try {
        return { ...s, summary: summarize(await store.readSnapshot(s.file)) };
      } catch {
        return { ...s, summary: null };
      }
    }),
  );
  res.json(withSummary);
});

// Restore a snapshot into the live tournament (replaces current state).
app.post('/api/restore', async (req, res) => {
  const file = String((req.body as { file?: string })?.file ?? '');
  try {
    const db = await store.readSnapshot(file);
    engine.restore(db);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: String((err as Error)?.message ?? err) });
  }
});

if (isProd) {
  app.use(express.static(publicDir));
  // SPA fallback: any non-API GET returns index.html.
  app.get(/^(?!\/(api|ws)).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

function summarize(db: DB) {
  const t = db.tournament;
  const levels = db.blindStructures.find((s) => s.id === t.blindStructureId)?.levels ?? [];
  const rounds = roundNumbers(levels);
  const lvl = levels[t.clock.levelIndex];
  const round = lvl?.isBreak ? 'Break' : rounds[t.clock.levelIndex] != null ? `Round ${rounds[t.clock.levelIndex]}` : '—';
  return { name: t.name, round, players: playersRemaining(t), pool: prizePool(t), tables: t.seating.tables.length };
}

engine
  .init()
  .then(() => {
    setInterval(() => engine.snapshotNow(), SNAPSHOT_INTERVAL_MS);
    setInterval(() => engine.checkpoint(), CHECKPOINT_INTERVAL_MS);
    httpServer.listen(PORT, () => {
      console.log(`\n  Bob Poker Timer server running${isProd ? '' : ' (dev)'}  ·  snapshots every ${Math.round(SNAPSHOT_INTERVAL_MS / 1000)}s\n`);
      for (const addr of lanAddresses()) {
        console.log(`    Display:  http://${addr}:${PORT}/`);
        console.log(`    Control:  http://${addr}:${PORT}/control`);
      }
      console.log('');
    });
  })
  .catch((err) => {
    console.error('Failed to start engine:', err);
    process.exit(1);
  });

function lanAddresses(): string[] {
  const out: string[] = ['localhost'];
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

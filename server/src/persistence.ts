// Persistence behind a small interface so the JSON file store can be swapped for
// a real database later without touching domain code (CLAUDE.md §10).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { defaultDB, type DB } from '@poker/shared';

export interface SnapshotInfo {
  file: string;
  time: number; // mtime epoch ms
}

export interface Store {
  load(): Promise<DB>;
  save(db: DB): Promise<void>;
  /** Write a timestamped recovery snapshot (rotated). */
  writeSnapshot(db: DB): Promise<void>;
  /** List available snapshots, newest first. */
  listSnapshots(): Promise<SnapshotInfo[]>;
  /** Read a snapshot by file name (validated against the backups dir). */
  readSnapshot(file: string): Promise<DB>;
}

/** How many rotating snapshots to keep in server/data/backups/. */
const MAX_BACKUPS = 60;

export class JsonFileStore implements Store {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load(): Promise<DB> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as DB;
      if (!parsed || typeof parsed !== 'object' || !parsed.tournament) {
        throw new Error('malformed db');
      }
      // Snapshot the good state we just loaded, so every server start leaves a
      // recovery point of the previous session's data. Best-effort.
      await this.snapshotContents(raw);
      return parsed;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code && code !== 'ENOENT') {
        // The file existed but was unreadable/corrupt — preserve it before we
        // overwrite with a fresh seed, so nothing is silently destroyed.
        console.warn(`[store] could not read ${this.filePath} (${code}); backing it up and starting fresh.`);
        await this.preserveCorrupt();
      }
      const seeded = defaultDB();
      await this.save(seeded);
      return seeded;
    }
  }

  /** Serialized, atomic writes: temp file + rename so a crash never truncates the db. */
  save(db: DB): Promise<void> {
    this.queue = this.queue.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
      await fs.rename(tmp, this.filePath);
    });
    return this.queue;
  }

  async writeSnapshot(db: DB): Promise<void> {
    await this.snapshotContents(JSON.stringify(db, null, 2));
  }

  async listSnapshots(): Promise<SnapshotInfo[]> {
    try {
      const dir = this.backupsDir();
      const files = (await fs.readdir(dir)).filter(
        (f) => f.startsWith('db-') && f.endsWith('.json') && !f.startsWith('db-corrupt-'),
      );
      const infos = await Promise.all(
        files.map(async (f) => ({ file: f, time: (await fs.stat(path.join(dir, f))).mtimeMs })),
      );
      return infos.sort((a, b) => b.time - a.time);
    } catch {
      return [];
    }
  }

  async readSnapshot(file: string): Promise<DB> {
    // Path-traversal guard: must be a bare snapshot file name.
    const safe = path.basename(file);
    if (safe !== file || !safe.startsWith('db-') || !safe.endsWith('.json')) {
      throw new Error('invalid snapshot name');
    }
    const raw = await fs.readFile(path.join(this.backupsDir(), safe), 'utf8');
    const db = JSON.parse(raw) as DB;
    if (!db || typeof db !== 'object' || !db.tournament) throw new Error('malformed snapshot');
    return db;
  }

  private backupsDir(): string {
    return path.join(path.dirname(this.filePath), 'backups');
  }

  /** Write a timestamped copy of `contents` and prune to the newest MAX_BACKUPS. */
  private async snapshotContents(contents: string): Promise<void> {
    try {
      const dir = this.backupsDir();
      await fs.mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await fs.writeFile(path.join(dir, `db-${stamp}.json`), contents, 'utf8');
      // ISO timestamps sort lexicographically oldest-first; drop the excess.
      const files = (await fs.readdir(dir))
        .filter((f) => f.startsWith('db-') && f.endsWith('.json') && !f.startsWith('db-corrupt-'))
        .sort();
      for (const f of files.slice(0, Math.max(0, files.length - MAX_BACKUPS))) {
        await fs.rm(path.join(dir, f), { force: true });
      }
    } catch (e) {
      console.warn('[store] snapshot failed (non-fatal):', e);
    }
  }

  /** Keep a copy of a corrupt db.json so a fresh seed never destroys it. */
  private async preserveCorrupt(): Promise<void> {
    try {
      const dir = this.backupsDir();
      await fs.mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await fs.copyFile(this.filePath, path.join(dir, `db-corrupt-${stamp}.json`));
    } catch {
      /* best-effort */
    }
  }
}

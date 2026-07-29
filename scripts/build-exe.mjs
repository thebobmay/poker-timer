// Package the app into a standalone executable (no Node.js required to run it),
// using Node's built-in Single Executable Applications (SEA) feature.
//
// Pipeline: build single-file client -> bundle server to one CJS -> generate SEA
// blob -> copy the Node runtime -> inject the blob with postject.
//
// Run: npm run build:exe   →   dist/poker-timer.exe (Windows)

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { inject } from 'postject';

const isWin = process.platform === 'win32';
const dist = path.resolve('dist');
const exeName = isWin ? 'poker-timer.exe' : 'poker-timer';
const exePath = path.join(dist, exeName);
const blob = path.join(dist, 'sea-prep.blob');
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

// npm/npx are shell scripts (.cmd) on Windows → need shell; the node binary does not
// (and its path has spaces, which the shell would mis-split).
function run(label, cmd, args, { shell = false } = {}) {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell });
  if (r.status !== 0) {
    console.error(`\n✗ Failed: ${cmd} ${args.join(' ')}`);
    process.exit(r.status ?? 1);
  }
}

mkdirSync(dist, { recursive: true });

run('1/5  Build single-file client', 'npm', ['run', 'build'], { shell: isWin });
run('2/5  Bundle server', 'npm', ['run', 'bundle:server'], { shell: isWin });
run('3/5  Generate SEA blob', process.execPath, ['--experimental-sea-config', 'sea-config.json']);

console.log('\n▶ 4/5  Copy Node runtime → exe');
copyFileSync(process.execPath, exePath);

console.log('\n▶ 5/5  Inject app into exe (postject)');
await inject(exePath, 'NODE_SEA_BLOB', readFileSync(blob), {
  sentinelFuse: FUSE,
  ...(process.platform === 'darwin' ? { machoSegmentName: 'NODE_SEA' } : {}),
});

console.log(`\n✅ Built ${exePath}`);
console.log('   Copy it to a writable folder and run it — no Node.js needed.');
console.log('   It creates a "poker-timer-data" folder alongside itself and opens the display in your browser.\n');

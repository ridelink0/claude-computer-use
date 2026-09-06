// Runs every Computer Use suite in order and reports one verdict.
//
// Between suites it closes any test-target windows a prior suite may have left
// behind (a killed target process can outlive its own cleanup), and gives fresh
// hooks a moment to start delivering, so back-to-back runs are as stable as
// running each suite alone.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// build-test first (it compiles), then the pure-logic and driver suites, then
// the two that operate real windows, then the full MCP path.
const suites = [
  'policy-test.mjs',
  'sessions-test.mjs',
  'astra-test.mjs',
  'build-test.mjs',
  'verify.mjs',
  'presence-test.mjs',
  'host-test.mjs',
  'mcp-test.mjs',
  'batch-test.mjs',
];

async function sweepStrayWindows() {
  // Uses the driver directly to close anything titled like a test target.
  try {
    const { Driver } = await import('../server/driver.mjs');
    const d = new Driver({ onLog: () => {} });
    await d.start();
    const wins = (await d.call('list_apps', { include_hidden: true })).result.windows;
    for (const w of wins) {
      const m = /Computer Use Test Target (\d+)/.exec(w.title || '');
      if (!m) continue;
      // A target whose owning script is still alive belongs to a run in
      // progress - possibly another session's - and is left alone.
      let alive = false;
      try { process.kill(Number(m[1]), 0); alive = true; } catch (err) { alive = !!(err && err.code === 'EPERM'); }
      if (alive) continue;
      try { await d.call('close_window', { hwnd: w.hwnd, mode: 'take' }); } catch {}
    }
    await d.stop();
  } catch {}
}

async function main() {
  let failed = 0;
  const totals = [];

  for (const s of suites) {
    await sweepStrayWindows();
    console.log(`\n${'='.repeat(60)}\n  ${s}\n${'='.repeat(60)}`);
    const r = spawnSync(process.execPath, [path.join(HERE, s)], { stdio: 'inherit' });
    if (r.status !== 0) failed++;
    totals.push(`${s}: ${r.status === 0 ? 'PASS' : 'FAIL'}`);
  }
  await sweepStrayWindows();

  console.log(`\n${'='.repeat(60)}`);
  for (const t of totals) console.log('  ' + t);
  process.exit(failed ? 1 : 0);
}

main();

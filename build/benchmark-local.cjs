// Synthetic local-only benchmark: no provider, network, app data or project source is read.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { KnowledgeClient } = require('../knowledge-client');
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-benchmark-'));
  const client = new KnowledgeClient();
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  try {
    for (let i = 0; i < 150; i++)
      await fs.writeFile(
        path.join(root, `module-${i}.js`),
        `function renderWorkspace${i}() { return 'workspace'; }\n`.repeat(100),
      );
    const rows = [];
    for (const phase of ['cold', 'warm', 'warm']) {
      const start = performance.now();
      const result = await client.search(root, 'render workspace');
      rows.push({
        phase,
        durationMs: Math.round(performance.now() - start),
        indexed: result.indexed,
        refreshed: result.refreshed,
        bytesRead: result.bytesRead,
      });
    }
    console.log(
      JSON.stringify(
        {
          fixtureFiles: 150,
          runs: rows,
          mainEventLoopP95Ms: Math.round(delay.percentile(95) / 1000000),
          note: 'Synthetic project index benchmark; not provider latency or whole-app memory.',
        },
        null,
        2,
      ),
    );
  } finally {
    client.close();
    delay.disable();
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

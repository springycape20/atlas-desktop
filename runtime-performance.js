function createRuntimePerformance({ now = () => performance.now(), memory = () => process.memoryUsage() } = {}) {
  const durations = new Map();
  let startupMs = null;
  return {
    startup(ms) {
      startupMs = Math.max(0, Math.round(ms));
    },
    record(name, ms) {
      if (!['provider', 'knowledge'].includes(name) || !Number.isFinite(ms)) return;
      const rows = durations.get(name) || [];
      rows.push(Math.max(0, Math.round(ms)));
      durations.set(name, rows.slice(-40));
    },
    async measure(name, action) {
      const start = now();
      try {
        return await action();
      } finally {
        this.record(name, now() - start);
      }
    },
    snapshot() {
      const usage = memory();
      return {
        startupMs,
        mainProcessRssMB: Math.round(usage.rss / 1048576),
        mainProcessHeapMB: Math.round(usage.heapUsed / 1048576),
        samples: Object.fromEntries(
          [...durations].map(([name, rows]) => [
            name,
            {
              count: rows.length,
              latestMs: rows.at(-1),
              medianMs: [...rows].sort((a, b) => a - b)[Math.floor(rows.length / 2)],
            },
          ]),
        ),
      };
    },
  };
}
module.exports = { createRuntimePerformance };

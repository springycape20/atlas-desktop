const fs = require('node:fs/promises'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
function summary(runs) {
  const groups = new Map();
  for (const run of runs) {
    const key = run.caseName + '\0' + run.config.name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run);
  }
  return [...groups.values()].map((rows) => {
    const times = rows
        .map((row) => row.durationMs)
        .filter(Number.isFinite)
        .sort((a, b) => a - b),
      known = rows.filter((row) => Number.isFinite(row.usage?.inputTokens) && Number.isFinite(row.usage?.outputTokens));
    return {
      caseName: rows[0].caseName,
      configuration: rows[0].config.name,
      runs: rows.length,
      checksPassed: rows.filter(
        (row) =>
          row.configurationMatched !== false &&
          row.verification?.status === 'passed' &&
          row.verification.results?.length,
      ).length,
      medianMs: times.length
        ? (times[Math.floor((times.length - 1) / 2)] + times[Math.floor(times.length / 2)]) / 2
        : null,
      knownUsageRuns: known.length,
      inputTokens: known.length ? known.reduce((n, row) => n + row.usage.inputTokens, 0) : null,
      outputTokens: known.length ? known.reduce((n, row) => n + row.usage.outputTokens, 0) : null,
    };
  });
}
function createWorkflowBenchmarks({
  directory,
  sessions,
  workspace,
  runTask,
  approve,
  busy = () => false,
  version = 'development',
}) {
  const file = path.join(directory, 'workflow-benchmarks.json'),
    store = require('./atomic-store').createAtomicStore(file);
  let state, active, loading;
  function load() {
    return (loading ||= (async () => {
      state = JSON.parse(
        await fs.readFile(file, 'utf8').catch((e) => {
          if (e.code === 'ENOENT') return '{"suites":[],"runs":[]}';
          throw e;
        }),
      );
      for (const run of state.runs)
        if (run.status === 'running') {
          run.status = 'interrupted';
          run.error = 'ATLAS closed during this run. Start a fresh run; no request was replayed.';
        }
      return state;
    })());
  }
  const save = async () => {
    await store.save(state);
    await store.flush();
  };
  async function action(request = {}) {
    await load();
    if (request.action === 'status' || !request.action)
      return {
        suites: state.suites,
        runs: state.runs,
        active: active ? { suiteId: active.suiteId, completed: active.completed, total: active.total } : null,
      };
    if (request.action === 'cancel') {
      active?.controller.abort();
      return { cancelled: Boolean(active) };
    }
    if (request.action === 'remove-suite') {
      if (active) throw Error('Stop the active benchmark first.');
      const suite = state.suites.find((row) => row.id === request.id);
      if (!suite) throw Error('Benchmark suite unavailable.');
      suite.archived = true;
      await save();
      return { archived: true };
    }
    if (request.action === 'remove-run') {
      if (active) throw Error('Stop the active benchmark first.');
      state.runs = state.runs.filter((row) => row.id !== request.id);
      await save();
      return { removed: true };
    }
    if (request.action === 'summary')
      return summary(state.runs.filter((row) => row.suiteId === request.id && row.status !== 'running'));
    if (request.action === 'save') {
      if (active) throw Error('Stop the active benchmark before changing suites.');
      if (state.suites.length >= 20) throw Error('Up to 20 benchmark suites can be saved.');
      const checkpoint = (await sessions.action({ action: 'list' })).snapshots.find(
        (row) => row.id === request.checkpointId,
      );
      if (!checkpoint) throw Error('Choose a retained trial checkpoint.');
      const name = String(request.name || '')
          .trim()
          .slice(0, 100),
        cases = request.cases,
        configs = request.configs;
      if (
        !name ||
        !Array.isArray(cases) ||
        !cases.length ||
        cases.length > 8 ||
        !Array.isArray(configs) ||
        !configs.length ||
        configs.length > 4
      )
        throw Error('Supply a name, 1–8 cases and 1–4 configurations.');
      const cleaned = cases.map((row) => {
        if (!row.name?.trim() || !row.task?.trim() || row.task.length + String(row.criteria || '').length > 19800)
          throw Error('Each case needs a name and a task under 20,000 characters.');
        return {
          name: row.name.slice(0, 100),
          task: row.task,
          criteria: String(row.criteria || '').slice(0, 4000),
          checks: require('./workflow-templates').cleanChecks(row.checks),
        };
      });
      const configurations = configs.map((row) => {
        if (!row.name?.trim() || !['codex', 'claude', 'colab'].includes(row.provider))
          throw Error('Each configuration needs a name and codex, claude or colab provider.');
        if (row.provider === 'colab' ? !row.codexModel || !row.claudeModel : !row.model)
          throw Error('Pin explicit model IDs for reproducible configurations (both models for Colab).');
        for (const value of [row.model, row.codexModel, row.claudeModel])
          if (value && !/^[A-Za-z0-9._:/-]{1,100}$/.test(value)) throw Error('Invalid model identifier.');
        return {
          name: row.name.slice(0, 100),
          provider: row.provider,
          model: row.model || '',
          codexModel: row.codexModel || '',
          claudeModel: row.claudeModel || '',
          mode: ['build', 'debug', 'plan', 'compare'].includes(row.mode) ? row.mode : 'build',
          effort: ['low', 'medium', 'high', 'xhigh', 'max'].includes(row.effort) ? row.effort : 'medium',
          limits: require('./task-budgets').clean({
            enabled: true,
            seconds: row.seconds ?? 600,
            providerCalls: row.providerCalls ?? 8,
            repairAttempts: row.repairAttempts ?? 2,
            estimatedTokens: row.estimatedTokens ?? 64000,
            confirmEscalation: true,
          }),
        };
      });
      if (
        new Set(cleaned.map((row) => row.name)).size !== cleaned.length ||
        new Set(configurations.map((row) => row.name)).size !== configurations.length
      )
        throw Error('Case and configuration names must be unique.');
      const suite = {
        id: randomUUID(),
        name,
        checkpointId: checkpoint.id,
        checkpointDigest: checkpoint.digest,
        cases: cleaned,
        configs: configurations,
        at: Date.now(),
      };
      state.suites.push(suite);
      await save();
      return suite;
    }
    if (request.action === 'run') {
      if (active || busy()) throw Error('Finish other work before running benchmarks.');
      const suite = state.suites.find((row) => row.id === request.id),
        repeat = Number(request.repeat || 1);
      if (!suite || suite.archived || !Number.isInteger(repeat) || repeat < 1 || repeat > 5)
        throw Error('Choose a suite and 1–5 repeats.');
      const total = suite.cases.length * suite.configs.length * repeat;
      if (total > 12 || state.runs.length + total > 200)
        throw Error('At most 12 runs per batch and 200 retained results are supported.');
      const checkpoint = (await sessions.action({ action: 'list' })).snapshots.find(
        (row) => row.id === suite.checkpointId,
      );
      if (!checkpoint || checkpoint.digest !== suite.checkpointDigest)
        throw Error('Benchmark checkpoint changed or is unavailable.');
      if (
        !(await approve(
          'Run this benchmark batch?',
          suite.name +
            '\n' +
            total +
            ' separate provider tasks in fresh trial copies.\nConfigurations: ' +
            suite.configs
              .map(
                (row) =>
                  row.name +
                  ' (' +
                  row.provider +
                  '): ' +
                  row.limits.seconds +
                  ' seconds, ' +
                  row.limits.providerCalls +
                  ' ATLAS attempts, ' +
                  row.limits.repairAttempts +
                  ' repair passes, ~' +
                  row.limits.estimatedTokens +
                  ' outgoing text tokens',
              )
              .join('\n') +
            '\nChecks:\n' +
            suite.cases.map((row) => row.checks || '(none)').join('\n') +
            '\nProvider usage may be charged to your accounts. Project code/checks run with your permissions. Colab trials initialise local Git. No dependencies are installed and no result is merged into the original.',
        ))
      )
        return { cancelled: true };
      if (active || busy()) throw Error('Other work started while reviewing the benchmark.');
      if (suite.archived) throw Error('This suite was archived during review.');
      const controller = new AbortController();
      active = { suiteId: suite.id, controller, total, completed: 0 };
      try {
        batch: for (let repetition = 1; repetition <= repeat; repetition++)
          for (const testCase of suite.cases)
            for (const config of suite.configs) {
              if (controller.signal.aborted) break batch;
              if (busy()) throw Error('Other work started; remaining benchmark runs stopped.');
              const run = {
                id: randomUUID(),
                suiteId: suite.id,
                suiteName: suite.name,
                checkpointId: suite.checkpointId,
                checkpointDigest: suite.checkpointDigest,
                caseName: testCase.name,
                task: testCase.task,
                criteria: testCase.criteria,
                checks: testCase.checks,
                config,
                repetition,
                status: 'running',
                startedAt: Date.now(),
                environment: {
                  atlas: version,
                  node: process.versions.node,
                  platform: process.platform,
                  arch: process.arch,
                  providerVersion: null,
                },
              };
              state.runs.push(run);
              await save();
              try {
                const trial = await sessions.action({
                  action: 'fork',
                  id: suite.checkpointId,
                  name: 'Benchmark · ' + testCase.name + ' · ' + config.name,
                });
                run.trialId = trial.id;
                run.cwd = trial.cwd;
                const original = trial.profileId ? await workspace.profile(trial.profileId) : {};
                const profile = await workspace.profiles({
                  action: 'save',
                  profile: {
                    ...original,
                    id: trial.profileId || undefined,
                    cwd: trial.cwd,
                    name: 'Benchmark ' + config.name,
                    autoCheck: Boolean(testCase.checks),
                    checkCommands: testCase.checks,
                    codexModel: config.provider === 'codex' ? config.model : config.codexModel,
                    claudeModel: config.provider === 'claude' ? config.model : config.claudeModel,
                    effort: config.effort,
                  },
                });
                controller.signal.throwIfAborted();
                const result = await runTask({ trial, profile, config, testCase, signal: controller.signal });
                Object.assign(run, result, { status: result.status || 'completed' });
              } catch (error) {
                run.status = controller.signal.aborted ? 'cancelled' : 'failed';
                run.error = error.message;
              } finally {
                run.endedAt = Date.now();
                run.durationMs = run.endedAt - run.startedAt;
                active.completed++;
                await save();
              }
            }
      } finally {
        active = null;
      }
      return {
        completed: !controller.signal.aborted,
        cancelled: controller.signal.aborted,
        summary: summary(state.runs.filter((row) => row.suiteId === suite.id)),
      };
    }
    throw Error('Unknown benchmark action.');
  }
  return { action, dispose: () => active?.controller.abort() };
}
module.exports = { createWorkflowBenchmarks, summary };

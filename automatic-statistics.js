const fs = require('node:fs/promises'),
  path = require('node:path'),
  { randomUUID, randomBytes, createHash } = require('node:crypto');
const { createReport, periods } = require('./statistics-report');
const { validate, outcomes, features } = require('./statistics-schema');
function cleanEnvelope(value) {
  if (
    !value ||
    Object.keys(value).sort().join('|') !== 'deleteToken|report' ||
    !/^[a-f0-9]{64}$/.test(value.deleteToken || '')
  )
    throw Error('Invalid report envelope.');
  return { report: validate(value.report), deleteToken: value.deleteToken };
}
function configuration(value, localDemo = false) {
  if (!value?.enabled) return null;
  const url = new URL(value.endpoint);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/v1/reports')
    throw Error('Invalid statistics endpoint.');
  if (
    localDemo
      ? url.href !== 'http://127.0.0.1:43127/v1/reports'
      : url.protocol !== 'https:' ||
        url.port ||
        /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(url.hostname)
  )
    throw Error('Statistics requires the reviewed HTTPS service or the explicit local demo.');
  for (const key of ['operator', 'privacyUrl', 'contact', 'noticeVersion'])
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > 300)
      throw Error('Statistics notice is incomplete.');
  if (!localDemo && new URL(value.privacyUrl).protocol !== 'https:')
    throw Error('A public HTTPS privacy notice is required.');
  const safe = {
    endpoint: url.href,
    operator: value.operator,
    privacyUrl: value.privacyUrl,
    contact: value.contact,
    noticeVersion: value.noticeVersion,
    schema: 'atlas-statistics/v1',
    contract: {
      purpose: 'Improve ATLAS with retained-task samples',
      outcomes,
      features,
      rounding: 5,
      schedule: 'previous-completed-UTC-month',
    },
  };
  return { ...safe, fingerprint: createHash('sha256').update(JSON.stringify(safe)).digest('hex'), localDemo };
}
function createAutomaticStatistics({
  directory,
  jobs,
  version,
  config,
  localDemo = false,
  now = Date.now,
  fetcher = fetch,
}) {
  let cfg;
  try {
    cfg = configuration(config, localDemo);
  } catch {
    cfg = null;
  }
  const file = path.join(directory, 'automatic-statistics.json'),
    store = require('./atomic-store').createAtomicStore(file);
  let state,
    loading,
    controller,
    sending = false,
    generation = 0,
    preview;
  const empty = () => ({
    schema: 1,
    consent: null,
    receipts: [],
    sent: [],
    pending: null,
    lastAttempt: 0,
    result: 'No report sent.',
  });
  async function load() {
    if (!loading)
      loading = (async () => {
        try {
          state = JSON.parse(await fs.readFile(file, 'utf8'));
          if (
            state?.schema !== 1 ||
            !Array.isArray(state.receipts) ||
            state.receipts.length > 24 ||
            !Array.isArray(state.sent) ||
            state.sent.length > 24
          )
            throw Error('Invalid state');
          if (state.pending) state.pending = cleanEnvelope(state.pending);
          if (
            state.receipts.some(
              (row) =>
                !/^[a-f0-9]{64}$/.test(row.deleteToken || '') ||
                !/^[a-f0-9]{64}$/.test(row.fingerprint || '') ||
                !/^20\d\d-(0[1-9]|1[0-2])$/.test(row.period || '') ||
                !/^[-a-f0-9]{36}$/.test(row.reportId || ''),
            )
          )
            throw Error('Invalid receipts');
          if (!Number.isFinite(state.lastAttempt) || state.lastAttempt < 0) throw Error('Invalid schedule');
        } catch (error) {
          if (error.code !== 'ENOENT')
            throw Error('Cannot read automatic-reporting choices. Reporting remains disabled.');
          state = empty();
        }
        return state;
      })();
    return loading;
  }
  const save = async () => {
    await store.save(state);
    await store.flush();
  };
  const enabled = () => Boolean(cfg && state?.consent?.fingerprint === cfg.fingerprint);
  const status = () => ({
    configured: Boolean(cfg),
    enabled: enabled(),
    localDemo: cfg?.localDemo || false,
    recipient: cfg
      ? {
          operator: cfg.operator,
          endpoint: cfg.endpoint,
          privacyUrl: cfg.privacyUrl,
          contact: cfg.contact,
          noticeVersion: cfg.noticeVersion,
        }
      : null,
    result: state?.result || 'No report sent.',
    receipts: (state?.receipts || []).map((row) => ({ reportId: row.reportId, period: row.period })),
    schedule:
      'One retained-task sample for the previous completed UTC month, beginning with the opt-in month. No backfill before opt-in.',
  });
  const envelope = (period) => ({
    report: createReport({ jobs: jobs(), version, period, now: now() }),
    deleteToken: randomBytes(32).toString('hex'),
  });
  async function transmit(value) {
    value = cleanEnvelope(value);
    if (!enabled() || sending) return status();
    sending = true;
    const revision = generation;
    controller = new AbortController();
    const active = controller;
    const timer = setTimeout(() => active.abort(), 10000);
    timer.unref?.();
    try {
      if (!enabled() || revision !== generation) return status();
      state.lastAttempt = now();
      if (!state.receipts.some((row) => row.reportId === value.report.reportId))
        state.receipts.push({
          reportId: value.report.reportId,
          period: value.report.period,
          deleteToken: value.deleteToken,
          fingerprint: cfg.fingerprint,
          endpoint: cfg.endpoint,
        });
      state.receipts = state.receipts.slice(-24);
      await save();
      if (!enabled() || revision !== generation) return status();
      const response = await fetcher(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
        signal: active.signal,
        redirect: 'error',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      await response.body?.cancel();
      if (!response.ok) throw Error('Report not accepted');
      if (!enabled() || revision !== generation) return status();
      state.sent = [...new Set([...state.sent, value.report.period])].slice(-24);
      state.pending = null;
      state.result = 'A statistics sample was accepted. Retain its receipt for deletion.';
      await save();
    } catch {
      if (revision === generation) {
        state.result =
          'Report not confirmed. Retry waits at least 24 hours; a retained receipt can request deletion even if delivery was uncertain.';
        await save();
      }
    } finally {
      clearTimeout(timer);
      if (controller === active) controller = null;
      sending = false;
    }
    return status();
  }
  async function tick() {
    await load();
    if (!enabled() || sending) return status();
    const period = periods(now())[1];
    if (period < state.consent.startPeriod || state.sent.includes(period) || now() - state.lastAttempt < 86400000)
      return status();
    if (!state.pending || state.pending.report.period !== period) state.pending = envelope(period);
    const total = Object.values(state.pending.report.outcomes).reduce((a, b) => a + b, 0);
    if (!total) {
      state.pending = null;
      state.result = 'No rounded retained activity for the due month; nothing sent.';
      state.lastAttempt = now();
      await save();
      return status();
    }
    await save();
    return transmit(state.pending);
  }
  async function action(request = {}) {
    await load();
    if (request.action === 'status') return status();
    if (request.action === 'disable') {
      generation++;
      controller?.abort();
      preview = null;
      state.consent = null;
      state.pending = null;
      state.result = 'Automatic reporting is off. Already received reports require a separate deletion request.';
      await save();
      return status();
    }
    if (request.action === 'preview') {
      if (!cfg) throw Error('No receiving service is configured. Automatic reporting is unavailable.');
      preview = { token: randomUUID(), expires: now() + 300000, payload: envelope(periods(now())[0]) };
      return { ...status(), token: preview.token, payload: preview.payload };
    }
    if (request.action === 'enable') {
      if (!cfg || request.confirmed !== true || !preview || request.token !== preview.token || preview.expires < now())
        throw Error('Review the recipient and sample, then explicitly opt in.');
      generation++;
      state.consent = { fingerprint: cfg.fingerprint, startPeriod: periods(now())[0] };
      state.pending = null;
      state.result = 'Opted in. No report was sent by enabling.';
      await save();
      return status();
    }
    if (request.action === 'discard') {
      preview = null;
      return status();
    }
    if (request.action === 'send-demo') {
      if (
        !cfg?.localDemo ||
        !enabled() ||
        request.confirmed !== true ||
        !preview ||
        preview.token !== request.token ||
        preview.expires < now()
      )
        throw Error('A reviewed, enabled local demo is required.');
      if (state.sent.includes(preview.payload.report.period))
        throw Error('A sample for this month was already accepted.');
      return transmit(preview.payload);
    }
    if (request.action === 'delete') {
      if (request.confirmed !== true || !cfg) throw Error('Confirm a deletion request to the configured recipient.');
      generation++;
      controller?.abort();
      state.consent = null;
      state.pending = null;
      preview = null;
      await save();
      const rows = state.receipts.filter((row) => !request.reportId || row.reportId === request.reportId);
      for (const row of rows) {
        if (row.endpoint ? row.endpoint !== cfg.endpoint : row.fingerprint !== cfg.fingerprint)
          throw Error('The recipient configuration changed. Contact the previous operator about older receipts.');
        const response = await fetcher(cfg.endpoint, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reportId: row.reportId, deleteToken: row.deleteToken }),
          signal: AbortSignal.timeout(10000),
          redirect: 'error',
          credentials: 'omit',
        });
        await response.body?.cancel();
        if (!response.ok) throw Error('Deletion not confirmed. Keep the receipt and try again.');
        state.receipts = state.receipts.filter((item) => item.reportId !== row.reportId);
        await save();
      }
      state.result =
        'Receiver confirmed removal of report counters. An anti-replay receipt can remain until retention expires. Separate exports and backups require operator handling.';
      await save();
      return status();
    }
    if (request.action === 'check') return tick();
    throw Error('Unknown automatic statistics action.');
  }
  return {
    action,
    tick,
    stop() {
      generation++;
      controller?.abort();
      preview = null;
      return store.flush();
    },
  };
}
module.exports = { configuration, createAutomaticStatistics };

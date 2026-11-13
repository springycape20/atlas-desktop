(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.atlasQol = api;
})(typeof window === 'object' ? window : globalThis, () => {
  function errorInfo(error) {
    const detail = String(error?.message || error || 'Unknown error')
      .replace(/^Error invoking remote method '[^']+': Error: /, '')
      .replace(/Bearer\s+\S+|sk-(?:ant-)?[\w-]{12,}/gi, '[redacted]')
      .slice(0, 12000);
    if (/authenticate|authentication|oauth|sign.?in|logged.?in|expired.*(?:session|token)/i.test(detail))
      return {
        title: 'Provider sign-in needs attention',
        help: 'Check your provider connection, then review any partial changes before retrying.',
        action: 'connection',
        detail,
      };
    if (
      /usage.limit|quota|cool.?down|rate.limit|allowance|(?:weekly|session|daily).limit|hit.{0,30}limit/i.test(detail)
    )
      return {
        title: 'Provider usage limit reached',
        help: 'Check the account allowance and reset time. Your task may have made partial changes.',
        action: 'usage',
        detail,
      };
    if (/permission|denied|not.authori[sz]ed/i.test(detail))
      return {
        title: 'Permission is needed',
        help: 'Review the task and its permission requests before continuing.',
        action: 'review',
        detail,
      };
    if (/cancelled|canceled|declined/i.test(detail))
      return {
        title: 'Task stopped',
        help: 'Nothing will resume automatically. Review current progress when you are ready.',
        action: 'review',
        detail,
      };
    return {
      title: 'The task could not finish',
      help: 'Review the result and any partial changes before retrying.',
      action: 'review',
      detail,
    };
  }
  const exactTime = (value) =>
    new Date(value).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short' }) +
    ' (Sydney)';
  function resetTime(value, now = Date.now()) {
    if (!Number.isFinite(value) || value <= 0) return 'Reset time unavailable';
    if (value <= now) return 'Reset time passed';
    const minutes = Math.ceil((value - now) / 60000),
      days = Math.floor(minutes / 1440),
      hours = Math.floor((minutes % 1440) / 60),
      rest = minutes % 60;
    return 'Resets in ' + [days && days + 'd', hours && hours + 'h', rest && rest + 'm'].filter(Boolean).join(' ');
  }
  function badge(jobs, approvals = [], readAt = Date.now()) {
    const alive = jobs.filter((job) => !job.archived);
    if (approvals.some((a) => alive.some((job) => job.id === a.jobId))) return 'Needs approval';
    if (alive.some((job) => ['running', 'queued', 'starting'].includes(job.status))) return 'Running';
    const latest = alive.slice().sort((a, b) => (b.endedAt || b.startedAt || 0) - (a.endedAt || a.startedAt || 0))[0];
    if (!latest) return '';
    if (['failed', 'needs_attention', 'limit_reached', 'paused'].includes(latest.status) && !latest.dismissedAttention)
      return 'Needs attention';
    return latest.status === 'completed' && (latest.endedAt || latest.startedAt || 0) > readAt ? 'New result' : '';
  }
  function createDraftStore(storage, now = Date.now) {
    const key = 'atlas.draft-recovery.v1';
    const read = () => {
      const rows = JSON.parse(storage.getItem(key) || '[]');
      return Array.isArray(rows)
        ? rows
            .slice(0, 100)
            .filter(
              (r) =>
                typeof r?.key === 'string' &&
                r.key.length <= 4096 &&
                typeof r.text === 'string' &&
                r.text.length <= 128000 &&
                Number.isFinite(r.at),
            )
        : [];
    };
    const write = (rows) => {
      rows = rows.sort((a, b) => b.at - a.at).slice(0, 30);
      while (rows.reduce((sum, row) => sum + row.text.length, 0) > 512000) rows.pop();
      storage.setItem(key, JSON.stringify(rows));
    };
    return {
      identity: (id, cwd) =>
        JSON.stringify([
          id || 'new',
          String(cwd || '')
            .replace(/\\/g, '/')
            .toLowerCase(),
        ]),
      get: (id) => read().find((row) => row.key === id)?.text || '',
      put(id, text) {
        if (text.length > 128000) throw Error('Draft is too large for automatic recovery. Copy it somewhere safe.');
        const rows = read().filter((row) => row.key !== id);
        if (text) rows.push({ key: id, text, at: now() });
        write(rows);
      },
      remove(id) {
        write(read().filter((row) => row.key !== id));
      },
    };
  }
  return { errorInfo, exactTime, resetTime, badge, createDraftStore };
});

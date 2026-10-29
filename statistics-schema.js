(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.atlasStatistics = api;
})(globalThis, function () {
  const outcomes = ['completed', 'failed', 'cancelled'];
  const features = ['colabTasks', 'isolatedTasks', 'tasksWithChecks', 'tasksWithSetup'];
  const labels = {
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
    colabTasks: 'Colab tasks',
    isolatedTasks: 'Isolated tasks',
    tasksWithChecks: 'Completion checks',
    tasksWithSetup: 'Environment setup',
  };
  function object(value, keys) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).sort().join('|') !== [...keys].sort().join('|')
    )
      throw Error('Report contains missing or unexpected fields.');
  }
  function validate(value) {
    object(value, ['schema', 'reportId', 'period', 'versionFamily', 'coverage', 'rounding', 'outcomes', 'features']);
    if (value.schema !== 'atlas-statistics/v1' || value.coverage !== 'retained-task-sample' || value.rounding !== 5)
      throw Error('Unsupported report format.');
    if (
      typeof value.reportId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.reportId)
    )
      throw Error('Invalid report receipt.');
    if (typeof value.period !== 'string' || !/^20\d\d-(0[1-9]|1[0-2])$/.test(value.period))
      throw Error('Invalid reporting month.');
    if (typeof value.versionFamily !== 'string' || !/^\d{1,2}\.\d{1,2}$/.test(value.versionFamily))
      throw Error('Invalid release family.');
    object(value.outcomes, outcomes);
    object(value.features, features);
    const count = (value) => {
      if (!Number.isSafeInteger(value) || value < 0 || value > 10000 || value % 5)
        throw Error('Counts must be bounded multiples of five.');
      return value;
    };
    const clean = {
      schema: value.schema,
      reportId: value.reportId,
      period: value.period,
      versionFamily: value.versionFamily,
      coverage: value.coverage,
      rounding: 5,
      outcomes: {},
      features: {},
    };
    for (const key of outcomes) clean.outcomes[key] = count(value.outcomes[key]);
    const total = outcomes.reduce((sum, key) => sum + clean.outcomes[key], 0);
    if (total > 10000) throw Error('Report exceeds the task limit.');
    for (const key of features) {
      clean.features[key] = count(value.features[key]);
      if (clean.features[key] > total) throw Error('Feature count exceeds reported tasks.');
    }
    return clean;
  }
  function aggregate(reports) {
    const result = {
      reports: 0,
      tasks: 0,
      outcomes: Object.fromEntries(outcomes.map((key) => [key, 0])),
      features: Object.fromEntries(features.map((key) => [key, 0])),
      versions: {},
      months: {},
    };
    const seen = new Set();
    for (const input of reports) {
      const row = validate(input);
      if (seen.has(row.reportId)) continue;
      seen.add(row.reportId);
      result.reports++;
      for (const key of outcomes) result.outcomes[key] += row.outcomes[key];
      for (const key of features) result.features[key] += row.features[key];
      result.versions[row.versionFamily] = (result.versions[row.versionFamily] || 0) + 1;
      result.months[row.period] = (result.months[row.period] || 0) + 1;
    }
    result.tasks = outcomes.reduce((sum, key) => sum + result.outcomes[key], 0);
    return result;
  }
  return { validate, aggregate, outcomes, features, labels };
});

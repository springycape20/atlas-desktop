function recoverSavedJob(saved) {
  const interrupted = saved.status === 'running';
  const status = interrupted ? 'paused' : saved.status;
  return {
    ...saved,
    status,
    statusText: interrupted ? 'Interrupted when ATLAS closed. Review changes before resuming.' : saved.statusText,
    recoveryNote: interrupted
      ? 'The last request may have changed files. ATLAS has not replayed it. Inspect the changes and saved stages before resuming.'
      : saved.recoveryNote || '',
    graph: saved.graph ? require('./colab-graph').terminal(saved.graph, status, saved.verification) : undefined,
    child: null,
  };
}
module.exports = { recoverSavedJob };

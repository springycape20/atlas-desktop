async function parallelProposals({
  providers,
  prompt,
  cwd,
  settings,
  runProvider,
  readFingerprint,
  signal,
  prepared = {},
  key,
  onPrepared = async () => {},
  valid = () => true,
}) {
  const controller = new AbortController(),
    abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  let requests = [];
  try {
    const before = await readFingerprint();
    if (controller.signal.aborted) throw Error('Collaboration stopped.');
    requests = providers.map((provider) =>
      (async () => {
        const cached = prepared[provider];
        if (
          cached?.key === key &&
          before &&
          cached.before === before &&
          cached.after === before &&
          valid(cached.result)
        )
          return cached;
        const result = await runProvider(
            provider,
            prompt,
            cwd,
            { ...settings, stageSignal: controller.signal },
            '',
            () => {},
          ),
          entry = { key, result, before, after: await readFingerprint() };
        if (before && entry.after === before && valid(result)) await onPrepared(provider, entry);
        return entry;
      })(),
    );
    const settled = await Promise.allSettled(requests);
    if (controller.signal.aborted) throw Error('Collaboration stopped.');
    // Successful siblings are already journalled. Preserve the real provider
    // failure instead of inventing a completed pass with a synthetic verdict.
    const failed = settled.find((item) => item.status === 'rejected');
    if (failed) throw failed.reason;
    return settled.map((item) => item.value);
  } finally {
    controller.abort();
    signal?.removeEventListener('abort', abort);
  }
}
module.exports = { parallelProposals };

function plan({
  settings,
  choice,
  tier = 'auto',
  pinned = false,
  provider,
  verification,
  changedFiles = 0,
  stopped = false,
}) {
  if (
    !settings.checkDrivenEscalation ||
    !settings.modelRoutingEnabled ||
    settings.readOnly ||
    (provider === 'codex' && settings.codexSandbox === 'read-only') ||
    tier !== 'auto' ||
    pinned ||
    stopped ||
    !['codex', 'claude'].includes(provider)
  )
    return null;
  const key = provider === 'codex' ? 'Codex' : 'Claude',
    fast = settings['fast' + key + 'Model'],
    strong = settings['strong' + key + 'Model'];
  if (!fast || !strong || fast === strong || choice?.model !== fast || !changedFiles) return null;
  const rows = verification?.results || [];
  if (
    verification?.status !== 'failed' ||
    !rows.length ||
    !rows.every((row) => ['passed', 'failed'].includes(row.status)) ||
    !rows.some((row) => row.status === 'failed' && Number.isInteger(row.exitCode) && row.exitCode !== 0)
  )
    return null;
  return {
    provider,
    from: fast,
    model: strong,
    reason: 'One stronger-model repair after executed checks failed on changed files.',
  };
}
async function repairOnce({ plan: selected, run, verify, signal }) {
  if (!selected) return null;
  signal?.throwIfAborted();
  const result = await run(selected);
  signal?.throwIfAborted();
  const verification = await verify();
  return { result, verification, escalation: { ...selected, attempted: true, status: verification.status } };
}
module.exports = { plan, repairOnce };

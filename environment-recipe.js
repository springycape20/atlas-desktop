async function runRecipe({ profile, cwd, signal, ask, runner, progress = () => {}, readOnly = false }) {
  if (readOnly || !profile?.environmentPrompt) return { status: 'skipped', results: [] };
  const commands = String(profile.environmentCommands || '')
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);
  if (!commands.length) return { status: 'skipped', results: [] };
  if (commands.length > 8 || commands.join('\n').length > 4000)
    throw Error('Environment setup supports up to eight commands and 4000 characters.');
  signal?.throwIfAborted();
  const answer = await ask({
    title: 'Run this project environment recipe?',
    details:
      'Workspace: ' +
      cwd +
      '\n\nRequirements (not automatically verified):\n' +
      (profile.environmentTools || 'None recorded') +
      '\n\nCommands:\n' +
      commands.join('\n') +
      '\n\nThese commands may download packages and execute project code. Setup may repeat for another task in this workspace.',
    choices: ['Run setup', 'Skip setup', 'Cancel task'],
    remember: false,
  });
  signal?.throwIfAborted();
  if (answer === 'Skip setup') return { status: 'skipped', results: [] };
  if (answer !== 'Run setup') throw Error('Environment setup cancelled.');
  const results = [];
  for (const command of commands) {
    signal?.throwIfAborted();
    progress(command);
    const result = await runner(command, cwd, { signal });
    results.push(result);
    if (result.status !== 'passed') return { status: 'failed', results };
  }
  return { status: 'passed', results };
}
module.exports = { runRecipe };

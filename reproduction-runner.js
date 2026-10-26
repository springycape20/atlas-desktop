const command = require('./provider-command');
// Debug mode: ATLAS runs the provider's reproduction command itself, before and after the fix.
function runReproduction(value, options = {}) {
  return command.runProviderCommand(value, {
    phase: 'before',
    ...options,
    title: 'Run the bug reproduction?',
    purpose: 'ATLAS runs this provider-written command to confirm the bug fails before the fix and passes after it.',
  });
}
module.exports = {
  runReproduction,
  failsAsExpected: command.failsAsExpected,
  passes: command.passes,
  summarize: command.summarize,
  configuredChecks: command.configuredChecks,
};

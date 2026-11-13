const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
test('new renderer assets are served by the production protocol allowlist', () => {
  const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8'),
    html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  for (const file of [
    'work-overview.js',
    'work-overview.css',
    'project-home-ui.js',
    'composer-context-ui.js',
    'task-workflow.js',
    'provider-recovery-ui.js',
    'task-outcomes-ui.js',
    'semantic-solutions-ui.js',
    'setup-assistant-ui.js',
    'connected-workbench-ui.js',
    'activity-model.js',
    'activity-ui.js',
    'activity.css',
    'task-experience.js',
    'task-start-ui.js',
    'thinking-ui.js',
    'qol-model.js',
    'qol-ui.js',
  ]) {
    assert(html.includes('/' + file));
    assert(main.includes("'/" + file + "'"), 'Missing production allowlist: ' + file);
  }
});

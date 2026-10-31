const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const builtins = [
  {
    id: 'builtin-bug',
    name: 'Fix a bug',
    mode: 'debug',
    task: 'Reproduce and fix: ',
    criteria: 'A reproducible failure passes after the fix.\nRelated behaviour still works.',
    outOfScope: 'Unrelated refactoring.',
    checks: '',
  },
  {
    id: 'builtin-security',
    name: 'Review security',
    mode: 'plan',
    task: 'Review this project for security issues. Cite affected files, concrete risks and recommended fixes.',
    criteria: 'Findings include evidence and affected paths.\nClearly separate verified issues from uncertainty.',
    outOfScope: 'Editing files or using real credentials.',
    checks: '',
  },
  {
    id: 'builtin-feature',
    name: 'Build a feature',
    mode: 'build',
    task: 'Implement: ',
    criteria: 'The requested behaviour works.\nAppropriate project checks pass.',
    outOfScope: 'Unrelated changes.',
    checks: '',
  },
  {
    id: 'builtin-browser',
    name: 'Verify a browser change',
    mode: 'build',
    task: 'Implement the requested browser change: ',
    steps:
      'Inspect current behavior. Capture a preview baseline. Make the scoped change. Run project checks and browser assertions. Compare screenshots at desktop and narrow widths. Review the final diff.',
    criteria:
      'Requested interactions pass.\nBrowser evidence and changed screenshots are reviewed.\nProject checks pass.',
    outOfScope: 'Publishing or changing unrelated behavior.',
    checks: '',
  },
  {
    id: 'builtin-performance',
    name: 'Improve measured performance',
    mode: 'build',
    task: 'Improve this measured project performance problem: ',
    steps:
      'Define a reproducible scenario. Record baseline timings and memory. Identify an evidence-backed bottleneck. Change one cause. Repeat measurements under the same conditions. Run checks and compare the diff.',
    criteria:
      'Baseline and candidate use the same scenario.\nActual measurements and limitations are reported.\nBehavior and project checks still pass.',
    outOfScope: 'Speculative rewrites or unsupported speed claims.',
    checks: '',
  },
  {
    id: 'builtin-resumable',
    name: 'Build in verified milestones',
    mode: 'build',
    task: 'Implement this larger task in small verified milestones: ',
    steps:
      'Inspect architecture and agree acceptance criteria. Divide work into ordered milestones. Complete a focused milestone and execute its checks. Preserve progress and remaining work in a reviewed milestone handover. Resume from verified evidence. Review the combined result.',
    criteria:
      'Each completed milestone has executed check evidence.\nRemaining work is explicit.\nThe combined result meets acceptance criteria.',
    outOfScope: 'Replaying completed work or silently exceeding scope.',
    checks: '',
  },
  {
    id: 'builtin-release',
    name: 'Prepare a release',
    mode: 'build',
    task: 'Prepare the next release locally: review changes, run checks and draft release notes. Ask before remote publication.',
    criteria: 'Version and release notes agree.\nChecks are recorded with their actual results.',
    outOfScope: 'Pushing, merging, tagging or publishing without approval.',
    checks: '',
  },
].map((row) => ({ ...row, builtin: true }));
function cleanChecks(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12)
    .join('\n')
    .slice(0, 4000);
}
function workflowProject(project, checks) {
  const checkCommands = cleanChecks(checks);
  return checkCommands ? { ...(project || {}), checkCommands, autoCheck: true } : project;
}
function createWorkflowTemplates(directory) {
  const file = path.join(directory, 'workflow-templates.json');
  const store = require('./atomic-store').createAtomicStore(file);
  let rows,
    lock = Promise.resolve();
  async function action(request = {}) {
    const work = lock.then(async () => {
      if (!rows) {
        try {
          const value = JSON.parse(await fs.readFile(file, 'utf8'));
          rows = Array.isArray(value) ? value.slice(0, 50) : [];
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          rows = [];
        }
      }
      if (request.action === 'save') {
        const input = request.template || {};
        const name = String(input.name || '')
            .trim()
            .slice(0, 100),
          task = String(input.task || '')
            .trim()
            .slice(0, 20000);
        if (!name || !task) throw Error('Give the workflow a name and task.');
        const id = rows.some((row) => row.id === input.id) ? input.id : randomUUID();
        if (rows.length >= 50 && !rows.some((row) => row.id === id))
          throw Error('Up to 50 saved workflows are supported.');
        const row = {
          id,
          name,
          task,
          mode: ['build', 'debug', 'plan', 'compare'].includes(input.mode) ? input.mode : 'build',
          criteria: String(input.criteria || '').slice(0, 4000),
          outOfScope: String(input.outOfScope || '').slice(0, 2000),
          checks: cleanChecks(input.checks),
          steps: String(input.steps || '').slice(0, 6000),
          stopConditions: String(
            input.stopConditions ||
              'Do not complete until required checks pass; ask for input when a required decision or permission is unresolved.',
          ).slice(0, 2000),
          builtin: false,
        };
        rows = rows.filter((item) => item.id !== id).concat(row);
        await store.save(rows);
        await store.flush();
      } else if (request.action === 'delete') {
        rows = rows.filter((row) => row.id !== request.id);
        await store.save(rows);
        await store.flush();
      }
      return structuredClone([...builtins, ...rows]);
    });
    lock = work.catch(() => {});
    return work;
  }
  return { action };
}
module.exports = { createWorkflowTemplates, cleanChecks, workflowProject };

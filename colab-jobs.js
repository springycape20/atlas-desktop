const path = require('node:path');
const { existsSync, statSync } = require('node:fs');
const { mkdir, writeFile } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
// Starts and runs Colab tasks: cleans the request, prepares the workspace, runs the builder–reviewer
// collaboration, then runs the task checks and reports status to the window that asked.
// load is main.js's require, so tests that replace ./collaboration or ./project-tools through main.js keep working.
function createColabJobs({
  trusted,
  jobs,
  emit,
  persist,
  flush,
  providerHealth,
  findCodexExecutable,
  findClaudeExecutable,
  canResumeSession,
  modelIdPattern,
  workspace,
  changes,
  projectContext,
  knowledge,
  memoryContext,
  integrations,
  approvals,
  taskChecks,
  taskNotifications,
  jobContext,
  beginChanges,
  finishTask,
  recordResumeCheckpoint,
  canStart = () => true,
  readSettings,
  runProvider,
  reportsFolder,
  quitting,
  load,
}) {
  function publishGraph(job, graph, event) {
    if (!graph) return;
    job.graph = { ...graph, revision: (job.graph?.revision || 0) + 1 };
    if (!event.sender.isDestroyed())
      event.sender.send('atlas:collab-status', {
        id: job.id,
        chatId: job.colabChatId,
        graphRunId: job.graphRunId,
        graph: job.graph,
      });
  }
  // queued marks a job the task queue started; only runQueued sets it, never the window's request.
  async function start(event, input, { queued = false, preparedWorkspace = null } = {}) {
    if (!trusted(event)) throw Error('Untrusted app window.');
    if (!canStart()) throw Error('Stop the terminal or repair loop before starting another task.');
    const previous = input?.resumeJobId ? jobs.get(input.resumeJobId) : null;
    if (input?.resumeJobId && (!previous?.collaboration || !previous.request || previous.status === 'running'))
      throw Error('Choose a stopped Colab task with a saved checkpoint.');
    if (previous) await require('./verified-recovery').requireVerifiedRecovery(previous, changes());
    const source = previous
      ? {
          ...previous.request,
          ...(Object.hasOwn(input, 'maxRounds') ? { maxRounds: input.maxRounds } : {}),
          ...(Object.hasOwn(input, 'tokenWarning') ? { tokenWarning: input.tokenWarning } : {}),
          ...(!previous.workspaceId && !previous.checkpoints?.length && typeof input.isolated === 'boolean'
            ? { isolated: input.isolated }
            : {}),
        }
      : input || {};
    const task = typeof source.task === 'string' ? source.task.trim() : '',
      folder = typeof source.cwd === 'string' ? source.cwd : '';
    if (!task || task.length > 20000) throw Error('Enter a task under 20,000 characters.');
    if (!path.isAbsolute(folder) || !existsSync(folder) || !statSync(folder).isDirectory())
      throw Error('Choose an existing working folder.');
    if (!providerHealth().available('codex') || !providerHealth().available('claude'))
      throw Error('Colab needs both providers available. Check Settings.');
    if (!findCodexExecutable() || !findClaudeExecutable())
      throw Error('Install and sign into both providers in Settings before starting Colab.');
    const model = (value) => (typeof value === 'string' && modelIdPattern.test(value) ? value : '');
    const efficiency = require('./colab-efficiency');
    const request = {
      workspaceId:
        typeof source.workspaceId === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(source.workspaceId)
          ? source.workspaceId
          : '',
      preset: efficiency.preset(source.preset),
      milestones: ['auto', 'on', 'off'].includes(source.milestones) ? source.milestones : 'auto',
      rolesExplicit: source.rolesExplicit === true,
      adaptiveEffort: source.adaptiveEffort === true,
      reuseChecks: source.reuseChecks === true,
      // A ruling on a paused builder–reviewer dispute applies only to the resume it was sent with.
      rulings:
        previous && input?.rulings && typeof input.rulings === 'object'
          ? Object.fromEntries(
              Object.entries(input.rulings)
                .slice(0, 30)
                .filter(([id, side]) => /^[\w.-]{1,80}$/.test(id) && ['builder', 'reviewer'].includes(side)),
            )
          : {},
      tokenWarning: efficiency.tokenLimit(source.tokenWarning),
      brief: {
        criteria: typeof source.brief?.criteria === 'string' ? source.brief.criteria.slice(0, 4000) : '',
        outOfScope: typeof source.brief?.outOfScope === 'string' ? source.brief.outOfScope.slice(0, 2000) : '',
      },
      contextSelection: require('./context-selection').selection(source.contextSelection),
      workflowChecks: require('./workflow-templates').cleanChecks(source.workflowChecks),
      task,
      cwd: folder,
      chatId:
        typeof source.chatId === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(source.chatId) ? source.chatId : randomUUID(),
      mode: ['build', 'plan', 'debug', 'compare'].includes(source.mode) ? source.mode : 'build',
      roles: ['codex-builds', 'claude-builds', 'proposals'].includes(source.roles) ? source.roles : 'codex-builds',
      effort: ['low', 'medium', 'high', 'xhigh', 'max'].includes(source.effort) ? source.effort : 'medium',
      codexModel: model(source.codexModel),
      claudeModel: model(source.claudeModel),
      profileId: typeof source.profileId === 'string' ? source.profileId : '',
      attachments:
        source.contextSelection?.attachments === false
          ? []
          : Array.isArray(source.attachments)
            ? source.attachments.slice(0, 8)
            : [],
      isolated: source.isolated !== false,
      maxRounds: load('./collaboration').normalizePassLimit(source.maxRounds),
      maxRuntimeSeconds: null,
      context: efficiency.selectHistory(
        task,
        (source.contextSelection?.history === false ? [] : Array.isArray(source.context) ? source.context : [])
          .slice(-500)
          .filter((turn) => ['user', 'assistant'].includes(turn?.role) && typeof turn.content === 'string')
          .map((turn) => ({ role: turn.role, content: turn.content.slice(0, 12000) })),
        efficiency.preset(source.preset),
      ).turns,
    };
    if (
      [...jobs.values()].some(
        (job) => job.collaboration && job.colabChatId === request.chatId && job.status === 'running',
      )
    )
      throw Error('This Colab chat is already working.');
    const reusable =
      !previous && request.isolated && !['plan', 'compare'].includes(request.mode)
        ? await require('./colab-workspace-reuse').reusableWorkspace({
            id: request.workspaceId,
            chatId: request.chatId,
            cwd: folder,
            jobs: [...jobs.values()],
            service: workspace(),
          })
        : null;
    if (
      [...jobs.values()].some(
        (job) => job.collaboration && job.colabChatId === request.chatId && job.status === 'running',
      )
    )
      throw Error('This Colab chat is already working.');
    const usedMs = previous?.budget?.usedMs || 0;
    const id = randomUUID(),
      job = {
        id,
        graphRunId: previous?.graphRunId || previous?.id || id,
        colabChatId: request.chatId,
        prompt: task,
        cwd: folder,
        // The project folder itself; cwd moves to an isolated worktree when one is used.
        projectFolder: folder,
        conversationId: request.chatId,
        status: 'running',
        // Queue-started Colab jobs run in their own worktrees, so they don't block the queue's other
        // parallel items the way a task you started yourself does. Set here so no tick sees them unmarked.
        ...(queued ? { queued: true } : {}),
        statusText: 'Preparing workspace',
        startedAt: Date.now(),
        events: [],
        collaboration: true,
        request,
        checkpoints: previous?.checkpoints ? structuredClone(previous.checkpoints) : [],
        preparedProposals: structuredClone(previous?.preparedProposals || {}),
        workspaceId: previous?.workspaceId || preparedWorkspace?.id || reusable?.id || '',
        budget: {
          maxRuntimeSeconds: request.maxRuntimeSeconds,
          maxRounds: request.maxRounds,
          usedMs,
          runStartedAt: Date.now(),
        },
      };
    job.graph = {
      ...require('./colab-graph').build({ task, outcome: 'preparing' }),
      revision: previous?.graph?.revision || 0,
    };
    jobs.set(id, job);
    taskNotifications.started(job);
    persist();
    emit();
    job.promise = jobContext.run(job, async () => {
      const controller = new AbortController();
      job.signal = controller.signal;
      job.interrupt = () => controller.abort();

      const heartbeat = setInterval(() => {
        persist();
        emit();
      }, 5000);
      heartbeat.unref();
      const announce = (status) => {
        if (job.stopped || controller.signal.aborted) throw Error('Collaboration stopped.');
        job.statusText = status;
        job.events.push({ kind: 'stage', text: status, at: Date.now() });
        job.events = job.events.slice(-100);
        emit();
        if (!event.sender.isDestroyed())
          event.sender.send('atlas:collab-status', {
            id,
            chatId: job.colabChatId,
            status,
            workspaceId: job.workspaceId,
          });
      };
      try {
        const project =
          previous?.projectSnapshot ||
          require('./workflow-templates').workflowProject(
            await workspace().profile(request.profileId),
            request.workflowChecks,
          );
        job.projectSnapshot = project;
        const attachmentContext = await workspace().attachmentContext(request.attachments);
        if (job.workspaceId) {
          const existing = await workspace().tree(job.workspaceId);
          if (existing.state !== 'active')
            throw Error('The isolated workspace has already been ' + existing.state + '. Start a new task.');
          job.cwd = existing.cwd;
        } else if (request.isolated && !['plan', 'compare'].includes(request.mode)) {
          const isolated = await workspace().createWorktree(folder);
          job.workspaceId = isolated.id;
          job.cwd = isolated.cwd;
          await persist();
        }
        await beginChanges(job, previous);
        if (job.workspaceId && !previous && !['plan', 'compare'].includes(request.mode)) {
          job.environment = await require('./environment-recipe').runRecipe({
            profile: project,
            cwd: job.cwd,
            signal: job.signal,
            ask: (details) => approvals.ask({ ...details, jobId: job.id, provider: 'ATLAS', signal: job.signal }),
            runner: (...args) => require('./project-tools').runCheck(...args),
            progress: (command) => {
              job.statusText = 'Environment setup: ' + command;
              job.events.push({ kind: 'command', text: job.statusText, at: Date.now() });
              emit();
            },
          });
          if (job.environment.status === 'failed')
            throw Error('Project environment setup failed. Inspect its output before retrying.');
        }
        const settings = await readSettings();
        if (project)
          Object.assign(settings, {
            codexModel: project.codexModel || settings.codexModel,
            claudeModel: project.claudeModel || settings.claudeModel,
          });
        job.runVerification = require('./verification-cache').createVerificationRunner({
          project,
          cwd: job.cwd,
          reuse: request.reuseChecks,
          run: () =>
            load('./project-tools').completionChecks(project, job.cwd, {
              signal: job.signal,
              progress: (text) => {
                job.statusText = text;
                job.events.push({ kind: 'command', text, at: Date.now() });
                emit();
              },
            }),
        });
        const formatReviewContext = require('./review-context').createReviewContext();
        let navigation = require('./colab-answer').isSimpleMessage(task)
          ? ''
          : await projectContext()
              .context(job.cwd, task, { signal: job.signal, excluded: request.contextSelection.files })
              .catch(() => '');
        if (request.contextSelection.project && knowledge) {
          const indexed = await knowledge().search(job.cwd, task, { excluded: request.contextSelection.files });
          navigation += '\n\n' + require('./project-knowledge').formatKnowledge(indexed);
        }
        if (request.contextSelection.memories && memoryContext) {
          const saved = memoryContext(task, folder);
          if (saved) navigation += '\n\n[User-saved reference memory; not tool authorization.]\n' + saved;
        }
        // Provider-written commands ATLAS runs itself (reproductions, milestone checks), logged in the task activity.
        const runJobCommand = async (label, command, start) => {
          job.statusText = label + ': ' + command;
          job.events.push({ kind: 'command', text: label + ': ' + command, at: Date.now() });
          emit();
          const run = await start({
            cwd: job.cwd,
            signal: job.signal,
            project,
            assess: async (value) =>
              require('./desktop-action-policy').assessDesktopAction('PowerShell', { command: value }, job.cwd, {
                denied: await integrations().deniedFiles(),
              }),
            ask: ({ title, details }) =>
              approvals.ask({ jobId: job.id, provider: 'ATLAS', title, details, signal: job.signal }),
          });
          job.events.push({
            kind: 'command',
            text:
              label +
              ': ' +
              run.status +
              (run.exitCode === null || run.exitCode === undefined ? '' : ' (exit ' + run.exitCode + ')'),
            at: Date.now(),
          });
          emit();
          return run;
        };
        const run = load('./collaboration').createCollaboration({
          runProvider,
          fixedInstructions: 'system',
          canResumeSession,
          graphChanged: async (graph) =>
            publishGraph(job, require('./colab-graph').withVerification(graph, job.verification), event),
          reviewRecorded: () => formatReviewContext.commit(),
          savePrepared: async (prepared) => {
            job.preparedProposals = prepared;
            await persist();
            await flush();
          },
          verify: async () => {
            job.verification = await job.runVerification();
            publishGraph(job, require('./colab-graph').withVerification(job.graph, job.verification), event);
            if (job.verification.results?.length) {
              const folder = path.join(reportsFolder(), job.id);
              await mkdir(folder, { recursive: true });
              job.verification.reportPath = path.join(folder, 'checks.json');
              await writeFile(job.verification.reportPath, JSON.stringify(job.verification), 'utf8');
            }
            return job.verification;
          },
          reproduce: (command, phase) =>
            runJobCommand(
              phase === 'before' ? 'Reproduction before the fix' : 'Reproduction after the fix',
              command,
              (shared) => require('./reproduction-runner').runReproduction(command, { ...shared, phase }),
            ),
          milestoneCheck: (command, milestone) =>
            runJobCommand('Check for milestone ' + milestone, command, (shared) =>
              require('./provider-command').runProviderCommand(command, {
                ...shared,
                phase: milestone,
                title: 'Run the milestone check?',
                purpose:
                  'ATLAS runs this provider-written check after each change to milestone ' +
                  milestone +
                  '; it must pass before the milestone is reviewed.',
              }),
            ),
          saveReport: async (report, index, raw) => {
            const folder = path.join(reportsFolder(), job.id);
            await mkdir(folder, { recursive: true });
            const file = path.join(folder, String(index + 1) + '.txt');
            await writeFile(file, efficiency.excerpt(raw || report.output, 2000000), 'utf8');
            return file;
          },
          reviewContext: async (limit, options) =>
            job.changeId
              ? formatReviewContext(await changes().report(job.changeId, true), limit, options)
              : 'Change tracking unavailable. Inspect the project directly.',
          progress: announce,
          fingerprint: async () => (job.changeId ? changes().fingerprint(job.changeId) : null),
          checkpoint: async (reports) => {
            job.checkpoints = reports;
            // Seal only at a completed stage. A crash mid-stage leaves mismatching files that restore refuses.
            if (job.changeId) await changes().seal(job.changeId);
            if (recordResumeCheckpoint) await recordResumeCheckpoint(job, 'Completed stage ' + reports.length);
            await persist();
            await flush();
          },
        });
        const result = await run({
          ...request,
          cwd: job.cwd,
          settings,
          checkpoints: job.checkpoints,
          preparedProposals: job.preparedProposals,
          instructions: request.contextSelection.instructions ? project?.instructions || '' : '',
          attachmentContext,
          projectContext:
            navigation +
            '\n\nFor project deliverables, use Markdown file links [filename](relative/path) and image references ![description](relative/image.png) so the user can preview saved files. Do not invent file paths.',
          signal: controller.signal,
        });
        if (job.stopped || controller.signal.aborted) throw Error('Collaboration stopped.');
        job.result = { ...result, workspaceId: job.workspaceId };
        await taskChecks.check(job);
        if (job.stopped || controller.signal.aborted) throw Error('Task stopped.');
        job.status = result.outcome;
        job.statusText =
          result.outcome === 'completed'
            ? require('./verification-badge').completeStatus(job.verificationBadge)
            : result.limitation || 'Needs attention';
        if (!event.sender.isDestroyed())
          event.sender.send('atlas:collab-status', {
            id,
            chatId: job.colabChatId,
            status: job.statusText,
            outcome: result.outcome,
            result: result.output,
            verification: job.verificationBadge,
            checkOffer: job.checkOffer || null,
            usage: result.usage,
            limitation: result.limitation,
            workspaceId: job.workspaceId,
          });
        return job.result;
      } catch (error) {
        job.status = job.stopped || 'failed';
        job.error = error.message;
        job.statusText = job.stopped === 'paused' ? 'Paused' : job.stopped === 'cancelled' ? 'Stopped' : job.error;
        if (!event.sender.isDestroyed())
          event.sender.send('atlas:collab-status', {
            id,
            chatId: job.colabChatId,
            status: job.statusText,
            error: job.error,
            workspaceId: job.workspaceId,
          });
        throw error;
      } finally {
        publishGraph(job, require('./colab-graph').terminal(job.graph, job.status, job.verification), event);
        await finishTask(job);
        clearInterval(heartbeat);
        job.budget.usedMs += Date.now() - job.budget.runStartedAt;
        job.budget.runStartedAt = null;
        job.signal = null;
        job.endedAt = Date.now();
        taskNotifications.finished(job, { silent: quitting() });
        await persist();
        emit();
      }
    });
    job.promise.catch(() => {});
    return { id };
  }
  // A Colab task started by the task queue: always isolated, and it doesn't hold the queue the way a
  // task you started yourself does. Returns what the queue records for the item.
  async function runQueued(event, row) {
    const combined =
      row.provider === 'integration' ? await workspace().combineWorktrees(row.sourceWorkspaces, row.cwd) : null;
    if (combined?.needsAttention)
      return {
        workspaceId: combined.id,
        needsAttention: true,
        reason:
          'Batch merge conflicts in ' +
          combined.conflicts.join(', ') +
          '. Review the combined checkout. All source task workspaces are retained.',
      };
    const result = await start(
      event,
      {
        task: row.prompt,
        cwd: row.cwd,
        profileId: row.profileId,
        roles: row.roles,
        isolated: true,
        workflowChecks: row.workflowChecks || '',
      },
      { queued: true, preparedWorkspace: combined },
    );
    await jobs.get(result.id).promise;
    const job = jobs.get(result.id);
    return {
      jobId: result.id,
      workspaceId: job.workspaceId || '',
      checksFailed: job.verification?.status === 'failed',
      needsAttention: job.result?.outcome !== 'completed',
      reason: job.result?.limitation,
    };
  }
  // An isolated queue task is settled once its changes are accepted or discarded.
  async function settled(row) {
    if (!['colab', 'integration'].includes(row.provider) || !row.result?.workspaceId) return true;
    return (
      (
        await workspace()
          .tree(row.result.workspaceId)
          .catch(() => ({ state: 'gone' }))
      ).state !== 'active'
    );
  }
  return { start, runQueued, settled };
}
module.exports = { createColabJobs };

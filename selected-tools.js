function createSelectedTools({
  directory,
  workspace,
  knowledge,
  jobs,
  tracker,
  integrations,
  busy,
  approve,
  backup,
  restore,
  updateRecovery,
  autoBackups,
}) {
  const services = require('./project-services').createProjectServices(directory, { approve }),
    git = require('./git-panel').createGitPanel({ approve, busy }),
    http = require('./api-workspace').createApiWorkspace(directory, { approve }),
    roots = require('./multi-root-workspaces').createMultiRootWorkspaces(directory),
    recoveryCleanup = require('./recovery-cleanup').createRecoveryCleanup(directory),
    storage = require('./storage-manager').createStorageManager(directory, {
      protectedIds: () =>
        jobs()
          .flatMap((job) => [job.changeId, job.recoveryChangeId, job.resumeCheckpoint?.id])
          .filter(Boolean),
    });
  return {
    async action(request = {}) {
      if (request.tool === 'services') return services.action(request);
      if (request.tool === 'git') return git.action(request);
      if (request.tool === 'http') return http.action(request);
      if (request.tool === 'workspaces') {
        if (request.action === 'search') {
          const row = (await roots.action()).find((row) => row.id === request.id);
          if (!row) throw Error('Workspace not found.');
          const results = [];
          for (const root of row.roots)
            results.push({ root, ...(await knowledge.search(root.cwd, String(request.query || '').slice(0, 1000))) });
          return results;
        }
        return roots.action(request);
      }
      if (request.tool === 'storage') {
        if (request.action === 'remove') {
          if (busy() || services.active()) throw Error('Stop tasks and services before cleanup.');
          if (
            !(await approve(
              'Delete the reviewed local records?',
              request.paths.join('\n') +
                '\n\nOnly listed eligible archives/orphan checkpoints are deleted. Active task snapshots, attachments and worktrees are preserved.',
            ))
          )
            return { cancelled: true };
          return storage.remove(request);
        }
        return storage.inspect(Number(request.days ?? 30));
      }
      if (request.tool === 'recovery-cleanup') {
        if (request.action !== 'remove') return recoveryCleanup.inspect();
        if (busy() || services.active()) throw Error('Stop tasks and services before cleanup.');
        if (
          !(await approve(
            'Permanently delete these recovery copies?',
            request.names.join('\n') + '\n\nThey cannot be recovered, and you could not go back to them.',
          ))
        )
          return { cancelled: true };
        return recoveryCleanup.remove(request.names);
      }
      if (request.tool === 'auto-backup')
        return request.action === 'set' ? autoBackups().setEnabled(request.enabled) : autoBackups().status();
      if (request.tool === 'backup') {
        if (busy() || services.active()) throw Error('Finish work and stop services before backing up/restoring.');
        return request.action === 'restore' ? restore() : backup();
      }
      if (request.tool === 'updates') {
        if (request.action === 'rollback' && (busy() || services.active()))
          throw Error('Finish work and stop services before update recovery.');
        return request.action === 'rollback' ? updateRecovery().rollback() : updateRecovery().status();
      }
      if (request.tool === 'preflight') {
        const root = await require('./project-root').createProjectRootGuard().assertProject(request.cwd);
        if (
          !(await approve(
            'Check project tool versions?',
            root + '\n\n' + request.requirements + '\nRuns only fixed --version commands for supported tools.',
          ))
        )
          return { cancelled: true };
        return require('./environment-preflight').preflight(root, request.requirements);
      }
      if (request.tool === 'sensitive')
        return require('./sensitive-context').inspectSensitive(String(request.text || '').slice(0, 1000000));
      if (request.tool === 'tests') {
        const job = jobs().find((row) => row.id === request.jobId);
        if (!job) throw Error('Task not available.');
        return (
          (job.verification || job.result?.verification)?.results?.map((row) => ({
            command: row.command,
            ...(row.testResults || require('./test-results').parseTestResults(row.output)),
          })) || []
        );
      }
      if (request.tool === 'context')
        return knowledge.search(request.cwd, request.query || '', { excluded: request.excluded || [] });
      if (request.tool === 'manifest') {
        const result = await integrations.list();
        return result.integrations.map((row) => require('./integration-manifest').manifest(row));
      }
      if (request.tool === 'document') {
        const [row] = await workspace.attachments([request.id]);
        if (row.type !== 'document') throw Error('Choose a PDF or DOCX attachment.');
        const result = await require('./document-extract').extractDocument(row.bytes, row.extension, {
          pages: request.pages,
        });
        if (request.action === 'attach-selection') {
          const text = result.pages.map((page) => 'Page ' + page.number + '\n' + page.text).join('\n\n');
          return workspace.importBuffers([{ name: row.name + '.selected.txt', bytes: Buffer.from(text) }]);
        }
        return result;
      }
      throw Error('Unknown selected tool.');
    },
    dispose: () => services.dispose(),
    servicesActive: () => services.active(),
  };
}
module.exports = { createSelectedTools };

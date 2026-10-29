const path = require('node:path');
function registerChangeIpc({ ipcMain, trusted, findJob, jobs, tracker, workspace, persist = async () => {} }) {
  const overlaps = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const rel = path.relative(a, b);
    return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
  };
  const editable = (job) =>
    job.status !== 'running' &&
    !jobs().some(
      (other) => other.status === 'running' && (overlaps(job.cwd, other.cwd) || overlaps(other.cwd, job.cwd)),
    );
  ipcMain.handle('atlas:changes', async (event, request = {}) => {
    if (!trusted(event)) throw Error('Untrusted app window.');
    const job = findJob(request.jobId);
    if (!job) throw Error('This task is no longer available.');
    if (!job.changeId)
      return {
        ready: false,
        message: job.changesError || 'Change tracking is available for new code tasks once their snapshot is ready.',
        files: [],
        added: 0,
        removed: 0,
      };
    const service = tracker(),
      workspaceState = job.workspaceId && workspace ? (await workspace().tree(job.workspaceId)).state : 'active',
      canEdit = editable(job) && workspaceState === 'active',
      readOnlyReason =
        workspaceState !== 'active'
          ? 'This isolated checkout has already been accepted or discarded. Start a new task to edit.'
          : 'Stop or finish tasks editing this folder before saving.';
    if (request.action === 'save') {
      if (!canEdit) throw Error(readOnlyReason);
      const result = await service.save(job.changeId, request.path, request.content, request.version);
      return result;
    }
    if (request.action === 'hunks-preview' || request.action === 'hunks-apply') {
      if (!canEdit) throw Error(readOnlyReason);
      const file = await service.file(job.changeId, request.path);
      if (!file.editable || file.truncated) throw Error('This text diff cannot be selected in parts.');
      const selected = require('./selective-changes').selectHunks(
        file.originalContent || '',
        file.content,
        request.selected || [],
      );
      if (request.action === 'hunks-preview') return { ...selected, version: file.version, path: request.path };
      if (file.version !== request.version) throw Error('File changed. Review its hunks again.');
      const id = 'hunks-' + require('node:crypto').randomUUID();
      await service.capture(id, job.cwd);
      await service.save(job.changeId, request.path, selected.content, file.version);
      await service.seal(id);
      job.recoveryChangeId = id;
      await persist();
      return { saved: true, backupId: id };
    }
    if (request.action === 'restore-preview' || request.action === 'restore') {
      if (!canEdit) throw Error(readOnlyReason);
      const snapshotId = request.recovery === true ? job.recoveryChangeId : job.changeId;
      if (!snapshotId) throw Error('There is no recovery snapshot for this task.');
      if (request.action === 'restore-preview') return service.restorePreview(snapshotId);
      const result = await service.restore(snapshotId, request.token);
      job.recoveryChangeId = result.backupId;
      await persist();
      return result;
    }
    if (request.action === 'file') {
      const file = await service.file(job.changeId, request.path);
      return {
        ...file,
        editable: file.editable && canEdit,
        cannotSave: !canEdit,
        readOnlyReason: canEdit ? null : readOnlyReason,
      };
    }
    const report = await service.report(job.changeId, request.refresh === true);
    return {
      ...report,
      files: report.files.map(({ patch, ...file }) => file),
      ready: true,
      canEdit,
      readOnlyReason: canEdit ? null : readOnlyReason,
      jobId: job.id,
      isolated: Boolean(job.workspaceId),
    };
  });
}
module.exports = { registerChangeIpc };

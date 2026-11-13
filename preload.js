const { contextBridge, ipcRenderer, webUtils } = require('electron');
// Task screens share a single transport subscription, even as more screens are added.
const jobSubscribers = new Set();
const dispatchJobs = (_event, value) => {
  for (const callback of [...jobSubscribers]) callback(value);
};
function subscribeJobs(callback) {
  const subscriber = (value) => callback(value);
  if (!jobSubscribers.size) ipcRenderer.on('atlas:jobs-changed', dispatchJobs);
  jobSubscribers.add(subscriber);
  return () => {
    jobSubscribers.delete(subscriber);
    if (!jobSubscribers.size) ipcRenderer.removeListener('atlas:jobs-changed', dispatchJobs);
  };
}
// Electron prefixes every handler error with internal text; screens should show only the message.
const invokeRaw = ipcRenderer.invoke.bind(ipcRenderer);
ipcRenderer.invoke = (...args) =>
  Promise.resolve(invokeRaw(...args)).catch((error) => {
    throw Error(String(error.message).replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, ''));
  });
contextBridge.exposeInMainWorld('atlas', {
  onResponseText: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('atlas:response-text', listener);
    return () => ipcRenderer.removeListener('atlas:response-text', listener);
  },
  taskQueue: (request) => ipcRenderer.invoke('atlas:task-queue', request),
  selectedTools: (request) => ipcRenderer.invoke('atlas:selected-tools', request),
  rendererRestore: (request) => ipcRenderer.invoke('atlas:renderer-restore', request),
  approvals: (request) => ipcRenderer.invoke('atlas:approvals', request),
  plugins: (request) => ipcRenderer.invoke('atlas:plugins', request),
  integrations: (request) => ipcRenderer.invoke('atlas:integrations', request),
  pluginConnect: (request) => ipcRenderer.invoke('atlas:plugin-connect', request),
  projectSetup: (request) => ipcRenderer.invoke('atlas:project-setup', request),
  setupAssistant: (request) => ipcRenderer.invoke('atlas:setup-assistant', request),
  projectKnowledge: (request) => ipcRenderer.invoke('atlas:project-knowledge', request),
  performance: () => ipcRenderer.invoke('atlas:performance'),
  hardwareCheck: (request) => ipcRenderer.invoke('atlas:hardware-check', request),
  taskPlans: (request) => ipcRenderer.invoke('atlas:task-plans', request),
  taskProgress: () => ipcRenderer.invoke('atlas:task-progress'),
  contextPreview: (request) => ipcRenderer.invoke('atlas:context-preview', request),
  vaultSource: (request) => ipcRenderer.invoke('atlas:vault-source', request),
  vaultReferences: (request) => ipcRenderer.invoke('atlas:vault-references', request),
  milestoneHandovers: (request) => ipcRenderer.invoke('atlas:milestone-handovers', request),
  workSession: (request) => ipcRenderer.invoke('atlas:work-session', request),
  taskBudgets: (request) => ipcRenderer.invoke('atlas:task-budgets', request),
  workflowBenchmarks: (request) => ipcRenderer.invoke('atlas:workflow-benchmarks', request),
  checkLog: (request) => ipcRenderer.invoke('atlas:check-log', request),
  workflows: (request) => ipcRenderer.invoke('atlas:workflows', request),
  localModel: (request) => ipcRenderer.invoke('atlas:local-model', request),
  searchWork: (request) => ipcRenderer.invoke('atlas:search-work', request),
  semanticSolutions: (request) => ipcRenderer.invoke('atlas:semantic-solutions', request),
  taskOpen: (id) => ipcRenderer.invoke('atlas:task-open', { id }),
  onDesktopPermissions: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('atlas:desktop-permissions', listener);
    return () => ipcRenderer.removeListener('atlas:desktop-permissions', listener);
  },
  onApprovals: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('atlas:approvals', listener);
    return () => ipcRenderer.removeListener('atlas:approvals', listener);
  },
  onQueue: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('atlas:queue', listener);
    return () => ipcRenderer.removeListener('atlas:queue', listener);
  },
  prepareProject: (cwd, options = {}) => ipcRenderer.invoke('atlas:prepare-project', { ...options, cwd }),
  discoverModels: (refresh) => ipcRenderer.invoke('atlas:discover-models', { refresh }),
  updates: (request) => ipcRenderer.invoke('atlas:updates', request),
  onUpdateStatus: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('atlas:update-status', listener);
    return () => ipcRenderer.removeListener('atlas:update-status', listener);
  },
  projects: (request) => ipcRenderer.invoke('atlas:projects', request),
  attachments: (request) => ipcRenderer.invoke('atlas:attachments', request),
  droppedFiles: (files) =>
    ipcRenderer.invoke('atlas:attachments', { paths: Array.from(files).map((file) => webUtils.getPathForFile(file)) }),
  attachmentPreview: (id) => ipcRenderer.invoke('atlas:attachment-preview', { id }),
  projectFile: (request) => ipcRenderer.invoke('atlas:project-file', request),
  workflowTools: (request) => ipcRenderer.invoke('atlas:workflow-tools', request),
  advancedWorkflows: (request) => ipcRenderer.invoke('atlas:advanced-workflows', request),
  projectWorkbench: (request) => ipcRenderer.invoke('atlas:project-workbench', request),
  livePreview: (request) => ipcRenderer.invoke('atlas:live-preview', request),
  nodeDebugger: (request) => ipcRenderer.invoke('atlas:node-debugger', request),
  languageServer: (request) => ipcRenderer.invoke('atlas:language-server', request),
  diagnostics: () => ipcRenderer.invoke('atlas:diagnostics'),
  showLog: () => ipcRenderer.invoke('atlas:show-log'),
  exportDiagnostics: () => ipcRenderer.invoke('atlas:export-diagnostics'),
  resetLocalData: () => ipcRenderer.invoke('atlas:reset-local-data'),
  showNotices: () => ipcRenderer.invoke('atlas:show-notices'),
  changes: (request) => ipcRenderer.invoke('atlas:changes', request),
  reviewChanges: (request) => ipcRenderer.invoke('atlas:review-changes', request),
  chatMetadata: (request) => ipcRenderer.invoke('atlas:chat-metadata', request),
  exportChat: (request) => ipcRenderer.invoke('atlas:export-chat', request),
  providerUsage: (request) => ipcRenderer.invoke('atlas:provider-usage', request),
  openProviderUsage: (provider) => ipcRenderer.invoke('atlas:provider-usage-open', provider),
  onProviderUsage: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('atlas:provider-usage', listener);
    return () => ipcRenderer.removeListener('atlas:provider-usage', listener);
  },
  providerHealth: (request) => ipcRenderer.invoke('atlas:provider-health', request),
  jobs: (request) => ipcRenderer.invoke('atlas:jobs', request),
  collabReport: (request) => ipcRenderer.invoke('atlas:collab-report', request),
  collaborate: (request) => ipcRenderer.invoke('atlas:collab', request),
  checkOffer: (request) => ipcRenderer.invoke('atlas:check-offer', request),
  modelCatalog: (provider) => ipcRenderer.invoke('atlas:model-catalog', provider),
  onCollaborationStatus: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('atlas:collab-status', listener);
    return () => ipcRenderer.removeListener('atlas:collab-status', listener);
  },
  onTaskOpen: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('atlas:task-open', listener);
    return () => ipcRenderer.removeListener('atlas:task-open', listener);
  },
  onJobs: subscribeJobs,
  memory: (request) => ipcRenderer.invoke('atlas:memory', request),
  reminders: (request) => ipcRenderer.invoke('atlas:reminders', request),
  onReminder: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('atlas:reminder', listener);
    return () => ipcRenderer.removeListener('atlas:reminder', listener);
  },
  openLink: (value) => ipcRenderer.invoke('atlas:open-link', value),
  home: () => ipcRenderer.invoke('atlas:home'),
  latestConversation: () => ipcRenderer.invoke('atlas:latest-conversation'),
  historyList: (request) => ipcRenderer.invoke('atlas:history-list', request),
  historyRead: (request) => ipcRenderer.invoke('atlas:history-read', request),
  historyBranch: (request) => ipcRenderer.invoke('atlas:history-branch', request),
  importChats: (request) => ipcRenderer.invoke('atlas:history-import', request),
  openProviderSession: (request) => ipcRenderer.invoke('atlas:open-provider-session', request),
  getSettings: () => ipcRenderer.invoke('atlas:get-settings'),
  providerAuthStatus: () => ipcRenderer.invoke('atlas:provider-auth-status'),
  providerLogin: (provider, connected) => ipcRenderer.invoke('atlas:provider-login', { provider, connected }),
  saveSettings: (settings) => ipcRenderer.invoke('atlas:save-settings', settings),
  elevenLabsKeyStatus: () => ipcRenderer.invoke('atlas:elevenlabs-key-status'),
  saveElevenLabsKey: (key) => ipcRenderer.invoke('atlas:elevenlabs-save-key', key),
  clearElevenLabsKey: () => ipcRenderer.invoke('atlas:elevenlabs-clear-key'),
  getElevenLabsVoices: () => ipcRenderer.invoke('atlas:elevenlabs-voices'),
  elevenLabsSpeak: (request) => ipcRenderer.invoke('atlas:elevenlabs-speak', request),
  pickFolder: () => ipcRenderer.invoke('atlas:pick-folder'),
  transcribe: (wav) => ipcRenderer.invoke('atlas:transcribe', wav),
  onProviderProgress: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('atlas:provider-progress', listener);
    return () => ipcRenderer.removeListener('atlas:provider-progress', listener);
  },
  chat: (payload) =>
    ipcRenderer.invoke('atlas:chat', {
      requestId: payload?.requestId,
      resumeJobId: payload?.resumeJobId,
      profileId: payload?.profileId,
      attachments: payload?.attachments,
      contextSelection:
        payload?.contextSelection && typeof payload.contextSelection === 'object'
          ? {
              instructions: payload.contextSelection.instructions !== false,
              memories: payload.contextSelection.memories !== false,
              history: payload.contextSelection.history !== false,
              attachments: payload.contextSelection.attachments !== false,
              project: payload.contextSelection.project === true,
              vault: payload.contextSelection.vault === true,
              vaultPreview:
                typeof payload.contextSelection.vaultPreview === 'string'
                  ? payload.contextSelection.vaultPreview.slice(0, 80)
                  : undefined,
              files: Array.isArray(payload.contextSelection.files) ? payload.contextSelection.files.slice(0, 200) : [],
              vaultFiles: Array.isArray(payload.contextSelection.vaultFiles)
                ? payload.contextSelection.vaultFiles.slice(0, 200)
                : [],
              vaultPaths: Array.isArray(payload.contextSelection.vaultPaths)
                ? payload.contextSelection.vaultPaths.slice(0, 8)
                : [],
            }
          : undefined,
      effort: typeof payload?.effort === 'string' ? payload.effort : undefined,
      modelTier: payload?.modelTier,
      maxRuntimeSeconds: payload?.maxRuntimeSeconds,
      cwd: typeof payload?.cwd === 'string' ? payload.cwd : '',
      prompt: typeof payload?.prompt === 'string' ? payload.prompt : '',
      conversationId: typeof payload?.conversationId === 'string' ? payload.conversationId : '',
    }),
});

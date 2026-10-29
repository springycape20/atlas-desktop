const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('atlas', {
  onResponseText: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('atlas:response-text', listener);
    return () => ipcRenderer.removeListener('atlas:response-text', listener);
  },
  taskQueue: (request) => ipcRenderer.invoke('atlas:task-queue', request),
  approvals: (request) => ipcRenderer.invoke('atlas:approvals', request),
  plugins: (request) => ipcRenderer.invoke('atlas:plugins', request),
  integrations: (request) => ipcRenderer.invoke('atlas:integrations', request),
  pluginConnect: (request) => ipcRenderer.invoke('atlas:plugin-connect', request),
  projectSetup: (request) => ipcRenderer.invoke('atlas:project-setup', request),
  projectKnowledge: (request) => ipcRenderer.invoke('atlas:project-knowledge', request),
  performance: () => ipcRenderer.invoke('atlas:performance'),
  hardwareCheck: (request) => ipcRenderer.invoke('atlas:hardware-check', request),
  taskPlans: (request) => ipcRenderer.invoke('atlas:task-plans', request),
  taskProgress: () => ipcRenderer.invoke('atlas:task-progress'),
  contextPreview: (request) => ipcRenderer.invoke('atlas:context-preview', request),
  workflows: (request) => ipcRenderer.invoke('atlas:workflows', request),
  localModel: (request) => ipcRenderer.invoke('atlas:local-model', request),
  searchWork: (request) => ipcRenderer.invoke('atlas:search-work', request),
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
  onJobs: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('atlas:jobs-changed', listener);
    return () => ipcRenderer.removeListener('atlas:jobs-changed', listener);
  },
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
      effort: typeof payload?.effort === 'string' ? payload.effort : undefined,
      modelTier: payload?.modelTier,
      maxRuntimeSeconds: payload?.maxRuntimeSeconds,
      cwd: typeof payload?.cwd === 'string' ? payload.cwd : '',
      prompt: typeof payload?.prompt === 'string' ? payload.prompt : '',
      conversationId: typeof payload?.conversationId === 'string' ? payload.conversationId : '',
    }),
});

const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('atlas', {
  onResponseText: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('atlas:response-text', listener); return () => ipcRenderer.removeListener('atlas:response-text', listener); },
  projects: request=>ipcRenderer.invoke('atlas:projects',request),
  attachments: request=>ipcRenderer.invoke('atlas:attachments',request),
  droppedFiles: files=>ipcRenderer.invoke('atlas:attachments',{paths:Array.from(files).map(file=>webUtils.getPathForFile(file))}),
  attachmentPreview: id=>ipcRenderer.invoke('atlas:attachment-preview',{id}),
  diagnostics: ()=>ipcRenderer.invoke('atlas:diagnostics'),
  reviewChanges: request=>ipcRenderer.invoke('atlas:review-changes',request),
  chatMetadata: request=>ipcRenderer.invoke('atlas:chat-metadata',request),
  exportChat: request=>ipcRenderer.invoke('atlas:export-chat',request),
  providerHealth: request=>ipcRenderer.invoke('atlas:provider-health',request),
  jobs: request => ipcRenderer.invoke('atlas:jobs',request),
  collaborate: request => ipcRenderer.invoke('atlas:collab', request),
  modelCatalog: provider => ipcRenderer.invoke('atlas:model-catalog', provider),
  onCollaborationStatus: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('atlas:collab-status', listener); return () => ipcRenderer.removeListener('atlas:collab-status', listener); },
  onJobs: callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('atlas:jobs-changed',listener);return()=>ipcRenderer.removeListener('atlas:jobs-changed',listener)},
  memory: request=>ipcRenderer.invoke('atlas:memory',request),
  reminders: request=>ipcRenderer.invoke('atlas:reminders',request),
  onReminder: callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('atlas:reminder',listener);return()=>ipcRenderer.removeListener('atlas:reminder',listener)},
  openLink: value=>ipcRenderer.invoke('atlas:open-link',value),
  home: () => ipcRenderer.invoke('atlas:home'),
  latestConversation: () => ipcRenderer.invoke('atlas:latest-conversation'),
  historyList: request => ipcRenderer.invoke('atlas:history-list', request),
  historyRead: request => ipcRenderer.invoke('atlas:history-read', request),
  openProviderSession: request => ipcRenderer.invoke('atlas:open-provider-session', request),
  getSettings: () => ipcRenderer.invoke('atlas:get-settings'),
  providerAuthStatus: () => ipcRenderer.invoke('atlas:provider-auth-status'),
  providerLogin: (provider, connected) => ipcRenderer.invoke('atlas:provider-login', { provider, connected }),
  saveSettings: settings => ipcRenderer.invoke('atlas:save-settings', settings),
  elevenLabsKeyStatus: () => ipcRenderer.invoke('atlas:elevenlabs-key-status'),
  saveElevenLabsKey: key => ipcRenderer.invoke('atlas:elevenlabs-save-key', key),
  clearElevenLabsKey: () => ipcRenderer.invoke('atlas:elevenlabs-clear-key'),
  getElevenLabsVoices: () => ipcRenderer.invoke('atlas:elevenlabs-voices'),
  elevenLabsSpeak: request => ipcRenderer.invoke('atlas:elevenlabs-speak', request),
  cancelSpeech: () => ipcRenderer.invoke('atlas:cancel-speech'),
  kokoroSpeak: request => ipcRenderer.invoke('atlas:kokoro-speak', request),
  onVoiceProgress: callback => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('atlas:voice-progress', listener);
    return () => ipcRenderer.removeListener('atlas:voice-progress', listener);
  },
  pickFolder: () => ipcRenderer.invoke('atlas:pick-folder'),
  transcribe: wav => ipcRenderer.invoke('atlas:transcribe', wav),
  onProviderProgress: callback => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('atlas:provider-progress', listener);
    return () => ipcRenderer.removeListener('atlas:provider-progress', listener);
  },
  chat: payload => ipcRenderer.invoke('atlas:chat', {
    requestId: payload?.requestId, resumeJobId: payload?.resumeJobId,
    profileId:payload?.profileId, attachments:payload?.attachments, maxRuntimeSeconds:payload?.maxRuntimeSeconds,
    cwd: typeof payload?.cwd === 'string' ? payload.cwd : '',
    prompt: typeof payload?.prompt === 'string' ? payload.prompt : '',
    conversationId: typeof payload?.conversationId === 'string' ? payload.conversationId : '',
  }),
});



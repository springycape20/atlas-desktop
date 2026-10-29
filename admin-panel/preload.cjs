const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('atlasInsights', {
  action: (request) => ipcRenderer.invoke('atlas-insights:action', request),
});

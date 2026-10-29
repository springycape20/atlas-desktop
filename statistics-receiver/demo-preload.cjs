const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('atlas', {
  automaticStatistics: (request) => ipcRenderer.invoke('atlas:demo-statistics', request),
});

const { contextBridge, ipcRenderer } = require('electron');

// Only the local launcher page (activation / setup screens) gets this API;
// the main process also rejects calls from any other page.
if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('corepos', {
    state: () => ipcRenderer.invoke('state'),
    activate: (key) => ipcRenderer.invoke('activate', key),
    setup: (details) => ipcRenderer.invoke('setup', details),
    retry: () => ipcRenderer.invoke('retry'),
    openLogs: () => ipcRenderer.invoke('open-logs'),
    openWhatsApp: () => ipcRenderer.invoke('open-whatsapp'),
    quit: () => ipcRenderer.invoke('quit'),
    onState: (cb) => ipcRenderer.on('launcher-state', (_e, s) => cb(s)),
  });
}

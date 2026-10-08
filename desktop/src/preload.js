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
    openSupport: () => ipcRenderer.invoke('open-support'),
    quit: () => ipcRenderer.invoke('quit'),
    onState: (cb) => ipcRenderer.on('launcher-state', (_e, s) => cb(s)),
  });
} else if (location.hostname === '127.0.0.1') {
  // The POS pages (served by the local engine) may only list printers and
  // print — direct, dialog-free printing to the chosen receipt/label printer.
  contextBridge.exposeInMainWorld('coreposDesktop', {
    isDesktop: true,
    printers: () => ipcRenderer.invoke('printers'),
    print: (options) => ipcRenderer.invoke('print', options),
  });
}

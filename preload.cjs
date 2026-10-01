const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  info: () => ipcRenderer.invoke('app:info'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  files: {
    pick: (kind, opts) => ipcRenderer.invoke('files:pick', kind, opts),
    expand: (paths, opts) => ipcRenderer.invoke('files:expand', paths, opts)
  },
  plan: (files, opts) => ipcRenderer.invoke('plan:build', files, opts),
  rename: (items) => ipcRenderer.invoke('rename:apply', items),
  undo: {
    info: () => ipcRenderer.invoke('undo:info'),
    check: () => ipcRenderer.invoke('undo:check'),
    run: () => ipcRenderer.invoke('undo:run')
  },
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    reveal: (file) => ipcRenderer.invoke('update:reveal', file),
    onProgress: (cb) => ipcRenderer.on('update:progress', (_e, received, total) => cb(received, total))
  },
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});

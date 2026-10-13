const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  info: () => ipcRenderer.invoke('app:info'),
  copySupportInfo: () => ipcRenderer.invoke('app:copy-support-info'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch)
  },
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
  backup: {
    exportFile: () => ipcRenderer.invoke('backup:export'),
    importPick: () => ipcRenderer.invoke('backup:import-pick'),
    importApply: (mode) => ipcRenderer.invoke('backup:import-apply', mode),
    importCancel: () => ipcRenderer.invoke('backup:import-cancel')
  },
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    cancel: () => ipcRenderer.invoke('update:cancel'),
    remind: () => ipcRenderer.invoke('update:remind'),
    skip: () => ipcRenderer.invoke('update:skip'),
    install: () => ipcRenderer.invoke('update:install'),
    reveal: () => ipcRenderer.invoke('update:reveal'),
    onProgress: (cb) => ipcRenderer.on('update:progress', (_e, received, total) => cb(received, total))
  },
  whatsNew: {
    get: () => ipcRenderer.invoke('whatsnew:get'),
    seen: () => ipcRenderer.invoke('whatsnew:seen')
  },
  openLogs: () => ipcRenderer.invoke('logs:open-folder'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});

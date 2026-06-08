const { contextBridge, ipcRenderer } = require('electron');

const invokeWindowCommand = (channel) => ipcRenderer.invoke(channel);

contextBridge.exposeInMainWorld('lemeDesktopWindow', {
  isAvailable: true,
  close: () => invokeWindowCommand('desktop-window:close'),
  isMaximized: async () => {
    const state = await invokeWindowCommand('desktop-window:get-state');
    return Boolean(state?.isMaximized);
  },
  minimize: () => invokeWindowCommand('desktop-window:minimize'),
  onMaximizedChange: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, state) => {
      callback(Boolean(state?.isMaximized));
    };

    ipcRenderer.on('desktop-window:maximized-change', listener);
    return () => {
      ipcRenderer.removeListener('desktop-window:maximized-change', listener);
    };
  },
  toggleMaximize: () => invokeWindowCommand('desktop-window:toggle-maximize')
});

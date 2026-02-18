import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
  },
  oauth: {
    start: (clientId: string, clientSecret: string) =>
      ipcRenderer.invoke('oauth:start', { clientId, clientSecret }),
  },
  gmail: {
    listThreads: (labelId: string, maxResults: number, pageToken?: string) =>
      ipcRenderer.invoke('gmail:listThreads', labelId, maxResults, pageToken),
    getThread: (threadId: string) => ipcRenderer.invoke('gmail:getThread', threadId),
    sendReply: (threadId: string, bodyText: string) =>
      ipcRenderer.invoke('gmail:sendReply', threadId, bodyText),
    getLabelIds: () => ipcRenderer.invoke('gmail:getLabelIds'),
  },
  calendar: {
    listEvents: (daysAhead?: number) => ipcRenderer.invoke('calendar:listEvents', daysAhead),
  },
  reminder: {
    getMinutes: () => ipcRenderer.invoke('reminder:getMinutes'),
    setMinutes: (minutes: number) => ipcRenderer.invoke('reminder:setMinutes', minutes),
  },
});

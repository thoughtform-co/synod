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
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    setActive: (accountId: string) => ipcRenderer.invoke('accounts:setActive', accountId),
    reorder: (orderedIds: string[]) => ipcRenderer.invoke('accounts:reorder', orderedIds),
    remove: (accountId: string) => ipcRenderer.invoke('accounts:remove', accountId),
  },
  gmail: {
    listThreads: (accountId: string | undefined, labelId: string, maxResults: number, pageToken?: string) =>
      ipcRenderer.invoke('gmail:listThreads', accountId, labelId, maxResults, pageToken),
    getThread: (accountId: string | undefined, threadId: string) =>
      ipcRenderer.invoke('gmail:getThread', accountId, threadId),
    sendReply: (accountId: string | undefined, threadId: string, bodyText: string) =>
      ipcRenderer.invoke('gmail:sendReply', accountId, threadId, bodyText),
    getLabelIds: () => ipcRenderer.invoke('gmail:getLabelIds'),
    modifyLabels: (accountId: string | undefined, threadId: string, addLabelIds: string[], removeLabelIds: string[]) =>
      ipcRenderer.invoke('gmail:modifyLabels', accountId, threadId, addLabelIds, removeLabelIds),
    trashThread: (accountId: string | undefined, threadId: string) =>
      ipcRenderer.invoke('gmail:trashThread', accountId, threadId),
    searchThreads: (accountId: string | undefined, query: string, maxResults: number, pageToken?: string) =>
      ipcRenderer.invoke('gmail:searchThreads', accountId, query, maxResults, pageToken),
    listLabels: (accountId: string | undefined) => ipcRenderer.invoke('gmail:listLabels', accountId),
  },
  calendar: {
    listEvents: (accountId: string | undefined, daysAhead?: number) =>
      ipcRenderer.invoke('calendar:listEvents', accountId, daysAhead),
    respondToEvent: (accountId: string | undefined, eventId: string, response: 'accepted' | 'tentative' | 'declined') =>
      ipcRenderer.invoke('calendar:respondToEvent', accountId, eventId, response),
  },
  reminder: {
    getMinutes: () => ipcRenderer.invoke('reminder:getMinutes'),
    setMinutes: (minutes: number) => ipcRenderer.invoke('reminder:setMinutes', minutes),
  },
});

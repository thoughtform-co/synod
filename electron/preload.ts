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
    getAttachment: (accountId: string | undefined, messageId: string, attachmentId: string) =>
      ipcRenderer.invoke('gmail:getAttachment', accountId, messageId, attachmentId),
    sendReply: (accountId: string | undefined, threadId: string, bodyText: string, attachments?: { filename: string; mimeType: string; dataBase64: string }[]) =>
      ipcRenderer.invoke('gmail:sendReply', accountId, threadId, bodyText, attachments),
    createDraft: (
      accountId: string | undefined,
      to: string,
      cc: string,
      bcc: string,
      subject: string,
      bodyText: string,
      attachments?: { filename: string; mimeType: string; dataBase64: string }[]
    ) => ipcRenderer.invoke('gmail:createDraft', accountId, to, cc, bcc, subject, bodyText, attachments),
    updateDraft: (
      accountId: string | undefined,
      draftId: string,
      to: string,
      cc: string,
      bcc: string,
      subject: string,
      bodyText: string,
      attachments?: { filename: string; mimeType: string; dataBase64: string }[]
    ) => ipcRenderer.invoke('gmail:updateDraft', accountId, draftId, to, cc, bcc, subject, bodyText, attachments),
    deleteDraft: (accountId: string | undefined, draftId: string) =>
      ipcRenderer.invoke('gmail:deleteDraft', accountId, draftId),
    sendDraft: (accountId: string | undefined, draftId: string) =>
      ipcRenderer.invoke('gmail:sendDraft', accountId, draftId),
    sendNewMessage: (
      accountId: string | undefined,
      to: string,
      cc: string,
      bcc: string,
      subject: string,
      bodyText: string,
      attachments?: { filename: string; mimeType: string; dataBase64: string }[]
    ) => ipcRenderer.invoke('gmail:sendNewMessage', accountId, to, cc, bcc, subject, bodyText, attachments),
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
    listCalendars: (accountId: string | undefined) =>
      ipcRenderer.invoke('calendar:listCalendars', accountId),
    listEvents: (accountId: string | undefined, daysAhead?: number) =>
      ipcRenderer.invoke('calendar:listEvents', accountId, daysAhead),
    listEventsRange: (accountId: string | undefined, timeMin: string, timeMax: string) =>
      ipcRenderer.invoke('calendar:listEventsRange', accountId, timeMin, timeMax),
    respondToEvent: (accountId: string | undefined, eventId: string, response: 'accepted' | 'tentative' | 'declined', calendarId?: string) =>
      ipcRenderer.invoke('calendar:respondToEvent', accountId, eventId, response, calendarId),
  },
  reminder: {
    getMinutes: () => ipcRenderer.invoke('reminder:getMinutes'),
    setMinutes: (minutes: number) => ipcRenderer.invoke('reminder:setMinutes', minutes),
  },
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
  sync: {
    onStatus: (callback: (status: string) => void) => {
      const fn = (_: unknown, status: string) => callback(status);
      ipcRenderer.on('sync:status', fn);
      return () => {
        ipcRenderer.removeListener('sync:status', fn);
      };
    },
    onThreadsRefreshed: (callback: () => void) => {
      const fn = () => callback();
      ipcRenderer.on('threads:refreshed', fn);
      return () => {
        ipcRenderer.removeListener('threads:refreshed', fn);
      };
    },
  },
  search: {
    isConfigured: () => ipcRenderer.invoke('search:isConfigured'),
    keyword: (accountIds: string[], query: string, limit?: number, category?: string) =>
      ipcRenderer.invoke('search:keyword', accountIds, query, limit, category),
    semantic: (accountIds: string[], query: string, limit?: number, category?: string) =>
      ipcRenderer.invoke('search:semantic', accountIds, query, limit, category),
    hybrid: (accountIds: string[], query: string, limit?: number, category?: string) =>
      ipcRenderer.invoke('search:hybrid', accountIds, query, limit, category),
    local: (accountId: string, query: string, limit?: number) =>
      ipcRenderer.invoke('search:local', accountId, query, limit),
  },
  subscription: {
    overview: (accountIds: string[]) => ipcRenderer.invoke('subscription:overview', accountIds),
    timeline: (accountId: string, fingerprint?: string, bucketDays?: number) =>
      ipcRenderer.invoke('subscription:timeline', accountId, fingerprint, bucketDays),
  },
  indexing: {
    isConfigured: () => ipcRenderer.invoke('indexing:isConfigured'),
    setEmbedderApiKey: (key: string | null) => ipcRenderer.invoke('indexing:setEmbedderApiKey', key),
    reindexAccount: (accountId: string) => ipcRenderer.invoke('indexing:reindexAccount', accountId),
    purgeAccount: (accountId: string) => ipcRenderer.invoke('indexing:purgeAccount', accountId),
    getMetrics: () => ipcRenderer.invoke('indexing:getMetrics'),
  },
});

/// <reference types="vite/client" />

export interface OAuthResult {
  email: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number | null;
}

export interface AccountEntry {
  id: string;
  email: string;
}

export interface AccountsListResult {
  accounts: AccountEntry[];
  activeId: string | null;
  accountsOrder: string[];
}

interface ElectronAPI {
  store: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
  };
  oauth: {
    start: (clientId: string, clientSecret: string) => Promise<OAuthResult>;
  };
  accounts: {
    list: () => Promise<AccountsListResult>;
    setActive: (accountId: string) => Promise<void>;
    reorder: (orderedIds: string[]) => Promise<void>;
    remove: (accountId: string) => Promise<void>;
  };
  gmail: {
    listThreads: (accountId: string | undefined, labelId: string, maxResults: number, pageToken?: string) => Promise<{ threads: { id: string; snippet: string }[]; nextPageToken?: string }>;
    getThread: (accountId: string | undefined, threadId: string) => Promise<{ id: string; messages: GmailMessage[] }>;
    sendReply: (accountId: string | undefined, threadId: string, bodyText: string) => Promise<{ id: string }>;
    getLabelIds: () => Promise<{ INBOX: string; SENT: string; DRAFT: string }>;
    modifyLabels: (accountId: string | undefined, threadId: string, addLabelIds: string[], removeLabelIds: string[]) => Promise<void>;
    trashThread: (accountId: string | undefined, threadId: string) => Promise<void>;
    searchThreads: (accountId: string | undefined, query: string, maxResults: number, pageToken?: string) => Promise<{ threads: { id: string; snippet: string }[]; nextPageToken?: string }>;
    listLabels: (accountId: string | undefined) => Promise<{ id: string; name: string; type: string }[]>;
  };
  calendar: {
    listEvents: (accountId: string | undefined, daysAhead?: number) => Promise<CalendarEvent[]>;
    listEventsRange: (accountId: string | undefined, timeMin: string, timeMax: string) => Promise<CalendarEvent[]>;
    respondToEvent: (accountId: string | undefined, eventId: string, response: 'accepted' | 'tentative' | 'declined') => Promise<void>;
  };
  reminder: {
    getMinutes: () => Promise<number>;
    setMinutes: (minutes: number) => Promise<void>;
  };
  windowControls: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
  };
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location?: string;
  description?: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload?: {
    headers?: { name: string; value: string }[];
    mimeType?: string;
    body?: { data?: string };
    parts?: { mimeType?: string; body?: { data?: string } }[];
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};

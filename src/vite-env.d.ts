/// <reference types="vite/client" />

export interface OAuthResult {
  email: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number | null;
}

interface ElectronAPI {
  store: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
  };
  oauth: {
    start: (clientId: string, clientSecret: string) => Promise<OAuthResult>;
  };
  gmail: {
    listThreads: (labelId: string, maxResults: number, pageToken?: string) => Promise<{ threads: { id: string; snippet: string }[]; nextPageToken?: string }>;
    getThread: (threadId: string) => Promise<{ id: string; messages: GmailMessage[] }>;
    sendReply: (threadId: string, bodyText: string) => Promise<{ id: string }>;
    getLabelIds: () => Promise<{ INBOX: string; SENT: string; DRAFT: string }>;
  };
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

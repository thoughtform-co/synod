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
    listThreads: (accountId: string | undefined, labelId: string, maxResults: number, pageToken?: string) => Promise<{ threads: { id: string; snippet: string; subject?: string; from?: string; internalDate?: number }[]; nextPageToken?: string }>;
    getThread: (accountId: string | undefined, threadId: string) => Promise<{ id: string; messages: GmailMessage[] }>;
    getAttachment: (accountId: string | undefined, messageId: string, attachmentId: string) => Promise<{ data: string }>;
    sendReply: (accountId: string | undefined, threadId: string, bodyText: string, attachments?: OutgoingAttachment[]) => Promise<{ id: string }>;
    createDraft: (accountId: string | undefined, to: string, cc: string, bcc: string, subject: string, bodyText: string, attachments?: OutgoingAttachment[]) => Promise<{ id: string; messageId: string }>;
    updateDraft: (accountId: string | undefined, draftId: string, to: string, cc: string, bcc: string, subject: string, bodyText: string, attachments?: OutgoingAttachment[]) => Promise<void>;
    deleteDraft: (accountId: string | undefined, draftId: string) => Promise<void>;
    sendDraft: (accountId: string | undefined, draftId: string) => Promise<{ id: string }>;
    sendNewMessage: (accountId: string | undefined, to: string, cc: string, bcc: string, subject: string, bodyText: string, attachments?: OutgoingAttachment[]) => Promise<{ id: string }>;
    getLabelIds: () => Promise<{ INBOX: string; SENT: string; DRAFT: string }>;
    modifyLabels: (accountId: string | undefined, threadId: string, addLabelIds: string[], removeLabelIds: string[]) => Promise<void>;
    trashThread: (accountId: string | undefined, threadId: string) => Promise<void>;
    searchThreads: (accountId: string | undefined, query: string, maxResults: number, pageToken?: string) => Promise<{ threads: { id: string; snippet: string; subject?: string; from?: string; internalDate?: number }[]; nextPageToken?: string }>;
    listLabels: (accountId: string | undefined) => Promise<{ id: string; name: string; type: string }[]>;
  };
  calendar: {
    listCalendars: (accountId: string | undefined) => Promise<{ id: string; summary: string; backgroundColor?: string; selected: boolean }[]>;
    listEvents: (accountId: string | undefined, daysAhead?: number) => Promise<CalendarEvent[]>;
    listEventsRange: (accountId: string | undefined, timeMin: string, timeMax: string) => Promise<CalendarEvent[]>;
    respondToEvent: (accountId: string | undefined, eventId: string, response: 'accepted' | 'tentative' | 'declined', calendarId?: string) => Promise<void>;
    createEvent: (accountId: string | undefined, calendarId: string, event: CalendarEventInput) => Promise<CalendarEvent>;
    updateEvent: (accountId: string | undefined, calendarId: string, eventId: string, event: CalendarEventInput) => Promise<CalendarEvent>;
    deleteEvent: (accountId: string | undefined, calendarId: string, eventId: string) => Promise<void>;
  };
  reminder: {
    getMinutes: () => Promise<number>;
    setMinutes: (minutes: number) => Promise<void>;
    getUpcoming: () => Promise<{
      title: string;
      minutesUntil: number;
      isAllDay: boolean;
      eventType?: 'physical' | 'virtual' | 'unknown';
    } | null>;
  };
  windowControls: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
  };
  sync?: {
    onStatus: (callback: (status: SyncStatus) => void) => () => void;
    onThreadsRefreshed: (callback: () => void) => () => void;
  };
  notifications?: {
    onShow: (callback: (payload: { type: string; title: string; body: string }) => void) => () => void;
  };
  search?: {
    isConfigured: () => Promise<boolean>;
    keyword: (accountIds: string[], query: string, limit?: number, category?: string) => Promise<SearchResult[]>;
    semantic: (accountIds: string[], query: string, limit?: number, category?: string) => Promise<SearchResult[]>;
    hybrid: (accountIds: string[], query: string, limit?: number, category?: string) => Promise<SearchResult[]>;
    local: (accountId: string, query: string, limit?: number) => Promise<LocalSearchResult[]>;
  };
  subscription?: {
    overview: (accountIds: string[]) => Promise<SubscriptionOverviewItem[]>;
    timeline: (accountId: string, fingerprint?: string, bucketDays?: number) => Promise<{ bucketStart: number; count: number }[]>;
  };
  indexing?: {
    isConfigured: () => Promise<boolean>;
    setEmbedderApiKey: (key: string | null) => Promise<void>;
    reindexAccount: (accountId: string) => Promise<{ indexed: number; failed: number }>;
    purgeAccount: (accountId: string) => Promise<void>;
    getMetrics: () => Promise<IndexingMetrics>;
  };
  claude?: {
    isConfigured: () => Promise<boolean>;
    analyzeEmail: (subject: string, bodyText: string) => Promise<AnalyzeEmailResult>;
    extractEventFromImage: (
      imageBase64: string,
      mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
    ) => Promise<ExtractedEventFromImage>;
    dashboardInsights: (input: DashboardInsightsInput) => Promise<DashboardInsightsResult>;
  };
  ics?: {
    parse: (icsText: string) => Promise<ParsedIcsEvent | null>;
  };
}

export interface AnalyzeEmailResult {
  isInvite: boolean;
  confidence: number;
  eventDetails?: {
    title?: string;
    date?: string;
    time?: string;
    location?: string;
    description?: string;
  };
  actionItems?: string[];
  suggestedReply?: string;
}

export interface ExtractedEventFromImage {
  title?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  description?: string;
}

export interface ParsedIcsEvent {
  summary?: string;
  dtStart?: string;
  dtEnd?: string;
  location?: string;
  description?: string;
  organizer?: string;
  method?: string;
  eventId?: string;
}

export interface DashboardInsightsInput {
  unrepliedThreads: { threadId: string; subject: string; from: string; snippet: string; lastMessagePreview: string }[];
  upcomingEvents: { id: string; summary: string; start: string; end: string; isAllDay: boolean; location?: string }[];
  pendingInviteCount: number;
}

export interface DashboardInsightItem {
  type: 'unreplied' | 'task' | 'reminder';
  threadId?: string;
  title: string;
  subtitle?: string;
  suggestedAction?: string;
  suggestedReply?: string;
  priority: number;
}

export interface DashboardInsightsResult {
  items: DashboardInsightItem[];
}

export interface IndexingMetrics {
  lastIngestionStartTime: number | null;
  lastIngestionEndTime: number | null;
  lastEmbedLatencyMs: number | null;
  indexSuccessTotal: number;
  indexFailureTotal: number;
  lastKeywordQueryLatencyMs: number | null;
  lastSemanticQueryLatencyMs: number | null;
  keywordQueryCount: number;
  semanticQueryCount: number;
}

export interface SearchResult {
  chunkId: string;
  messageId: string;
  threadId: string;
  accountId: string;
  subject: string;
  from: string;
  snippet: string;
  internalDate: number;
  category: string;
  score: number;
  explanation?: string;
}

export interface LocalSearchResult {
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  internalDate: number;
}

export interface SubscriptionOverviewItem {
  senderDomain: string;
  senderName?: string;
  fingerprint: string;
  messageCount: number;
  firstSeen: number;
  lastSeen: number;
  category: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'up-to-date' | 'error';

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location?: string;
  description?: string;
  calendarId?: string;
  eventType?: 'physical' | 'virtual' | 'unknown';
}

export interface CalendarEventInput {
  summary?: string;
  start: string;
  end: string;
  isAllDay?: boolean;
  location?: string;
  description?: string;
  attendees?: string[];
  recurrence?: string[];
  reminderMinutes?: number;
}

export interface GmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}

/** Outgoing attachment: base64url-encoded data for compose/send. */
export interface OutgoingAttachment {
  filename: string;
  mimeType: string;
  dataBase64: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  bodyPlain?: string;
  bodyHtml?: string;
  attachments?: GmailAttachment[];
  calendarIcs?: string;
  payload?: {
    mimeType?: string;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};

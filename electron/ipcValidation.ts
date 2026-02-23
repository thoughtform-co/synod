/**
 * Runtime validation for IPC handler arguments. Reject invalid inputs to prevent
 * crashes and limit abuse (DoS, injection). All handlers should validate before use.
 */

const MAX_KEY_LEN = 512;
const MAX_JSON_VALUE_LEN = 1024 * 1024; // 1MB
const MAX_ACCOUNT_ID_LEN = 256;
const MAX_THREAD_ID_LEN = 128;
const MAX_LABEL_ID_LEN = 128;
const MAX_QUERY_LEN = 2048;
const MAX_BODY_TEXT_LEN = 1024 * 512; // 512KB
const MAX_ORDERED_IDS = 100;
const MAX_REMINDER_MINUTES = 60 * 24 * 7; // 1 week

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function parseStoreGet(row: { value: string } | undefined): unknown {
  if (!row?.value || typeof row.value !== 'string') return null;
  if (row.value.length > MAX_JSON_VALUE_LEN) return null;
  return safeJsonParse(row.value, null);
}

export function validateStoreKey(key: unknown): key is string {
  return typeof key === 'string' && key.length > 0 && key.length <= MAX_KEY_LEN;
}

export function validateStoreSet(key: unknown, value: unknown): boolean {
  if (!validateStoreKey(key)) return false;
  const s = JSON.stringify(value);
  return s.length <= MAX_JSON_VALUE_LEN;
}

export function validateOAuthStart(payload: unknown): payload is { clientId: string; clientSecret: string } {
  if (!payload || typeof payload !== 'object') return false;
  const { clientId, clientSecret } = payload as Record<string, unknown>;
  return (
    typeof clientId === 'string' &&
    clientId.length > 0 &&
    clientId.length <= 512 &&
    typeof clientSecret === 'string' &&
    clientSecret.length > 0 &&
    clientSecret.length <= 512
  );
}

export function optionalAccountId(v: unknown): v is string | undefined {
  return v === undefined || v === null || (typeof v === 'string' && v.length <= MAX_ACCOUNT_ID_LEN);
}

export function validateAccountId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_ACCOUNT_ID_LEN;
}

export function validateThreadId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_THREAD_ID_LEN;
}

export function validateLabelId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_LABEL_ID_LEN;
}

export function validateGmailListArgs(
  accountId: unknown,
  labelId: unknown,
  maxResults: unknown,
  pageToken?: unknown
): boolean {
  if (!optionalAccountId(accountId)) return false;
  if (!validateLabelId(labelId)) return false;
  const n = Number(maxResults);
  if (!Number.isFinite(n) || n < 1 || n > 100) return false;
  if (pageToken !== undefined && (typeof pageToken !== 'string' || pageToken.length > 256)) return false;
  return true;
}

export function validateGmailGetThreadArgs(accountId: unknown, threadId: unknown): boolean {
  return optionalAccountId(accountId) && validateThreadId(threadId);
}

const MAX_MESSAGE_ID_LEN = 128;
const MAX_ATTACHMENT_ID_LEN = 256;
const MAX_DRAFT_ID_LEN = 128;
const MAX_EMAIL_HEADER_LEN = 2048;
const MAX_ATTACHMENTS = 20;
const MAX_ATTACHMENT_B64_LEN = 25 * 1024 * 1024; // ~25MB per attachment
const MAX_FILENAME_LEN = 256;
const MAX_MIMETYPE_LEN = 128;

export function validateGmailGetAttachmentArgs(
  accountId: unknown,
  messageId: unknown,
  attachmentId: unknown
): boolean {
  if (!optionalAccountId(accountId)) return false;
  if (typeof messageId !== 'string' || messageId.length === 0 || messageId.length > MAX_MESSAGE_ID_LEN) return false;
  if (typeof attachmentId !== 'string' || attachmentId.length === 0 || attachmentId.length > MAX_ATTACHMENT_ID_LEN) return false;
  return true;
}

export function validateOutgoingAttachment(a: unknown): a is { filename: string; mimeType: string; dataBase64: string } {
  if (!a || typeof a !== 'object') return false;
  const o = a as Record<string, unknown>;
  return (
    typeof o.filename === 'string' &&
    o.filename.length > 0 &&
    o.filename.length <= MAX_FILENAME_LEN &&
    typeof o.mimeType === 'string' &&
    o.mimeType.length > 0 &&
    o.mimeType.length <= MAX_MIMETYPE_LEN &&
    typeof o.dataBase64 === 'string' &&
    o.dataBase64.length <= MAX_ATTACHMENT_B64_LEN
  );
}

export function validateOutgoingAttachments(attachments: unknown): attachments is { filename: string; mimeType: string; dataBase64: string }[] {
  if (attachments === undefined || attachments === null) return true;
  if (!Array.isArray(attachments) || attachments.length > MAX_ATTACHMENTS) return false;
  return attachments.every(validateOutgoingAttachment);
}

export function validateGmailSendReplyArgs(
  accountId: unknown,
  threadId: unknown,
  bodyText: unknown,
  attachments?: unknown
): boolean {
  if (!optionalAccountId(accountId) || !validateThreadId(threadId)) return false;
  if (typeof bodyText !== 'string' || bodyText.length > MAX_BODY_TEXT_LEN) return false;
  return validateOutgoingAttachments(attachments);
}

export function validateGmailCreateDraftArgs(
  accountId: unknown,
  to: unknown,
  cc: unknown,
  bcc: unknown,
  subject: unknown,
  bodyText: unknown,
  attachments?: unknown
): boolean {
  if (!optionalAccountId(accountId)) return false;
  if (typeof to !== 'string' || to.length > MAX_EMAIL_HEADER_LEN) return false;
  if (typeof cc !== 'string' || cc.length > MAX_EMAIL_HEADER_LEN) return false;
  if (typeof bcc !== 'string' || bcc.length > MAX_EMAIL_HEADER_LEN) return false;
  if (typeof subject !== 'string' || subject.length > MAX_EMAIL_HEADER_LEN) return false;
  if (typeof bodyText !== 'string' || bodyText.length > MAX_BODY_TEXT_LEN) return false;
  return validateOutgoingAttachments(attachments);
}

export function validateGmailUpdateDraftArgs(
  accountId: unknown,
  draftId: unknown,
  to: unknown,
  cc: unknown,
  bcc: unknown,
  subject: unknown,
  bodyText: unknown,
  attachments?: unknown
): boolean {
  if (!optionalAccountId(accountId)) return false;
  if (typeof draftId !== 'string' || draftId.length === 0 || draftId.length > MAX_DRAFT_ID_LEN) return false;
  if (typeof to !== 'string' || to.length > MAX_EMAIL_HEADER_LEN) return false;
  if (typeof cc !== 'string' || cc.length > MAX_EMAIL_HEADER_LEN) return false;
  if (typeof bcc !== 'string' || bcc.length > MAX_EMAIL_HEADER_LEN) return false;
  if (typeof subject !== 'string' || subject.length > MAX_EMAIL_HEADER_LEN) return false;
  if (typeof bodyText !== 'string' || bodyText.length > MAX_BODY_TEXT_LEN) return false;
  return validateOutgoingAttachments(attachments);
}

export function validateGmailDeleteDraftArgs(accountId: unknown, draftId: unknown): boolean {
  if (!optionalAccountId(accountId)) return false;
  return typeof draftId === 'string' && draftId.length > 0 && draftId.length <= MAX_DRAFT_ID_LEN;
}

export function validateGmailSendDraftArgs(accountId: unknown, draftId: unknown): boolean {
  if (!optionalAccountId(accountId)) return false;
  return typeof draftId === 'string' && draftId.length > 0 && draftId.length <= MAX_DRAFT_ID_LEN;
}

export function validateGmailSendNewMessageArgs(
  accountId: unknown,
  to: unknown,
  cc: unknown,
  bcc: unknown,
  subject: unknown,
  bodyText: unknown,
  attachments?: unknown
): boolean {
  if (!optionalAccountId(accountId)) return false;
  if (typeof to !== 'string' || to.length > MAX_EMAIL_HEADER_LEN) return false;
  if (typeof cc !== 'string' || cc.length > MAX_EMAIL_HEADER_LEN) return false;
  if (typeof bcc !== 'string' || bcc.length > MAX_EMAIL_HEADER_LEN) return false;
  if (typeof subject !== 'string' || subject.length > MAX_EMAIL_HEADER_LEN) return false;
  if (typeof bodyText !== 'string' || bodyText.length > MAX_BODY_TEXT_LEN) return false;
  return validateOutgoingAttachments(attachments);
}

export function validateGmailModifyLabelsArgs(
  accountId: unknown,
  threadId: unknown,
  addLabelIds: unknown,
  removeLabelIds: unknown
): boolean {
  if (!optionalAccountId(accountId) || !validateThreadId(threadId)) return false;
  if (!Array.isArray(addLabelIds) || !Array.isArray(removeLabelIds)) return false;
  if (addLabelIds.length > 50 || removeLabelIds.length > 50) return false;
  if (addLabelIds.some((x) => typeof x !== 'string' || x.length > MAX_LABEL_ID_LEN)) return false;
  if (removeLabelIds.some((x) => typeof x !== 'string' || x.length > MAX_LABEL_ID_LEN)) return false;
  return true;
}

export function validateGmailSearchArgs(
  accountId: unknown,
  query: unknown,
  maxResults: unknown,
  pageToken?: unknown
): boolean {
  if (!optionalAccountId(accountId)) return false;
  if (typeof query !== 'string' || query.length > MAX_QUERY_LEN) return false;
  const n = Number(maxResults);
  if (!Number.isFinite(n) || n < 1 || n > 100) return false;
  if (pageToken !== undefined && (typeof pageToken !== 'string' || pageToken.length > 256)) return false;
  return true;
}

export function validateCalendarListEventsArgs(accountId: unknown, daysAhead?: unknown): boolean {
  if (!optionalAccountId(accountId)) return false;
  if (daysAhead !== undefined) {
    const n = Number(daysAhead);
    if (!Number.isFinite(n) || n < 1 || n > 365) return false;
  }
  return true;
}

export function validateCalendarListEventsRangeArgs(
  accountId: unknown,
  timeMin: unknown,
  timeMax: unknown
): boolean {
  if (!optionalAccountId(accountId)) return false;
  if (typeof timeMin !== 'string' || typeof timeMax !== 'string') return false;
  if (timeMin.length > 64 || timeMax.length > 64) return false;
  return true;
}

const CALENDAR_RESPONSES = new Set(['accepted', 'tentative', 'declined']);
export function validateCalendarRespondArgs(
  accountId: unknown,
  eventId: unknown,
  response: unknown,
  calendarId?: unknown
): boolean {
  if (!optionalAccountId(accountId)) return false;
  if (typeof eventId !== 'string' || eventId.length === 0 || eventId.length > 256) return false;
  if (calendarId !== undefined && (typeof calendarId !== 'string' || calendarId.length > 256)) return false;
  return CALENDAR_RESPONSES.has(response as string);
}

function validCalendarId(v: unknown): boolean {
  return typeof v === 'string' && v.length > 0 && v.length <= 256;
}

function validEventInput(event: unknown): event is { start: string; end: string; summary?: string; isAllDay?: boolean; location?: string; description?: string; attendees?: string[]; recurrence?: string[]; reminderMinutes?: number } {
  if (!event || typeof event !== 'object') return false;
  const o = event as Record<string, unknown>;
  if (typeof o.start !== 'string' || o.start.length > 128) return false;
  if (typeof o.end !== 'string' || o.end.length > 128) return false;
  if (o.summary !== undefined && typeof o.summary !== 'string') return false;
  if (o.isAllDay !== undefined && typeof o.isAllDay !== 'boolean') return false;
  if (o.location !== undefined && typeof o.location !== 'string') return false;
  if (o.description !== undefined && typeof o.description !== 'string') return false;
  if (o.attendees !== undefined) {
    if (!Array.isArray(o.attendees) || o.attendees.length > 100) return false;
    if (!o.attendees.every((a: unknown) => typeof a === 'string' && a.length <= 256)) return false;
  }
  if (o.recurrence !== undefined) {
    if (!Array.isArray(o.recurrence) || o.recurrence.length > 20) return false;
    if (!o.recurrence.every((r: unknown) => typeof r === 'string' && r.length <= 256)) return false;
  }
  if (o.reminderMinutes !== undefined && (typeof o.reminderMinutes !== 'number' || o.reminderMinutes < 0 || o.reminderMinutes > 40320)) return false;
  return true;
}

export function validateCalendarCreateEventArgs(accountId: unknown, calendarId: unknown, event: unknown): boolean {
  if (!optionalAccountId(accountId)) return false;
  if (!validCalendarId(calendarId)) return false;
  return validEventInput(event);
}

export function validateCalendarUpdateEventArgs(accountId: unknown, calendarId: unknown, eventId: unknown, event: unknown): boolean {
  if (!optionalAccountId(accountId)) return false;
  if (!validCalendarId(calendarId)) return false;
  if (typeof eventId !== 'string' || eventId.length === 0 || eventId.length > 256) return false;
  return validEventInput(event);
}

export function validateCalendarDeleteEventArgs(accountId: unknown, calendarId: unknown, eventId: unknown): boolean {
  if (!optionalAccountId(accountId)) return false;
  if (!validCalendarId(calendarId)) return false;
  if (typeof eventId !== 'string' || eventId.length === 0 || eventId.length > 256) return false;
  return true;
}

export function validateAccountsReorder(orderedIds: unknown): orderedIds is string[] {
  if (!Array.isArray(orderedIds) || orderedIds.length > MAX_ORDERED_IDS) return false;
  return orderedIds.every((id) => typeof id === 'string' && id.length <= MAX_ACCOUNT_ID_LEN);
}

export function validateReminderMinutes(minutes: unknown): boolean {
  const n = Number(minutes);
  return Number.isFinite(n) && n >= 0 && n <= MAX_REMINDER_MINUTES;
}

const CATEGORIES = new Set(['main', 'subscription', 'promotion', 'social', 'update', 'transactional', 'other']);

export function validateSearchArgs(
  accountIds: unknown,
  query: unknown,
  limit?: unknown,
  category?: unknown
): boolean {
  if (!Array.isArray(accountIds)) return false;
  if (accountIds.length > MAX_ORDERED_IDS) return false;
  if (accountIds.some((id) => typeof id !== 'string' || id.length > MAX_ACCOUNT_ID_LEN)) return false;
  if (typeof query !== 'string' || query.length > MAX_QUERY_LEN) return false;
  if (limit !== undefined) {
    const n = Number(limit);
    if (!Number.isFinite(n) || n < 1 || n > 200) return false;
  }
  if (category !== undefined && category !== null && !CATEGORIES.has(category as string)) return false;
  return true;
}

export function validateSubscriptionOverviewArgs(accountIds: unknown): boolean {
  if (!Array.isArray(accountIds)) return false;
  if (accountIds.length > MAX_ORDERED_IDS) return false;
  return accountIds.every((id) => typeof id === 'string' && id.length <= MAX_ACCOUNT_ID_LEN);
}

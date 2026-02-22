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

export function validateGmailSendReplyArgs(accountId: unknown, threadId: unknown, bodyText: unknown): boolean {
  if (!optionalAccountId(accountId) || !validateThreadId(threadId)) return false;
  return typeof bodyText === 'string' && bodyText.length <= MAX_BODY_TEXT_LEN;
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
  response: unknown
): boolean {
  if (!optionalAccountId(accountId)) return false;
  if (typeof eventId !== 'string' || eventId.length === 0 || eventId.length > 256) return false;
  return CALENDAR_RESPONSES.has(response as string);
}

export function validateAccountsReorder(orderedIds: unknown): orderedIds is string[] {
  if (!Array.isArray(orderedIds) || orderedIds.length > MAX_ORDERED_IDS) return false;
  return orderedIds.every((id) => typeof id === 'string' && id.length <= MAX_ACCOUNT_ID_LEN);
}

export function validateReminderMinutes(minutes: unknown): boolean {
  const n = Number(minutes);
  return Number.isFinite(n) && n >= 0 && n <= MAX_REMINDER_MINUTES;
}

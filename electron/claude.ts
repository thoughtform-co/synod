/**
 * Claude API integration for Synod Intelligence Hub.
 * Wraps Anthropic Messages API for email analysis, screenshot-to-event extraction, and dashboard insights.
 * Gracefully degrades when ANTHROPIC_API_KEY is not set.
 */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_EMAIL_BODY_LEN = 50000;
const MAX_IMAGE_B64_LEN = 5 * 1024 * 1024; // 5MB

function getApiKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY;
  return key && typeof key === 'string' && key.length > 0 ? key : null;
}

export function isClaudeConfigured(): boolean {
  return !!getApiKey();
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

const ANALYZE_EMAIL_SYSTEM = `You are an assistant that analyzes emails to detect calendar invites and extract actionable information.
Output only valid JSON, no markdown or extra text.
For invite detection: set isInvite true if the email is clearly inviting the reader to an event (appointment, meeting, consultation, etc.) with a date/time. Set confidence 0-1.
When isInvite is true, fill eventDetails with: title, date (YYYY-MM-DD), time (HH:MM or HH:MM-HH:MM), location, description as visible in the email.
When the email contains a specific ask or request (even if not an invite), list actionItems (short strings). If the last message seems to expect a reply, optionally suggest a one-paragraph suggestedReply.`;

export async function analyzeEmail(subject: string, bodyText: string): Promise<AnalyzeEmailResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { isInvite: false, confidence: 0 };
  }
  const body = bodyText.slice(0, MAX_EMAIL_BODY_LEN);
  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: ANALYZE_EMAIL_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Subject: ${subject}\n\nBody:\n${body}\n\nRespond with a single JSON object: { "isInvite": boolean, "confidence": number, "eventDetails": { "title", "date", "time", "location", "description" } or null, "actionItems": string[] or null, "suggestedReply": string or null }.`,
      },
    ],
  });
  const text = response.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('');
  try {
    const parsed = JSON.parse(text.trim()) as AnalyzeEmailResult;
    return {
      isInvite: !!parsed.isInvite,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      eventDetails: parsed.eventDetails || undefined,
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : undefined,
      suggestedReply: typeof parsed.suggestedReply === 'string' ? parsed.suggestedReply : undefined,
    };
  } catch {
    return { isInvite: false, confidence: 0 };
  }
}

export interface ExtractedEventFromImage {
  title?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  description?: string;
}

const EXTRACT_EVENT_SYSTEM = `You are an assistant that extracts calendar event details from screenshots (e.g. confirmation pages, invite emails, calendar views).
Output only valid JSON, no markdown or extra text.
Return a JSON object with any of these fields you can read: title, date (YYYY-MM-DD), startTime (HH:MM), endTime (HH:MM), location, description. Omit any field not visible.`;

export async function extractEventFromImage(
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
): Promise<ExtractedEventFromImage> {
  const apiKey = getApiKey();
  if (!apiKey || !imageBase64 || imageBase64.length > MAX_IMAGE_B64_LEN) {
    return {};
  }
  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: EXTRACT_EVENT_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: 'Extract event details from this image. Respond with a single JSON object with fields: title, date (YYYY-MM-DD), startTime (HH:MM), endTime (HH:MM), location, description. Omit fields not visible. Only output the JSON object.',
          },
        ],
      },
    ],
  });
  const text = response.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('');
  try {
    const parsed = JSON.parse(text.trim()) as ExtractedEventFromImage;
    return {
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
      date: typeof parsed.date === 'string' ? parsed.date : undefined,
      startTime: typeof parsed.startTime === 'string' ? parsed.startTime : undefined,
      endTime: typeof parsed.endTime === 'string' ? parsed.endTime : undefined,
      location: typeof parsed.location === 'string' ? parsed.location : undefined,
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
    };
  } catch {
    return {};
  }
}

export interface ThreadSummaryForDashboard {
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  lastMessagePreview: string;
}

export interface EventSummaryForDashboard {
  id: string;
  summary: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location?: string;
}

export interface DashboardInsightsInput {
  unrepliedThreads: ThreadSummaryForDashboard[];
  upcomingEvents: EventSummaryForDashboard[];
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

const DASHBOARD_SYSTEM = `You are an assistant that summarizes a user's email and calendar context into a short, actionable dashboard.
You receive: unreplied thread summaries, upcoming events, and pending invite count.
Output only valid JSON. Return { "items": [ { "type": "unreplied"|"task"|"reminder", "threadId": string or omit, "title": string, "subtitle": string or omit, "suggestedAction": string or omit, "suggestedReply": string or omit, "priority": number 1-10 } ] }.
Focus on: threads that clearly need a reply or have an explicit ask; tasks or deadlines mentioned in emails; and high-priority reminders. Keep titles and subtitles very short. Max 15 items.`;

export async function dashboardInsights(input: DashboardInsightsInput): Promise<DashboardInsightsResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { items: [] };
  }
  const payload = JSON.stringify(input);
  if (payload.length > 60000) {
    return { items: [] };
  }
  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: DASHBOARD_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Summarize this into dashboard insight items. Input:\n${payload}\n\nRespond with a single JSON object: { "items": [ ... ] }.`,
      },
    ],
  });
  const text = response.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('');
  try {
    const parsed = JSON.parse(text.trim()) as DashboardInsightsResult;
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return {
      items: items.slice(0, 15).map((item) => ({
        type: (item.type === 'unreplied' || item.type === 'task' || item.type === 'reminder' ? item.type : 'task') as 'unreplied' | 'task' | 'reminder',
        threadId: typeof item.threadId === 'string' ? item.threadId : undefined,
        title: typeof item.title === 'string' ? item.title : 'Item',
        subtitle: typeof item.subtitle === 'string' ? item.subtitle : undefined,
        suggestedAction: typeof item.suggestedAction === 'string' ? item.suggestedAction : undefined,
        suggestedReply: typeof item.suggestedReply === 'string' ? item.suggestedReply : undefined,
        priority: typeof item.priority === 'number' ? item.priority : 5,
      })),
    };
  } catch {
    return { items: [] };
  }
}

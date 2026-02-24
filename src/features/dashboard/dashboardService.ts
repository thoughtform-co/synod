import type {
  DashboardInsightsInput,
  DashboardInsightsResult,
  DashboardInsightItem,
} from '@/vite-env.d';
import type { CalendarEvent } from '@/features/calendar/calendarClient';

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let cached: { at: number; data: DashboardData } | null = null;

export interface DashboardData {
  insightItems: DashboardInsightItem[];
  upcomingEvents: CalendarEvent[];
  pendingInviteCount: number;
  unrepliedThreads: { threadId: string; subject: string; from: string; snippet: string; lastMessagePreview: string }[];
}

export async function fetchDashboardData(
  accountIds: string[],
  activeAccountId: string | null
): Promise<DashboardData> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }
  const gmail = window.electronAPI?.gmail;
  const calendar = window.electronAPI?.calendar;
  const claude = window.electronAPI?.claude;

  const now = new Date();
  const timeMin = new Date(now);
  timeMin.setHours(0, 0, 0, 0);
  const timeMax = new Date(now);
  timeMax.setDate(timeMax.getDate() + 2);
  timeMax.setHours(23, 59, 59, 999);

  const unrepliedThreads: DashboardData['unrepliedThreads'] = [];
  let pendingInviteCount = 0;

  if (gmail && accountIds.length > 0) {
    try {
      const inbox = await gmail.listThreads(accountIds[0], 'INBOX', 20);
      for (const t of inbox.threads) {
        unrepliedThreads.push({
          threadId: t.id,
          subject: t.subject ?? '',
          from: t.from ?? '',
          snippet: t.snippet ?? '',
          lastMessagePreview: (t.snippet ?? '').slice(0, 200),
        });
      }
      const inviteResult = await gmail.searchThreads(accountIds[0], 'has:invite is:unread', 50);
      pendingInviteCount = inviteResult.threads?.length ?? 0;
    } catch {
      /* ignore */
    }
  }

  let upcomingEvents: CalendarEvent[] = [];
  if (calendar?.listEventsRange) {
    try {
      upcomingEvents = await calendar.listEventsRange(
        activeAccountId ?? undefined,
        timeMin.toISOString(),
        timeMax.toISOString()
      );
    } catch {
      /* ignore */
    }
  }

  const input: DashboardInsightsInput = {
    unrepliedThreads,
    upcomingEvents: upcomingEvents.slice(0, 30).map((e) => ({
      id: e.id,
      summary: e.summary,
      start: e.start,
      end: e.end,
      isAllDay: e.isAllDay,
      location: e.location,
    })),
    pendingInviteCount,
  };

  let insightItems: DashboardInsightItem[] = [];
  if (claude?.dashboardInsights) {
    try {
      const result: DashboardInsightsResult = await claude.dashboardInsights(input);
      insightItems = result.items ?? [];
    } catch {
      /* ignore */
    }
  }

  const data: DashboardData = {
    insightItems,
    upcomingEvents,
    pendingInviteCount,
    unrepliedThreads,
  };
  cached = { at: Date.now(), data };
  return data;
}

export function invalidateDashboardCache(): void {
  cached = null;
}

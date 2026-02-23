import { Notification } from 'electron';
import path from 'path';
import { app } from 'electron';
import { getDb } from './db';
import { listEvents } from './calendar';
import { safeParse } from './safeJson';

const POLL_INTERVAL_MS = 60 * 1000;
const REMINDER_KEY = 'reminderMinutes';
const NOTIFIED_KEY = 'reminder_notified_ids';

function getStoredJson(db: import('better-sqlite3').Database, key: string): unknown {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? safeParse(row.value, null) : null;
}

function setStoredJson(db: import('better-sqlite3').Database, key: string, value: unknown): void {
  db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
}

function getReminderMinutes(): number {
  const db = getDb();
  if (!db) return 15;
  const v = getStoredJson(db, REMINDER_KEY);
  if (typeof v === 'number' && v >= 0) return v;
  return 15;
}

function getNotifiedIds(): Set<string> {
  const db = getDb();
  if (!db) return new Set();
  const v = getStoredJson(db, NOTIFIED_KEY);
  if (Array.isArray(v)) return new Set(v as string[]);
  return new Set();
}

function markNotified(eventId: string): void {
  const db = getDb();
  if (!db) return;
  const set = getNotifiedIds();
  set.add(eventId);
  const arr = Array.from(set);
  if (arr.length > 500) arr.splice(0, arr.length - 400);
  setStoredJson(db, NOTIFIED_KEY, arr);
}

function getNotificationIcon(): string | undefined {
  try {
    const iconPath = path.join(app.getAppPath(), 'public', 'icon.png');
    const fs = require('fs');
    if (fs.existsSync(iconPath)) return iconPath;
  } catch {
    /* ignore */
  }
  return undefined;
}

export function startReminderEngine(getMainWindow: () => import('electron').BrowserWindow | null): void {
  function tick(): void {
    const db = getDb();
    if (!db) return;
    const active = getStoredJson(db, 'active_account') as string | null;
    const legacy = getStoredJson(db, 'account') as { email?: string } | null;
    const accountId = (active && typeof active === 'string') ? active : legacy?.email;
    if (!accountId) return;

    const reminderMins = getReminderMinutes();
    const notified = getNotifiedIds();

    listEvents(accountId, 1)
      .then((events) => {
        const now = Date.now();
        const windowEnd = now + reminderMins * 60 * 1000;
        for (const ev of events) {
          const start = new Date(ev.start).getTime();
          if (start < now || start > windowEnd) continue;
          if (notified.has(ev.id)) continue;
          if (!Notification.isSupported()) continue;
          const icon = getNotificationIcon();
          const n = new Notification({
            title: ev.summary,
            body: ev.isAllDay
              ? 'All day'
              : `${new Date(ev.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${new Date(ev.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
            ...(icon ? { icon } : {}),
          });
          n.on('click', () => {
            getMainWindow()?.show();
            getMainWindow()?.focus();
          });
          n.show();
          markNotified(ev.id);
          const win = getMainWindow();
          if (win?.webContents && !win.isDestroyed()) {
            win.webContents.send('notification:show', {
              type: 'reminder',
              title: ev.summary,
              body: ev.isAllDay
                ? 'All day'
                : `${new Date(ev.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${new Date(ev.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
            });
            win.flashFrame(true);
          }
        }
      })
      .catch(() => {});
  }

  setInterval(tick, POLL_INTERVAL_MS);
  tick();
}

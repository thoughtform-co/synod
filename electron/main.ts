import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron';
import path from 'path';
import { initDb, getDb } from './db';
import { runOAuthFlow } from './oauth';
import { listThreads, getThread, buildAndSendReply, getLabelIds, modifyLabels, trashThread, searchThreads, listLabels } from './gmail';
import { listEvents, listEventsRange, respondToEvent } from './calendar';
import { startReminderEngine } from './reminderEngine';
import { applyNotchRegion, clearNotchRegion, hwndFromBuffer } from './windowRegion';

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
    backgroundColor: '#050403',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    const win = mainWindow;
    mainWindow?.show();
    if (win && process.platform === 'win32') {
      const hwnd = hwndFromBuffer(win.getNativeWindowHandle());
      let applyingRegion = false;
      let lastAppliedRegionKey = '';
      const updateRegion = () => {
        if (!mainWindow) return;
        const [w, h] = mainWindow.getSize();
        const display = screen.getDisplayMatching(mainWindow.getBounds());
        const key = `${w}x${h}@${display.scaleFactor}`;
        if (applyingRegion) {
          return;
        }
        if (key === lastAppliedRegionKey) {
          return;
        }
        applyingRegion = true;
        try {
          applyNotchRegion(hwnd, w, h, display.scaleFactor);
          lastAppliedRegionKey = key;
        } finally {
          applyingRegion = false;
        }
      };
      win.on('resize', updateRegion);
      win.on('maximize', () => clearNotchRegion(hwnd));
      win.on('unmaximize', updateRegion);
      updateRegion();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  initDb();
  createWindow();
  startReminderEngine();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  const db = getDb();
  if (db) db.close();
  if (process.platform !== 'darwin') app.quit();
});

// IPC: persist key-value (e.g. theme, account config)
ipcMain.handle('store:get', (_event, key: string) => {
  const db = getDb();
  if (!db) return null;
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? JSON.parse(row.value) : null;
});

ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
  const db = getDb();
  if (!db) return;
  db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
});

ipcMain.handle(
  'oauth:start',
  (_event, { clientId, clientSecret }: { clientId: string; clientSecret: string }) =>
    runOAuthFlow(clientId, clientSecret)
);

ipcMain.handle(
  'gmail:listThreads',
  (_event, accountId: string | undefined, labelId: string, maxResults: number, pageToken?: string) =>
    listThreads(accountId, labelId, maxResults, pageToken)
);
ipcMain.handle('gmail:getThread', (_event, accountId: string | undefined, threadId: string) =>
  getThread(accountId, threadId)
);
ipcMain.handle('gmail:sendReply', (_event, accountId: string | undefined, threadId: string, bodyText: string) =>
  buildAndSendReply(accountId, threadId, bodyText)
);
ipcMain.handle('gmail:getLabelIds', () => getLabelIds());
ipcMain.handle(
  'gmail:modifyLabels',
  (_event, accountId: string | undefined, threadId: string, addLabelIds: string[], removeLabelIds: string[]) =>
    modifyLabels(accountId, threadId, addLabelIds, removeLabelIds)
);
ipcMain.handle('gmail:trashThread', (_event, accountId: string | undefined, threadId: string) =>
  trashThread(accountId, threadId)
);
ipcMain.handle(
  'gmail:searchThreads',
  (_event, accountId: string | undefined, query: string, maxResults: number, pageToken?: string) =>
    searchThreads(accountId, query, maxResults, pageToken)
);
ipcMain.handle('gmail:listLabels', (_event, accountId: string | undefined) => listLabels(accountId));

ipcMain.handle('calendar:listEvents', (_event, accountId: string | undefined, daysAhead?: number) =>
  listEvents(accountId, daysAhead)
);
ipcMain.handle('calendar:listEventsRange', (_event, accountId: string | undefined, timeMin: string, timeMax: string) =>
  listEventsRange(accountId, timeMin, timeMax)
);
ipcMain.handle(
  'calendar:respondToEvent',
  (_event, accountId: string | undefined, eventId: string, response: 'accepted' | 'tentative' | 'declined') =>
    respondToEvent(accountId, eventId, response)
);

// Accounts
ipcMain.handle('accounts:list', () => {
  const db = getDb();
  if (!db) return { accounts: [], activeId: null, accountsOrder: [] };
  const orderRow = db.prepare('SELECT value FROM kv WHERE key = ?').get('accounts_order') as { value: string } | undefined;
  const accountsOrder: string[] = orderRow ? JSON.parse(orderRow.value) : [];
  const activeRow = db.prepare('SELECT value FROM kv WHERE key = ?').get('active_account') as { value: string } | undefined;
  const activeId = activeRow ? JSON.parse(activeRow.value) as string : null;
  const rows = db.prepare('SELECT id, email FROM accounts ORDER BY id').all() as { id: string; email: string }[];
  const accounts = rows.map((r) => ({ id: r.id, email: r.email }));
  const ordered = accountsOrder.length
    ? accountsOrder
        .map((id) => accounts.find((a) => a.id === id))
        .filter(Boolean) as { id: string; email: string }[]
    : accounts;
  return { accounts: ordered, activeId, accountsOrder };
});
ipcMain.handle('accounts:setActive', (_event, accountId: string) => {
  const db = getDb();
  if (!db) return;
  db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run('active_account', JSON.stringify(accountId));
});
ipcMain.handle('accounts:reorder', (_event, orderedIds: string[]) => {
  const db = getDb();
  if (!db) return;
  db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run('accounts_order', JSON.stringify(orderedIds));
});
ipcMain.handle('accounts:remove', (_event, accountId: string) => {
  const db = getDb();
  if (!db) return;
  db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
  db.prepare('DELETE FROM sync_state WHERE account_id = ?').run(accountId);
  const orderRow = db.prepare('SELECT value FROM kv WHERE key = ?').get('accounts_order') as { value: string } | undefined;
  const order: string[] = orderRow ? JSON.parse(orderRow.value) : [];
  const next = order.filter((id) => id !== accountId);
  db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run('accounts_order', JSON.stringify(next));
  const activeRow = db.prepare('SELECT value FROM kv WHERE key = ?').get('active_account') as { value: string } | undefined;
  const active = activeRow ? JSON.parse(activeRow.value) as string : null;
  if (active === accountId && next.length > 0) {
    db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run('active_account', JSON.stringify(next[0]));
  } else if (active === accountId) {
    db.prepare('DELETE FROM kv WHERE key = ?').run('active_account');
  }
});

ipcMain.handle('reminder:getMinutes', () => {
  const db = getDb();
  if (!db) return 15;
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get('reminderMinutes') as { value: string } | undefined;
  if (!row) return 15;
  const n = Number(JSON.parse(row.value));
  return Number.isFinite(n) && n >= 0 ? n : 15;
});

ipcMain.handle('reminder:setMinutes', (_event, minutes: number) => {
  const db = getDb();
  if (!db) return;
  db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run('reminderMinutes', JSON.stringify(minutes));
});

// Window controls (frameless)
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

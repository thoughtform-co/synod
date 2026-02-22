import { app, BrowserWindow, ipcMain, Menu, screen, shell } from 'electron';
import path from 'path';
import { initDb, getDb, getKv, setKv, deleteKv } from './db';
import { migrateSecretsFromPlaintext } from './secretStorage';
import { runOAuthFlow } from './oauth';
import { listThreads, getThread, buildAndSendReply, getLabelIds, modifyLabels, trashThread, searchThreads, listLabels } from './gmail';
import { listEvents, listEventsRange, respondToEvent } from './calendar';
import { startReminderEngine } from './reminderEngine';
import { setupAutoUpdater } from './updater';
import { applyNotchRegion, clearNotchRegion, hwndFromBuffer } from './windowRegion';
import {
  parseStoreGet,
  validateStoreKey,
  validateStoreSet,
  validateOAuthStart,
  optionalAccountId,
  validateGmailListArgs,
  validateGmailGetThreadArgs,
  validateGmailSendReplyArgs,
  validateGmailModifyLabelsArgs,
  validateGmailSearchArgs,
  validateCalendarListEventsArgs,
  validateCalendarListEventsRangeArgs,
  validateCalendarRespondArgs,
  validateAccountId,
  validateAccountsReorder,
  validateReminderMinutes,
} from './ipcValidation';

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
      sandbox: true,
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

  const allowedOrigins = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'file://',
  ]);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (u.protocol === 'https:' || u.protocol === 'http:') {
        shell.openExternal(url);
      }
    } catch {
      /* ignore */
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const u = new URL(url);
      const origin = u.origin;
      if (allowedOrigins.has(origin)) return;
      if (u.protocol === 'https:' || u.protocol === 'http:') {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });

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
  migrateSecretsFromPlaintext();
  createWindow();
  startReminderEngine();
  setupAutoUpdater();
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
ipcMain.handle('store:get', (_event, key: unknown) => {
  if (!validateStoreKey(key)) return null;
  const raw = getKv(key as string);
  return raw !== null ? parseStoreGet({ value: raw }) : null;
});

ipcMain.handle('store:set', (_event, key: unknown, value: unknown) => {
  if (!validateStoreSet(key, value)) return;
  setKv(key as string, JSON.stringify(value));
});

ipcMain.handle('oauth:start', (_event, payload: unknown) => {
  if (!validateOAuthStart(payload)) throw new Error('Invalid OAuth payload');
  return runOAuthFlow(payload.clientId, payload.clientSecret);
});

ipcMain.handle(
  'gmail:listThreads',
  (_event, accountId: unknown, labelId: unknown, maxResults: unknown, pageToken?: unknown) => {
    if (!validateGmailListArgs(accountId, labelId, maxResults, pageToken)) throw new Error('Invalid gmail:listThreads args');
    return listThreads(accountId as string | undefined, labelId as string, maxResults as number, pageToken as string | undefined);
  }
);
ipcMain.handle('gmail:getThread', (_event, accountId: unknown, threadId: unknown) => {
  if (!validateGmailGetThreadArgs(accountId, threadId)) throw new Error('Invalid gmail:getThread args');
  return getThread(accountId as string | undefined, threadId as string);
});
ipcMain.handle('gmail:sendReply', (_event, accountId: unknown, threadId: unknown, bodyText: unknown) => {
  if (!validateGmailSendReplyArgs(accountId, threadId, bodyText)) throw new Error('Invalid gmail:sendReply args');
  return buildAndSendReply(accountId as string | undefined, threadId as string, bodyText as string);
});
ipcMain.handle('gmail:getLabelIds', () => getLabelIds());
ipcMain.handle(
  'gmail:modifyLabels',
  (_event, accountId: unknown, threadId: unknown, addLabelIds: unknown, removeLabelIds: unknown) => {
    if (!validateGmailModifyLabelsArgs(accountId, threadId, addLabelIds, removeLabelIds)) throw new Error('Invalid gmail:modifyLabels args');
    return modifyLabels(
      accountId as string | undefined,
      threadId as string,
      addLabelIds as string[],
      removeLabelIds as string[]
    );
  }
);
ipcMain.handle('gmail:trashThread', (_event, accountId: unknown, threadId: unknown) => {
  if (!validateGmailGetThreadArgs(accountId, threadId)) throw new Error('Invalid gmail:trashThread args');
  return trashThread(accountId as string | undefined, threadId as string);
});
ipcMain.handle(
  'gmail:searchThreads',
  (_event, accountId: unknown, query: unknown, maxResults: unknown, pageToken?: unknown) => {
    if (!validateGmailSearchArgs(accountId, query, maxResults, pageToken)) throw new Error('Invalid gmail:searchThreads args');
    return searchThreads(accountId as string | undefined, query as string, maxResults as number, pageToken as string | undefined);
  }
);
ipcMain.handle('gmail:listLabels', (_event, accountId: unknown) => {
  if (!optionalAccountId(accountId)) throw new Error('Invalid gmail:listLabels args');
  return listLabels(accountId as string | undefined);
});

ipcMain.handle('calendar:listEvents', (_event, accountId: unknown, daysAhead?: unknown) => {
  if (!validateCalendarListEventsArgs(accountId, daysAhead)) throw new Error('Invalid calendar:listEvents args');
  return listEvents(accountId as string | undefined, daysAhead as number | undefined);
});
ipcMain.handle('calendar:listEventsRange', (_event, accountId: unknown, timeMin: unknown, timeMax: unknown) => {
  if (!validateCalendarListEventsRangeArgs(accountId, timeMin, timeMax)) throw new Error('Invalid calendar:listEventsRange args');
  return listEventsRange(accountId as string | undefined, timeMin as string, timeMax as string);
});
ipcMain.handle(
  'calendar:respondToEvent',
  (_event, accountId: unknown, eventId: unknown, response: unknown) => {
    if (!validateCalendarRespondArgs(accountId, eventId, response)) throw new Error('Invalid calendar:respondToEvent args');
    return respondToEvent(accountId as string | undefined, eventId as string, response as 'accepted' | 'tentative' | 'declined');
  }
);

// Accounts
ipcMain.handle('accounts:list', () => {
  const db = getDb();
  if (!db) return { accounts: [], activeId: null, accountsOrder: [] };
  const orderRaw = getKv('accounts_order');
  const accountsOrder: string[] = (orderRaw ? (parseStoreGet({ value: orderRaw }) as string[]) : null) ?? [];
  const activeRaw = getKv('active_account');
  const activeId = (activeRaw ? (parseStoreGet({ value: activeRaw }) as string | null) : null) ?? null;
  const rows = db.prepare('SELECT id, email FROM accounts ORDER BY id').all() as { id: string; email: string }[];
  const accounts = rows.map((r) => ({ id: r.id, email: r.email }));
  const ordered = accountsOrder.length
    ? accountsOrder
        .map((id) => accounts.find((a) => a.id === id))
        .filter(Boolean) as { id: string; email: string }[]
    : accounts;
  return { accounts: ordered, activeId, accountsOrder };
});
ipcMain.handle('accounts:setActive', (_event, accountId: unknown) => {
  if (!validateAccountId(accountId)) return;
  setKv('active_account', JSON.stringify(accountId));
});
ipcMain.handle('accounts:reorder', (_event, orderedIds: unknown) => {
  if (!validateAccountsReorder(orderedIds)) return;
  setKv('accounts_order', JSON.stringify(orderedIds));
});
ipcMain.handle('accounts:remove', (_event, accountId: unknown) => {
  if (!validateAccountId(accountId)) return;
  const db = getDb();
  if (!db) return;
  db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
  db.prepare('DELETE FROM sync_state WHERE account_id = ?').run(accountId);
  const orderRaw = getKv('accounts_order');
  const order: string[] = (orderRaw ? (parseStoreGet({ value: orderRaw }) as string[]) : null) ?? [];
  const next = order.filter((id) => id !== accountId);
  setKv('accounts_order', JSON.stringify(next));
  const activeRaw = getKv('active_account');
  const active = (activeRaw ? (parseStoreGet({ value: activeRaw }) as string | null) : null) ?? null;
  if (active === accountId && next.length > 0) {
    setKv('active_account', JSON.stringify(next[0]));
  } else if (active === accountId) {
    deleteKv('active_account');
  }
});

ipcMain.handle('reminder:getMinutes', () => {
  const raw = getKv('reminderMinutes');
  if (!raw) return 15;
  const n = Number(parseStoreGet({ value: raw }));
  return Number.isFinite(n) && n >= 0 ? n : 15;
});

ipcMain.handle('reminder:setMinutes', (_event, minutes: unknown) => {
  if (!validateReminderMinutes(minutes)) return;
  setKv('reminderMinutes', JSON.stringify(minutes));
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

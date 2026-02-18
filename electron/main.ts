import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { initDb, getDb } from './db';
import { runOAuthFlow } from './oauth';
import { listThreads, getThread, buildAndSendReply, getLabelIds } from './gmail';
import { listEvents } from './calendar';
import { startReminderEngine } from './reminderEngine';

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
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

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
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
  (_event, labelId: string, maxResults: number, pageToken?: string) =>
    listThreads(labelId, maxResults, pageToken)
);

ipcMain.handle('gmail:getThread', (_event, threadId: string) => getThread(threadId));

ipcMain.handle('gmail:sendReply', (_event, threadId: string, bodyText: string) =>
  buildAndSendReply(threadId, bodyText)
);

ipcMain.handle('gmail:getLabelIds', () => getLabelIds());

ipcMain.handle('calendar:listEvents', (_event, daysAhead?: number) => listEvents(daysAhead));

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

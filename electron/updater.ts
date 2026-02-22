/**
 * Auto-updater: check for updates on launch and notify user.
 * Only runs in packaged app (not in development).
 */

import { app, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';

export function setupAutoUpdater(): void {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', () => {
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update available',
        message: 'A new version of Synod is available. Restart the app to install.',
        buttons: ['Restart later', 'Restart now'],
      })
      .then(({ response }) => {
        if (response === 1) {
          autoUpdater.downloadUpdate().then(() => {
            autoUpdater.quitAndInstall(false, true);
          });
        }
      });
  });

  autoUpdater.on('update-not-available', () => {
    // Optional: log or no-op
  });

  autoUpdater.on('error', (err: unknown) => {
    console.error('[updater]', err);
  });

  // Check after a short delay so the window is shown first.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err: unknown) => console.error('[updater] check failed', err));
  }, 5000);
}

/**
 * Trigger Google OAuth flow (runs in main process via IPC).
 * Returns account info on success; tokens are stored in main process SQLite.
 */
export async function connectGoogleAccount(
  clientId: string,
  clientSecret: string
): Promise<{ email: string }> {
  const api = (window as Window & { electronAPI?: { oauth: { start: (a: string, b: string) => Promise<{ email: string }> } } }).electronAPI;
  if (!api?.oauth?.start) {
    throw new Error('OAuth not available (run in Electron)');
  }
  const result = await api.oauth.start(clientId, clientSecret);
  return { email: result.email };
}

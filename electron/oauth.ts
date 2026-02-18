import { createServer, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { shell } from 'electron';
import { google } from 'googleapis';
import { getDb } from './db';

const REDIRECT_PORT = 3333;
const REDIRECT_PATH = '/oauth2callback';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export interface OAuthResult {
  email: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number | null;
}

export function runOAuthFlow(clientId: string, clientSecret: string): Promise<OAuthResult> {
  return new Promise((resolve, reject) => {
    const redirectUri = `http://localhost:${REDIRECT_PORT}${REDIRECT_PATH}`;
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });

    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ? new URL(req.url, `http://localhost:${REDIRECT_PORT}`) : null;
      if (!url || url.pathname !== REDIRECT_PATH) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<html><body><h1>Authorization failed</h1><p>${error}</p></body></html>`);
        server.close();
        reject(new Error(error));
        return;
      }

      if (!code) {
        res.writeHead(400);
        res.end('No code received');
        return;
      }

      try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const { data } = await oauth2.userinfo.get();
        const email = (data.email || '').trim();
        if (!email) {
          res.writeHead(500);
          res.end('Could not read user email');
          server.close();
          reject(new Error('No email in userinfo'));
          return;
        }

        const result: OAuthResult = {
          email,
          accessToken: tokens.access_token || '',
          refreshToken: tokens.refresh_token || '',
          expiryDate: tokens.expiry_date || null,
        };

        const db = getDb();
        if (db) {
          db.prepare(
            `INSERT OR REPLACE INTO accounts (id, email, tokens, scopes, updated_at) VALUES (?, ?, ?, ?, ?)`
          ).run(
            email,
            email,
            JSON.stringify({
              access_token: result.accessToken,
              refresh_token: result.refreshToken,
              expiry_date: result.expiryDate,
            }),
            SCOPES.join(' '),
            Date.now()
          );
          db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(
            'google_client_id',
            JSON.stringify(clientId)
          );
          db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(
            'google_client_secret',
            JSON.stringify(clientSecret)
          );
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: system-ui; background: #050403; color: #ECE3D6; padding: 40px; text-align: center;">
              <h1 style="color: #CAA554;">Authorization successful</h1>
              <p>You can close this window and return to Synod.</p>
            </body>
          </html>
        `);
        server.close();
        resolve(result);
      } catch (err) {
        res.writeHead(500);
        res.end('Token exchange failed');
        server.close();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

    server.listen(REDIRECT_PORT, () => {
      shell.openExternal(authUrl);
    });

    server.on('error', (err) => {
      reject(err);
    });

    setTimeout(() => {
      if (server.listening) {
        server.close();
        reject(new Error('OAuth timeout'));
      }
    }, 5 * 60 * 1000);
  });
}

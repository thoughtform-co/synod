# Synod

Unified inbox and calendar for Thoughtform — Gmail and Google Calendar in one desktop app. Windows-first, Mac-ready.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Run in development**

   - Web only (no Electron): `npm run dev` then open http://localhost:5173
   - Full Electron app: `npm run electron:dev`

3. **Build**

   - Windows: `npm run build:win`
   - Mac: `npm run build:mac`
   - Output: `release/`

## Project structure

- `electron/` — Main process (window, IPC, SQLite)
- `src/` — React UI (Vite)
- `src/features/auth/` — Google OAuth and account connection
- `src/features/mail/` — Gmail read/reply and thread list
- `src/features/calendar/` — Google Calendar and reminders
- `src/styles/` — Thoughtform tokens and globals

## Environment

Create `.env` (or `.env.local`) with Google OAuth credentials for Gmail + Calendar:

- `VITE_GOOGLE_CLIENT_ID`
- `VITE_GOOGLE_CLIENT_SECRET`

Redirect URI for desktop: `http://localhost:3333` (or your configured port).

## Skills

Project skills for AI-assisted workflows live in `.cursor/skills/`:

- **mail-reply-assistant**: Draft and refine email replies; see `.cursor/skills/mail-reply-assistant/SKILL.md`.

## License

Proprietary — Thoughtform.

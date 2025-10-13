<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1kFce6wtiYY2NP37mPZ8IF9z9teUdLgMo

## Tech Stack

- Frontend: React + TypeScript (Vite)
  - Dev server and build via Vite (`vite.config.ts`, `npm run dev`, `npm run build`).
  - UI components in `App.tsx` and `components/`.
- Backend: Node.js (CommonJS)
  - Minimal HTTP server in `server/server.cjs` (no framework).
  - Real‑time updates via Server‑Sent Events at `GET /events?board=...`.
- Database: Turso (libSQL)
  - Async client via `@libsql/client`.
  - SQL migrations in `server/migrations` are applied on server start.
- Shared Types/Constants
  - Type definitions in `types.ts`; shared helpers in `constants.ts` and `services/`.
- AuthZ Model
  - Per‑browser ownership using `clientId` stored in `localStorage` and sent as `X-Client-Id`.
  - Owners can edit/delete their own entries; admin token can override for destructive actions.
- Environment Variables
  - Frontend: `VITE_API_BASE` (backend URL), `VITE_ADMIN_CLIENT_ID` (optional: show admin button for a specific client).
  - Backend: `ADMIN_TOKEN` (defaults to `OASISWOWCK` if not set), `DATABASE_URL` (Turso libSQL URL), `DATABASE_AUTH_TOKEN` (Turso token).

## API Endpoints

- GET `/health`
  - Response: `{ "ok": true }`

- GET `/players?board=<slug>`
  - Returns all players for the given `board` (required for shared datasets).
  - Response: `Player[]`

- POST `/players?board=<slug>`
  - Creates a player on the given `board`.
  - Headers: `Content-Type: application/json`
  - Body: `{ name: string, roles?: Role[], role?: Role, availability: { [day: string]: { start: number, end: number }[] }, notes?: string, timezone?: string, clientId?: string }`
  - Response: created `Player`

- DELETE `/players?board=<slug>`
  - Clears all players for the given `board`.
  - Headers: `Authorization: Bearer <ADMIN_TOKEN>`
  - Response: `{ ok: true }`

- DELETE `/players/:id`
  - Deletes a single player by id.
  - Headers (either):
    - Owner: `X-Client-Id: <clientId>` (matches the row’s owner)
    - Admin: `Authorization: Bearer <ADMIN_TOKEN>`
  - Response: `{ ok: true }` or `404`

- PATCH `/players/:id`
  - Updates a player’s fields (owner or admin only).
  - Headers: `Content-Type: application/json` and either owner `X-Client-Id` or admin `Authorization`.
  - Body (partial): `{ name?, roles?, role?, availability?, notes?, timezone? }`
  - Response: updated partial `Player`

- GET `/events?board=<slug>` (Server‑Sent Events)
  - Streams live changes for a board.
  - Event name: `players`
  - Payloads: `{ type: 'player_added' | 'player_deleted' | 'player_updated' | 'players_cleared', id?: string }`

Notes
- Ownership: The browser that creates an entry includes `clientId` in the POST body; later updates/deletes must send the same `X-Client-Id` header.
- Timezones: All matching is computed relative to ET; users set their own timezone when creating entries.
- CORS: Open for local and cross‑origin use; allowed headers include `Content-Type`, `Authorization`, and `X-Client-Id`.

### curl Examples

Replace `API` with your backend URL (e.g., `https://your-service.onrender.com`) and `BOARD` with your guild slug.

Health
```
curl -s "API/health"
```

List Players
```
curl -s "API/players?board=BOARD"
```

Create Player (owner `clientId` optional but recommended)
```
curl -s -X POST "API/players?board=BOARD" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Arthas",
    "roles": ["Tank"],
    "timezone": "America/New_York",
    "availability": {"Monday":[{"start":1140,"end":1320}]},
    "notes": "Prot Warrior",
    "clientId": "YOUR_CLIENT_ID"
  }'
```

Delete Player (as owner)
```
curl -s -X DELETE "API/players/PLAYER_ID" \
  -H "X-Client-Id: YOUR_CLIENT_ID"
```

Delete Player (as admin)
```
curl -s -X DELETE "API/players/PLAYER_ID" \
  -H "Authorization: Bearer OASISWOWCK"
```

Clear Board (admin only)
```
curl -s -X DELETE "API/players?board=BOARD" \
  -H "Authorization: Bearer OASISWOWCK"
```

Update Player (owner or admin)
```
curl -s -X PATCH "API/players/PLAYER_ID" \
  -H "Content-Type: application/json" \
  -H "X-Client-Id: YOUR_CLIENT_ID" \
  -d '{"notes": "KSM 2.7k"}'
```

SSE Stream (live updates)
```
curl -N "API/events?board=BOARD"
```

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Install dependencies (done once):
   `npm install`

4. Start the backend:
   `DATABASE_URL=... DATABASE_AUTH_TOKEN=... npm run server`

   The backend runs at `http://localhost:8787` and connects to your Turso DB.

5. Run the frontend:
   `npm run dev`

   Optionally set a custom backend URL with `VITE_API_BASE` in `.env.local`.

## Admin Controls

- To protect destructive operations (delete/clear), set an admin token on the backend:
  - Default admin token: `IXOYEFISH`.
  - To change it: on Railway (or locally) add env var `ADMIN_TOKEN=your-secret` on the server service.
  - The frontend sends `Authorization: Bearer <token>` for delete/clear when you set it via the “Set Admin Token” button.
  - If `ADMIN_TOKEN` is not set, the server uses the default token above.

## Live Updates

- Backend exposes Server‑Sent Events at `GET /events?board=...`.
- Frontend auto‑subscribes and refreshes the list on changes.

## Turso Setup (Free, persistent)

1) Install Turso CLI and create a DB:
   -  `turso auth signup` 
   -  `turso db create mff-db` 
   -  `turso db show mff-db` ? copy the libSQL URL (e.g., `libsql://mff-db-<id>.turso.io`). 
   -  `turso db tokens create mff-db` ? copy the auth token. 
2) Configure env vars where your server runs:
   -  `DATABASE_URL` = Turso libSQL URL 
   -  `DATABASE_AUTH_TOKEN` = token 
3) Start the server. It auto-runs migrations in  `server/migrations`. 

## Deploy to Railway (Backend)

1) Create a new Node service from this repo.
2) Set the Start Command: `node server/server.cjs`
3) Add environment variables:
   - `DATABASE_URL` (Turso libSQL URL)
   - `DATABASE_AUTH_TOKEN` (Turso token)
   - `ADMIN_TOKEN=choose-a-secret` (optional but recommended)
4) Deploy. Note the service URL (e.g., `https://mff-api.up.railway.app`).

## Deploy to Vercel (Frontend)

1) Import the repo and select the Vite framework.
2) Build: `npm install && npm run build`
3) Output: `dist`
4) Env Var: `VITE_API_BASE` = your Railway URL (e.g., `https://mff-api.up.railway.app`).
5) Deploy and share links like `https://your-app.vercel.app/?board=YourGuild`.

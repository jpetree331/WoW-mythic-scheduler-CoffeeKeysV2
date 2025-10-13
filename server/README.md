Backend server (no dependencies)

Install deps:

- npm install better-sqlite3

Run:

- node server/server.cjs

Environment variables:

- ADMIN_TOKEN (optional): set to override the default admin token. If not set, the default is `culurienixoye`.

Storage:

- SQLite DB at `server/data/app.db`. On Railway, mount a persistent volume to `/app/server/data`.

Live updates:

- Server‑Sent Events at `GET /events?board=...` streams `players` events on changes.

Endpoints:

- GET /health → { ok: true }
- GET /players → list all players
- POST /players → create a player
  - Body: { name, role, availability, notes? }
- DELETE /players/:id → delete a player
- DELETE /players → delete all players (dangerous)

CORS: Allows all origins for local development.

Data is stored in server/data/players.json.

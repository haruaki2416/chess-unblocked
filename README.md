# Chess Unblocked

A Chess.com-inspired chess app with browser-based Stockfish bots and a Railway-hosted Express + PostgreSQL backend.

## Architecture

- React + Vite frontend.
- Express API served from the same Railway service.
- Railway PostgreSQL stores accounts, profiles, games, and move history.
- Passwords are hashed with bcrypt; sessions use signed JWTs.
- The server validates online moves and applies Elo changes inside a database transaction.
- Online boards poll the API for opponent moves. Realtime WebSockets can be added later.

**Supabase has been removed.** There is no Supabase SDK, auth, database, or schema dependency.

## Railway deployment

1. In your Railway project, provision a PostgreSQL database if you haven't already.
2. Open the Postgres service's Query tab and run the complete `server/schema.sql` file.
3. Deploy this GitHub repository as a Railway service.
4. Set these variables on the app service:
   - `DATABASE_URL` = Railway reference to your Postgres service's `DATABASE_URL` (for example, `${{Postgres.DATABASE_URL}}`; use your actual service name).
   - `JWT_SECRET` = a long random secret (at least 32 random bytes).
   - `PORT` is provided by Railway; do not hardcode it.
   - `VITE_API_URL` should be unset/blank when the frontend and API are served by this same service.
5. Set the build command to `npm install && npm run build`.
6. Set the start command to `npm start`.
7. Open the generated Railway domain. Check `/api/health`; it should return `{"ok":true,"database":"connected"}`.

The Express service serves the built `dist` frontend and handles `/api/*` on the same domain, so no CORS configuration is required for the standard single-service deployment.

## Local development

1. `npm install`
2. Create `.env` with:
   ```env
   DATABASE_URL=postgresql://...
   JWT_SECRET=replace-with-a-long-random-secret
   PORT=3001
   CLIENT_ORIGIN=http://localhost:5173
   VITE_API_URL=http://localhost:3001
   ```
3. Run `server/schema.sql` against your local or Railway PostgreSQL database.
4. Terminal 1: `npm start`
5. Terminal 2: `npm run dev`

## Included

- Account creation and login backed by PostgreSQL.
- Profile ratings, games played, and wins.
- Online room creation and joining with room codes.
- Server-side legal move validation and move history.
- Elo updates after a rated game ends by checkmate or draw.
- Browser Stockfish bot games with approximate Elo slider and style presets.
- Time-control presets and responsive chess interface.

## Important limitations

- Online clocks are currently visual/basic and are not yet enforced by the server.
- Online game updates use polling rather than WebSockets.
- Draw offers, resignation, timeout adjudication, matchmaking, friends, chat, puzzles, and lessons are not implemented yet.
- Bot Elo is an approximate strength target, not a certified rating; style presets are lightweight settings rather than separate trained engines.
- Admin permissions and admin tools still need a server-side allowlist and audited endpoints.
- Use HTTPS in production. Never expose `DATABASE_URL` or `JWT_SECRET` in frontend variables.

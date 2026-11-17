import express from 'express';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { Chess } from 'chess.js';

const { Pool } = pg;
const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false } });
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
if (!process.env.DATABASE_URL || !JWT_SECRET) console.warn('DATABASE_URL and JWT_SECRET must be configured.');
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '32kb' }));

function sign(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '14d' });
}
function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Sign in required.' });
    req.userId = jwt.verify(token, JWT_SECRET).sub;
    next();
  } catch { return res.status(401).json({ error: 'Session expired. Please sign in again.' }); }
}
const publicUser = u => ({ id: u.id, email: u.email, username: u.username, rating: u.rating, games: u.games, wins: u.wins });
const fail = (res, error, code = 400) => res.status(code).json({ error });

app.get('/api/health', async (_req, res) => {
  try { await pool.query('select 1'); res.json({ ok: true, database: 'connected' }); }
  catch { res.status(503).json({ ok: false, database: 'unavailable' }); }
});
app.post('/api/auth/signup', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 'Enter a valid email address.');
    if (username.length < 3 || username.length > 20) return fail(res, 'Username must be 3–20 characters.');
    if (password.length < 8) return fail(res, 'Password must be at least 8 characters.');
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      'insert into users(id,email,username,password_hash) values($1,$2,$3,$4) returning *',
      [crypto.randomUUID(), email, username, hash]
    );
    const user = publicUser(rows[0]);
    res.status(201).json({ token: sign(rows[0]), user });
  } catch (e) {
    if (e.code === '23505') return fail(res, 'That email or username is already registered.', 409);
    console.error(e); fail(res, 'Could not create account.', 500);
  }
});
app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const { rows } = await pool.query('select * from users where email=$1', [email]);
    if (!rows[0] || !(await bcrypt.compare(String(req.body.password || ''), rows[0].password_hash))) return fail(res, 'Email or password is incorrect.', 401);
    res.json({ token: sign(rows[0]), user: publicUser(rows[0]) });
  } catch (e) { console.error(e); fail(res, 'Could not sign in.', 500); }
});
app.get('/api/me', auth, async (req, res) => {
  const { rows } = await pool.query('select id,email,username,rating,games,wins from users where id=$1', [req.userId]);
  if (!rows[0]) return fail(res, 'Account not found.', 404);
  res.json({ user: rows[0] });
});
app.post('/api/games', auth, async (req, res) => {
  try {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const timeControl = String(req.body.time_control || '10+0').slice(0, 12);
    const { rows } = await pool.query(
      "insert into games(code,white_id,fen,time_control,status) values($1,$2,'start',$3,'waiting') returning *",
      [code, req.userId, timeControl]
    );
    res.status(201).json({ game: rows[0] });
  } catch (e) { console.error(e); fail(res, 'Could not create game room.', 500); }
});
app.post('/api/games/join', auth, async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  if (!code) return fail(res, 'Enter a room code.');
  try {
    const { rows } = await pool.query(
      "update games set black_id=$1,status='active',updated_at=now() where code=$2 and black_id is null and status='waiting' and white_id<>$1 returning *",
      [req.userId, code]
    );
    if (!rows[0]) return fail(res, 'Room not found, already full, or created by your account.', 404);
    res.json({ game: rows[0] });
  } catch (e) { console.error(e); fail(res, 'Could not join room.', 500); }
});
app.get('/api/games/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'select * from games where id=$1 and (white_id=$2 or black_id=$2)',
      [req.params.id, req.userId]
    );
    if (!rows[0]) return fail(res, 'Game not found.', 404);
    res.json({ game: rows[0] });
  } catch (e) { console.error(e); fail(res, 'Could not load game.', 500); }
});
app.post('/api/games/:id/moves', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const found = await client.query('select * from games where id=$1 for update', [req.params.id]);
    const game = found.rows[0];
    if (!game || ![game.white_id, game.black_id].includes(req.userId)) { await client.query('rollback'); return fail(res, 'Game not found.', 404); }
    if (game.status !== 'active' || !game.black_id) { await client.query('rollback'); return fail(res, 'Game is not active.'); }
    const chess = new Chess();
    if (game.fen !== 'start') chess.load(game.fen);
    const expectedColor = chess.turn();
    const expectedUser = expectedColor === 'w' ? game.white_id : game.black_id;
    if (expectedUser !== req.userId) { await client.query('rollback'); return fail(res, 'It is not your turn.', 409); }
    const move = chess.move({ from: req.body.from, to: req.body.to, promotion: req.body.promotion || 'q' });
    if (!move) { await client.query('rollback'); return fail(res, 'Illegal move.'); }
    const status = chess.isGameOver() ? 'finished' : 'active';
    const result = chess.isCheckmate() ? (chess.turn() === 'w' ? 'black' : 'white') : chess.isDraw() ? 'draw' : null;
    const updated = await client.query(
      'update games set fen=$1,pgn=$2,status=$3,result=$4,updated_at=now() where id=$5 returning *',
      [chess.fen(), chess.pgn(), status, result, game.id]
    );
    await client.query(
      'insert into game_moves(game_id,ply,san,fen) values($1,$2,$3,$4)',
      [game.id, chess.history().length, move.san, chess.fen()]
    );
    if (result && game.rated) {
      const players = await client.query('select id,rating from users where id=any($1::uuid[]) for update', [[game.white_id, game.black_id]]);
      const white = players.rows.find(x => x.id === game.white_id), black = players.rows.find(x => x.id === game.black_id);
      const ew = 1 / (1 + Math.pow(10, (black.rating - white.rating) / 400));
      const score = result === 'white' ? 1 : result === 'draw' ? .5 : 0;
      const nw = Math.max(100, Math.round(white.rating + 32 * (score - ew)));
      const nb = Math.max(100, Math.round(black.rating + 32 * ((1-score) - (1-ew))));
      await client.query('update users set rating=$1,games=games+1,wins=wins+$2 where id=$3', [nw, result === 'white' ? 1 : 0, white.id]);
      await client.query('update users set rating=$1,games=games+1,wins=wins+$2 where id=$3', [nb, result === 'black' ? 1 : 0, black.id]);
    }
    await client.query('commit');
    res.json({ game: updated.rows[0], move: move.san });
  } catch (e) {
    await client.query('rollback');
    if (e instanceof Error && /Invalid move|Invalid FEN/.test(e.message)) return fail(res, 'Invalid chess move.');
    console.error(e); fail(res, 'Could not save move.', 500);
  } finally { client.release(); }
});
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Internal server error.' }); });
app.listen(PORT, () => console.log('Chess Unblocked API listening on ' + PORT));

# Chess Unblocked

A Chess.com-inspired chess site starter: legal chess, accounts, live game rooms, time controls, ratings, and a study/analysis panel.

## Run locally

1. `npm install`
2. Copy `.env.example` to `.env` and add your Supabase project URL + anon key.
3. Run `supabase/schema.sql` in Supabase SQL Editor. Enable Realtime for `games` and `game_moves` if the publication command is not available in your project.
4. `npm run dev`

Without Supabase credentials, the board and local practice mode still work; accounts and online rooms are disabled.

## Included in this first build

- Responsive chess interface with legal move validation, move list, undo in local practice, and board flip.
- Guest local practice and Supabase email/password account flow.
- Online room creation/joining, realtime game state, and basic clock controls.
- Profile rating fields and a rating update SQL function is intentionally not faked client-side; production-rated games need server-verified results.
- Analysis/study panel with legal-move arrows. Engine assistance is labelled and intended for unrated practice/study, never concealed in rated games.
- Time-control presets and check/checkmate/draw status.

## Production hardening still required

Before public launch, move move-validation, clock adjudication, and Elo updates into a trusted server/Edge Function; add rate limits, email verification, moderation/reporting, reconnect handling, and anti-cheat. The browser must never be trusted to submit a match result or rating change. Admin permissions must be granted server-side to a fixed allowlist, not by a public unlock code.

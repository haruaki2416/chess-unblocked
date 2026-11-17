-- Run this in Supabase SQL Editor. Never put the service-role key in the browser.
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text unique not null check (char_length(username) between 3 and 20),
 rating int not null default 1200,
 games int not null default 0,
 wins int not null default 0,
 created_at timestamptz not null default now()
);
create table if not exists public.games (
 id uuid primary key default gen_random_uuid(),
 code text unique not null,
 white_id uuid references public.profiles(id),
 black_id uuid references public.profiles(id),
 fen text not null default 'start',
 pgn text not null default '',
 status text not null default 'waiting' check (status in ('waiting','active','finished')),
 time_control text not null default '10+0',
 result text,
 rated boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.game_moves (
 id bigint generated always as identity primary key,
 game_id uuid not null references public.games(id) on delete cascade,
 ply int not null,
 san text not null,
 fen text not null,
 created_at timestamptz not null default now(),
 unique(game_id, ply)
);
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_moves enable row level security;
create policy "Profiles are readable" on public.profiles for select using (true);
create policy "Users create own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Games readable by everyone" on public.games for select using (true);
create policy "Signed-in users create games" on public.games for insert to authenticated with check (auth.uid() = white_id);
create policy "Players update their games" on public.games for update to authenticated using (auth.uid() = white_id or auth.uid() = black_id) with check (auth.uid() = white_id or auth.uid() = black_id);
create policy "Moves readable" on public.game_moves for select using (true);
create policy "Players add moves" on public.game_moves for insert to authenticated with check (exists (select 1 from public.games g where g.id = game_id and (g.white_id = auth.uid() or g.black_id = auth.uid())));
-- Enable Realtime for games and moves in Supabase Dashboard > Database > Publications.
alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.game_moves;

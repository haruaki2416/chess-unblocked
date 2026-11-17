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
-- Allow a signed-in opponent to claim an unoccupied seat in a waiting room.
create policy "Players may join open rooms" on public.games for update to authenticated
 using (black_id is null and status = 'waiting')
 with check (black_id = auth.uid() and white_id is not null and white_id <> auth.uid());
create policy "Moves readable" on public.game_moves for select using (true);
create policy "Players add moves" on public.game_moves for insert to authenticated with check (exists (select 1 from public.games g where g.id = game_id and (g.white_id = auth.uid() or g.black_id = auth.uid())));
-- Elo updates must only be called by a trusted server using the service-role key.
create or replace function public.apply_game_elo(p_game_id uuid, p_result text)
returns void language plpgsql security definer set search_path = public as $$
declare
 g public.games%rowtype;
 rw int; rb int; ew numeric; eb numeric; sw numeric; sb numeric; nw int; nb int;
begin
 if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service role required'; end if;
 if p_result not in ('white','black','draw') then raise exception 'invalid result'; end if;
 select * into g from public.games where id = p_game_id for update;
 if not found or g.status <> 'active' or g.white_id is null or g.black_id is null then raise exception 'game is not eligible'; end if;
 if not g.rated then raise exception 'game is unrated'; end if;
 select rating into rw from public.profiles where id = g.white_id for update;
 select rating into rb from public.profiles where id = g.black_id for update;
 ew := 1.0 / (1.0 + power(10.0, (rb-rw)::numeric / 400.0));
 eb := 1.0 - ew;
 sw := case p_result when 'white' then 1 else case p_result when 'draw' then 0.5 else 0 end end;
 sb := 1.0 - sw;
 nw := greatest(100, round(rw + 32 * (sw-ew))::int);
 nb := greatest(100, round(rb + 32 * (sb-eb))::int);
 update public.profiles set rating=nw, games=games+1, wins=wins + case when p_result='white' then 1 else 0 end where id=g.white_id;
 update public.profiles set rating=nb, games=games+1, wins=wins + case when p_result='black' then 1 else 0 end where id=g.black_id;
 update public.games set result=p_result,status='finished',updated_at=now() where id=p_game_id;
end; $$;
revoke all on function public.apply_game_elo(uuid,text) from public, anon, authenticated;
grant execute on function public.apply_game_elo(uuid,text) to service_role;
-- Enable Realtime for games and moves in Supabase Dashboard > Database > Publications.
alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.game_moves;

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  username text not null unique check (char_length(username) between 3 and 20),
  password_hash text not null,
  rating integer not null default 1200 check (rating >= 100),
  games integer not null default 0,
  wins integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  white_id uuid not null references users(id),
  black_id uuid references users(id),
  fen text not null default 'start',
  pgn text not null default '',
  status text not null default 'waiting' check (status in ('waiting','active','finished')),
  time_control text not null default '10+0',
  result text check (result in ('white','black','draw')),
  rated boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (black_id is null or black_id <> white_id)
);

create table if not exists game_moves (
  id bigint generated always as identity primary key,
  game_id uuid not null references games(id) on delete cascade,
  ply integer not null,
  san text not null,
  fen text not null,
  created_at timestamptz not null default now(),
  unique(game_id, ply)
);

create index if not exists games_code_idx on games(code);
create index if not exists games_players_idx on games(white_id, black_id);
create index if not exists moves_game_idx on game_moves(game_id, ply);

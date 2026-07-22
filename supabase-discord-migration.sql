-- Run once in the Supabase SQL Editor to enable opt-in Discord Client Room alerts.
-- Discord OAuth tokens are never stored. Only the client's Discord identity and DM channel are retained.

alter table public.client_rooms add column if not exists discord_user_id text;
alter table public.client_rooms add column if not exists discord_username text;
alter table public.client_rooms add column if not exists discord_display_name text;
alter table public.client_rooms add column if not exists discord_connected_at timestamptz;
alter table public.client_rooms add column if not exists discord_dm_channel_id text;

create table if not exists public.discord_link_sessions (
  state_hash text primary key check (char_length(state_hash) = 64),
  room_id uuid not null references public.client_rooms(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists discord_link_sessions_expiry_idx
on public.discord_link_sessions (expires_at);

alter table public.discord_link_sessions enable row level security;
revoke all on table public.discord_link_sessions from anon, authenticated;
grant select, insert, update, delete on table public.discord_link_sessions to service_role;

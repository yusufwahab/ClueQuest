-- Live rooms: customisable avatars, a short room chat, and a host switch to turn the chat off.
alter table room_players add column if not exists avatar jsonb;
alter table rooms add column if not exists chat_enabled boolean not null default true;

create table if not exists room_chat (
  id bigserial primary key,
  room_id uuid not null references rooms(id) on delete cascade,
  player_id uuid references room_players(id) on delete set null,
  nickname text not null,
  from_host boolean not null default false,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists room_chat_room on room_chat(room_id, id);

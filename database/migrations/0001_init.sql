-- ClueQuest schema. Authoritative store; the API connects with a privileged role.
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null,
  password_hash text not null,
  role text not null default 'teacher' check (role in ('teacher','admin')),
  created_at timestamptz not null default now()
);
create unique index users_email on users(lower(email));

create table quizzes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  title text not null,
  subject text not null default '',
  draft jsonb not null,                         -- editable working copy
  status text not null default 'draft' check (status in ('draft','published','archived')),
  latest_version int not null default 0,        -- 0 = never published
  allow_partners boolean not null default false, -- connected platforms may look up and assign this quiz
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quizzes_owner on quizzes(owner_id, updated_at desc);

-- Immutable: the questions AND the answer key/marks/points that every attempt is graded against.
create table quiz_versions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  version int not null,
  title text not null,
  subject text not null default '',
  instructions text not null default '',
  questions jsonb not null,
  published_at timestamptz not null default now(),
  unique (quiz_id, version)
);

create table partners (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  api_key_hash text not null unique,
  webhook_url text not null,
  webhook_secret text not null,
  return_origins text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- A configured use of one published quiz version: solo link, live template, CBT exam or partner assignment.
create table activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references users(id) on delete cascade,
  quiz_id uuid not null references quizzes(id) on delete cascade,
  quiz_version int not null,
  mode text not null check (mode in ('solo','live','cbt')),
  style text not null check (style in ('points','steps')),
  title text not null,
  settings jsonb not null,
  share_code text not null unique,
  partner_id uuid references partners(id) on delete cascade,
  assignment_ref text,
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  check ((partner_id is null) = (assignment_ref is null))
);
create unique index activities_partner_ref on activities(partner_id, assignment_ref) where partner_id is not null;
create index activities_owner on activities(owner_id, created_at desc);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  name text not null,
  email text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  unique (activity_id, email)
);

create table launches (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  learner_ref text not null,
  learner_name text,
  return_url text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table attempts (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  quiz_id uuid not null,
  quiz_version int not null,
  style text not null,
  partner_id uuid references partners(id),
  learner_ref text,
  invitation_id uuid references invitations(id),
  identity_key text,                            -- l:<learnerRef> | i:<invitationId> | null (anonymous)
  player_name text not null default '',
  token_hash text not null unique,
  status text not null default 'in_progress' check (status in ('in_progress','submitted')),
  started_at timestamptz not null default now(),
  deadline_at timestamptz,                      -- server-enforced end (CBT duration / closing time)
  submitted_at timestamptz,
  auto_submitted boolean not null default false,
  answers jsonb not null default '{}'::jsonb,
  locked jsonb not null default '[]'::jsonb,    -- question ids already judged (instant feedback)
  marks_earned numeric,
  marks_possible numeric,
  percent numeric,
  points int,
  step_position int,
  passed boolean,
  outcomes jsonb,
  return_url text,
  released boolean not null default false       -- manual release flag for CBT
);
create unique index attempts_one_open on attempts(activity_id, identity_key) where status = 'in_progress' and identity_key is not null;
create index attempts_activity on attempts(activity_id, started_at desc);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  host_id uuid not null references users(id),
  code char(6) not null,
  phase text not null default 'lobby' check (phase in ('lobby','question','locked','finished','cancelled')),
  q_index int not null default -1,
  opened_at timestamptz,
  deadline timestamptz,
  version int not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index rooms_active_code on rooms(code) where phase not in ('finished','cancelled');

create table room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  nickname text not null,
  token_hash text not null unique,
  removed boolean not null default false,
  joined_at timestamptz not null default now()
);
create unique index room_players_nick on room_players(room_id, lower(nickname));

create table room_answers (
  room_id uuid not null references rooms(id) on delete cascade,
  player_id uuid not null references room_players(id) on delete cascade,
  question_id text not null,
  option_id text not null,
  accepted_at timestamptz not null default now(),
  primary key (room_id, player_id, question_id)
);

create table room_results (
  room_id uuid not null references rooms(id) on delete cascade,
  player_id uuid not null references room_players(id) on delete cascade,
  nickname text not null,
  rank int not null,
  marks_earned numeric not null,
  marks_possible numeric not null,
  points int not null,
  step_position int not null,
  correct int not null,
  primary key (room_id, player_id)
);

-- Result delivery outbox. One logical result per attempt; retried deliveries reuse the same event_id.
create table webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  partner_id uuid not null references partners(id) on delete cascade,
  attempt_id uuid not null unique references attempts(id) on delete cascade,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','delivered','failed')),
  tries int not null default 0,
  next_at timestamptz not null default now(),
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index webhook_due on webhook_deliveries(next_at) where status = 'pending';

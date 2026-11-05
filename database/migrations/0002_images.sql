-- Question images. Stored in the database so they survive redeploys on hosts with no persistent disk, and are served by id with long cache headers.
create table images (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  mime text not null check (mime in ('image/png','image/jpeg','image/webp','image/gif')),
  bytes bytea not null,
  size int not null,
  sha256 text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, sha256)
);

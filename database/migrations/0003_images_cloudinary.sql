-- Pictures can now live on Cloudinary instead of in this table. The row stays as an index (who uploaded what, dedupe, per-host limit),
-- and holds the file itself only when no Cloudinary account is configured.
alter table images alter column bytes drop not null;
alter table images add column public_id text;
alter table images add constraint images_stored check (bytes is not null or public_id is not null);
create index images_public_id on images(public_id);

-- Supabase exposes every table in the public schema through its own web API unless Row-Level Security is on.
-- ClueQuest never uses that API: the server talks to Postgres directly with a privileged role, which ignores RLS.
-- So: turn RLS on for every table with no policies (the web API gets nothing) and take back the API roles' grants.
-- The same statements run again at every server start (database/secure.sql), so tables added later are covered too.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    begin
      execute format('alter table public.%I enable row level security', r.tablename);
    exception when others then
      raise notice 'could not enable RLS on %: %', r.tablename, sqlerrm;
    end;
  end loop;
  for r in select rolname from pg_roles where rolname in ('anon', 'authenticated') loop
    begin
      execute format('revoke all on all tables in schema public from %I', r.rolname);
      execute format('revoke all on all sequences in schema public from %I', r.rolname);
      execute format('revoke all on all functions in schema public from %I', r.rolname);
      execute format('alter default privileges in schema public revoke all on tables from %I', r.rolname);
    exception when others then
      raise notice 'could not revoke grants from %: %', r.rolname, sqlerrm;
    end;
  end loop;
end $$;

-- Package 35a: files of pages deleted for good are removed from storage
-- (decision of the user, 2026-10-25: a queue in the database and an Edge
-- Function that deletes through the Storage API; storage.objects forbids
-- direct deletes, see 20261019120000_page_files_storage.sql).
--
-- - page_file_deletions: every page deleted for good, also below a deleted
--   page (cascade) and in delete_account. Only the server reads it.
-- - next_page_file_deletions(limit) (service_role only, for the Edge
--   Function): first drops the pages that are done (no files left, or a
--   page with this id exists again, whose files are not to be touched),
--   then returns paths of files still to delete. Deleting the same path
--   twice does no harm, so an interrupted run just continues.
-- - Files that are orphaned today (pages deleted before this migration)
--   are queued once.
--
-- Backward compatible: a new table, trigger and function; the app does not
-- change what it sends.

create table public.page_file_deletions (
  page_id uuid primary key,
  queued_at timestamptz not null default now()
);

alter table public.page_file_deletions enable row level security;
revoke all on table public.page_file_deletions from public, anon, authenticated;

create or replace function public.queue_page_file_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.page_file_deletions (page_id)
  values (old.id)
  on conflict (page_id) do nothing;
  return old;
end;
$$;

revoke execute on function public.queue_page_file_deletion() from public, anon, authenticated;

create trigger queue_page_file_deletion
after delete on public.pages
for each row execute function public.queue_page_file_deletion();

create or replace function public.next_page_file_deletions(p_limit integer default 1000)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.page_file_deletions d
  where exists (select 1 from public.pages p where p.id = d.page_id)
     or not exists (
       select 1 from storage.objects o
       where o.bucket_id = 'page-files' and o.name like d.page_id::text || '/%'
     );

  return query
    select o.name::text
    from public.page_file_deletions d
    join storage.objects o
      on o.bucket_id = 'page-files' and o.name like d.page_id::text || '/%'
    order by d.queued_at, o.name
    limit least(greatest(coalesce(p_limit, 1000), 1), 1000);
end;
$$;

revoke execute on function public.next_page_file_deletions(integer) from public, anon, authenticated;
grant execute on function public.next_page_file_deletions(integer) to service_role;

-- Files of pages deleted before this migration.
insert into public.page_file_deletions (page_id)
select distinct public.page_id_from_file_path(o.name)
from storage.objects o
where o.bucket_id = 'page-files'
  and public.page_id_from_file_path(o.name) is not null
  and not exists (select 1 from public.pages p where p.id = public.page_id_from_file_path(o.name))
on conflict (page_id) do nothing;

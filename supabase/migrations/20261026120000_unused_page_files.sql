-- Package 40a: files nothing refers to any more are deleted from storage
-- (decision of the user, 2026-10-26: after 30 days without a reference;
-- references count from anywhere in nodi, not only from the file's page).
--
-- - A file is referred to by a `nodi-file:` URL anywhere in a document
--   (images, attachments, also copies in other pages and pages in the
--   trash), by a cover, or by a value of a "Dateien & Medien" property.
--   Files of pages deleted for good are package 35's
--   (page_file_deletions) and left out here.
-- - unused_page_files: when a file was first seen without a reference.
--   A reference again (undo, another device) removes the row, so the 30
--   days start over. Only the server reads it.
-- - next_unused_page_files(limit) (service_role only, for the Edge
--   Function): looks at all files at most once an hour (the function can
--   be called by anyone through the Edge Function), and always before it
--   returns files due for deletion, so a file referred to again since the
--   last look is never returned.
-- - Local edits that are not synced for more than 30 days and add a file
--   back are not protected (the server cannot see them).
--
-- Backward compatible: new tables and functions; the app does not change.

create table public.unused_page_files (
  name text primary key,
  unused_since timestamptz not null default now()
);

create table public.unused_page_file_scan (
  singleton boolean primary key default true check (singleton),
  scanned_at timestamptz not null
);

alter table public.unused_page_files enable row level security;
alter table public.unused_page_file_scan enable row level security;
revoke all on table public.unused_page_files from public, anon, authenticated;
revoke all on table public.unused_page_file_scan from public, anon, authenticated;

-- Every storage path something in nodi refers to.
create or replace function public.referenced_file_paths()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select substr(reference #>> '{}', length('nodi-file:') + 1)
  from public.page_documents d,
       jsonb_path_query(
         d.document,
         'strict $.** ? (@.type() == "string" && @ starts with "nodi-file:")'
       ) as reference
  union
  select substr(p.cover, length('nodi-file:') + 1)
  from public.pages p
  where p.cover like 'nodi-file:%'
  union
  select path
  from public.page_property_values v
  join public.database_properties property on property.id = v.property_id and property.type = 'files'
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(v.value) = 'array' then v.value else '[]'::jsonb end
  ) as path
$$;

revoke execute on function public.referenced_file_paths() from public, anon, authenticated;

create or replace function public.next_unused_page_files(p_limit integer default 1000)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  last_scan timestamptz;
begin
  -- One call at a time looks at the files.
  insert into public.unused_page_file_scan (singleton, scanned_at)
  values (true, '-infinity')
  on conflict (singleton) do nothing;
  select s.scanned_at into last_scan from public.unused_page_file_scan s for update;

  if last_scan < now() - interval '1 hour'
    or exists (select 1 from public.unused_page_files u where u.unused_since < now() - interval '30 days')
  then
    with referenced as (
      select path from public.referenced_file_paths() as path
    ),
    unused as (
      select o.name::text as name
      from storage.objects o
      where o.bucket_id = 'page-files'
        and exists (select 1 from public.pages p where p.id = public.page_id_from_file_path(o.name))
        and not exists (select 1 from referenced r where r.path = o.name)
    ),
    referenced_again as (
      delete from public.unused_page_files u
      where not exists (select 1 from unused where unused.name = u.name)
    )
    insert into public.unused_page_files (name)
    select name from unused
    on conflict (name) do nothing;

    update public.unused_page_file_scan set scanned_at = now() where singleton;
  end if;

  return query
    select u.name
    from public.unused_page_files u
    where u.unused_since < now() - interval '30 days'
    order by u.unused_since, u.name
    limit least(greatest(coalesce(p_limit, 1000), 1), 1000);
end;
$$;

revoke execute on function public.next_unused_page_files(integer) from public, anon, authenticated;
grant execute on function public.next_unused_page_files(integer) to service_role;

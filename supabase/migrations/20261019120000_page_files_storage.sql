-- Package 15a: file storage for pages (images and attachments in the editor,
-- later also for the Notion import). Decisions of the user (2026-10-19):
-- images and any attachments, at most 10 MB per file, offline cache of
-- viewed images in the app, files of a page visible through its public link.
--
-- A file belongs to exactly one page: its path starts with the page id,
-- `<page id>/<random id>-<file name>`. Rights follow the page (can_read_page /
-- can_edit_page, including shares, sections and inheritance), so moving a
-- page between sections or owners needs no change to its files.
--
-- Not covered here: files are not removed when a page is deleted for good;
-- storage.objects forbids direct deletes (protect_delete), only the Storage
-- API may delete. Orphaned files stay until a later cleanup.

insert into storage.buckets (id, name, public, file_size_limit)
values ('page-files', 'page-files', false, 10485760)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

-- The page id at the start of a path; null for any other form, so that a
-- malformed path matches no page instead of failing the cast.
create or replace function public.page_id_from_file_path(path text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select (substring(path from '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/'))::uuid;
$$;

grant execute on function public.page_id_from_file_path(text) to anon, authenticated;

-- A page that can be viewed through an active public link (as get_public_page:
-- only this page, not archived). Security definer: anon cannot read
-- page_public_links itself.
create or replace function public.has_active_public_link(target_page_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.page_public_links l
    join public.pages p on p.id = l.page_id
    where l.page_id = target_page_id
      and not p.is_archived
  );
$$;

revoke execute on function public.has_active_public_link(uuid) from public;
grant execute on function public.has_active_public_link(uuid) to anon, authenticated;

create policy "Readers of a page read its files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'page-files'
  and public.can_read_page(public.page_id_from_file_path(name))
);

-- Also for signed-in people: they see a public link like everyone else.
create policy "A public link shows the files of its page"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'page-files'
  and public.has_active_public_link(public.page_id_from_file_path(name))
);

create policy "Editors of a page add files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'page-files'
  and public.can_edit_page(public.page_id_from_file_path(name))
);

-- Files never change in place (no update policy): a new version is a new file.
create policy "Editors of a page delete its files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'page-files'
  and public.can_edit_page(public.page_id_from_file_path(name))
);

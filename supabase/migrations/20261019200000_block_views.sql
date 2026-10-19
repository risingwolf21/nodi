-- Package 19b: views of a database inside a page (decision of the user,
-- CLAUDE.md §12 P19): a "Datenbank" block in a page shows an existing
-- database with views of its own, like Notion's linked views. Filters,
-- sorting and view types of the block do not change the database's views.
--
--   * A block view belongs to a page and a block of its document
--     (`block_id`, BlockNote's id of the block) and shows one database.
--   * Reading needs read rights on the page and on the database (the views
--     show its data). Changing needs edit rights on the page with the
--     block and read rights on the database, like editing the page's text.
--   * Rows of a deleted page or database go with it. Views of a block that
--     was removed from the text stay until the page is deleted (small; the
--     server does not read documents).
--
-- Backward compatible: a new table only.

create table public.block_views (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null
    references public.pages (id) on delete cascade,
  block_id text not null
    check (char_length(block_id) between 1 and 100),
  database_id uuid not null
    references public.pages (id) on delete cascade,
  name text not null
    check (char_length(btrim(name)) between 1 and 100),
  type text not null
    check (type in ('table', 'board', 'list', 'gallery', 'feed', 'calendar', 'map')),
  -- Filter, sort, grouping, visible properties; read by the client.
  config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(config) = 'object'),
  position numeric not null default 0,
  created_at timestamptz not null default now()
);

create index block_views_block_idx
  on public.block_views (page_id, block_id, position);

-- The shown page is a database and stays the same (as for its own views).
create trigger require_database_page
before insert or update on public.block_views
for each row
execute function public.require_database_page();

alter table public.block_views enable row level security;

create policy "Readers of the page and the database read block views"
on public.block_views
for select
to authenticated
using (public.can_read_page(page_id) and public.can_read_page(database_id));

create policy "Editors of the page add block views"
on public.block_views
for insert
to authenticated
with check (public.can_edit_page(page_id) and public.can_read_page(database_id));

create policy "Editors of the page change block views"
on public.block_views
for update
to authenticated
using (public.can_edit_page(page_id))
with check (public.can_edit_page(page_id) and public.can_read_page(database_id));

create policy "Editors of the page delete block views"
on public.block_views
for delete
to authenticated
using (public.can_edit_page(page_id));

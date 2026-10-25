-- Package 30b: favorites. Each user marks pages for the "Favoriten"
-- section of the sidebar; nobody else sees them.
--
-- The app loads them with the page tree (PostgREST embeds
-- page_favorites in pages; RLS leaves only the caller's rows), so they are
-- in the offline cache as well.
--
-- Backward compatible: a new table only.

create table public.page_favorites (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  page_id uuid not null references public.pages (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, page_id)
);

-- The embedding in pages and the cascade look up by page.
create index page_favorites_page_id_idx on public.page_favorites (page_id);

alter table public.page_favorites enable row level security;

revoke all on public.page_favorites from anon, authenticated;
grant select, insert, delete on public.page_favorites to authenticated;

create policy "Users see their own favorites"
  on public.page_favorites for select to authenticated
  using (user_id = (select auth.uid()));

-- Only pages the user may read; a favorite of a page that becomes
-- unreadable stays, but the page is not listed (RLS on pages).
create policy "Users add favorites of readable pages"
  on public.page_favorites for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_read_page(page_id));

create policy "Users remove their own favorites"
  on public.page_favorites for delete to authenticated
  using (user_id = (select auth.uid()));

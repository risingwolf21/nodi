-- Package 36a: live updates (decision of the user, 2026-10-26: refresh
-- live, conflicts stay Last-Write-Wins). Clients subscribe to one small
-- table through Supabase Realtime (postgres_changes); Realtime checks the
-- select policy for every subscriber, so a change reaches only people who
-- may read the page. The rows carry no content: a client that sees a change
-- loads what it needs as before, with the same rights.
--
-- - page_activity: one row per page, updated by triggers. `change` says
--   what to reload: 'page' (title, icon, place in the tree, trash, a new
--   share), 'document' (the text), 'properties' (properties, views and
--   values of a database; the row is the database's), 'comments'.
-- - No foreign key and no deletes: Realtime cannot check rights for
--   deleted rows and would send their keys to every subscriber. A row of a
--   page deleted for good stays and is readable by nobody.
-- - `actor`: who made the change (as updated_by already shows readers).
-- - `mutation_id`: for 'document', the mutation now stored; a client that
--   holds it (its own save) does not need to load the text again.
--
-- Backward compatible: a new table and triggers; nothing the app sends
-- changes.

create table public.page_activity (
  page_id uuid primary key,
  workspace_id uuid not null,
  change text not null check (change in ('page', 'document', 'properties', 'comments')),
  actor uuid,
  mutation_id uuid,
  changed_at timestamptz not null default now()
);

alter table public.page_activity enable row level security;
revoke all on table public.page_activity from public, anon, authenticated;
grant select on table public.page_activity to authenticated;

create policy "Readers of a page see its activity"
on public.page_activity
for select
to authenticated
using (public.can_read_page(page_id));

-- Records a change of a page; nothing for a page that no longer exists.
create or replace function public.touch_page_activity(
  target_page_id uuid,
  change_kind text,
  stored_mutation_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.page_activity (page_id, workspace_id, change, actor, mutation_id, changed_at)
  select p.id, p.workspace_id, change_kind, (select auth.uid()), stored_mutation_id, now()
  from public.pages p
  where p.id = target_page_id
  on conflict (page_id) do update
    set workspace_id = excluded.workspace_id,
        change = excluded.change,
        actor = excluded.actor,
        mutation_id = excluded.mutation_id,
        changed_at = excluded.changed_at;
end;
$$;

revoke execute on function public.touch_page_activity(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.page_activity_from_pages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.touch_page_activity(new.id, 'page');
  return null;
end;
$$;

create or replace function public.page_activity_from_documents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.touch_page_activity(new.page_id, 'document', new.last_mutation_id);
  return null;
end;
$$;

-- Values belong to an entry; what changes is the view of its database.
create or replace function public.page_activity_from_values()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_id uuid := case when tg_op = 'DELETE' then old.page_id else new.page_id end;
begin
  perform public.touch_page_activity(p.parent_id, 'properties')
  from public.pages p
  where p.id = entry_id and p.parent_id is not null;
  return null;
end;
$$;

-- Properties, views and block views name their database.
create or replace function public.page_activity_from_database_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.touch_page_activity(
    case when tg_op = 'DELETE' then old.database_id else new.database_id end,
    'properties'
  );
  return null;
end;
$$;

create or replace function public.page_activity_from_comments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.touch_page_activity(
    case when tg_op = 'DELETE' then old.page_id else new.page_id end,
    'comments'
  );
  return null;
end;
$$;

-- A new share: the page now appears for the person it is shared with.
create or replace function public.page_activity_from_shares()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.touch_page_activity(new.page_id, 'page');
  return null;
end;
$$;

revoke execute on function public.page_activity_from_pages() from public, anon, authenticated;
revoke execute on function public.page_activity_from_documents() from public, anon, authenticated;
revoke execute on function public.page_activity_from_values() from public, anon, authenticated;
revoke execute on function public.page_activity_from_database_settings() from public, anon, authenticated;
revoke execute on function public.page_activity_from_comments() from public, anon, authenticated;
revoke execute on function public.page_activity_from_shares() from public, anon, authenticated;

create trigger page_activity_from_pages
after insert or update on public.pages
for each row execute function public.page_activity_from_pages();

create trigger page_activity_from_documents
after insert or update on public.page_documents
for each row execute function public.page_activity_from_documents();

create trigger page_activity_from_values
after insert or update or delete on public.page_property_values
for each row execute function public.page_activity_from_values();

create trigger page_activity_from_database_properties
after insert or update or delete on public.database_properties
for each row execute function public.page_activity_from_database_settings();

create trigger page_activity_from_database_views
after insert or update or delete on public.database_views
for each row execute function public.page_activity_from_database_settings();

create trigger page_activity_from_block_views
after insert or update or delete on public.block_views
for each row execute function public.page_activity_from_database_settings();

create trigger page_activity_from_comments
after insert or update or delete on public.page_comments
for each row execute function public.page_activity_from_comments();

create trigger page_activity_from_shares
after insert or update on public.page_shares
for each row execute function public.page_activity_from_shares();

alter publication supabase_realtime add table public.page_activity;

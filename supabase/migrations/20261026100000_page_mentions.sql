-- Package 37a: mentions of people (decision of the user, 2026-10-26: a
-- mention in the text and a notice in the app, live, unread marked; no
-- e-mails).
--
-- - In a document a mention is inline content
--   {type: "mention", props: {userId, label}}.
-- - page_mentions: one row per page and mentioned person. A trigger on
--   page_documents adds or renews the rows of people who are newly
--   mentioned (not in the previous version), not the author. Rows stay when
--   the mention is removed again.
-- - The person sees a row only while they may read the page; mentioned_by
--   and the page title come with list_my_mentions. Only read_at can be
--   changed, by the person.
-- - Realtime (postgres_changes) checks the select policy per subscriber.
--   Deletes (page deleted for good, account deleted) reveal only the random
--   id of the row.
--
-- Backward compatible: a new table, trigger and functions.

create table public.page_mentions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  mentioned_by uuid references auth.users (id) on delete set null,
  mentioned_at timestamptz not null default now(),
  read_at timestamptz,
  unique (page_id, user_id)
);

create index page_mentions_user_idx on public.page_mentions (user_id, mentioned_at desc);
create index page_mentions_mentioned_by_idx on public.page_mentions (mentioned_by);

alter table public.page_mentions enable row level security;
revoke all on table public.page_mentions from public, anon, authenticated;
grant select, update (read_at) on table public.page_mentions to authenticated;

create policy "People see their mentions on pages they may read"
on public.page_mentions
for select
to authenticated
using (user_id = (select auth.uid()) and public.can_read_page(page_id));

create policy "People mark their mentions as read"
on public.page_mentions
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- The people a document mentions; malformed ids are left out.
create or replace function public.document_mentions(document jsonb)
returns setof uuid
language sql
immutable
set search_path = ''
as $$
  select distinct (value #>> '{}')::uuid
  from jsonb_path_query(
    coalesce(document, '[]'::jsonb),
    'strict $.** ? (@.type == "mention").props.userId'
  ) as value
  where jsonb_typeof(value) = 'string'
    and (value #>> '{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

create or replace function public.record_page_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid := (select auth.uid());
begin
  insert into public.page_mentions (page_id, user_id, mentioned_by, mentioned_at, read_at)
  select new.page_id, mentioned.id, author, now(), null
  from public.document_mentions(new.document) as mentioned (id)
  where mentioned.id is distinct from author
    and exists (select 1 from auth.users u where u.id = mentioned.id)
    and (
      tg_op = 'INSERT'
      or mentioned.id not in (select previous.id from public.document_mentions(old.document) as previous (id))
    )
  on conflict (page_id, user_id) do update
    set mentioned_by = excluded.mentioned_by,
        mentioned_at = excluded.mentioned_at,
        read_at = null;
  return null;
end;
$$;

revoke execute on function public.record_page_mentions() from public, anon, authenticated;

create trigger record_page_mentions
after insert or update of document on public.page_documents
for each row execute function public.record_page_mentions();

-- The caller's mentions on pages they may read and that are not in the
-- trash, newest first, with page and who mentioned them.
create or replace function public.list_my_mentions(p_limit integer default 50)
returns table (
  id uuid,
  page_id uuid,
  workspace_id uuid,
  page_title text,
  page_icon text,
  mentioned_by_email text,
  mentioned_at timestamptz,
  read_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.page_id, p.workspace_id, p.title, p.icon, u.email::text, m.mentioned_at, m.read_at
  from public.page_mentions m
  join public.pages p on p.id = m.page_id
  left join auth.users u on u.id = m.mentioned_by
  where m.user_id = (select auth.uid())
    and not p.is_archived
    and public.can_read_page(m.page_id)
  order by m.mentioned_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

revoke execute on function public.list_my_mentions(integer) from public, anon;
grant execute on function public.list_my_mentions(integer) to authenticated;

alter publication supabase_realtime add table public.page_mentions;

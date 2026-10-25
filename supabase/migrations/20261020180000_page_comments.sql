-- Package 31a: comments on pages, like Notion's page discussion.
--
-- A comment without parent_id starts a thread; replies point to that
-- root (one level, like Notion). Whoever may edit the page may comment
-- (there is no separate "can comment" role); whoever may read it reads
-- the comments. Only the author changes or deletes a comment; whoever may
-- edit the page resolves a thread (resolved_at on the root).
--
-- Backward compatible: a new table and a new function only.

create table public.page_comments (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  parent_id uuid references public.page_comments (id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null
);

create index page_comments_page_id_idx on public.page_comments (page_id, created_at);
create index page_comments_parent_id_idx on public.page_comments (parent_id);

alter table public.page_comments enable row level security;

revoke all on public.page_comments from anon, authenticated;
grant select, insert, update, delete on public.page_comments to authenticated;

create policy "Readers see the comments of a page"
  on public.page_comments for select to authenticated
  using (public.can_read_page(page_id));

create policy "Editors of a page comment on it"
  on public.page_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_edit_page(page_id));

-- Which columns may change is checked by the trigger below.
create policy "Authors and editors change comments"
  on public.page_comments for update to authenticated
  using (author_id = (select auth.uid()) or public.can_edit_page(page_id));

create policy "Authors delete their comments"
  on public.page_comments for delete to authenticated
  using (author_id = (select auth.uid()));

-- Replies answer a thread of the same page; the server keeps the rest.
create or replace function public.check_page_comment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent public.page_comments;
begin
  if tg_op = 'INSERT' then
    if new.parent_id is not null then
      select * into parent from public.page_comments where id = new.parent_id;
      if parent.id is null or parent.page_id <> new.page_id or parent.parent_id is not null then
        raise exception 'check_page_comment: a reply answers a thread of the same page'
          using errcode = '22023';
      end if;
    end if;
    new.created_at := now();
    new.edited_at := null;
    new.resolved_at := null;
    new.resolved_by := null;
    return new;
  end if;

  if new.id <> old.id or new.page_id <> old.page_id
    or new.parent_id is distinct from old.parent_id
    or new.author_id <> old.author_id or new.created_at <> old.created_at then
    raise exception 'check_page_comment: only the text and the resolved state change'
      using errcode = '42501';
  end if;

  if new.body <> old.body then
    if old.author_id <> (select auth.uid()) then
      raise exception 'check_page_comment: only the author changes a comment'
        using errcode = '42501';
    end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;

  if new.resolved_at is distinct from old.resolved_at then
    if old.parent_id is not null then
      raise exception 'check_page_comment: only a thread is resolved'
        using errcode = '22023';
    end if;
    if not public.can_edit_page(old.page_id) then
      raise exception 'check_page_comment: resolving needs the right to edit the page'
        using errcode = '42501';
    end if;
    if new.resolved_at is not null then
      new.resolved_at := now();
      new.resolved_by := (select auth.uid());
    else
      new.resolved_by := null;
    end if;
  else
    new.resolved_by := old.resolved_by;
  end if;
  return new;
end;
$$;

create trigger check_page_comment
  before insert or update on public.page_comments
  for each row execute function public.check_page_comment();

-- The comments of a page with the authors' e-mail addresses (auth.users is
-- not readable for clients). Whoever reads the page sees who commented.
create or replace function public.list_page_comments(p_page_id uuid)
returns table (
  id uuid,
  parent_id uuid,
  author_id uuid,
  author_email text,
  body text,
  created_at timestamptz,
  edited_at timestamptz,
  resolved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_page_id is null then
    raise exception 'list_page_comments: page missing' using errcode = '22004';
  end if;
  if not public.can_read_page(p_page_id) then
    raise exception 'list_page_comments: no access' using errcode = '42501';
  end if;
  return query
    select c.id, c.parent_id, c.author_id, u.email::text, c.body, c.created_at, c.edited_at, c.resolved_at
    from public.page_comments c
    join auth.users u on u.id = c.author_id
    where c.page_id = p_page_id
    order by c.created_at, c.id
    limit 1000;
end;
$$;

revoke execute on function public.list_page_comments(uuid) from public, anon;
grant execute on function public.list_page_comments(uuid) to authenticated;
revoke execute on function public.check_page_comment() from public, anon, authenticated;

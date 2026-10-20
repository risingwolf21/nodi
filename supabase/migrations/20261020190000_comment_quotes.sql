-- Package 31b: comments on text. The text keeps a "comment" style whose
-- value is the id of the thread (the app chooses the id, so the mark and
-- the thread fit together); the thread keeps the quoted text, so it can be
-- read even when the text has changed or the mark was deleted.
--
-- quote: only on a thread, at most 500 characters, set when it is created.
-- Backward compatible: a new nullable column only.

alter table public.page_comments
  add column quote text check (char_length(quote) <= 500);

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
      -- A reply quotes nothing; its thread does.
      new.quote := null;
    end if;
    new.quote := nullif(btrim(new.quote), '');
    new.created_at := now();
    new.edited_at := null;
    new.resolved_at := null;
    new.resolved_by := null;
    return new;
  end if;

  if new.id <> old.id or new.page_id <> old.page_id
    or new.parent_id is distinct from old.parent_id
    or new.author_id <> old.author_id or new.created_at <> old.created_at
    or new.quote is distinct from old.quote then
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

-- The quote comes with the comments; the return type changes, so the
-- function is created anew (an older app ignores the extra column).
drop function public.list_page_comments(uuid);

create function public.list_page_comments(p_page_id uuid)
returns table (
  id uuid,
  parent_id uuid,
  author_id uuid,
  author_email text,
  body text,
  quote text,
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
    select c.id, c.parent_id, c.author_id, u.email::text, c.body, c.quote, c.created_at, c.edited_at,
      c.resolved_at
    from public.page_comments c
    join auth.users u on u.id = c.author_id
    where c.page_id = p_page_id
    order by c.created_at, c.id
    limit 1000;
end;
$$;

revoke execute on function public.list_page_comments(uuid) from public, anon;
grant execute on function public.list_page_comments(uuid) to authenticated;

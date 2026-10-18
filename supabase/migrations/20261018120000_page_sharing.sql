-- Package 11a: sharing like Notion (decisions 2026-10-18).
--   * A share on a page also applies to its subpages, but not through a
--     private page: a private subpage (and everything below it) needs its
--     own share.
--   * Owners share by entering an exact e-mail address.
--   * Public links: read-only access to exactly one page by token.
-- Access stays a matter of RLS and permission rows, no keys.

-- Strongest share permission the caller has on a page, directly or
-- inherited from an ancestor. Walking up stops at a private page; the
-- depth limit guards against parent cycles (moving has no cycle check).
create or replace function public.has_page_share(target_page_id uuid, require_edit boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive chain as (
    select p.id, p.parent_id, p.visibility, 0 as depth
    from public.pages p
    where p.id = target_page_id

    union all

    select parent.id, parent.parent_id, parent.visibility, chain.depth + 1
    from chain
    join public.pages parent on parent.id = chain.parent_id
    where chain.visibility <> 'private'
      and chain.depth < 50
  )
  select exists (
    select 1
    from chain
    join public.page_shares s on s.page_id = chain.id
    where s.shared_with_user_id = (select auth.uid())
      and (not require_edit or s.permission = 'edit')
  );
$$;

revoke execute on function public.has_page_share(uuid, boolean) from public, anon;
grant execute on function public.has_page_share(uuid, boolean) to authenticated;

-- Same rules as before, shares now inherited (used by all RLS policies on
-- pages and page_documents and by save_page_document).
create or replace function public.can_read_page(target_page_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pages p
    where p.id = target_page_id
      and (
        p.owner_id = (select auth.uid())
        or (
          p.visibility = 'workspace'
          and public.is_workspace_member(p.workspace_id)
        )
        or public.has_page_share(p.id, false)
      )
  );
$$;

create or replace function public.can_edit_page(target_page_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pages p
    where p.id = target_page_id
      and (
        p.owner_id = (select auth.uid())
        or (
          p.visibility = 'workspace'
          and public.is_workspace_member(p.workspace_id)
        )
        or public.has_page_share(p.id, true)
      )
  );
$$;

-- Share a page by e-mail (owner only). Sharing again changes the
-- permission. Errors: 42501 not the owner, 22023 invalid permission or
-- own address, P0002 no account with this address.
create or replace function public.share_page(
  p_page_id uuid,
  p_email text,
  p_permission text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
begin
  if not exists (
    select 1 from public.pages p
    where p.id = p_page_id and p.owner_id = (select auth.uid())
  ) then
    raise exception 'share_page: only the page owner can share'
      using errcode = '42501';
  end if;

  if p_permission is null or p_permission not in ('read', 'edit') then
    raise exception 'share_page: permission must be read or edit'
      using errcode = '22023';
  end if;

  select u.id into recipient_id
  from auth.users u
  where lower(u.email) = lower(trim(p_email));

  if recipient_id is null then
    raise exception 'share_page: no account with this e-mail address'
      using errcode = 'P0002';
  end if;

  if recipient_id = (select auth.uid()) then
    raise exception 'share_page: cannot share with yourself'
      using errcode = '22023';
  end if;

  insert into public.page_shares (page_id, shared_with_user_id, permission, created_by)
  values (p_page_id, recipient_id, p_permission, (select auth.uid()))
  on conflict (page_id, shared_with_user_id)
  do update set permission = excluded.permission;

  return recipient_id;
end;
$$;

revoke execute on function public.share_page(uuid, text, text) from public, anon;
grant execute on function public.share_page(uuid, text, text) to authenticated;

-- Shares of a page with the recipients' e-mail addresses (owner only).
-- Changing and revoking use the existing owner policies on page_shares.
create or replace function public.list_page_shares(p_page_id uuid)
returns table (
  user_id uuid,
  email text,
  permission text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.pages p
    where p.id = p_page_id and p.owner_id = (select auth.uid())
  ) then
    raise exception 'list_page_shares: only the page owner can list shares'
      using errcode = '42501';
  end if;

  return query
    select s.shared_with_user_id, u.email::text, s.permission, s.created_at
    from public.page_shares s
    join auth.users u on u.id = s.shared_with_user_id
    where s.page_id = p_page_id
    order by s.created_at;
end;
$$;

revoke execute on function public.list_page_shares(uuid) from public, anon;
grant execute on function public.list_page_shares(uuid) to authenticated;

-- Public links: one random token per page. Deleting the row revokes the
-- link at once; a new row gives a new token.
create table public.page_public_links (
  page_id uuid primary key
    references public.pages (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_by uuid not null
    references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.page_public_links enable row level security;

create policy "Page owners can read public links"
on public.page_public_links
for select
to authenticated
using (
  exists (
    select 1 from public.pages p
    where p.id = page_id and p.owner_id = (select auth.uid())
  )
);

create policy "Page owners can create public links"
on public.page_public_links
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.pages p
    where p.id = page_id and p.owner_id = (select auth.uid())
  )
);

create policy "Page owners can revoke public links"
on public.page_public_links
for delete
to authenticated
using (
  exists (
    select 1 from public.pages p
    where p.id = page_id and p.owner_id = (select auth.uid())
  )
);

-- Read a published page without signing in. Only this page, read-only;
-- archived pages are not served.
create or replace function public.get_public_page(p_token uuid)
returns table (
  title text,
  icon text,
  full_width boolean,
  document jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.title, p.icon, p.full_width, coalesce(d.document, '[]'::jsonb)
  from public.page_public_links l
  join public.pages p on p.id = l.page_id
  left join public.page_documents d on d.page_id = p.id
  where l.token = p_token
    and not p.is_archived;
$$;

revoke execute on function public.get_public_page(uuid) from public;
grant execute on function public.get_public_page(uuid) to anon, authenticated;

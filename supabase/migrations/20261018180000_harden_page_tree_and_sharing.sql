-- Package 13a: closes gaps found in the code review (2026-10-18).
--   1. parent_id could be changed by anyone with edit rights. Together with
--      set_page_section that let a member take over the workspace tree of
--      someone else, and an editor share was enough to pass a page on or to
--      build a cycle. Moving is not offered by the app, so the column is
--      locked for API clients until a move function with checks exists.
--   2. Subpages could be created below pages that are only readable.
--   3. set_page_section changed private subpages of other members.
--   4. When a page changes its owner (leaving a workspace, moving a tree to
--      private), shares and public links of the previous owner stayed.
--   5. Owner rights on shares and public links did not require membership,
--      so someone who left could still publish their unreadable pages.
--   6. Shares and members were found by unconfirmed e-mail addresses.
--   7. Public link tokens could be chosen by the client.
--   8. The workspace owner could delete a workspace with the private pages
--      of other members (the app offers no deleting of workspaces).

-- 1. parent_id is fixed for API clients. Trusted server functions (no
--    user context or security definer) stay unrestricted.
create or replace function public.protect_page_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- No user context (service role, migrations, maintenance) or a trusted
  -- server function: no restriction.
  if (select auth.uid()) is null or current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.workspace_id is distinct from old.workspace_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'id, workspace_id, created_by and created_at of a page cannot be changed'
      using errcode = '42501';
  end if;

  if new.parent_id is distinct from old.parent_id then
    raise exception 'Moving pages is not supported'
      using errcode = '42501';
  end if;

  if (
    new.owner_id is distinct from old.owner_id
    or new.visibility is distinct from old.visibility
  )
    and old.owner_id <> (select auth.uid())
  then
    raise exception 'Only the page owner can change owner or visibility'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- 2. A subpage needs edit rights on its parent.
drop policy "Workspace members can create pages" on public.pages;

create policy "Workspace members can create pages"
on public.pages
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and owner_id = (select auth.uid())
  and public.is_workspace_member(workspace_id)
  and (
    parent_id is null
    or public.can_edit_page(parent_id)
  )
);

-- 3. Private pages of other members (and everything below them) are left
--    alone in both directions: they stay private and keep their owner.
create or replace function public.set_page_section(p_page_id uuid, p_visibility text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target record;
  changed integer := 0;
  row_changes integer;
begin
  if p_visibility is null or p_visibility not in ('workspace', 'private') then
    raise exception 'set_page_section: section must be workspace or private'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.pages p
    where p.id = p_page_id
      and p.owner_id = caller
      and public.is_workspace_member(p.workspace_id)
  ) then
    raise exception 'set_page_section: only the page owner can move the page'
      using errcode = '42501';
  end if;

  if exists (select 1 from public.pages p where p.id = p_page_id and p.parent_id is not null) then
    raise exception 'set_page_section: only a root page can be moved'
      using errcode = '22023';
  end if;

  -- One page at a time, in an order the section rule accepts: to private
  -- from the leaves up, to the workspace from the root down.
  for target in
    with recursive subtree as (
      select p.id, 0 as depth
      from public.pages p
      where p.id = p_page_id

      union all

      select child.id, subtree.depth + 1
      from subtree
      join public.pages child on child.parent_id = subtree.id
      where subtree.depth < 50
        and not (child.visibility = 'private' and child.owner_id <> caller)
    )
    select id, depth from subtree
    order by case when p_visibility = 'private' then -depth else depth end
  loop
    update public.pages p
    set visibility = p_visibility,
        owner_id = case when p_visibility = 'private' then caller else p.owner_id end
    where p.id = target.id
      and (
        p.visibility <> p_visibility
        or (p_visibility = 'private' and p.owner_id <> caller)
      );

    get diagnostics row_changes = row_count;
    changed := changed + row_changes;
  end loop;

  return changed;
end;
$$;

-- 4. A new owner starts without the shares and public links of the
--    previous one; they can share again.
create or replace function public.drop_access_of_previous_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.page_shares s
  where s.page_id = new.id
    and s.created_by <> new.owner_id;

  delete from public.page_public_links l
  where l.page_id = new.id
    and l.created_by <> new.owner_id;

  return null;
end;
$$;

revoke execute on function public.drop_access_of_previous_owner() from public, anon, authenticated;

create trigger drop_access_of_previous_owner
after update of owner_id on public.pages
for each row
when (old.owner_id is distinct from new.owner_id)
execute function public.drop_access_of_previous_owner();

-- 5. Owner of a page in the sense of sharing: owner and still a member of
--    its workspace (like can_read_page since package 12a). Revoking stays
--    possible without membership; it only takes access away.
create or replace function public.is_page_owner(target_page_id uuid)
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
      and p.owner_id = (select auth.uid())
      and public.is_workspace_member(p.workspace_id)
  );
$$;

revoke execute on function public.is_page_owner(uuid) from public, anon;
grant execute on function public.is_page_owner(uuid) to authenticated;

drop policy "Page owners and recipients can read shares" on public.page_shares;
create policy "Page owners and recipients can read shares"
on public.page_shares
for select
to authenticated
using (
  shared_with_user_id = (select auth.uid())
  or public.is_page_owner(page_id)
);

drop policy "Page owners can create shares" on public.page_shares;
create policy "Page owners can create shares"
on public.page_shares
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and shared_with_user_id <> (select auth.uid())
  and public.is_page_owner(page_id)
);

drop policy "Page owners can update shares" on public.page_shares;
create policy "Page owners can update shares"
on public.page_shares
for update
to authenticated
using (public.is_page_owner(page_id))
with check (
  public.is_page_owner(page_id)
  and shared_with_user_id <> (select auth.uid())
);

drop policy "Page owners can read public links" on public.page_public_links;
create policy "Page owners can read public links"
on public.page_public_links
for select
to authenticated
using (public.is_page_owner(page_id));

drop policy "Page owners can create public links" on public.page_public_links;
create policy "Page owners can create public links"
on public.page_public_links
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and public.is_page_owner(page_id)
);

-- 5 and 6. Sharing: owner and member, confirmed recipients only.
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
  if not public.is_page_owner(p_page_id) then
    raise exception 'share_page: only the page owner can share'
      using errcode = '42501';
  end if;

  if p_permission is null or p_permission not in ('read', 'edit') then
    raise exception 'share_page: permission must be read or edit'
      using errcode = '22023';
  end if;

  select u.id into recipient_id
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
    and u.email_confirmed_at is not null;

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
  if not public.is_page_owner(p_page_id) then
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

-- 6. Members: confirmed accounts only.
create or replace function public.add_workspace_member(p_workspace_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_id uuid;
begin
  if not public.is_workspace_owner(p_workspace_id) then
    raise exception 'add_workspace_member: only the workspace owner can add members'
      using errcode = '42501';
  end if;

  select u.id into member_id
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
    and u.email_confirmed_at is not null;

  if member_id is null then
    raise exception 'add_workspace_member: no account with this e-mail address'
      using errcode = 'P0002';
  end if;

  if member_id = (select auth.uid()) then
    raise exception 'add_workspace_member: the owner is a member already'
      using errcode = '22023';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (p_workspace_id, member_id, 'member')
  on conflict (workspace_id, user_id) do nothing;

  return member_id;
end;
$$;

-- 7. The server picks the token of a public link.
create or replace function public.set_public_link_token()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.token := gen_random_uuid();
  return new;
end;
$$;

revoke execute on function public.set_public_link_token() from public, anon, authenticated;

create trigger set_public_link_token
before insert on public.page_public_links
for each row
execute function public.set_public_link_token();

-- 8. No deleting of workspaces through the API; a later function can do it
--    with a rule for the pages of other members.
drop policy "Workspace owners can delete workspaces" on public.workspaces;

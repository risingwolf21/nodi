-- Package 12a: workspace members and the sections "Workspace" (shared) and
-- "Privat", like Notion (decisions 2026-10-18):
--   * Existing pages become private; the owner moves what the workspace
--     should see.
--   * Pages move between the sections in both directions (root pages,
--     owner only, with their subpages).
--   * Only the workspace owner adds and removes members.
--   * Leaving or removed: the person's shared pages go to the workspace
--     owner, private pages stay untouched but unreadable until they join
--     again.

-- 1. Existing pages become private. Before the section trigger below
--    exists, so all rows can change in one statement.
update public.pages
set visibility = 'private'
where visibility = 'workspace';

-- 2. Trusted server functions (security definer, running as the table
--    owner) check rights themselves and may change owner and visibility;
--    direct API updates keep the restrictions from package 2.
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

-- 3. A subpage of a private page is private, so no shared page hangs
--    below a page the other members cannot see. New subpages take it
--    over (also from older app versions); changes that break it are
--    rejected. A private subpage of a shared page stays possible
--    (package 11a: shares do not reach it).
create or replace function public.enforce_page_section()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_visibility text;
begin
  if new.parent_id is not null then
    select p.visibility into parent_visibility
    from public.pages p
    where p.id = new.parent_id;
  end if;

  if tg_op = 'INSERT' then
    if parent_visibility = 'private' then
      new.visibility := 'private';
    end if;
    return new;
  end if;

  if parent_visibility = 'private' and new.visibility <> 'private' then
    raise exception 'A subpage of a private page is private'
      using errcode = '22023';
  end if;

  if new.visibility = 'private'
    and old.visibility <> 'private'
    and exists (
      select 1 from public.pages child
      where child.parent_id = new.id
        and child.visibility <> 'private'
    )
  then
    raise exception 'Move the whole page with set_page_section to make it private'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

-- Named to run after protect_page_columns (BEFORE triggers fire in
-- name order), so permission errors come first.
create trigger require_page_section
before insert or update of parent_id, visibility on public.pages
for each row
execute function public.enforce_page_section();

-- 4. Shares: walking up stops where a private page lies below a shared
--    one (package 11a). Within a private tree it goes on, so sharing a
--    private page still covers its (now private) subpages.
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
    where (chain.visibility <> 'private' or parent.visibility = 'private')
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

-- 5. The owner of a page reaches it only as a member of its workspace,
--    so the private pages of someone who left stay unreadable until they
--    join again.
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
        (
          p.owner_id = (select auth.uid())
          and public.is_workspace_member(p.workspace_id)
        )
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
        (
          p.owner_id = (select auth.uid())
          and public.is_workspace_member(p.workspace_id)
        )
        or (
          p.visibility = 'workspace'
          and public.is_workspace_member(p.workspace_id)
        )
        or public.has_page_share(p.id, true)
      )
  );
$$;

drop policy "Page owners can delete pages" on public.pages;

create policy "Page owners can delete pages"
on public.pages
for delete
to authenticated
using (
  owner_id = (select auth.uid())
  and public.is_workspace_member(workspace_id)
);

-- 6. Members. Adding by exact e-mail (like sharing), owner only.
--    Errors: 42501 not the workspace owner, P0002 no account with this
--    address, 22023 own address. Adding an existing member changes nothing.
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
  where lower(u.email) = lower(trim(p_email));

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

revoke execute on function public.add_workspace_member(uuid, text) from public, anon;
grant execute on function public.add_workspace_member(uuid, text) to authenticated;

-- Members with their e-mail addresses (members only, owner first).
create or replace function public.list_workspace_members(p_workspace_id uuid)
returns table (
  user_id uuid,
  email text,
  role text,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'list_workspace_members: only members can list members'
      using errcode = '42501';
  end if;

  return query
    select m.user_id, u.email::text, m.role, m.joined_at
    from public.workspace_members m
    join auth.users u on u.id = m.user_id
    where m.workspace_id = p_workspace_id
    order by m.role = 'owner' desc, m.joined_at;
end;
$$;

revoke execute on function public.list_workspace_members(uuid) from public, anon;
grant execute on function public.list_workspace_members(uuid) to authenticated;

-- Ends a membership: shared pages of the person go to the workspace owner
-- (so they can still be managed and deleted), private ones stay theirs.
-- Their shares on pages of this workspace end too, so access ends at once.
create or replace function public.end_workspace_membership(p_workspace_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_owner uuid;
begin
  select w.owner_id into workspace_owner
  from public.workspaces w
  where w.id = p_workspace_id;

  update public.pages p
  set owner_id = workspace_owner
  where p.workspace_id = p_workspace_id
    and p.owner_id = p_user_id
    and p.visibility = 'workspace';

  delete from public.page_shares s
  using public.pages p
  where s.page_id = p.id
    and p.workspace_id = p_workspace_id
    and s.shared_with_user_id = p_user_id;

  delete from public.workspace_members m
  where m.workspace_id = p_workspace_id
    and m.user_id = p_user_id;
end;
$$;

-- Internal step of the two functions below, not part of the API.
revoke execute on function public.end_workspace_membership(uuid, uuid) from public, anon, authenticated;

-- Removing a member (owner only). Errors: 42501 not the owner, 22023 the
-- owner cannot be removed, P0002 not a member.
create or replace function public.remove_workspace_member(p_workspace_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_workspace_owner(p_workspace_id) then
    raise exception 'remove_workspace_member: only the workspace owner can remove members'
      using errcode = '42501';
  end if;

  if p_user_id = (select auth.uid()) then
    raise exception 'remove_workspace_member: the owner cannot be removed'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id
  ) then
    raise exception 'remove_workspace_member: not a member'
      using errcode = 'P0002';
  end if;

  perform public.end_workspace_membership(p_workspace_id, p_user_id);
end;
$$;

revoke execute on function public.remove_workspace_member(uuid, uuid) from public, anon;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;

-- Leaving a workspace. Errors: 22023 the owner cannot leave, 42501 not a
-- member.
create or replace function public.leave_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_workspace_owner(p_workspace_id) then
    raise exception 'leave_workspace: the owner cannot leave the workspace'
      using errcode = '22023';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'leave_workspace: not a member'
      using errcode = '42501';
  end if;

  perform public.end_workspace_membership(p_workspace_id, (select auth.uid()));
end;
$$;

revoke execute on function public.leave_workspace(uuid) from public, anon;
grant execute on function public.leave_workspace(uuid) to authenticated;

-- Memberships end only through the functions above, so the transfer of
-- shared pages cannot be skipped.
drop policy "Workspace owners can remove memberships" on public.workspace_members;

-- 7. Moving a root page with all subpages between the sections (page
--    owner and member only). Moving to private also hands the subpages of
--    other members to the caller: they lose access, like everyone else.
--    Errors: 42501 not the owner, 22023 not a root page or unknown
--    section. Returns the number of changed pages.
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

revoke execute on function public.set_page_section(uuid, text) from public, anon;
grant execute on function public.set_page_section(uuid, text) to authenticated;

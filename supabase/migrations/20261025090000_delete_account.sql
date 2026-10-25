-- Package 33a: a person deletes their own account (decision of the user,
-- 2026-10-25). Only through this function: it decides what happens to the
-- data before auth.users is deleted (pages, workspaces and shares refer to
-- the account with "on delete restrict").
--
-- - Own workspaces with other members go to the member who joined first;
--   own workspaces without other members are deleted with their pages
--   (including private pages of former members, which nobody can reach
--   any more).
-- - In every other workspace the membership ends like leave_workspace:
--   shared pages of the person go to the workspace owner.
-- - Private pages of the person are deleted, with everything below them.
-- - Shares the person created end; pages they created but that stay (now
--   owned by someone else) are recorded as created by their owner, since
--   created_by must name an existing account.
-- - Comments, favorites and memberships go with the account (cascade).
-- - Files in storage are not deleted yet (storage.objects only allows the
--   Storage API to delete; see package 35).
--
-- Errors: 42501 not signed in.
--
-- Backward compatible: only a new function.

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  account uuid := (select auth.uid());
  owned record;
  successor uuid;
  membership record;
begin
  if account is null then
    raise exception 'delete_account: not signed in'
      using errcode = '42501';
  end if;

  for owned in
    select w.id from public.workspaces w where w.owner_id = account
  loop
    select m.user_id into successor
    from public.workspace_members m
    where m.workspace_id = owned.id
      and m.user_id <> account
    order by m.joined_at, m.user_id
    limit 1;

    if successor is null then
      delete from public.workspaces w where w.id = owned.id;
    else
      update public.workspaces w
      set owner_id = successor, updated_at = now()
      where w.id = owned.id;

      update public.workspace_members m
      set role = 'owner'
      where m.workspace_id = owned.id and m.user_id = successor;
    end if;
  end loop;

  -- The own workspaces handed over above are ended here as well.
  for membership in
    select m.workspace_id from public.workspace_members m where m.user_id = account
  loop
    perform public.end_workspace_membership(membership.workspace_id, account);
  end loop;

  delete from public.pages p where p.owner_id = account;

  delete from public.page_shares s where s.created_by = account;

  update public.pages p
  set created_by = p.owner_id
  where p.created_by = account;

  delete from auth.users u where u.id = account;
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

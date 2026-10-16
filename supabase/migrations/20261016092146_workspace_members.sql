-- Workspaces
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  owner_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Workspace memberships
create table public.workspace_members (
  workspace_id uuid not null
    references public.workspaces (id) on delete cascade,
  user_id uuid not null
    references auth.users (id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_id_idx
  on public.workspace_members (user_id);

-- Helper functions: SECURITY DEFINER avoids recursive RLS checks
create or replace function public.is_workspace_member(
  target_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_workspace_owner(
  target_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = target_workspace_id
      and w.owner_id = (select auth.uid())
  );
$$;

-- Automatically add the creator as workspace owner
create or replace function public.add_workspace_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_members (
    workspace_id,
    user_id,
    role
  )
  values (
    new.id,
    new.owner_id,
    'owner'
  );

  return new;
end;
$$;

create trigger on_workspace_created
after insert on public.workspaces
for each row
execute function public.add_workspace_owner_membership();

-- Enable RLS
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

-- Workspaces: members can read
create policy "Workspace members can read workspaces"
on public.workspaces
for select
to authenticated
using (public.is_workspace_member(id));

-- Any authenticated user can create a workspace for themselves
create policy "Users can create their own workspaces"
on public.workspaces
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

-- Only the owner can update workspace metadata
create policy "Workspace owners can update workspaces"
on public.workspaces
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

-- Only the owner can delete a workspace
create policy "Workspace owners can delete workspaces"
on public.workspaces
for delete
to authenticated
using ((select auth.uid()) = owner_id);

-- Members can see the membership list of their workspace
create policy "Workspace members can read memberships"
on public.workspace_members
for select
to authenticated
using (public.is_workspace_member(workspace_id));

-- Only the workspace owner can add members directly
create policy "Workspace owners can add memberships"
on public.workspace_members
for insert
to authenticated
with check (
  public.is_workspace_owner(workspace_id)
  and role = 'member'
  and user_id <> (select auth.uid())
);

-- Only the owner can remove other memberships
create policy "Workspace owners can remove memberships"
on public.workspace_members
for delete
to authenticated
using (
  public.is_workspace_owner(workspace_id)
  and user_id <> (select auth.uid())
);
-- Explicit page shares
create table public.page_shares (
  page_id uuid not null
    references public.pages (id) on delete cascade,
  shared_with_user_id uuid not null
    references auth.users (id) on delete cascade,
  permission text not null default 'read'
    check (permission in ('read', 'edit')),
  created_by uuid not null
    references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (page_id, shared_with_user_id)
);

create index page_shares_user_idx
  on public.page_shares (shared_with_user_id);

alter table public.page_shares enable row level security;

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
        or exists (
          select 1
          from public.page_shares s
          where s.page_id = p.id
            and s.shared_with_user_id = (select auth.uid())
        )
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
        or exists (
          select 1
          from public.page_shares s
          where s.page_id = p.id
            and s.shared_with_user_id = (select auth.uid())
            and s.permission = 'edit'
        )
      )
  );
$$;

grant execute on function public.can_read_page(uuid) to authenticated;
grant execute on function public.can_edit_page(uuid) to authenticated;

-- Owners and recipients can inspect a share
create policy "Page owners and recipients can read shares"
on public.page_shares
for select
to authenticated
using (
  shared_with_user_id = (select auth.uid())
  or exists (
    select 1
    from public.pages p
    where p.id = page_id
      and p.owner_id = (select auth.uid())
  )
);

-- Only the page owner can create a share
create policy "Page owners can create shares"
on public.page_shares
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and shared_with_user_id <> (select auth.uid())
  and exists (
    select 1
    from public.pages p
    where p.id = page_id
      and p.owner_id = (select auth.uid())
  )
);

-- Only the page owner can change share permissions
create policy "Page owners can update shares"
on public.page_shares
for update
to authenticated
using (
  exists (
    select 1
    from public.pages p
    where p.id = page_id
      and p.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.pages p
    where p.id = page_id
      and p.owner_id = (select auth.uid())
  )
  and shared_with_user_id <> (select auth.uid())
);

-- Only the page owner can revoke a share
create policy "Page owners can revoke shares"
on public.page_shares
for delete
to authenticated
using (
  exists (
    select 1
    from public.pages p
    where p.id = page_id
      and p.owner_id = (select auth.uid())
  )
);
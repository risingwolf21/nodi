-- Pages
create table public.pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.workspaces (id) on delete cascade,
  parent_id uuid,
  owner_id uuid not null
    references auth.users (id) on delete restrict,
  created_by uuid not null
    references auth.users (id) on delete restrict,

  title text not null default 'Untitled',
  icon text,
  visibility text not null default 'workspace'
    check (visibility in ('workspace', 'private')),
  is_archived boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Required for the composite parent foreign key
  unique (id, workspace_id),

  constraint pages_parent_same_workspace_fk
    foreign key (parent_id, workspace_id)
    references public.pages (id, workspace_id)
    on delete cascade
);

create index pages_workspace_idx
  on public.pages (workspace_id);

create index pages_parent_idx
  on public.pages (parent_id);

create index pages_owner_idx
  on public.pages (owner_id);

-- BlockNote document, stored as JSONB
create table public.page_documents (
  page_id uuid primary key
    references public.pages (id) on delete cascade,
  document jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.pages enable row level security;
alter table public.page_documents enable row level security;

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
      )
  );
$$;

grant execute on function public.can_read_page(uuid) to authenticated;
grant execute on function public.can_edit_page(uuid) to authenticated;

-- Pages: readable only if permitted
create policy "Users can read accessible pages"
on public.pages
for select
to authenticated
using (public.can_read_page(id));

-- Pages: create only inside a workspace the user belongs to
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
    or public.can_read_page(parent_id)
  )
);

create policy "Users can update editable pages"
on public.pages
for update
to authenticated
using (public.can_edit_page(id))
with check (public.can_edit_page(id));

create policy "Users can delete editable pages"
on public.pages
for delete
to authenticated
using (public.can_edit_page(id));

-- Document access follows page access
create policy "Users can read accessible page documents"
on public.page_documents
for select
to authenticated
using (public.can_read_page(page_id));

create policy "Users can create editable page documents"
on public.page_documents
for insert
to authenticated
with check (public.can_edit_page(page_id));

create policy "Users can update editable page documents"
on public.page_documents
for update
to authenticated
using (public.can_edit_page(page_id))
with check (public.can_edit_page(page_id));
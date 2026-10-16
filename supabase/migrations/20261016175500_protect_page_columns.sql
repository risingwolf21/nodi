-- Pages: protect identity, owner and visibility on update.
-- The UPDATE policy's WITH CHECK calls can_edit_page(id), which reads the
-- table and therefore sees the old row. It cannot restrict which columns
-- change, so a trigger enforces it.
create or replace function public.protect_page_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- No user context (service role, migrations, maintenance): no restriction.
  if (select auth.uid()) is null then
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

create trigger protect_page_columns
before update on public.pages
for each row
execute function public.protect_page_columns();

-- Page documents: audit fields are set by the server, client values are
-- ignored. updated_at is the server time of the write.
create or replace function public.set_page_document_audit_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();

  if (select auth.uid()) is not null then
    new.updated_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger set_page_document_audit_fields
before insert or update on public.page_documents
for each row
execute function public.set_page_document_audit_fields();

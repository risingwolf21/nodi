-- Contract step for the last-write-wins rule (package 6): documents are
-- written only through save_page_document from now on, so the rule can no
-- longer be bypassed with a plain insert/update (decision 2026-10-18,
-- option A).
--
-- Clients older than package 7 still save with upsert. Their saves fail
-- with 42501 until the user confirms the app update.

revoke insert, update on table public.page_documents from anon, authenticated;

-- The insert/update policies on page_documents stay as a second line of
-- defense in case the privileges are granted again by mistake.

-- Same contract as before (arguments, result, error codes). Definer rights
-- because callers no longer have insert/update on the table; the edit
-- permission is checked explicitly with the helper the RLS policies use.
-- The audit trigger still records the caller: auth.uid() reads the
-- request's JWT, not the function owner.
create or replace function public.save_page_document(
  p_page_id uuid,
  p_document jsonb,
  p_edited_at timestamptz,
  p_mutation_id uuid
)
returns table (
  applied boolean,
  stored_edited_at timestamptz,
  stored_mutation_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  edited_at timestamptz;
begin
  if p_page_id is null
    or p_document is null
    or p_edited_at is null
    or p_mutation_id is null
  then
    raise exception 'save_page_document: all arguments are required'
      using errcode = '22004';
  end if;

  if jsonb_typeof(p_document) <> 'array' then
    raise exception 'save_page_document: document must be a JSON array'
      using errcode = '22023';
  end if;

  -- Also false for a page that does not exist.
  if not public.can_edit_page(p_page_id) then
    raise exception 'save_page_document: no permission to edit this page'
      using errcode = '42501';
  end if;

  edited_at := least(p_edited_at, now());

  -- Atomic: concurrent writers serialize on the row, and the WHERE clause
  -- is re-evaluated against the latest committed version.
  insert into public.page_documents as stored (
    page_id,
    document,
    client_updated_at,
    last_mutation_id
  )
  values (p_page_id, p_document, edited_at, p_mutation_id)
  on conflict (page_id) do update
  set
    document = excluded.document,
    client_updated_at = excluded.client_updated_at,
    last_mutation_id = excluded.last_mutation_id
  where (excluded.client_updated_at, excluded.last_mutation_id)
    > (
      stored.client_updated_at,
      coalesce(stored.last_mutation_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

  if found then
    return query select true, edited_at, p_mutation_id;
  else
    return query
      select false, stored.client_updated_at, stored.last_mutation_id
      from public.page_documents as stored
      where stored.page_id = p_page_id;
  end if;
end;
$$;

-- create or replace keeps the existing grants; repeated for clarity.
revoke execute on function public.save_page_document(uuid, jsonb, timestamptz, uuid)
  from public, anon;
grant execute on function public.save_page_document(uuid, jsonb, timestamptz, uuid)
  to authenticated;

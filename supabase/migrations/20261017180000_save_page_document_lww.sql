-- Last-write-wins for page documents, ordered by the client's edit time
-- and enforced by the server (decision 2026-10-16, see CLAUDE.md §2).
--
-- Order of two writes: (client_updated_at, last_mutation_id). A write is
-- applied only if it is strictly greater than the stored state, so
--   * a delayed, older request cannot overwrite a newer one,
--   * a replayed mutation (same edit time and id) is a no-op,
--   * equal edit times are decided by the higher mutation id.
-- Edit times from the future are capped at now() on arrival.
--
-- updated_at/updated_by stay the server time and author of the last
-- applied write (trigger set_page_document_audit_fields).

alter table public.page_documents
  add column client_updated_at timestamptz,
  add column last_mutation_id uuid;

-- Existing documents: the last server write is the best known edit time.
-- The audit trigger is disabled so that the backfill does not touch
-- updated_at/updated_by.
alter table public.page_documents
  disable trigger set_page_document_audit_fields;

update public.page_documents
set client_updated_at = updated_at;

alter table public.page_documents
  enable trigger set_page_document_audit_fields;

alter table public.page_documents
  alter column client_updated_at set default now(),
  alter column client_updated_at set not null;

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
-- Invoker rights: the RLS policies of page_documents decide who may write.
security invoker
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

revoke execute on function public.save_page_document(uuid, jsonb, timestamptz, uuid)
  from public, anon;
grant execute on function public.save_page_document(uuid, jsonb, timestamptz, uuid)
  to authenticated;

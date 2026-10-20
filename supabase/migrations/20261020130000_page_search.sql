-- Package 27: search (decision of the user, CLAUDE.md §12 P27: online a
-- full-text search on the server over all readable pages, offline in the
-- app over titles and local copies).
--
-- page_documents.search_text is the plain text of a document (every "text"
-- of its blocks), a generated column: computed for existing rows without
-- touching updated_at or any other value. Titles and texts are found by
-- substring (pg_trgm indexes; German compound words are found by any part).
-- search_pages runs with the caller's rights: RLS decides what is found.
--
-- Backward compatible: a new column, indexes and a function only.

create extension if not exists pg_trgm with schema extensions;

-- The text values of a BlockNote document, in order.
create or replace function public.document_plain_text(p_document jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(string_agg(value #>> '{}', ' '), '')
  from jsonb_path_query(p_document, 'strict $.**.text') as value
  where jsonb_typeof(value) = 'string'
$$;

alter table public.page_documents
  add column search_text text not null
    generated always as (left(public.document_plain_text(document), 200000)) stored;

create index page_documents_search_text_idx
  on public.page_documents using gin (search_text extensions.gin_trgm_ops);
create index pages_title_trgm_idx
  on public.pages using gin (title extensions.gin_trgm_ops);

-- Readable, active pages whose title or text contains the query (at least
-- two characters), title hits first; with a piece of the text around the
-- first hit.
create or replace function public.search_pages(p_query text, p_limit integer default 30)
returns table (
  id uuid,
  title text,
  icon text,
  kind text,
  parent_id uuid,
  workspace_id uuid,
  snippet text
)
language sql
stable
set search_path = ''
as $$
  with query as (
    select
      '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern,
      lower(trim(p_query)) as needle
  )
  select
    p.id, p.title, p.icon, p.kind, p.parent_id, p.workspace_id,
    case
      when d.search_text ilike query.pattern
        then substr(d.search_text, greatest(strpos(lower(d.search_text), query.needle) - 40, 1), 160)
    end as snippet
  from query
  cross join public.pages p
  left join public.page_documents d on d.page_id = p.id
  where char_length(query.needle) >= 2
    and not p.is_archived
    and (p.title ilike query.pattern or d.search_text ilike query.pattern)
  order by (p.title ilike query.pattern) desc, p.title
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;

revoke execute on function public.search_pages(text, integer) from public, anon;
grant execute on function public.search_pages(text, integer) to authenticated;

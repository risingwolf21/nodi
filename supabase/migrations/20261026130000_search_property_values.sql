-- Package 43: the search finds values of database entries and the titles
-- of page links and mentions (decision of the user, CLAUDE.md §12 P43).
--
-- 1. page_documents.search_text also holds the title of every page link and
--    the label of every mention (as they stand in the text), in the order of
--    the document. The column is dropped and added again (a generated column
--    cannot change its expression before PostgreSQL 17): computed for all
--    rows without touching updated_at or any other value.
-- 2. search_pages also finds entries by the text of their values (text, URL,
--    e-mail, the names of chosen options, the label of a place); the
--    snippet is then "Property: value". RLS still decides what is found.
--
-- Backward compatible: search_pages keeps its signature and its columns.

-- The searchable text of a BlockNote document: every "text", the title of a
-- page link and the label of a mention, in order.
create or replace function public.document_search_text(p_document jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(string_agg(part, ' ' order by ordinality), '')
  from jsonb_path_query(p_document, 'strict $.** ? (@.type() == "object")') with ordinality as node(value, ordinality)
  cross join lateral (
    select case
      when value ->> 'type' = 'pageLink' and jsonb_typeof(value #> '{props,title}') = 'string'
        then value #>> '{props,title}'
      when value ->> 'type' = 'mention' and jsonb_typeof(value #> '{props,label}') = 'string'
        then value #>> '{props,label}'
      when jsonb_typeof(value -> 'text') = 'string'
        then value ->> 'text'
    end as part
  ) as parts
  where part is not null
$$;

drop index if exists public.page_documents_search_text_idx;
alter table public.page_documents drop column search_text;
alter table public.page_documents
  add column search_text text not null
    generated always as (left(public.document_search_text(document), 200000)) stored;
create index page_documents_search_text_idx
  on public.page_documents using gin (search_text extensions.gin_trgm_ops);

-- No column uses it any more.
drop function public.document_plain_text(jsonb);

-- The text of a value as the app shows it, for the types that hold text;
-- null for all others (numbers, dates, check boxes, relations …).
create or replace function public.property_value_search_text(p_type text, p_options jsonb, p_value jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type in ('text', 'url', 'email') and jsonb_typeof(p_value) = 'string'
      then p_value #>> '{}'
    when p_type in ('select', 'status') and jsonb_typeof(p_value) = 'string'
      then (
        select option ->> 'name'
        from jsonb_array_elements(
          case when jsonb_typeof(p_options -> 'options') = 'array' then p_options -> 'options' else '[]'::jsonb end
        ) as option
        where option ->> 'id' = p_value #>> '{}'
        limit 1
      )
    when p_type = 'multi_select' and jsonb_typeof(p_value) = 'array'
      then (
        select string_agg(option ->> 'name', ', ' order by chosen.ordinality)
        from jsonb_array_elements_text(p_value) with ordinality as chosen(id, ordinality)
        join jsonb_array_elements(
          case when jsonb_typeof(p_options -> 'options') = 'array' then p_options -> 'options' else '[]'::jsonb end
        ) as option on option ->> 'id' = chosen.id
      )
    when p_type = 'place' and jsonb_typeof(p_value -> 'label') = 'string'
      then nullif(p_value ->> 'label', '')
  end
$$;

-- Readable, active pages whose title, text or one of whose values contains
-- the query (at least two characters), title hits first; with a piece of
-- the text around the first hit, else the first matching value.
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
      else left(value_hit.text, 160)
    end as snippet
  from query
  cross join public.pages p
  left join public.page_documents d on d.page_id = p.id
  left join lateral (
    select property.name || ': ' || value_text.text as text
    from public.page_property_values v
    join public.database_properties property on property.id = v.property_id
    cross join lateral (
      select public.property_value_search_text(property.type, property.options, v.value) as text
    ) as value_text
    where v.page_id = p.id
      and value_text.text ilike query.pattern
    order by property.position, property.created_at
    limit 1
  ) as value_hit on true
  where char_length(query.needle) >= 2
    and not p.is_archived
    and (p.title ilike query.pattern or d.search_text ilike query.pattern or value_hit.text is not null)
  order by (p.title ilike query.pattern) desc, p.title
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;

-- Duplicating a page (package 47a), like Notion: a copy of the page with
-- everything below it that the caller can read, right after the original.
-- Databases come with their properties, views, entries and values; texts,
-- block views and settings point to the copies of pages and properties
-- that were copied along. Comments, shares, links, favorites, mentions and
-- recurrences stay with the original. Files are copied by the app (only the
-- Storage API can), so the function returns which ones.

-- Replaces the ids of `p_old` by those of `p_new` wherever they occur in a
-- value (texts, options, configs, values). Only ids that occur are looked at.
create or replace function public.remap_ids(p_value jsonb, p_old uuid[], p_new uuid[])
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  value_text text := p_value::text;
  pair record;
begin
  if p_value is null then
    return null;
  end if;

  for pair in
    select m.old_id, m.new_id
    from unnest(p_old, p_new) as m(old_id, new_id)
    where m.old_id::text in (
      select (regexp_matches(value_text, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'g'))[1]
    )
  loop
    value_text := replace(value_text, pair.old_id::text, pair.new_id::text);
  end loop;
  return value_text::jsonb;
end;
$$;

revoke execute on function public.remap_ids(jsonb, uuid[], uuid[]) from public, anon, authenticated;

-- At most this many pages are copied at once.
create or replace function public.max_duplicated_pages()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 1000;
$$;

-- Returns the copy and the files to copy into its folders ({from, to} paths
-- in the bucket page-files). Errors: 42501 the page cannot be read or no
-- edit rights where the copy goes, 22023 in the trash or too many pages,
-- 22004 missing argument.
create or replace function public.duplicate_page(p_page_id uuid)
returns table (page_id uuid, files jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  root public.pages;
  old_pages uuid[];
  new_pages uuid[];
  depths integer[];
  old_properties uuid[];
  new_properties uuid[];
  all_old uuid[];
  all_new uuid[];
  copy_position numeric;
  next_position numeric;
  relation record;
  paired_id uuid;
  value record;
  copied_files jsonb;
begin
  if p_page_id is null then
    raise exception 'duplicate_page: the page is required' using errcode = '22004';
  end if;

  select * into root from public.pages p where p.id = p_page_id;
  if not found or caller is null or not public.can_read_page(p_page_id) then
    raise exception 'duplicate_page: the page cannot be read' using errcode = '42501';
  end if;
  if root.is_archived then
    raise exception 'duplicate_page: the page is in the trash' using errcode = '22023';
  end if;
  -- Like creating a page there (insert policy on pages).
  if not public.is_workspace_member(root.workspace_id)
    or (root.parent_id is not null and not public.can_edit_page(root.parent_id))
  then
    raise exception 'duplicate_page: no edit rights where the copy goes' using errcode = '42501';
  end if;

  -- The page and what is below it, as far as the caller can read it.
  with recursive tree as (
    select p.id, 0 as depth
    from public.pages p
    where p.id = p_page_id
    union all
    select child.id, tree.depth + 1
    from tree
    join public.pages child on child.parent_id = tree.id
    where tree.depth < 50 and not child.is_archived and public.can_read_page(child.id)
  )
  select array_agg(t.id order by t.depth, t.id), array_agg(t.depth order by t.depth, t.id)
  into old_pages, depths
  from tree t;

  if cardinality(old_pages) > public.max_duplicated_pages() then
    raise exception 'duplicate_page: too many pages to copy at once' using errcode = '22023';
  end if;
  new_pages := array(select gen_random_uuid() from generate_series(1, cardinality(old_pages)));

  -- Properties of the copied databases. A relation to a database outside the
  -- copy needs a new other side there, so edit rights; without them it is left out.
  select coalesce(array_agg(pr.id order by pr.id), '{}') into old_properties
  from public.database_properties pr
  where pr.database_id = any (old_pages)
    and not (
      pr.type = 'relation'
      and not coalesce((pr.options ->> 'databaseId')::uuid = any (old_pages), false)
      and not public.can_edit_page((pr.options ->> 'databaseId')::uuid)
    );
  new_properties := array(select gen_random_uuid() from unnest(old_properties));
  all_old := old_pages || old_properties;
  all_new := new_pages || new_properties;

  -- Right after the original (between it and the next sibling).
  if root.position is not null then
    select min(p.position) into next_position
    from public.pages p
    where p.workspace_id = root.workspace_id
      and p.parent_id is not distinct from root.parent_id
      and p.position > root.position;
    copy_position := coalesce((root.position + next_position) / 2, root.position + 1);
  end if;

  -- Parents before their children (section and template rules look at the parent).
  for level in 0 .. coalesce((select max(d) from unnest(depths) d), 0) loop
    insert into public.pages (
      id, workspace_id, parent_id, owner_id, created_by, title, icon, kind, visibility,
      position, full_width, cover, is_template
    )
    select
      m.new_id, src.workspace_id,
      case when m.depth = 0 then src.parent_id else parent_map.new_id end,
      caller, caller,
      case
        when m.depth > 0 then src.title
        when btrim(src.title) = '' then 'Ohne Titel (Kopie)'
        else src.title || ' (Kopie)'
      end,
      src.icon, src.kind, src.visibility,
      case when m.depth = 0 then copy_position else src.position end,
      src.full_width,
      public.remap_ids(to_jsonb(src.cover), old_pages, new_pages) #>> '{}',
      src.is_template
    from unnest(old_pages, new_pages, depths) as m(old_id, new_id, depth)
    join public.pages src on src.id = m.old_id
    left join unnest(old_pages, new_pages) as parent_map(old_id, new_id) on parent_map.old_id = src.parent_id
    where m.depth = level;
  end loop;

  -- A new database got the default table view; the copied views replace it.
  delete from public.database_views v where v.database_id = any (new_pages);

  insert into public.page_documents (page_id, document, updated_by, client_updated_at, last_mutation_id)
  select m.new_id, public.remap_ids(d.document, all_old, all_new), caller, now(), gen_random_uuid()
  from unnest(old_pages, new_pages) as m(old_id, new_id)
  join public.page_documents d on d.page_id = m.old_id;

  insert into public.database_properties (id, database_id, name, type, options, position)
  select m.new_id, db_map.new_id, pr.name, pr.type, public.remap_ids(pr.options, all_old, all_new), pr.position
  from unnest(old_properties, new_properties) as m(old_id, new_id)
  join public.database_properties pr on pr.id = m.old_id
  join unnest(old_pages, new_pages) as db_map(old_id, new_id) on db_map.old_id = pr.database_id;

  insert into public.database_views (database_id, name, type, config, position)
  select db_map.new_id, v.name, v.type, public.remap_ids(v.config, all_old, all_new), v.position
  from public.database_views v
  join unnest(old_pages, new_pages) as db_map(old_id, new_id) on db_map.old_id = v.database_id;

  insert into public.block_views (page_id, block_id, database_id, name, type, config, position)
  select page_map.new_id, b.block_id, coalesce(db_map.new_id, b.database_id), b.name, b.type,
         public.remap_ids(b.config, all_old, all_new), b.position
  from public.block_views b
  join unnest(old_pages, new_pages) as page_map(old_id, new_id) on page_map.old_id = b.page_id
  left join unnest(old_pages, new_pages) as db_map(old_id, new_id) on db_map.old_id = b.database_id;

  -- Values of the copied entries. A relation within the copy keeps only
  -- entries that were copied (others belong to the original database).
  insert into public.page_property_values (page_id, property_id, value, client_updated_at, last_mutation_id, updated_by)
  select page_map.new_id, property_map.new_id,
    case
      when pr.type = 'relation' and jsonb_typeof(v.value) = 'array'
        and (pr.options ->> 'databaseId')::uuid = any (old_pages)
      then coalesce(
        (select jsonb_agg(to_jsonb(linked.new_id::text) order by item.ord)
         from jsonb_array_elements_text(v.value) with ordinality as item(entry, ord)
         join unnest(old_pages, new_pages) as linked(old_id, new_id) on linked.old_id::text = item.entry),
        'null'::jsonb
      )
      else public.remap_ids(v.value, all_old, all_new)
    end,
    now(), gen_random_uuid(), caller
  from public.page_property_values v
  join unnest(old_pages, new_pages) as page_map(old_id, new_id) on page_map.old_id = v.page_id
  join unnest(old_properties, new_properties) as property_map(old_id, new_id) on property_map.old_id = v.property_id
  join public.database_properties pr on pr.id = v.property_id;

  -- A relation to a database outside the copy gets a new other side there,
  -- named after the copied database, which links back to the copied entries.
  for relation in
    select m.new_id as property_id, db_map.new_id as database_copy, (pr.options ->> 'databaseId')::uuid as target
    from unnest(old_properties, new_properties) as m(old_id, new_id)
    join public.database_properties pr on pr.id = m.old_id
    join unnest(old_pages, new_pages) as db_map(old_id, new_id) on db_map.old_id = pr.database_id
    where pr.type = 'relation' and not coalesce((pr.options ->> 'databaseId')::uuid = any (old_pages), false)
  loop
    paired_id := gen_random_uuid();
    insert into public.database_properties (id, database_id, name, type, options, position)
    select paired_id, relation.target,
           coalesce(nullif(left(btrim(copy.title), 100), ''), 'Ohne Titel'), 'relation',
           jsonb_build_object('databaseId', relation.database_copy, 'pairedPropertyId', relation.property_id),
           (select coalesce(max(other.position) + 1, 0) from public.database_properties other
            where other.database_id = relation.target)
    from public.pages copy
    where copy.id = relation.database_copy;

    update public.database_properties pr
    set options = jsonb_set(pr.options, '{pairedPropertyId}', to_jsonb(paired_id::text))
    where pr.id = relation.property_id;

    insert into public.page_property_values (page_id, property_id, value, client_updated_at, last_mutation_id, updated_by)
    select linked.entry::uuid, paired_id, jsonb_agg(to_jsonb(v.page_id::text) order by v.page_id),
           now(), gen_random_uuid(), caller
    from public.page_property_values v
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(v.value) = 'array' then v.value else '[]'::jsonb end
    ) as linked(entry)
    join public.pages target_entry on target_entry.id::text = linked.entry and target_entry.parent_id = relation.target
    where v.property_id = relation.property_id
    group by linked.entry;
  end loop;

  -- A copied entry of a database outside the copy (the page itself): its
  -- values as if set by hand, so relations are linked on their other side
  -- too. A link to an entry the caller may not edit is left out.
  for value in
    select v.property_id, v.value
    from public.page_property_values v
    join public.database_properties pr on pr.id = v.property_id
    where v.page_id = p_page_id
      and not (pr.id = any (old_properties))
      and jsonb_typeof(v.value) <> 'null'
  loop
    begin
      perform public.set_page_property(
        new_pages[1], value.property_id, public.remap_ids(value.value, all_old, all_new), now(), gen_random_uuid()
      );
    exception when insufficient_privilege then
      null;
    end;
  end loop;

  -- The default template of a copied database is the copy of its template.
  update public.pages p
  set default_template_id = template_map.new_id
  from unnest(old_pages, new_pages) as db_map(old_id, new_id)
  join public.pages src on src.id = db_map.old_id
  join unnest(old_pages, new_pages) as template_map(old_id, new_id) on template_map.old_id = src.default_template_id
  where p.id = db_map.new_id;

  -- Files in the folders of copied pages that the copies refer to.
  with referenced as (
    select substr(reference #>> '{}', length('nodi-file:') + 1) as path
    from public.page_documents d,
         jsonb_path_query(d.document, 'strict $.** ? (@.type() == "string" && @ starts with "nodi-file:")') as reference
    where d.page_id = any (old_pages)
    union
    select substr(p.cover, length('nodi-file:') + 1)
    from public.pages p
    where p.id = any (old_pages) and p.cover like 'nodi-file:%'
    union
    select path
    from public.page_property_values v
    join public.database_properties pr on pr.id = v.property_id and pr.type = 'files'
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(v.value) = 'array' then v.value else '[]'::jsonb end
    ) as path
    where v.page_id = any (old_pages)
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('from', r.path, 'to', m.new_id::text || substr(r.path, 37)) order by r.path),
    '[]'::jsonb
  )
  into copied_files
  from referenced r
  join unnest(old_pages, new_pages) as m(old_id, new_id) on m.old_id = public.page_id_from_file_path(r.path)
  where exists (select 1 from storage.objects o where o.bucket_id = 'page-files' and o.name = r.path);

  return query select new_pages[1], copied_files;
end;
$$;

revoke execute on function public.duplicate_page(uuid) from public, anon;
grant execute on function public.duplicate_page(uuid) to authenticated;

-- Package 17d: relations between databases ("Verknüpfung"), two-way like
-- Notion (decision of the user, CLAUDE.md §12 P17).
--
--   * A relation property points to the entries of one database (the
--     target, in the same workspace). It always has a paired property in
--     the target database that points back. add_relation_property creates
--     both; deleting one deletes the other.
--   * options: {"databaseId": target database, "pairedPropertyId": the
--     other side}. Only the server sets them: clients may rename and
--     reorder a relation property, not change its type or options.
--   * A value is a JSON array of entry ids of the target database (at
--     most 100; JSON null when empty). set_page_property keeps both sides
--     equal: adding entry B to A's relation adds A to B's paired relation,
--     removing removes it.
--   * Setting a relation changes the related entries as well, so it needs
--     edit rights on the entry and on every entry added or removed.
--   * Ids of entries deleted later stay in the arrays; the app ignores
--     them (an index to clean them up would cost more than it saves).
--
-- Backward compatible: only the allowed types grow, set_page_property
-- keeps its signature and behavior for all other types. Apps since 14e
-- leave the unknown type out.

alter table public.database_properties
  drop constraint database_properties_type_check,
  add constraint database_properties_type_check
    check (type in (
      'text', 'number', 'checkbox', 'select', 'multi_select', 'status',
      'date', 'url', 'email', 'place', 'formula', 'relation',
      'created_time', 'last_edited_time'
    ));

-- Maximum number of related entries in one value.
create or replace function public.max_relation_entries()
returns integer
language sql
immutable
set search_path = ''
as $$ select 100 $$;

-- 1. Relation properties are made and changed only by the server.
create or replace function public.protect_relation_properties()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- No user context (service role, migrations) or a trusted server function.
  if (select auth.uid()) is null or current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' and new.type = 'relation' then
    raise exception 'Relation properties are created with add_relation_property'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if (old.type = 'relation') <> (new.type = 'relation') then
      raise exception 'A relation cannot change its type, and no property can become one'
        using errcode = '22023';
    end if;
    if old.type = 'relation'
      and (new.options is distinct from old.options or new.database_id is distinct from old.database_id)
    then
      raise exception 'The target of a relation cannot be changed'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger protect_relation_properties
before insert or update on public.database_properties
for each row
execute function public.protect_relation_properties();

-- 2. Deleting one side deletes the other, which needs edit rights there too.
create or replace function public.require_rights_on_paired_relation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  paired_database uuid;
begin
  if old.type <> 'relation' or (select auth.uid()) is null then
    return old;
  end if;

  select pr.database_id into paired_database
  from public.database_properties pr
  where pr.id = (old.options ->> 'pairedPropertyId')::uuid;

  if found and not public.can_edit_page(paired_database) then
    raise exception 'Deleting a relation deletes its other side, which needs edit rights on that database'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke execute on function public.require_rights_on_paired_relation() from public, anon, authenticated;

-- Only for deletes by users; deletes inside server functions and cascades
-- (a deleted database takes its relations' other sides with it) pass.
create trigger require_rights_on_paired_relation
before delete on public.database_properties
for each row
when (old.type = 'relation' and current_user in ('authenticated', 'anon'))
execute function public.require_rights_on_paired_relation();

create or replace function public.delete_paired_relation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.database_properties pr
  where pr.id = (old.options ->> 'pairedPropertyId')::uuid
    and pr.type = 'relation';
  return null;
end;
$$;

revoke execute on function public.delete_paired_relation() from public, anon, authenticated;

create trigger delete_paired_relation
after delete on public.database_properties
for each row
when (old.type = 'relation')
execute function public.delete_paired_relation();

-- 3. Creating a relation: both sides at once.
-- Errors: 42501 no edit rights on one of the databases (or it does not
-- exist), 22023 not a database, another workspace or an invalid name,
-- 22004 missing argument.
create or replace function public.add_relation_property(
  p_database_id uuid,
  p_name text,
  p_target_database_id uuid,
  p_paired_name text
)
returns table (property_id uuid, paired_property_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_id uuid := gen_random_uuid();
  paired_id uuid := gen_random_uuid();
  source_workspace uuid;
  target_workspace uuid;
begin
  if p_database_id is null or p_name is null or p_target_database_id is null or p_paired_name is null then
    raise exception 'add_relation_property: all arguments are required'
      using errcode = '22004';
  end if;

  if not public.can_edit_page(p_database_id) or not public.can_edit_page(p_target_database_id) then
    raise exception 'add_relation_property: no edit rights on both databases'
      using errcode = '42501';
  end if;

  select p.workspace_id into source_workspace
  from public.pages p where p.id = p_database_id and p.kind = 'database';
  select p.workspace_id into target_workspace
  from public.pages p where p.id = p_target_database_id and p.kind = 'database';

  if source_workspace is null or target_workspace is null then
    raise exception 'add_relation_property: both pages must be databases'
      using errcode = '22023';
  end if;
  if source_workspace <> target_workspace then
    raise exception 'add_relation_property: both databases must be in the same workspace'
      using errcode = '22023';
  end if;
  if char_length(btrim(p_name)) not between 1 and 100
    or char_length(btrim(p_paired_name)) not between 1 and 100
  then
    raise exception 'add_relation_property: names need 1 to 100 characters'
      using errcode = '22023';
  end if;

  -- Each side goes to the end of its database.
  insert into public.database_properties (id, database_id, name, type, options, position)
  select source_id, p_database_id, btrim(p_name), 'relation',
         jsonb_build_object('databaseId', p_target_database_id, 'pairedPropertyId', paired_id),
         coalesce(max(pr.position) + 1, 0)
  from public.database_properties pr where pr.database_id = p_database_id;

  insert into public.database_properties (id, database_id, name, type, options, position)
  select paired_id, p_target_database_id, btrim(p_paired_name), 'relation',
         jsonb_build_object('databaseId', p_database_id, 'pairedPropertyId', source_id),
         coalesce(max(pr.position) + 1, 0)
  from public.database_properties pr where pr.database_id = p_target_database_id;

  return query select source_id, paired_id;
end;
$$;

revoke execute on function public.add_relation_property(uuid, text, uuid, text) from public, anon;
grant execute on function public.add_relation_property(uuid, text, uuid, text) to authenticated;

-- 4. Values of relations, with the other side kept equal.
-- Called by set_page_property after its checks (edit rights on the entry,
-- property of the entry's database); not callable by clients.
create or replace function public.set_relation_value(
  p_page_id uuid,
  p_property_id uuid,
  p_options jsonb,
  p_value jsonb,
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
  target_database uuid := (p_options ->> 'databaseId')::uuid;
  paired_property uuid := (p_options ->> 'pairedPropertyId')::uuid;
  new_ids uuid[];
  old_ids uuid[];
  changed_ids uuid[];
  stored record;
  has_stored boolean;
  edited_at timestamptz := least(p_edited_at, now());
  page_json jsonb := to_jsonb(p_page_id::text);
begin
  -- Shape: null, or an array of up to 100 entry ids (duplicates dropped, order kept).
  if jsonb_typeof(p_value) = 'null' then
    new_ids := '{}';
  elsif jsonb_typeof(p_value) <> 'array'
    or jsonb_array_length(p_value) > public.max_relation_entries()
    or exists (
      select 1 from jsonb_array_elements(p_value) e
      where jsonb_typeof(e) <> 'string' or not pg_input_is_valid(e #>> '{}', 'uuid')
    )
  then
    raise exception 'set_page_property: a relation is a list of entry ids'
      using errcode = '22023';
  else
    new_ids := array(
      select id from (
        select (e #>> '{}')::uuid as id, min(ord) as first
        from jsonb_array_elements(p_value) with ordinality as item(e, ord)
        group by 1
      ) ids order by first
    );
  end if;

  if exists (
    select unnest(new_ids)
    except
    select p.id from public.pages p where p.parent_id = target_database
  ) then
    raise exception 'set_page_property: only entries of the related database can be linked'
      using errcode = '22023';
  end if;

  -- Writers of an entry's relation values lock the entry first (here and
  -- for the other side below), so both sides change together.
  perform 1 from public.pages p where p.id = p_page_id for update;

  select v.value, v.client_updated_at, v.last_mutation_id into stored
  from public.page_property_values v
  where v.page_id = p_page_id and v.property_id = p_property_id;
  has_stored := found;

  if has_stored and (edited_at, p_mutation_id) <= (stored.client_updated_at, stored.last_mutation_id) then
    -- An older write (LWW), or this one again: nothing changes.
    return query select false, stored.client_updated_at, stored.last_mutation_id;
    return;
  end if;

  old_ids := case
    when has_stored and jsonb_typeof(stored.value) = 'array'
      then array(select (e #>> '{}')::uuid from jsonb_array_elements(stored.value) e)
    else '{}'
  end;
  changed_ids := array(
    select id from (select unnest(new_ids) except select unnest(old_ids)) added(id)
    union
    select id from (select unnest(old_ids) except select unnest(new_ids)) removed(id)
  );

  if exists (select 1 from unnest(changed_ids) id where not public.can_edit_page(id)) then
    raise exception 'set_page_property: linking or unlinking needs edit rights on the related entries'
      using errcode = '42501';
  end if;

  -- In a fixed order, so two writes linking each other's entries do not deadlock.
  perform 1 from public.pages p where p.id = any (changed_ids) order by p.id for update;

  insert into public.page_property_values as v (
    page_id, property_id, value, client_updated_at, last_mutation_id, updated_by, updated_at
  )
  values (
    p_page_id, p_property_id,
    case when cardinality(new_ids) = 0 then 'null'::jsonb else to_jsonb(new_ids::text[]) end,
    edited_at, p_mutation_id, (select auth.uid()), now()
  )
  on conflict (page_id, property_id) do update
  set
    value = excluded.value,
    client_updated_at = excluded.client_updated_at,
    last_mutation_id = excluded.last_mutation_id,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  -- The other side changes as a set: this entry is added or removed. Its
  -- edit time moves forward, so an older write of the whole list there
  -- (LWW) cannot undo the link without unlinking here as well.
  insert into public.page_property_values as v (
    page_id, property_id, value, client_updated_at, last_mutation_id, updated_by, updated_at
  )
  select added.id, paired_property, jsonb_build_array(page_json), edited_at, p_mutation_id, (select auth.uid()), now()
  from (select unnest(new_ids) except select unnest(old_ids)) as added(id)
  on conflict (page_id, property_id) do update
  set
    value = case
      when jsonb_typeof(v.value) <> 'array' then excluded.value
      when v.value @> excluded.value then v.value
      else v.value || excluded.value
    end,
    client_updated_at = greatest(v.client_updated_at, excluded.client_updated_at),
    last_mutation_id = case
      when excluded.client_updated_at >= v.client_updated_at then excluded.last_mutation_id
      else v.last_mutation_id
    end,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  update public.page_property_values as v
  set
    value = coalesce(
      (select jsonb_agg(e order by ord)
       from jsonb_array_elements(v.value) with ordinality as item(e, ord)
       where e <> page_json),
      'null'::jsonb
    ),
    client_updated_at = greatest(v.client_updated_at, edited_at),
    last_mutation_id = case when edited_at >= v.client_updated_at then p_mutation_id else v.last_mutation_id end,
    updated_by = (select auth.uid()),
    updated_at = now()
  where v.property_id = paired_property
    and v.page_id in (select unnest(old_ids) except select unnest(new_ids))
    and jsonb_typeof(v.value) = 'array';

  return query select true, edited_at, p_mutation_id;
end;
$$;

revoke execute on function public.set_relation_value(uuid, uuid, jsonb, jsonb, timestamptz, uuid)
  from public, anon, authenticated;

-- 5. set_page_property: as in 20261018200000_databases.sql, plus relations.
create or replace function public.set_page_property(
  p_page_id uuid,
  p_property_id uuid,
  p_value jsonb,
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
  property record;
begin
  if p_page_id is null
    or p_property_id is null
    or p_value is null
    or p_edited_at is null
    or p_mutation_id is null
  then
    raise exception 'set_page_property: all arguments are required'
      using errcode = '22004';
  end if;

  if not public.can_edit_page(p_page_id) then
    raise exception 'set_page_property: no edit rights on this page'
      using errcode = '42501';
  end if;

  select pr.type, pr.options into property
  from public.database_properties pr
  join public.pages p on p.parent_id = pr.database_id
  where pr.id = p_property_id and p.id = p_page_id;

  if not found then
    raise exception 'set_page_property: the property does not belong to the database of this page'
      using errcode = '22023';
  end if;

  if property.type = 'relation' then
    return query
      select * from public.set_relation_value(
        p_page_id, p_property_id, property.options, p_value, p_edited_at, p_mutation_id
      );
    return;
  end if;

  if not public.is_valid_property_value(property.type, property.options, p_value) then
    raise exception 'set_page_property: invalid value for a % property', property.type
      using errcode = '22023';
  end if;

  edited_at := least(p_edited_at, now());

  insert into public.page_property_values as stored (
    page_id, property_id, value, client_updated_at, last_mutation_id, updated_by, updated_at
  )
  values (p_page_id, p_property_id, p_value, edited_at, p_mutation_id, (select auth.uid()), now())
  on conflict (page_id, property_id) do update
  set
    value = excluded.value,
    client_updated_at = excluded.client_updated_at,
    last_mutation_id = excluded.last_mutation_id,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  where (excluded.client_updated_at, excluded.last_mutation_id)
    > (stored.client_updated_at, stored.last_mutation_id);

  if found then
    return query select true, edited_at, p_mutation_id;
  else
    return query
      select false, stored.client_updated_at, stored.last_mutation_id
      from public.page_property_values as stored
      where stored.page_id = p_page_id and stored.property_id = p_property_id;
  end if;
end;
$$;

revoke execute on function public.set_page_property(uuid, uuid, jsonb, timestamptz, uuid)
  from public, anon;
grant execute on function public.set_page_property(uuid, uuid, jsonb, timestamptz, uuid)
  to authenticated;

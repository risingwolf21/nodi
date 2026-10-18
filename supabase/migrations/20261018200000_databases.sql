-- Package 14a: databases like Notion (decisions 2026-10-18).
--   * A database is a page (kind 'database'); its entries are its
--     subpages: pages with their own document and with properties.
--     Rights, sections, sharing and the trash follow from parent_id.
--   * Properties exist only on entries of a database. Everyone with edit
--     rights on the database may create, change and delete properties
--     and views.
--   * Property values are written by RPC with last-write-wins per field
--     (like save_page_document, CLAUDE.md §8), so two devices changing
--     different properties of an entry keep both changes.
--   * Views: table, board, list, gallery, feed, calendar (map later).

-- 1. Kind and manual order of pages.
alter table public.pages
  add column kind text not null default 'page'
    check (kind in ('page', 'database')),
  -- Manual order (board, table); the client places a page between two
  -- others by taking the midpoint. Null: ordered by creation.
  add column position numeric;

-- The kind of a page is fixed: a page does not turn into a database or
-- back (its subpages would change their meaning).
create or replace function public.protect_page_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- No user context (service role, migrations, maintenance) or a trusted
  -- server function: no restriction.
  if (select auth.uid()) is null or current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.workspace_id is distinct from old.workspace_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.kind is distinct from old.kind
  then
    raise exception 'id, workspace_id, kind, created_by and created_at of a page cannot be changed'
      using errcode = '42501';
  end if;

  if new.parent_id is distinct from old.parent_id then
    raise exception 'Moving pages is not supported'
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

-- No databases inside databases for now: an entry is a page.
create or replace function public.require_page_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'database' and exists (
    select 1 from public.pages parent
    where parent.id = new.parent_id and parent.kind = 'database'
  ) then
    raise exception 'A database cannot be an entry of another database'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.require_page_kind() from public, anon, authenticated;

create trigger require_page_kind
before insert on public.pages
for each row
execute function public.require_page_kind();

-- Entries of a database are listed by parent and order.
create index pages_parent_position_idx
  on public.pages (parent_id, position)
  where parent_id is not null;

-- 2. Properties of a database.
create table public.database_properties (
  id uuid primary key default gen_random_uuid(),
  database_id uuid not null
    references public.pages (id) on delete cascade,
  name text not null
    check (char_length(btrim(name)) between 1 and 100),
  type text not null
    check (type in (
      'text', 'number', 'checkbox', 'select', 'multi_select', 'status',
      'date', 'url', 'email', 'created_time', 'last_edited_time'
    )),
  -- Type settings, e.g. {"options": [{"id", "name", "color"}]} for
  -- select, multi_select and status.
  options jsonb not null default '{}'::jsonb
    check (jsonb_typeof(options) = 'object'),
  position numeric not null default 0,
  created_at timestamptz not null default now()
);

create index database_properties_database_idx
  on public.database_properties (database_id, position);

-- 3. Views of a database (shared by everyone who can read it).
create table public.database_views (
  id uuid primary key default gen_random_uuid(),
  database_id uuid not null
    references public.pages (id) on delete cascade,
  name text not null
    check (char_length(btrim(name)) between 1 and 100),
  type text not null
    check (type in ('table', 'board', 'list', 'gallery', 'feed', 'calendar')),
  -- Filter, sort, grouping, visible properties; read by the client.
  config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(config) = 'object'),
  position numeric not null default 0,
  created_at timestamptz not null default now()
);

create index database_views_database_idx
  on public.database_views (database_id, position);

-- Properties and views belong to a database page.
create or replace function public.require_database_page()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.pages p
    where p.id = new.database_id and p.kind = 'database'
  ) then
    raise exception 'Properties and views belong to a database'
      using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' and new.database_id is distinct from old.database_id then
    raise exception 'A property or view cannot move to another database'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke execute on function public.require_database_page() from public, anon, authenticated;

create trigger require_database_page
before insert or update on public.database_properties
for each row
execute function public.require_database_page();

create trigger require_database_page
before insert or update on public.database_views
for each row
execute function public.require_database_page();

-- A new database starts with a table view.
create or replace function public.create_default_database_view()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.database_views (database_id, name, type)
  values (new.id, 'Tabelle', 'table');
  return null;
end;
$$;

revoke execute on function public.create_default_database_view() from public, anon, authenticated;

create trigger create_default_database_view
after insert on public.pages
for each row
when (new.kind = 'database')
execute function public.create_default_database_view();

alter table public.database_properties enable row level security;
alter table public.database_views enable row level security;

create policy "Readers of a database read its properties"
on public.database_properties
for select
to authenticated
using (public.can_read_page(database_id));

create policy "Editors of a database add properties"
on public.database_properties
for insert
to authenticated
with check (public.can_edit_page(database_id));

create policy "Editors of a database change properties"
on public.database_properties
for update
to authenticated
using (public.can_edit_page(database_id))
with check (public.can_edit_page(database_id));

create policy "Editors of a database delete properties"
on public.database_properties
for delete
to authenticated
using (public.can_edit_page(database_id));

create policy "Readers of a database read its views"
on public.database_views
for select
to authenticated
using (public.can_read_page(database_id));

create policy "Editors of a database add views"
on public.database_views
for insert
to authenticated
with check (public.can_edit_page(database_id));

create policy "Editors of a database change views"
on public.database_views
for update
to authenticated
using (public.can_edit_page(database_id))
with check (public.can_edit_page(database_id));

create policy "Editors of a database delete views"
on public.database_views
for delete
to authenticated
using (public.can_edit_page(database_id));

-- 4. Property values of entries, written only by set_page_property.
create table public.page_property_values (
  page_id uuid not null
    references public.pages (id) on delete cascade,
  property_id uuid not null
    references public.database_properties (id) on delete cascade,
  -- JSON null clears the value; the row keeps the edit order (LWW).
  value jsonb not null,
  client_updated_at timestamptz not null,
  last_mutation_id uuid not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (page_id, property_id)
);

create index page_property_values_property_idx
  on public.page_property_values (property_id);

alter table public.page_property_values enable row level security;

create policy "Readers of an entry read its property values"
on public.page_property_values
for select
to authenticated
using (public.can_read_page(page_id));

-- Writes go through set_page_property, so the LWW rule cannot be skipped.
revoke insert, update, delete on public.page_property_values from anon, authenticated;

-- A changed type makes the stored values meaningless: they are cleared.
create or replace function public.clear_values_on_type_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.page_property_values v
  where v.property_id = new.id;
  return null;
end;
$$;

revoke execute on function public.clear_values_on_type_change() from public, anon, authenticated;

create trigger clear_values_on_type_change
after update of type on public.database_properties
for each row
when (old.type is distinct from new.type)
execute function public.clear_values_on_type_change();

-- Whether a value fits a property; JSON null (cleared) always does.
create or replace function public.is_valid_property_value(
  p_type text,
  p_options jsonb,
  p_value jsonb
)
returns boolean
language plpgsql
-- Stable: parsing a timestamp depends on the session time zone.
stable
set search_path = ''
as $$
declare
  option_ids jsonb := coalesce(
    (select jsonb_agg(o -> 'id') from jsonb_array_elements(
      case when jsonb_typeof(p_options -> 'options') = 'array'
        then p_options -> 'options' else '[]'::jsonb end
    ) as o),
    '[]'::jsonb
  );
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return true;
  end if;

  case p_type
    when 'text' then
      return jsonb_typeof(p_value) = 'string'
        and char_length(p_value #>> '{}') <= 10000;
    when 'number' then
      return jsonb_typeof(p_value) = 'number';
    when 'checkbox' then
      return jsonb_typeof(p_value) = 'boolean';
    when 'select', 'status' then
      return jsonb_typeof(p_value) = 'string' and option_ids @> jsonb_build_array(p_value);
    when 'multi_select' then
      return jsonb_typeof(p_value) = 'array'
        and jsonb_array_length(p_value) <= 100
        and option_ids @> p_value
        and not exists (
          select 1 from jsonb_array_elements(p_value) e where jsonb_typeof(e) <> 'string'
        );
    when 'date' then
      -- {"start": "2026-10-18" or a timestamp, "end": same or null}
      return jsonb_typeof(p_value) = 'object'
        and jsonb_typeof(p_value -> 'start') = 'string'
        and pg_input_is_valid(p_value ->> 'start', 'timestamptz')
        and (
          p_value -> 'end' is null
          or jsonb_typeof(p_value -> 'end') = 'null'
          or (
            jsonb_typeof(p_value -> 'end') = 'string'
            and pg_input_is_valid(p_value ->> 'end', 'timestamptz')
          )
        );
    when 'url' then
      return jsonb_typeof(p_value) = 'string'
        and char_length(p_value #>> '{}') <= 2000
        and (p_value #>> '{}') ~* '^https?://';
    when 'email' then
      return jsonb_typeof(p_value) = 'string'
        and char_length(p_value #>> '{}') <= 320
        and (p_value #>> '{}') ~ '^[^@\s]+@[^@\s]+$';
    else
      -- created_time, last_edited_time: computed, not set by hand.
      return false;
  end case;
end;
$$;

revoke execute on function public.is_valid_property_value(text, jsonb, jsonb) from public, anon, authenticated;

-- Sets one property value of an entry, last-write-wins per field: the
-- write is applied only if (edit time, mutation id) is strictly greater
-- than the stored pair; edit times from the future are capped at now().
-- Errors: 42501 no edit rights, 22023 property not of this entry's
-- database or invalid value, 22004 missing argument.
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

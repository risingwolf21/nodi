-- Package 29: person and files properties (CLAUDE.md §12 P29).
--
-- 1. "person": a JSON array of user ids (at most 100); the app offers the
--    members of the workspace.
-- 2. "files": a JSON array of Storage paths in page-files (at most 100);
--    the app uploads into the folder of the entry (package 15).
--
-- Backward compatible: only the allowed values grow; apps from 14e on
-- leave the unknown types out.

alter table public.database_properties
  drop constraint database_properties_type_check,
  add constraint database_properties_type_check
    check (type in (
      'text', 'number', 'checkbox', 'select', 'multi_select', 'status',
      'date', 'url', 'email', 'place', 'formula', 'relation', 'rollup',
      'person', 'files', 'created_time', 'last_edited_time'
    ));

-- Whether a value fits a property; JSON null (cleared) always does.
-- Same as in 20261018220000_place_property_and_map_view.sql, plus "person"
-- and "files".
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
    when 'place' then
      -- Step by step: SQL does not promise the order of "and", and
      -- jsonb_object_keys or the casts would raise on other shapes.
      if jsonb_typeof(p_value) <> 'object' then
        return false;
      end if;
      -- Only the known keys, so the value stays small and predictable.
      if exists (
        select 1 from jsonb_object_keys(p_value) k where k not in ('lat', 'lng', 'label')
      ) then
        return false;
      end if;
      if jsonb_typeof(p_value -> 'lat') is distinct from 'number'
        or jsonb_typeof(p_value -> 'lng') is distinct from 'number' then
        return false;
      end if;
      return (p_value ->> 'lat')::numeric between -90 and 90
        and (p_value ->> 'lng')::numeric between -180 and 180
        and (
          jsonb_typeof(p_value -> 'label') is null
          or jsonb_typeof(p_value -> 'label') = 'null'
          or (
            jsonb_typeof(p_value -> 'label') = 'string'
            and char_length(p_value ->> 'label') <= 500
          )
        );
    when 'person' then
      -- User ids, as Notion's person property. They are not checked
      -- against the members: an id reveals nothing, and the app shows only
      -- members it knows.
      return jsonb_typeof(p_value) = 'array'
        and jsonb_array_length(p_value) <= 100
        and not exists (
          select 1 from jsonb_array_elements(p_value) e
          where jsonb_typeof(e) <> 'string'
            or (e #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        );
    when 'files' then
      -- Storage paths of the bucket page-files (<page>/<id>-<name>, as the
      -- app writes them). Reading a file is checked by Storage against the
      -- page in its path, so a path of another page reveals nothing.
      return jsonb_typeof(p_value) = 'array'
        and jsonb_array_length(p_value) <= 100
        and not exists (
          select 1 from jsonb_array_elements(p_value) e
          where jsonb_typeof(e) <> 'string'
            or (e #>> '{}') !~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
              || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,100}$')
        );
    else
      -- created_time, last_edited_time: computed, not set by hand.
      return false;
  end case;
end;
$$;

revoke execute on function public.is_valid_property_value(text, jsonb, jsonb) from public, anon, authenticated;

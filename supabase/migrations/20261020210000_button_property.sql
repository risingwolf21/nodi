-- Package 32f: button properties, like Notion's "edit pages" button. A
-- click sets values of the entry; the app does that with set_page_property,
-- so the usual rights and checks apply. A button has no stored value of its
-- own (is_valid_property_value rejects every value of a type it does not
-- list, so set_page_property answers 22023).
--
-- options: {"label": text up to 100 characters, "actions": [up to 10 of
-- {"propertyId": text, "value": any JSON} or {"propertyId": text,
-- "today": true}]}; both are missing while the button is being set up.
--
-- Backward compatible: only the allowed values grow; apps from 14e on leave
-- the unknown type out.

alter table public.database_properties
  drop constraint database_properties_type_check,
  add constraint database_properties_type_check
    check (type in (
      'text', 'number', 'checkbox', 'select', 'multi_select', 'status',
      'date', 'url', 'email', 'place', 'formula', 'relation', 'rollup',
      'person', 'files', 'button', 'created_time', 'last_edited_time'
    ));

-- Only the form; the values are checked when a click sets them.
create or replace function public.is_valid_button_options(p_options jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_options -> 'label' is not null
    and (jsonb_typeof(p_options -> 'label') <> 'string' or char_length(p_options ->> 'label') > 100) then
    return false;
  end if;
  if p_options -> 'actions' is null then
    return true;
  end if;
  if jsonb_typeof(p_options -> 'actions') <> 'array' or jsonb_array_length(p_options -> 'actions') > 10 then
    return false;
  end if;
  return not exists (
    select 1 from jsonb_array_elements(p_options -> 'actions') action
    where jsonb_typeof(action) <> 'object'
      or jsonb_typeof(action -> 'propertyId') is distinct from 'string'
  );
end;
$$;

alter table public.database_properties
  add constraint database_properties_button_options_check
    check (type <> 'button' or public.is_valid_button_options(options));

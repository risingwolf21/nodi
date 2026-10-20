-- Package 24: rollup properties (CLAUDE.md §12 P24).
--
-- A rollup reads a property of the entries a relation links and computes
-- one value (count, sum, average, ...), in the app like formulas. Its
-- settings sit in options: {"relationPropertyId", "targetPropertyId",
-- "function"}; all three are missing while the rollup is being set up.
-- It has no stored values: is_valid_property_value rejects every value of
-- a type it does not list, so set_page_property answers 22023.
--
-- Backward compatible: only the allowed values grow; apps from 14e on
-- leave the unknown type out.

alter table public.database_properties
  drop constraint database_properties_type_check,
  add constraint database_properties_type_check
    check (type in (
      'text', 'number', 'checkbox', 'select', 'multi_select', 'status',
      'date', 'url', 'email', 'place', 'formula', 'relation', 'rollup',
      'created_time', 'last_edited_time'
    ));

alter table public.database_properties
  add constraint database_properties_rollup_options_check
    check (
      type <> 'rollup'
      or (
        (options -> 'relationPropertyId' is null or jsonb_typeof(options -> 'relationPropertyId') = 'string')
        and (options -> 'targetPropertyId' is null or jsonb_typeof(options -> 'targetPropertyId') = 'string')
        and (
          options -> 'function' is null
          or options ->> 'function' in (
            'show_original', 'count_all', 'count_values', 'count_unique', 'count_empty',
            'count_not_empty', 'percent_empty', 'percent_not_empty', 'sum', 'average',
            'median', 'min', 'max', 'range', 'earliest', 'latest', 'checked', 'unchecked',
            'percent_checked'
          )
        )
      )
    );

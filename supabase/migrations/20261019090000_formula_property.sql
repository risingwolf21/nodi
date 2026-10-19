-- Package 14f-a: formula properties (CLAUDE.md §12 P14).
--
-- A formula is stored as text in options ({"expression": "..."}); the app
-- computes the result for each entry (Notion syntax, decision of the user).
-- Like created_time and last_edited_time it has no stored values:
-- is_valid_property_value already rejects every value for types it does not
-- list, so set_page_property answers 22023.
--
-- Backward compatible: only the allowed values grow.

alter table public.database_properties
  drop constraint database_properties_type_check,
  add constraint database_properties_type_check
    check (type in (
      'text', 'number', 'checkbox', 'select', 'multi_select', 'status',
      'date', 'url', 'email', 'place', 'formula', 'created_time', 'last_edited_time'
    ));

-- The expression is optional while the formula is being set up; when given,
-- it is text of reasonable length.
alter table public.database_properties
  add constraint database_properties_formula_expression_check
    check (
      type <> 'formula'
      or options -> 'expression' is null
      or (
        jsonb_typeof(options -> 'expression') = 'string'
        and char_length(options ->> 'expression') <= 2000
      )
    );

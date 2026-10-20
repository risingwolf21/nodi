-- Package 32d: the view type "timeline" (entries as bars from the start to
-- the end of a date property, like Notion's timeline), for databases and
-- for database blocks.
--
-- Backward compatible: only the allowed values grow; apps from 14e on
-- leave the unknown view type out.

alter table public.database_views
  drop constraint database_views_type_check,
  add constraint database_views_type_check
    check (type in ('table', 'board', 'list', 'gallery', 'feed', 'calendar', 'map', 'timeline'));

alter table public.block_views
  drop constraint block_views_type_check,
  add constraint block_views_type_check
    check (type in ('table', 'board', 'list', 'gallery', 'feed', 'calendar', 'map', 'timeline'));

-- Per-page display setting "Volle Breite" (package 10, like Notion's
-- "Full width"). Synced across devices; changeable by everyone who may
-- edit the page (existing update policy). Additive and backward
-- compatible: older clients do not select or write the column.
alter table public.pages
  add column full_width boolean not null default false;

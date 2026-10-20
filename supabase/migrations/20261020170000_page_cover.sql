-- Package 30c: cover images of pages, like Notion.
--
-- pages.cover is null, a color gradient of the app ("gradient:<name>") or a
-- file of the bucket page-files ("nodi-file:<page>/<id>-<name>", package
-- 15). Whoever may edit the page may change it (RLS on pages, as for the
-- icon). A file of another page reveals nothing: Storage checks the page in
-- its path when the image is read.
--
-- Backward compatible: a new nullable column only.

alter table public.pages
  add column cover text,
  add constraint pages_cover_check check (
    cover is null
    or cover ~ '^gradient:[a-z]{1,20}$'
    or cover ~ ('^nodi-file:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
      || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,100}$')
  );

-- Package 38a: page templates and a default template per database
-- (decision of the user, 2026-10-26: whoever may edit a page may make it a
-- template, as with entry templates in package 26).
--
-- - is_template: any page can be a template, not only entries of a
--   database; a database cannot (22023). A page template stays in the page
--   tree; the app applies it to a new, empty page (text, title, icon,
--   cover) through the usual save path, so no copy function is needed.
--   Moving a template into or out of a database keeps it a template (entry
--   template ↔ page template).
-- - create_entry_from_template only takes templates in a database (22023),
--   since a page template has no database to add the entry to.
-- - pages.default_template_id: the template "Neu" uses in a database. Only
--   on databases and only a template entry of that database (22023);
--   changed like any setting of the page (edit rights). Deleting the
--   template clears it. A template that is no longer one (or moved away)
--   stays referenced; the app then creates empty entries.
--
-- Backward compatible: a new nullable column, a relaxed trigger and a
-- stricter check in a function only the app calls. Apps before 38 show
-- page templates as ordinary pages.

alter table public.pages
  add column default_template_id uuid references public.pages (id) on delete set null;

create index pages_default_template_idx on public.pages (default_template_id)
  where default_template_id is not null;

create or replace function public.require_template_in_database()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_template and new.kind = 'database' then
    raise exception 'A database cannot be a template' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- The default template: a template entry of this database.
create or replace function public.require_default_template_of_database()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.default_template_id is null then
    return new;
  end if;
  if new.kind <> 'database' or not exists (
    select 1 from public.pages template
    where template.id = new.default_template_id
      and template.parent_id = new.id
      and template.is_template
  ) then
    raise exception 'The default template must be a template of this database' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger require_default_template_of_database
before insert or update of default_template_id on public.pages
for each row execute function public.require_default_template_of_database();

create or replace function public.create_entry_from_template(p_template_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  template record;
begin
  if p_template_id is null then
    raise exception 'create_entry_from_template: the template is required' using errcode = '22004';
  end if;

  select p.parent_id, p.is_template, p.is_archived, parent.kind as parent_kind into template
  from public.pages p
  left join public.pages parent on parent.id = p.parent_id
  where p.id = p_template_id and public.can_read_page(p.id);

  if not found or not template.is_template or template.is_archived
    or template.parent_kind is distinct from 'database'
  then
    raise exception 'create_entry_from_template: not a template of a database' using errcode = '22023';
  end if;
  if not public.can_edit_page(template.parent_id) then
    raise exception 'create_entry_from_template: no edit rights on the database' using errcode = '42501';
  end if;

  return public.copy_recurring_entry(p_template_id, null, null);
end;
$$;

revoke execute on function public.create_entry_from_template(uuid) from public, anon;
grant execute on function public.create_entry_from_template(uuid) to authenticated;

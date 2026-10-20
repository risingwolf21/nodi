-- Package 26: templates of database entries (CLAUDE.md §12 P26).
--
-- A template is an entry marked is_template: it has text and property
-- values like any entry, the app keeps it out of the views and offers it
-- under "Vorlagen". create_entry_from_template copies it into a new entry
-- (copy_recurring_entry, package 25: title, icon, values, text). A
-- recurring template makes entries from it (package 25 as well).
--
-- Backward compatible: a new column with a default and a new function.
-- Apps before package 26 show templates as ordinary entries.

alter table public.pages add column is_template boolean not null default false;

-- Only entries of a database are templates.
create or replace function public.require_template_in_database()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_template and not exists (
    select 1 from public.pages parent where parent.id = new.parent_id and parent.kind = 'database'
  ) then
    raise exception 'Only entries of a database are templates' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger require_template_in_database
before insert or update of is_template, parent_id on public.pages
for each row execute function public.require_template_in_database();

-- A new entry from a template, at the end of its database; returns its id.
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

  select p.parent_id, p.is_template, p.is_archived into template
  from public.pages p
  where p.id = p_template_id and public.can_read_page(p.id);

  if not found or not template.is_template or template.is_archived then
    raise exception 'create_entry_from_template: not a template' using errcode = '22023';
  end if;
  if not public.can_edit_page(template.parent_id) then
    raise exception 'create_entry_from_template: no edit rights on the database' using errcode = '42501';
  end if;

  return public.copy_recurring_entry(p_template_id, null, null);
end;
$$;

revoke execute on function public.create_entry_from_template(uuid) from public, anon;
grant execute on function public.create_entry_from_template(uuid) to authenticated;

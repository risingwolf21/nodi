-- Repairs data left by the old trash bug (package 3): an active page whose
-- parent is archived is invisible in the tree and would be deleted with
-- the parent. Decision (user, 2026-10-18): like restoring in the app
-- (variant A), the archived ancestors of such pages are restored.

-- Restores every archived ancestor of an active page and returns how many
-- pages it restored. Running it again changes nothing. The depth limit
-- guards against parent cycles (moving has no cycle check).
create or replace function public.restore_archived_ancestors_of_active_pages()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  restored integer;
begin
  with recursive archived_ancestor as (
    select parent.id, parent.parent_id, 1 as depth
    from public.pages child
    join public.pages parent on parent.id = child.parent_id
    where not child.is_archived
      and parent.is_archived

    union

    select grandparent.id, grandparent.parent_id, ancestor.depth + 1
    from archived_ancestor ancestor
    join public.pages grandparent on grandparent.id = ancestor.parent_id
    where grandparent.is_archived
      and ancestor.depth < 50
  )
  update public.pages p
  set is_archived = false
  where p.id in (select id from archived_ancestor);

  get diagnostics restored = row_count;
  return restored;
end;
$$;

-- Maintenance only: not callable through the API.
revoke execute on function public.restore_archived_ancestors_of_active_pages()
  from public, anon, authenticated;

do $$
declare
  restored integer := public.restore_archived_ancestors_of_active_pages();
begin
  raise notice 'restore_archived_ancestors: % archived ancestor page(s) restored', restored;
end;
$$;

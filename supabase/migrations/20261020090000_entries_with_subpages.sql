-- Package 23: entries of databases have subpages (decision of the user,
-- CLAUDE.md §12 P23). The app shows them in the entry; a page with subpages
-- may now become an entry (it keeps them).
--
-- move_page is unchanged otherwise (20261019180000_move_page.sql): rights,
-- workspace, trash, cycles, sections, values of entries that leave.
--
-- Backward compatible: older apps check the same rule themselves and only
-- offer less.

create or replace function public.move_page(p_page_id uuid, p_parent_id uuid, p_section text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  moving record;
  parent record;
  old_database uuid;
  new_database uuid;
  target_section text;
  new_position numeric;
  target record;
begin
  if p_page_id is null or (p_parent_id is null and p_section is null) then
    raise exception 'move_page: the page and a parent or a section are required'
      using errcode = '22004';
  end if;

  if not public.can_edit_page(p_page_id) then
    raise exception 'move_page: no edit rights on this page'
      using errcode = '42501';
  end if;

  select p.id, p.workspace_id, p.owner_id, p.visibility, p.kind, p.parent_id, p.is_archived, p.position
  into moving
  from public.pages p
  where p.id = p_page_id;

  if moving.is_archived then
    raise exception 'move_page: a page in the trash cannot be moved'
      using errcode = '22023';
  end if;

  if p_parent_id is not null then
    if not public.can_edit_page(p_parent_id) then
      raise exception 'move_page: no edit rights on the new parent'
        using errcode = '42501';
    end if;

    select p.workspace_id, p.visibility, p.kind, p.is_archived into parent
    from public.pages p
    where p.id = p_parent_id;

    if parent.workspace_id <> moving.workspace_id or parent.is_archived then
      raise exception 'move_page: the new parent must be an active page of the same workspace'
        using errcode = '22023';
    end if;

    -- No cycles: the new parent is neither the page nor below it.
    if exists (
      with recursive ancestors as (
        select p_parent_id as id, 0 as depth
        union all
        select p.parent_id, ancestors.depth + 1
        from ancestors
        join public.pages p on p.id = ancestors.id
        where p.parent_id is not null and ancestors.depth < 50
      )
      select 1 from ancestors where id = p_page_id
    ) then
      raise exception 'move_page: a page cannot be moved below itself'
        using errcode = '22023';
    end if;

    if parent.kind = 'database' then
      if moving.kind = 'database' then
        raise exception 'move_page: a database cannot be an entry of another database'
          using errcode = '22023';
      end if;
      new_database := p_parent_id;
    end if;

    target_section := parent.visibility;
  else
    if p_section not in ('workspace', 'private') then
      raise exception 'move_page: section must be workspace or private'
        using errcode = '22023';
    end if;
    target_section := p_section;
  end if;

  if target_section <> moving.visibility and moving.owner_id <> caller then
    raise exception 'move_page: only the owner of the page can move it to another section'
      using errcode = '42501';
  end if;

  select p.id into old_database
  from public.pages p
  where p.id = moving.parent_id and p.kind = 'database';

  -- 1. To private: the subtree first, from the leaves up (as set_page_section),
  --    so the section rule holds at every step. Private pages of others stay.
  if target_section = 'private' and moving.visibility <> 'private' then
    for target in
      with recursive subtree as (
        select p.id, 0 as depth from public.pages p where p.id = p_page_id
        union all
        select child.id, subtree.depth + 1
        from subtree
        join public.pages child on child.parent_id = subtree.id
        where subtree.depth < 50
          and not (child.visibility = 'private' and child.owner_id <> caller)
      )
      select id from subtree order by depth desc
    loop
      update public.pages p
      set visibility = 'private', owner_id = caller
      where p.id = target.id
        and (p.visibility <> 'private' or p.owner_id <> caller);
    end loop;
  end if;

  -- 2. An entry that leaves its database loses the values of its properties;
  --    its relations are unlinked on the other side as well.
  if old_database is not null and old_database is distinct from new_database then
    update public.page_property_values as other
    set
      value = coalesce(
        (select jsonb_agg(e order by ord)
         from jsonb_array_elements(other.value) with ordinality as item(e, ord)
         where e <> to_jsonb(p_page_id::text)),
        'null'::jsonb
      ),
      updated_by = caller,
      updated_at = now()
    from public.page_property_values own
    join public.database_properties pr on pr.id = own.property_id and pr.type = 'relation'
    where own.page_id = p_page_id
      and jsonb_typeof(own.value) = 'array'
      and other.property_id = (pr.options ->> 'pairedPropertyId')::uuid
      and own.value @> to_jsonb(array[other.page_id::text])
      and jsonb_typeof(other.value) = 'array';

    delete from public.page_property_values v where v.page_id = p_page_id;
  end if;

  -- 3. The move itself. A new entry goes to the end of its database; other
  --    pages are ordered by creation.
  if new_database is not null and new_database is distinct from old_database then
    select coalesce(max(p.position) + 1, 0) into new_position
    from public.pages p
    where p.parent_id = new_database;
  elsif new_database is not null then
    new_position := moving.position;
  else
    new_position := null;
  end if;

  update public.pages p
  set parent_id = p_parent_id, position = new_position
  where p.id = p_page_id;

  -- 4. To the workspace: from the root down, after the move (the new parent
  --    is shared, or the page is at the top). Private pages of others stay.
  if target_section = 'workspace' and moving.visibility <> 'workspace' then
    for target in
      with recursive subtree as (
        select p.id, 0 as depth from public.pages p where p.id = p_page_id
        union all
        select child.id, subtree.depth + 1
        from subtree
        join public.pages child on child.parent_id = subtree.id
        where subtree.depth < 50
          and not (child.visibility = 'private' and child.owner_id <> caller)
      )
      select id from subtree order by depth
    loop
      update public.pages p
      set visibility = 'workspace'
      where p.id = target.id and p.visibility <> 'workspace';
    end loop;
  end if;
end;
$$;

revoke execute on function public.move_page(uuid, uuid, text) from public, anon;
grant execute on function public.move_page(uuid, uuid, text) to authenticated;

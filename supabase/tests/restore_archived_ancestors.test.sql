begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email)
values ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test');

insert into public.workspaces (id, name, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Workspace', '11111111-1111-4111-8111-111111111111');

-- A (archived) > B (archived) > C (active): invisible C, A and B come back
-- D (archived) > E (archived): a branch in the trash stays there
-- F (active) > G (archived): a subpage in the trash stays there
-- H (archived) > I (active) > J (archived): H comes back, J stays
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, is_archived)
select v.id::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v.parent_id::uuid,
       '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
       v.title, v.is_archived
from (values
  ('a0000000-0000-4000-8000-00000000000a', null, 'A', true),
  ('a0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-00000000000a', 'B', true),
  ('a0000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-00000000000b', 'C', false),
  ('a0000000-0000-4000-8000-00000000000d', null, 'D', true),
  ('a0000000-0000-4000-8000-00000000000e', 'a0000000-0000-4000-8000-00000000000d', 'E', true),
  ('a0000000-0000-4000-8000-00000000000f', null, 'F', false),
  ('a0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-00000000000f', 'G', true),
  ('a0000000-0000-4000-8000-000000000011', null, 'H', true),
  ('a0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000011', 'I', false),
  ('a0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000012', 'J', true)
) as v(id, parent_id, title, is_archived)
order by v.title;

select is(public.restore_archived_ancestors_of_active_pages(), 3, 'Restores the archived ancestors of active pages');

select set_eq(
  $$select title from public.pages where not is_archived$$,
  array['A', 'B', 'C', 'F', 'H', 'I'],
  'Active pages and their restored ancestors are visible'
);

select set_eq(
  $$select title from public.pages where is_archived$$,
  array['D', 'E', 'G', 'J'],
  'Pages in the trash without an active descendant stay there'
);

select is(public.restore_archived_ancestors_of_active_pages(), 0, 'Running it again changes nothing');

-- A parent cycle in the trash (possible while moving has no cycle check),
-- D <-> E, with an active subpage K: ends at the depth limit
update public.pages set parent_id = 'a0000000-0000-4000-8000-00000000000e'
where id = 'a0000000-0000-4000-8000-00000000000d';
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title)
values ('a0000000-0000-4000-8000-000000000014', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'a0000000-0000-4000-8000-00000000000e', '11111111-1111-4111-8111-111111111111',
        '11111111-1111-4111-8111-111111111111', 'K');

select is(public.restore_archived_ancestors_of_active_pages(), 2, 'A parent cycle does not loop forever');

select set_eq(
  $$select title from public.pages where is_archived$$,
  array['G', 'J'],
  'Both pages of the cycle are restored'
);

-- Not part of the API
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select throws_ok(
  $$select public.restore_archived_ancestors_of_active_pages()$$,
  '42501', null, 'Signed-in users cannot call it'
);

set local role anon;

select throws_ok(
  $$select public.restore_archived_ancestors_of_active_pages()$$,
  '42501', null, 'Anonymous users cannot call it'
);

select * from finish();

rollback;

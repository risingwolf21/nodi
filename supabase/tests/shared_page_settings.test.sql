begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

-- Owner with a workspace; editor and viewer by share, not members
insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test'),
  ('22222222-2222-4222-8222-222222222222', 'editor@nodi.test'),
  ('33333333-3333-4333-8333-333333333333', 'viewer@nodi.test');

insert into public.workspaces (id, name, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Workspace', '11111111-1111-4111-8111-111111111111');

-- A > B: the share on A is inherited by B
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title)
values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'A'),
  ('a0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'B');

insert into public.page_shares (page_id, shared_with_user_id, permission, created_by)
values
  ('a0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'edit',
   '11111111-1111-4111-8111-111111111111'),
  ('a0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'read',
   '11111111-1111-4111-8111-111111111111');

set local role authenticated;

-- 1-2: an editor by share renames and sets the icon, also of an inherited subpage
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select results_eq(
  $$update public.pages set title = 'A neu', icon = '📎'
    where id = 'a0000000-0000-4000-8000-000000000001' returning title, icon$$,
  $$values ('A neu'::text, '📎'::text)$$,
  'An editor by share changes title and icon'
);

select results_eq(
  $$update public.pages set title = 'B neu'
    where id = 'a0000000-0000-4000-8000-000000000002' returning title$$,
  $$values ('B neu'::text)$$,
  'An inherited edit share covers subpages'
);

-- 3: but cannot change who owns or sees the page
select throws_ok(
  $$update public.pages set visibility = 'private'
    where id = 'a0000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'An editor by share cannot change the visibility'
);

-- 4-5: a viewer by share changes nothing
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';

select is_empty(
  $$update public.pages set title = 'Hack'
    where id = 'a0000000-0000-4000-8000-000000000001' returning id$$,
  'A viewer by share cannot rename the page'
);

select is(
  (select title from public.pages where id = 'a0000000-0000-4000-8000-000000000001'),
  'A neu',
  'The title stays as the editor set it'
);

select * from finish();

rollback;

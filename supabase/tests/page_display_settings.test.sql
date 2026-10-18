begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

-- Users: owner, workspace member (editor), read-only share recipient
insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test'),
  ('22222222-2222-4222-8222-222222222222', 'member@nodi.test'),
  ('33333333-3333-4333-8333-333333333333', 'reader@nodi.test');

insert into public.workspaces (id, name, owner_id)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Workspace',
  '11111111-1111-4111-8111-111111111111'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222',
  'member'
);

insert into public.pages (id, workspace_id, owner_id, created_by, title, visibility)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111',
   '11111111-1111-4111-8111-111111111111',
   'Shared page', 'workspace'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111',
   '11111111-1111-4111-8111-111111111111',
   'Read-only page', 'private');

insert into public.page_shares (page_id, shared_with_user_id, permission, created_by)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '33333333-3333-4333-8333-333333333333',
  'read',
  '11111111-1111-4111-8111-111111111111'
);

select is(
  (select full_width from public.pages where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  false,
  'Pages start with the normal width'
);

-- As workspace member with edit rights
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

update public.pages set full_width = true
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

select is(
  (select full_width from public.pages where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  true,
  'An editor can switch a page to full width'
);

-- As read-only share recipient: RLS lets the update match no row
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';

select is_empty(
  $$update public.pages set full_width = true
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    returning id$$,
  'A reader cannot change the width'
);

select is(
  (select full_width from public.pages where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  false,
  'The width of the read-only page is unchanged'
);

select * from finish();

rollback;

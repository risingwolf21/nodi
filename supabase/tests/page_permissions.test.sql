begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

-- Test users
insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test'),
  ('22222222-2222-4222-8222-222222222222', 'recipient@nodi.test');

-- Workspace and private page
insert into public.workspaces (id, name, owner_id)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Test Workspace',
  '11111111-1111-4111-8111-111111111111'
);

insert into public.pages (
  id,
  workspace_id,
  owner_id,
  created_by,
  title,
  visibility
)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'Private page',
  'private'
);

insert into public.page_documents (page_id, document)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '[{"type":"paragraph","content":[{"type":"text","text":"Secret"}]}]'::jsonb
);

-- Test as owner
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select is(
  (select count(*) from public.pages
   where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  1::bigint,
  'Owner can read their private page'
);

select is(
  (select count(*) from public.page_documents
   where page_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  1::bigint,
  'Owner can read the page document'
);

-- Test as an unrelated user
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select is(
  (select count(*) from public.pages
   where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  0::bigint,
  'Unshared private page is hidden from another user'
);

select is(
  (select count(*) from public.page_documents
   where page_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  0::bigint,
  'Unshared document is hidden from another user'
);

-- Simulate the owner creating a read-only share.
reset role;

insert into public.page_shares (
  page_id,
  shared_with_user_id,
  permission,
  created_by
)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '22222222-2222-4222-8222-222222222222',
  'read',
  '11111111-1111-4111-8111-111111111111'
);

-- Recipient can now read but cannot edit.
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select is(
  (select count(*) from public.pages
   where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  1::bigint,
  'Recipient can read a shared page'
);

select is(
  public.can_edit_page(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ),
  false,
  'Read-only recipient cannot edit the page'
);

select * from finish();

rollback;
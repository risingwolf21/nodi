begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

-- Test users: workspace owner, workspace member
insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test'),
  ('22222222-2222-4222-8222-222222222222', 'member@nodi.test');

-- Workspace of the owner, with the second user as member
insert into public.workspaces (id, name, owner_id)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Owner Workspace',
  '11111111-1111-4111-8111-111111111111'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222',
  'member'
);

-- Second workspace owned by the member (target for a workspace move)
insert into public.workspaces (id, name, owner_id)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'Member Workspace',
  '22222222-2222-4222-8222-222222222222'
);

-- Workspace-visible page owned by the owner
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
  'Shared page',
  'workspace'
);

-- Test as workspace member
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select lives_ok(
  $$update public.pages
    set title = 'Renamed by member', is_archived = true
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  'Member can rename and archive a workspace page'
);

select throws_ok(
  $$update public.pages
    set visibility = 'private'
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  '42501',
  null,
  'Member cannot change the visibility of another user''s page'
);

select throws_ok(
  $$update public.pages
    set owner_id = '22222222-2222-4222-8222-222222222222'
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  '42501',
  null,
  'Member cannot take over ownership of another user''s page'
);

select throws_ok(
  $$update public.pages
    set workspace_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  '42501',
  null,
  'Member cannot move a page into another workspace'
);

-- Server sets audit fields; documents are written only through the RPC,
-- which runs with definer rights but must still record the caller
select lives_ok(
  $$select * from public.save_page_document(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '[]'::jsonb,
      now() - interval '1 minute',
      '00000000-0000-4000-8000-000000000001')$$,
  'Member can save the document through the RPC'
);

select is(
  (select updated_by from public.page_documents
   where page_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  '22222222-2222-4222-8222-222222222222'::uuid,
  'updated_by is the authenticated user, not the function owner'
);

select is(
  (select updated_at from public.page_documents
   where page_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  now(),
  'updated_at is the server time'
);

-- Test as page owner
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select throws_ok(
  $$update public.pages
    set workspace_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  '42501',
  null,
  'Owner cannot move a page into another workspace either'
);

select lives_ok(
  $$update public.pages
    set visibility = 'private'
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  'Owner can change the visibility of their page'
);

select is(
  (select visibility from public.pages
   where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'private',
  'Visibility change by the owner is stored'
);

select * from finish();

rollback;

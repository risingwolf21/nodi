begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

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

-- Server sets audit fields, client values are ignored
insert into public.page_documents (page_id, document, updated_at, updated_by)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '[]'::jsonb,
  '2000-01-01T00:00:00Z',
  '11111111-1111-4111-8111-111111111111'
);

select is(
  (select updated_by from public.page_documents
   where page_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  '22222222-2222-4222-8222-222222222222'::uuid,
  'Insert: updated_by is the authenticated user, not the client value'
);

select is(
  (select updated_at from public.page_documents
   where page_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  now(),
  'Insert: updated_at is the server time, not the client value'
);

-- Same statement shape as the editor's upsert via PostgREST
insert into public.page_documents (page_id, document, updated_at, updated_by)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '[{"type":"paragraph"}]'::jsonb,
  '2000-01-01T00:00:00Z',
  '11111111-1111-4111-8111-111111111111'
)
on conflict (page_id) do update
set document = excluded.document,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

select is(
  (select updated_by from public.page_documents
   where page_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  '22222222-2222-4222-8222-222222222222'::uuid,
  'Upsert: updated_by is the authenticated user, not the client value'
);

select is(
  (select updated_at from public.page_documents
   where page_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  now(),
  'Upsert: updated_at is the server time, not the client value'
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

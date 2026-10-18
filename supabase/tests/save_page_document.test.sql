begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

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
  -- editable by the member
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111',
   '11111111-1111-4111-8111-111111111111',
   'Shared page', 'workspace'),
  -- private, shared read-only with the reader
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111',
   '11111111-1111-4111-8111-111111111111',
   'Read-only page', 'private'),
  -- target of the rejected direct writes
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111',
   '11111111-1111-4111-8111-111111111111',
   'Legacy page', 'workspace');

insert into public.page_shares (page_id, shared_with_user_id, permission, created_by)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '33333333-3333-4333-8333-333333333333',
  'read',
  '11111111-1111-4111-8111-111111111111'
);

-- As workspace member
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

-- 1-3: first save creates the document
select results_eq(
  $$select applied, stored_edited_at, stored_mutation_id
    from public.save_page_document(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '[{"type":"paragraph","content":"v1"}]'::jsonb,
      now() - interval '30 minutes',
      '00000000-0000-4000-8000-000000000001')$$,
  $$values (true, now() - interval '30 minutes',
            '00000000-0000-4000-8000-000000000001'::uuid)$$,
  'First save is applied'
);

select is(
  (select document from public.page_documents
   where page_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  '[{"type":"paragraph","content":"v1"}]'::jsonb,
  'First save stores the document'
);

select is(
  (select updated_by from public.page_documents
   where page_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  '22222222-2222-4222-8222-222222222222'::uuid,
  'updated_by is set to the caller'
);

-- 4: a newer edit wins
select results_eq(
  $$select applied, stored_mutation_id
    from public.save_page_document(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '[{"type":"paragraph","content":"v2"}]'::jsonb,
      now() - interval '20 minutes',
      '00000000-0000-4000-8000-000000000002')$$,
  $$values (true, '00000000-0000-4000-8000-000000000002'::uuid)$$,
  'Newer edit time is applied'
);

-- 5-6: an older, delayed write does not overwrite the newer state
select results_eq(
  $$select applied, stored_edited_at, stored_mutation_id
    from public.save_page_document(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '[{"type":"paragraph","content":"stale"}]'::jsonb,
      now() - interval '25 minutes',
      '00000000-0000-4000-8000-000000000003')$$,
  $$values (false, now() - interval '20 minutes',
            '00000000-0000-4000-8000-000000000002'::uuid)$$,
  'Older edit time is rejected and the stored state is returned'
);

select is(
  (select document from public.page_documents
   where page_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  '[{"type":"paragraph","content":"v2"}]'::jsonb,
  'Rejected write leaves the document unchanged'
);

-- 7-8: equal edit time, the higher mutation id wins
select results_eq(
  $$select applied
    from public.save_page_document(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '[{"type":"paragraph","content":"lower id"}]'::jsonb,
      now() - interval '20 minutes',
      '00000000-0000-4000-8000-000000000000')$$,
  $$values (false)$$,
  'Equal edit time with lower mutation id is rejected'
);

select results_eq(
  $$select applied
    from public.save_page_document(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '[{"type":"paragraph","content":"higher id"}]'::jsonb,
      now() - interval '20 minutes',
      '00000000-0000-4000-8000-000000000009')$$,
  $$values (true)$$,
  'Equal edit time with higher mutation id is applied'
);

-- 9: replaying the same mutation is a no-op that reports the own id
select results_eq(
  $$select applied, stored_mutation_id
    from public.save_page_document(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '[{"type":"paragraph","content":"higher id"}]'::jsonb,
      now() - interval '20 minutes',
      '00000000-0000-4000-8000-000000000009')$$,
  $$values (false, '00000000-0000-4000-8000-000000000009'::uuid)$$,
  'Replayed mutation is not applied twice and reports its own id as stored'
);

-- 10-11: edit times from the future are capped at the server time
select results_eq(
  $$select applied, stored_edited_at
    from public.save_page_document(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '[{"type":"paragraph","content":"future"}]'::jsonb,
      now() + interval '1 day',
      '00000000-0000-4000-8000-000000000010')$$,
  $$values (true, now())$$,
  'Future edit time is applied but capped at now()'
);

select is(
  (select client_updated_at from public.page_documents
   where page_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  now(),
  'Stored edit time is the capped server time'
);

-- 12-13: invalid input
select throws_ok(
  $$select * from public.save_page_document(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '{"type":"paragraph"}'::jsonb,
      now(),
      '00000000-0000-4000-8000-000000000011')$$,
  '22023',
  null,
  'Document that is not a JSON array is rejected'
);

select throws_ok(
  $$select * from public.save_page_document(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '[]'::jsonb,
      null,
      '00000000-0000-4000-8000-000000000012')$$,
  '22004',
  null,
  'Missing edit time is rejected'
);

-- 14: read-only recipient cannot save
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';

select throws_ok(
  $$select * from public.save_page_document(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '[]'::jsonb,
      now(),
      '00000000-0000-4000-8000-000000000013')$$,
  '42501',
  null,
  'Read-only share recipient cannot save'
);

-- 15: a page that does not exist is rejected like a missing permission
select throws_ok(
  $$select * from public.save_page_document(
      '99999999-9999-4999-8999-999999999999',
      '[]'::jsonb,
      now(),
      '00000000-0000-4000-8000-000000000015')$$,
  '42501',
  null,
  'Saving to a page that does not exist is rejected'
);

-- 16-17: direct writes bypassing the LWW rule are rejected, even for
-- the page owner (old clients' upsert)
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select throws_ok(
  $$insert into public.page_documents (page_id, document)
    values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '[]'::jsonb)$$,
  '42501',
  null,
  'Direct insert into page_documents is rejected'
);

select throws_ok(
  $$update public.page_documents
    set document = '[]'::jsonb
    where page_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  '42501',
  null,
  'Direct update of page_documents is rejected'
);

-- 18: anonymous users cannot call the function
set local role anon;

select throws_ok(
  $$select * from public.save_page_document(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '[]'::jsonb,
      now(),
      '00000000-0000-4000-8000-000000000014')$$,
  '42501',
  null,
  'anon cannot execute save_page_document'
);

select * from finish();

rollback;

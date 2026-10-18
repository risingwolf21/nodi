begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

-- Owner with a workspace; outsider without membership; member of the workspace
insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test'),
  ('22222222-2222-4222-8222-222222222222', 'Outsider@Nodi.test'),
  ('33333333-3333-4333-8333-333333333333', 'member@nodi.test');

insert into public.workspaces (id, name, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Workspace', '11111111-1111-4111-8111-111111111111');

insert into public.workspace_members (workspace_id, user_id, role)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'member');

-- Tree: A > B > C, A > P (private) > Q; all owned by the owner
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, visibility)
values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'A', 'workspace'),
  ('a0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'B', 'workspace'),
  ('a0000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000002',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'C', 'workspace'),
  ('a0000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'P', 'private'),
  ('a0000000-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000004',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Q', 'workspace');

insert into public.page_documents (page_id, document)
values
  ('a0000000-0000-4000-8000-000000000001', '[{"type":"paragraph","content":"A"}]'),
  ('a0000000-0000-4000-8000-000000000003', '[{"type":"paragraph","content":"C"}]'),
  ('a0000000-0000-4000-8000-000000000004', '[{"type":"paragraph","content":"P"}]');

set local role authenticated;

-- 1-2: without permission, 0 rows
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select is((select count(*)::int from public.pages), 0, 'Outsider sees no pages before sharing');
select is((select count(*)::int from public.page_documents), 0, 'Outsider sees no documents before sharing');

-- 3-6: share by e-mail; only the owner may
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';

select throws_ok(
  $$select public.share_page('a0000000-0000-4000-8000-000000000001', 'outsider@nodi.test', 'read')$$,
  '42501', null, 'A workspace member who is not the owner cannot share'
);

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select throws_ok(
  $$select public.share_page('a0000000-0000-4000-8000-000000000001', 'nobody@nodi.test', 'read')$$,
  'P0002', null, 'Unknown e-mail address is reported'
);

select throws_ok(
  $$select public.share_page('a0000000-0000-4000-8000-000000000001', 'outsider@nodi.test', 'admin')$$,
  '22023', null, 'Unknown permission is rejected'
);

select is(
  public.share_page('a0000000-0000-4000-8000-000000000001', '  OUTSIDER@nodi.test ', 'read'),
  '22222222-2222-4222-8222-222222222222'::uuid,
  'Owner shares by e-mail, case and spaces do not matter'
);

-- 7-11: viewer reads the page and inherited subpages, not the private branch
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select set_eq(
  $$select title from public.pages$$,
  array['A', 'B', 'C'],
  'Share is inherited by subpages, but not by a private subpage or below it'
);

select is(
  (select count(*)::int from public.page_documents
   where page_id = 'a0000000-0000-4000-8000-000000000003'),
  1,
  'Viewer reads the document of an inherited subpage'
);

select throws_ok(
  $$select * from public.save_page_document(
      'a0000000-0000-4000-8000-000000000003', '[]'::jsonb, now(),
      '00000000-0000-4000-8000-000000000101')$$,
  '42501', null, 'Viewer cannot write'
);

select throws_ok(
  $$select * from public.list_page_shares('a0000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'Only the owner can list shares'
);

select is(
  (select count(*)::int from public.page_documents
   where page_id = 'a0000000-0000-4000-8000-000000000004'),
  0,
  'Viewer does not read the private subpage'
);

-- 12-14: editor reads and writes, also inherited
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.share_page('a0000000-0000-4000-8000-000000000001', 'outsider@nodi.test', 'edit');

select results_eq(
  $$select email, permission from public.list_page_shares('a0000000-0000-4000-8000-000000000001')$$,
  $$values ('Outsider@Nodi.test'::text, 'edit'::text)$$,
  'Owner lists shares with e-mail; sharing again changes the permission'
);

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select results_eq(
  $$select applied from public.save_page_document(
      'a0000000-0000-4000-8000-000000000003', '[]'::jsonb, now(),
      '00000000-0000-4000-8000-000000000102')$$,
  $$values (true)$$,
  'Editor writes an inherited subpage'
);

select throws_ok(
  $$select * from public.save_page_document(
      'a0000000-0000-4000-8000-000000000004', '[]'::jsonb, now(),
      '00000000-0000-4000-8000-000000000103')$$,
  '42501', null, 'Editor cannot write the private subpage'
);

-- 15-17: revoking works at once, also for subpages
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
delete from public.page_shares
where page_id = 'a0000000-0000-4000-8000-000000000001';

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select is((select count(*)::int from public.pages), 0, 'After revoking, no pages');
select is((select count(*)::int from public.page_documents), 0, 'After revoking, no documents');

select throws_ok(
  $$select * from public.save_page_document(
      'a0000000-0000-4000-8000-000000000003', '[]'::jsonb, now(),
      '00000000-0000-4000-8000-000000000104')$$,
  '42501', null, 'After revoking, no writing'
);

-- 18: a direct share on a private page works
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.share_page('a0000000-0000-4000-8000-000000000004', 'outsider@nodi.test', 'read');

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select set_eq(
  $$select title from public.pages$$,
  array['P', 'Q'],
  'A private page shared directly is readable, with its subpages'
);

-- 19-24: public links
select throws_ok(
  $$insert into public.page_public_links (page_id, created_by)
    values ('a0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222')$$,
  '42501', null, 'Only the owner can publish a page'
);

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
insert into public.page_public_links (page_id, token, created_by)
values ('a0000000-0000-4000-8000-000000000001', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        '11111111-1111-4111-8111-111111111111');

set local role anon;

select results_eq(
  $$select title, document from public.get_public_page('ffffffff-ffff-4fff-8fff-ffffffffffff')$$,
  $$values ('A'::text, '[{"type":"paragraph","content":"A"}]'::jsonb)$$,
  'Anyone with the link reads the published page'
);

select is_empty(
  $$select * from public.get_public_page('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')$$,
  'An unknown token returns nothing'
);

select is_empty(
  $$select * from public.page_public_links$$,
  'Anonymous users cannot list public links'
);

set local role postgres;
update public.pages set is_archived = true
where id = 'a0000000-0000-4000-8000-000000000001';
set local role anon;

select is_empty(
  $$select * from public.get_public_page('ffffffff-ffff-4fff-8fff-ffffffffffff')$$,
  'An archived page is not served'
);

set local role postgres;
update public.pages set is_archived = false
where id = 'a0000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
delete from public.page_public_links
where page_id = 'a0000000-0000-4000-8000-000000000001';
set local role anon;

select is_empty(
  $$select * from public.get_public_page('ffffffff-ffff-4fff-8fff-ffffffffffff')$$,
  'A revoked link returns nothing at once'
);

select * from finish();

rollback;

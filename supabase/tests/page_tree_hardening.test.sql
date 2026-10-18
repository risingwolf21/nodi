begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

-- Workspace owner O, members A and C, outsider X, unconfirmed account U
insert into auth.users (id, email, email_confirmed_at)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test', now()),
  ('22222222-2222-4222-8222-222222222222', 'a@nodi.test', now()),
  ('33333333-3333-4333-8333-333333333333', 'c@nodi.test', now()),
  ('44444444-4444-4444-8444-444444444444', 'x@nodi.test', now()),
  ('55555555-5555-4555-8555-555555555555', 'unconfirmed@nodi.test', null);

insert into public.workspaces (id, name, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team', '11111111-1111-4111-8111-111111111111');

insert into public.workspace_members (workspace_id, user_id, role)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'member');

-- AW: A's shared root. Below it C's private page AWC and C's shared page AWS.
-- CW: C's shared root, CP: C's private root.
-- OR: O's private page shared with A to read, OE: shared with A to edit.
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, visibility)
values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'AW', 'workspace'),
  ('c0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'CW', 'workspace'),
  ('c0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'CP', 'private'),
  ('d0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'OR', 'private'),
  ('d0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'OE', 'private');
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, visibility)
values
  ('a0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001',
   '33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'AWC', 'private'),
  ('a0000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001',
   '33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'AWS', 'workspace');

insert into public.page_shares (page_id, shared_with_user_id, permission, created_by)
values
  ('d0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'read',
   '11111111-1111-4111-8111-111111111111'),
  ('d0000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'edit',
   '11111111-1111-4111-8111-111111111111');

set local role authenticated;

-- 1-3: pages cannot be moved through the API
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select throws_ok(
  $$update public.pages set parent_id = 'a0000000-0000-4000-8000-000000000001'
    where id = 'c0000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'A member cannot hang the tree of someone else below their page'
);
select throws_ok(
  $$update public.pages set parent_id = null
    where id = 'a0000000-0000-4000-8000-000000000003'$$,
  '42501', null, 'A member cannot take a subpage out of its tree'
);
select throws_ok(
  $$update public.pages set parent_id = 'a0000000-0000-4000-8000-000000000001'
    where id = 'd0000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'An edit share does not allow moving the page'
);

-- 4-5: subpages need edit rights on the parent
select throws_ok(
  $$insert into public.pages (workspace_id, parent_id, owner_id, created_by, title)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd0000000-0000-4000-8000-000000000001',
            '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'X')$$,
  '42501', null, 'A read share does not allow creating subpages'
);
select lives_ok(
  $$insert into public.pages (workspace_id, parent_id, owner_id, created_by, title)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd0000000-0000-4000-8000-000000000002',
            '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'Y')$$,
  'An edit share allows creating subpages'
);

-- 6-7: set_page_section leaves private pages of other members alone
select is(
  public.set_page_section('a0000000-0000-4000-8000-000000000001', 'workspace'),
  0,
  'Moving to the workspace does not publish a private subpage of someone else'
);

-- C shares AWS with X and publishes it
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select public.share_page('a0000000-0000-4000-8000-000000000003', 'x@nodi.test', 'read');
insert into public.page_public_links (page_id, created_by)
values ('a0000000-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333');

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is(
  public.set_page_section('a0000000-0000-4000-8000-000000000001', 'private'),
  2,
  'Moving to private changes the root and the shared subpage, not the private one of C'
);

set local role postgres;

-- 8-10: what moved and what stayed
select results_eq(
  $$select owner_id, visibility from public.pages where id = 'a0000000-0000-4000-8000-000000000002'$$,
  $$values ('33333333-3333-4333-8333-333333333333'::uuid, 'private'::text)$$,
  'The private subpage of C keeps its owner'
);
select is(
  (select count(*)::int from public.page_shares where page_id = 'a0000000-0000-4000-8000-000000000003'),
  0,
  'The shares of the previous owner end when the page changes its owner'
);
select is(
  (select count(*)::int from public.page_public_links where page_id = 'a0000000-0000-4000-8000-000000000003'),
  0,
  'The public link of the previous owner ends when the page changes its owner'
);

-- 11-13: removing a member ends their shares and links on transferred pages
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select public.share_page('c0000000-0000-4000-8000-000000000001', 'x@nodi.test', 'read');
insert into public.page_public_links (page_id, created_by)
values ('c0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333');

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.remove_workspace_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333');

set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
select is_empty(
  $$select id from public.pages where id = 'c0000000-0000-4000-8000-000000000001'$$,
  'The share of a removed member no longer gives access'
);

set local role postgres;
select is(
  (select count(*)::int from public.page_public_links where page_id = 'c0000000-0000-4000-8000-000000000001'),
  0,
  'The public link of a removed member ends'
);
select is(
  (select owner_id from public.pages where id = 'c0000000-0000-4000-8000-000000000001'),
  '11111111-1111-4111-8111-111111111111'::uuid,
  'The shared page goes to the workspace owner'
);

-- 14-15: someone who left cannot publish or manage their private pages
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select throws_ok(
  $$insert into public.page_public_links (page_id, created_by)
    values ('c0000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333')$$,
  '42501', null, 'A former member cannot publish their private page'
);
select throws_ok(
  $$select public.share_page('c0000000-0000-4000-8000-000000000002', 'x@nodi.test', 'read')$$,
  '42501', null, 'A former member cannot share their private page'
);

-- 16-17: unconfirmed accounts are not found
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select throws_ok(
  $$select public.share_page('d0000000-0000-4000-8000-000000000001', 'unconfirmed@nodi.test', 'read')$$,
  'P0002', null, 'Sharing does not find unconfirmed accounts'
);
select throws_ok(
  $$select public.add_workspace_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'unconfirmed@nodi.test')$$,
  'P0002', null, 'Adding members does not find unconfirmed accounts'
);

-- 18: the server picks the token
insert into public.page_public_links (page_id, token, created_by)
values ('d0000000-0000-4000-8000-000000000001', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        '11111111-1111-4111-8111-111111111111');
select isnt(
  (select token from public.page_public_links where page_id = 'd0000000-0000-4000-8000-000000000001'),
  'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid,
  'A token chosen by the client is replaced'
);

-- 19-20: workspaces cannot be deleted through the API
delete from public.workspaces where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role postgres;
select is(
  (select count(*)::int from public.workspaces where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  1,
  'The workspace owner cannot delete the workspace'
);
select is(
  (select count(*)::int from public.pages where id = 'c0000000-0000-4000-8000-000000000002'),
  1,
  'The private pages of other members stay'
);

select * from finish();

rollback;

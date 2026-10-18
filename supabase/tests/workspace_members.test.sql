begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

-- Owner O, member-to-be M, outsider X
insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test'),
  ('22222222-2222-4222-8222-222222222222', 'Member@Nodi.test'),
  ('33333333-3333-4333-8333-333333333333', 'outsider@nodi.test');

-- share_page and add_workspace_member only find confirmed accounts (13a).
update auth.users set email_confirmed_at = now();

insert into public.workspaces (id, name, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team', '11111111-1111-4111-8111-111111111111');

set local role authenticated;

-- 1-5: adding members (owner only, by exact e-mail)
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select throws_ok(
  $$select public.add_workspace_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'member@nodi.test')$$,
  '42501', null, 'Only the workspace owner can add members'
);

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select throws_ok(
  $$select public.add_workspace_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'nobody@nodi.test')$$,
  'P0002', null, 'Unknown e-mail address is reported'
);
select throws_ok(
  $$select public.add_workspace_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner@nodi.test')$$,
  '22023', null, 'The owner cannot add themselves'
);
select is(
  public.add_workspace_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ' MEMBER@nodi.test '),
  '22222222-2222-4222-8222-222222222222'::uuid,
  'The owner adds a member by e-mail, case and spaces do not matter'
);
select lives_ok(
  $$select public.add_workspace_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'member@nodi.test')$$,
  'Adding a member again changes nothing'
);

-- 6-7: member list (members only)
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select results_eq(
  $$select email, role from public.list_workspace_members('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
  $$values ('owner@nodi.test'::text, 'owner'::text), ('Member@Nodi.test'::text, 'member'::text)$$,
  'Members list the members with e-mail, owner first'
);

set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select throws_ok(
  $$select * from public.list_workspace_members('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
  '42501', null, 'Outsiders cannot list the members'
);

-- Pages of the owner: S (workspace) > S1, P (private); of the member: MS (workspace) > MS1, MP (private)
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, visibility)
values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'S', 'workspace'),
  ('a0000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'P', 'private');
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, visibility)
values
  ('a0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'S1', 'workspace'),
  -- an older app sends "workspace" for a subpage of a private page
  ('a0000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000003',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'P1', 'workspace');

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, visibility)
values
  ('b0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'MS', 'workspace'),
  ('b0000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'MP', 'private');
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, visibility)
values
  -- the member adds a subpage to the owner's shared page
  ('b0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'MS1', 'workspace');

-- 8-10: sections
select is(
  (select visibility from public.pages where id = 'a0000000-0000-4000-8000-000000000004'),
  null,
  'The member cannot see the private subpage P1'
);
select set_eq(
  $$select title from public.pages$$,
  array['S', 'S1', 'MS1', 'MS', 'MP'],
  'A member sees the shared pages and their own private ones, not the owner''s private pages'
);

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select is(
  (select visibility from public.pages where id = 'a0000000-0000-4000-8000-000000000004'),
  'private',
  'A subpage of a private page becomes private, whatever the app sends'
);

-- 11-12: the section rule holds for direct changes
select throws_ok(
  $$update public.pages set visibility = 'workspace' where id = 'a0000000-0000-4000-8000-000000000004'$$,
  '22023', null, 'A subpage of a private page cannot be shared on its own'
);
select throws_ok(
  $$update public.pages set visibility = 'private' where id = 'a0000000-0000-4000-8000-000000000001'$$,
  '22023', null, 'A shared page with shared subpages cannot be made private directly'
);

-- 13-15: set_page_section rights
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select throws_ok(
  $$select public.set_page_section('a0000000-0000-4000-8000-000000000001', 'private')$$,
  '42501', null, 'Only the page owner can move a page'
);

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select throws_ok(
  $$select public.set_page_section('a0000000-0000-4000-8000-000000000002', 'private')$$,
  '22023', null, 'Only a root page can be moved'
);
select throws_ok(
  $$select public.set_page_section('a0000000-0000-4000-8000-000000000001', 'public')$$,
  '22023', null, 'Unknown sections are rejected'
);

-- 16-18: moving to private takes the whole tree, including the member's subpage
select is(
  public.set_page_section('a0000000-0000-4000-8000-000000000001', 'private'),
  3,
  'Moving to private changes the page and its subpages'
);
select results_eq(
  $$select title, visibility, owner_id::text from public.pages
    where id in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
                 'b0000000-0000-4000-8000-000000000002')
    order by title$$,
  $$values ('MS1'::text, 'private'::text, '11111111-1111-4111-8111-111111111111'::text),
           ('S', 'private', '11111111-1111-4111-8111-111111111111'),
           ('S1', 'private', '11111111-1111-4111-8111-111111111111')$$,
  'The subpages are private and belong to the page owner'
);

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select set_eq(
  $$select title from public.pages$$,
  array['MS', 'MP'],
  'The member no longer sees the moved tree, not even their own subpage'
);

-- 19-20: and back to the workspace
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select is(
  public.set_page_section('a0000000-0000-4000-8000-000000000001', 'workspace'),
  3,
  'Moving to the workspace changes the whole tree'
);

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select set_eq(
  $$select title from public.pages$$,
  array['S', 'S1', 'MS1', 'MS', 'MP'],
  'The member sees the tree again'
);

-- 21: sharing a private page still covers its private subpages
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.share_page('a0000000-0000-4000-8000-000000000003', 'outsider@nodi.test', 'read');
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select set_eq(
  $$select title from public.pages$$,
  array['P', 'P1'],
  'A share on a private page covers its private subpages'
);

-- 22-23: leaving
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select throws_ok(
  $$select public.leave_workspace('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
  '22023', null, 'The owner cannot leave the workspace'
);

-- the member also has a share on the owner's private page
select public.share_page('a0000000-0000-4000-8000-000000000003', 'member@nodi.test', 'read');

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select lives_ok(
  $$select public.leave_workspace('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
  'A member leaves the workspace'
);

-- 24-26: after leaving: no access, shared pages belong to the owner, private ones stay theirs
select is_empty(
  $$select title from public.pages$$,
  'After leaving, no pages are readable, not even the own private ones or shared pages'
);

set local role postgres;
select results_eq(
  $$select title, owner_id::text from public.pages where title in ('MS', 'MS1', 'MP') order by title$$,
  $$values ('MP'::text, '22222222-2222-4222-8222-222222222222'::text),
           ('MS', '11111111-1111-4111-8111-111111111111'),
           ('MS1', '11111111-1111-4111-8111-111111111111')$$,
  'Shared pages go to the workspace owner, private pages stay with the member'
);
select is_empty(
  $$select 1 from public.page_shares where shared_with_user_id = '22222222-2222-4222-8222-222222222222'$$,
  'Shares in the workspace end with the membership'
);

-- 27: joining again brings the private pages back
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.add_workspace_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'member@nodi.test');
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select set_eq(
  $$select title from public.pages$$,
  array['S', 'S1', 'MS1', 'MS', 'MP'],
  'After joining again, the member sees the shared pages and their private page'
);

-- 28-30: removing (owner only, not the owner, not by deleting the row)
select throws_ok(
  $$select public.remove_workspace_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111')$$,
  '42501', null, 'Only the owner can remove members'
);

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select is_empty(
  $$delete from public.workspace_members where user_id = '22222222-2222-4222-8222-222222222222' returning user_id$$,
  'Memberships cannot be deleted directly (the transfer would be skipped)'
);
select lives_ok(
  $$select public.remove_workspace_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222')$$,
  'The owner removes a member'
);

select * from finish();

rollback;

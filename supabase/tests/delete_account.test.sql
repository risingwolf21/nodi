begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

-- A deletes their account. A owns W1 alone and W2 with members B (joined
-- first) and C; A is a member of W3, owned by C. D only receives a share.
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111', 'a@nodi.test', now()),
  ('22222222-2222-4222-8222-222222222222', 'b@nodi.test', now()),
  ('33333333-3333-4333-8333-333333333333', 'c@nodi.test', now()),
  ('44444444-4444-4444-8444-444444444444', 'd@nodi.test', now());
insert into public.workspaces (id, name, owner_id) values
  ('a1000000-0000-4000-8000-000000000000', 'Allein', '11111111-1111-4111-8111-111111111111'),
  ('a2000000-0000-4000-8000-000000000000', 'Team', '11111111-1111-4111-8111-111111111111'),
  ('a3000000-0000-4000-8000-000000000000', 'Fremd', '33333333-3333-4333-8333-333333333333');
insert into public.workspace_members (workspace_id, user_id, role, joined_at) values
  ('a2000000-0000-4000-8000-000000000000', '22222222-2222-4222-8222-222222222222', 'member', '2026-01-01'),
  ('a2000000-0000-4000-8000-000000000000', '33333333-3333-4333-8333-333333333333', 'member', '2026-02-01'),
  ('a3000000-0000-4000-8000-000000000000', '11111111-1111-4111-8111-111111111111', 'member', '2026-01-01');

insert into public.pages (id, workspace_id, owner_id, created_by, title, visibility) values
  ('c1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000000',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Allein privat', 'private'),
  ('c2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000000',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Team geteilt', 'workspace'),
  ('c2000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000000',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Team privat', 'private'),
  ('c2000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000000',
   '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'Von B', 'workspace'),
  ('c3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000000',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Fremd geteilt', 'workspace'),
  ('c3000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000000',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Fremd privat', 'private'),
  ('c3000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000000',
   '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'Von A angelegt, C gehört', 'workspace');

insert into public.page_shares (page_id, shared_with_user_id, permission, created_by) values
  ('c2000000-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', 'read',
   '11111111-1111-4111-8111-111111111111'),
  ('c3000000-0000-4000-8000-000000000003', '44444444-4444-4444-8444-444444444444', 'read',
   '33333333-3333-4333-8333-333333333333');
insert into public.page_comments (page_id, author_id, body) values
  ('c3000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Von A');

-- 1: without a session nothing happens
set local role authenticated;
select throws_ok($$select public.delete_account()$$, '42501', null, 'Not signed in: 42501');

-- 2: A deletes the account
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select lives_ok($$select public.delete_account()$$, 'A deletes their account');

reset role;

-- 3-4: the account and its profile are gone
select is_empty($$select 1 from auth.users where id = '11111111-1111-4111-8111-111111111111'$$, 'The account is gone');
select is_empty($$select 1 from public.profiles where id = '11111111-1111-4111-8111-111111111111'$$, 'The profile is gone');

-- 5: the workspace without other members is deleted with its pages
select is_empty(
  $$select 1 from public.workspaces where id = 'a1000000-0000-4000-8000-000000000000'
    union all select 1 from public.pages where id = 'c1000000-0000-4000-8000-000000000001'$$,
  'A workspace without other members goes with its pages'
);

-- 6-7: the workspace with members goes to the member who joined first
select is(
  (select owner_id from public.workspaces where id = 'a2000000-0000-4000-8000-000000000000'),
  '22222222-2222-4222-8222-222222222222'::uuid,
  'The member who joined first owns the workspace'
);
select is(
  (select role from public.workspace_members
   where workspace_id = 'a2000000-0000-4000-8000-000000000000' and user_id = '22222222-2222-4222-8222-222222222222'),
  'owner',
  'Their membership is the owner membership'
);

-- 8-9: shared pages stay, owned and recorded as created by the new owner
select results_eq(
  $$select owner_id, created_by from public.pages where id = 'c2000000-0000-4000-8000-000000000001'$$,
  $$values ('22222222-2222-4222-8222-222222222222'::uuid, '22222222-2222-4222-8222-222222222222'::uuid)$$,
  'A shared page in the handed-over workspace goes to its new owner'
);
select results_eq(
  $$select owner_id from public.pages where id = 'c3000000-0000-4000-8000-000000000001'$$,
  $$values ('33333333-3333-4333-8333-333333333333'::uuid)$$,
  'A shared page in a workspace of someone else goes to its owner'
);

-- 10: private pages are deleted
select is_empty(
  $$select 1 from public.pages
    where id in ('c2000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000002')$$,
  'Private pages of the account are deleted'
);

-- 11: pages of others stay unchanged
select results_eq(
  $$select owner_id from public.pages where id = 'c2000000-0000-4000-8000-000000000003'$$,
  $$values ('22222222-2222-4222-8222-222222222222'::uuid)$$,
  'Pages of others stay'
);

-- 12: a page the account created but someone else owns names its owner as creator
select results_eq(
  $$select created_by from public.pages where id = 'c3000000-0000-4000-8000-000000000003'$$,
  $$values ('33333333-3333-4333-8333-333333333333'::uuid)$$,
  'A page created by the account is recorded as created by its owner'
);

-- 13-14: shares by the account end, shares by others stay
select is_empty(
  $$select 1 from public.page_shares where created_by = '11111111-1111-4111-8111-111111111111'$$,
  'Shares the account created end'
);
select isnt_empty(
  $$select 1 from public.page_shares where page_id = 'c3000000-0000-4000-8000-000000000003'$$,
  'Shares by others stay'
);

-- 15-16: comments and memberships go with the account
select is_empty(
  $$select 1 from public.page_comments where author_id = '11111111-1111-4111-8111-111111111111'$$,
  'Comments of the account are deleted'
);
select is_empty(
  $$select 1 from public.workspace_members where user_id = '11111111-1111-4111-8111-111111111111'$$,
  'Memberships of the account end'
);

select * from finish();
rollback;

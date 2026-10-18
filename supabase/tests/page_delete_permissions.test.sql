begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

-- Owner, workspace member with edit rights, outsider with an edit share
insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test'),
  ('22222222-2222-4222-8222-222222222222', 'member@nodi.test'),
  ('33333333-3333-4333-8333-333333333333', 'editor@nodi.test');

insert into public.workspaces (id, name, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Workspace', '11111111-1111-4111-8111-111111111111');

insert into public.workspace_members (workspace_id, user_id, role)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member');

-- P (owner, in the trash) > S (created by the member)
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, is_archived)
values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'P', true),
  ('a0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'S', true);

insert into public.page_shares (page_id, shared_with_user_id, permission, created_by)
values ('a0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'edit',
        '11111111-1111-4111-8111-111111111111');

set local role authenticated;

-- 1: a member with edit rights deletes nothing
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is_empty(
  $$delete from public.pages where id = 'a0000000-0000-4000-8000-000000000001' returning id$$,
  'A workspace member cannot delete another owner''s page'
);

-- 2: but can still restore it from the trash (update policy unchanged)
select results_eq(
  $$update public.pages set is_archived = false
    where id = 'a0000000-0000-4000-8000-000000000001' returning title$$,
  $$values ('P'::text)$$,
  'Restoring stays open to everyone with edit rights'
);

-- 3: an editor by share deletes nothing either
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select is_empty(
  $$delete from public.pages where id = 'a0000000-0000-4000-8000-000000000001' returning id$$,
  'An editor by share cannot delete the page'
);

-- 4-5: the owner deletes the page, its subpage goes with it
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select results_eq(
  $$delete from public.pages where id = 'a0000000-0000-4000-8000-000000000001' returning title$$,
  $$values ('P'::text)$$,
  'The owner deletes the page for good'
);

set local role postgres;
select is_empty(
  $$select id from public.pages where id = 'a0000000-0000-4000-8000-000000000002'$$,
  'The subpage is deleted with its parent'
);

select * from finish();

rollback;

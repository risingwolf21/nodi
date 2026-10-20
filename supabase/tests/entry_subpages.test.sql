begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

-- Owner O and member M of workspace W.
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test', now()),
  ('22222222-2222-4222-8222-222222222222', 'member@nodi.test', now());
insert into public.workspaces (id, name, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team', '11111111-1111-4111-8111-111111111111');
insert into public.workspace_members (workspace_id, user_id, role)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

-- Shared: database Aufgaben (D) with entry Entwurf (E); page Projekte (P) > Website (S).
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, kind, visibility) values
  ('d0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Aufgaben', 'database', 'workspace'),
  ('50000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Projekte', 'page', 'workspace');
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, visibility, position) values
  ('e0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd0000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Entwurf', 'workspace', 1),
  ('50000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '50000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Website', 'workspace', null);

-- 1-2: an entry has subpages and databases
select lives_ok(
  $$insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, visibility)
    values ('60000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'e0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111', 'Notizen', 'workspace')$$,
  'An entry gets a subpage'
);
select lives_ok(
  $$insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, kind, visibility)
    values ('60000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'e0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111', 'Kosten', 'database', 'workspace')$$,
  'An entry gets a database'
);

-- 3-5: a page with subpages becomes an entry and keeps them
select lives_ok(
  $$select public.move_page('50000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', null)$$,
  'A page with subpages moves into a database'
);
select is(
  (select position from public.pages where id = '50000000-0000-4000-8000-000000000001'),
  2::numeric,
  'It is the last entry'
);
select is(
  (select parent_id from public.pages where id = '50000000-0000-4000-8000-000000000002'),
  '50000000-0000-4000-8000-000000000001'::uuid,
  'Its subpage stays below it'
);

-- 6-7: members read and edit subpages of shared entries
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is(
  (select count(*)::integer from public.pages where parent_id = 'e0000000-0000-4000-8000-000000000001'),
  2,
  'A member reads the subpages of an entry'
);
select ok(public.can_edit_page('60000000-0000-4000-8000-000000000001'), 'and may edit them');

select * from finish();

rollback;

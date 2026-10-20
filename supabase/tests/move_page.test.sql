begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

-- Owner O and member M of workspace W; X with workspace W2.
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test', now()),
  ('22222222-2222-4222-8222-222222222222', 'member@nodi.test', now()),
  ('33333333-3333-4333-8333-333333333333', 'other@nodi.test', now());
insert into public.workspaces (id, name, owner_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Andere', '33333333-3333-4333-8333-333333333333');
insert into public.workspace_members (workspace_id, user_id, role)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

-- Shared: Projekte (S1) > Website (S2) > Texte (S3); Archiv (S4, in the trash).
-- Private of O: Notizen (P1) > Ideen (P2). Databases: Aufgaben (D1, shared) with
-- entry Entwurf (E1), Kontakte (D2, shared) with entry Anna (E2).
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, kind, visibility, is_archived) values
  ('50000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Projekte', 'page', 'workspace', false),
  ('50000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Archiv', 'page', 'workspace', true),
  ('90000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Notizen', 'page', 'private', false),
  ('d0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Aufgaben', 'database', 'workspace', false),
  ('d0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Kontakte', 'database', 'workspace', false);
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, visibility, position) values
  ('50000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '50000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Website', 'workspace', null),
  ('90000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '90000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Ideen', 'private', null),
  ('e0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd0000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Entwurf', 'workspace', 3),
  ('e0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd0000000-0000-4000-8000-000000000002',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Anna', 'workspace', 1);
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, visibility) values
  ('50000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '50000000-0000-4000-8000-000000000002',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Texte', 'workspace');

-- A relation Aufgaben ↔ Kontakte and a status of Entwurf.
select public.add_relation_property('d0000000-0000-4000-8000-000000000001', 'Kontakte',
  'd0000000-0000-4000-8000-000000000002', 'Aufgaben');
insert into public.database_properties (id, database_id, name, type)
values ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Notiz', 'text');
select public.set_page_property('e0000000-0000-4000-8000-000000000001',
  (select id from public.database_properties where name = 'Kontakte'),
  '["e0000000-0000-4000-8000-000000000002"]', now() - interval '1 hour', gen_random_uuid());
select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
  '"wichtig"', now() - interval '1 hour', gen_random_uuid());

create function pg_temp.page(page uuid) returns text
language sql as $$
  select concat_ws(' ', coalesce(parent.title, '∅'), p.visibility, p.position)
  from public.pages p left join public.pages parent on parent.id = p.parent_id
  where p.id = page
$$;

-- 1-2: parent_id stays fixed for direct updates; move_page moves
select throws_ok(
  $$update public.pages set parent_id = '90000000-0000-4000-8000-000000000001'
    where id = '50000000-0000-4000-8000-000000000003'$$,
  '42501', null, 'parent_id cannot be changed directly'
);
select lives_ok(
  $$select public.move_page('50000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000001', null)$$,
  'A page moves below another page'
);
select is(pg_temp.page('50000000-0000-4000-8000-000000000003'), 'Projekte workspace', 'It hangs below its new parent');

-- 4-5: to the top of a section
select lives_ok(
  $$select public.move_page('50000000-0000-4000-8000-000000000003', null, 'workspace')$$,
  'A page moves to the top of its section'
);
select is(pg_temp.page('50000000-0000-4000-8000-000000000003'), '∅ workspace', 'It is a root page now');

-- 6-9: invalid targets
select throws_ok(
  $$select public.move_page('50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', null)$$,
  '22023', null, 'A page cannot move below its own subpage'
);
select throws_ok(
  $$select public.move_page('50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', null)$$,
  '22023', null, 'A page cannot move below itself'
);
select throws_ok(
  $$select public.move_page('50000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000004', null)$$,
  '22023', null, 'A page in the trash is no target'
);
select throws_ok(
  $$select public.move_page('50000000-0000-4000-8000-000000000003', null, 'elsewhere')$$,
  '22023', null, 'Only the two sections are targets'
);

-- 10-12: a section change moves the subtree; to private and back
select lives_ok(
  $$select public.move_page('50000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', null)$$,
  'The owner moves a shared page into a private one'
);
select results_eq(
  $$select pg_temp.page('50000000-0000-4000-8000-000000000002')$$,
  $$values ('Notizen private')$$,
  'The page is private below its private parent'
);
select lives_ok(
  $$select public.move_page('90000000-0000-4000-8000-000000000002', null, 'workspace')$$,
  'A private page moves to the workspace'
);

-- 13-15: rights of a member
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select lives_ok(
  $$select public.move_page('90000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', null)$$,
  'A member moves a shared page within the workspace'
);
select throws_ok(
  $$select public.move_page('50000000-0000-4000-8000-000000000001', null, 'private')$$,
  '42501', null, 'Only the owner moves a page to another section'
);
select throws_ok(
  $$select public.move_page('50000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', null)$$,
  '42501', null, 'Without edit rights on the target nothing moves'
);

-- 16: another workspace
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
insert into public.pages (id, workspace_id, owner_id, created_by, title, visibility)
values ('70000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        '33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'Fremd', 'private');
select public.share_page('70000000-0000-4000-8000-000000000001', 'owner@nodi.test', 'edit');
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select throws_ok(
  $$select public.move_page('50000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', null)$$,
  '22023', null, 'A page does not move to another workspace'
);

-- The whole subtree changes its section: Notizen moves to the workspace with Website below it.
select lives_ok(
  $$select public.move_page('90000000-0000-4000-8000-000000000001', null, 'workspace')$$,
  'A private page with a subpage moves to the workspace'
);
select results_eq(
  $$select pg_temp.page('90000000-0000-4000-8000-000000000001'), pg_temp.page('50000000-0000-4000-8000-000000000002')$$,
  $$values ('∅ workspace', 'Notizen workspace')$$,
  'Its subpage is shared as well'
);

-- 17-19: into a database (an entry at the end), not a database (with subpages: entry_subpages.test.sql)
select lives_ok(
  $$select public.move_page('50000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', null)$$,
  'A page moves into a database'
);
select is(pg_temp.page('50000000-0000-4000-8000-000000000003'), 'Aufgaben workspace 4', 'It is the last entry');
select throws_ok(
  $$select public.move_page('d0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', null)$$,
  '22023', null, 'A database does not become an entry'
);

-- 20-23: an entry leaves its database: its values go, its relations are unlinked
select lives_ok(
  $$select public.move_page('e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', null)$$,
  'An entry moves out of its database'
);
select is(pg_temp.page('e0000000-0000-4000-8000-000000000001'), 'Projekte workspace', 'It is a page without position');
select is(
  (select count(*)::integer from public.page_property_values where page_id = 'e0000000-0000-4000-8000-000000000001'),
  0,
  'Its property values are gone'
);
select is(
  (select value from public.page_property_values
   where page_id = 'e0000000-0000-4000-8000-000000000002'
     and property_id = (select id from public.database_properties where name = 'Aufgaben')),
  'null'::jsonb,
  'The related entry no longer links it'
);

select * from finish();

rollback;

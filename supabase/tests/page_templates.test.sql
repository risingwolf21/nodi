begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

-- Owner O of workspace W with a page P, databases D and E; reader R has a
-- read share on D.
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test', now()),
  ('33333333-3333-4333-8333-333333333333', 'reader@nodi.test', now());
insert into public.workspaces (id, name, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team', '11111111-1111-4111-8111-111111111111');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

insert into public.pages (id, workspace_id, owner_id, created_by, title, kind) values
  ('b0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Notizen', 'page'),
  ('d0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Aufgaben', 'database'),
  ('d0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Projekte', 'database');
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, is_template, position) values
  ('70000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'd0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   '11111111-1111-4111-8111-111111111111', 'Fehler', true, 1),
  ('70000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'd0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   '11111111-1111-4111-8111-111111111111', 'Normal', false, 2),
  ('70000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'd0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   '11111111-1111-4111-8111-111111111111', 'Projekt', true, 1);

-- 1-3: page templates outside databases
select lives_ok(
  $$insert into public.pages (id, workspace_id, owner_id, created_by, title, is_template)
    values ('60000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Protokoll', true)$$,
  'A top-level page is a template'
);
select lives_ok(
  $$update public.pages set is_template = true where id = 'b0000000-0000-4000-8000-000000000001'$$,
  'An existing page becomes a template'
);
select throws_ok(
  $$select public.create_entry_from_template('60000000-0000-4000-8000-000000000001')$$,
  '22023', null, 'A page template makes no database entries'
);

-- 4-8: the default template of a database
select lives_ok(
  $$update public.pages set default_template_id = '70000000-0000-4000-8000-000000000001'
    where id = 'd0000000-0000-4000-8000-000000000001'$$,
  'A template of the database is its default'
);
select throws_ok(
  $$update public.pages set default_template_id = '70000000-0000-4000-8000-000000000002'
    where id = 'd0000000-0000-4000-8000-000000000001'$$,
  '22023', null, 'An ordinary entry is no default template'
);
select throws_ok(
  $$update public.pages set default_template_id = '70000000-0000-4000-8000-000000000003'
    where id = 'd0000000-0000-4000-8000-000000000001'$$,
  '22023', null, 'A template of another database is no default template'
);
select throws_ok(
  $$update public.pages set default_template_id = '60000000-0000-4000-8000-000000000001'
    where id = 'b0000000-0000-4000-8000-000000000001'$$,
  '22023', null, 'Only databases have a default template'
);

reset role;
insert into public.page_shares (page_id, shared_with_user_id, permission, created_by)
values ('d0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'read',
        '11111111-1111-4111-8111-111111111111');
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
update public.pages set default_template_id = null where id = 'd0000000-0000-4000-8000-000000000001';
select is(
  (select default_template_id from public.pages where id = 'd0000000-0000-4000-8000-000000000001'),
  '70000000-0000-4000-8000-000000000001'::uuid,
  'A reader cannot change the default template'
);

-- 9-10: moving a template out of its database keeps it a template
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select lives_ok(
  $$select public.move_page('70000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', null)$$,
  'An entry template is moved out of its database'
);
select results_eq(
  $$select parent_id, is_template from public.pages where id = '70000000-0000-4000-8000-000000000003'$$,
  $$values ('b0000000-0000-4000-8000-000000000001'::uuid, true)$$,
  'It is a page template now'
);

-- 11: deleting the default template clears it
reset role;
delete from public.pages where id = '70000000-0000-4000-8000-000000000001';
select is(
  (select default_template_id from public.pages where id = 'd0000000-0000-4000-8000-000000000001'),
  null, 'Deleting the template clears the default'
);

select * from finish();

rollback;

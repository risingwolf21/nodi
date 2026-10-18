begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

-- Workspace owner O, member M, reader R (share), outsider X
insert into auth.users (id, email, email_confirmed_at)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test', now()),
  ('22222222-2222-4222-8222-222222222222', 'member@nodi.test', now()),
  ('33333333-3333-4333-8333-333333333333', 'reader@nodi.test', now()),
  ('44444444-4444-4444-8444-444444444444', 'outsider@nodi.test', now());

insert into public.workspaces (id, name, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team', '11111111-1111-4111-8111-111111111111');
insert into public.workspace_members (workspace_id, user_id, role)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

-- D: shared database, P: private database shared with R to read, N: a normal page
insert into public.pages (id, workspace_id, owner_id, created_by, title, visibility, kind)
values
  ('d0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Aufgaben', 'workspace', 'database'),
  ('d0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Privat', 'private', 'database'),
  ('d0000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Notiz', 'workspace', 'page');
select public.share_page('d0000000-0000-4000-8000-000000000002', 'reader@nodi.test', 'read');

-- Entry PE of the private database, property PP there
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title)
values ('e0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd0000000-0000-4000-8000-000000000002',
        '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Privater Eintrag');
insert into public.database_properties (id, database_id, name, type)
values ('f0000000-0000-4000-8000-0000000000a1', 'd0000000-0000-4000-8000-000000000002', 'Notiz', 'text');
select public.set_page_property('e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-0000000000a1',
  '"geheim"', '2026-10-18T10:00:00Z', '00000000-0000-4000-8000-0000000000a1');

-- 1: a new database starts with a table view
select results_eq(
  $$select name, type from public.database_views where database_id = 'd0000000-0000-4000-8000-000000000001'$$,
  $$values ('Tabelle'::text, 'table'::text)$$,
  'A new database starts with a table view'
);

-- 2-4: properties
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select lives_ok(
  $$insert into public.database_properties (id, database_id, name, type, options, position)
    values
      ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Status', 'status',
       '{"options": [{"id": "todo", "name": "Offen", "color": "gray"}, {"id": "done", "name": "Erledigt", "color": "green"}]}', 1),
      ('f0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'Notizen', 'text', '{}', 2),
      ('f0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'Fällig', 'date', '{}', 3),
      ('f0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001', 'Link', 'url', '{}', 4),
      ('f0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001', 'Kontakt', 'email', '{}', 5),
      ('f0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000001', 'Erstellt', 'created_time', '{}', 6),
      ('f0000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000001', 'Tags', 'multi_select',
       '{"options": [{"id": "a", "name": "A", "color": "red"}, {"id": "b", "name": "B", "color": "blue"}]}', 7)$$,
  'A member with edit rights adds properties'
);
select throws_ok(
  $$insert into public.database_properties (database_id, name, type)
    values ('d0000000-0000-4000-8000-000000000003', 'X', 'text')$$,
  '22023', null, 'Properties belong to a database, not to a normal page'
);

set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select throws_ok(
  $$insert into public.database_properties (database_id, name, type)
    values ('d0000000-0000-4000-8000-000000000002', 'X', 'text')$$,
  '42501', null, 'A reader cannot add properties'
);

-- 5-7: reading
select is(
  (select count(*)::int from public.database_views where database_id = 'd0000000-0000-4000-8000-000000000002'),
  1, 'A reader sees the views of a shared database'
);
select is(
  (select value from public.page_property_values where page_id = 'e0000000-0000-4000-8000-000000000002'),
  '"geheim"'::jsonb, 'A reader sees the property values of its entries'
);

set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
select is(
  (select count(*)::int from public.database_properties) + (select count(*)::int from public.database_views)
    + (select count(*)::int from public.page_property_values),
  0, 'An outsider sees no properties, views or values'
);

-- 8-10: entries and kinds
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select lives_ok(
  $$insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title)
    values ('e0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd0000000-0000-4000-8000-000000000001',
            '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'Eintrag')$$,
  'A member adds an entry'
);
select throws_ok(
  $$insert into public.pages (workspace_id, parent_id, owner_id, created_by, title, kind)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd0000000-0000-4000-8000-000000000001',
            '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'X', 'database')$$,
  '22023', null, 'A database cannot be an entry of another database'
);
select throws_ok(
  $$update public.pages set kind = 'page' where id = 'd0000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'The kind of a page is fixed'
);

-- 11-19: values and their validation
select is(
  (select applied from public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
    '"todo"', '2026-10-18T10:00:00Z', '00000000-0000-4000-8000-000000000001')),
  true, 'A valid status is stored'
);
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
    '"unknown"', now(), gen_random_uuid())$$,
  '22023', null, 'A status must be one of the options'
);
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002',
    '42', now(), gen_random_uuid())$$,
  '22023', null, 'A text property takes text only'
);
select lives_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000003',
    '{"start": "2026-10-20", "end": null}', now(), gen_random_uuid())$$,
  'A date is stored'
);
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000003',
    '{"start": "morgen"}', now(), gen_random_uuid())$$,
  '22023', null, 'An invalid date is rejected'
);
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000004',
    '"javascript:alert(1)"', now(), gen_random_uuid())$$,
  '22023', null, 'A URL must start with http:// or https://'
);
select lives_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000007',
    '["a", "b"]', now(), gen_random_uuid())$$,
  'A multi-select takes several options'
);
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000006',
    '"2026-01-01"', now(), gen_random_uuid())$$,
  '22023', null, 'Computed properties cannot be set'
);
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-0000000000a1',
    '"x"', now(), gen_random_uuid())$$,
  '22023', null, 'A property of another database cannot be set on an entry'
);

-- 20-23: last-write-wins per field
select results_eq(
  $$select applied, stored_mutation_id from public.set_page_property('e0000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001', '"done"', '2026-10-18T09:00:00Z', '00000000-0000-4000-8000-000000000009')$$,
  $$values (false, '00000000-0000-4000-8000-000000000001'::uuid)$$,
  'An older edit does not overwrite a newer one'
);
select results_eq(
  $$select applied, stored_mutation_id from public.set_page_property('e0000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001', '"todo"', '2026-10-18T10:00:00Z', '00000000-0000-4000-8000-000000000001')$$,
  $$values (false, '00000000-0000-4000-8000-000000000001'::uuid)$$,
  'Replaying the same mutation changes nothing'
);
select ok(
  (select stored_edited_at <= now() from public.set_page_property('e0000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000002', '"Notiz"', '2999-01-01T00:00:00Z', gen_random_uuid())),
  'An edit time from the future is capped at now()'
);
select results_eq(
  $$select property_id, value from public.page_property_values
    where page_id = 'e0000000-0000-4000-8000-000000000001'
      and property_id in ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002')
    order by property_id$$,
  $$values ('f0000000-0000-4000-8000-000000000001'::uuid, '"todo"'::jsonb),
           ('f0000000-0000-4000-8000-000000000002'::uuid, '"Notiz"'::jsonb)$$,
  'Changes to different properties of an entry are both kept'
);

-- 24-26: who writes values
select throws_ok(
  $$insert into public.page_property_values (page_id, property_id, value, client_updated_at, last_mutation_id)
    values ('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', '"x"', '2999-01-01', gen_random_uuid())$$,
  '42501', null, 'Values cannot be written past the LWW function'
);

set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-0000000000a1',
    '"neu"', now(), gen_random_uuid())$$,
  '42501', null, 'A reader cannot set values'
);

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select lives_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000004',
    'null', now(), gen_random_uuid())$$,
  'JSON null clears a value'
);

-- 27-28: changing the type clears the values
update public.database_properties set type = 'select', options = '{"options": []}'
where id = 'f0000000-0000-4000-8000-000000000002';
select is(
  (select count(*)::int from public.page_property_values where property_id = 'f0000000-0000-4000-8000-000000000002'),
  0, 'Changing the type of a property clears its values'
);
select throws_ok(
  $$update public.database_properties set database_id = 'd0000000-0000-4000-8000-000000000002'
    where id = 'f0000000-0000-4000-8000-000000000001'$$,
  '22023', null, 'A property cannot move to another database'
);

-- 29-30: views
select lives_ok(
  $$insert into public.database_views (database_id, name, type, config)
    values ('d0000000-0000-4000-8000-000000000001', 'Board', 'board', '{"groupBy": "f0000000-0000-4000-8000-000000000001"}')$$,
  'A member adds a view'
);

set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
delete from public.database_views where database_id = 'd0000000-0000-4000-8000-000000000002';
set local role postgres;
select is(
  (select count(*)::int from public.database_views where database_id = 'd0000000-0000-4000-8000-000000000002'),
  1, 'A reader cannot delete views'
);

select * from finish();

rollback;

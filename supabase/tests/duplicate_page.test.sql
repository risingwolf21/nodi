begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

-- Owner O of workspace W, member M, reader R with a read share on the notes.
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test', now()),
  ('22222222-2222-4222-8222-222222222222', 'member@nodi.test', now()),
  ('33333333-3333-4333-8333-333333333333', 'reader@nodi.test', now());
insert into public.workspaces (id, name, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team', '11111111-1111-4111-8111-111111111111');
insert into public.workspace_members (workspace_id, user_id, role)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

-- Notes (position 1) with a subpage, a database "Tasks" (entries T1, T2 and a
-- template), an archived subpage; a sibling at position 2; and "People"
-- outside the notes, related to Tasks.
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, kind, position, icon) values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Notizen', 'page', 1, '📝'),
  ('a0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Danach', 'page', 2, null),
  ('a0000000-0000-4000-8000-000000000006', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Personen', 'database', 3, null);
-- Rights on the parent are checked against the rows before the statement.
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, kind, position, icon) values
  ('a0000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Unterseite', 'page', null, null),
  ('a0000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Aufgaben', 'database', null, null),
  ('a0000000-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Alt', 'page', null, null);
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, position, is_template) values
  ('e0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000004',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'T1', 1, false),
  ('e0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000004',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'T2', 2, false),
  ('e0000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000004',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Vorlage', 3, true),
  ('e0000000-0000-4000-8000-000000000009', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000006',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Anna', 1, false);
update public.pages set is_archived = true where id = 'a0000000-0000-4000-8000-000000000005';
update public.pages set default_template_id = 'e0000000-0000-4000-8000-000000000003'
where id = 'a0000000-0000-4000-8000-000000000004';

insert into public.database_properties (id, database_id, name, type, options) values
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'Status', 'select',
   '{"options": [{"id": "todo", "name": "Offen"}]}'),
  ('f0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000004', 'Anhang', 'files', '{}');
select public.add_relation_property('a0000000-0000-4000-8000-000000000004', 'Vorher',
  'a0000000-0000-4000-8000-000000000004', 'Nachher');
select public.add_relation_property('a0000000-0000-4000-8000-000000000004', 'Personen',
  'a0000000-0000-4000-8000-000000000006', 'Aufgaben');
update public.database_views set config = '{"groupByPropertyId": "f0000000-0000-4000-8000-000000000001"}'
where database_id = 'a0000000-0000-4000-8000-000000000004';

select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
  '"todo"', now(), gen_random_uuid());
select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002',
  '["e0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001-plan.pdf"]', now(), gen_random_uuid());
select public.set_page_property('e0000000-0000-4000-8000-000000000002',
  (select id from public.database_properties where name = 'Vorher'),
  '["e0000000-0000-4000-8000-000000000001"]', now(), gen_random_uuid());
select public.set_page_property('e0000000-0000-4000-8000-000000000001',
  (select id from public.database_properties
   where name = 'Personen' and database_id = 'a0000000-0000-4000-8000-000000000004'),
  '["e0000000-0000-4000-8000-000000000009"]', now(), gen_random_uuid());

-- The notes link to their subpage and show the database in a block with a block view.
select public.save_page_document('a0000000-0000-4000-8000-000000000001',
  '[{"id": "b1", "type": "paragraph", "content": [{"type": "pageLink", "props": {"pageId": "a0000000-0000-4000-8000-000000000003"}}]},
    {"id": "b2", "type": "database", "props": {"databaseId": "a0000000-0000-4000-8000-000000000004"}},
    {"id": "b3", "type": "image", "props": {"url": "nodi-file:a0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000002-bild.png"}}]',
  now(), gen_random_uuid());
insert into public.block_views (page_id, block_id, database_id, name, type, config)
values ('a0000000-0000-4000-8000-000000000001', 'b2', 'a0000000-0000-4000-8000-000000000004', 'Board', 'board',
        '{"groupByPropertyId": "f0000000-0000-4000-8000-000000000001"}');

reset role;
-- The image exists in storage, the attachment does not (only existing files are copied).
insert into storage.objects (bucket_id, name, owner)
values ('page-files', 'a0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000002-bild.png',
        '11111111-1111-4111-8111-111111111111');
insert into public.page_shares (page_id, shared_with_user_id, permission, created_by)
values ('a0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'read',
        '11111111-1111-4111-8111-111111111111');
create temporary table copy_result (page_id uuid, files jsonb);
grant all on copy_result to authenticated;
set local role authenticated;

-- 1-3: arguments and rights
select throws_ok($$select * from public.duplicate_page(null)$$, '22004', null, 'The page is required');
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select throws_ok(
  $$select * from public.duplicate_page('a0000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'A reader from outside the workspace cannot copy'
);
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select throws_ok(
  $$select * from public.duplicate_page('a0000000-0000-4000-8000-000000000005')$$,
  '22023', null, 'A page in the trash is not copied'
);

-- 4-6: the copy, right after the original, with the readable pages below it
insert into copy_result select * from public.duplicate_page('a0000000-0000-4000-8000-000000000001');
select results_eq(
  $$select p.title, p.icon, p.parent_id, p.position, p.owner_id from public.pages p join copy_result c on c.page_id = p.id$$,
  $$values ('Notizen (Kopie)'::text, '📝'::text, null::uuid, 1.5::numeric, '11111111-1111-4111-8111-111111111111'::uuid)$$,
  'The copy is named and placed after the original'
);
select is(
  (with recursive tree as (
     select c.page_id as id from copy_result c
     union all select p.id from public.pages p join tree on p.parent_id = tree.id)
   select array_agg(p.title order by p.title) from tree join public.pages p on p.id = tree.id),
  array['Aufgaben', 'Notizen (Kopie)', 'T1', 'T2', 'Unterseite', 'Vorlage'],
  'Subpages, the database and its entries are copied; the archived page is not'
);
select is(
  (select count(*)::integer from public.pages where title = 'Notizen'),
  1,
  'The original stays'
);

-- 7-10: the text points to the copies
select is(
  (select d.document -> 0 -> 'content' -> 0 -> 'props' ->> 'pageId' from public.page_documents d join copy_result c on c.page_id = d.page_id),
  (select p.id::text from public.pages p join copy_result c on p.parent_id = c.page_id where p.title = 'Unterseite'),
  'A link to a copied page points to its copy'
);
select is(
  (select d.document -> 1 -> 'props' ->> 'databaseId' from public.page_documents d join copy_result c on c.page_id = d.page_id),
  (select p.id::text from public.pages p join copy_result c on p.parent_id = c.page_id where p.title = 'Aufgaben'),
  'A database block shows the copied database'
);
select is(
  (select c.files from copy_result c),
  (select jsonb_build_array(jsonb_build_object(
     'from', 'a0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000002-bild.png',
     'to', c.page_id::text || '/c0000000-0000-4000-8000-000000000002-bild.png')) from copy_result c),
  'Existing files of copied pages are listed for copying'
);
select is(
  (select d.document -> 2 -> 'props' ->> 'url' from public.page_documents d join copy_result c on c.page_id = d.page_id),
  (select 'nodi-file:' || c.page_id::text || '/c0000000-0000-4000-8000-000000000002-bild.png' from copy_result c),
  'The image points to its copy in the folder of the copy'
);

-- 11-13: block views and database views use the copied database and properties
select is(
  (select b.database_id::text || ' ' || (b.config ->> 'groupByPropertyId')
   from public.block_views b join copy_result c on c.page_id = b.page_id),
  (select db.id::text || ' ' || pr.id::text
   from public.pages db join copy_result c on db.parent_id = c.page_id
   join public.database_properties pr on pr.database_id = db.id and pr.name = 'Status'),
  'The block view shows the copied database, grouped by the copied property'
);
select is(
  (select array_agg(v.type || ' ' || (v.config ->> 'groupByPropertyId') = 'table ' || pr.id::text)
   from public.pages db join copy_result c on db.parent_id = c.page_id
   join public.database_views v on v.database_id = db.id
   join public.database_properties pr on pr.database_id = db.id and pr.name = 'Status'),
  array[true],
  'The copied database has the copied view (not a second default one)'
);
select is(
  (select t.title from public.pages db join copy_result c on db.parent_id = c.page_id
   join public.pages t on t.id = db.default_template_id),
  'Vorlage',
  'The default template is the copied template'
);

-- 14-18: values, relations within the copy and to the outside
select is(
  (select v.value from public.page_property_values v
   join public.pages e on e.id = v.page_id and e.title = 'T1'
   join public.database_properties pr on pr.id = v.property_id and pr.name = 'Status'
   join public.pages db on db.id = e.parent_id join copy_result c on db.parent_id = c.page_id),
  '"todo"'::jsonb,
  'A copied entry has its values'
);
select is(
  (select v.value ->> 0 from public.page_property_values v
   join public.pages e on e.id = v.page_id and e.title = 'T2'
   join public.database_properties pr on pr.id = v.property_id and pr.name = 'Vorher'
   join public.pages db on db.id = e.parent_id join copy_result c on db.parent_id = c.page_id),
  (select e.id::text from public.pages e join public.pages db on db.id = e.parent_id
   join copy_result c on db.parent_id = c.page_id where e.title = 'T1'),
  'A relation within the copy links the copied entries'
);
select is(
  (select v.value ->> 0 from public.page_property_values v
   join public.pages e on e.id = v.page_id and e.title = 'T1'
   join public.database_properties pr on pr.id = v.property_id and pr.name = 'Nachher'
   join public.pages db on db.id = e.parent_id join copy_result c on db.parent_id = c.page_id),
  (select e.id::text from public.pages e join public.pages db on db.id = e.parent_id
   join copy_result c on db.parent_id = c.page_id where e.title = 'T2'),
  'Its other side links back within the copy'
);
select is(
  (select count(*)::integer from public.database_properties
   where database_id = 'a0000000-0000-4000-8000-000000000006' and type = 'relation'),
  2,
  'The outside database gets a new other side for the copy'
);
select is(
  (select array_agg(v.value ->> 0 order by v.value ->> 0)
   from public.page_property_values v
   where v.page_id = 'e0000000-0000-4000-8000-000000000009'),
  (select array_agg(id order by id) from (
     select 'e0000000-0000-4000-8000-000000000001' as id
     union all
     select e.id::text from public.pages e join public.pages db on db.id = e.parent_id
     join copy_result c on db.parent_id = c.page_id where e.title = 'T1') linked),
  'The outside entry links to the original and to the copied entry'
);

-- 19-20: a copied entry of a database outside the copy
delete from copy_result;
insert into copy_result select * from public.duplicate_page('e0000000-0000-4000-8000-000000000001');
select results_eq(
  $$select p.title, p.parent_id, p.position from public.pages p join copy_result c on c.page_id = p.id$$,
  $$values ('T1 (Kopie)'::text, 'a0000000-0000-4000-8000-000000000004'::uuid, 1.5::numeric)$$,
  'An entry is copied into its database, after the original'
);
select is(
  (select count(*)::integer from public.page_property_values v join copy_result c on c.page_id = v.page_id),
  4,
  'The copied entry has the values of the original (status, file, person, the link from T2)'
);

-- 21-22: a member copies into the workspace; private pages of others are left out
reset role;
insert into public.pages (id, workspace_id, owner_id, created_by, title, visibility) values
  ('a0000000-0000-4000-8000-000000000010', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Team', 'workspace');
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, visibility) values
  ('a0000000-0000-4000-8000-000000000011', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000010',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Geheim', 'private');
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
delete from copy_result;
insert into copy_result select * from public.duplicate_page('a0000000-0000-4000-8000-000000000010');
select results_eq(
  $$select p.title, p.visibility, p.owner_id from public.pages p join copy_result c on c.page_id = p.id$$,
  $$values ('Team (Kopie)'::text, 'workspace'::text, '22222222-2222-4222-8222-222222222222'::uuid)$$,
  'A member copies a workspace page and owns the copy'
);
select is(
  (select count(*)::integer from public.pages p join copy_result c on p.parent_id = c.page_id),
  0,
  'A private page of someone else is not copied'
);

select * from finish();
rollback;

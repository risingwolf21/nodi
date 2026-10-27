begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

-- Owner O and stranger X, each with a workspace.
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test', now()),
  ('33333333-3333-4333-8333-333333333333', 'other@nodi.test', now());
insert into public.workspaces (id, name, owner_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Andere', '33333333-3333-4333-8333-333333333333');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

-- A database "Aufgaben" with an entry "Einkauf" and its values; a page with
-- a page link and a mention.
insert into public.pages (id, workspace_id, owner_id, created_by, title, kind) values
  ('50000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Aufgaben', 'database');
insert into public.pages (id, workspace_id, owner_id, created_by, title, parent_id) values
  ('50000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Einkauf',
   '50000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Notizen', null);

insert into public.database_properties (id, database_id, name, type, options, position) values
  ('70000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'Notiz', 'text', '{}', 1),
  ('70000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', 'Status', 'status',
   '{"options": [{"id": "s1", "name": "In Bearbeitung", "color": "blue"}]}', 2),
  ('70000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000001', 'Schlagwörter', 'multi_select',
   '{"options": [{"id": "m1", "name": "Haushalt", "color": "gray"}, {"id": "m2", "name": "Wochenmarkt", "color": "red"}]}', 3),
  ('70000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000001', 'Ort', 'place', '{}', 4),
  ('70000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000001', 'Menge', 'number', '{}', 5);

select public.set_page_property('50000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000001',
  '"Milch und Brot"', now(), gen_random_uuid());
select public.set_page_property('50000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002',
  '"s1"', now(), gen_random_uuid());
select public.set_page_property('50000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000003',
  '["m1", "m2"]', now(), gen_random_uuid());
select public.set_page_property('50000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000004',
  '{"lat": 48.1, "lng": 11.5, "label": "Viktualienmarkt, München"}', now(), gen_random_uuid());
select public.set_page_property('50000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000005',
  '4711', now(), gen_random_uuid());

select public.save_page_document('50000000-0000-4000-8000-000000000003',
  '[{"type": "paragraph", "content": [
     {"type": "text", "text": "Siehe", "styles": {}},
     {"type": "pageLink", "props": {"pageId": "50000000-0000-4000-8000-000000000002", "title": "Einkaufsliste"}},
     {"type": "text", "text": "mit", "styles": {}},
     {"type": "mention", "props": {"userId": "33333333-3333-4333-8333-333333333333", "label": "other@nodi.test"}}
   ]}]',
  now(), gen_random_uuid());

-- 1: page links and mentions are part of the text, in order
select is(
  (select search_text from public.page_documents where page_id = '50000000-0000-4000-8000-000000000003'),
  'Siehe Einkaufsliste mit other@nodi.test',
  'The titles of page links and the labels of mentions are searchable text'
);

-- 2: a page link title finds the page that holds the link
select results_eq(
  $$select title from public.search_pages('kaufsliste')$$,
  $$values ('Notizen'::text)$$,
  'A page is found by the title of a page link in it'
);

-- 3-7: values of the types that hold text, with "Property: value" as snippet
select results_eq(
  $$select title, snippet from public.search_pages('brot')$$,
  $$values ('Einkauf'::text, 'Notiz: Milch und Brot'::text)$$,
  'Text values are found'
);
select results_eq(
  $$select snippet from public.search_pages('bearbeitung')$$,
  $$values ('Status: In Bearbeitung'::text)$$,
  'The name of a chosen status is found, not its id'
);
select results_eq(
  $$select snippet from public.search_pages('wochenmarkt')$$,
  $$values ('Schlagwörter: Haushalt, Wochenmarkt'::text)$$,
  'The names of chosen options are found'
);
select results_eq(
  $$select snippet from public.search_pages('viktualien')$$,
  $$values ('Ort: Viktualienmarkt, München'::text)$$,
  'The label of a place is found'
);
select is((select count(*)::integer from public.search_pages('s1')), 0, 'Option ids are not searched');

-- 8: numbers are not text
select is((select count(*)::integer from public.search_pages('4711')), 0, 'Numbers are not searched');

-- 9: an entry in the trash is not found by its values
update public.pages set is_archived = true where id = '50000000-0000-4000-8000-000000000002';
select is((select count(*)::integer from public.search_pages('brot')), 0, 'Archived entries are not found');
update public.pages set is_archived = false where id = '50000000-0000-4000-8000-000000000002';

-- 10: the stranger finds nothing of it
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select is((select count(*)::integer from public.search_pages('brot')), 0, 'RLS decides which values are found');

select * from finish();

rollback;

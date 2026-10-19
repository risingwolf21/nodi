begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

-- Owner O and member M of workspace W; X has workspace W2 with database Z.
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

-- Shared databases Projekte (P) and Aufgaben (T), a private database Q.
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, kind, visibility) values
  ('d0000000-0000-4000-8000-00000000000a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Projekte', 'database', 'workspace'),
  ('d0000000-0000-4000-8000-00000000000b', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Aufgaben', 'database', 'workspace'),
  ('d0000000-0000-4000-8000-00000000000c', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null,
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Privat', 'database', 'private');
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, visibility) values
  ('e0000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd0000000-0000-4000-8000-00000000000a',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Website', 'workspace'),
  ('e0000000-0000-4000-8000-0000000000a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd0000000-0000-4000-8000-00000000000a',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Newsletter', 'workspace'),
  ('e0000000-0000-4000-8000-0000000000b1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd0000000-0000-4000-8000-00000000000b',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Entwurf', 'workspace'),
  ('e0000000-0000-4000-8000-0000000000b2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd0000000-0000-4000-8000-00000000000b',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Texte', 'workspace'),
  -- A private entry of the shared database: only O edits it.
  ('e0000000-0000-4000-8000-0000000000b3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd0000000-0000-4000-8000-00000000000b',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Geheim', 'private');
insert into public.database_properties (id, database_id, name, type) values
  ('f0000000-0000-4000-8000-0000000000a9', 'd0000000-0000-4000-8000-00000000000a', 'Notiz', 'text');

create function pg_temp.property(database uuid, property_name text) returns uuid
language sql as $$
  select id from public.database_properties where database_id = database and name = property_name
$$;
create function pg_temp.relation_value(page uuid, property uuid) returns jsonb
language sql as $$
  select value from public.page_property_values where page_id = page and property_id = property
$$;
-- now() stays the same within the test's transaction and later times are
-- capped to it: each write gets a later time before now() (LWW order).
create function pg_temp.set(page uuid, property uuid, value jsonb, edited_at timestamptz default null)
returns boolean
language sql as $$
  select applied from public.set_page_property(page, property, value, coalesce(edited_at, clock_timestamp() - interval '1 hour'), gen_random_uuid())
$$;

-- 1-2: a relation is created with its other side
select lives_ok(
  $$select public.add_relation_property('d0000000-0000-4000-8000-00000000000a', 'Aufgaben',
    'd0000000-0000-4000-8000-00000000000b', 'Projekte')$$,
  'Editors of both databases create a relation'
);
select results_eq(
  $$select database_id, type, options from public.database_properties where type = 'relation' order by name$$,
  $$values
    ('d0000000-0000-4000-8000-00000000000a'::uuid, 'relation',
     jsonb_build_object('databaseId', 'd0000000-0000-4000-8000-00000000000b',
       'pairedPropertyId', pg_temp.property('d0000000-0000-4000-8000-00000000000b', 'Projekte'))),
    ('d0000000-0000-4000-8000-00000000000b'::uuid, 'relation',
     jsonb_build_object('databaseId', 'd0000000-0000-4000-8000-00000000000a',
       'pairedPropertyId', pg_temp.property('d0000000-0000-4000-8000-00000000000a', 'Aufgaben')))$$,
  'Both sides point to each other'
);

-- 3-6: only the server makes and changes relations
select throws_ok(
  $$insert into public.database_properties (database_id, name, type, options)
    values ('d0000000-0000-4000-8000-00000000000a', 'Direkt', 'relation', '{}')$$,
  '42501', null, 'A relation cannot be inserted directly'
);
select throws_ok(
  $$update public.database_properties set type = 'text'
    where id = pg_temp.property('d0000000-0000-4000-8000-00000000000a', 'Aufgaben')$$,
  '22023', null, 'A relation keeps its type'
);
select throws_ok(
  $$update public.database_properties set options = '{"databaseId": "d0000000-0000-4000-8000-00000000000c"}'
    where id = pg_temp.property('d0000000-0000-4000-8000-00000000000a', 'Aufgaben')$$,
  '42501', null, 'The target of a relation cannot be changed'
);
select throws_ok(
  $$update public.database_properties set type = 'relation' where id = 'f0000000-0000-4000-8000-0000000000a9'$$,
  '22023', null, 'No property becomes a relation'
);

-- 7-10: values are kept equal on both sides
select ok(
  pg_temp.set('e0000000-0000-4000-8000-0000000000a1', pg_temp.property('d0000000-0000-4000-8000-00000000000a', 'Aufgaben'),
    '["e0000000-0000-4000-8000-0000000000b1", "e0000000-0000-4000-8000-0000000000b2", "e0000000-0000-4000-8000-0000000000b1"]'),
  'Entries are linked'
);
select results_eq(
  $$select pg_temp.relation_value('e0000000-0000-4000-8000-0000000000a1', pg_temp.property('d0000000-0000-4000-8000-00000000000a', 'Aufgaben')),
           pg_temp.relation_value('e0000000-0000-4000-8000-0000000000b1', pg_temp.property('d0000000-0000-4000-8000-00000000000b', 'Projekte')),
           pg_temp.relation_value('e0000000-0000-4000-8000-0000000000b2', pg_temp.property('d0000000-0000-4000-8000-00000000000b', 'Projekte'))$$,
  $$values ('["e0000000-0000-4000-8000-0000000000b1", "e0000000-0000-4000-8000-0000000000b2"]'::jsonb,
            '["e0000000-0000-4000-8000-0000000000a1"]'::jsonb,
            '["e0000000-0000-4000-8000-0000000000a1"]'::jsonb)$$,
  'Duplicates are dropped; the linked entries link back'
);
select ok(
  pg_temp.set('e0000000-0000-4000-8000-0000000000a1', pg_temp.property('d0000000-0000-4000-8000-00000000000a', 'Aufgaben'),
    '["e0000000-0000-4000-8000-0000000000b2"]')
  and pg_temp.set('e0000000-0000-4000-8000-0000000000a2', pg_temp.property('d0000000-0000-4000-8000-00000000000a', 'Aufgaben'),
    '["e0000000-0000-4000-8000-0000000000b2"]'),
  'Links change'
);
select results_eq(
  $$select pg_temp.relation_value('e0000000-0000-4000-8000-0000000000b1', pg_temp.property('d0000000-0000-4000-8000-00000000000b', 'Projekte')),
           pg_temp.relation_value('e0000000-0000-4000-8000-0000000000b2', pg_temp.property('d0000000-0000-4000-8000-00000000000b', 'Projekte'))$$,
  $$values ('null'::jsonb,
            '["e0000000-0000-4000-8000-0000000000a1", "e0000000-0000-4000-8000-0000000000a2"]'::jsonb)$$,
  'An unlinked entry loses the link back; the other side collects links'
);

-- 11-12: the other side is a list of entries as well
select ok(
  pg_temp.set('e0000000-0000-4000-8000-0000000000b2', pg_temp.property('d0000000-0000-4000-8000-00000000000b', 'Projekte'),
    '["e0000000-0000-4000-8000-0000000000a2"]'),
  'Editing the other side works the same way'
);
select is(
  pg_temp.relation_value('e0000000-0000-4000-8000-0000000000a1', pg_temp.property('d0000000-0000-4000-8000-00000000000a', 'Aufgaben')),
  'null'::jsonb,
  'Unlinking from the other side unlinks here'
);

-- 13: an older write (LWW) changes nothing on either side
select is(
  pg_temp.set('e0000000-0000-4000-8000-0000000000a2', pg_temp.property('d0000000-0000-4000-8000-00000000000a', 'Aufgaben'),
    'null', '2000-01-01'),
  false,
  'An older write is not applied'
);

-- 14-15: only entries of the related database, as a list
select throws_ok(
  $$select pg_temp.set('e0000000-0000-4000-8000-0000000000a1', pg_temp.property('d0000000-0000-4000-8000-00000000000a', 'Aufgaben'),
    '["e0000000-0000-4000-8000-0000000000a2"]')$$,
  '22023', null, 'An entry of another database cannot be linked'
);
select throws_ok(
  $$select pg_temp.set('e0000000-0000-4000-8000-0000000000a1', pg_temp.property('d0000000-0000-4000-8000-00000000000a', 'Aufgaben'),
    '"e0000000-0000-4000-8000-0000000000b1"')$$,
  '22023', null, 'A relation value is a list'
);

-- 16: linking changes the linked entry, which needs edit rights on it
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select throws_ok(
  $$select pg_temp.set('e0000000-0000-4000-8000-0000000000a2', pg_temp.property('d0000000-0000-4000-8000-00000000000a', 'Aufgaben'),
    '["e0000000-0000-4000-8000-0000000000b2", "e0000000-0000-4000-8000-0000000000b3"]')$$,
  '42501', null, 'An entry the member cannot edit cannot be linked'
);

-- 17: a relation needs edit rights on both databases
select throws_ok(
  $$select public.add_relation_property('d0000000-0000-4000-8000-00000000000b', 'Privat',
    'd0000000-0000-4000-8000-00000000000c', 'Aufgaben')$$,
  '42501', null, 'Without edit rights on the other database there is no relation'
);

-- 18-19: only databases of the same workspace
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
insert into public.pages (id, workspace_id, owner_id, created_by, title, kind, visibility)
values ('d0000000-0000-4000-8000-00000000000f', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        '33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'Fremd', 'database', 'private');
select public.share_page('d0000000-0000-4000-8000-00000000000f', 'owner@nodi.test', 'edit');
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select throws_ok(
  $$select public.add_relation_property('d0000000-0000-4000-8000-00000000000a', 'Fremd',
    'd0000000-0000-4000-8000-00000000000f', 'Projekte')$$,
  '22023', null, 'A database of another workspace cannot be related'
);
select throws_ok(
  $$select public.add_relation_property('d0000000-0000-4000-8000-00000000000a', 'Eintrag',
    'e0000000-0000-4000-8000-0000000000b1', 'Projekte')$$,
  '22023', null, 'Only databases can be related'
);

-- 20: a relation within one database (two properties)
select public.add_relation_property('d0000000-0000-4000-8000-00000000000b', 'Unteraufgaben',
  'd0000000-0000-4000-8000-00000000000b', 'Oberaufgabe');
select pg_temp.set('e0000000-0000-4000-8000-0000000000b1', pg_temp.property('d0000000-0000-4000-8000-00000000000b', 'Unteraufgaben'),
  '["e0000000-0000-4000-8000-0000000000b2"]');
select is(
  pg_temp.relation_value('e0000000-0000-4000-8000-0000000000b2', pg_temp.property('d0000000-0000-4000-8000-00000000000b', 'Oberaufgabe')),
  '["e0000000-0000-4000-8000-0000000000b1"]'::jsonb,
  'Entries of one database link each other'
);

-- 21-22: deleting one side deletes the other, with rights on both
select public.add_relation_property('d0000000-0000-4000-8000-00000000000c', 'Aufgaben',
  'd0000000-0000-4000-8000-00000000000b', 'Privat');
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select throws_ok(
  $$delete from public.database_properties
    where id = pg_temp.property('d0000000-0000-4000-8000-00000000000b', 'Privat')$$,
  '42501', null, 'The member cannot delete a relation whose other side is private'
);
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
delete from public.database_properties where id = pg_temp.property('d0000000-0000-4000-8000-00000000000b', 'Privat');
select is(
  pg_temp.property('d0000000-0000-4000-8000-00000000000c', 'Aufgaben'),
  null,
  'Deleting one side deletes the other'
);

-- 23: a deleted database takes the other sides of its relations with it
delete from public.pages where id = 'd0000000-0000-4000-8000-00000000000a';
select is(
  pg_temp.property('d0000000-0000-4000-8000-00000000000b', 'Projekte'),
  null,
  'The relation back to a deleted database is gone'
);

select * from finish();

rollback;

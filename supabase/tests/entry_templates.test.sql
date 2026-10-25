begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

-- Owner O of workspace W; reader R with a read share on the database.
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test', now()),
  ('33333333-3333-4333-8333-333333333333', 'reader@nodi.test', now());
insert into public.workspaces (id, name, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team', '11111111-1111-4111-8111-111111111111');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

insert into public.pages (id, workspace_id, owner_id, created_by, title, kind)
values ('d0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Besprechungen', 'database');
insert into public.database_properties (id, database_id, name, type)
values ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Ort', 'text');

-- 1-3: templates are entries
select throws_ok(
  $$insert into public.pages (workspace_id, owner_id, created_by, title, is_template)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
            '11111111-1111-4111-8111-111111111111', 'Lose', true)$$,
  '22023', null, 'A page outside a database is no template'
);
select lives_ok(
  $$insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, icon, is_template, position)
    values ('70000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'd0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
            '11111111-1111-4111-8111-111111111111', 'Wochentreffen', '📅', true, 1)$$,
  'An entry is a template'
);
select public.set_page_property('70000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
  '"Raum 2"', now(), gen_random_uuid());
select public.save_page_document('70000000-0000-4000-8000-000000000001',
  '[{"type": "heading", "content": "Agenda"}]', now(), gen_random_uuid());
select throws_ok(
  $$select public.create_entry_from_template('d0000000-0000-4000-8000-000000000001')$$,
  '22023', null, 'Only templates make entries'
);

-- 4-6: a new entry with the template's title, icon, values and text; no template itself
select lives_ok(
  $$select public.create_entry_from_template('70000000-0000-4000-8000-000000000001')$$,
  'An entry is made from the template'
);
select results_eq(
  $$select title, icon, is_template, position from public.pages
    where parent_id = 'd0000000-0000-4000-8000-000000000001' and id <> '70000000-0000-4000-8000-000000000001'$$,
  $$values ('Wochentreffen'::text, '📅'::text, false, 2::numeric)$$,
  'It is an entry at the end with title and icon'
);
select is(
  (select count(*)::integer from public.page_property_values v join public.page_documents d on d.page_id = v.page_id
   where v.value = '"Raum 2"' and d.document @> '[{"content": "Agenda"}]'),
  2,
  'It has the values and the text'
);

-- 7-8: readers make no entries; templates can be ordinary entries again
reset role;
insert into public.page_shares (page_id, shared_with_user_id, permission, created_by)
values ('d0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'read',
        '11111111-1111-4111-8111-111111111111');
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select throws_ok(
  $$select public.create_entry_from_template('70000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'A reader makes no entries from a template'
);
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select lives_ok(
  $$update public.pages set is_template = false where id = '70000000-0000-4000-8000-000000000001'$$,
  'A template becomes an ordinary entry'
);

select * from finish();

rollback;

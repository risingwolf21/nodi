begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

-- Owner O with a database D and entry E
insert into auth.users (id, email, email_confirmed_at)
values ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test', now());
insert into public.workspaces (id, name, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team', '11111111-1111-4111-8111-111111111111');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

insert into public.pages (id, workspace_id, owner_id, created_by, title, kind)
values ('d0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Projekte', 'database');
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title)
values ('e0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'd0000000-0000-4000-8000-000000000001',
        '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Website');

-- 1-2: a rollup property, set up or not yet
select lives_ok(
  $$insert into public.database_properties (id, database_id, name, type, options)
    values ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Stunden', 'rollup',
            '{"relationPropertyId": "a", "targetPropertyId": "title", "function": "count_all"}')$$,
  'A rollup property with settings can be added'
);
select lives_ok(
  $$insert into public.database_properties (database_id, name, type)
    values ('d0000000-0000-4000-8000-000000000001', 'Neu', 'rollup')$$,
  'A rollup property may start without settings'
);

-- 3-4: the settings have the expected form
select throws_ok(
  $$update public.database_properties set options = '{"function": "everything"}'
    where id = 'f0000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'An unknown function is rejected'
);
select throws_ok(
  $$update public.database_properties set options = '{"relationPropertyId": 7}'
    where id = 'f0000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'The relation is given by its id as text'
);

-- 5-6: the app computes rollups; nothing can be stored for them
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
    '3', now(), gen_random_uuid())$$,
  '22023', null, 'A rollup has no stored value'
);
select lives_ok(
  $$update public.database_properties
    set options = '{"relationPropertyId": "a", "targetPropertyId": "b", "function": "sum"}'
    where id = 'f0000000-0000-4000-8000-000000000001'$$,
  'Editors change the settings'
);

select * from finish();

rollback;

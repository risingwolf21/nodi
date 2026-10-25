begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

-- Owner O with a database D, an entry E, a person property P and a files property F
insert into auth.users (id, email, email_confirmed_at)
values ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test', now());
insert into public.workspaces (id, name, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team', '11111111-1111-4111-8111-111111111111');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

insert into public.pages (id, workspace_id, owner_id, created_by, title, kind)
values ('d0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Aufgaben', 'database');
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title)
values ('e0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'd0000000-0000-4000-8000-000000000001',
        '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Bericht');

-- 1-2: the new types exist
select lives_ok(
  $$insert into public.database_properties (id, database_id, name, type)
    values ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Zuständig', 'person')$$,
  'A person property can be added'
);
select lives_ok(
  $$insert into public.database_properties (id, database_id, name, type)
    values ('f0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'Anhänge', 'files')$$,
  'A files property can be added'
);

-- 3-4: valid values (fixed, increasing edit times)
select lives_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
    '["11111111-1111-4111-8111-111111111111"]', '2026-10-20T10:00:00Z', gen_random_uuid())$$,
  'A person value with user ids is stored'
);
select lives_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002',
    '["e0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001-Plan.pdf"]',
    '2026-10-20T10:00:00Z', gen_random_uuid())$$,
  'A files value with storage paths is stored'
);
select results_eq(
  $$select value from public.page_property_values
    where page_id = 'e0000000-0000-4000-8000-000000000001' order by property_id$$,
  $$values ('["11111111-1111-4111-8111-111111111111"]'::jsonb),
           ('["e0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001-Plan.pdf"]'::jsonb)$$,
  'Both values are kept'
);

-- 6-12: invalid values are rejected with 22023
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
    '"11111111-1111-4111-8111-111111111111"', now(), gen_random_uuid())$$,
  '22023', null, 'A person value must be an array'
);
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
    '["owner@nodi.test"]', now(), gen_random_uuid())$$,
  '22023', null, 'A person value holds user ids, not e-mail addresses'
);
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
    (select jsonb_agg(gen_random_uuid()) from generate_series(1, 101)), now(), gen_random_uuid())$$,
  '22023', null, 'At most 100 people'
);
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002',
    '["https://example.com/plan.pdf"]', now(), gen_random_uuid())$$,
  '22023', null, 'A files value holds storage paths, not URLs'
);
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002',
    '["e0000000-0000-4000-8000-000000000001/../geheim.pdf"]', now(), gen_random_uuid())$$,
  '22023', null, 'A path outside the form <page>/<id>-<name> is rejected'
);
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002',
    '[{"path": "e0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001-Plan.pdf"}]',
    now(), gen_random_uuid())$$,
  '22023', null, 'A files value holds strings only'
);
select lives_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002',
    'null', '2026-10-20T10:00:01Z', gen_random_uuid())$$,
  'A files value can be cleared'
);

select * from finish();
rollback;

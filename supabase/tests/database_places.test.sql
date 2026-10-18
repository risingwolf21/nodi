begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

-- Owner O with a database D, entry E and a place property P
insert into auth.users (id, email, email_confirmed_at)
values ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test', now());
insert into public.workspaces (id, name, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team', '11111111-1111-4111-8111-111111111111');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

insert into public.pages (id, workspace_id, owner_id, created_by, title, kind)
values ('d0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Orte', 'database');
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title)
values ('e0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'd0000000-0000-4000-8000-000000000001',
        '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Büro');

-- 1-2: the new types exist
select lives_ok(
  $$insert into public.database_properties (id, database_id, name, type)
    values ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Ort', 'place')$$,
  'A place property can be added'
);
select lives_ok(
  $$insert into public.database_views (database_id, name, type)
    values ('d0000000-0000-4000-8000-000000000001', 'Landkarte', 'map')$$,
  'A map view can be added'
);

-- 3-4: valid places
select lives_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
    '{"lat": 48.1372, "lng": 11.5756, "label": "Marienplatz, München"}', now(), gen_random_uuid())$$,
  'A place with coordinates and a label is stored'
);
select lives_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
    '{"lat": -90, "lng": 180}', now(), gen_random_uuid())$$,
  'A place without a label is stored (edges of the range included)'
);
select results_eq(
  $$select value from public.page_property_values
    where page_id = 'e0000000-0000-4000-8000-000000000001' and property_id = 'f0000000-0000-4000-8000-000000000001'$$,
  $$values ('{"lat": -90, "lng": 180}'::jsonb)$$,
  'The last place is kept'
);

-- 6-11: invalid places are rejected with 22023, never with a cast error
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
    '{"lat": 91, "lng": 0}', now(), gen_random_uuid())$$,
  '22023', null, 'A latitude beyond 90 is rejected'
);
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
    '{"lat": 0, "lng": -180.5}', now(), gen_random_uuid())$$,
  '22023', null, 'A longitude beyond 180 is rejected'
);
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
    '{"lat": "48", "lng": 11}', now(), gen_random_uuid())$$,
  '22023', null, 'Coordinates must be numbers'
);
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
    '[48, 11]', now(), gen_random_uuid())$$,
  '22023', null, 'A place is an object, not a list'
);
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
    '{"lat": 48, "lng": 11, "zoom": 12}', now(), gen_random_uuid())$$,
  '22023', null, 'Unknown keys are rejected'
);
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
    jsonb_build_object('lat', 48, 'lng', 11, 'label', repeat('x', 501)), now(), gen_random_uuid())$$,
  '22023', null, 'A label longer than 500 characters is rejected'
);

select * from finish();

rollback;

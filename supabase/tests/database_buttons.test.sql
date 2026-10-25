begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

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

select lives_ok(
  $$insert into public.database_properties (id, database_id, name, type)
    values ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Knopf', 'button')$$,
  'A button can be added before it is set up'
);
select lives_ok(
  $$update public.database_properties
    set options = '{"label": "Erledigt", "actions": [{"propertyId": "x", "value": true}, {"propertyId": "y", "today": true}]}'
    where id = 'f0000000-0000-4000-8000-000000000001'$$,
  'A button gets a label and actions'
);
select throws_ok(
  $$update public.database_properties set options = '{"actions": [{"value": true}]}'
    where id = 'f0000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'An action names its property'
);
select throws_ok(
  $$update public.database_properties set options = jsonb_build_object('label', repeat('x', 101))
    where id = 'f0000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'A label has at most 100 characters'
);
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
    'true', now(), gen_random_uuid())$$,
  '22023', null, 'A button has no value of its own'
);

select * from finish();
rollback;

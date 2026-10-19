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
        '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Rechnungen', 'database');
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title)
values ('e0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'd0000000-0000-4000-8000-000000000001',
        '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Büro');

-- 1-2: a formula property, with and without an expression
select lives_ok(
  $$insert into public.database_properties (id, database_id, name, type, options)
    values ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Brutto', 'formula',
            '{"expression": "prop(\"Netto\") * 1.19"}')$$,
  'A formula property with an expression can be added'
);
select lives_ok(
  $$insert into public.database_properties (database_id, name, type)
    values ('d0000000-0000-4000-8000-000000000001', 'Neu', 'formula')$$,
  'A formula property may start without an expression'
);

-- 3-4: the expression is text of reasonable length
select throws_ok(
  $$update public.database_properties set options = '{"expression": 42}'
    where id = 'f0000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'The expression must be text'
);
select throws_ok(
  $$update public.database_properties set options = jsonb_build_object('expression', repeat('x', 2001))
    where id = 'f0000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'An expression longer than 2000 characters is rejected'
);

-- 5-6: the app computes formulas; nothing can be stored for them
select throws_ok(
  $$select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
    '119', now(), gen_random_uuid())$$,
  '22023', null, 'A formula has no stored value'
);
select lives_ok(
  $$update public.database_properties set options = '{"expression": "1 + 1"}'
    where id = 'f0000000-0000-4000-8000-000000000001'$$,
  'Editors change the expression'
);

select * from finish();

rollback;

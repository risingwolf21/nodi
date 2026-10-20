begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

insert into auth.users (id, email, email_confirmed_at)
values ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test', now());
insert into public.workspaces (id, name, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team', '11111111-1111-4111-8111-111111111111');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

insert into public.pages (id, workspace_id, owner_id, created_by, title, kind) values
  ('d0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Projekte', 'database'),
  ('c0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Plan', 'page');

select lives_ok(
  $$insert into public.database_views (database_id, name, type)
    values ('d0000000-0000-4000-8000-000000000001', 'Zeitleiste', 'timeline')$$,
  'A database has a timeline view'
);
select lives_ok(
  $$insert into public.block_views (page_id, block_id, database_id, name, type)
    values ('c0000000-0000-4000-8000-000000000001', 'block-1', 'd0000000-0000-4000-8000-000000000001',
            'Zeitleiste', 'timeline')$$,
  'A database block has a timeline view'
);
select throws_ok(
  $$insert into public.database_views (database_id, name, type)
    values ('d0000000-0000-4000-8000-000000000001', 'Gantt', 'gantt')$$,
  '23514', null, 'Other view types are still rejected'
);

select * from finish();
rollback;

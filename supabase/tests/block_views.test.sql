begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

-- Owner O and member M of workspace W.
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test', now()),
  ('22222222-2222-4222-8222-222222222222', 'member@nodi.test', now());
insert into public.workspaces (id, name, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team', '11111111-1111-4111-8111-111111111111');
insert into public.workspace_members (workspace_id, user_id, role)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

-- A shared page "Übersicht" and a shared database "Aufgaben"; a private database "Geheim".
insert into public.pages (id, workspace_id, owner_id, created_by, title, kind, visibility) values
  ('50000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Übersicht', 'page', 'workspace'),
  ('d0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Aufgaben', 'database', 'workspace'),
  ('d0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Geheim', 'database', 'private');

-- 1-3: views of a block in the page
select lives_ok(
  $$insert into public.block_views (id, page_id, block_id, database_id, name, type, config)
    values ('b0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'block-1',
            'd0000000-0000-4000-8000-000000000001', 'Board', 'board', '{"hiddenPropertyIds": []}')$$,
  'An editor of the page adds a view of a database to a block'
);
select throws_ok(
  $$insert into public.block_views (page_id, block_id, database_id, name, type)
    values ('50000000-0000-4000-8000-000000000001', 'block-1', '50000000-0000-4000-8000-000000000001', 'X', 'table')$$,
  '22023', null, 'Only a database can be shown'
);
select throws_ok(
  $$insert into public.block_views (page_id, block_id, database_id, name, type)
    values ('50000000-0000-4000-8000-000000000001', 'block-1', 'd0000000-0000-4000-8000-000000000001', 'X', 'chart')$$,
  '23514', null, 'Only the known view types'
);

-- 4: they do not show up as views of the database
select is(
  (select count(*)::integer from public.database_views where database_id = 'd0000000-0000-4000-8000-000000000001'),
  1,
  'The database keeps only its own view'
);

-- 5-8: a member edits the shared page; a database they cannot read stays hidden
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is(
  (select count(*)::integer from public.block_views where block_id = 'block-1'),
  1,
  'Readers of page and database see the block views'
);
select lives_ok(
  $$update public.block_views set config = '{"filter": []}' where id = 'b0000000-0000-4000-8000-000000000001'$$,
  'Editors of the page change them'
);
select throws_ok(
  $$insert into public.block_views (page_id, block_id, database_id, name, type)
    values ('50000000-0000-4000-8000-000000000001', 'block-2', 'd0000000-0000-4000-8000-000000000002', 'X', 'table')$$,
  '42501', null, 'A database the member cannot read cannot be shown'
);
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
insert into public.block_views (page_id, block_id, database_id, name, type)
values ('50000000-0000-4000-8000-000000000001', 'block-2', 'd0000000-0000-4000-8000-000000000002', 'Geheim', 'table');
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is(
  (select count(*)::integer from public.block_views where block_id = 'block-2'),
  0,
  'Views of a database the member cannot read stay hidden'
);

-- 9: without edit rights on the page nothing changes (private page of O)
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
insert into public.pages (id, workspace_id, owner_id, created_by, title, visibility)
values ('90000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Notizen', 'private');
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select throws_ok(
  $$insert into public.block_views (page_id, block_id, database_id, name, type)
    values ('90000000-0000-4000-8000-000000000001', 'block-3', 'd0000000-0000-4000-8000-000000000001', 'X', 'table')$$,
  '42501', null, 'Without edit rights on the page there are no block views'
);

-- 10: deleting the page deletes its block views
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
update public.pages set is_archived = true where id = '50000000-0000-4000-8000-000000000001';
delete from public.pages where id = '50000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::integer from public.block_views),
  0,
  'Block views go with their page'
);

select * from finish();

rollback;

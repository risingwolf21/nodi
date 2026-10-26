begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

-- O owns workspace W with a private page P, a database D with entry E;
-- S is a stranger, R receives a share on P later.
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111', 'o@nodi.test', now()),
  ('22222222-2222-4222-8222-222222222222', 'r@nodi.test', now()),
  ('33333333-3333-4333-8333-333333333333', 's@nodi.test', now());
insert into public.workspaces (id, name, owner_id) values
  ('a1000000-0000-4000-8000-000000000000', 'Team', '11111111-1111-4111-8111-111111111111');

-- 1: the table is in the Realtime publication
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'page_activity'),
  'page_activity is published to Realtime'
);

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

-- 2-3: a new page records a 'page' change by its author
insert into public.pages (id, workspace_id, owner_id, created_by, title) values
  ('b0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000000',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'P');
select results_eq(
  $$select workspace_id, change, actor from public.page_activity where page_id = 'b0000000-0000-4000-8000-000000000001'$$,
  $$values ('a1000000-0000-4000-8000-000000000000'::uuid, 'page', '11111111-1111-4111-8111-111111111111'::uuid)$$,
  'A new page is a page change by its author'
);
select throws_ok(
  $$insert into public.page_activity (page_id, workspace_id, change) values (gen_random_uuid(), gen_random_uuid(), 'page')$$,
  '42501', null, 'Users cannot write activity themselves'
);

-- 4: saving the text is a document change
select public.save_page_document('b0000000-0000-4000-8000-000000000001', '[]', now(), gen_random_uuid());
select is(
  (select change from public.page_activity where page_id = 'b0000000-0000-4000-8000-000000000001'),
  'document', 'Saving the text is a document change'
);

-- 5-7: properties and values are changes of the database
insert into public.pages (id, workspace_id, owner_id, created_by, title, kind) values
  ('d0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000000',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'D', 'database');
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title) values
  ('e0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000000',
   'd0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   '11111111-1111-4111-8111-111111111111', 'E');
insert into public.database_properties (id, database_id, name, type) values
  ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Notiz', 'text');
select is(
  (select change from public.page_activity where page_id = 'd0000000-0000-4000-8000-000000000001'),
  'properties', 'A new property is a properties change of the database'
);
reset role;
update public.page_activity set change = 'page' where page_id = 'd0000000-0000-4000-8000-000000000001';
set local role authenticated;
select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
  '"Hallo"', now(), gen_random_uuid());
select is(
  (select change from public.page_activity where page_id = 'd0000000-0000-4000-8000-000000000001'),
  'properties', 'A value of an entry is a properties change of its database'
);
select throws_ok(
  $$update public.page_activity set change = 'page'$$,
  '42501', null, 'Users cannot change activity'
);

-- 8: a comment is a comments change
insert into public.page_comments (page_id, body) values ('b0000000-0000-4000-8000-000000000001', 'Frage');
select is(
  (select change from public.page_activity where page_id = 'b0000000-0000-4000-8000-000000000001'),
  'comments', 'A comment is a comments change'
);

-- 9-10: only readers see the activity of a page
select is((select count(*)::int from public.page_activity), 3, 'The owner sees the activity of their pages');
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select is_empty($$select 1 from public.page_activity$$, 'A stranger sees no activity');

-- 11-13: a share is a page change, and the person it is shared with sees it
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is_empty($$select 1 from public.page_activity$$, 'Before the share R sees nothing');
reset role;
insert into public.page_shares (page_id, shared_with_user_id, permission, created_by) values
  ('b0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'read',
   '11111111-1111-4111-8111-111111111111');
set local role authenticated;
select results_eq(
  $$select page_id, change from public.page_activity$$,
  $$values ('b0000000-0000-4000-8000-000000000001'::uuid, 'page')$$,
  'R sees the shared page, and the share is a page change'
);
select is_empty(
  $$select 1 from public.page_activity where page_id = 'd0000000-0000-4000-8000-000000000001'$$,
  'R does not see the activity of pages not shared'
);

-- 14-15: a page deleted for good leaves a row nobody can read
reset role;
delete from public.pages where id = 'b0000000-0000-4000-8000-000000000001';
select isnt_empty(
  $$select 1 from public.page_activity where page_id = 'b0000000-0000-4000-8000-000000000001'$$,
  'The row stays (no delete events for Realtime)'
);
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select is_empty(
  $$select 1 from public.page_activity where page_id = 'b0000000-0000-4000-8000-000000000001'$$,
  'Nobody reads the activity of a deleted page'
);

select * from finish();
rollback;

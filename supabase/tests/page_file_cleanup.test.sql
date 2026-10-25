begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- O owns P (with subpage C) and Q; each page has files. D deletes their account.
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111', 'o@nodi.test', now()),
  ('44444444-4444-4444-8444-444444444444', 'd@nodi.test', now());
insert into public.workspaces (id, name, owner_id) values
  ('a1000000-0000-4000-8000-000000000000', 'Team', '11111111-1111-4111-8111-111111111111'),
  ('a4000000-0000-4000-8000-000000000000', 'Von D', '44444444-4444-4444-8444-444444444444');
insert into public.pages (id, workspace_id, owner_id, created_by, title, parent_id) values
  ('b0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000000',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'P', null),
  ('b0000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000000',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'C',
   'b0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000000',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Q', null),
  ('b0000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000000',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Ohne Dateien', null),
  ('b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000000',
   '44444444-4444-4444-8444-444444444444', '44444444-4444-4444-8444-444444444444', 'Von D', null);
insert into storage.objects (bucket_id, name, owner_id) values
  ('page-files', 'b0000000-0000-4000-8000-000000000001/f1-a.png', '11111111-1111-4111-8111-111111111111'),
  ('page-files', 'b0000000-0000-4000-8000-000000000001/f2-b.pdf', '11111111-1111-4111-8111-111111111111'),
  ('page-files', 'b0000000-0000-4000-8000-000000000002/f3-c.png', '11111111-1111-4111-8111-111111111111'),
  ('page-files', 'b0000000-0000-4000-8000-000000000003/f4-q.png', '11111111-1111-4111-8111-111111111111'),
  ('page-files', 'b4000000-0000-4000-8000-000000000001/f5-d.png', '44444444-4444-4444-8444-444444444444');

-- 1-3: only the server reads the queue and runs the function
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select throws_ok($$select * from public.page_file_deletions$$, '42501', null, 'Users cannot read the queue');
select throws_ok(
  $$select public.next_page_file_deletions(10)$$, '42501', null, 'Users cannot run the cleanup function'
);
set local role anon;
select throws_ok(
  $$select public.next_page_file_deletions(10)$$, '42501', null, 'Anonymous callers cannot run it either'
);
reset role;

-- 4: a page deleted for good is queued with its subpages (cascade)
delete from public.pages where id in ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004');
select set_eq(
  $$select page_id from public.page_file_deletions$$,
  $$values ('b0000000-0000-4000-8000-000000000001'::uuid), ('b0000000-0000-4000-8000-000000000002'::uuid),
           ('b0000000-0000-4000-8000-000000000004'::uuid)$$,
  'Deleted pages and their subpages are queued'
);

-- 5-7: the function returns the files of deleted pages, not of others
set local role service_role;
select set_eq(
  $$select public.next_page_file_deletions(1000)$$,
  $$values ('b0000000-0000-4000-8000-000000000001/f1-a.png'), ('b0000000-0000-4000-8000-000000000001/f2-b.pdf'),
           ('b0000000-0000-4000-8000-000000000002/f3-c.png')$$,
  'Files of deleted pages are to be deleted, files of existing pages are not'
);
select is((select count(*)::int from public.next_page_file_deletions(1)), 1, 'The limit is respected');
select is(
  (select count(*)::int from public.next_page_file_deletions(0)), 1, 'At least one path per call'
);
reset role;

-- 8: a queued page without files is done
select is_empty(
  $$select 1 from public.page_file_deletions where page_id = 'b0000000-0000-4000-8000-000000000004'$$,
  'A page without files leaves the queue'
);

-- 9-10: once the Storage API has deleted the files, the page leaves the queue
set local storage.allow_delete_query = 'true';
delete from storage.objects where name like 'b0000000-0000-4000-8000-000000000001/%';
set local role service_role;
select set_eq(
  $$select public.next_page_file_deletions(1000)$$,
  $$values ('b0000000-0000-4000-8000-000000000002/f3-c.png')$$,
  'Only files not deleted yet are returned'
);
reset role;
select is_empty(
  $$select 1 from public.page_file_deletions where page_id = 'b0000000-0000-4000-8000-000000000001'$$,
  'A page whose files are gone leaves the queue'
);

-- 11-12: a page that exists again keeps its files
insert into public.pages (id, workspace_id, owner_id, created_by, title) values
  ('b0000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000000',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'C wieder da');
set local role service_role;
select is_empty($$select public.next_page_file_deletions(1000)$$, 'Files of a page that exists again stay');
reset role;
select is_empty($$select 1 from public.page_file_deletions$$, 'The queue is empty');

-- 13-14: deleting an account queues the pages it takes along
set local role authenticated;
set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
select lives_ok($$select public.delete_account()$$, 'D deletes their account');
reset role;
set local role service_role;
select set_eq(
  $$select public.next_page_file_deletions(1000)$$,
  $$values ('b4000000-0000-4000-8000-000000000001/f5-d.png')$$,
  'Files of the pages of a deleted account are to be deleted'
);
reset role;

select * from finish();
rollback;

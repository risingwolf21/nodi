begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

-- O owns page P (text with an image, a cover), page Q (refers to a file of
-- P), database D with entry E (a "Dateien & Medien" value) and page X,
-- which is deleted for good.
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111', 'o@nodi.test', now());
insert into public.workspaces (id, name, owner_id) values
  ('a1000000-0000-4000-8000-000000000000', 'Team', '11111111-1111-4111-8111-111111111111');
insert into public.pages (id, workspace_id, owner_id, created_by, title, kind, parent_id) values
  ('b0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000000',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'P', 'page', null),
  ('b0000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000000',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Q', 'page', null),
  ('d0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000000',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'D', 'database', null),
  ('b0000000-0000-4000-8000-000000000009', 'a1000000-0000-4000-8000-000000000000',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'X', 'page', null);
insert into public.pages (id, workspace_id, owner_id, created_by, title, parent_id) values
  ('e0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000000',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'E',
   'd0000000-0000-4000-8000-000000000001');
insert into public.database_properties (id, database_id, name, type) values
  ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Anhänge', 'files');

insert into storage.objects (bucket_id, name, owner_id) values
  -- 1: image in P's text, 2: P's cover, 3: in Q's text, 4: unused,
  -- 5: E's files value, 6: of the deleted page X
  ('page-files', 'b0000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000001-bild.png',
   '11111111-1111-4111-8111-111111111111'),
  ('page-files', 'b0000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002-cover.png',
   '11111111-1111-4111-8111-111111111111'),
  ('page-files', 'b0000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000003-kopie.png',
   '11111111-1111-4111-8111-111111111111'),
  ('page-files', 'b0000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000004-alt.png',
   '11111111-1111-4111-8111-111111111111'),
  ('page-files', 'e0000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000005-plan.pdf',
   '11111111-1111-4111-8111-111111111111'),
  ('page-files', 'b0000000-0000-4000-8000-000000000009/00000000-0000-4000-8000-000000000006-weg.png',
   '11111111-1111-4111-8111-111111111111');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.save_page_document('b0000000-0000-4000-8000-000000000001',
  '[{"type": "image", "props": {"url": "nodi-file:b0000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000001-bild.png"}}]',
  now() - interval '2 minutes', gen_random_uuid());
select public.save_page_document('b0000000-0000-4000-8000-000000000002',
  '[{"type": "paragraph", "children": [{"type": "file", "props": {"url": "nodi-file:b0000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000003-kopie.png"}}]}]',
  now() - interval '2 minutes', gen_random_uuid());
update public.pages
set cover = 'nodi-file:b0000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002-cover.png'
where id = 'b0000000-0000-4000-8000-000000000001';
select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
  '["e0000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000005-plan.pdf"]',
  now(), gen_random_uuid());

-- 1-3: only the server runs it
select throws_ok($$select * from public.unused_page_files$$, '42501', null, 'Users cannot read the list');
select throws_ok($$select public.next_unused_page_files(10)$$, '42501', null, 'Users cannot run it');
set local role anon;
select throws_ok($$select public.next_unused_page_files(10)$$, '42501', null, 'Anonymous callers cannot run it');
reset role;
delete from public.pages where id = 'b0000000-0000-4000-8000-000000000009';

-- 4-5: the first look notes only the file nothing refers to; nothing is due yet
set local role service_role;
select is_empty($$select public.next_unused_page_files(1000)$$, 'Nothing is due right away');
reset role;
select results_eq(
  $$select name from public.unused_page_files$$,
  $$values ('b0000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000004-alt.png')$$,
  'Only the unused file is noted: text, copies, cover and files values count, deleted pages are package 35''s'
);

-- 6: after 30 days it is due
update public.unused_page_files set unused_since = now() - interval '31 days';
set local role service_role;
select results_eq(
  $$select public.next_unused_page_files(1000)$$,
  $$values ('b0000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000004-alt.png')$$,
  'A file unused for 30 days is due'
);

-- 7-8: referred to again (also within the hour), it is not returned and starts over
reset role;
set local role authenticated;
select public.save_page_document('b0000000-0000-4000-8000-000000000002',
  '[{"type": "image", "props": {"url": "nodi-file:b0000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000004-alt.png"}}]',
  now() - interval '1 minute', gen_random_uuid());
set local role service_role;
select is_empty($$select public.next_unused_page_files(1000)$$, 'A file referred to again is not due');
reset role;
select results_eq(
  $$select name from public.unused_page_files$$,
  $$values ('b0000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000003-kopie.png')$$,
  'Its row is gone; the copy no longer in Q''s text is noted instead'
);

-- 9: within the hour and nothing due, the files are not looked at again
update public.pages set cover = null where id = 'b0000000-0000-4000-8000-000000000001';
set local role service_role;
select public.next_unused_page_files(1000);
reset role;
select is(
  (select count(*)::int from public.unused_page_files), 1, 'No new look within the hour'
);

-- 10-11: an hour later, the removed cover is noted; files gone from storage are forgotten
update public.unused_page_file_scan set scanned_at = now() - interval '2 hours';
set local storage.allow_delete_query = 'true';
delete from storage.objects where name like '%-kopie.png';
set local role service_role;
select public.next_unused_page_files(1000);
reset role;
select results_eq(
  $$select name from public.unused_page_files$$,
  $$values ('b0000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002-cover.png')$$,
  'An hour later the removed cover is noted'
);
select ok(
  not exists (select 1 from public.unused_page_files where name like '%-kopie.png'),
  'Files gone from storage are forgotten'
);

select * from finish();
rollback;

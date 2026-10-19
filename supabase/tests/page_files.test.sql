begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

-- Owner O with page P; R may read P (share), E may edit P (share), S is a stranger
insert into auth.users (id, email, email_confirmed_at)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test', now()),
  ('22222222-2222-4222-8222-222222222222', 'reader@nodi.test', now()),
  ('33333333-3333-4333-8333-333333333333', 'editor@nodi.test', now()),
  ('44444444-4444-4444-8444-444444444444', 'stranger@nodi.test', now());

insert into public.workspaces (id, name, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team', '11111111-1111-4111-8111-111111111111');

insert into public.pages (id, workspace_id, owner_id, created_by, title)
values ('b0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Reise');

insert into public.page_shares (page_id, shared_with_user_id, permission, created_by)
values
  ('b0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'read',
   '11111111-1111-4111-8111-111111111111'),
  ('b0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'edit',
   '11111111-1111-4111-8111-111111111111');

-- 1-2: a private bucket with a 10 MB limit
select is(
  (select public from storage.buckets where id = 'page-files'), false,
  'The bucket page-files is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'page-files'), 10485760::bigint,
  'A file may have at most 10 MB'
);

-- 3-4: the path decides the page
select is(
  public.page_id_from_file_path('b0000000-0000-4000-8000-000000000001/f1-foto.png'),
  'b0000000-0000-4000-8000-000000000001'::uuid,
  'The page id is read from the start of the path'
);
select is(public.page_id_from_file_path('../foto.png'), null::uuid, 'Other paths belong to no page');

set local role authenticated;

-- 5-6: the owner adds a file to the page and reads it
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('page-files', 'b0000000-0000-4000-8000-000000000001/f1-foto.png', '11111111-1111-4111-8111-111111111111')$$,
  'The owner adds a file to the page'
);
select is((select count(*)::int from storage.objects where bucket_id = 'page-files'), 1, 'The owner reads it');

-- 7-8: a stranger neither sees nor adds files
set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
select is((select count(*)::int from storage.objects where bucket_id = 'page-files'), 0, 'A stranger sees no files');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('page-files', 'b0000000-0000-4000-8000-000000000001/f2-x.png', '44444444-4444-4444-8444-444444444444')$$,
  '42501', null, 'A stranger cannot add files'
);

-- 9-10: a reader sees files but cannot add any
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is((select count(*)::int from storage.objects where bucket_id = 'page-files'), 1, 'A reader sees the files');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('page-files', 'b0000000-0000-4000-8000-000000000001/f3-x.png', '22222222-2222-4222-8222-222222222222')$$,
  '42501', null, 'A reader cannot add files'
);

-- 11-12: an editor adds files, but not outside a page folder
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('page-files', 'b0000000-0000-4000-8000-000000000001/f4-plan.pdf', '33333333-3333-4333-8333-333333333333')$$,
  'An editor adds a file'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('page-files', 'lose-datei.pdf', '33333333-3333-4333-8333-333333333333')$$,
  '42501', null, 'A file outside a page folder is rejected'
);

-- 13-15: anonymous visitors see the files only while a public link is active
reset role;
insert into public.page_public_links (page_id, created_by)
values ('b0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111');
set local role anon;
select is((select count(*)::int from storage.objects where bucket_id = 'page-files'), 2,
  'With a public link, visitors see the files of the page');

reset role;
update public.pages set is_archived = true where id = 'b0000000-0000-4000-8000-000000000001';
set local role anon;
select is((select count(*)::int from storage.objects where bucket_id = 'page-files'), 0,
  'An archived page shows no files through its link');

reset role;
update public.pages set is_archived = false where id = 'b0000000-0000-4000-8000-000000000001';
delete from public.page_public_links where page_id = 'b0000000-0000-4000-8000-000000000001';
set local role anon;
select is((select count(*)::int from storage.objects where bucket_id = 'page-files'), 0,
  'A deactivated link shows no files');

-- 16-17: deleting needs the right to edit (through the Storage API in the app)
reset role;
set local storage.allow_delete_query = 'true';
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
delete from storage.objects where bucket_id = 'page-files';
select is((select count(*)::int from storage.objects where bucket_id = 'page-files'), 2,
  'A reader cannot delete files');
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
delete from storage.objects where name = 'b0000000-0000-4000-8000-000000000001/f4-plan.pdf';
select is((select count(*)::int from storage.objects where bucket_id = 'page-files'), 1,
  'An editor deletes a file');

select * from finish();

rollback;

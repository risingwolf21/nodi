begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

-- Owner O with a private page P shared read-only with V
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test', now()),
  ('22222222-2222-4222-8222-222222222222', 'viewer@nodi.test', now());
insert into public.workspaces (id, name, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team', '11111111-1111-4111-8111-111111111111');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

insert into public.pages (id, workspace_id, owner_id, created_by, title)
values ('c0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Reise');
insert into public.page_shares (page_id, shared_with_user_id, permission, created_by)
values ('c0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'read',
        '11111111-1111-4111-8111-111111111111');

-- 1-2: gradients and files of the bucket
select lives_ok(
  $$update public.pages set cover = 'gradient:ocean' where id = 'c0000000-0000-4000-8000-000000000001'$$,
  'A gradient is a cover'
);
select lives_ok(
  $$update public.pages
    set cover = 'nodi-file:c0000000-0000-4000-8000-000000000001/d0000000-0000-4000-8000-000000000001-Strand.png'
    where id = 'c0000000-0000-4000-8000-000000000001'$$,
  'A file of the bucket is a cover'
);

-- 3-4: anything else is rejected
select throws_ok(
  $$update public.pages set cover = 'https://example.com/bild.png' where id = 'c0000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'A URL from elsewhere is no cover'
);
select throws_ok(
  $$update public.pages set cover = 'gradient:<script>' where id = 'c0000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'A gradient name has only letters'
);

-- 5: a viewer cannot change it (RLS filters the update)
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
update public.pages set cover = null where id = 'c0000000-0000-4000-8000-000000000001';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select is(
  (select cover from public.pages where id = 'c0000000-0000-4000-8000-000000000001'),
  'nodi-file:c0000000-0000-4000-8000-000000000001/d0000000-0000-4000-8000-000000000001-Strand.png',
  'A viewer cannot change the cover'
);

select * from finish();
rollback;

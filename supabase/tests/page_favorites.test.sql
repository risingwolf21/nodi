begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

-- Owner O with a private page P; another user U without access
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test', now()),
  ('22222222-2222-4222-8222-222222222222', 'other@nodi.test', now());
insert into public.workspaces (id, name, owner_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Andere', '22222222-2222-4222-8222-222222222222');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

insert into public.pages (id, workspace_id, owner_id, created_by, title)
values ('c0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Notizen');

-- 1-2: the owner adds a favorite; the page tree shows it embedded
select lives_ok(
  $$insert into public.page_favorites (page_id) values ('c0000000-0000-4000-8000-000000000001')$$,
  'A user adds a favorite of a readable page'
);
select results_eq(
  $$select id from public.page_favorites f join public.pages p on p.id = f.page_id$$,
  $$values ('c0000000-0000-4000-8000-000000000001'::uuid)$$,
  'The favorite is listed with the page'
);

-- 3-5: another user neither sees it nor adds favorites of pages they cannot read
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is_empty($$select 1 from public.page_favorites$$, 'Favorites of others are not visible');
select throws_ok(
  $$insert into public.page_favorites (page_id) values ('c0000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'No favorite of a page the user cannot read'
);
select throws_ok(
  $$insert into public.page_favorites (user_id, page_id)
    values ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'No favorite in the name of someone else'
);

-- 6: deleting someone else's favorite does nothing
delete from public.page_favorites;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select isnt_empty($$select 1 from public.page_favorites$$, 'Others cannot remove a favorite');

-- 7: the owner removes it
delete from public.page_favorites where page_id = 'c0000000-0000-4000-8000-000000000001';
select is_empty($$select 1 from public.page_favorites$$, 'The user removes their favorite');

select * from finish();
rollback;

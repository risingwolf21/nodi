begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (id, email, email_confirmed_at)
values ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test', now());
insert into public.workspaces (id, name, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team', '11111111-1111-4111-8111-111111111111');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

insert into public.pages (id, workspace_id, owner_id, created_by, title)
values ('c0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Plan');

-- 1-2: a thread on text keeps the quote and the id the app chose; a reply quotes nothing
insert into public.page_comments (id, page_id, body, quote)
values ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Stimmt das?',
        '  am Freitag  ');
insert into public.page_comments (page_id, parent_id, body, quote)
values ('c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Ja.', 'egal');
select results_eq(
  $$select id, quote from public.list_page_comments('c0000000-0000-4000-8000-000000000001') order by quote nulls last$$,
  $$select 'd0000000-0000-4000-8000-000000000001'::uuid, 'am Freitag'::text
    union all select (select id from public.page_comments where parent_id is not null), null::text$$,
  'The quote is kept (trimmed) on the thread, never on a reply'
);
select throws_ok(
  $$insert into public.page_comments (page_id, body, quote)
    values ('c0000000-0000-4000-8000-000000000001', 'Zu lang', repeat('x', 501))$$,
  '23514', null, 'A quote has at most 500 characters'
);

-- 3: the quote does not change afterwards
select throws_ok(
  $$update public.page_comments set quote = 'anders' where id = 'd0000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'The quote does not change'
);

-- 4-5: the rest of 31a still holds
select lives_ok(
  $$update public.page_comments set body = 'Stimmt das wirklich?' where id = 'd0000000-0000-4000-8000-000000000001'$$,
  'The author still changes the text'
);
select isnt(
  (select edited_at from public.page_comments where id = 'd0000000-0000-4000-8000-000000000001'),
  null, 'An edit is noted'
);

select * from finish();
rollback;

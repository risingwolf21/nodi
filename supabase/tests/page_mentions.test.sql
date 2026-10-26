begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- A owns workspace W with private page P; B is mentioned, C is a stranger.
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111', 'a@nodi.test', now()),
  ('22222222-2222-4222-8222-222222222222', 'b@nodi.test', now()),
  ('33333333-3333-4333-8333-333333333333', 'c@nodi.test', now());
insert into public.workspaces (id, name, owner_id) values
  ('a1000000-0000-4000-8000-000000000000', 'Team', '11111111-1111-4111-8111-111111111111');
insert into public.pages (id, workspace_id, owner_id, created_by, title) values
  ('b0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000000',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Plan');

create function pg_temp.with_mentions(variadic people text[]) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'type', 'paragraph', 'props', '{}'::jsonb, 'children', '[]'::jsonb,
    'content', coalesce((
      select jsonb_agg(jsonb_build_object('type', 'mention', 'props', jsonb_build_object('userId', person, 'label', 'x')))
      from unnest(people) as person
    ), '[]'::jsonb)
  ))
$$;

-- 1: the table is published to Realtime
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'page_mentions'),
  'page_mentions is published to Realtime'
);

-- 2-3: A mentions B (and themselves, an unknown id and a malformed one)
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.save_page_document('b0000000-0000-4000-8000-000000000001',
  pg_temp.with_mentions('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
    '99999999-9999-4999-8999-999999999999', 'kein-uuid'),
  now(), gen_random_uuid());
reset role;
select results_eq(
  $$select user_id, mentioned_by, read_at is null from public.page_mentions$$,
  $$values ('22222222-2222-4222-8222-222222222222'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, true)$$,
  'Only B is recorded: not the author, unknown or malformed ids'
);
select is(
  (select count(*)::int from public.document_mentions(pg_temp.with_mentions('22222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222'))),
  1, 'A person mentioned twice counts once'
);

-- 4-5: B cannot see the mention while B may not read the page
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is_empty($$select 1 from public.page_mentions$$, 'B does not see a mention on a page B may not read');
select is_empty($$select 1 from public.list_my_mentions()$$, 'list_my_mentions is empty for B as well');

-- 6-7: after a share B sees it, with page and who mentioned
reset role;
insert into public.page_shares (page_id, shared_with_user_id, permission, created_by) values
  ('b0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'read',
   '11111111-1111-4111-8111-111111111111');
set local role authenticated;
select results_eq(
  $$select page_id, workspace_id, page_title, mentioned_by_email, read_at is null from public.list_my_mentions()$$,
  $$values ('b0000000-0000-4000-8000-000000000001'::uuid, 'a1000000-0000-4000-8000-000000000000'::uuid, 'Plan',
            'a@nodi.test', true)$$,
  'B sees the mention with page title and who mentioned'
);
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select is_empty($$select 1 from public.list_my_mentions()$$, 'A stranger sees no mentions of others');

-- 8-10: B marks it read; nothing else can change
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
update public.page_mentions set read_at = now();
select isnt(
  (select read_at from public.list_my_mentions()), null, 'B marks the mention as read'
);
select throws_ok(
  $$update public.page_mentions set user_id = '33333333-3333-4333-8333-333333333333'$$,
  '42501', null, 'Only read_at can be changed'
);
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
update public.page_mentions set read_at = null;
reset role;
select isnt((select read_at from public.page_mentions), null, 'Others cannot change B''s mention');

-- 11: saving the same mentions again changes nothing
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.save_page_document('b0000000-0000-4000-8000-000000000001',
  pg_temp.with_mentions('22222222-2222-4222-8222-222222222222'), now(), gen_random_uuid());
reset role;
select isnt((select read_at from public.page_mentions), null, 'A mention that was there already stays read');

-- 12-13: removed and mentioned again, it is new
set local role authenticated;
select public.save_page_document('b0000000-0000-4000-8000-000000000001', pg_temp.with_mentions(variadic '{}'::text[]), now(),
  gen_random_uuid());
reset role;
select is((select count(*)::int from public.page_mentions), 1, 'Removing a mention keeps the row');
set local role authenticated;
select public.save_page_document('b0000000-0000-4000-8000-000000000001',
  pg_temp.with_mentions('22222222-2222-4222-8222-222222222222'), now(), gen_random_uuid());
reset role;
select is((select read_at from public.page_mentions), null, 'Mentioned again, it is unread again');

-- 14: deleting the page deletes its mentions
delete from public.pages where id = 'b0000000-0000-4000-8000-000000000001';
select is_empty($$select 1 from public.page_mentions$$, 'Mentions go with the page');

select * from finish();
rollback;

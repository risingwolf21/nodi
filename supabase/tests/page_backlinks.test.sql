begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test', now()),
  ('33333333-3333-4333-8333-333333333333', 'other@nodi.test', now());
insert into public.workspaces (id, name, owner_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Andere', '33333333-3333-4333-8333-333333333333');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
insert into public.pages (id, workspace_id, owner_id, created_by, title, is_archived) values
  ('50000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Ziel', false),
  ('50000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Notizen', false),
  ('50000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Archiv', true),
  ('50000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Anderes', false);

-- Notizen and Archiv link Ziel (nested in a callout); Anderes only names it.
select public.save_page_document('50000000-0000-4000-8000-000000000002',
  '[{"type": "callout", "content": [{"type": "pageLink", "props": {"pageId": "50000000-0000-4000-8000-000000000001", "title": "Ziel"}}]}]',
  now(), gen_random_uuid());
select public.save_page_document('50000000-0000-4000-8000-000000000003',
  '[{"type": "paragraph", "content": [{"type": "pageLink", "props": {"pageId": "50000000-0000-4000-8000-000000000001"}}]}]',
  now(), gen_random_uuid());
select public.save_page_document('50000000-0000-4000-8000-000000000004',
  '[{"type": "paragraph", "content": [{"type": "text", "text": "50000000-0000-4000-8000-000000000001"}]}]',
  now(), gen_random_uuid());

select results_eq(
  $$select title from public.page_backlinks('50000000-0000-4000-8000-000000000001')$$,
  $$values ('Notizen'::text)$$,
  'Pages that link the page, without archived ones or mere text'
);
select is(
  (select count(*)::integer from public.page_backlinks('50000000-0000-4000-8000-000000000002')), 0,
  'A page nobody links has no backlinks'
);

set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select is(
  (select count(*)::integer from public.page_backlinks('50000000-0000-4000-8000-000000000001')), 0,
  'Others do not see the linking pages'
);

select * from finish();

rollback;

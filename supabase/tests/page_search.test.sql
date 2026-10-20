begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

-- Owner O and stranger X, each with a workspace.
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
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Reiseplanung', false),
  ('50000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Notizen', false),
  ('50000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Alte Reise', true);
select public.save_page_document('50000000-0000-4000-8000-000000000002',
  '[{"type": "paragraph", "content": [{"type": "text", "text": "Hotel in Rom buchen, 100% sicher", "styles": {}}]}]',
  now(), gen_random_uuid());

set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
insert into public.pages (id, workspace_id, owner_id, created_by, title) values
  ('60000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   '33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'Geheime Reise');

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

-- 1: the plain text of a document
select is(
  (select search_text from public.page_documents where page_id = '50000000-0000-4000-8000-000000000002'),
  'Hotel in Rom buchen, 100% sicher',
  'The text of a document is kept for the search'
);

-- 2-4: titles and texts, case-insensitive, a part of a word; not archived, not unreadable
select results_eq(
  $$select title from public.search_pages('reise')$$,
  $$values ('Reiseplanung'::text)$$,
  'Titles are found by a part, without archived or unreadable pages'
);
select results_eq(
  $$select title, snippet from public.search_pages('ROM')$$,
  $$values ('Notizen'::text, 'Hotel in Rom buchen, 100% sicher'::text)$$,
  'Texts are found, with a snippet'
);
select is(
  (select count(*)::integer from public.search_pages('Hot')), 1, 'A part of a word in the text is enough'
);

-- 5-6: wildcards are text; a single character searches nothing
select is((select count(*)::integer from public.search_pages('0%')), 1, '% is a character, no wildcard');
select is((select count(*)::integer from public.search_pages('r')), 0, 'At least two characters');

-- 7: the stranger finds only their page
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select results_eq(
  $$select title from public.search_pages('Reise')$$,
  $$values ('Geheime Reise'::text)$$,
  'RLS decides what is found'
);

select * from finish();

rollback;

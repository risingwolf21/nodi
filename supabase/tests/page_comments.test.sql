begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- Owner O with page P, shared for editing with E and for reading with R
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test', now()),
  ('22222222-2222-4222-8222-222222222222', 'editor@nodi.test', now()),
  ('33333333-3333-4333-8333-333333333333', 'reader@nodi.test', now()),
  ('44444444-4444-4444-8444-444444444444', 'stranger@nodi.test', now());
insert into public.workspaces (id, name, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team', '11111111-1111-4111-8111-111111111111');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

insert into public.pages (id, workspace_id, owner_id, created_by, title)
values ('c0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Plan');
insert into public.page_shares (page_id, shared_with_user_id, permission, created_by) values
  ('c0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'edit',
   '11111111-1111-4111-8111-111111111111'),
  ('c0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'read',
   '11111111-1111-4111-8111-111111111111');

-- 1-3: the owner starts a thread; the editor replies; a reply to a reply is refused
select lives_ok(
  $$insert into public.page_comments (id, page_id, body)
    values ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Termin klären?')$$,
  'The owner starts a thread'
);
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select lives_ok(
  $$insert into public.page_comments (id, page_id, parent_id, body)
    values ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
            'd0000000-0000-4000-8000-000000000001', 'Freitag passt.')$$,
  'An editor replies'
);
select throws_ok(
  $$insert into public.page_comments (page_id, parent_id, body)
    values ('c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'Tiefer')$$,
  '22023', null, 'A reply answers a thread, not a reply'
);

-- 4-6: a reader reads with e-mail addresses, but does not comment; a stranger reads nothing
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select results_eq(
  $$select author_email, body from public.list_page_comments('c0000000-0000-4000-8000-000000000001')$$,
  $$values ('owner@nodi.test', 'Termin klären?'), ('editor@nodi.test', 'Freitag passt.')$$,
  'A reader sees the comments with their authors'
);
select throws_ok(
  $$insert into public.page_comments (page_id, body) values ('c0000000-0000-4000-8000-000000000001', 'Ich auch')$$,
  '42501', null, 'A reader does not comment'
);
set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
select throws_ok(
  $$select * from public.list_page_comments('c0000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'A stranger reads no comments'
);

-- 7-9: only the author changes the text; the server notes the edit
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select throws_ok(
  $$update public.page_comments set body = 'Anders' where id = 'd0000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'Only the author changes a comment'
);
update public.page_comments set body = 'Freitag passt mir.' where id = 'd0000000-0000-4000-8000-000000000002';
select isnt(
  (select edited_at from public.page_comments where id = 'd0000000-0000-4000-8000-000000000002'),
  null, 'An edit is noted'
);
select throws_ok(
  $$update public.page_comments set author_id = '11111111-1111-4111-8111-111111111111'
    where id = 'd0000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'The author does not change'
);

-- 10-12: editors resolve threads (not replies); the server sets who and when
select lives_ok(
  $$update public.page_comments set resolved_at = '2000-01-01' where id = 'd0000000-0000-4000-8000-000000000001'$$,
  'An editor resolves a thread'
);
select results_eq(
  $$select resolved_by, resolved_at > '2000-01-02' from public.page_comments
    where id = 'd0000000-0000-4000-8000-000000000001'$$,
  $$values ('22222222-2222-4222-8222-222222222222'::uuid, true)$$,
  'The server notes who resolved it and when'
);
select throws_ok(
  $$update public.page_comments set resolved_at = now() where id = 'd0000000-0000-4000-8000-000000000002'$$,
  '22023', null, 'A reply is not resolved on its own'
);

-- 13-14: only authors delete; deleting a thread deletes its replies
delete from public.page_comments where id = 'd0000000-0000-4000-8000-000000000001';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select is(
  (select count(*)::int from public.page_comments), 2, 'Others cannot delete a comment'
);
delete from public.page_comments where id = 'd0000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.page_comments), 0, 'Deleting a thread deletes its replies'
);

select * from finish();
rollback;

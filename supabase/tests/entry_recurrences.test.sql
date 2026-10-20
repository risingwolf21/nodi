begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

-- 1-6: the dates of a rule
select is(public.next_recurrence_date('daily', 1, '{}', '2026-10-01', '2026-09-20'), '2026-10-01'::date,
  'Daily: the start comes first');
select is(public.next_recurrence_date('daily', 3, '{}', '2026-10-01', '2026-10-02'), '2026-10-04'::date,
  'Every third day from the start');
-- 2026-10-05 is a Monday.
select is(public.next_recurrence_date('weekly', 1, '{1,3}', '2026-10-05', '2026-10-05'), '2026-10-07'::date,
  'Weekly on Monday and Wednesday');
select is(public.next_recurrence_date('weekly', 2, '{1}', '2026-10-05', '2026-10-05'), '2026-10-19'::date,
  'Every other Monday');
select is(public.next_recurrence_date('monthly', 1, '{}', '2026-01-31', '2026-01-31'), '2026-02-28'::date,
  'Monthly: the end of a shorter month');
select is(public.next_recurrence_date('yearly', 1, '{}', '2026-10-20', '2026-10-20'), '2027-10-20'::date,
  'Yearly');

-- Owner O of workspace W; reader R with a read share.
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111', 'owner@nodi.test', now()),
  ('33333333-3333-4333-8333-333333333333', 'reader@nodi.test', now());
insert into public.workspaces (id, name, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Team', '11111111-1111-4111-8111-111111111111');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

-- Database Aufgaben (D) with entry Gießen (E), a note property and a date property.
insert into public.pages (id, workspace_id, owner_id, created_by, title, kind)
values ('d0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Aufgaben', 'database');
insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, icon, position)
values ('e0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'd0000000-0000-4000-8000-000000000001',
        '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Gießen', '🪴', 1);
insert into public.database_properties (id, database_id, name, type) values
  ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Notiz', 'text'),
  ('f0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'Fällig', 'date');
select public.set_page_property('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
  '"Balkon"', now(), gen_random_uuid());
select public.save_page_document('e0000000-0000-4000-8000-000000000001',
  '[{"type": "paragraph", "content": "Zwei Kannen"}]', now(), gen_random_uuid());

-- 7-9: only entries repeat; a new rule starts today at the earliest
select throws_ok(
  $$insert into public.entry_recurrences (page_id, frequency, start_date)
    values ('d0000000-0000-4000-8000-000000000001', 'daily', current_date)$$,
  '22023', null, 'A database does not repeat'
);
select lives_ok(
  $$insert into public.entry_recurrences (page_id, frequency, start_date, date_property_id)
    values ('e0000000-0000-4000-8000-000000000001', 'daily', current_date - 10,
            'f0000000-0000-4000-8000-000000000002')$$,
  'An entry repeats daily'
);
select is(
  (select next_date from public.entry_recurrences where page_id = 'e0000000-0000-4000-8000-000000000001'),
  current_date,
  'Nothing is made up for the past: the next date is today'
);

-- 10-16: due copies, with title, icon, values, text and date; no duplicates
update public.entry_recurrences set next_date = current_date - 2
where page_id = 'e0000000-0000-4000-8000-000000000001';
select is(
  public.create_due_recurring_entries('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 3,
  'Three copies are due (two days ago, yesterday, today)'
);
select is(
  (select count(*)::integer from public.pages
   where parent_id = 'd0000000-0000-4000-8000-000000000001' and title = 'Gießen' and icon = '🪴'),
  4,
  'The copies are entries with title and icon'
);
select is(
  (select array_agg(v.value ->> 'start' order by v.value ->> 'start') from public.page_property_values v
   where v.property_id = 'f0000000-0000-4000-8000-000000000002'),
  array[to_char(current_date - 2, 'YYYY-MM-DD'), to_char(current_date - 1, 'YYYY-MM-DD'),
        to_char(current_date, 'YYYY-MM-DD')],
  'Each copy has its date'
);
select is(
  (select count(*)::integer from public.page_property_values
   where property_id = 'f0000000-0000-4000-8000-000000000001' and value = '"Balkon"'),
  4,
  'and the values and'
);
select is(
  (select count(*)::integer from public.page_documents where document @> '[{"content": "Zwei Kannen"}]'),
  4,
  'the text of the entry'
);
select is(
  public.create_due_recurring_entries('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0,
  'A second call creates nothing'
);
select is(
  (select next_date from public.entry_recurrences where page_id = 'e0000000-0000-4000-8000-000000000001'),
  current_date + 1,
  'The next date is tomorrow'
);

-- 17-18: readers neither change rules nor create copies
reset role;
insert into public.page_shares (page_id, shared_with_user_id, permission, created_by)
values ('d0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'read',
        '11111111-1111-4111-8111-111111111111');
update public.entry_recurrences set next_date = current_date
where page_id = 'e0000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select results_eq(
  $$with changed as (
      update public.entry_recurrences set interval = 2
      where page_id = 'e0000000-0000-4000-8000-000000000001' returning 1
    ) select count(*)::integer from changed$$,
  $$values (0)$$,
  'A reader cannot change the rule'
);
select is(
  public.create_due_recurring_entries('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0,
  'A reader creates no copies'
);

select * from finish();

rollback;

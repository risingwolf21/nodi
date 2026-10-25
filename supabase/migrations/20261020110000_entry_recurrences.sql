-- Package 25: recurring entries (decision of the user, CLAUDE.md §12 P25:
-- created when the app is opened, the server prevents duplicates).
--
-- An entry of a database repeats: on each date of its rule a copy appears in
-- the database (title, icon, property values, text), with the date in a
-- chosen date property. The app calls create_due_recurring_entries when it
-- loads a workspace; the function creates what is due up to today (at most
-- 31 per rule and call) and moves next_date on, under a row lock, so two
-- devices never create the same copy twice. Days are server days (UTC).
--
-- Rules: daily, weekly (on weekdays, 1 = Monday), monthly (the start's day,
-- the month's last day if shorter), yearly; every `interval` days, weeks,
-- months or years from start_date.
--
-- Backward compatible: a new table and new functions only.

create table public.entry_recurrences (
  page_id uuid primary key references public.pages (id) on delete cascade,
  database_id uuid not null references public.pages (id) on delete cascade,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  interval integer not null default 1 check (interval between 1 and 365),
  weekdays smallint[] not null default '{}' check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  start_date date not null,
  next_date date not null,
  date_property_id uuid references public.database_properties (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index entry_recurrences_database_idx on public.entry_recurrences (database_id);

alter table public.entry_recurrences enable row level security;

-- The first date of a rule after `after`.
create or replace function public.next_recurrence_date(
  p_frequency text,
  p_interval integer,
  p_weekdays smallint[],
  p_start date,
  p_after date
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  candidate date;
  steps integer;
  days smallint[] := case
    when coalesce(cardinality(p_weekdays), 0) = 0 then array[extract(isodow from p_start)::smallint]
    else p_weekdays
  end;
  week_start date := p_start - (extract(isodow from p_start)::integer - 1);
begin
  if p_after < p_start then
    p_after := p_start - 1;
  end if;

  if p_frequency = 'daily' then
    steps := floor((p_after - p_start)::numeric / p_interval)::integer + 1;
    return p_start + steps * p_interval;
  elsif p_frequency = 'weekly' then
    candidate := p_after + 1;
    -- At most one full cycle of weeks plus a week.
    while candidate <= p_after + 8 + 7 * p_interval loop
      if extract(isodow from candidate)::smallint = any (days)
        and ((candidate - week_start) / 7) % p_interval = 0 then
        return candidate;
      end if;
      candidate := candidate + 1;
    end loop;
    return null;
  else
    -- Months from the start keep its day (the month's end if shorter).
    steps := case when p_frequency = 'yearly' then 12 * p_interval else p_interval end;
    for k in 0 .. 12 * 400 loop
      candidate := (p_start + make_interval(months => k * steps))::date;
      if candidate > p_after then
        return candidate;
      end if;
    end loop;
    return null;
  end if;
end;
$$;

-- An entry repeats, and the date property belongs to its database.
create or replace function public.prepare_entry_recurrence()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  database uuid;
begin
  select parent.id into database
  from public.pages p
  join public.pages parent on parent.id = p.parent_id and parent.kind = 'database'
  where p.id = new.page_id;

  if database is null then
    raise exception 'Only entries of a database repeat' using errcode = '22023';
  end if;
  new.database_id := database;

  if new.date_property_id is not null and not exists (
    select 1 from public.database_properties pr
    where pr.id = new.date_property_id and pr.database_id = database and pr.type = 'date'
  ) then
    raise exception 'The date property must be a date of this database' using errcode = '22023';
  end if;

  -- A new or changed rule starts at today at the earliest: nothing is made up for the past.
  if tg_op = 'INSERT'
    or new.frequency is distinct from old.frequency
    or new.interval is distinct from old.interval
    or new.weekdays is distinct from old.weekdays
    or new.start_date is distinct from old.start_date then
    new.next_date := public.next_recurrence_date(
      new.frequency, new.interval, new.weekdays, new.start_date,
      greatest(new.start_date, current_date) - 1
    );
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger prepare_entry_recurrence
before insert or update on public.entry_recurrences
for each row execute function public.prepare_entry_recurrence();

create policy "Readers of an entry read its recurrence"
on public.entry_recurrences for select to authenticated
using (public.can_read_page(page_id));

create policy "Editors of an entry make it repeat"
on public.entry_recurrences for insert to authenticated
with check (public.can_edit_page(page_id));

create policy "Editors of an entry change its recurrence"
on public.entry_recurrences for update to authenticated
using (public.can_edit_page(page_id))
with check (public.can_edit_page(page_id));

create policy "Editors of an entry stop its recurrence"
on public.entry_recurrences for delete to authenticated
using (public.can_edit_page(page_id));

grant select, insert, update, delete on public.entry_recurrences to authenticated;

-- One copy of the entry for a date: a new entry at the end of the database,
-- with the entry's values (through set_page_property, so relations stay
-- two-sided), its text and the date.
create or replace function public.copy_recurring_entry(p_source uuid, p_date_property uuid, p_day date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  copy_id uuid := gen_random_uuid();
  value record;
begin
  insert into public.pages (id, workspace_id, parent_id, owner_id, created_by, title, icon, kind, visibility, position)
  select copy_id, src.workspace_id, src.parent_id, caller, caller, src.title, src.icon, 'page', src.visibility,
    (select coalesce(max(other.position) + 1, 0) from public.pages other where other.parent_id = src.parent_id)
  from public.pages src
  where src.id = p_source;

  for value in
    select v.property_id, v.value
    from public.page_property_values v
    join public.database_properties pr on pr.id = v.property_id
    where v.page_id = p_source and jsonb_typeof(v.value) <> 'null'
      and (p_date_property is null or v.property_id <> p_date_property)
  loop
    perform public.set_page_property(copy_id, value.property_id, value.value, now(), gen_random_uuid());
  end loop;

  if p_date_property is not null then
    perform public.set_page_property(
      copy_id, p_date_property, jsonb_build_object('start', to_char(p_day, 'YYYY-MM-DD'), 'end', null),
      now(), gen_random_uuid()
    );
  end if;

  insert into public.page_documents (page_id, document, updated_by, client_updated_at, last_mutation_id)
  select copy_id, d.document, caller, now(), gen_random_uuid()
  from public.page_documents d
  where d.page_id = p_source;

  return copy_id;
end;
$$;

revoke execute on function public.copy_recurring_entry(uuid, uuid, date) from public, anon, authenticated;

-- Creates the copies that are due in a workspace, for the databases the
-- caller may edit; returns how many. Rules locked by another call are
-- skipped (that call creates them).
create or replace function public.create_due_recurring_entries(p_workspace_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule record;
  day date;
  per_rule integer;
  total integer := 0;
begin
  if p_workspace_id is null then
    raise exception 'create_due_recurring_entries: the workspace is required' using errcode = '22004';
  end if;

  for rule in
    select r.*
    from public.entry_recurrences r
    join public.pages entry on entry.id = r.page_id
    join public.pages db on db.id = r.database_id
    where db.workspace_id = p_workspace_id
      and r.next_date <= current_date
      and not entry.is_archived
      and not db.is_archived
    for update of r skip locked
  loop
    continue when not public.can_edit_page(rule.database_id);

    day := rule.next_date;
    per_rule := 0;
    while day is not null and day <= current_date and per_rule < 31 loop
      perform public.copy_recurring_entry(rule.page_id, rule.date_property_id, day);
      per_rule := per_rule + 1;
      day := public.next_recurrence_date(rule.frequency, rule.interval, rule.weekdays, rule.start_date, day);
    end loop;

    -- next_date moves on directly (the trigger only resets it for a new rule).
    update public.entry_recurrences r set next_date = coalesce(day, 'infinity'::date) where r.page_id = rule.page_id;
    total := total + per_rule;
  end loop;

  return total;
end;
$$;

revoke execute on function public.create_due_recurring_entries(uuid) from public, anon;
grant execute on function public.create_due_recurring_entries(uuid) to authenticated;

-- Audited, atomic write paths for reconciliation and file imports.
--
-- Before this migration the browser wrote straight into `reconciliation_cycles`,
-- `reconciliation_items` and `inventory_transactions`:
--   * the 30 s autosave upserted rows WITHOUT their id, so every tick inserted the whole
--     table again (one live draft holds 2,132 rows for 164 DINs);
--   * every saved cycle left its draft behind as an orphan;
--   * an import made one drug lookup per DIN, then inserted ledger rows with no checks;
--   * nothing was written to the audit log.
-- Everything below is SECURITY DEFINER with an explicit auth.uid() ownership check, one
-- round trip, one transaction, and one audit_logs row per user action.
-- Direct table writes are revoked in the phase 2 migration, after the new frontend ships.

-- ---------------------------------------------------------------------------
-- One row per DIN per cycle: remove the duplicates the old autosave created, then enforce it.
-- Keeps the NEWEST row of each (cycle_id, din) pair.
-- ---------------------------------------------------------------------------
delete from public.reconciliation_items a
using public.reconciliation_items b
where a.cycle_id = b.cycle_id
  and a.din = b.din
  and (a.created_at, a.id) < (b.created_at, b.id);

create unique index if not exists reconciliation_items_cycle_din_key
  on public.reconciliation_items (cycle_id, din);

-- ---------------------------------------------------------------------------
-- Shared item writer (internal: not callable through the API)
-- ---------------------------------------------------------------------------
create or replace function public._upsert_reconciliation_items(p_cycle_id uuid, p_uid uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count integer;
  v_dins text[];
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Items must be a JSON array';
  end if;
  if jsonb_array_length(p_items) > 20000 then
    raise exception 'Too many reconciliation items (max 20000)';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(din text, opening_balance integer, purchased_count integer,
                                          dispensed_count integer, actual_count integer)
    where coalesce(btrim(x.din), '') = '' or length(x.din) > 20
       or coalesce(x.opening_balance, 0) < 0
       or coalesce(x.purchased_count, 0) < 0
       or coalesce(x.dispensed_count, 0) < 0
       or x.actual_count < 0
  ) then
    raise exception 'Invalid reconciliation item: a DIN is required and counts cannot be negative';
  end if;

  select coalesce(array_agg(distinct btrim(x.din)), '{}')
    into v_dins
    from jsonb_to_recordset(p_items) as x(din text);

  insert into reconciliation_items (
    cycle_id, user_id, drug_id, din, description, schedule,
    opening_balance, purchased_count, dispensed_count, actual_count,
    flag, verify_note, locations, suggested_adjustment
  )
  select distinct on (i.din)
    p_cycle_id,
    p_uid,
    d.id,
    i.din,
    left(i.description, 500),
    left(i.schedule, 50),
    i.opening_balance,
    i.purchased_count,
    i.dispensed_count,
    i.actual_count,
    -- The flag is derived on the server. The one thing a client may assert is "Verify",
    -- and only together with a verification note (that is what the verify dialog does).
    case
      when i.flag = 'Verify' and nullif(btrim(i.verify_note), '') is not null then 'Verify'
      when i.actual_count is null then 'Pending count'
      when i.actual_count = i.opening_balance + i.purchased_count - i.dispensed_count then 'OK'
      when i.schedule in ('Narcotic', 'Controlled') then 'Verify'
      else 'Review'
    end,
    left(i.verify_note, 2000),
    case when jsonb_typeof(i.locations) = 'array' then i.locations else '[]'::jsonb end,
    case
      when i.actual_count is null then null
      else i.actual_count - (i.opening_balance + i.purchased_count - i.dispensed_count)
    end
  from (
    select
      btrim(x.din) as din,
      x.drug_id,
      x.description,
      x.schedule,
      coalesce(x.opening_balance, 0) as opening_balance,
      coalesce(x.purchased_count, 0) as purchased_count,
      coalesce(x.dispensed_count, 0) as dispensed_count,
      x.actual_count,
      x.flag,
      x.verify_note,
      x.locations
    from jsonb_to_recordset(p_items) as x(
      din text, drug_id uuid, description text, schedule text,
      opening_balance integer, purchased_count integer, dispensed_count integer,
      actual_count integer, flag text, verify_note text, locations jsonb
    )
  ) i
  left join drugs d on d.id = i.drug_id and d.user_id = p_uid
  order by i.din
  on conflict (cycle_id, din) do update set
    drug_id              = excluded.drug_id,
    description          = excluded.description,
    schedule             = excluded.schedule,
    opening_balance      = excluded.opening_balance,
    purchased_count      = excluded.purchased_count,
    dispensed_count      = excluded.dispensed_count,
    actual_count         = excluded.actual_count,
    flag                 = excluded.flag,
    verify_note          = excluded.verify_note,
    locations            = excluded.locations,
    suggested_adjustment = excluded.suggested_adjustment;

  get diagnostics v_count = row_count;

  -- The payload is the full table, so rows the user removed are removed here too.
  delete from reconciliation_items
  where cycle_id = p_cycle_id and din <> all (v_dins);

  return v_count;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Autosave: create the draft on first call, then replace its items in place.
-- ---------------------------------------------------------------------------
create or replace function public.save_reconciliation_draft(p_cycle_id uuid, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_cycle_id uuid := p_cycle_id;
  v_status text;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_cycle_id is null then
    insert into reconciliation_cycles (user_id, status, name, start_date)
    values (v_uid, 'draft', 'Draft - ' || to_char(now(), 'FMMM/FMDD/YYYY'), current_date)
    returning id into v_cycle_id;

    insert into audit_logs (performed_by, action, target_user_id, details)
    values (v_uid, 'reconciliation_draft_created', v_uid, jsonb_build_object('cycle_id', v_cycle_id));
  else
    select status into v_status
      from reconciliation_cycles
     where id = v_cycle_id and user_id = v_uid
       for update;

    if not found then
      raise exception 'Cycle not found';
    end if;
    if v_status <> 'draft' then
      raise exception 'Only a draft can be autosaved (this cycle is %)', v_status;
    end if;
  end if;

  v_count := _upsert_reconciliation_items(v_cycle_id, v_uid, p_items);
  return v_cycle_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Save: promote the draft (or create a cycle) and write its items atomically.
-- ---------------------------------------------------------------------------
create or replace function public.save_reconciliation_cycle(p_cycle_id uuid, p_form jsonb, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_cycle_id uuid := p_cycle_id;
  v_status text;
  v_form jsonb := coalesce(p_form, '{}'::jsonb);
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_cycle_id is null then
    insert into reconciliation_cycles
      (user_id, status, start_date, end_date, performed_by, verified_by, notes, checklist)
    values (
      v_uid,
      'in_progress',
      nullif(v_form ->> 'start_date', '')::date,
      nullif(v_form ->> 'end_date', '')::date,
      nullif(left(v_form ->> 'performed_by', 200), ''),
      nullif(left(v_form ->> 'verified_by', 200), ''),
      nullif(left(v_form ->> 'notes', 5000), ''),
      case when jsonb_typeof(v_form -> 'checklist') = 'object' then v_form -> 'checklist' else null end
    )
    returning id into v_cycle_id;
  else
    select status into v_status
      from reconciliation_cycles
     where id = v_cycle_id and user_id = v_uid
       for update;

    if not found then
      raise exception 'Cycle not found';
    end if;
    if v_status = 'completed' then
      raise exception 'A completed cycle cannot be changed';
    end if;

    update reconciliation_cycles
       set status       = 'in_progress',
           name         = null,
           start_date   = nullif(v_form ->> 'start_date', '')::date,
           end_date     = nullif(v_form ->> 'end_date', '')::date,
           performed_by = nullif(left(v_form ->> 'performed_by', 200), ''),
           verified_by  = nullif(left(v_form ->> 'verified_by', 200), ''),
           notes        = nullif(left(v_form ->> 'notes', 5000), ''),
           checklist    = case when jsonb_typeof(v_form -> 'checklist') = 'object' then v_form -> 'checklist' else null end
     where id = v_cycle_id;
  end if;

  v_count := _upsert_reconciliation_items(v_cycle_id, v_uid, p_items);

  insert into audit_logs (performed_by, action, target_user_id, details)
  values (v_uid, 'reconciliation_cycle_saved', v_uid,
          jsonb_build_object('cycle_id', v_cycle_id, 'items', v_count, 'promoted_draft', p_cycle_id is not null));

  return v_cycle_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Delete (cascades to the cycle's items) with an audit row.
-- ---------------------------------------------------------------------------
create or replace function public.delete_reconciliation_cycle(p_cycle_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_items integer;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select status into v_status
    from reconciliation_cycles
   where id = p_cycle_id and user_id = v_uid
     for update;

  if not found then
    raise exception 'Cycle not found';
  end if;

  select count(*) into v_items from reconciliation_items where cycle_id = p_cycle_id;

  delete from reconciliation_cycles where id = p_cycle_id;

  insert into audit_logs (performed_by, action, target_user_id, details)
  values (v_uid, 'reconciliation_cycle_deleted', v_uid,
          jsonb_build_object('cycle_id', p_cycle_id, 'status', v_status, 'items', v_items));
end;
$function$;

-- ---------------------------------------------------------------------------
-- File import: validate, create missing drugs and write the ledger rows in ONE call.
-- ---------------------------------------------------------------------------
-- A date cell such as 2026-02-31 matches the shape but is not a real day; it must make that
-- ONE row invalid instead of aborting the whole file.
create or replace function public._safe_date(p text)
returns date
language plpgsql
immutable
set search_path to 'public'
as $function$
begin
  return p::date;
exception when others then
  return null;
end;
$function$;

create or replace function public._parse_import_rows(p_rows jsonb)
returns table (din text, description text, schedule text, quantity integer, tx_date date, is_valid boolean, reason text)
language sql
stable
set search_path to 'public'
as $function$
  with raw as (
    select
      regexp_replace(coalesce(x.din, ''), '\D', '', 'g') as din,
      x.description,
      x.schedule,
      x.quantity,
      x.date
    from jsonb_to_recordset(p_rows) as x(din text, description text, schedule text, quantity text, date text)
  ), typed as (
    select
      r.din,
      r.description,
      r.schedule,
      case when r.quantity ~ '^[0-9]{1,7}$' then r.quantity::integer end as quantity,
      case when r.date ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$' then public._safe_date(r.date) end as tx_date
    from raw r
  )
  select
    t.din, t.description, t.schedule, t.quantity, t.tx_date,
    -- coalesce: a NULL quantity/date must count as invalid, not as "unknown".
    coalesce(t.din ~ '^[0-9]{6,10}$' and t.quantity between 1 and 1000000
       and t.tx_date between date '2000-01-01' and current_date + 1, false) as is_valid,
    case
      when t.din !~ '^[0-9]{6,10}$' then 'DIN must be 6-10 digits'
      when t.quantity is null or t.quantity not between 1 and 1000000 then 'quantity must be 1-1,000,000'
      when t.tx_date is null or t.tx_date not between date '2000-01-01' and current_date + 1 then 'date is missing or out of range'
    end as reason
  from typed t;
$function$;

create or replace function public.import_ledger_rows(p_kind text, p_file_name text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_type text;
  v_sign integer;
  v_source text;
  v_file text := nullif(btrim(p_file_name), '');
  v_total integer;
  v_saved integer;
  v_errors jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  case p_kind
    when 'purchase'    then v_type := 'PURCHASE';   v_sign :=  1; v_source := 'purchase_import';
    when 'dispense'    then v_type := 'DISPENSE';   v_sign := -1; v_source := 'dispense_import';
    when 'destruction' then v_type := 'ADJUSTMENT'; v_sign := -1; v_source := 'destruction_import';
    else raise exception 'Unknown import kind';
  end case;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rows must be a JSON array';
  end if;
  v_total := jsonb_array_length(p_rows);
  if v_total > 50000 then
    raise exception 'Too many rows in one import (max 50000)';
  end if;
  if v_file is not null and length(v_file) > 255 then
    raise exception 'File name is too long';
  end if;
  if v_total = 0 then
    return jsonb_build_object('saved', 0, 'skipped', 0, 'errors', '[]'::jsonb);
  end if;

  -- Drugs first (separate statement so the insert below can see them).
  insert into drugs (user_id, din, description, schedule)
  select distinct on (r.din)
    v_uid,
    r.din,
    left(coalesce(nullif(btrim(r.description), ''), 'Imported DIN ' || r.din), 500),
    left(coalesce(nullif(btrim(r.schedule), ''), 'Verify'), 50)
  from _parse_import_rows(p_rows) r
  where r.is_valid
  order by r.din
  on conflict (user_id, din) do nothing;

  insert into inventory_transactions
    (user_id, drug_id, transaction_type, quantity, date, source, file_name)
  select v_uid, d.id, v_type, v_sign * r.quantity, r.tx_date, v_source, v_file
  from _parse_import_rows(p_rows) r
  join drugs d on d.user_id = v_uid and d.din = r.din
  where r.is_valid;

  get diagnostics v_saved = row_count;

  select coalesce(jsonb_agg(m.msg), '[]'::jsonb)
    into v_errors
    from (
      select format('DIN %s: %s', nullif(r.din, ''), r.reason) as msg
      from _parse_import_rows(p_rows) r
      where not r.is_valid
      limit 20
    ) m;

  insert into audit_logs (performed_by, action, target_user_id, details)
  values (v_uid, 'import_ledger_rows', v_uid,
          jsonb_build_object('kind', p_kind, 'file_name', v_file, 'rows', v_total, 'saved', v_saved));

  return jsonb_build_object('saved', v_saved, 'skipped', v_total - v_saved, 'errors', v_errors);
end;
$function$;

-- ---------------------------------------------------------------------------
-- Existing reconciliation RPCs: same behaviour, plus an audit row.
-- ---------------------------------------------------------------------------
create or replace function public.complete_reconciliation_cycle(
  p_cycle_id uuid,
  p_performed_by text default null,
  p_verified_by text default null,
  p_notes text default null,
  p_start_date date default null,
  p_end_date date default null
)
returns reconciliation_cycles
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_cycle reconciliation_cycles;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_cycle from reconciliation_cycles where id = p_cycle_id for update;

  if not found then
    raise exception 'Cycle not found';
  end if;
  if v_cycle.user_id <> v_user_id then
    raise exception 'You do not own this cycle';
  end if;

  update reconciliation_cycles
     set status       = 'completed',
         performed_by = coalesce(p_performed_by, performed_by),
         verified_by  = coalesce(p_verified_by, verified_by),
         notes        = coalesce(p_notes, notes),
         start_date   = coalesce(p_start_date, start_date),
         end_date     = coalesce(p_end_date, end_date)
   where id = p_cycle_id
   returning * into v_cycle;

  insert into audit_logs (performed_by, action, target_user_id, details)
  values (v_user_id, 'reconciliation_cycle_completed', v_user_id,
          jsonb_build_object('cycle_id', p_cycle_id));

  return v_cycle;
end;
$function$;

create or replace function public.update_actual_count(p_item_id uuid, p_actual_count integer)
returns reconciliation_items
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_item reconciliation_items;
  v_old integer;
  v_expected integer;
  v_variance integer;
  v_flag text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_actual_count is not null and p_actual_count < 0 then
    raise exception 'Actual count cannot be negative';
  end if;

  select * into v_item from reconciliation_items where id = p_item_id for update;

  if not found then
    raise exception 'Reconciliation item not found';
  end if;
  if v_item.user_id <> v_user_id then
    raise exception 'You do not own this item';
  end if;

  v_old := v_item.actual_count;
  v_expected := v_item.opening_balance + v_item.purchased_count - v_item.dispensed_count;

  if p_actual_count is null then
    v_flag := 'Pending count';
  else
    v_variance := p_actual_count - v_expected;
    if v_variance = 0 then
      v_flag := 'OK';
    elsif v_item.schedule in ('Narcotic', 'Controlled') then
      v_flag := 'Verify';
    else
      v_flag := 'Review';
    end if;
  end if;

  update reconciliation_items
     set actual_count = p_actual_count,
         flag = v_flag
   where id = p_item_id
   returning * into v_item;

  if v_old is distinct from p_actual_count then
    insert into audit_logs (performed_by, action, target_user_id, details)
    values (v_user_id, 'reconciliation_count_changed', v_user_id,
            jsonb_build_object('item_id', p_item_id, 'cycle_id', v_item.cycle_id, 'din', v_item.din,
                               'from', v_old, 'to', p_actual_count));
  end if;

  return v_item;
end;
$function$;

create or replace function public.update_reconciliation_opening(p_item_id uuid, p_opening_balance integer)
returns reconciliation_items
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_item reconciliation_items;
  v_old integer;
  v_expected integer;
  v_variance integer;
  v_flag text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_opening_balance is null or p_opening_balance < 0 then
    raise exception 'Opening balance must be zero or greater';
  end if;

  select * into v_item from reconciliation_items where id = p_item_id for update;

  if not found then
    raise exception 'Reconciliation item not found';
  end if;
  if v_item.user_id <> v_user_id then
    raise exception 'You do not own this item';
  end if;

  v_old := v_item.opening_balance;
  v_expected := p_opening_balance + v_item.purchased_count - v_item.dispensed_count;

  if v_item.actual_count is null then
    v_flag := 'Pending count';
  else
    v_variance := v_item.actual_count - v_expected;
    if v_variance = 0 then
      v_flag := 'OK';
    elsif v_item.schedule in ('Narcotic', 'Controlled') then
      v_flag := 'Verify';
    else
      v_flag := 'Review';
    end if;
  end if;

  update reconciliation_items
     set opening_balance = p_opening_balance,
         flag = v_flag
   where id = p_item_id
   returning * into v_item;

  if v_old is distinct from p_opening_balance then
    insert into audit_logs (performed_by, action, target_user_id, details)
    values (v_user_id, 'reconciliation_opening_changed', v_user_id,
            jsonb_build_object('item_id', p_item_id, 'cycle_id', v_item.cycle_id, 'din', v_item.din,
                               'from', v_old, 'to', p_opening_balance));
  end if;

  return v_item;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Privileges: signed-in users only; the two helpers are internal.
-- ---------------------------------------------------------------------------
revoke all on function public._upsert_reconciliation_items(uuid, uuid, jsonb) from PUBLIC, anon, authenticated;
revoke all on function public._parse_import_rows(jsonb) from PUBLIC, anon, authenticated;
revoke all on function public._safe_date(text) from PUBLIC, anon, authenticated;

revoke all on function public.save_reconciliation_draft(uuid, jsonb) from PUBLIC, anon;
revoke all on function public.save_reconciliation_cycle(uuid, jsonb, jsonb) from PUBLIC, anon;
revoke all on function public.delete_reconciliation_cycle(uuid) from PUBLIC, anon;
revoke all on function public.import_ledger_rows(text, text, jsonb) from PUBLIC, anon;
grant execute on function public.save_reconciliation_draft(uuid, jsonb) to authenticated;
grant execute on function public.save_reconciliation_cycle(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.delete_reconciliation_cycle(uuid) to authenticated;
grant execute on function public.import_ledger_rows(text, text, jsonb) to authenticated;

revoke all on function public.complete_reconciliation_cycle(uuid, text, text, text, date, date) from PUBLIC, anon;
revoke all on function public.update_actual_count(uuid, integer) from PUBLIC, anon;
revoke all on function public.update_reconciliation_opening(uuid, integer) from PUBLIC, anon;
grant execute on function public.complete_reconciliation_cycle(uuid, text, text, text, date, date) to authenticated;
grant execute on function public.update_actual_count(uuid, integer) to authenticated;
grant execute on function public.update_reconciliation_opening(uuid, integer) to authenticated;

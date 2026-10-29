-- Faster imports and record lists, and protection against importing the same file twice.
--
--   1. import_ledger_rows parses the payload ONCE (it used to run the regular expressions
--      three times over every row) and refuses a file name that is already in the ledger
--      unless the caller says it is replacing it (production already held four copies of
--      one dispensing file).
--   2. imported_records(kind) returns the record list as ONE aggregated JSON document. The
--      browser used to page through every ledger row 1,000 at a time (161 sequential
--      requests for 161,000 rows) and then render all of them.
--   3. Three indexes that queries barely use are dropped (two on low-cardinality columns,
--      one on `date`): every insert paid for them, and idx_it_user_type_created already
--      serves the same queries.
--      _parse_import_rows no longer calls a PL/pgSQL helper per row.
--   4. void_imported_records writes an audit row like every other ledger mutation.

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
drop index if exists public.idx_transactions_transaction_type;
drop index if exists public.idx_transactions_source;
-- Scanned twice in total; every insert paid for it.
drop index if exists public.idx_transactions_date;

-- ---------------------------------------------------------------------------
-- Row validation, without a function call per row.
-- The date must be a real calendar day: 2026-02-31 matches the pattern but is not one, so
-- the day is compared with the length of the month before make_date() is called.
-- ---------------------------------------------------------------------------
create or replace function public._parse_import_rows(p_rows jsonb)
returns table (din text, description text, schedule text, quantity integer, tx_date date, is_valid boolean, reason text)
language sql
stable
set search_path to 'public'
as $function$
  with raw as (
    select
      case when x.din ~ '^[0-9]{6,10}$' then x.din
           else regexp_replace(coalesce(x.din, ''), '\D', '', 'g') end as din,
      x.description,
      x.schedule,
      case when x.quantity ~ '^[0-9]{1,7}$' then x.quantity::integer end as quantity,
      case when x.date ~ '^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then x.date end as date_text
    from jsonb_to_recordset(p_rows) as x(din text, description text, schedule text, quantity text, date text)
  ), dates as (
    -- A file has a few dozen distinct dates but tens of thousands of rows: work them out once.
    select d.date_text,
      case when substr(d.date_text, 9, 2)::integer
                <= extract(day from (make_date(substr(d.date_text, 1, 4)::integer, substr(d.date_text, 6, 2)::integer, 1)
                                     + interval '1 month - 1 day'))::integer
           then make_date(substr(d.date_text, 1, 4)::integer, substr(d.date_text, 6, 2)::integer, substr(d.date_text, 9, 2)::integer)
      end as tx_date
    from (select distinct r.date_text from raw r where r.date_text is not null) d
  ), typed as (
    select r.din, r.description, r.schedule, r.quantity, dt.tx_date
    from raw r
    left join dates dt on dt.date_text = r.date_text
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

revoke all on function public._parse_import_rows(jsonb) from PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. import_ledger_rows
--    p_mode: 'new'     - fail with ALREADY_IMPORTED when the file name is already in the ledger
--            'replace' - void the earlier import of that file name, then import
--            'append'  - add to the file (the 2nd..nth chunk of one upload)
-- ---------------------------------------------------------------------------
drop function if exists public.import_ledger_rows(text, text, jsonb);

create or replace function public.import_ledger_rows(
  p_kind text,
  p_file_name text,
  p_rows jsonb,
  p_mode text default 'new'
)
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
  v_voided integer := 0;
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

  if p_mode is null or p_mode not in ('new', 'replace', 'append') then
    raise exception 'Unknown import mode';
  end if;
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
    return jsonb_build_object('saved', 0, 'skipped', 0, 'errors', '[]'::jsonb, 'replaced', 0);
  end if;

  -- The same file imported twice would double every quantity in the ledger.
  if v_file is not null and p_mode <> 'append'
     and exists (
       select 1 from inventory_transactions t
        where t.user_id = v_uid and t.transaction_type = v_type
          and t.file_name = v_file and t.voided_at is null
     ) then
    if p_mode = 'new' then
      raise exception 'ALREADY_IMPORTED' using hint = 'This file name is already in the ledger';
    end if;

    update inventory_transactions
       set voided_at = now(), voided_by = v_uid
     where user_id = v_uid and transaction_type = v_type
       and file_name = v_file and voided_at is null;
    get diagnostics v_voided = row_count;
  end if;

  -- Parse and validate every row once.
  create temp table _import_parsed on commit drop as
    select * from _parse_import_rows(p_rows);

  -- Drugs first (separate statement so the insert below can see them).
  insert into drugs (user_id, din, description, schedule)
  select distinct on (r.din)
    v_uid,
    r.din,
    left(coalesce(nullif(btrim(r.description), ''), 'Imported DIN ' || r.din), 500),
    left(coalesce(nullif(btrim(r.schedule), ''), 'Verify'), 50)
  from _import_parsed r
  where r.is_valid
  order by r.din
  on conflict (user_id, din) do nothing;

  insert into inventory_transactions
    (user_id, drug_id, transaction_type, quantity, date, source, file_name)
  select v_uid, d.id, v_type, v_sign * r.quantity, r.tx_date, v_source, v_file
  from _import_parsed r
  join drugs d on d.user_id = v_uid and d.din = r.din
  where r.is_valid;

  get diagnostics v_saved = row_count;

  select coalesce(jsonb_agg(m.msg), '[]'::jsonb)
    into v_errors
    from (
      select format('DIN %s: %s', nullif(r.din, ''), r.reason) as msg
      from _import_parsed r
      where not r.is_valid
      limit 20
    ) m;

  drop table _import_parsed;

  insert into audit_logs (performed_by, action, target_user_id, details)
  values (v_uid, 'import_ledger_rows', v_uid,
          jsonb_build_object('kind', p_kind, 'file_name', v_file, 'mode', p_mode,
                             'rows', v_total, 'saved', v_saved, 'replaced', v_voided));

  return jsonb_build_object('saved', v_saved, 'skipped', v_total - v_saved,
                            'errors', v_errors, 'replaced', v_voided);
end;
$function$;

revoke all on function public.import_ledger_rows(text, text, jsonb, text) from PUBLIC, anon;
grant execute on function public.import_ledger_rows(text, text, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. imported_records: the record list for one kind, aggregated, in one request
--    One entry per file, drug and day (quantities summed). SECURITY INVOKER: row level
--    security still applies, the user_id predicate only lets the planner use the index.
--    Returned as a single jsonb value so PostgREST's 1,000-row limit does not truncate it.
-- ---------------------------------------------------------------------------
create or replace function public.imported_records(p_kind text)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public'
as $function$
declare
  v_type text;
begin
  case p_kind
    when 'purchase'    then v_type := 'PURCHASE';
    when 'dispense'    then v_type := 'DISPENSE';
    when 'destruction' then v_type := 'ADJUSTMENT';
    else raise exception 'Unknown record kind';
  end case;

  return (
    select coalesce(jsonb_agg(
             jsonb_build_object(
               'id', g.id,
               'din', d.din,
               'description', d.description,
               'quantity', g.quantity,
               'created_at', g.created_at,
               'file_name', g.file_name,
               'entries', g.entries
             )
             order by g.last_at desc, g.file_name, d.din, g.created_at
           ), '[]'::jsonb)
      from (
        select
          t.file_name,
          t.drug_id,
          coalesce(t.date::text, to_char(t.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) as created_at,
          (array_agg(t.id order by t.id))[1] as id,
          sum(abs(t.quantity))::bigint as quantity,
          count(*)::integer as entries,
          max(t.created_at) as last_at
        from inventory_transactions t
        where t.user_id = (select auth.uid())
          and t.transaction_type = v_type
          and t.voided_at is null
        group by t.file_name, t.drug_id, coalesce(t.date::text, to_char(t.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      ) g
      left join drugs d on d.id = g.drug_id
  );
end;
$function$;

revoke all on function public.imported_records(text) from PUBLIC, anon;
grant execute on function public.imported_records(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. void_imported_records: same behaviour, plus an audit row
-- ---------------------------------------------------------------------------
create or replace function public.void_imported_records(
  p_transaction_type text,
  p_file_name text default null,
  p_start timestamptz default null,
  p_end timestamptz default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_transaction_type is null or p_transaction_type not in ('PURCHASE', 'DISPENSE', 'ADJUSTMENT') then
    raise exception 'A valid transaction type is required';
  end if;

  if p_file_name is null and (p_start is null or p_end is null) then
    raise exception 'Provide a file name or a date range';
  end if;

  update inventory_transactions
     set voided_at = now(),
         voided_by = v_user_id
   where user_id = v_user_id
     and transaction_type = p_transaction_type
     and voided_at is null
     and (p_file_name is null or file_name = p_file_name)
     and (p_start is null or created_at >= p_start)
     and (p_end is null or created_at <= p_end);

  get diagnostics v_count = row_count;

  insert into audit_logs (performed_by, action, target_user_id, details)
  values (v_user_id, 'void_imported_records', v_user_id,
          jsonb_build_object('transaction_type', p_transaction_type, 'file_name', p_file_name,
                             'start', p_start, 'end', p_end, 'voided', v_count));

  return v_count;
end;
$function$;

revoke all on function public.void_imported_records(text, text, timestamptz, timestamptz) from PUBLIC, anon;
grant execute on function public.void_imported_records(text, text, timestamptz, timestamptz) to authenticated;

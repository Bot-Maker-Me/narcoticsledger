-- Net quantities: returns, reversals and corrections (negative rows in a supplier file) must
-- REDUCE the totals instead of being dropped or turned positive.
--
--   * _parse_import_rows accepts a negative quantity (non-zero, |q| <= 1,000,000). The ledger
--     sign is still applied by import_ledger_rows (+ for purchases, - for dispenses), so a
--     -1 in a purchase file becomes -1 stock and a -1 in a dispense file gives 1 back.
--   * imported_records returns the NET quantity in the direction of the kind
--     (sum of the signed ledger rows; sign flipped for dispenses/destructions) instead of
--     sum(abs(quantity)), which added every reversal to the total.
--
-- Files imported before this migration lost their negative rows; re-import them with
-- "Replace" to correct the totals.

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
      case when x.quantity ~ '^-?[0-9]{1,7}$' then x.quantity::integer end as quantity,
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
    coalesce(t.din ~ '^[0-9]{6,10}$' and t.quantity between -1000000 and 1000000 and t.quantity <> 0
       and t.tx_date between date '2000-01-01' and current_date + 1, false) as is_valid,
    case
      when t.din !~ '^[0-9]{6,10}$' then 'DIN must be 6-10 digits'
      when t.quantity is null or t.quantity = 0 or t.quantity not between -1000000 and 1000000 then 'quantity must be a non-zero number up to 1,000,000'
      when t.tx_date is null or t.tx_date not between date '2000-01-01' and current_date + 1 then 'date is missing or out of range'
    end as reason
  from typed t;
$function$;

revoke all on function public._parse_import_rows(jsonb) from PUBLIC, anon, authenticated;

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
          (sum(t.quantity) * case when v_type = 'PURCHASE' then 1 else -1 end)::bigint as quantity,
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

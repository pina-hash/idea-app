-- 0330_coin_records_search.sql
--
-- A COIN RECORD SEARCH FOR A FULL COIN ADMIN (ledger 0471, part 2), so a past
-- record can be corrected from a chat.
--
-- WHY. Mr. Pina approved re-typing about 72 Weekly Pay records logged on
-- 2026-10-19 under Contract Completion (notes beginning "Weekly pay, week of
-- Oct 19") to the Weekly Pay category 0322 added. 0322's
-- coin_transactions_relabel corrects a record by its id, and no read reached
-- through the connector returned record ids by category and date:
-- coin_public_transactions carries no ids (it is the public board), and
-- coin_autopay_recent lists automatic pay only.
--
-- WHAT. coin_records_search(category, from, to, note, limit, offset): the
-- coin records matching every filter given, newest first, each with its id,
-- the student's roster name and address, the amount as it stands after any
-- amount correction (_coin_effective_amount, the figure every balance sums),
-- its category, note, time, school day and whether it has been reversed.
--   * category: a category's short name (contract_completion) or its name
--     (Contract Completion), any case, retired ones included, because a past
--     record keeps the category it was logged under.
--   * from, to: school days, inclusive, read in school time
--     (America/Los_Angeles), so "on Oct 19" is from = to = 2026-10-19.
--   * note: any part of the note, any case.
--   * limit (1 to 500, default 100) and offset page the answer; `total` is
--     every match and `next_offset` is null on the last page.
--
-- WHO. A full coin admin only: `_coin_full_staff()`, decision 68's tier for
-- every power over any student (docs/subsystems/coins.md). Section coin staff,
-- every other admin and every student are refused in the same words, and the
-- function READS ONLY: it writes no row anywhere. Correcting what it finds is
-- coin_transactions_relabel's, which re-checks the same tier and refuses a
-- reversed record itself, so this file states none of that rule.
--
-- DEPLOY ORDERING: none. A new function, called only through the connector.
--
-- WHAT UNDOES IT, a person's paste:
--   drop function if exists public.coin_records_search(text, date, date, text, integer, integer);

do $pre$
begin
	if to_regprocedure('public._coin_full_staff()') is null then
		raise exception '0330 cannot apply: _coin_full_staff does not exist. Apply 0244 first.';
	end if;
	if to_regprocedure('public.coin_transactions_relabel(jsonb)') is null then
		raise exception '0330 cannot apply: coin_transactions_relabel does not exist. Apply 0322 first.';
	end if;
end
$pre$;

create or replace function public.coin_records_search(
	p_category text default null,
	p_from date default null,
	p_to date default null,
	p_note text default null,
	p_limit integer default 100,
	p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $search$
declare
	v_cat text := nullif(btrim(coalesce(p_category, '')), '');
	v_cat_id text;
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_like text;
	v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
	v_offset integer := greatest(0, coalesce(p_offset, 0));
	v_total integer;
	v_rows jsonb;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can search coin records.';
	end if;
	if p_from is not null and p_to is not null and p_from > p_to then
		return jsonb_build_object('ok', false, 'reason', 'dates',
			'message', 'The first day comes after the last day. Swap them and ask again.');
	end if;
	if v_cat is not null then
		select c.id into v_cat_id from public.coin_categories c
		where c.id = lower(v_cat) or lower(c.name) = lower(v_cat)
		order by (c.id = lower(v_cat)) desc, c.id
		limit 1;
		if v_cat_id is null then
			return jsonb_build_object('ok', false, 'reason', 'category',
				'message', format('There is no coin category "%s".', v_cat));
		end if;
	end if;
	if v_note is not null then
		v_like := '%' || replace(replace(replace(lower(v_note), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
	end if;

	-- One statement: every match counted once, and the one page of it built.
	with hits as (
		select t.id, t.created_at
		from public.coin_transactions t
		where (v_cat_id is null or t.category_id = v_cat_id)
			and (p_from is null or (t.created_at at time zone 'America/Los_Angeles')::date >= p_from)
			and (p_to is null or (t.created_at at time zone 'America/Los_Angeles')::date <= p_to)
			and (v_like is null or lower(coalesce(t.note, '')) like v_like)
	), page as (
		select h.id from hits h
		order by h.created_at desc, h.id desc
		limit v_limit offset v_offset
	)
	select (select count(*)::integer from hits),
		coalesce((select jsonb_agg(jsonb_build_object(
				'id', t.id,
				'at', t.created_at,
				'day', (t.created_at at time zone 'America/Los_Angeles')::date,
				'email', t.student_email,
				'name', coalesce(ros.display_name, t.student_email),
				'amount', public._coin_effective_amount(t.id),
				'category_id', t.category_id,
				'category', c.name,
				'note', t.note,
				'reversed', public._coin_is_reversed(t.id))
				order by t.created_at desc, t.id desc)
			from page
			join public.coin_transactions t on t.id = page.id
			join public.coin_categories c on c.id = t.category_id
			left join public._coin_public_roster() ros on ros.student_email = t.student_email), '[]'::jsonb)
	into v_total, v_rows;

	return jsonb_build_object(
		'ok', true,
		'category', v_cat_id,
		'from', p_from,
		'to', p_to,
		'note', v_note,
		'total', v_total,
		'offset', v_offset,
		'limit', v_limit,
		'next_offset', case when v_offset + v_limit < v_total then v_offset + v_limit end,
		'records', v_rows
	);
end
$search$;

revoke all on function public.coin_records_search(text, date, date, text, integer, integer)
	from public, anon, authenticated, service_role;
grant execute on function public.coin_records_search(text, date, date, text, integer, integer)
	to authenticated;

do $check$
begin
	if has_function_privilege('anon', 'public.coin_records_search(text, date, date, text, integer, integer)', 'execute') then
		raise exception '0330: coin_records_search is executable by anon.';
	end if;
	if not has_function_privilege('authenticated', 'public.coin_records_search(text, date, date, text, integer, integer)', 'execute') then
		raise exception '0330: coin_records_search is not executable by authenticated.';
	end if;
	if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = 'coin_records_search') <> 1 then
		raise exception '0330: coin_records_search does not have exactly one form.';
	end if;
	if (select position('public._coin_full_staff()' in p.prosrc) = 0 or position('public.is_admin()' in p.prosrc) > 0
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = 'coin_records_search') then
		raise exception '0330: coin_records_search must open with _coin_full_staff(), never is_admin().';
	end if;
	raise notice '0330: coin record search ready over % coin records.', (select count(*) from public.coin_transactions);
end
$check$;

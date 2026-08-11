-- 0084_coin_legacy_import.sql
-- Legacy Sheets migration: the schema + RPCs that bring the old Google
-- Sheets / Apps Script ledger's history (71 students, ~216 transactions, the
-- contract postings) into the 0070+ coin economy -- name-keyed data mapped to
-- emails, fully reconciled, idempotent, and reversible. The UI half is the
-- /coin-desk/migrate wizard (Phase 2 of the coin-system consolidation; the
-- route group was Phase 1).
--
-- ---------------------------------------------------------------------------
-- DOCTRINE: RAW INSERTS, NEVER coin_log_transaction
-- ---------------------------------------------------------------------------
-- Imported rows are HISTORY, not new events. Every live rule 0070 enforces at
-- logging time -- the debt lockout, the Eating Pass strike/revoke machinery,
-- Extra Credit's semester cap, the calendar-boundary caps -- describes what
-- may happen NEXT, and none of them may fire on (or read) events that already
-- happened under the old system's own rules. So coin_admin_import_legacy
-- writes coin_transactions directly (the one deliberate exception to "every
-- write funnels through the logging RPCs"), and every imported row lands
-- under one of four LEGACY CATEGORIES that exist only here:
--
--   legacy_award / legacy_fine / legacy_purchase / legacy_payout
--
-- all four `loggable = false, active = false`, so no live rule can ever
-- mistake a legacy row for its own event: an old eating-pass purchase is a
-- `legacy_purchase` row, which coin_eating_pass_active() (keyed on the
-- literal 'eating_pass' category id) never reads, so it does NOT grant the
-- new pass -- matching docs v3's refund-only transition policy -- and none of
-- them can ever be logged directly (coin_log_transaction refuses inactive
-- and non-loggable categories both).
--
-- Signs are applied by TYPE, mirroring the sheet's own semantics (amounts in
-- the sheet are positive magnitudes): Award / "Award - Held" credit,
-- Fine / "Fine - Owed" / Purchase / Payout debit. Per-student, the sheet's
-- transaction log sums exactly to its summary columns (verified against the
-- live sheet, 0 mismatches across all 71 students), so the imported balance
-- per student is Awarded - Fines - Spent - Paid Out. The summary's Coin
-- Balance / Bank Balance / Debt columns are old physical-coin bookkeeping
-- and do not migrate.
--
-- Timestamps: the sheet's naive local timestamps are interpreted as
-- America/Los_Angeles, stored as the row's real created_at, and semester_key
-- is computed FROM THAT DATE via the existing coin_semester_key(p_at) --
-- 0070's function already takes a timestamptz parameter, so no second copy
-- of the calendar logic exists; letting the column DEFAULT run would stamp
-- today's key on every historical row.
--
-- ---------------------------------------------------------------------------
-- THE BATCH / ROLLBACK MODEL
-- ---------------------------------------------------------------------------
-- A pull is stored verbatim as a coin_import_batches row (`raw` jsonb -- the
-- archival record of exactly what the wizard fetched). Committing a batch
-- tags every row it writes with the batch id (coin_transactions.meta ->>
-- 'import_batch'; a new nullable coin_contracts.import_batch column;
-- coin_students.source), which is what makes the import REVERSIBLE:
-- coin_admin_rollback_import deletes exactly the tagged rows and clears
-- committed_at, and nothing else. Idempotency is enforced at commit: a batch
-- can never be committed twice, and no batch can be committed while another
-- committed batch exists un-rolled-back -- so the legacy history can only
-- ever exist ONCE in the ledger.
--
-- Rollback is the safety valve for a botched commit and is scoped to the
-- batch's own tags. It deliberately does NOT touch untagged follow-ups (a
-- refund correction logged after the import via coin_admin_adjust_balance
-- stays); the never-delete convention stands for everything operational.
--
-- ---------------------------------------------------------------------------
-- coin_students: THE NAME DIRECTORY, AND THE STANDING COALESCE RULE
-- ---------------------------------------------------------------------------
-- Balances are email-keyed and a balance can exist for an email that has
-- never signed in (0070's doctrine) -- but such an email has no profiles row
-- and therefore no display name anywhere. coin_students is the directory
-- that closes that gap: one row per imported student, carrying the sheet
-- name verbatim. THE STANDING RULE for any surface that shows a student
-- name for a coin email:
--
--   coalesce(coin_students.display_name, profiles display/full name,
--            the email's local part)
--
-- Apply manually in the Supabase SQL editor, after 0083.

-- ===========================================================================
-- 1. coin_students -- the imported-name directory.
-- ===========================================================================
create table if not exists public.coin_students (
	student_email text primary key
		check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	-- The sheet name verbatim ("Last, First"), never reformatted.
	display_name text not null check (char_length(btrim(display_name)) between 1 and 200),
	-- The sheet's Section column ('IDEA-113', 'External', ...). Informational.
	legacy_section text,
	-- Which import wrote this row: 'legacy-import:<batch uuid>'. What rollback
	-- keys its delete on.
	source text,
	created_at timestamptz not null default now()
);

revoke all on public.coin_students from anon, authenticated;
grant select on public.coin_students to authenticated;
alter table public.coin_students enable row level security;

drop policy if exists "admins read coin students" on public.coin_students;
create policy "admins read coin students"
	on public.coin_students
	for select
	to authenticated
	using (public.is_admin());

-- No insert/update/delete policies: only the import/rollback RPCs write.

-- ===========================================================================
-- 2. coin_import_mappings -- the name -> email mapping DRAFT. The 71-row
--    mapping is real work that must survive multiple sittings, so the wizard
--    autosaves it here as it is edited; the mapping actually APPLIED at
--    commit is snapshotted into the batch's report, so a later draft edit
--    can never rewrite what a committed batch meant.
-- ===========================================================================
create table if not exists public.coin_import_mappings (
	legacy_name text primary key check (char_length(btrim(legacy_name)) between 1 and 200),
	-- Null while still unmapped; lowercased when set.
	email text check (email is null or (email = lower(btrim(email)) and email like '%@%')),
	-- How the email was arrived at (the wizard's status chip). 'external'
	-- additionally relaxes the @boscotech.net domain rule for that row.
	status text not null default 'unmapped'
		check (status in ('unmapped', 'profile', 'pattern', 'hand', 'external')),
	updated_at timestamptz not null default now(),
	updated_by text
);

revoke all on public.coin_import_mappings from anon, authenticated;
grant select on public.coin_import_mappings to authenticated;
alter table public.coin_import_mappings enable row level security;

drop policy if exists "admins read coin import mappings" on public.coin_import_mappings;
create policy "admins read coin import mappings"
	on public.coin_import_mappings
	for select
	to authenticated
	using (public.is_admin());

-- ===========================================================================
-- 3. coin_import_batches -- one row per pull. `raw` is the verbatim snapshot
--    (summary rows, transaction rows, contract rows) and is the archival
--    record; committing stamps committed_at/by and stores the report
--    (applied mappings + per-student results); rolling back clears them.
-- ===========================================================================
create table if not exists public.coin_import_batches (
	id uuid primary key default gen_random_uuid(),
	raw jsonb not null,
	pulled_at timestamptz not null default now(),
	committed_at timestamptz,
	committed_by text,
	report jsonb
);

revoke all on public.coin_import_batches from anon, authenticated;
grant select on public.coin_import_batches to authenticated;
alter table public.coin_import_batches enable row level security;

drop policy if exists "admins read coin import batches" on public.coin_import_batches;
create policy "admins read coin import batches"
	on public.coin_import_batches
	for select
	to authenticated
	using (public.is_admin());

-- ===========================================================================
-- 4. The batch tag on contracts. coin_transactions already has `meta` jsonb
--    and coin_students carries `source`; contracts have neither, so the tag
--    is a real nullable column (null = a live contract, untouched by any
--    rollback). Claims need no tag of their own: they belong to their
--    contract (FK on delete cascade), so "the batch's claims" is exactly
--    "claims on the batch's contracts".
-- ===========================================================================
alter table public.coin_contracts add column if not exists import_batch uuid;

-- ===========================================================================
-- 5. The four legacy categories. Seeded the 0081 way (on conflict do update)
--    -- with one deliberate difference: `active` IS in the update list here,
--    unlike 0070/0081's seeds, because these rows have exactly one intended
--    state (retired, never loggable) and a re-apply should restore it.
--    `loggable = false` is the hard lock: coin_log_transaction refuses
--    non-loggable categories even if `active` were ever flipped through
--    coin_admin_set_category_active (0080).
--
--    legacy_payout is kind 'purchase' to match coin_payout, the live payout
--    category: kind is what carries a category's ledger direction, and a
--    payout debits the balance exactly as a purchase does.
-- ===========================================================================
insert into public.coin_categories
	(id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label, formula_key, semester_point_cap, cap_period, cap_count, loggable, active, sort_order, notes)
values
	('legacy_award', 'Legacy Award (Sheets)', 'award', 'core', 'variable', null, null, null, null, null, null, null, null, false, false, 990,
		'Imported from the old Google Sheets ledger (types Award / "Award - Held"). History only: never loggable, so no live rule ever reads a legacy row as its own event.'),
	('legacy_fine', 'Legacy Fine (Sheets)', 'fine', 'core', 'variable', null, null, null, null, null, null, null, null, false, false, 991,
		'Imported from the old Google Sheets ledger (types Fine / "Fine - Owed"). History only; see legacy_award.'),
	('legacy_purchase', 'Legacy Purchase (Sheets)', 'purchase', 'core', 'variable', null, null, null, null, null, null, null, null, false, false, 992,
		'Imported from the old Google Sheets ledger (type Purchase). History only. An old eating-pass purchase lives here, which is why it can never read as an active pass: coin_eating_pass_active() keys on the literal eating_pass category id (refund-only transition, docs v3 item 9).'),
	('legacy_payout', 'Legacy Payout (Sheets)', 'purchase', 'core', 'variable', null, null, null, null, null, null, null, null, false, false, 993,
		'Imported from the old Google Sheets ledger (type Payout). History only; purchase-kind to match coin_payout, the live payout category.')
on conflict (id) do update set
	name = excluded.name,
	kind = excluded.kind,
	scope = excluded.scope,
	pricing_model = excluded.pricing_model,
	amount = excluded.amount,
	min_amount = excluded.min_amount,
	max_amount = excluded.max_amount,
	unit_label = excluded.unit_label,
	formula_key = excluded.formula_key,
	semester_point_cap = excluded.semester_point_cap,
	cap_period = excluded.cap_period,
	cap_count = excluded.cap_count,
	loggable = excluded.loggable,
	active = excluded.active,
	sort_order = excluded.sort_order,
	notes = excluded.notes;

-- ===========================================================================
-- 6. Saving the mapping draft. Takes the whole mapping as one jsonb array of
--    {legacy_name, email, status} rows and upserts each -- one round trip
--    per autosave, the coin_bulk_* convention. Blank emails are stored as
--    null (a genuinely unmapped draft row is a normal state here).
-- ===========================================================================
create or replace function public.coin_admin_save_import_mappings(p_mappings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_row jsonb;
	v_name text;
	v_email text;
	v_status text;
	v_saved integer := 0;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can edit the legacy import mapping.';
	end if;
	if p_mappings is null or jsonb_typeof(p_mappings) <> 'array' then
		raise exception 'Mappings must be a JSON array of {legacy_name, email, status} rows.';
	end if;

	for v_row in select * from jsonb_array_elements(p_mappings) loop
		v_name := btrim(coalesce(v_row ->> 'legacy_name', ''));
		if v_name = '' then
			continue;
		end if;
		v_email := nullif(lower(btrim(coalesce(v_row ->> 'email', ''))), '');
		if v_email is not null and v_email not like '%@%' then
			-- A half-typed email is draft state, not an error -- but the table
			-- CHECK requires a plausible address, so store it as unmapped
			-- rather than refusing the whole autosave.
			v_email := null;
		end if;
		v_status := coalesce(nullif(btrim(coalesce(v_row ->> 'status', '')), ''), 'unmapped');
		if v_status not in ('unmapped', 'profile', 'pattern', 'hand', 'external') then
			v_status := 'unmapped';
		end if;

		insert into public.coin_import_mappings (legacy_name, email, status, updated_at, updated_by)
		values (v_name, v_email, v_status, now(), public.current_user_email())
		on conflict (legacy_name) do update set
			email = excluded.email,
			status = excluded.status,
			updated_at = now(),
			updated_by = excluded.updated_by;
		v_saved := v_saved + 1;
	end loop;

	return jsonb_build_object('ok', true, 'saved', v_saved);
end;
$$;

revoke all on function public.coin_admin_save_import_mappings(jsonb) from public;
grant execute on function public.coin_admin_save_import_mappings(jsonb) to authenticated;

-- ===========================================================================
-- 7. Creating a batch from a pull. The wizard's PULL step fetches the two
--    published CSVs plus the contracts actions server-side, parses them, and
--    hands the whole snapshot here. Light shape validation only -- the deep
--    validation happens at commit, where refusals name what is wrong.
-- ===========================================================================
create or replace function public.coin_admin_create_import_batch(p_raw jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_id uuid;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can pull the legacy ledger.';
	end if;
	if p_raw is null
		or jsonb_typeof(p_raw -> 'summary') <> 'array'
		or jsonb_typeof(p_raw -> 'transactions') <> 'array' then
		raise exception 'A pull snapshot needs summary and transactions arrays.';
	end if;

	insert into public.coin_import_batches (raw) values (p_raw) returning id into v_id;
	return jsonb_build_object('ok', true, 'batch_id', v_id);
end;
$$;

revoke all on function public.coin_admin_create_import_batch(jsonb) from public;
grant execute on function public.coin_admin_create_import_batch(jsonb) to authenticated;

-- ===========================================================================
-- 8. THE IMPORT. One transaction: validates everything first (structured
--    refusals, nothing partial ever lands), then raw-inserts the history --
--    see the header for why coin_log_transaction is deliberately never
--    called. Contracts likewise land by direct insert in their terminal
--    state; coin_admin_complete_contract is NEVER called, because the
--    completion payouts already exist in the transaction history and must
--    not pay a second time.
--
--    p_mappings: [{legacy_name, email}] covering every name that appears in
--    the summary, the transaction log, or a contract's contractors list.
-- ===========================================================================
create or replace function public.coin_admin_import_legacy(p_batch_id uuid, p_mappings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_batch public.coin_import_batches;
	v_other uuid;
	v_actor text := public.current_user_email();
	v_source text;
	v_map jsonb := '{}'::jsonb;
	v_row jsonb;
	v_name text;
	v_email text;
	v_bad jsonb;
	v_type text;
	v_status text;
	v_amount integer;
	v_created timestamptz;
	v_signed integer;
	v_category text;
	v_title text;
	v_payout integer;
	v_added timestamptz;
	v_completed timestamptz;
	v_cancelled timestamptz;
	v_claimants integer;
	v_contract_id uuid;
	v_students integer := 0;
	v_txns integer := 0;
	v_contracts integer := 0;
	v_claims integer := 0;
	v_results jsonb;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can import the legacy ledger.';
	end if;

	-- Serialize commits (and rollbacks, which take the same lock): the
	-- "no second committed batch" rule below is check-then-act, and two
	-- concurrent commits of two different batches would otherwise both pass it.
	perform pg_advisory_xact_lock(hashtext('coin_admin_import_legacy'));

	select * into v_batch from public.coin_import_batches where id = p_batch_id for update;
	if v_batch.id is null then
		raise exception 'Unknown import batch.';
	end if;
	if v_batch.committed_at is not null then
		return jsonb_build_object('ok', false, 'reason', 'batch_already_committed',
			'committed_at', v_batch.committed_at);
	end if;
	select id into v_other from public.coin_import_batches
		where committed_at is not null limit 1;
	if v_other is not null then
		return jsonb_build_object('ok', false, 'reason', 'another_batch_committed',
			'batch_id', v_other);
	end if;

	-- ---- Build the name -> email map. -----------------------------------
	if p_mappings is null or jsonb_typeof(p_mappings) <> 'array' then
		raise exception 'Mappings must be a JSON array of {legacy_name, email} rows.';
	end if;
	for v_row in select * from jsonb_array_elements(p_mappings) loop
		v_name := lower(btrim(coalesce(v_row ->> 'legacy_name', '')));
		v_email := lower(btrim(coalesce(v_row ->> 'email', '')));
		if v_name = '' or v_email = '' then
			continue; -- an unmapped draft row; the coverage check below names it
		end if;
		if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
			return jsonb_build_object('ok', false, 'reason', 'invalid_email',
				'name', v_row ->> 'legacy_name', 'email', v_email);
		end if;
		v_map := v_map || jsonb_build_object(v_name, v_email);
	end loop;

	-- Two legacy names mapping to one email would silently merge two
	-- students' histories -- refused, never merged.
	select jsonb_build_object('email', d.email, 'names', d.names) into v_bad
	from (
		select value #>> '{}' as email, jsonb_agg(key) as names
		from jsonb_each(v_map)
		group by 1
		having count(*) > 1
		limit 1
	) d;
	if v_bad is not null then
		return jsonb_build_object('ok', false, 'reason', 'duplicate_email') || v_bad;
	end if;

	-- Every name anywhere in the snapshot must resolve.
	select jsonb_agg(raw order by raw) into v_bad
	from (
		select distinct btrim(x.n) as raw
		from (
			select s ->> 'name' as n from jsonb_array_elements(v_batch.raw -> 'summary') s
			union all
			select t ->> 'name' from jsonb_array_elements(v_batch.raw -> 'transactions') t
			union all
			select c2.value #>> '{}'
			from jsonb_array_elements(coalesce(v_batch.raw -> 'contracts', '[]'::jsonb)) c,
				jsonb_array_elements(coalesce(c -> 'contractors', '[]'::jsonb)) c2
		) x
		where btrim(coalesce(x.n, '')) <> ''
			and (v_map ->> lower(btrim(x.n))) is null
		limit 25
	) names;
	if v_bad is not null then
		return jsonb_build_object('ok', false, 'reason', 'unmapped_name', 'names', v_bad);
	end if;

	-- ---- Validate the snapshot rows. ------------------------------------
	select jsonb_agg(distinct btrim(coalesce(t ->> 'type', ''))) into v_bad
	from jsonb_array_elements(v_batch.raw -> 'transactions') t
	where btrim(coalesce(t ->> 'type', ''))
		not in ('Award', 'Award - Held', 'Fine', 'Fine - Owed', 'Purchase', 'Payout');
	if v_bad is not null then
		return jsonb_build_object('ok', false, 'reason', 'unknown_type', 'types', v_bad);
	end if;

	select jsonb_agg(jsonb_build_object('row', t -> 'row', 'amount', t ->> 'amount')) into v_bad
	from (
		select t from jsonb_array_elements(v_batch.raw -> 'transactions') t
		where btrim(coalesce(t ->> 'amount', '')) !~ '^[0-9]+(\.[0-9]+)?$'
		limit 25
	) bad(t);
	if v_bad is not null then
		return jsonb_build_object('ok', false, 'reason', 'bad_amount', 'rows', v_bad);
	end if;

	select jsonb_agg(jsonb_build_object('row', t -> 'row', 'date', t ->> 'date')) into v_bad
	from (
		select t from jsonb_array_elements(v_batch.raw -> 'transactions') t
		where btrim(coalesce(t ->> 'date', ''))
			!~ '^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$'
		limit 25
	) bad(t);
	if v_bad is not null then
		return jsonb_build_object('ok', false, 'reason', 'bad_date', 'rows', v_bad);
	end if;

	select jsonb_agg(jsonb_build_object('row', s -> 'row', 'name', s ->> 'name')) into v_bad
	from (
		select s from jsonb_array_elements(v_batch.raw -> 'summary') s
		where btrim(coalesce(s ->> 'name', '')) = ''
			or btrim(coalesce(s ->> 'awarded', '0')) !~ '^-?[0-9]+(\.[0-9]+)?$'
			or btrim(coalesce(s ->> 'fines', '0')) !~ '^-?[0-9]+(\.[0-9]+)?$'
			or btrim(coalesce(s ->> 'spent', '0')) !~ '^-?[0-9]+(\.[0-9]+)?$'
			or btrim(coalesce(s ->> 'paid_out', '0')) !~ '^-?[0-9]+(\.[0-9]+)?$'
		limit 25
	) bad(s);
	if v_bad is not null then
		return jsonb_build_object('ok', false, 'reason', 'bad_summary_row', 'rows', v_bad);
	end if;

	select jsonb_agg(jsonb_build_object('row', c -> 'row', 'name', c ->> 'name',
		'status', c ->> 'status', 'total_payout', c ->> 'total_payout')) into v_bad
	from (
		select c from jsonb_array_elements(coalesce(v_batch.raw -> 'contracts', '[]'::jsonb)) c
		where btrim(coalesce(c ->> 'name', '')) = ''
			or btrim(coalesce(c ->> 'status', '')) not in ('Open', 'In Progress', 'Completed', 'Cancelled')
			or btrim(coalesce(c ->> 'total_payout', '')) !~ '^[0-9]+(\.[0-9]+)?$'
			or round((c ->> 'total_payout')::numeric) < 1
			or (nullif(btrim(coalesce(c ->> 'date_added', '')), '') is not null
				and btrim(c ->> 'date_added') !~ '^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$')
			or (nullif(btrim(coalesce(c ->> 'date_completed', '')), '') is not null
				and btrim(c ->> 'date_completed') !~ '^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$')
		limit 25
	) bad(c);
	if v_bad is not null then
		return jsonb_build_object('ok', false, 'reason', 'bad_contract', 'rows', v_bad);
	end if;

	-- ---- Everything validated; write the history. -----------------------
	v_source := 'legacy-import:' || p_batch_id::text;

	for v_row in select * from jsonb_array_elements(v_batch.raw -> 'summary') loop
		v_name := btrim(v_row ->> 'name');
		v_email := v_map ->> lower(v_name);
		insert into public.coin_students (student_email, display_name, legacy_section, source)
		values (v_email, v_name, nullif(btrim(coalesce(v_row ->> 'section', '')), ''), v_source)
		on conflict (student_email) do update set
			display_name = excluded.display_name,
			legacy_section = excluded.legacy_section,
			source = excluded.source;
		v_students := v_students + 1;
	end loop;

	for v_row in select * from jsonb_array_elements(v_batch.raw -> 'transactions') loop
		v_name := btrim(v_row ->> 'name');
		v_email := v_map ->> lower(v_name);
		v_type := btrim(v_row ->> 'type');
		v_amount := round((v_row ->> 'amount')::numeric)::integer;
		v_created := replace(btrim(v_row ->> 'date'), 'T', ' ')::timestamp
			at time zone 'America/Los_Angeles';
		v_signed := case when v_type in ('Award', 'Award - Held') then v_amount else -v_amount end;
		v_category := case
			when v_type in ('Award', 'Award - Held') then 'legacy_award'
			when v_type in ('Fine', 'Fine - Owed') then 'legacy_fine'
			when v_type = 'Purchase' then 'legacy_purchase'
			else 'legacy_payout'
		end;

		insert into public.coin_transactions
			(student_email, category_id, amount, quantity, note, meta, actor_email, semester_key, created_at)
		values (
			v_email,
			v_category,
			v_signed,
			null,
			nullif(left(btrim(coalesce(v_row ->> 'reason', '')), 500), ''),
			jsonb_build_object(
				'legacy_reason', v_row ->> 'reason',
				'legacy_type', v_type,
				'legacy_row', v_row -> 'row',
				'import_batch', p_batch_id::text
			),
			v_actor,
			public.coin_semester_key(v_created),
			v_created
		);
		v_txns := v_txns + 1;
	end loop;

	for v_row in select * from jsonb_array_elements(coalesce(v_batch.raw -> 'contracts', '[]'::jsonb)) loop
		v_status := btrim(v_row ->> 'status');
		v_title := left(btrim(v_row ->> 'name'), 200);
		v_payout := round((v_row ->> 'total_payout')::numeric)::integer;
		v_added := case
			when nullif(btrim(coalesce(v_row ->> 'date_added', '')), '') is null then now()
			else replace(btrim(v_row ->> 'date_added'), 'T', ' ')::timestamp
				at time zone 'America/Los_Angeles'
		end;
		-- Completed maps to completed_at; Cancelled to cancelled_at. The sheet
		-- records no cancellation date, so a cancelled contract closes at its
		-- completion date if one was entered, else its posting date.
		v_completed := case
			when v_status = 'Completed' then coalesce(
				(replace(nullif(btrim(coalesce(v_row ->> 'date_completed', '')), ''), 'T', ' '))::timestamp
					at time zone 'America/Los_Angeles',
				v_added)
			else null
		end;
		v_cancelled := case
			when v_status = 'Cancelled' then coalesce(
				(replace(nullif(btrim(coalesce(v_row ->> 'date_completed', '')), ''), 'T', ' '))::timestamp
					at time zone 'America/Los_Angeles',
				v_added)
			else null
		end;

		select count(distinct (v_map ->> lower(btrim(c2.value #>> '{}'))))::integer into v_claimants
		from jsonb_array_elements(coalesce(v_row -> 'contractors', '[]'::jsonb)) c2
		where btrim(coalesce(c2.value #>> '{}', '')) <> '';

		insert into public.coin_contracts
			(title, description, payout_amount, max_contractors, section_id, created_by,
			 created_at, completed_at, cancelled_at, cancel_reason, import_batch)
		values (
			v_title,
			nullif(left(btrim(coalesce(v_row ->> 'notes', '')), 2000), ''),
			v_payout,
			greatest(1, v_claimants),
			null,
			v_actor,
			v_added,
			v_completed,
			v_cancelled,
			null,
			p_batch_id
		)
		returning id into v_contract_id;
		v_contracts := v_contracts + 1;

		insert into public.coin_contract_claims (contract_id, student_email, claimed_at)
		select v_contract_id, k.em, v_added
		from (
			select distinct (v_map ->> lower(btrim(c2.value #>> '{}'))) as em
			from jsonb_array_elements(coalesce(v_row -> 'contractors', '[]'::jsonb)) c2
			where btrim(coalesce(c2.value #>> '{}', '')) <> ''
		) k
		where k.em is not null;
		v_claims := v_claims + v_claimants;
	end loop;

	-- ---- Per-student results (the bulk-RPC shape). One transaction means
	--      all-or-nothing, so on success every row reads ok -- the shape is
	--      kept anyway so the wizard renders it like every other bulk result.
	with summary as (
		select btrim(s ->> 'name') as name,
			(v_map ->> lower(btrim(s ->> 'name'))) as email
		from jsonb_array_elements(v_batch.raw -> 'summary') s
	),
	sums as (
		select t.student_email, count(*)::integer as n, sum(t.amount)::integer as net
		from public.coin_transactions t
		where t.meta ->> 'import_batch' = p_batch_id::text
		group by 1
	)
	select coalesce(jsonb_agg(jsonb_build_object(
		'email', su.email, 'name', su.name, 'ok', true,
		'transactions', coalesce(m.n, 0), 'amount', coalesce(m.net, 0)
	) order by su.name), '[]'::jsonb)
	into v_results
	from summary su
	left join sums m on m.student_email = su.email;

	update public.coin_import_batches set
		committed_at = now(),
		committed_by = v_actor,
		report = jsonb_build_object(
			'mappings', v_map,
			'students', v_students,
			'transactions', v_txns,
			'contracts', v_contracts,
			'claims', v_claims,
			'results', v_results
		)
	where id = p_batch_id;

	return jsonb_build_object(
		'ok', true,
		'batch_id', p_batch_id,
		'students', v_students,
		'transactions', v_txns,
		'contracts', v_contracts,
		'claims', v_claims,
		'total', v_students,
		'succeeded', v_students,
		'refused', 0,
		'results', v_results
	);
end;
$$;

revoke all on function public.coin_admin_import_legacy(uuid, jsonb) from public;
grant execute on function public.coin_admin_import_legacy(uuid, jsonb) to authenticated;

-- ===========================================================================
-- 9. ROLLBACK -- the safety valve for a botched commit. Deletes EXACTLY the
--    rows the batch tagged: coin_transactions by meta ->> 'import_batch',
--    coin_contracts by import_batch (their claims go with them via the FK
--    cascade -- including any claim a student made on an imported contract
--    after the import, which cannot outlive its contract), and coin_students
--    by source. Then clears committed_at/by and the report, returning the
--    batch to committable.
--
--    UNTAGGED FOLLOW-UPS ARE NOT TOUCHED, deliberately: a refund correction
--    logged after the import (coin_admin_adjust_balance), a live purchase, a
--    live contract -- anything the import did not itself write -- survives a
--    rollback. This is the one delete path in the coin economy, scoped to
--    the batch's own tags; the never-delete convention stands for everything
--    operational.
-- ===========================================================================
create or replace function public.coin_admin_rollback_import(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_batch public.coin_import_batches;
	v_txns integer;
	v_claims integer;
	v_contracts integer;
	v_students integer;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can roll back a legacy import.';
	end if;

	perform pg_advisory_xact_lock(hashtext('coin_admin_import_legacy'));

	select * into v_batch from public.coin_import_batches where id = p_batch_id for update;
	if v_batch.id is null then
		raise exception 'Unknown import batch.';
	end if;
	if v_batch.committed_at is null then
		return jsonb_build_object('ok', false, 'reason', 'not_committed');
	end if;

	delete from public.coin_transactions
		where meta ->> 'import_batch' = p_batch_id::text;
	get diagnostics v_txns = row_count;

	select count(*)::integer into v_claims
	from public.coin_contract_claims
	where contract_id in (select id from public.coin_contracts where import_batch = p_batch_id);

	delete from public.coin_contracts where import_batch = p_batch_id;
	get diagnostics v_contracts = row_count;

	delete from public.coin_students
		where source = 'legacy-import:' || p_batch_id::text;
	get diagnostics v_students = row_count;

	update public.coin_import_batches
		set committed_at = null, committed_by = null, report = null
		where id = p_batch_id;

	return jsonb_build_object(
		'ok', true,
		'batch_id', p_batch_id,
		'transactions_deleted', v_txns,
		'contracts_deleted', v_contracts,
		'claims_deleted', v_claims,
		'students_deleted', v_students
	);
end;
$$;

revoke all on function public.coin_admin_rollback_import(uuid) from public;
grant execute on function public.coin_admin_rollback_import(uuid) to authenticated;

-- ===========================================================================
-- 10. RECONCILIATION -- the VERIFY step's one round trip. For a committed
--     batch, per student: expected (from the stored raw summary: Awarded -
--     Fines - Spent - Paid Out) vs actual (live sum of coin_transactions --
--     scoped to THE BATCH'S OWN tagged rows, so real activity that has been
--     logging to the new economy since /coin-desk launched can never make an
--     exact import read as a mismatch) and the diff. The totals block also
--     reports the mapped students' FULL live balances (circulation and debt,
--     the eyeball-against-the-old-page numbers), which do include any live
--     activity, labelled apart from the batch-scoped columns for exactly
--     that reason.
-- ===========================================================================
create or replace function public.coin_admin_import_reconcile(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_batch public.coin_import_batches;
	v_map jsonb;
	v_rows jsonb;
	v_all_zero boolean;
	v_totals jsonb;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can reconcile a legacy import.';
	end if;

	select * into v_batch from public.coin_import_batches where id = p_batch_id;
	if v_batch.id is null then
		raise exception 'Unknown import batch.';
	end if;
	if v_batch.committed_at is null then
		return jsonb_build_object('ok', false, 'reason', 'not_committed');
	end if;
	v_map := coalesce(v_batch.report -> 'mappings', '{}'::jsonb);

	with summary as (
		select btrim(s ->> 'name') as name,
			(v_map ->> lower(btrim(s ->> 'name'))) as email,
			(round((s ->> 'awarded')::numeric) - round((s ->> 'fines')::numeric)
				- round((s ->> 'spent')::numeric) - round((s ->> 'paid_out')::numeric))::integer as expected
		from jsonb_array_elements(v_batch.raw -> 'summary') s
	),
	batch_sums as (
		select t.student_email, sum(t.amount)::integer as actual
		from public.coin_transactions t
		where t.meta ->> 'import_batch' = p_batch_id::text
		group by 1
	),
	live_sums as (
		select t.student_email, sum(t.amount)::integer as balance, count(*)::integer as txns
		from public.coin_transactions t
		where t.student_email in (select email from summary)
		group by 1
	),
	rows_out as (
		select su.name, su.email, su.expected,
			coalesce(b.actual, 0) as actual,
			coalesce(b.actual, 0) - su.expected as diff,
			coalesce(l.balance, 0) as live_balance
		from summary su
		left join batch_sums b on b.student_email = su.email
		left join live_sums l on l.student_email = su.email
	)
	select
		coalesce(jsonb_agg(jsonb_build_object(
			'name', r.name, 'email', r.email,
			'expected', r.expected, 'actual', r.actual, 'diff', r.diff,
			'live_balance', r.live_balance
		) order by r.name), '[]'::jsonb),
		coalesce(bool_and(r.diff = 0), true),
		jsonb_build_object(
			'students', count(*),
			'expected_sum', coalesce(sum(r.expected), 0),
			'actual_sum', coalesce(sum(r.actual), 0),
			'mismatches', count(*) filter (where r.diff <> 0),
			'batch_transactions', (
				select count(*) from public.coin_transactions t
				where t.meta ->> 'import_batch' = p_batch_id::text
			),
			'batch_contracts', (
				select count(*) from public.coin_contracts c where c.import_batch = p_batch_id
			),
			'batch_claims', (
				select count(*) from public.coin_contract_claims k
				where k.contract_id in (select id from public.coin_contracts c where c.import_batch = p_batch_id)
			),
			'live_circulation', coalesce(sum(r.live_balance) filter (where r.live_balance > 0), 0),
			'live_debt', coalesce(-sum(r.live_balance) filter (where r.live_balance < 0), 0),
			'live_transactions', (
				select coalesce(sum(l.txns), 0) from live_sums l
			)
		)
	into v_rows, v_all_zero, v_totals
	from rows_out r;

	return jsonb_build_object(
		'ok', true,
		'batch_id', p_batch_id,
		'all_zero', v_all_zero,
		'rows', v_rows,
		'totals', v_totals
	);
end;
$$;

revoke all on function public.coin_admin_import_reconcile(uuid) from public;
grant execute on function public.coin_admin_import_reconcile(uuid) to authenticated;

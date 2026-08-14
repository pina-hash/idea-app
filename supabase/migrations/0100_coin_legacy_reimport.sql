-- 0100_coin_legacy_reimport.sql
-- Re-import the legacy Sheets history with the MEDIUM dimension 0096 added.
--
-- Apply manually in the Supabase SQL editor, after 0099. Applying this file
-- changes nothing on its own: it defines one new RPC and corrects one existing
-- read. The data is only fixed when the REMEDIATION RUNBOOK at the foot of this
-- file is run by hand.
--
-- ===========================================================================
-- WHAT WENT WRONG
-- ===========================================================================
-- 0084 imported the old Google Sheets ledger when the economy had exactly ONE
-- balance, and it signed every row by type: Award / "Award - Held" credit,
-- Fine / "Fine - Owed" / Purchase / Payout debit. That was the only shape
-- available at the time, and it is wrong twice over now that 0096 has made
-- "the balance" two numbers:
--
--   1. IT DIGITIZED ROUGHLY 474i¢ OF PHYSICAL COINS. The sheet always tracked
--      two balances -- its `Coin Balance` column (everything the student has)
--      and its `Bank Balance` column (the part held digitally, for a student
--      who was not present to be handed coins). The single balance 0084 wrote
--      is, in 0096's terms, the DIGITAL one (see 0096's own backfill, which
--      set every pre-0096 row to 'digital'). So every coin that was physically
--      in a student's pocket was imported as bank credit.
--
--   2. IT DESTROYED 19i¢ THAT HAD ONLY CHANGED FORM. A `Payout` in the sheet
--      is a WITHDRAWAL: bank balance converted into coins in hand. All four
--      payout rows in the real snapshot even say so in their own Reason field
--      ("Bank Balance Applied to Purchase"). 0084 signed it as a plain debit,
--      so the coins left the ledger entirely. The sheet's own arithmetic says
--      otherwise: `Coin Balance = Awarded - Fines - Spent`, with Paid Out NOT
--      subtracted (verified against all 71 archived rows). Across the four
--      students who had ever withdrawn -- Chavarria 12, Delgadillo 4,
--      Veneziano 2, Cini 1 -- the imported totals came out 19i¢ short.
--
-- AND THE VERIFICATION COULD NOT HAVE CAUGHT EITHER, which is the part worth
-- remembering. 0084's `coin_admin_import_reconcile` computes its expectation
-- as `Awarded - Fines - Spent - Paid Out`, the same formula the import's own
-- sign rule implements, and the wizard's PREVIEW step used that formula too.
-- Both sides of the check were derived from one assumption, so the check
-- reported a universal 0 diff while the assumption was wrong. Section 2 below
-- corrects that function to compare against the sheet's own two balance
-- columns instead -- numbers the import does not produce.
--
-- ===========================================================================
-- THE CORRECTED MAPPING
-- ===========================================================================
-- Reproduces the sheet's OWN two balances exactly (`digital` = the sheet's
-- Bank Balance; `physical` = its Coin Balance minus its Bank Balance).
-- MEASURED against the committed 2026-08-11 archive: 66 of 71 students match
-- on both media with no overrides at all, and all 71 once the External
-- override below is applied. The five that need it are exactly the External
-- students who have `Award` rows -- see that section for why they are a
-- judgement call rather than something the data could have told us.
--
--   Award         -> physical  +amount
--   Award - Held  -> digital    +amount     (what "held" meant: held in bank)
--   Fine          -> physical  -amount
--   Fine - Owed   -> physical  -amount
--   Purchase      -> physical  -amount
--   Payout        -> TRANSFER:  digital -amount, physical +amount
--
-- THE PAYOUT TRANSFER IS WHAT MAKES A BANK-FUNDED PURCHASE COME OUT RIGHT.
-- The sheet recorded such a purchase as two rows -- the Purchase itself and a
-- Payout covering it -- so the physical side is debited by the Purchase and
-- credited straight back by the transfer, leaving digital down by the amount
-- and physical unchanged. Netting the pair by hand would produce the same two
-- balances, but it would lose the fact that a withdrawal happened; the two
-- rows are the record.
--
-- It is written with 0096's TRANSFER MECHANISM: two linked rows sharing one
-- `transfer_id`, one digital debit and one physical credit of the same amount,
-- carrying the same `transfer_id` / `transfer_amount` / `transfer_side` meta
-- keys `coin_payout_student` writes. So a legacy withdrawal is
-- indistinguishable IN SHAPE from a live payout, and balance derivation stays
-- a plain per-medium sum with no special case anywhere.
--
-- The one deliberate difference is the CATEGORY. Both halves land under
-- `legacy_payout`, not under the live `coin_payout` / `payout_physical_credit`
-- pair, because the legacy category is the marker that keeps live rules out of
-- legacy history (see below). A positive row under a purchase-kind category is
-- correct and already precedented: 0096 documents that a live payout's credit
-- likewise counts into the public ledger's "awarded" bucket.
--
-- EVERYTHING STILL IMPORTS UNDER THE FOUR RETIRED legacy_* CATEGORIES
-- (`loggable = false, active = false`), so 0084's central guarantee is
-- untouched: no live rule ever reads legacy history as its own event. An old
-- eating-pass purchase is a `legacy_purchase` row, which
-- `coin_eating_pass_active()` -- keyed on the literal 'eating_pass' id --
-- never sees; no cap counts a legacy row; and the per-medium debt lockout
-- 0096 added reads a BALANCE, which legacy rows legitimately contribute to,
-- not a legacy category.
--
-- ===========================================================================
-- THE EXTERNAL OVERRIDE -- A HUMAN DECISION, NOT A DERIVED RULE
-- ===========================================================================
-- Seven students sit in the sheet's 'External' section. They were never in the
-- room to be handed coins, so their plain `Award` rows are DIGITAL, not
-- physical. That is a judgement about who those seven people were; nothing in
-- the data says it, and it is exactly why it is a PARAMETER rather than a
-- branch in the function body. Change it at call time and the import changes;
-- no code moves.
--
-- The seven, as the sheet names them, all overriding `Award` alone:
--
--   Colin, Bushman Henry, Garcia Mathias, Araiza Basica Alexander,
--   Becker Grant, Lance Yip, Azad Arteaga
--
-- Two of those entries are inert and are listed anyway, on purpose:
--   * Araiza Basica, Alexander has no transactions at all.
--   * GRANT BECKER IS THE EDGE CASE THE MAP'S SHAPE EXISTS FOR. He is
--     External, but his one row is a 5i¢ `Fine - Owed`, and the sheet reads it
--     as PHYSICAL (Coin Balance -5, Bank Balance 0). A blanket per-student
--     "External is digital" rule would have flipped it and broken his balance;
--     because the map is keyed per STUDENT AND PER TYPE, his `Award` override
--     simply never matches a row and his fine stays physical. Listing him
--     keeps the map readable as "the whole External section" and records that
--     his fine was considered.
--
-- The response reports how many rows each override actually moved, so an
-- inert or mistyped entry is visible without failing the import. An override
-- naming a student the snapshot does not contain IS refused, since a typo
-- there would silently do nothing -- the exact failure mode this migration
-- exists to correct.
--
-- ===========================================================================
-- NAMING `medium` EXPLICITLY IS THE POINT
-- ===========================================================================
-- Imported rows are HISTORY, so they are written by RAW INSERT rather than
-- through `coin_log_transaction` -- 0084's doctrine, unchanged, and the reason
-- a historical `created_at` and a `semester_key` derived from the row's own
-- date are possible at all. 0084's insert names its own column list and OMITS
-- `medium`, which means 0096's column DEFAULT ('digital') applies -- correct
-- for that migration's rows by construction, and the trap for this one. Every
-- insert below names `medium` explicitly, for every row it writes.
--
-- (0096's own header explains the apparent contradiction in that default: the
-- COLUMN default is 'digital' precisely because the only path that reaches it
-- is a legacy raw insert, while live logging defaults to 'physical' and always
-- passes a medium.)

-- ===========================================================================
-- 1. THE RE-IMPORT.
--
-- 0084's `coin_admin_import_legacy` is left exactly as it is -- migrations are
-- an immutable applied record and that function is what wrote the committed
-- batch this one replaces. This is a sibling that does the same job with the
-- medium dimension resolved.
--
-- WHAT IT DOES NOT TAKE: a mapping. Nothing needs re-pulling or re-mapping --
-- the verbatim snapshot is already in `coin_import_batches.raw` and the 71
-- name-to-email mappings are already in `coin_import_mappings`, which rollback
-- deliberately never touches. So the mapping is READ from that table rather
-- than passed in, and the only parameter beside the batch is the override map.
-- (The batch's own `report.mappings` snapshot cannot be used: rollback clears
-- the report, and this RPC only ever runs on a rolled-back batch.)
--
-- The snapshot validation mirrors 0084's, deliberately duplicated rather than
-- shared: 0084's copy is inline in a function this migration does not modify,
-- and a re-import that trusted a batch to have been validated once would be a
-- worse trade than a second copy that fails the same way. Every refusal is a
-- structured `{ok:false, reason:...}` return, the convention this schema uses
-- for anything a caller has to display.
-- ===========================================================================
create or replace function public.coin_admin_reimport_legacy(
	p_batch_id uuid,
	p_overrides jsonb default '{}'::jsonb
)
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
	v_map jsonb := '{}'::jsonb;        -- lower(legacy name) -> email
	v_ov jsonb := '{}'::jsonb;         -- lower(legacy name) -> { canonical type -> medium }
	v_ov_hits jsonb := '{}'::jsonb;    -- 'name|type' -> rows actually moved
	v_ov_report jsonb := '[]'::jsonb;
	v_row jsonb;
	v_inner jsonb;
	v_name text;
	v_name_key text;
	v_email text;
	v_bad jsonb;
	v_type text;
	v_type_key text;
	v_status text;
	v_amount integer;
	v_created timestamptz;
	v_signed integer;
	v_medium text;
	v_meta jsonb;
	v_transfer uuid;
	v_key text;
	v_val text;
	v_title text;
	v_payout integer;
	v_added timestamptz;
	v_completed timestamptz;
	v_cancelled timestamptz;
	v_claimants integer;
	v_contract_id uuid;
	v_students integer := 0;
	v_source_rows integer := 0;
	v_txns integer := 0;
	v_transfers integer := 0;
	v_contracts integer := 0;
	v_claims integer := 0;
	v_results jsonb;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can import the legacy ledger.';
	end if;

	-- The SAME advisory key 0084's import and rollback take, so a re-import
	-- serializes against both: the "no second committed batch" rule below is
	-- check-then-act and two concurrent writers would otherwise both pass it.
	perform pg_advisory_xact_lock(hashtext('coin_admin_import_legacy'));

	select * into v_batch from public.coin_import_batches where id = p_batch_id for update;
	if v_batch.id is null then
		raise exception 'Unknown import batch.';
	end if;
	-- REFUSES UNLESS THE PRIOR IMPORT IS ALREADY ROLLED BACK. Rollback is what
	-- clears committed_at, so a still-committed batch means the old rows are
	-- still in the ledger and re-importing would double every one of them.
	if v_batch.committed_at is not null then
		return jsonb_build_object('ok', false, 'reason', 'batch_already_committed',
			'committed_at', v_batch.committed_at,
			'hint', 'Roll this batch back first: select public.coin_admin_rollback_import(''' || p_batch_id::text || '''::uuid);');
	end if;
	select id into v_other from public.coin_import_batches
		where committed_at is not null limit 1;
	if v_other is not null then
		return jsonb_build_object('ok', false, 'reason', 'another_batch_committed',
			'batch_id', v_other);
	end if;

	-- ---- The mapping, read from the live draft table. --------------------
	select coalesce(jsonb_object_agg(lower(btrim(m.legacy_name)), lower(btrim(m.email))), '{}'::jsonb)
		into v_map
	from public.coin_import_mappings m
	where m.email is not null and btrim(m.email) <> '';

	if v_map = '{}'::jsonb then
		return jsonb_build_object('ok', false, 'reason', 'no_mappings',
			'hint', 'coin_import_mappings is empty; the name-to-email mapping must exist before a re-import.');
	end if;

	-- Two legacy names on one email would silently merge two students'
	-- histories -- refused, never merged (0084's rule).
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

	-- ---- Normalize the override map. -------------------------------------
	-- Shape: { "<legacy name>": { "<legacy type>": "physical" | "digital" } }.
	-- A malformed shape, an unknown type or a bad medium is CALLER MISUSE and
	-- raises; a name the snapshot does not contain is a data problem and comes
	-- back as a structured refusal, the same class as `unmapped_name`.
	if p_overrides is not null and p_overrides <> 'null'::jsonb then
		if jsonb_typeof(p_overrides) <> 'object' then
			raise exception 'Medium overrides must be a JSON object of {"<legacy name>": {"<legacy type>": "physical"|"digital"}}.';
		end if;
		for v_name, v_inner in select key, value from jsonb_each(p_overrides) loop
			if jsonb_typeof(v_inner) <> 'object' then
				raise exception 'The override for "%" must be an object of {"<legacy type>": "physical"|"digital"}.', v_name;
			end if;
			v_name_key := lower(btrim(v_name));
			for v_key, v_val in select key, value #>> '{}' from jsonb_each(v_inner) loop
				v_type_key := case lower(btrim(v_key))
					when 'award' then 'Award'
					when 'award - held' then 'Award - Held'
					when 'fine' then 'Fine'
					when 'fine - owed' then 'Fine - Owed'
					when 'purchase' then 'Purchase'
					when 'payout' then 'Payout'
					else null
				end;
				if v_type_key is null then
					raise exception 'Unknown legacy transaction type "%" in the override for "%". Expected one of Award, Award - Held, Fine, Fine - Owed, Purchase.', v_key, v_name;
				end if;
				-- A Payout is a transfer: BOTH its media are fixed by the
				-- transfer itself, so there is no single medium to override.
				if v_type_key = 'Payout' then
					raise exception 'A Payout cannot take a medium override: it is a transfer, and both of its sides are fixed (digital out, physical in).';
				end if;
				if lower(btrim(coalesce(v_val, ''))) not in ('physical', 'digital') then
					raise exception 'The medium override for "%" / "%" must be "physical" or "digital" (got "%").', v_name, v_key, v_val;
				end if;
				v_ov := jsonb_set(
					v_ov,
					array[v_name_key],
					coalesce(v_ov -> v_name_key, '{}'::jsonb)
						|| jsonb_build_object(v_type_key, lower(btrim(v_val))),
					true
				);
			end loop;
		end loop;
	end if;

	-- An override naming somebody the snapshot has never heard of would apply
	-- to nothing, silently.
	select jsonb_agg(k order by k) into v_bad
	from (
		select distinct key as k
		from jsonb_each(v_ov)
		where key not in (
			select distinct lower(btrim(x.n))
			from (
				select s ->> 'name' as n from jsonb_array_elements(v_batch.raw -> 'summary') s
				union all
				select t ->> 'name' from jsonb_array_elements(v_batch.raw -> 'transactions') t
			) x
			where btrim(coalesce(x.n, '')) <> ''
		)
	) miss;
	if v_bad is not null then
		return jsonb_build_object('ok', false, 'reason', 'unknown_override_name', 'names', v_bad);
	end if;

	-- ---- Validate the snapshot rows (0084's checks). ---------------------
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

	-- ---- Everything validated; write the history. ------------------------
	-- The same source tag 0084 uses, so `coin_admin_rollback_import` reverses
	-- this import with no change at all: it keys on the batch tag in
	-- coin_transactions.meta, coin_contracts.import_batch and
	-- coin_students.source, every one of which is written below.
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
		v_name_key := lower(v_name);
		v_email := v_map ->> v_name_key;
		v_type := btrim(v_row ->> 'type');
		v_amount := round((v_row ->> 'amount')::numeric)::integer;
		v_created := replace(btrim(v_row ->> 'date'), 'T', ' ')::timestamp
			at time zone 'America/Los_Angeles';
		v_source_rows := v_source_rows + 1;

		v_meta := jsonb_build_object(
			'legacy_reason', v_row ->> 'reason',
			'legacy_type', v_type,
			'legacy_row', v_row -> 'row',
			'import_batch', p_batch_id::text
		);

		if v_type = 'Payout' then
			-- A WITHDRAWAL, not an outflow: 0096's transfer, two linked rows
			-- sharing one id. The total is unchanged -- the coins did not go
			-- anywhere, they changed form.
			v_transfer := gen_random_uuid();
			v_meta := v_meta || jsonb_build_object(
				'transfer_id', v_transfer::text,
				'transfer_amount', v_amount,
				'medium_source', 'transfer'
			);

			insert into public.coin_transactions
				(student_email, category_id, amount, quantity, note, meta, actor_email,
				 semester_key, created_at, medium, transfer_id)
			values (
				v_email, 'legacy_payout', -v_amount, null,
				nullif(left(btrim(coalesce(v_row ->> 'reason', '')), 500), ''),
				v_meta || jsonb_build_object('transfer_side', 'digital_debit'),
				v_actor, public.coin_semester_key(v_created), v_created,
				'digital', v_transfer
			);

			insert into public.coin_transactions
				(student_email, category_id, amount, quantity, note, meta, actor_email,
				 semester_key, created_at, medium, transfer_id)
			values (
				v_email, 'legacy_payout', v_amount, null,
				nullif(left(btrim(coalesce(v_row ->> 'reason', '')), 500), ''),
				v_meta || jsonb_build_object('transfer_side', 'physical_credit'),
				v_actor, public.coin_semester_key(v_created), v_created,
				'physical', v_transfer
			);

			v_txns := v_txns + 2;
			v_transfers := v_transfers + 1;
		else
			v_signed := case when v_type in ('Award', 'Award - Held') then v_amount else -v_amount end;
			-- "Award - Held" is the sheet's own word for a credit held in the
			-- bank rather than handed over; everything else moved coins.
			v_medium := case when v_type = 'Award - Held' then 'digital' else 'physical' end;
			if (v_ov #>> array[v_name_key, v_type]) is not null then
				v_medium := v_ov #>> array[v_name_key, v_type];
				v_key := v_name_key || '|' || v_type;
				v_ov_hits := v_ov_hits || jsonb_build_object(
					v_key, coalesce((v_ov_hits ->> v_key)::integer, 0) + 1);
				v_meta := v_meta || jsonb_build_object('medium_source', 'override');
			else
				v_meta := v_meta || jsonb_build_object('medium_source', 'default');
			end if;

			insert into public.coin_transactions
				(student_email, category_id, amount, quantity, note, meta, actor_email,
				 semester_key, created_at, medium, transfer_id)
			values (
				v_email,
				case
					when v_type in ('Award', 'Award - Held') then 'legacy_award'
					when v_type in ('Fine', 'Fine - Owed') then 'legacy_fine'
					else 'legacy_purchase'
				end,
				v_signed,
				null,
				nullif(left(btrim(coalesce(v_row ->> 'reason', '')), 500), ''),
				v_meta,
				v_actor,
				public.coin_semester_key(v_created),
				v_created,
				v_medium,
				null
			);
			v_txns := v_txns + 1;
		end if;
	end loop;

	-- What each override actually moved. A zero here is legitimate (Grant
	-- Becker's Award override matches no row, by design) but it is reported so
	-- nobody has to guess whether the map took effect.
	select coalesce(jsonb_agg(jsonb_build_object(
		'name', o.key, 'type', t.key, 'medium', t.value #>> '{}',
		'rows', coalesce((v_ov_hits ->> (o.key || '|' || t.key))::integer, 0)
	) order by o.key, t.key), '[]'::jsonb)
	into v_ov_report
	from jsonb_each(v_ov) o, jsonb_each(o.value) t;

	for v_row in select * from jsonb_array_elements(coalesce(v_batch.raw -> 'contracts', '[]'::jsonb)) loop
		v_status := btrim(v_row ->> 'status');
		v_title := left(btrim(v_row ->> 'name'), 200);
		v_payout := round((v_row ->> 'total_payout')::numeric)::integer;
		v_added := case
			when nullif(btrim(coalesce(v_row ->> 'date_added', '')), '') is null then now()
			else replace(btrim(v_row ->> 'date_added'), 'T', ' ')::timestamp
				at time zone 'America/Los_Angeles'
		end;
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

		-- coin_admin_complete_contract is NEVER called (0084's rule): the
		-- completion payouts already exist in the imported history above and
		-- must not pay a second time.
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

	-- ---- Per-student results, now three numbers each. --------------------
	with summary as (
		select btrim(s ->> 'name') as name,
			(v_map ->> lower(btrim(s ->> 'name'))) as email
		from jsonb_array_elements(v_batch.raw -> 'summary') s
	),
	sums as (
		select t.student_email,
			count(*)::integer as n,
			sum(t.amount)::integer as net,
			coalesce(sum(t.amount) filter (where t.medium = 'physical'), 0)::integer as physical,
			coalesce(sum(t.amount) filter (where t.medium = 'digital'), 0)::integer as digital
		from public.coin_transactions t
		where t.meta ->> 'import_batch' = p_batch_id::text
		group by 1
	)
	select coalesce(jsonb_agg(jsonb_build_object(
		'email', su.email, 'name', su.name, 'ok', true,
		'transactions', coalesce(m.n, 0),
		'amount', coalesce(m.net, 0),
		'physical', coalesce(m.physical, 0),
		'digital', coalesce(m.digital, 0)
	) order by su.name), '[]'::jsonb)
	into v_results
	from summary su
	left join sums m on m.student_email = su.email;

	update public.coin_import_batches set
		committed_at = now(),
		committed_by = v_actor,
		report = jsonb_build_object(
			'import', 'reimport-medium',
			'mappings', v_map,
			'overrides', v_ov,
			'overrides_applied', v_ov_report,
			'students', v_students,
			'source_rows', v_source_rows,
			'transactions', v_txns,
			'payout_transfers', v_transfers,
			'contracts', v_contracts,
			'claims', v_claims,
			'results', v_results
		)
	where id = p_batch_id;

	return jsonb_build_object(
		'ok', true,
		'batch_id', p_batch_id,
		'students', v_students,
		'source_rows', v_source_rows,
		'transactions', v_txns,
		'payout_transfers', v_transfers,
		'contracts', v_contracts,
		'claims', v_claims,
		'overrides_applied', v_ov_report,
		'total', v_students,
		'succeeded', v_students,
		'refused', 0,
		'results', v_results
	);
end;
$$;

revoke all on function public.coin_admin_reimport_legacy(uuid, jsonb) from public;
grant execute on function public.coin_admin_reimport_legacy(uuid, jsonb) to authenticated;

-- ===========================================================================
-- 2. THE CORRECTED RECONCILIATION.
--
-- 0084's `coin_admin_import_reconcile` is REDEFINED rather than joined by a
-- second function, for the same reason this migration reuses 0084's rollback:
-- one reconciliation, corrected, is safer than two where the wrong one can be
-- reached. Same name, same `(uuid)` signature (so no drop is needed) and the
-- existing response keys keep their meaning; the per-medium columns are added
-- beside them.
--
-- WHAT CHANGED IS THE EXPECTATION, AND IT IS NOW INDEPENDENT OF THE IMPORT.
-- The old formula `Awarded - Fines - Spent - Paid Out` restated the import's
-- own sign rule, so the check could only ever confirm that the import agreed
-- with itself. The expectation is now read from the sheet's own two BALANCE
-- columns, which the import does not produce:
--
--   expected_digital  = the snapshot's `Bank Balance`
--   expected_total    = the snapshot's `Coin Balance`
--   expected_physical = Coin Balance - Bank Balance
--
-- `summary_column_mismatches` in the totals block is the cross-check that
-- keeps those columns honest: it counts rows where `Coin Balance` differs from
-- `Awarded - Fines - Spent`. It is 0 across all 71 rows of the real 2026-08-11
-- snapshot; a large number means the pull's balance columns are missing or
-- unusable, and the per-student diffs below should not be trusted until that
-- is understood.
--
-- CONSEQUENCE WORTH EXPECTING: run against a batch still committed by 0084's
-- import, this reports a mismatch for every student who ever held bank credit.
-- That is the truth, and it is the signal to run the remediation below.
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
	-- The applied mapping is snapshotted into the report at commit; fall back
	-- to the live draft table for a batch whose report predates that.
	v_map := coalesce(
		v_batch.report -> 'mappings',
		(select coalesce(jsonb_object_agg(lower(btrim(m.legacy_name)), lower(btrim(m.email))), '{}'::jsonb)
		 from public.coin_import_mappings m
		 where m.email is not null and btrim(m.email) <> ''));

	with summary as (
		select btrim(s ->> 'name') as name,
			(v_map ->> lower(btrim(s ->> 'name'))) as email,
			-- coalesced to 0, deliberately: a snapshot missing these columns
			-- must read as a LOUD mismatch (and light up
			-- summary_column_mismatches below), never as a null diff that
			-- bool_and would quietly report as green. A check that cannot fail
			-- is the whole reason this migration exists.
			coalesce(round((s ->> 'coin_balance')::numeric), 0)::integer as expected,
			coalesce(round((s ->> 'bank_balance')::numeric), 0)::integer as expected_digital,
			(coalesce(round((s ->> 'coin_balance')::numeric), 0)
				- coalesce(round((s ->> 'bank_balance')::numeric), 0))::integer as expected_physical,
			-- The sheet cross-checked against itself: Coin Balance should be
			-- Awarded - Fines - Spent, with Paid Out NOT subtracted (a payout
			-- moves coins between the two balances, it does not spend them).
			(coalesce(round((s ->> 'coin_balance')::numeric), 0)
				- (round((s ->> 'awarded')::numeric) - round((s ->> 'fines')::numeric)
					- round((s ->> 'spent')::numeric)))::integer as column_diff
		from jsonb_array_elements(v_batch.raw -> 'summary') s
	),
	batch_sums as (
		select t.student_email,
			sum(t.amount)::integer as actual,
			coalesce(sum(t.amount) filter (where t.medium = 'physical'), 0)::integer as actual_physical,
			coalesce(sum(t.amount) filter (where t.medium = 'digital'), 0)::integer as actual_digital
		from public.coin_transactions t
		where t.meta ->> 'import_batch' = p_batch_id::text
		group by 1
	),
	live_sums as (
		select t.student_email, sum(t.amount)::integer as balance, count(*)::integer as txns,
			coalesce(sum(t.amount) filter (where t.medium = 'physical'), 0)::integer as live_physical,
			coalesce(sum(t.amount) filter (where t.medium = 'digital'), 0)::integer as live_digital
		from public.coin_transactions t
		where t.student_email in (select email from summary)
		group by 1
	),
	rows_out as (
		select su.name, su.email, su.expected, su.expected_physical, su.expected_digital,
			su.column_diff,
			coalesce(b.actual, 0) as actual,
			coalesce(b.actual_physical, 0) as actual_physical,
			coalesce(b.actual_digital, 0) as actual_digital,
			coalesce(b.actual, 0) - su.expected as diff,
			coalesce(b.actual_physical, 0) - su.expected_physical as diff_physical,
			coalesce(b.actual_digital, 0) - su.expected_digital as diff_digital,
			coalesce(l.balance, 0) as live_balance,
			coalesce(l.live_physical, 0) as live_physical,
			coalesce(l.live_digital, 0) as live_digital
		from summary su
		left join batch_sums b on b.student_email = su.email
		left join live_sums l on l.student_email = su.email
	)
	select
		coalesce(jsonb_agg(jsonb_build_object(
			'name', r.name, 'email', r.email,
			'expected', r.expected, 'actual', r.actual, 'diff', r.diff,
			'expected_physical', r.expected_physical, 'actual_physical', r.actual_physical,
			'diff_physical', r.diff_physical,
			'expected_digital', r.expected_digital, 'actual_digital', r.actual_digital,
			'diff_digital', r.diff_digital,
			'live_balance', r.live_balance,
			'live_physical', r.live_physical,
			'live_digital', r.live_digital
		) order by r.name), '[]'::jsonb),
		-- Green only when all THREE numbers agree for every student.
		coalesce(bool_and(r.diff = 0 and r.diff_physical = 0 and r.diff_digital = 0), true),
		jsonb_build_object(
			'students', count(*),
			'expected_sum', coalesce(sum(r.expected), 0),
			'expected_physical_sum', coalesce(sum(r.expected_physical), 0),
			'expected_digital_sum', coalesce(sum(r.expected_digital), 0),
			'actual_sum', coalesce(sum(r.actual), 0),
			'actual_physical_sum', coalesce(sum(r.actual_physical), 0),
			'actual_digital_sum', coalesce(sum(r.actual_digital), 0),
			'mismatches', count(*) filter (
				where r.diff <> 0 or r.diff_physical <> 0 or r.diff_digital <> 0),
			'summary_column_mismatches', count(*) filter (where r.column_diff <> 0),
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
			'live_physical', coalesce(sum(r.live_physical), 0),
			'live_digital', coalesce(sum(r.live_digital), 0),
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

-- ===========================================================================
-- 3. THE REMEDIATION RUNBOOK -- RUN BY HAND, IN THIS ORDER.
--
-- Nothing below runs when this migration is applied. The /coin-desk/migrate
-- wizard that used to drive an import is retired and archived
-- (docs/coin-economy/archive/legacy-system/), and it is deliberately NOT
-- coming back: its PULL step read the Google Sheets deployment, which is
-- deactivated. These are SQL-editor operations now, which is also why every
-- step below is written to be checked before it is committed to.
--
-- Find the batch first; there is exactly one:
--
--   select id, pulled_at, committed_at, committed_by
--   from public.coin_import_batches
--   order by pulled_at;
--
-- Substitute that id for <BATCH> throughout.
--
-- ---------------------------------------------------------------------------
-- STEP 1 -- Remove the three legacy eating-pass refunds.
--
-- They were logged AFTER the import, through coin_admin_adjust_balance, so
-- they carry no batch tag and step 2's rollback will not touch them. Left in
-- place they would survive the re-import and double, and they are physical
-- credits that should be digital anyway (step 4). They are ordinary
-- `balance_correction` rows identifiable only by their note text.
--
-- 1a. CONFIRM EXACTLY THREE ROWS -- read them before deleting anything:
--
--   select id, student_email, amount, medium, note, created_at
--   from public.coin_transactions
--   where category_id = 'balance_correction'
--     and note like 'Legacy eating pass refund%'
--   order by student_email;
--
--   Expect exactly 3: +40 Delgadillo, +50 Jette-Kouri, +50 Veneziano.
--   If the count is anything other than 3, STOP and work out why.
--
-- 1b. Delete BY ID, pasting the three ids that select returned:
--
--   delete from public.coin_transactions
--   where id in ('<id-1>'::uuid, '<id-2>'::uuid, '<id-3>'::uuid);
--
-- Matched on id, never on the note text, so the delete cannot widen if
-- another row is ever written with a similar note. There is deliberately NO
-- general-purpose delete RPC in this schema and this migration does not add
-- one: the ledger is append-only apart from a batch-scoped rollback, and a
-- one-off correction is a one-off statement, not a permanent capability.
--
-- ---------------------------------------------------------------------------
-- STEP 2 -- Roll the committed batch back. 0084's rollback, unchanged.
--
--   select public.coin_admin_rollback_import('<BATCH>'::uuid);
--
-- Expect ok:true with transactions_deleted 216, contracts_deleted 12,
-- students_deleted 71. It removes exactly the rows tagged with this batch.
--
-- ---------------------------------------------------------------------------
-- STEP 3 -- Re-import with the medium dimension and the External overrides.
--
--   select public.coin_admin_reimport_legacy(
--     '<BATCH>'::uuid,
--     '{
--        "Colin":                    {"Award": "digital"},
--        "Bushman, Henry":           {"Award": "digital"},
--        "Garcia, Mathias":          {"Award": "digital"},
--        "Araiza Basica, Alexander": {"Award": "digital"},
--        "Becker, Grant":            {"Award": "digital"},
--        "Lance Yip":                {"Award": "digital"},
--        "Azad Arteaga":             {"Award": "digital"}
--      }'::jsonb
--   );
--
-- Expect ok:true, students 71, source_rows 216, transactions 220 (216 rows
-- plus one extra for each of the 4 payout transfers), payout_transfers 4,
-- contracts 12. `overrides_applied` should report 7 rows moved in total, all
-- of them Awards: Colin 2, Lance Yip 2, Bushman/Garcia/Azad 1 each, and
-- Araiza Basica and Becker 0 (both inert, see the header).
--
-- These seven rows are the human decision in this whole exercise. Change the
-- map and re-run steps 2 and 3 to change it; nothing in the function body
-- knows any of these names.
--
-- ---------------------------------------------------------------------------
-- STEP 4 -- Re-log the three eating-pass refunds, DIGITALLY.
--
-- All three passes were bought with physical coins, so the purchase rows the
-- re-import just wrote are physical. The refund lands DIGITALLY by decision:
-- the refund-only transition (docs v3 item 9) settles a balance rather than
-- handing coins back across a desk. Substitute each student's real email --
-- the mapping is in public.coin_import_mappings.
--
--   select public.coin_admin_adjust_balance('<delgadillo email>',   40,
--     'Legacy eating pass refund - refund-only policy (v3 item 9)', 'digital');
--   select public.coin_admin_adjust_balance('<jette-kouri email>',  50,
--     'Legacy eating pass refund - refund-only policy (v3 item 9)', 'digital');
--   select public.coin_admin_adjust_balance('<veneziano email>',    50,
--     'Legacy eating pass refund - refund-only policy (v3 item 9)', 'digital');
--
-- These are LIVE adjustments, not import rows: untagged, so a future rollback
-- leaves them exactly where step 1 found the old ones.
--
-- ---------------------------------------------------------------------------
-- STEP 5 -- Verify.
--
--   select public.coin_admin_import_reconcile('<BATCH>'::uuid);
--
-- Requires all_zero:true, with `summary_column_mismatches` 0 and `mismatches`
-- 0. The batch-scoped columns compare the imported rows against the SHEET'S
-- OWN two balances, so the refunds from step 4 (untagged, and logged after the
-- fact) correctly do not affect them -- they show up only in the live_* totals
-- beside them. Expect expected_physical_sum 474 and expected_digital_sum 172
-- across the 71 students: the 474i¢ of physical coins that the first import
-- had digitized.
-- ===========================================================================

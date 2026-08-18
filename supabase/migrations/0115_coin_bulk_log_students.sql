-- 0115_coin_bulk_log_students.sql
--
-- BULK-LOG AGAINST A HAND-PICKED SET OF STUDENTS, and make the existing
-- section path a caller of it rather than a second implementation.
--
-- Apply manually in the Supabase SQL editor, after 0114.
--
-- ===========================================================================
-- WHY THIS EXISTS
-- ===========================================================================
-- 0073 gave the coin desk exactly one way to log the same thing against more
-- than one student: a whole SECTION. That is the right unit for Weekly Wage,
-- and the wrong one for most of what an operator actually does with several
-- students at once -- the four who stayed to clean up, the three who lost a
-- competition, the six on one contract. Those were N single-student entries,
-- which is precisely the ambiguous, interruptible, N-round-trip shape 0073's
-- own header spends four paragraphs explaining is not acceptable for a
-- section. The unit changed; the argument did not.
--
-- ===========================================================================
-- THE CONTRACT IS coin_bulk_log_section'S, DELIBERATELY UNCHANGED
-- ===========================================================================
-- One round trip. ONE server-side transaction. The same structured response
-- ({ok, category_id, medium, unmatched_overrides, total, succeeded, refused,
-- results[]}), the same per-student `p_medium_overrides` map keyed by
-- lowercased email, the same "an override that matched nobody is REPORTED,
-- never silently dropped" rule, and the same per-student exception handler so
-- one student's failure can never abort the rest of the batch.
--
-- It reimplements NO business rule. Per student it calls the EXISTING
-- coin_log_transaction, so the debt lockout (per medium since 0096), the
-- calendar-boundary caps, the Eating Pass strike/revoke logic and every
-- price are enforced in the one place they have always lived. SECURITY
-- DEFINER nesting does not change who is_admin()/current_user_email()
-- resolve to -- both read the session's JWT claims, not the executing role --
-- so the inner call is authorized as the same admin who called the outer
-- function, exactly as coin_bulk_log_section and coin_admin_adjust_balance
-- already rely on.
--
-- ===========================================================================
-- AND coin_bulk_log_section DELEGATES TO IT, rather than the two being kept
-- in step by hand
-- ===========================================================================
-- The two differ in exactly one thing: where the list of emails comes from.
-- Everything after that -- the admin gate, media normalization, the category
-- lookup and its four refusals, the up-front shape validation, the loop, the
-- results array, the unmatched-override sweep -- was identical, and would
-- have drifted the first time either side was tuned. So the section function
-- now resolves its roster and hands it over.
--
-- WHAT THAT PRESERVES, checked term by term rather than assumed:
--   * The SIGNATURE is byte-identical to 0096's, so this is a plain
--     `create or replace` -- no drop, no second overload, and no deploy
--     ordering problem (the 0058/0068/0096 trap does not apply when the
--     parameter list does not move).
--   * `section_id` is still in the response, added by the section wrapper
--     around what the students function returns.
--   * ERROR ORDER is unchanged. The section function still checks
--     is_admin() and the section's existence FIRST; the delegate then
--     normalizes the medium and checks the category, which is the same
--     relative order 0096 had (section -> medium -> category).
--   * ROW ORDER is unchanged: the delegate sorts its email list, and the
--     section roster was already read `order by student_email`.
--   * AN EMPTY ROSTER STILL RETURNS `{total: 0}` RATHER THAN RAISING, which
--     is what 0096 does today. That is also why the delegate does not raise
--     on an empty array: it would be a behaviour change to the section path
--     smuggled in as a new function's input validation. Logging against
--     nobody logs nothing and says so; the UI is what refuses to submit an
--     empty selection.
--
-- ===========================================================================
-- SCOPE, UNCHANGED FROM 0073/0096
-- ===========================================================================
-- 'flat', 'range' and 'variable' only, minus extra_credit (which needs a
-- per-student point count and its own semester cap) and, at the UI layer,
-- weekly_role_stipend (which is "every current role holder" money, not
-- "these students" money -- see 0074). per_unit and formula categories need
-- real per-student input, which is still a later pass and is not this one.
--
-- NOTHING HERE ADDS A WRITE PATH. No grant on any coin table changes, no
-- policy changes, and the ledger stays append-only: this function can only
-- INSERT, through coin_log_transaction, exactly as the section logger could.
-- ===========================================================================

-- ===========================================================================
-- 1. The picked-students bulk logger
-- ===========================================================================
create or replace function public.coin_bulk_log_students(
	p_emails text[],
	p_category_id text,
	p_amount integer default null,
	p_note text default null,
	p_medium text default 'physical',
	p_medium_overrides jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_cat public.coin_categories;
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_media jsonb;
	v_run_medium text;
	v_overrides jsonb;
	v_row_medium text;
	v_emails text[];
	v_email text;
	v_seen text[] := array[]::text[];
	v_unmatched jsonb := '[]'::jsonb;
	v_key text;
	v_call jsonb;
	v_entry jsonb;
	v_results jsonb := '[]'::jsonb;
	v_total integer := 0;
	v_succeeded integer := 0;
	v_refused integer := 0;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;

	v_media := public._coin_normalize_media(p_medium, p_medium_overrides);
	v_run_medium := v_media ->> 'run';
	v_overrides := v_media -> 'overrides';

	select * into v_cat from public.coin_categories where id = p_category_id;
	if v_cat.id is null then
		raise exception 'Unknown coin category "%".', p_category_id;
	end if;
	if not v_cat.active or not v_cat.loggable then
		raise exception '"%" cannot be logged directly.', v_cat.name;
	end if;
	if v_cat.id = 'extra_credit' then
		raise exception 'Extra Credit needs a per-student point count; it cannot be bulk-logged yet.';
	end if;
	if v_cat.pricing_model not in ('flat', 'range', 'variable') then
		raise exception '"%" needs per-student input (%) and cannot be bulk-logged yet -- only flat, range, and variable (one amount applied uniformly) categories can be logged against several students at once.', v_cat.name, v_cat.pricing_model;
	end if;

	-- Shape validation up front, mirroring coin_log_transaction's own checks:
	-- the amount and note are the SAME for every student, so a shape mistake
	-- would fail identically for every row. One clear error beats the same
	-- refusal N times over in the results list.
	if v_cat.pricing_model = 'range' then
		if p_amount is null or p_amount < v_cat.min_amount or p_amount > v_cat.max_amount then
			raise exception '"%" needs an amount between %i¢ and %i¢.', v_cat.name, v_cat.min_amount, v_cat.max_amount;
		end if;
	elsif v_cat.pricing_model = 'variable' then
		if v_cat.kind = 'adjustment' then
			if p_amount is null or p_amount = 0 then
				raise exception 'A balance adjustment needs a non-zero amount.';
			end if;
			if v_note is null then
				raise exception 'A balance adjustment needs a note explaining why.';
			end if;
		else
			if p_amount is null or p_amount <= 0 then
				raise exception '"%" needs a positive amount.', v_cat.name;
			end if;
			if v_note is null then
				raise exception '"%" needs a note.', v_cat.name;
			end if;
		end if;
	end if;

	-- NORMALIZE, DEDUPE, SORT. Lowercased and trimmed like every other email
	-- in this schema (a balance is keyed on the email, so "A@x" and "a@x" are
	-- the same student and must not be logged twice). Sorted so a picked
	-- selection and a section roster -- which is read `order by
	-- student_email` -- produce results in the same order, which is what
	-- makes the delegation below a true refactor rather than a rewrite.
	select coalesce(array_agg(e order by e), array[]::text[])
		into v_emails
		from (
			select distinct lower(btrim(x)) as e
			from unnest(coalesce(p_emails, array[]::text[])) as x
			where nullif(btrim(coalesce(x, '')), '') is not null
		) s;

	foreach v_email in array v_emails loop
		v_total := v_total + 1;
		v_row_medium := coalesce(v_overrides ->> v_email, v_run_medium);
		v_seen := v_seen || v_email;
		begin
			v_call := public.coin_log_transaction(
				v_email, v_cat.id, p_amount, null, p_note, v_row_medium
			);
		exception when others then
			-- A per-student failure must never abort the rest of the batch.
			v_call := jsonb_build_object('ok', false, 'reason', 'error', 'message', sqlerrm);
		end;
		if coalesce((v_call ->> 'ok')::boolean, false) then
			v_succeeded := v_succeeded + 1;
		else
			v_refused := v_refused + 1;
		end if;
		v_entry := jsonb_build_object('email', v_email, 'medium', v_row_medium) || v_call;
		v_results := v_results || jsonb_build_array(v_entry);
	end loop;

	for v_key in select jsonb_object_keys(v_overrides) loop
		if not (v_key = any (v_seen)) then
			v_unmatched := v_unmatched || jsonb_build_array(v_key);
		end if;
	end loop;

	return jsonb_build_object(
		'ok', true,
		'category_id', v_cat.id,
		'medium', v_run_medium,
		'unmatched_overrides', v_unmatched,
		'total', v_total,
		'succeeded', v_succeeded,
		'refused', v_refused,
		'results', v_results
	);
end;
$$;

revoke all on function public.coin_bulk_log_students(text[], text, integer, text, text, jsonb) from public;
grant execute on function public.coin_bulk_log_students(text[], text, integer, text, text, jsonb) to authenticated;

-- ===========================================================================
-- 2. The section logger, now a caller
-- ===========================================================================
-- Same signature as 0096, so this is a `create or replace` and there is
-- exactly one coin_bulk_log_section in pg_proc afterwards.
create or replace function public.coin_bulk_log_section(
	p_section_id text,
	p_category_id text,
	p_amount integer default null,
	p_note text default null,
	p_medium text default 'physical',
	p_medium_overrides jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_section text := lower(nullif(btrim(coalesce(p_section_id, '')), ''));
	v_emails text[];
	v_result jsonb;
begin
	-- The section's OWN preconditions stay here, and stay FIRST: they are the
	-- only thing this function knows that the delegate does not, and their
	-- order relative to the medium and category checks is what 0096 had.
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_section is null then
		raise exception 'Choose a section.';
	end if;
	if not exists (select 1 from public.coin_sections where id = v_section) then
		raise exception 'Unknown coin section "%".', v_section;
	end if;

	select coalesce(array_agg(student_email order by student_email), array[]::text[])
		into v_emails
		from public.coin_section_students
		where section_id = v_section;

	v_result := public.coin_bulk_log_students(
		v_emails, p_category_id, p_amount, p_note, p_medium, p_medium_overrides
	);

	-- `section_id` is the one key the delegate cannot supply, so the wrapper
	-- adds it back. Every other key is the delegate's, unchanged.
	return jsonb_build_object('section_id', v_section) || v_result;
end;
$$;

revoke all on function public.coin_bulk_log_section(text, text, integer, text, text, jsonb) from public;
grant execute on function public.coin_bulk_log_section(text, text, integer, text, text, jsonb) to authenticated;

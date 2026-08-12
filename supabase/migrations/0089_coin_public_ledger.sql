-- 0089_coin_public_ledger.sql
--
-- Phase 3 of the coin-system consolidation: the PUBLIC READ LAYER that lets
-- static/coins/index.html -- the IDEA Coin Ledger, the student hub -- read the
-- real Supabase economy instead of the frozen Google Sheets export.
--
-- Apply manually in the Supabase SQL editor, after 0088.
--
-- ===========================================================================
-- THE ABSOLUTE RULE THIS FILE IS BUILT AROUND: NO PUBLIC RESPONSE EVER
-- CONTAINS AN EMAIL ADDRESS, UNDER ANY PARAMETER.
-- ===========================================================================
--
-- The Ledger is a PUBLIC page (no login, linked from the homepage) and this
-- schema is EMAIL-KEYED throughout: coin_transactions, coin_wage_tiers,
-- coin_section_students, coin_contract_claims and coin_students are all keyed
-- on a student's real school address. A public table read or a
-- security_invoker view would therefore hand a school directory to anyone who
-- opened the network tab.
--
-- So the public surface is RPCs, not grants:
--
--   * Nothing below is granted SELECT on any email-keyed table. anon gets
--     EXECUTE on the six read functions here and nothing else. The functions
--     are SECURITY DEFINER, and each one PROJECTS AWAY the email column --
--     there is no parameter, filter, or field on any of them through which an
--     address can be requested or returned.
--
--   * Public identity is a DISPLAY NAME, resolved by the one standing rule
--     0084 established: coalesce(coin_students.display_name, the profile's
--     display/full name, the email's local part). _coin_public_roster() is the
--     single place that resolution lives, so every public surface agrees.
--
--   * Per-student DETAIL is addressed by an OPAQUE id, never an email, so a
--     drawer request in the network tab carries no address in either
--     direction. The id is md5(secret salt || email): stable (same student,
--     same id, across sessions and page loads), and non-reversible in practice
--     because the salt is a pair of random uuids generated when this migration
--     is APPLIED -- it exists only in the database, never in this repo, so a
--     dictionary attack over the school's address space has nothing to attack
--     with. coin_public_id_secret is readable by nobody: no grant, no policy,
--     only the SECURITY DEFINER functions here (which run as its owner).
--
-- DRAWER DISCLOSURE BOUNDARY, decided deliberately: the public drawer shows
-- name, section, balance, wage tier, transaction history, and whether an
-- Eating Pass is CURRENTLY HELD. It does NOT show the strike count. A strike
-- is a disciplinary state, and "two strikes from losing it" is between the
-- student and an admin -- coin_my_eating_pass_status() (0072, own-identity
-- only) and the coin-desk lookup stay the only places it appears. Do not
-- widen coin_public_student() to include it.
--
-- ===========================================================================
-- WRITE PATH: exactly one, coin_role_self_apply.
-- ===========================================================================
-- The Ledger's role modal used to post to the Apps Script. It posts to
-- coin_role_self_apply now, which is coin_role_apply (0074/0076) with the
-- caller resolved from current_user_email() INSTEAD OF an email parameter --
-- the coin_contract_self_claim shape, so "a student can only apply as
-- themselves" is a property of the signature and not a check that could be got
-- wrong. Every rule coin_role_apply enforces is enforced here identically:
-- active role, roster section required, one application per currently-held
-- role, answers snapshotted against coin_role_quiz_questions with MC
-- correctness computed once at submission. Nothing is loosened.
--
-- Contract claiming needs no new function at all: coin_contract_self_claim
-- (0077) already takes no email and already resolves the caller itself.

begin;

-- ===========================================================================
-- 1. The opaque-id secret.
-- ===========================================================================
create table if not exists public.coin_public_id_secret (
	id boolean primary key default true check (id),
	-- Two random uuids' worth of entropy, minted at apply time. Never in the
	-- repo, never returned by anything.
	salt text not null default (gen_random_uuid()::text || gen_random_uuid()::text),
	created_at timestamptz not null default now()
);

insert into public.coin_public_id_secret (id) values (true) on conflict (id) do nothing;

revoke all on public.coin_public_id_secret from anon, authenticated;
alter table public.coin_public_id_secret enable row level security;
-- Deliberately NO policy of any kind: not even an admin reads this through a
-- client. Only the definer functions below, running as the owner, touch it.

-- ===========================================================================
-- 2. The roster -- the ONE place identity resolution lives.
-- ===========================================================================
-- Internal (no grant): every public function selects from this and drops the
-- email column on the way out.
--
-- WHO IS ON IT: anyone with a coin transaction (so the real imported 71 are
-- all here), plus anyone on a coin section roster (so a student assigned to a
-- class shows at 0 i¢ rather than vanishing until their first fine).
create or replace function public._coin_public_roster()
returns table (
	student_email text,
	public_id text,
	display_name text,
	section text,
	section_color text
)
language sql
stable
security definer
set search_path = ''
as $$
	with salt as (select s.salt from public.coin_public_id_secret s where s.id limit 1),
	emails as (
		select t.student_email as email from public.coin_transactions t
		union
		select r.student_email from public.coin_section_students r
	)
	select
		e.email,
		md5((select salt.salt from salt) || e.email),
		coalesce(
			nullif(btrim(cs.display_name), ''),
			nullif(btrim(p.display_name), ''),
			nullif(btrim(p.full_name), ''),
			split_part(e.email, '@', 1)
		),
		coalesce(
			nullif(btrim(sec.label), ''),
			nullif(btrim(r.section_id), ''),
			nullif(btrim(cs.legacy_section), '')
		),
		sec.color
	from emails e
	left join public.coin_students cs on cs.student_email = e.email
	left join public.profiles p on lower(p.email) = e.email
	left join public.coin_section_students r on r.student_email = e.email
	left join public.coin_sections sec on sec.id = r.section_id;
$$;

revoke all on function public._coin_public_roster() from public;

-- ===========================================================================
-- 3. Leaderboard / summary.
-- ===========================================================================
-- The three buckets the Ledger's leaderboard, drawer and stat bar already
-- compute over, mapped honestly onto the signed ledger so they stay
-- internally consistent: awarded - fines - spent IS the balance, exactly.
--
--   awarded = every positive amount
--   fines   = every negative amount from a fine-kind category
--   spent   = every other negative amount (purchases, payouts, negative
--             adjustments)
--
-- The legacy Sheets summary's Bank Balance and Debt columns were physical-coin
-- bookkeeping with no counterpart here and are NOT invented: there is one net
-- balance, and debt is that balance being negative (reported as `debt` only so
-- the existing "TOTAL DEBT" stat has the same fact to read).
--
-- `weekly_wage` is the student's OWN tier-aware rate (0087: base x tier), so
-- the hub can never contradict what coin-desk actually pays.
create or replace function public.coin_public_leaderboard()
returns table (
	student_id text,
	name text,
	section text,
	awarded integer,
	fines integer,
	spent integer,
	paid_out integer,
	balance integer,
	debt integer,
	weekly_wage integer,
	wage_tier integer
)
language sql
stable
security definer
set search_path = ''
as $$
	with base as (
		select coalesce(c.amount, 1) as wage_base
		from public.coin_categories c where c.id = 'weekly_wage'
	),
	totals as (
		select
			t.student_email as email,
			coalesce(sum(t.amount) filter (where t.amount > 0), 0)::integer as awarded,
			coalesce(-sum(t.amount) filter (where t.amount < 0 and cat.kind = 'fine'), 0)::integer as fines,
			coalesce(-sum(t.amount) filter (where t.amount < 0 and cat.kind <> 'fine'), 0)::integer as spent,
			coalesce(-sum(t.amount) filter (
				where t.amount < 0 and t.category_id in ('coin_payout', 'legacy_payout')
			), 0)::integer as paid_out,
			coalesce(sum(t.amount), 0)::integer as balance
		from public.coin_transactions t
		join public.coin_categories cat on cat.id = t.category_id
		group by t.student_email
	)
	select
		ros.public_id,
		ros.display_name,
		ros.section,
		coalesce(tt.awarded, 0),
		coalesce(tt.fines, 0),
		coalesce(tt.spent, 0),
		coalesce(tt.paid_out, 0),
		coalesce(tt.balance, 0),
		greatest(0, -coalesce(tt.balance, 0)),
		(coalesce((select base.wage_base from base), 1) * greatest(coalesce(w.tier, 1), 1))::integer,
		greatest(coalesce(w.tier, 1), 1)
	from public._coin_public_roster() ros
	left join totals tt on tt.email = ros.student_email
	left join public.coin_wage_tiers w on w.student_email = ros.student_email
	order by coalesce(tt.balance, 0) desc, ros.display_name;
$$;

revoke all on function public.coin_public_leaderboard() from public;
grant execute on function public.coin_public_leaderboard() to anon, authenticated;

-- ===========================================================================
-- 4. Transaction log.
-- ===========================================================================
-- `type` is derived from the category's kind (never stored on the row), with
-- the two payout categories called out because the Ledger renders a Payout
-- badge distinctly; `reason` is the category's display name.
create or replace function public.coin_public_transactions(p_limit integer default 5000)
returns table (
	occurred_at timestamptz,
	name text,
	amount integer,
	type text,
	reason text
)
language sql
stable
security definer
set search_path = ''
as $$
	select
		t.created_at,
		ros.display_name,
		t.amount,
		case
			when t.category_id in ('coin_payout', 'legacy_payout') then 'Payout'
			when cat.kind = 'fine' then 'Fine'
			when cat.kind = 'award' then 'Award'
			when cat.kind = 'purchase' then 'Purchase'
			else 'Adjustment'
		end,
		cat.name
	from public.coin_transactions t
	join public.coin_categories cat on cat.id = t.category_id
	join public._coin_public_roster() ros on ros.student_email = t.student_email
	order by t.created_at desc, t.id desc
	limit greatest(1, least(coalesce(p_limit, 5000), 20000));
$$;

revoke all on function public.coin_public_transactions(integer) from public;
grant execute on function public.coin_public_transactions(integer) to anon, authenticated;

-- ===========================================================================
-- 5. Per-student drawer detail, addressed by the opaque id.
-- ===========================================================================
-- The one function that takes an identifier at all -- and it is the opaque id,
-- so neither the request nor the response carries an address. An unknown id
-- returns ok=false rather than raising, so a stale drawer link is a message
-- and not a 500.
--
-- See the header for what is deliberately absent: the Eating Pass STRIKE
-- COUNT. `eating_pass_held` is a yes/no.
create or replace function public.coin_public_student(p_student_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text;
	v_name text;
	v_section text;
	v_balance integer;
	v_tier integer;
	v_wage_base integer;
	v_history jsonb;
begin
	select ros.student_email, ros.display_name, ros.section
		into v_email, v_name, v_section
		from public._coin_public_roster() ros
		where ros.public_id = lower(btrim(coalesce(p_student_id, '')));

	if v_email is null then
		return jsonb_build_object('ok', false, 'reason', 'unknown_student');
	end if;

	select coalesce(sum(t.amount), 0)::integer into v_balance
		from public.coin_transactions t where t.student_email = v_email;

	select greatest(coalesce(w.tier, 1), 1) into v_tier
		from public.coin_wage_tiers w where w.student_email = v_email;
	v_tier := greatest(coalesce(v_tier, 1), 1);

	select coalesce(c.amount, 1) into v_wage_base
		from public.coin_categories c where c.id = 'weekly_wage';

	select coalesce(jsonb_agg(row_to_json(h)::jsonb order by h.occurred_at desc), '[]'::jsonb)
		into v_history
		from (
			select
				t.created_at as occurred_at,
				t.amount,
				case
					when t.category_id in ('coin_payout', 'legacy_payout') then 'Payout'
					when cat.kind = 'fine' then 'Fine'
					when cat.kind = 'award' then 'Award'
					when cat.kind = 'purchase' then 'Purchase'
					else 'Adjustment'
				end as type,
				cat.name as reason
			from public.coin_transactions t
			join public.coin_categories cat on cat.id = t.category_id
			where t.student_email = v_email
			order by t.created_at desc, t.id desc
			limit 500
		) h;

	return jsonb_build_object(
		'ok', true,
		'student_id', lower(btrim(p_student_id)),
		'name', v_name,
		'section', v_section,
		'balance', v_balance,
		'wage_tier', v_tier,
		'weekly_wage', coalesce(v_wage_base, 1) * v_tier,
		'eating_pass_held', public.coin_eating_pass_active(v_email),
		'history', v_history
	);
end;
$$;

revoke all on function public.coin_public_student(text) from public;
grant execute on function public.coin_public_student(text) to anon, authenticated;

-- ===========================================================================
-- 6. The reasons guide -- the REAL price list, replacing getReasons.
-- ===========================================================================
-- Sourced from coin_categories, which is the server-authoritative price list
-- 0070 established. Retired and mechanism-only rows are excluded; `detail`
-- renders the actual price so the guide states what a thing costs rather than
-- just naming it.
create or replace function public.coin_public_reasons()
returns table (type text, reason text, detail text, sort_order integer)
language sql
stable
security definer
set search_path = ''
as $$
	select
		initcap(c.kind),
		c.name,
		btrim(
			case c.pricing_model
				when 'flat' then c.amount || ' i¢'
				when 'range' then c.min_amount || '-' || c.max_amount || ' i¢'
				when 'per_unit' then c.amount || ' i¢ per ' || coalesce(c.unit_label, 'unit')
				when 'variable' then 'Amount set when logged'
				else 'Calculated'
			end
			|| coalesce(' — ' || nullif(btrim(c.notes), ''), '')
		),
		c.sort_order
	from public.coin_categories c
	where c.active and c.loggable and c.kind in ('fine', 'award', 'purchase')
	order by c.kind, c.sort_order, c.name;
$$;

revoke all on function public.coin_public_reasons() from public;
grant execute on function public.coin_public_reasons() to anon, authenticated;

-- ===========================================================================
-- 7. Contracts.
-- ===========================================================================
-- Claimant IDENTITIES are the reason this is an RPC and not the broadly
-- readable coin_contracts table plus the coin_contract_status view: a claim's
-- student_email is exactly what coin_contract_claims' own RLS keeps from a
-- plain student, so the join happens in here and only display names come out.
--
-- `status` is the four legacy words the Ledger's cards already switch on,
-- derived (never stored) from completed_at/cancelled_at plus a live claim
-- count: an open contract with at least one claimant reads In Progress,
-- exactly as the Sheets board did.
create or replace function public.coin_public_contracts()
returns table (
	id uuid,
	title text,
	description text,
	payout_amount integer,
	max_contractors integer,
	claimed_count integer,
	status text,
	section text,
	contractors text,
	created_at timestamptz,
	completed_at timestamptz,
	cancelled_at timestamptz,
	cancel_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
	select
		c.id,
		c.title,
		c.description,
		c.payout_amount,
		c.max_contractors,
		coalesce(k.n, 0)::integer,
		case
			when c.completed_at is not null then 'Completed'
			when c.cancelled_at is not null then 'Cancelled'
			when coalesce(k.n, 0) > 0 then 'In Progress'
			else 'Open'
		end,
		coalesce(nullif(btrim(sec.label), ''), c.section_id),
		coalesce(k.names, ''),
		c.created_at,
		c.completed_at,
		c.cancelled_at,
		c.cancel_reason
	from public.coin_contracts c
	left join public.coin_sections sec on sec.id = c.section_id
	left join lateral (
		select
			count(*) as n,
			string_agg(coalesce(ros.display_name, split_part(cl.student_email, '@', 1)), ' | '
				order by cl.claimed_at) as names
		from public.coin_contract_claims cl
		left join public._coin_public_roster() ros on ros.student_email = cl.student_email
		where cl.contract_id = c.id
	) k on true
	order by c.created_at desc;
$$;

revoke all on function public.coin_public_contracts() from public;
grant execute on function public.coin_public_contracts() to anon, authenticated;

-- The caller's OWN claims, so the board can mark "you're on this one". No
-- email in or out: the caller is resolved from their session, and the answer
-- is a list of contract ids. Returns nothing at all for anon.
create or replace function public.coin_my_contract_claims()
returns table (contract_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
	select cl.contract_id
	from public.coin_contract_claims cl
	where cl.student_email = public.current_user_email();
$$;

revoke all on function public.coin_my_contract_claims() from public;
grant execute on function public.coin_my_contract_claims() to authenticated;

-- ===========================================================================
-- 8. Roles -- the definitions board and the open-slot count per section.
-- ===========================================================================
-- Grouped by SECTION so the Ledger's existing role modal (which picks a
-- section then lists that section's open roles) needs no reshaping. Capacity
-- and holder counts come from _coin_role_capacity /
-- _coin_role_active_holder_count, the same internal helpers the admin review
-- path uses, so the public board and an admin's approval screen can never
-- disagree about whether a slot is free.
create or replace function public.coin_public_roles()
returns table (
	section_id text,
	section text,
	role_id text,
	role text,
	description text,
	capacity integer,
	held integer,
	open integer
)
language sql
stable
security definer
set search_path = ''
as $$
	select
		s.id,
		coalesce(nullif(btrim(s.label), ''), s.id),
		d.id,
		d.name,
		d.description,
		public._coin_role_capacity(d.id, s.id),
		public._coin_role_active_holder_count(d.id, s.id),
		greatest(0, public._coin_role_capacity(d.id, s.id) - public._coin_role_active_holder_count(d.id, s.id))
	from public.coin_sections s
	cross join public.coin_role_definitions d
	where s.active and d.active
	order by s.id, d.sort_order, d.name;
$$;

revoke all on function public.coin_public_roles() from public;
grant execute on function public.coin_public_roles() to anon, authenticated;

-- The role's real application questions. The ANSWER KEY is projected away:
-- correct_option_index never leaves this function, so a public caller can see
-- what is being asked and never which option is right. A role with zero
-- questions is a LEGITIMATE state (0076: the real quiz text is pasted into
-- coin_role_quiz_questions by hand and is never committed to the repo), and
-- returns an empty set rather than an error.
create or replace function public.coin_public_role_questions(p_role_id text)
returns table (question_id uuid, sequence integer, type text, question_text text, options jsonb)
language sql
stable
security definer
set search_path = ''
as $$
	select q.id, q.sequence, q.type, q.question_text, q.options
	from public.coin_role_quiz_questions q
	join public.coin_role_definitions d on d.id = q.role_id
	where q.role_id = p_role_id and q.active and d.active
	order by q.sequence;
$$;

revoke all on function public.coin_public_role_questions(text) from public;
grant execute on function public.coin_public_role_questions(text) to anon, authenticated;

-- ===========================================================================
-- 9. Section colors -- so the Ledger prefers the real per-section color.
-- ===========================================================================
-- Keyed by the DISPLAY label the summary's Section column carries, which is
-- what the page's own SECTION_COLORS map is keyed on, so the server's answer
-- drops straight into that lookup and the page's hardcoded map stays as the
-- fallback for a section with no color set.
create or replace function public.coin_public_sections()
returns table (section text, color text)
language sql
stable
security definer
set search_path = ''
as $$
	select distinct on (coalesce(nullif(btrim(s.label), ''), s.id))
		coalesce(nullif(btrim(s.label), ''), s.id),
		s.color
	from public.coin_sections s
	where s.active and s.color is not null;
$$;

revoke all on function public.coin_public_sections() from public;
grant execute on function public.coin_public_sections() to anon, authenticated;

-- ===========================================================================
-- 10. coin_role_self_apply -- the one write.
-- ===========================================================================
-- coin_role_apply (0076) with the email parameter REMOVED. The caller is
-- current_user_email(), so applying on somebody else's behalf is not a check
-- that can fail, it is a sentence that cannot be written. Everything else is
-- the same rule set, in the same order, returning the same structured refusal
-- shapes.
--
-- Additionally requires profiles.role = 'student': the admin path stays
-- coin_role_apply, and this one is for the student hub.
create or replace function public.coin_role_self_apply(
	p_role_id text,
	p_answers jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_role public.coin_role_definitions;
	v_section text;
	v_id uuid;
	v_question public.coin_role_quiz_questions;
	v_elem jsonb;
	v_written text;
	v_selected integer;
	v_is_correct boolean;
begin
	if v_email is null or v_email = '' then
		return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
	end if;
	if not exists (
		select 1 from public.profiles p
		where p.id = auth.uid() and p.role = 'student'
	) then
		return jsonb_build_object('ok', false, 'reason', 'not_a_student');
	end if;

	select * into v_role from public.coin_role_definitions where id = p_role_id;
	if v_role.id is null or not v_role.active then
		return jsonb_build_object('ok', false, 'reason', 'unknown_role');
	end if;

	select section_id into v_section from public.coin_section_students where student_email = v_email;
	if v_section is null then
		return jsonb_build_object('ok', false, 'reason', 'no_section');
	end if;

	if jsonb_typeof(coalesce(p_answers, '[]'::jsonb)) <> 'array' then
		raise exception 'Answers must be a list.';
	end if;
	if jsonb_array_length(p_answers) > 50 then
		raise exception 'Too many answers (max 50).';
	end if;

	-- Active by the same computed condition every other holder check uses, so
	-- a role that lapsed naturally can be applied for again.
	if exists (
		select 1 from public.coin_role_holders
		where student_email = v_email and role_id = v_role.id
			and revoked_at is null and (expires_at is null or expires_at > now())
	) then
		return jsonb_build_object('ok', false, 'reason', 'already_holds_role');
	end if;

	insert into public.coin_role_applications (student_email, role_id, section_id, submitted_by)
	values (v_email, v_role.id, v_section, v_email)
	returning id into v_id;

	for v_question in
		select * from public.coin_role_quiz_questions
		where role_id = v_role.id and active
		order by sequence
	loop
		select elem into v_elem
			from jsonb_array_elements(p_answers) elem
			where elem ->> 'question_id' = v_question.id::text
			limit 1;

		if v_question.type = 'written' then
			v_written := nullif(btrim(coalesce(v_elem ->> 'written_answer', '')), '');
			if v_written is null then
				raise exception 'Missing an answer for "%".', v_question.question_text;
			end if;
			insert into public.coin_role_application_answers
				(application_id, question_id, question_type, sequence, question_text, written_answer)
			values (v_id, v_question.id, 'written', v_question.sequence, v_question.question_text, left(v_written, 4000));
		else
			if v_elem is null or v_elem ->> 'selected_option_index' is null then
				raise exception 'Missing an answer for "%".', v_question.question_text;
			end if;
			v_selected := (v_elem ->> 'selected_option_index')::integer;
			if v_selected < 0 or v_selected >= jsonb_array_length(v_question.options) then
				raise exception 'Invalid option selected for "%".', v_question.question_text;
			end if;
			-- Computed ONCE, here, from the answer key as it stands at
			-- submission -- the 0076 snapshot rule, so editing a question
			-- later can never rewrite what a completed review looked like.
			v_is_correct := (v_selected = v_question.correct_option_index);
			insert into public.coin_role_application_answers
				(application_id, question_id, question_type, sequence, question_text, options,
				 selected_option_index, correct_option_index, is_correct)
			values (v_id, v_question.id, 'mc', v_question.sequence, v_question.question_text, v_question.options,
				v_selected, v_question.correct_option_index, v_is_correct);
		end if;
	end loop;

	return jsonb_build_object('ok', true, 'application_id', v_id);
end;
$$;

revoke all on function public.coin_role_self_apply(text, jsonb) from public;
grant execute on function public.coin_role_self_apply(text, jsonb) to authenticated;

-- ===========================================================================
-- 11. Who the signed-in visitor is, for the hub's own chrome.
-- ===========================================================================
-- Name and section only. No email, even though the caller already knows their
-- own -- the rule is that no public-surface response carries one, and keeping
-- it absolute means there is no field to audit.
create or replace function public.coin_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_role text;
	v_name text;
	v_section text;
begin
	if v_email is null or v_email = '' then
		return jsonb_build_object('signed_in', false);
	end if;

	select p.role, coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''))
		into v_role, v_name
		from public.profiles p where p.id = auth.uid();

	select coalesce(nullif(btrim(sec.label), ''), r.section_id)
		into v_section
		from public.coin_section_students r
		left join public.coin_sections sec on sec.id = r.section_id
		where r.student_email = v_email;

	if v_section is null then
		select nullif(btrim(cs.legacy_section), '') into v_section
			from public.coin_students cs where cs.student_email = v_email;
	end if;

	return jsonb_build_object(
		'signed_in', true,
		'is_student', coalesce(v_role, '') = 'student',
		'name', coalesce(v_name, split_part(v_email, '@', 1)),
		'section', v_section,
		'student_id', md5(
			(select s.salt from public.coin_public_id_secret s where s.id limit 1) || v_email
		)
	);
end;
$$;

revoke all on function public.coin_me() from public;
grant execute on function public.coin_me() to authenticated;

commit;

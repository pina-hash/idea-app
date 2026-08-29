-- 0157_coin_public_surface_hardening.sql
--
-- Three defects on the IDEA Coin Ledger's PUBLIC read layer, all found and
-- asserted (never fixed) by the test bundle recorded in
-- docs/history/anon-coin-public-projections-mrlg0d.md, which drove all five
-- anon-granted board reads as a signed-out visitor and pinned every projection
-- field by field.
--
-- Apply manually in the Supabase SQL editor, after 0156.
--
-- ===========================================================================
-- 1. AN UNNAMED STUDENT WAS PUBLISHED AS THE LOCAL PART OF THEIR ADDRESS.
-- ===========================================================================
-- 0089's header opens with "THE ABSOLUTE RULE THIS FILE IS BUILT AROUND: NO
-- PUBLIC RESPONSE EVER CONTAINS AN EMAIL ADDRESS, UNDER ANY PARAMETER", and
-- twenty lines later adopts, wholesale, the four-rung naming chain 0084 wrote:
--
--     coalesce( coin_students.display_name,      -- the imported sheet name
--               profiles.display_name,            -- the name they chose
--               profiles.full_name,               -- the Google account name
--               split_part(email, '@', 1) )       -- THE LOCAL PART
--
-- THOSE TWO STATEMENTS CONTRADICT EACH OTHER AND 0089 NEVER NOTICED. The
-- student domain is a single fixed string (0001's role_for_email:
-- @boscotech.net), so a local part on a public page plus that constant IS the
-- address. The chain was published to the internet without its last rung ever
-- being argued for an anonymous reader.
--
-- 0089'S REASONING DOES NOT SURVIVE, and the reason is WHERE the rule came
-- from rather than that it was wrong. 0084 wrote it for the LEGACY IMPORT and
-- the admin-side coin desk: a balance can exist for an email that has never
-- signed in, such an email has no profiles row, and something has to render.
-- At 0084 there was no public surface at all -- the public read layer is 0089,
-- five migrations later. So a last resort authored for a room where every
-- reader was already an admin was carried into a function whose entire purpose
-- is answering somebody with no account. The first THREE rungs survive
-- untouched and still resolve in the same order: each is a real name a person
-- chose or the school recorded, and publishing one is what the board is for.
-- Only the fourth is replaced.
--
-- THE REPLACEMENT MATCHES THE PATTERN THIS REPO ALREADY HAS.
-- gauntlet_room_board has used coalesce(full_name, 'Player') since 0010 -- a
-- generic word, never a derived identifier. The coin surface's word is
-- 'Student'.
--
-- ONE DEFINITION, NOT TWO. There were TWO fall-throughs reachable by an
-- anonymous caller and they had already drifted from 0010 independently, which
-- is exactly what a second copy does. _coin_public_name_fallback() is now the
-- single place the word is written, called from both.
--
--   * _coin_public_roster()'s fourth rung. Every public read that names a
--     student goes through it -- coin_public_leaderboard, coin_public_
--     transactions, coin_public_student and coin_public_contracts -- so all
--     four are fixed by this one line.
--   * coin_public_contracts()'s own inner coalesce, which fires when the
--     roster carries no row for a claimant at all (an unsectioned contract
--     claimed by a student with no ledger row and no roster row).
--
-- THE THIRD split_part IN 0089 IS DELIBERATELY LEFT ALONE. coin_me() (0089
-- line 712) resolves the CALLER'S OWN name from the CALLER'S OWN address, is
-- granted to `authenticated` only, and returns nothing about anybody else.
-- Handing somebody the local part of an address they typed to sign in
-- discloses nothing, and blanking it to 'Student' would make a signed-in
-- student's own header read as a stranger's.
--
-- WHAT THIS COSTS, stated rather than glossed: several unnamed students on one
-- leaderboard now all read 'Student' and cannot be told apart by name. The
-- page still works, because the drawer is addressed by the opaque student_id
-- (md5(salt || email)) and never by the name -- 0089 built it that way. The
-- fix for a student who wants to be named is a display name, which is the
-- point of the first three rungs.
--
-- ===========================================================================
-- 2. coin_public_sections WAS `distinct on (...)` WITH NO `order by`.
-- ===========================================================================
-- `distinct on` with no matching sort picks an ARBITRARY row per group, so two
-- active sections sharing a display label resolved to an unpredictable colour
-- -- and could resolve to a different one on two runs of the same query, with
-- nothing on the page to say so.
--
-- ===========================================================================
-- 3. coin_role_quiz_questions.options WAS A CONSTRAINT THAT DID NOT CONSTRAIN.
-- ===========================================================================
-- 0076 requires a jsonb ARRAY of length 2 to 8 and says nothing about what is
-- IN it, so an author hand-editing the table could put a marker, an
-- explanation or an answer key inside an element, and coin_public_role_
-- questions passes `options` out as raw jsonb to an anonymous caller. Nothing
-- is wrong today; the constraint simply does not describe an option.
--
-- BEFORE APPLYING, run this and expect 0. The DO block below runs the same
-- count itself and REFUSES rather than failing on the constraint, but an
-- operator should see the number first:
--
--   select count(*) from public.coin_role_quiz_questions
--   where options is not null and jsonb_typeof(options) = 'array'
--     and ( jsonb_path_exists(options, 'strict $[*] ? (@.type() != "string")')
--        or jsonb_path_exists(options, 'strict $[*] ? (@.type() == "string" && @ like_regex "^[[:space:]]*$")')
--        or jsonb_path_exists(options, 'strict $[*] ? (@.type() == "string" && @ like_regex "^.{201,}$" flag "s")') );
--
-- STRICT MODE IS LOAD-BEARING AND WAS MEASURED. Under jsonpath's default LAX
-- mode, `$[*]` auto-unwraps a nested array, so `["A", ["x"]]` reports two
-- STRINGS and passes -- verified on PostgreSQL 17.10, true under lax and false
-- under strict. Every accessor below says `strict`.
--
-- AND THE PREDICATE IS INLINE, WITH NO FUNCTION CALL IN IT, deliberately: a
-- CHECK constraint's function runs as the WRITING role and needs an EXECUTE
-- grant to every role that writes the column (the 0130 lesson), which is a
-- trap worth not setting. jsonb_path_exists is built in.
--
-- ===========================================================================
-- WHAT UNDOES THIS FILE
-- ===========================================================================
--   alter table public.coin_role_quiz_questions
--     drop constraint if exists coin_role_quiz_questions_options_are_option_strings;
--   drop function if exists public._coin_public_name_fallback();
-- then re-apply 0089 section 2 (_coin_public_roster), 0089 section 7
-- (coin_public_contracts) and 0089 section 9 (coin_public_sections) verbatim,
-- and re-run 0137 so the grants come back to the swept end state.
-- ===========================================================================

begin;

-- ===========================================================================
-- 1. The generic public name. ONE definition, and it is a function rather
--    than a literal for the same reason admin_owner_email() is: a constant
--    written down twice is a constant that drifts, and that is precisely how
--    the two sites below drifted from 0010's 'Player' in the first place.
-- ===========================================================================
create or replace function public._coin_public_name_fallback()
returns text
language sql
immutable
set search_path = ''
as $$
	select 'Student'::text;
$$;

comment on function public._coin_public_name_fallback() is
'The word a PUBLIC coin surface shows for a student who has no name recorded anywhere.

Generic on purpose: the rung it replaced was split_part(email, ''@'', 1), and the school''s student domain is one fixed string, so that value reconstructed the address on a page anybody can open. Mirrors gauntlet_room_board''s coalesce(full_name, ''Player'') from 0010.

Called from _coin_public_roster() and coin_public_contracts(), which is the whole point of it being a function: two copies of the word is what let those two sites drift apart. Not a public surface itself -- both callers are SECURITY DEFINER and run as the owner, so no client role needs EXECUTE.';

-- A NEW function arrives granted to anon under this project's default
-- privileges, and 0137 is a one-time sweep that does not cover anything
-- created after it -- so this file revokes for itself, naming the roles rather
-- than `from public` (which on a hosted Supabase project removes one ACL entry
-- and leaves the direct anon grant standing).
revoke all on function public._coin_public_name_fallback()
	from public, anon, authenticated, service_role;

-- ===========================================================================
-- 2. _coin_public_roster -- 0089 section 2, with the fourth rung replaced.
--    Everything else is byte-for-byte 0089: the same emails CTE, the same
--    opaque id, the same three name rungs in the same order, the same section
--    resolution, the same joins.
-- ===========================================================================
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
			-- WAS split_part(e.email, '@', 1). See this file's header.
			public._coin_public_name_fallback()
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

-- Private, exactly as 0089 and 0137 leave it: it is the one read that carries
-- student_email, and no client role has ever held EXECUTE on it. Restated
-- explicitly so this file's end state does not depend on whether a REPLACE
-- re-applies the project's default privileges.
revoke all on function public._coin_public_roster()
	from public, anon, authenticated, service_role;

-- ===========================================================================
-- 3. coin_public_contracts -- 0089 section 7, with its own inner fallback
--    pointed at the same one definition. The projection does not move: the
--    same thirteen columns in the same order.
-- ===========================================================================
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
			-- WAS coalesce(ros.display_name, split_part(cl.student_email, '@', 1)).
			-- This arm fires only when the roster carries no row for the
			-- claimant at all; the roster's own last rung is now the same word,
			-- so the two agree by construction instead of by inspection.
			string_agg(coalesce(ros.display_name, public._coin_public_name_fallback()), ' | '
				order by cl.claimed_at) as names
		from public.coin_contract_claims cl
		left join public._coin_public_roster() ros on ros.student_email = cl.student_email
		where cl.contract_id = c.id
	) k on true
	order by c.created_at desc;
$$;

revoke all on function public.coin_public_contracts()
	from public, anon, authenticated, service_role;
grant execute on function public.coin_public_contracts() to anon, authenticated;

-- ===========================================================================
-- 4. coin_public_sections -- 0089 section 9, made deterministic.
-- ===========================================================================
-- THE TIEBREAK IS NEWEST-ACTIVE-WINS, and it is the right answer rather than
-- merely a stable one. A duplicate label arises when a section is re-cut for a
-- new term under the same display name; the older row is normally deactivated
-- (and `s.active` already filters it), so two ACTIVE rows sharing a label means
-- the newer one is the class in current use and its colour is the one an
-- admin last chose for that name.
--
-- created_at AND NOT updated_at, which is the notebook/roster lesson (0132's
-- resolution order says the same thing): updated_at moves on any edit, so
-- touching an archived section's note would silently promote its colour.
--
-- AND s.id LAST, because created_at alone is not a total order: now() is
-- TRANSACTION time, so two sections created in one statement tie exactly. id
-- is the primary key, so the order below cannot tie at all -- which is what
-- makes the answer the SAME on two runs, not merely sorted.
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
	where s.active and s.color is not null
	order by
		coalesce(nullif(btrim(s.label), ''), s.id),
		s.created_at desc,
		s.id;
$$;

revoke all on function public.coin_public_sections()
	from public, anon, authenticated, service_role;
grant execute on function public.coin_public_sections() to anon, authenticated;

-- ===========================================================================
-- 5. What an option actually is.
-- ===========================================================================
-- A SEPARATE constraint rather than a rewrite of 0076's, which keeps that one
-- the single statement of "an mc question has 2-8 options and a key inside
-- range" and makes this one the single statement of "an option is a short
-- non-blank string". It deliberately declines to re-state array-ness: a
-- non-array is 0076's refusal, and the `is distinct from` disjunct below hands
-- that case straight back rather than raising a jsonpath error over it.
--
-- COUNTED AND REFUSED, never assumed. A narrowing starts saying no to
-- something that may already be in the table, and the table is hand-edited in
-- the SQL editor with content that is never committed to this repo -- so
-- nothing readable from the repo can tell an operator whether it applies. This
-- block counts the real rows and raises with the number instead of letting the
-- ALTER fail with a constraint name and no count.
do $$
declare
	v_bad integer;
	v_total integer;
begin
	select count(*) into v_total from public.coin_role_quiz_questions;

	select count(*) into v_bad
	from public.coin_role_quiz_questions q
	where q.options is not null
	  and jsonb_typeof(q.options) = 'array'
	  and (
			jsonb_path_exists(q.options, 'strict $[*] ? (@.type() != "string")')
			or jsonb_path_exists(q.options, 'strict $[*] ? (@.type() == "string" && @ like_regex "^[[:space:]]*$")')
			or jsonb_path_exists(q.options, 'strict $[*] ? (@.type() == "string" && @ like_regex "^.{201,}$" flag "s")')
		);

	if v_bad > 0 then
		raise exception
			'0157 refuses: % of % rows in coin_role_quiz_questions carry an option that is not a short non-blank string (a non-string element, a blank one, or one over 200 characters). Fix those rows first -- the header carries the query that names the count -- then re-apply this file.',
			v_bad, v_total;
	end if;

	raise notice '0157: % of % coin_role_quiz_questions rows carry options; 0 violate the new element rule.',
		(select count(*) from public.coin_role_quiz_questions where options is not null), v_total;

	-- Postgres has no `add constraint if not exists`, and a blind drop-then-add
	-- raises 2BP01 on a second run, so the catalog is the guard. Re-pasting
	-- this file is ordinary.
	if not exists (
		select 1 from pg_constraint c
		join pg_class t on t.oid = c.conrelid
		join pg_namespace n on n.oid = t.relnamespace
		where n.nspname = 'public'
		  and t.relname = 'coin_role_quiz_questions'
		  and c.conname = 'coin_role_quiz_questions_options_are_option_strings'
	) then
		alter table public.coin_role_quiz_questions
			add constraint coin_role_quiz_questions_options_are_option_strings
			check (
				options is null
				or jsonb_typeof(options) is distinct from 'array'
				or (
					not jsonb_path_exists(options, 'strict $[*] ? (@.type() != "string")')
					and not jsonb_path_exists(options, 'strict $[*] ? (@.type() == "string" && @ like_regex "^[[:space:]]*$")')
					and not jsonb_path_exists(options, 'strict $[*] ? (@.type() == "string" && @ like_regex "^.{201,}$" flag "s")')
				)
			);
	end if;
end
$$;

-- ===========================================================================
-- 6. Self-checks. Each asserts the END STATE, never that a statement above
--    ran: a grant is read back off the catalog and a projection is read back
--    out of the function.
-- ===========================================================================
do $$
declare
	v_leak text;
	v_missing text;
	v_name text;
begin
	-- Neither anon-reachable path may still DERIVE a name from the address.
	-- Read from prosrc, because a function this file failed to replace would
	-- otherwise pass every behavioural check on a fixture with no unnamed
	-- student in it.
	--
	-- SQL LINE COMMENTS ARE STRIPPED FIRST, and that is not a convenience: the
	-- bodies above deliberately record what the rung USED to be, and prosrc
	-- keeps a comment verbatim, so an unstripped match fires on this file's own
	-- documentation. Measured -- the first draft of this block raised on the
	-- very migration that fixed the defect. The guard is about what the
	-- function COMPUTES, never about what it says.
	select string_agg(p.proname, ', ' order by p.proname) into v_leak
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public'
	  and p.proname in ('_coin_public_roster', 'coin_public_contracts')
	  and regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') like '%split_part%';
	if v_leak is not null then
		raise exception '0157 did not take: these still derive a public name from the address: %', v_leak;
	end if;

	-- And both must actually call the one definition, so a future edit that
	-- inlines the word gets caught rather than merely looking right.
	select string_agg(p.proname, ', ' order by p.proname) into v_missing
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public'
	  and p.proname in ('_coin_public_roster', 'coin_public_contracts')
	  and p.prosrc not like '%_coin_public_name_fallback()%';
	if v_missing is not null then
		raise exception '0157 did not take: these do not call the one fallback definition: %', v_missing;
	end if;

	-- The colour map must carry an order by.
	if not exists (
		select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = 'coin_public_sections'
		  and p.prosrc like '%order by%'
	) then
		raise exception '0157 did not take: coin_public_sections has no order by, so distinct on is still arbitrary.';
	end if;

	-- THE GRANTS, both directions. A file that closed everything would satisfy
	-- half of this.
	select string_agg(p.proname, ', ' order by p.proname) into v_leak
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public'
	  and p.proname in ('_coin_public_roster', '_coin_public_name_fallback')
	  and has_function_privilege('anon', p.oid, 'EXECUTE');
	if v_leak is not null then
		raise exception '0157 leaked a private helper to anon: %', v_leak;
	end if;

	select string_agg(p.proname, ', ' order by p.proname) into v_missing
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public'
	  and p.proname in ('coin_public_contracts', 'coin_public_sections')
	  and not has_function_privilege('anon', p.oid, 'EXECUTE');
	if v_missing is not null then
		raise exception '0157 went too far: these public reads lost anon EXECUTE: %', v_missing;
	end if;

	select public._coin_public_name_fallback() into v_name;
	raise notice '0157: an unnamed student now publishes as "%"; both anon-reachable fallbacks call one definition.', v_name;
end
$$;

commit;

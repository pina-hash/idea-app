-- 0149_grant_surface_reconciliation.sql
-- Reconciles the TABLE/VIEW grant surface in `public` with what the migrations
-- actually intended, and re-asserts the four view revokes that were applied by
-- hand on 2026-08-28 so a later `create or replace view` cannot restore them.
--
-- ---------------------------------------------------------------------------
-- THE MECHANISM, WHICH IS 0060's AND HAS NOW BITTEN A SECOND TIME
-- ---------------------------------------------------------------------------
-- A hosted Supabase project bootstraps `alter default privileges in schema
-- public grant all on tables to anon, authenticated, service_role`. That is not
-- the SQL default (the SQL default is a single grant to PUBLIC), so EVERY table
-- and view a migration creates in `public` arrives holding the complete
-- privilege set -- SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES,
-- TRIGGER -- for `anon` and `authenticated`, before the migration grants
-- anything. `create or replace view` PRESERVES existing grants, so a view
-- recreated by a later migration keeps whatever it inherited the first time.
-- A migration that says only `grant select ... to authenticated` therefore does
-- not describe what the object holds; it describes what its author was thinking
-- about.
--
-- 0060 found three GAUNTLET views this way and revoked `anon` from them. It did
-- not generalise, and nothing has compared the migrations against the catalog
-- since. A catalog sweep of production on 2026-08-28 found the rest.
--
-- MEASURED ON PRODUCTION 2026-08-28, and reproduced exactly in the test fixture
-- by this bundle (tests/db/hosted-table-default-privileges.sql supplies the
-- table half of those default privileges, which tests/db/supabase-stub.sql has
-- never carried -- which is precisely why this class of defect has been
-- invisible to the suite). Nineteen objects in `public` are reachable by `anon`:
--
--   Full default set to `anon` (the defect):
--     coin_balances                      (view, security_invoker = true)
--     coin_contract_status               (view, owner-privileged, deliberately)
--     gauntlet_speedrun_attempt_history  (view, security_invoker = true)
--     notebook_entry_activity            (view, security_invoker = true)
--     notebook_folders                   (table)
--     fsp_item_opens                     (table)
--   Deliberate, and left exactly as they are by this file:
--     twelve tournament_* tables         (SELECT only)
--     fsp_frc_interest                   (INSERT only)
--
-- `authenticated` additionally holds INSERT, UPDATE, DELETE and TRUNCATE on all
-- six of the defect objects plus the three GAUNTLET views 0060 touched, for the
-- same reason: 0060 revoked `anon` and never narrowed `authenticated`.
--
-- ---------------------------------------------------------------------------
-- HOW MUCH OF THIS WAS ACTUALLY REACHABLE -- measured, not reasoned
-- ---------------------------------------------------------------------------
-- Driven as a real `anon` session against the full chain in the fixture:
--
--   select on coin_balances                     -> permission denied for table coin_transactions
--   select on gauntlet_speedrun_attempt_history -> permission denied for table gauntlet_speedrun_attempts
--   select on notebook_entry_activity           -> permission denied for table notebook_entries
--   select on coin_contract_status              -> ACCEPTED, returns rows
--   select on notebook_folders                  -> ACCEPTED, 0 rows (RLS)
--   select on fsp_item_opens                    -> ACCEPTED, 0 rows (RLS)
--
-- So the three `security_invoker = true` views were never exposing anything:
-- the view runs as the CALLER, and the caller holds no grant on the base table,
-- so the grant on the view is real but inert. Their revoke below is hygiene --
-- it removes a privilege that is one `security_invoker` slip away from meaning
-- something -- not an incident.
--
-- `coin_contract_status` is the one that was genuinely open, because it is
-- owner-privileged and so bypasses both the base tables' RLS and their grants.
-- What a signed-out caller could read is contract ids, a claimed_count and a
-- computed status. No identities: `student_email` is COUNTED, never projected.
--
-- `notebook_folders` and `fsp_item_opens` are TABLES, so `anon` is not the
-- owner and RLS does apply; both return zero rows to a signed-out caller
-- (`notebook_folders`'s two policies are `to authenticated`; `fsp_item_opens`'s
-- are `auth.uid() = user_id`, and `auth.uid()` is NULL for `anon`). RLS is the
-- only thing that was containing them, and RLS does NOT constrain TRUNCATE at
-- all -- so the TRUNCATE privilege in particular had nothing behind it. It is
-- not reachable through PostgREST, which exposes no TRUNCATE route, but it was
-- a real privilege held by the anonymous role.
--
-- ---------------------------------------------------------------------------
-- WHY coin_contract_status KEEPS ITS OWNER PRIVILEGES -- do not re-litigate
-- ---------------------------------------------------------------------------
-- It LOOKS like the 0060 defect and is not one. 0077's header states the design
-- and it still holds: a student browsing the contract board needs a live
-- claimed_count across EVERY student's claim rows, and coin_contract_claims'
-- own RLS is deliberately own-rows-or-admin so one student cannot see who else
-- is on a contract. The view is owner-privileged SO THAT it can aggregate past
-- that RLS. Verified against the catalog rather than the header -- the live
-- definition projects `c.id`, `count(k.student_email)::integer` and a CASE over
-- completed_at / cancelled_at / max_contractors, and nothing else.
--
-- 0060's rule is "an owner-privileged view must carry its own row predicate
-- replacing the RLS it bypasses". 0077 answered that rule rather than ignoring
-- it: there is no row-level data being bypassed for a predicate to protect,
-- because every column is a count or a computed status and no identity is
-- projected. DO NOT ADD security_invoker TO THIS VIEW. Under invoker rights the
-- count would collapse to the caller's own claim rows and the contract board
-- would report `claimed_count` 0 or 1 for every contract -- a functional break,
-- not a hardening. Only the accidental `anon` grant was wrong here, and that is
-- what this file removes.
--
-- ---------------------------------------------------------------------------
-- WHAT IS DELIBERATE AND IS LEFT ALONE
-- ---------------------------------------------------------------------------
-- TWELVE tournament_* TABLES, `anon` SELECT ONLY. Established, not assumed.
-- 0062:239-262 does not merely grant: it runs `revoke all on public.%I from
-- anon, authenticated` and THEN `grant select on public.%I to anon,
-- authenticated`, per table, over a literal array naming all nine of its
-- tables; 0063:240-258 repeats it for the two reward tables and 0064:108-120
-- writes it out longhand for tournament_entry_styles. A `revoke all` before the
-- grant is the opposite of inheritance -- it strips the defaults and hands back
-- exactly SELECT. Twelve explicit, zero inherited.
--   The intent is stated three times over: 0062's header ("Every tournament
--   table is PUBLIC-SELECT to anon AND authenticated: the live bracket is a
--   spectator surface reached with no session at all"), the route loads
--   themselves (src/routes/tournaments/[id]/tv/+page.server.ts: "FULLY PUBLIC
--   and deliberately session-blind ... needs no guard of its own -- and must
--   not gain one"), and docs/history/record-idea-tournaments.md. `/tournaments`
--   is deliberately absent from `authedPrefixes` in src/hooks.server.ts, and
--   five of its eight routes load with no session; a signed-out visitor really
--   does render a live bracket. A beetleweight tournament is being hosted at
--   the school in December.
--   AND THE IDENTITY QUESTION WAS DECIDED ON PURPOSE, which is the half worth
--   recording here: no tournament table has an email column, there is no view
--   over any of them, and a participant's public identity is
--   tournament_entries.display_name -- a value the entrant TYPES at
--   registration (tournament_register_entry takes p_display_name and inserts
--   btrim(p_display_name)), never a Google account name copied from profiles.
--   0062's header calls it an IDENTITY RULE: "nothing here ever surfaces a
--   Google account name or avatar ... user_id columns hold opaque uuids only,
--   and no view or RPC joins profiles for display." The uuids are public and
--   are opaque precisely because `profiles` is not anon-readable. So the public
--   bracket carries a chosen name, a chosen picture and chosen free text. That
--   is a decision somebody made, and it is consistent with the platform rule
--   that a chosen public identity replaces the account identity completely.
--
-- fsp_frc_interest, `anon` INSERT ONLY. Also explicit, not inherited: 0046:32
-- is `revoke all on public.fsp_frc_interest from anon, authenticated` followed
-- by `grant insert ... to anon` and `grant select ... to authenticated`. It
-- backs /fsp/frc-interest, a genuinely public QR-code intake form -- 0046's
-- header: "Prospective freshmen and parents scanning the code will not have a
-- Bosco Tech account, so this is the one FSP surface that accepts an anonymous
-- submission with no auth gate at all." `/fsp` is not in `authedPrefixes` and
-- the page has no server load; the insert goes out on the browser anon client
-- from src/lib/fsp/frc-interest.ts:79. REVOKING THE anon INSERT BREAKS THAT
-- FORM for exactly the population it exists for, and it fails quietly, in the
-- form's own error state. Reads are already double-locked: `anon` holds no
-- SELECT privilege, and the only SELECT policy is `to authenticated using
-- (public.is_teacher())`.
--
-- ---------------------------------------------------------------------------
-- EVERY REVOKE BELOW NAMES THE CALLER THAT WAS TRACED FOR IT
-- ---------------------------------------------------------------------------
-- A revoke that breaks a working surface mid-class is worse than a grant
-- contained by RLS, so each section states what reaches the object and how.
--
-- `service_role` IS NEVER TOUCHED by this file, deliberately: a CHECK
-- constraint's function runs as the WRITING role (0131), and service_role is
-- the one caller that writes some of these tables directly.
--
-- THE ROLES ARE NAMED IN EVERY REVOKE. `revoke ... from public` alone would be
-- a no-op against the project's default privileges, which write DIRECT grants
-- to `anon` and `authenticated` rather than a grant to PUBLIC -- the 0136/0137
-- lesson, one object class over.
--
-- Idempotent: every statement is a revoke or a grant, so re-pasting is a no-op.
-- Apply manually in the Supabase SQL editor, after 0148.
--
-- WHAT UNDOES THIS FILE: re-granting what it revoked, per object --
--   grant select on public.<view> to anon, authenticated;   (the seven views)
--   grant all on public.notebook_folders to anon, authenticated;
--   grant all on public.fsp_item_opens to anon, authenticated;
-- Nothing here drops an object, changes a definition, alters a policy or
-- touches a row, so there is nothing else to restore.

-- ===========================================================================
-- 1. The four views that carried the full default set for `anon`.
--
-- Re-asserts the revokes applied by hand on 2026-08-28, and narrows
-- `authenticated` back to the SELECT each of them was ever granted:
--   coin_balances                     -- 0070:370, again 0096:237
--   coin_contract_status              -- 0077:167
--   gauntlet_speedrun_attempt_history -- 0033:213
--   notebook_entry_activity           -- 0091:156, again 0116/0119/0129
-- Not one of those files ever granted a write on a view, so removing the
-- writes restores what they say rather than deciding anything new.
--
-- CALLERS TRACED. Every reader of all four is a signed-in client:
-- coin_balances and coin_contract_status are read by the coin desk and the
-- contract board, both behind an account; gauntlet_speedrun_attempt_history is
-- read under /gauntlet and notebook_entry_activity under /notebook, and both
-- prefixes are in `authedPrefixes` in src/hooks.server.ts. Three of the four
-- are `security_invoker = true`, so a signed-out caller was already refused at
-- the base table (measured above) -- there is no anonymous surface to break.
--
-- notebook_entry_activity is additionally the only auto-updatable view of the
-- seven (information_schema.views reports is_updatable = YES; every other one
-- aggregates or windows and is not), so its INSERT/UPDATE/DELETE grants were
-- the only ones that could ever have been a write PATH rather than an inert
-- privilege. They are closed by security_invoker today -- measured, an
-- authenticated DELETE answers "permission denied for table notebook_entries"
-- -- which is a single reloption standing between a client role and a write
-- into the notebook. That is the one this section is least willing to leave.
-- ===========================================================================

revoke all on public.coin_balances from public, anon, authenticated;
grant select on public.coin_balances to authenticated;

revoke all on public.coin_contract_status from public, anon, authenticated;
grant select on public.coin_contract_status to authenticated;

revoke all on public.gauntlet_speedrun_attempt_history from public, anon, authenticated;
grant select on public.gauntlet_speedrun_attempt_history to authenticated;

revoke all on public.notebook_entry_activity from public, anon, authenticated;
grant select on public.notebook_entry_activity to authenticated;

-- ===========================================================================
-- 2. The three GAUNTLET views 0060 already revoked from `anon`.
--
-- 0060 removed `anon` and re-granted SELECT to `authenticated` without
-- revoking first, so the inherited INSERT/UPDATE/DELETE/TRUNCATE survived on
-- all three. The `anon` revoke is re-asserted here as well, for the reason
-- 0060 gives for asserting it at all: a `create or replace view` preserves
-- grants, so a grant made by hand in the dashboard would otherwise survive
-- silently.
--
-- CALLERS TRACED: every consuming route sits under the /gauntlet prefix, which
-- is in `authedPrefixes`, so an anonymous request is redirected before it
-- reaches one -- 0060's own finding, unchanged. All three are owner-privileged
-- and all three carry the row predicate 0060 gave them (verified against
-- pg_get_viewdef, not the header: `where c.published` on gauntlet_leaderboard,
-- `gauntlet_is_room_member(...)` on the two room views).
-- ===========================================================================

revoke all on public.gauntlet_leaderboard from public, anon, authenticated;
grant select on public.gauntlet_leaderboard to authenticated;

revoke all on public.gauntlet_room_board from public, anon, authenticated;
grant select on public.gauntlet_room_board to authenticated;

revoke all on public.gauntlet_room_roster from public, anon, authenticated;
grant select on public.gauntlet_room_roster to authenticated;

-- ===========================================================================
-- 3. notebook_folders -- a TABLE, so `anon` is not the owner and RLS applies.
--
-- CALLERS TRACED, exhaustively, across src/. There are exactly two, and both
-- are signed-in:
--
--   src/routes/notebook/+page.server.ts:414
--     .from('notebook_folders').select('id, name, color, created_at')
--     on `locals.supabase` (the request's server client). Route /notebook.
--
--   src/lib/notebook-selects.ts:244, :267, :307
--     `notebook_folders ( name )` embedded in three rungs of
--     REVIEW_ENTRY_SELECTS, issued from the browser client at
--     src/routes/notebook/review/+page.svelte:197. Route /notebook/review.
--
-- Both sit under `/notebook`, which is in `authedPrefixes` in
-- src/hooks.server.ts, and both files carry a second `if (!claims) redirect
-- (303, '/')` of their own. No API route, no Edge Function, no short link, no
-- public reference viewer and no service-role client names this table; every
-- other reference in supabase/migrations is inside a SECURITY DEFINER body,
-- which runs as the owner and needs no caller grant at all. There is no
-- anonymous path to break.
--
-- 0088:116 granted exactly `select ... to authenticated` and 0088's header
-- states the write model -- "ZERO CLIENT WRITE GRANTS ... select only, and
-- every write is a SECURITY DEFINER RPC that resolves the caller from
-- auth.uid()". The four write RPCs are unaffected: a definer function runs as
-- the owner, so narrowing the CALLER's privileges cannot reach them.
-- ===========================================================================

revoke all on public.notebook_folders from public, anon, authenticated;
grant select on public.notebook_folders to authenticated;

-- ===========================================================================
-- 4. fsp_item_opens -- a TABLE, RLS on, and it has NO CALLERS AT ALL.
--
-- CALLERS TRACED: the only code that names it is src/lib/fsp/item-opens.ts
-- (`loadItemOpens` at :28, `markItemOpened` at :48), and NOTHING IMPORTS THAT
-- MODULE -- not in src/, not in tests/, not in tools/, and no commit in the
-- history ever did. The "FSP homepage" its header describes does not exist:
-- there is no `+page.svelte` at the root of src/routes/fsp/. So this revoke
-- cannot break a working surface, because there is no surface.
--
-- 0048:44 granted exactly `select, insert ... to authenticated`, which is what
-- is handed back. That file's own comment at :42-43 says why -- "Column-less
-- grant: SELECT + INSERT only (no UPDATE/DELETE), so PostgREST can never issue
-- a mutating statement the policies would otherwise have to guard" -- and it is
-- the one statement in this bundle that was simply not true of the database:
-- 0048 never wrote the `revoke all ... from anon, authenticated` that its
-- sibling 0046:32 has, so the defaults stood and the guard was RLS alone. This
-- section makes the comment true.
--
-- RLS stays exactly as 0048 wrote it. Both policies compare `auth.uid() =
-- user_id`, which is NULL for `anon` and therefore never TRUE, so a signed-out
-- caller already read zero rows; what changes is that it is now refused at the
-- privilege check instead, and that TRUNCATE -- which RLS does not constrain at
-- all -- is gone.
-- ===========================================================================

revoke all on public.fsp_item_opens from public, anon, authenticated;
grant select, insert on public.fsp_item_opens to authenticated;

-- ===========================================================================
-- 5. Self-check. Asserts the END STATE from the catalog rather than trusting
-- that the statements above ran -- a migration's own guard passing tells you
-- the guard ran; reading the ACL back tells you what is actually granted.
--
-- It also re-asserts, from the catalog, that the two deliberate anonymous
-- surfaces are still intact, so this file cannot silently have narrowed one.
-- ===========================================================================

do $$
declare
	v_obj text;
	v_priv text;
	v_bad text[] := array[]::text[];
	v_tournament_tables text[] := array[
		'tournaments', 'tournament_hosts', 'tournament_entries', 'tournament_invites',
		'tournament_qual_pools', 'tournament_qual_matches', 'tournament_bracket_matches',
		'tournament_match_games', 'tournament_match_events', 'tournament_reward_rules',
		'tournament_reward_ledger', 'tournament_entry_styles'
	];
	v_n integer;
begin
	-- (a) The nine reconciled objects hold nothing for `anon`, and nothing
	-- beyond their intended grant for `authenticated`.
	foreach v_obj in array array[
		'coin_balances', 'coin_contract_status', 'gauntlet_speedrun_attempt_history',
		'notebook_entry_activity', 'gauntlet_leaderboard', 'gauntlet_room_board',
		'gauntlet_room_roster', 'notebook_folders', 'fsp_item_opens'
	] loop
		foreach v_priv in array array['select','insert','update','delete','truncate','references','trigger'] loop
			if has_table_privilege('anon', format('public.%I', v_obj), v_priv) then
				v_bad := v_bad || format('anon still holds %s on %s', v_priv, v_obj);
			end if;
		end loop;
		foreach v_priv in array array['update','delete','truncate','references','trigger'] loop
			if has_table_privilege('authenticated', format('public.%I', v_obj), v_priv) then
				v_bad := v_bad || format('authenticated still holds %s on %s', v_priv, v_obj);
			end if;
		end loop;
		-- INSERT is legitimate on exactly one of the nine.
		if v_obj <> 'fsp_item_opens'
			and has_table_privilege('authenticated', format('public.%I', v_obj), 'insert') then
			v_bad := v_bad || format('authenticated still holds insert on %s', v_obj);
		end if;
		-- The read every one of them exists for must survive.
		if not has_table_privilege('authenticated', format('public.%I', v_obj), 'select') then
			v_bad := v_bad || format('authenticated LOST select on %s', v_obj);
		end if;
	end loop;

	if not has_table_privilege('authenticated', 'public.fsp_item_opens', 'insert') then
		v_bad := v_bad || 'authenticated LOST insert on fsp_item_opens';
	end if;

	-- (b) The deliberate anonymous surfaces are untouched.
	foreach v_obj in array v_tournament_tables loop
		if not has_table_privilege('anon', format('public.%I', v_obj), 'select') then
			v_bad := v_bad || format('anon LOST the deliberate select on %s', v_obj);
		end if;
	end loop;
	if not has_table_privilege('anon', 'public.fsp_frc_interest', 'insert') then
		v_bad := v_bad || 'anon LOST the deliberate insert on fsp_frc_interest';
	end if;

	if array_length(v_bad, 1) is not null then
		raise exception E'0149 did not reach its intended end state:\n  %',
			array_to_string(v_bad, E'\n  ');
	end if;

	-- (c) Report anon's whole remaining reach, so the operator can read it off
	-- the SQL editor rather than take this file's word for it.
	select count(*) into v_n
	from pg_class c
	join pg_namespace n on n.oid = c.relnamespace
	where n.nspname = 'public'
		and c.relkind in ('r', 'v', 'm', 'p')
		and (
			has_table_privilege('anon', c.oid, 'select')
			or has_table_privilege('anon', c.oid, 'insert')
			or has_table_privilege('anon', c.oid, 'update')
			or has_table_privilege('anon', c.oid, 'delete')
			or has_table_privilege('anon', c.oid, 'truncate')
			or has_table_privilege('anon', c.oid, 'references')
			or has_table_privilege('anon', c.oid, 'trigger')
		);
	raise notice '0149: anon now reaches % objects in public (expected 13: twelve tournament_* SELECT + fsp_frc_interest INSERT).', v_n;
end
$$;

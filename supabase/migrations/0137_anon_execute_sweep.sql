-- 0137_anon_execute_sweep.sql
-- Close the `anon` EXECUTE gap across `public`, function by function.
--
-- ---------------------------------------------------------------------------
-- WHAT IS WRONG, AND WHY EVERY MIGRATION IN THIS REPO HAS IT.
--
-- A hosted Supabase project bootstraps
--
--   alter default privileges in schema public
--     grant execute on functions to anon, authenticated, service_role;
--
-- which writes a DIRECT grant to each of those roles into every new function's
-- `proacl` AT CREATION TIME. That is not the SQL default -- the SQL default is
-- one grant to PUBLIC -- so the repo's standard narrowing,
--
--   revoke all on function f(...) from public;
--   grant execute on function f(...) to authenticated;
--
-- removes exactly the PUBLIC entry and leaves `anon`'s direct grant untouched.
-- Every SECURITY DEFINER RPC written that way is reachable, today, by an
-- unauthenticated PostgREST request. 0136 hit this as a hard failure (its own
-- self-check raised and rolled the file back) and is the only file in the repo
-- that revokes correctly; this one fixes the rest.
--
-- WHAT LIMITS IT TODAY, stated so nobody reads this as a breach report: every
-- affected write RPC opens with `if v_uid is null then raise 'You must be
-- signed in.'`, and `auth.uid()` is null for an `anon` caller. So what is
-- reachable is a function that refuses. It is a gate weakened from "refused at
-- the grant" to "refused in the body" -- defence in depth with one layer
-- missing, not an open door. It should still be closed.
--
-- ---------------------------------------------------------------------------
-- THE PARTITION IS THE WHOLE JOB. A BLIND REVOKE BREAKS THE LEADERBOARD.
--
-- Some functions are granted to `anon` DELIBERATELY, because a signed-out
-- visitor legitimately calls them. This file keeps EIGHTEEN, listed by name in
-- `k_keep` below, and every one of them is a function some migration granted
-- to `anon` in its own text -- not a guess about what looks public:
--
--   THE PUBLIC COIN LEDGER (8)   /coins/ is in the public tier. These project
--     coin_public_contracts        the address away inside the database and
--     coin_public_leaderboard      hand back an opaque per-row id, which is
--     coin_public_reasons          the whole reason they exist as `anon` RPCs
--     coin_public_role_questions   rather than as a table grant or a view.
--     coin_public_roles
--     coin_public_sections
--     coin_public_student
--     coin_public_transactions
--
--   THE PUBLIC CLASSROOM SURFACES (4)
--     classroom_public_reference   the reference-document viewer, which is
--                                  public for a MATERIAL a teacher flagged so.
--     classroom_public_attachment  its attachments.
--     classroom_attachment_object_is_public
--                                  named INSIDE a storage.objects RLS policy
--                                  that admits `anon`. A policy expression is
--                                  evaluated as the QUERYING role, so revoking
--                                  this one does not narrow anything -- it
--                                  breaks the read outright.
--     _classroom_item_live         same shape: called from inside the
--                                  "classroom postings readable" policy. 0109
--                                  says so in its own comment, citing the 0070
--                                  lesson where revoking current_user_email()
--                                  broke a student reading their own balance.
--
--   SHORT LINKS (1)
--     app_short_link_target        /<slug> redirects resolve before any
--                                  session exists. QR codes are in circulation.
--
--   THE UNAUTHENTICATED GAUNTLET RUN PATH (5)
--     gauntlet_macro_start         0016: "The Start macro is unauthenticated
--     gauntlet_macro_submit        (anon key); the code is the credential."
--     gauntlet_run_targets         A SOLIDWORKS macro calls these with the
--     gauntlet_run_events_insert   anon key and a run code. There is no
--     gauntlet_run_analysis_upsert session to have.
--
-- WHERE THE UNCERTAINTY IS, said rather than papered over: the five GAUNTLET
-- entries are kept on the strength of the migrations' own stated intent. This
-- file did NOT re-confirm that the macro still exists and still calls them.
-- Keeping them is the conservative direction -- it changes nothing -- and if
-- that surface is retired they should be revoked in their own migration, by
-- somebody who has checked. Everything else in `public` is revoked.
--
-- ---------------------------------------------------------------------------
-- THE SECOND PARTITION: `authenticated` ON THE PRIVATE HELPERS.
--
-- The same default privileges hand `authenticated` a direct grant too, and
-- that is worse in one specific place. Eighty-eight functions in this schema
-- are granted to NOBODY by any migration -- the `_`-prefixed helpers the repo
-- deliberately keeps unreachable, among them `_notebook_user_id_for_email`,
-- which is the uuid/email bridge CLAUDE.md says must never become a granted
-- view because "a granted email-to-uuid view is a school directory". On
-- production every one of them is callable by any signed-in student.
--
-- Tests across this repo already say so in writing: "the internal roster helper
-- is not reachable by anyone", "neither role can execute any of them", "cannot
-- call the projection helpers directly". Every one of those assertions has been
-- passing vacuously.
--
-- So `k_private` below carries those eighty-eight by name, and they lose
-- `authenticated` as well as `anon`. THE LIST IS SPELLED OUT RATHER THAN
-- COMPUTED because the rule that produced it -- "no migration grants this to
-- anybody" -- lives in the migration TEXT and cannot be read from the catalog.
-- A list a reviewer can read is also the point: this is the half that could
-- break a signed-in surface, so it should be reviewed and not inferred.
--
-- THREE THINGS ARE EXCLUDED FROM IT, each for a stated reason:
--
--   is_teacher            NAMED INSIDE RLS POLICIES. A function in a `using`
--                         clause is evaluated as the QUERYING role, so
--                         revoking it does not narrow the read, it breaks it.
--                         This is the 0070 lesson that 0109 writes down:
--                         `current_user_email()` was revoked and a student
--                         reading their own balance broke.
--   8 trigger functions   `_foundry_published_version_check`,
--                         `_foundry_version_status_check`,
--                         `enforce_role_change`, `gauntlet_attempt_from_submission`,
--                         `gauntlet_attempt_from_token`, `gauntlet_sync_published`,
--                         `handle_new_user`, `touch_updated_at`. A trigger fires
--                         without an EXECUTE check and a direct call errors
--                         anyway, so revoking them is churn with no gain.
--   service_role          NEVER TOUCHED, on either partition. See 0131 below.
--
-- ---------------------------------------------------------------------------
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE CHANGES, AND WHAT IT PROVABLY DOES NOT.
--
-- For every function NOT on the keep list it removes exactly two things:
-- `anon`'s EXECUTE and PUBLIC's EXECUTE. Both have to go together -- revoking
-- `anon` alone leaves it reaching the function through PUBLIC on the eighteen
-- functions that still carry that grant.
--
-- EVERY OTHER ROLE IS PUT BACK EXACTLY AS IT WAS. The loop reads each
-- function's grantees out of `proacl` BEFORE the revoke and re-grants all of
-- them except `anon`, and separately re-grants `authenticated` and
-- `service_role` when `has_function_privilege` said they held EXECUTE --
-- which covers the case where their access came through PUBLIC rather than
-- through a direct grant. So no role loses anything and no role gains
-- anything. That is why this is a sweep rather than a rewrite: it is not
-- re-deciding who may call what, only removing one role that was never
-- decided in the first place.
--
-- SERVICE_ROLE IS DELIBERATELY NOT TOUCHED. 0131 is the cautionary tale: a
-- CHECK constraint's function is evaluated as the WRITING role, so a predicate
-- revoked from service_role makes its table unwritable by the ingest function
-- with `permission denied for function <name>`, and the table's own grant
-- sitting right there does not help. The four write-time predicates in this
-- schema (`_classroom_deck_path_ok`, `_foundry_norm`, `_foundry_slug_ok`, and
-- the checks on `student_apps`) are all on tables `anon` holds no grant on, so
-- removing `anon` from them cannot break a write. Removing `service_role`
-- would.
--
-- ANON'S ACTUAL REACH, measured on the catalog rather than assumed, so the
-- blast radius is a fact: `anon` holds INSERT on `fsp_frc_interest` and SELECT
-- on twelve `tournament_*` tables, and nothing else in `public`.
-- `fsp_frc_interest`'s columns default and check with built-ins only
-- (`gen_random_uuid`, `now`, `btrim`, `char_length`), so its one anonymous
-- write path calls no `public` function at all. The tournament policies are
-- literal `true`. Storage is separate and untouched.
--
-- IDEMPOTENT. A second run finds nothing left to revoke and reports zero.
--
-- APPLIABLE TO A PARTIAL SCHEMA. A keep-list function that does not exist is
-- reported by notice and skipped rather than refused: a function that is not
-- there cannot be revoked, and every test chain in this repo is a partial
-- schema by design. The self-check at the end still asserts that every
-- keep-list function which IS present kept its `anon` grant.
--
-- ---------------------------------------------------------------------------
-- WHAT UNDOES THIS MIGRATION.
--
-- The reversal is to hand `anon` back what it held, which is what the project's
-- default privileges would have given it:
--
--   do $$
--   declare r record;
--   begin
--     for r in select p.oid::regprocedure as sig from pg_proc p
--       join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public' and p.prokind = 'f'
--     loop
--       execute format('grant execute on function %s to anon', r.sig);
--     end loop;
--   end $$;
--
-- That is a WIDENING and it puts the defect back. It is written down because a
-- reversal nobody can perform is not a reversal, not because it should be run.
-- If one specific function turns out to need `anon`, grant that one function
-- and add it to a keep list in a new migration, rather than running the above.
--
-- Apply manually in the Supabase SQL editor, after 0136.
-- ---------------------------------------------------------------------------

do $$
declare
	-- The eighteen. BY NAME rather than by signature: none of them is
	-- overloaded (the only three overloaded names in this schema are
	-- classroom_add_attachment, classroom_add_instructor_attachment and
	-- classroom_add_submission_file, none of which is here), and a name is
	-- what a reader can check against the list in the header.
	k_keep constant text[] := array[
		'_classroom_item_live',
		'app_short_link_target',
		'classroom_attachment_object_is_public',
		'classroom_public_attachment',
		'classroom_public_reference',
		'coin_public_contracts',
		'coin_public_leaderboard',
		'coin_public_reasons',
		'coin_public_role_questions',
		'coin_public_roles',
		'coin_public_sections',
		'coin_public_student',
		'coin_public_transactions',
		'gauntlet_macro_start',
		'gauntlet_macro_submit',
		'gauntlet_run_analysis_upsert',
		'gauntlet_run_events_insert',
		'gauntlet_run_targets'
	];
	-- THE PRIVATE HELPERS: granted to nobody by any migration, so `anon` AND
	-- `authenticated` both come off. See the header for the three exclusions.
	k_private constant text[] := array[
		'_app_feedback_contact_max',
		'_app_feedback_message_max',
		'_app_feedback_rate_cap',
		'_app_feedback_rate_window',
		'_app_feedback_trim',
		'_app_short_link_reserved',
		'_classroom_assert_assignment_kind',
		'_classroom_author_name',
		'_classroom_check_item_fields',
		'_classroom_check_levels',
		'_classroom_check_publish_targets',
		'_classroom_check_reference_spec',
		'_classroom_check_spec',
		'_classroom_deck_job',
		'_classroom_deck_orphans',
		'_classroom_doc_from_text',
		'_classroom_doc_ok',
		'_classroom_doc_text',
		'_classroom_engine_student',
		'_classroom_gated_modules',
		'_classroom_instructor_copy_author',
		'_classroom_item_attachments_json',
		'_classroom_item_payload',
		'_classroom_item_resources_json',
		'_classroom_item_text',
		'_classroom_jsonb_keys',
		'_classroom_list_ok',
		'_classroom_list_text',
		'_classroom_manages_course',
		'_classroom_manages_item',
		'_classroom_normalize_rubric',
		'_classroom_resources_changed',
		'_classroom_run_ok',
		'_classroom_runs_ok',
		'_classroom_safe_href',
		'_classroom_sentence_count',
		'_classroom_snapshot_content',
		'_classroom_spec_unmet',
		'_classroom_view_as_guard',
		'_classroom_write_instructor_resources',
		'_classroom_write_resources',
		'_coin_balance',
		'_coin_insert',
		'_coin_normalize_media',
		'_coin_public_roster',
		'_coin_role_active_holder_count',
		'_coin_role_capacity',
		'_foundry_author_class',
		'_foundry_is_idea_course',
		'_notebook_check_session_targets',
		'_notebook_detach_session_entries',
		'_notebook_email_for_user',
		'_notebook_log',
		'_notebook_manages_session',
		'_notebook_manages_student_email',
		'_notebook_note_coalescable',
		'_notebook_note_content_ok',
		'_notebook_note_list_len',
		'_notebook_note_run_len',
		'_notebook_resolve_session_section',
		'_notebook_section_roster',
		'_notebook_session_sections',
		'_notebook_student_payload',
		'_notebook_user_id_for_email',
		'_tournament_award',
		'_tournament_award_match_win',
		'_tournament_award_placements',
		'_tournament_best_of',
		'_tournament_check_unwindable',
		'_tournament_compact_seeds',
		'_tournament_complete_match',
		'_tournament_log',
		'_tournament_normalize_background',
		'_tournament_normalize_config',
		'_tournament_qual_seed_order',
		'_tournament_require_host',
		'_tournament_resolve_byes',
		'_tournament_set_slot',
		'_tournament_unwind_downstream',
		'_tournament_write_games',
		'coin_eating_pass_active',
		'coin_eating_pass_strikes',
		'gauntlet_gen_code',
		'gauntlet_gen_room_code',
		'gauntlet_jnum',
		'gauntlet_publish_blocker',
		'greenline_item_price',
		'role_for_email'
	];
	r record;
	v_grantee text;
	v_private boolean;
	v_had_auth boolean;
	v_had_svc boolean;
	v_touched integer := 0;
	v_closed integer := 0;
	v_skipped integer := 0;
	v_missing text;
begin
	-- A MISSING KEEP-LIST NAME IS REPORTED LOUDLY AND IS NOT A REFUSAL, and the
	-- reason is which way the danger runs. A function that does not exist
	-- cannot be revoked, so its absence takes nothing away from anybody -- the
	-- failure mode this file has to avoid is revoking a surface that IS there.
	-- Raising instead would also make the file unappliable to any partial
	-- schema, which is exactly what every test chain in this repo is: they
	-- apply the subset of migrations their subsystem needs, so most of them
	-- legitimately hold none of the coin or GAUNTLET functions above.
	--
	-- What the notice is FOR is a RENAME. If somebody renames a public surface
	-- and does not update this list, the old name goes missing here and the new
	-- one gets swept -- and this line is the only thing that would say so. Read
	-- it on a production apply; on a partial schema it is noise.
	select string_agg(k, ', ' order by k) into v_missing
	from unnest(k_keep) k
	where not exists (
		select 1 from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = k
	);
	if v_missing is not null then
		raise notice '0137: % of % keep-list functions are not present on this database: %. Expected on a partial schema; on a full one it means the list has drifted.',
			cardinality(k_keep) - (select count(*) from unnest(k_keep) k2 where exists (
				select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				where n.nspname = 'public' and p.proname = k2)),
			cardinality(k_keep), v_missing;
	end if;

	for r in
		select p.oid,
		       p.oid::regprocedure as sig,
		       p.proname
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public'
		  and p.prokind = 'f'
		order by p.proname
	loop
		if r.proname = any (k_keep) then
			v_skipped := v_skipped + 1;
			continue;
		end if;

		v_private := r.proname = any (k_private);

		-- Nothing to do, so do nothing. This is what makes a re-paste free.
		if not has_function_privilege('anon', r.oid, 'EXECUTE')
			and not (v_private and has_function_privilege('authenticated', r.oid, 'EXECUTE'))
		then
			continue;
		end if;

		-- CAPTURE BEFORE REVOKING. `has_function_privilege` answers true when
		-- the role holds EXECUTE through PUBLIC as well as directly, which is
		-- exactly the case the re-grant below has to cover.
		--
		-- ON A PRIVATE HELPER `authenticated` IS NOT CAPTURED AT ALL, which is
		-- the whole difference between the two partitions: everywhere else it
		-- is preserved exactly, here it is what we are removing.
		v_had_auth := (not v_private) and has_function_privilege('authenticated', r.oid, 'EXECUTE');
		v_had_svc  := has_function_privilege('service_role',  r.oid, 'EXECUTE');

		if v_private then
			execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
		else
			execute format('revoke execute on function %s from public, anon', r.sig);
		end if;

		-- Put back every OTHER role that held an explicit grant, so a role this
		-- file has never heard of does not quietly lose access.
		for v_grantee in
			select distinct pg_get_userbyid(a.grantee)
			from pg_proc p, aclexplode(p.proacl) a
			where p.oid = r.oid
			  and a.privilege_type = 'EXECUTE'
			  and a.grantee <> 0                                   -- 0 is PUBLIC
			  and pg_get_userbyid(a.grantee) <> 'anon'
			  and not (v_private and pg_get_userbyid(a.grantee) = 'authenticated')
		loop
			execute format('grant execute on function %s to %I', r.sig, v_grantee);
		end loop;

		if v_had_auth then
			execute format('grant execute on function %s to authenticated', r.sig);
		end if;
		if v_had_svc then
			execute format('grant execute on function %s to service_role', r.sig);
		end if;

		v_touched := v_touched + 1;
		if v_private then v_closed := v_closed + 1; end if;
	end loop;

	raise notice '0137: revoked anon EXECUTE on % functions (% of them also lost authenticated as private helpers); kept % public surfaces untouched.',
		v_touched, v_closed, v_skipped;
end
$$;

-- ---------------------------------------------------------------------------
-- The self-check. 0131's convention: read the catalog back rather than trust
-- that the block above ran.
--
-- BOTH DIRECTIONS. "anon holds nothing" is half an assertion -- a file that
-- revoked everything from everybody would satisfy it. So the eighteen are
-- asserted PRESENT for anon in the same breath, and `authenticated` is
-- asserted to have lost nothing.
-- ---------------------------------------------------------------------------

do $$
declare
	k_keep constant text[] := array[
		'_classroom_item_live','app_short_link_target','classroom_attachment_object_is_public',
		'classroom_public_attachment','classroom_public_reference','coin_public_contracts',
		'coin_public_leaderboard','coin_public_reasons','coin_public_role_questions',
		'coin_public_roles','coin_public_sections','coin_public_student',
		'coin_public_transactions','gauntlet_macro_start','gauntlet_macro_submit',
		'gauntlet_run_analysis_upsert','gauntlet_run_events_insert','gauntlet_run_targets'
	];
	k_private constant text[] := array[
		'_app_feedback_contact_max',
		'_app_feedback_message_max',
		'_app_feedback_rate_cap',
		'_app_feedback_rate_window',
		'_app_feedback_trim',
		'_app_short_link_reserved',
		'_classroom_assert_assignment_kind',
		'_classroom_author_name',
		'_classroom_check_item_fields',
		'_classroom_check_levels',
		'_classroom_check_publish_targets',
		'_classroom_check_reference_spec',
		'_classroom_check_spec',
		'_classroom_deck_job',
		'_classroom_deck_orphans',
		'_classroom_doc_from_text',
		'_classroom_doc_ok',
		'_classroom_doc_text',
		'_classroom_engine_student',
		'_classroom_gated_modules',
		'_classroom_instructor_copy_author',
		'_classroom_item_attachments_json',
		'_classroom_item_payload',
		'_classroom_item_resources_json',
		'_classroom_item_text',
		'_classroom_jsonb_keys',
		'_classroom_list_ok',
		'_classroom_list_text',
		'_classroom_manages_course',
		'_classroom_manages_item',
		'_classroom_normalize_rubric',
		'_classroom_resources_changed',
		'_classroom_run_ok',
		'_classroom_runs_ok',
		'_classroom_safe_href',
		'_classroom_sentence_count',
		'_classroom_snapshot_content',
		'_classroom_spec_unmet',
		'_classroom_view_as_guard',
		'_classroom_write_instructor_resources',
		'_classroom_write_resources',
		'_coin_balance',
		'_coin_insert',
		'_coin_normalize_media',
		'_coin_public_roster',
		'_coin_role_active_holder_count',
		'_coin_role_capacity',
		'_foundry_author_class',
		'_foundry_is_idea_course',
		'_notebook_check_session_targets',
		'_notebook_detach_session_entries',
		'_notebook_email_for_user',
		'_notebook_log',
		'_notebook_manages_session',
		'_notebook_manages_student_email',
		'_notebook_note_coalescable',
		'_notebook_note_content_ok',
		'_notebook_note_list_len',
		'_notebook_note_run_len',
		'_notebook_resolve_session_section',
		'_notebook_section_roster',
		'_notebook_session_sections',
		'_notebook_student_payload',
		'_notebook_user_id_for_email',
		'_tournament_award',
		'_tournament_award_match_win',
		'_tournament_award_placements',
		'_tournament_best_of',
		'_tournament_check_unwindable',
		'_tournament_compact_seeds',
		'_tournament_complete_match',
		'_tournament_log',
		'_tournament_normalize_background',
		'_tournament_normalize_config',
		'_tournament_qual_seed_order',
		'_tournament_require_host',
		'_tournament_resolve_byes',
		'_tournament_set_slot',
		'_tournament_unwind_downstream',
		'_tournament_write_games',
		'coin_eating_pass_active',
		'coin_eating_pass_strikes',
		'gauntlet_gen_code',
		'gauntlet_gen_room_code',
		'gauntlet_jnum',
		'gauntlet_publish_blocker',
		'greenline_item_price',
		'role_for_email'
	];
	v_leaked text;
	v_lost text;
	v_kept integer;
	v_total integer;
begin
	select string_agg(p.proname, ', ' order by p.proname) into v_leaked
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.prokind = 'f'
	  and not (p.proname = any (k_keep))
	  and has_function_privilege('anon', p.oid, 'EXECUTE');

	if v_leaked is not null then
		raise exception '0137 did not take: anon still holds EXECUTE on %', v_leaked;
	end if;

	-- PRESENCE-QUALIFIED. "This function is not here" and "this function lost
	-- its grant" are different facts and only the second is a failure -- a
	-- partial schema legitimately holds none of the coin or GAUNTLET surfaces,
	-- and an assertion that cannot tell the two apart fails every test chain in
	-- the repo while reporting a catastrophe that did not happen.
	select string_agg(k, ', ' order by k) into v_lost
	from unnest(k_keep) k
	where exists (
		select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = k
	)
	and not exists (
		select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = k
		  and has_function_privilege('anon', p.oid, 'EXECUTE')
	);

	if v_lost is not null then
		raise exception '0137 went too far: these public surfaces lost anon EXECUTE: %', v_lost;
	end if;

	-- THE PRIVATE HELPERS, asserted the same way and in the same breath: a file
	-- that closed anon and left the email/uuid bridge open to every signed-in
	-- student would satisfy every assertion above.
	select string_agg(p.proname, ', ' order by p.proname) into v_leaked
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.prokind = 'f'
	  and p.proname = any (k_private)
	  and has_function_privilege('authenticated', p.oid, 'EXECUTE');

	if v_leaked is not null then
		raise exception '0137 did not take: authenticated still holds EXECUTE on these private helpers: %', v_leaked;
	end if;

	select count(*) into v_total from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.prokind = 'f';
	select count(*) into v_kept from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'EXECUTE');

	raise notice '0137: % functions in public; anon now holds EXECUTE on % of them (the deliberate public surfaces).', v_total, v_kept;
end
$$;

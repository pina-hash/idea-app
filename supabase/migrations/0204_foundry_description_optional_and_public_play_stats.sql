-- ===========================================================================
-- 0204  Foundry: a description is OPTIONAL again, all three play metrics go
--       PUBLIC, and a student can read their own playtime for an app.
--
-- Mr. Pina answered three things on 2026-09-12. All three are here and this
-- file does nothing else.
--
-- ONE. DECISION 05 IS REVERSED. Publishing needs a name, a thumbnail and the
-- app; a description is optional. 0173 section 2 built the requirement on
-- 2026-09-02 while decision 05 sat open with a blank answer, and it is
-- enforced in TWO places in that file: the publication trigger, and
-- `foundry_submit_version` ahead of it -- so today a student cannot even
-- SUBMIT FOR REVIEW without a description. Both come out.
--
-- TWO. DECISION 07 IS ANSWERED PUBLIC, AND THERE ARE THREE METRICS, NOT TWO.
-- The decision's own title says "the two owner-only metrics"; the function
-- returns FOUR scalars of which `plays` is already public through
-- `foundry_play_counts`, so the owner-only set is `players`,
-- `seconds_played` and `last_played_at`. Widening two and leaving the third
-- is the failure mode here, so all three move together and the test names
-- all three.
--
-- THREE. THE n=1 CASE IS ACCEPTED, EXPLICITLY. On an app one person has
-- played, "1 player, last played 3:47pm" identifies when that student
-- played. Mr. Pina was asked precisely this and said it is fine. THERE IS NO
-- THRESHOLD, NO FLOOR AND NO ROUNDING SCHEME IN THIS FILE, and adding one
-- later is reopening a question that has been closed rather than tightening
-- a gate. `docs/decisions/entries/07-*` carries the acceptance.
--
-- WHAT DOES NOT MOVE, AND IT IS THE ONLY BOUNDARY LEFT ON THIS TABLE:
-- PUBLIC MEANS AGGREGATE. A student must never read another NAMED student's
-- playtime. Every function below either aggregates across every player or
-- filters to `auth.uid()` with no parameter through which another player
-- could be named, and `student_app_plays` still answers no client role
-- directly. The widening is about WHICH APPS a caller may ask about, never
-- about WHOSE rows come back.
--
-- ALSO CLOSED HERE, because it is one line in the same territory: 0139's own
-- comment says `service_role` "gets nothing either, and that is deliberate",
-- and its table revoke names only `anon, authenticated` while all five of
-- its FUNCTION revokes name `service_role` too. So the role the comment says
-- holds nothing has held SELECT since 0139 landed. It is the 0201 defect one
-- table over. Section 4.
--
-- IDEMPOTENT. Every statement is `create or replace`, a revoke, a grant or a
-- catalog-guarded check, so re-pasting this file is ordinary.
-- ===========================================================================

-- ===========================================================================
-- 1. DECISION 05, REVERSED. The description requirement comes out of both
--    places 0173 put it.
--
-- THE TRIGGER RETURNS TO 0130'S SHAPE EXACTLY, and that is a byte claim
-- rather than a reconstruction: 0173's body is 0130's body plus the
-- `v_moved` declaration, the `v_moved` assignment and the raise. Removing
-- those three leaves 0130's function, which is what section 5 asserts by
-- reading `prosrc` back. `v_moved` goes with the gate because it had exactly
-- one reader and a declared variable nothing reads is a later session's
-- puzzle.
--
-- THE PUBLICATION CHECKS THAT REMAIN ARE THE ONES THAT ARE ABOUT THE
-- VERSION, and none of them is decision 05's: the version exists, it belongs
-- to the app publishing it, and it is approved. Those are 0130's and stay.
-- ===========================================================================

create or replace function public._foundry_published_version_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_status text;
	v_app uuid;
begin
	if new.published_version_id is null then
		return new;
	end if;

	select sv.status, sv.app_id into v_status, v_app
	from public.student_app_versions sv
	where sv.id = new.published_version_id;

	if not found then
		raise exception 'That version does not exist.';
	end if;
	-- The composite foreign key also refuses this. It is checked here too
	-- because the trigger fires first, so this is the message a caller sees.
	if v_app <> new.id then
		raise exception 'A published version must belong to the app publishing it.';
	end if;
	if v_status <> 'approved' then
		raise exception 'Only an approved version can be published (that one is %).', v_status;
	end if;

	return new;
end;
$$;

-- SUBMIT, with the description gate removed and NOTHING ELSE TOUCHED. This
-- body is 0173's line for line apart from the four lines of decision 05, and
-- section 5 asserts the trust path is still in it -- because the cheap
-- mistake here is re-signing the function from 0130 and silently deleting
-- decision 06's trusted-publisher arm on the way past.
create or replace function public.foundry_submit_version(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_version public.student_app_versions%rowtype;
	v_app public.student_apps%rowtype;
	v_withdrawn uuid[] := '{}'::uuid[];
	v_trusted boolean;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select v.* into v_version from public.student_app_versions v where v.id = p_version_id for update;
	if not found then
		raise exception 'That version does not exist.';
	end if;

	select a.* into v_app from public.student_apps a where a.id = v_version.app_id for update;
	-- Authorization before state, and not-yours answers as not-found.
	if v_app.owner <> v_uid then
		raise exception 'That version does not exist.';
	end if;
	if v_app.hidden_at is not null then
		raise exception 'That app has been hidden by staff, so nothing can be submitted from it.';
	end if;
	if v_version.status <> 'draft' then
		raise exception 'Only a draft can be submitted (that one is %).', v_version.status;
	end if;

	with pulled as (
		update public.student_app_versions v
		set status = 'draft', reviewed_by = null, reviewed_at = null
		where v.app_id = v_version.app_id
			and v.status = 'submitted'
			and v.id <> p_version_id
		returning v.id
	)
	select coalesce(array_agg(pulled.id), '{}'::uuid[]) into v_withdrawn from pulled;

	-- 0173, decision 06. The owner's own trust, asked about the OWNER rather
	-- than about the caller -- they are the same person here, because the
	-- ownership check above already refused anybody else, and asking the
	-- third-party form is what keeps that true if a staff-submits path is
	-- ever added.
	v_trusted := public._foundry_is_trusted_email(
		public._notebook_email_for_user(v_app.owner)
	);

	if v_trusted then
		update public.student_app_versions v
		set status = 'approved',
			auto_published_at = now(),
			reviewed_by = null, reviewed_at = null,
			review_note = null, reject_reason = null
		where v.id = p_version_id;

		-- The trigger re-checks the ownership on the way past; this is the
		-- only publication in the feature with no administrator anywhere in
		-- the call chain, which is the whole of what being trusted buys.
		update public.student_apps a
		set published_version_id = p_version_id, updated_at = now()
		where a.id = v_version.app_id;

		return jsonb_build_object(
			'ok', true, 'version_id', p_version_id, 'status', 'approved',
			'auto_published', true, 'withdrew', to_jsonb(v_withdrawn)
		);
	end if;

	update public.student_app_versions v
	set status = 'submitted', reviewed_by = null, reviewed_at = null,
		review_note = null, reject_reason = null
	where v.id = p_version_id;

	update public.student_apps a set updated_at = now() where a.id = v_version.app_id;

	return jsonb_build_object(
		'ok', true, 'version_id', p_version_id, 'status', 'submitted',
		'auto_published', false, 'withdrew', to_jsonb(v_withdrawn)
	);
end;
$$;

-- The grants are restated because this is a `create or replace` on a hosted
-- Supabase project, where the bootstrap default privileges write a DIRECT
-- `anon` grant into every function at creation time and `revoke ... from
-- public` does not touch it. This is `0166`'s shape and it is the shape
-- `0201` departed from, which left ten functions anon-executable.
revoke all on function public.foundry_submit_version(uuid) from public, anon, authenticated, service_role;
grant execute on function public.foundry_submit_version(uuid) to authenticated;

-- ===========================================================================
-- 2. DECISION 07. The three owner-only metrics go public.
--
-- THE GATE BECOMES THE POPULATION AND STOPS BEING THE OWNER, which is the
-- smallest change that answers the decision and the only one that keeps
-- every other refusal intact. `_foundry_app_in_population` is the single
-- expression of "which apps does this caller see", it is what
-- `foundry_play_counts` and `student_apps`' own select policy already ask,
-- and its two widening flags are gated on `is_admin()` INSIDE itself -- so
-- passing `true, true` here widens nothing for a student and is exactly the
-- population the gallery already hands them.
--
-- WHAT THAT MEANS CASE BY CASE, since a predicate is not an answer:
--   * a PUBLISHED app          -> any signed-in caller. This is the widening.
--   * an UNPUBLISHED app       -> its OWNER only, which the predicate gives
--                                 directly, so an author testing a draft
--                                 keeps the numbers they have today.
--   * a HIDDEN app             -> an admin only.
--   * an app that DOES NOT EXIST, and one outside the population, answer
--     IDENTICALLY, as null. So an app id still cannot be probed, which is
--     the property 0139 wrote the null answer for in the first place.
--
-- STILL FOUR SCALARS AND NO ROWS. There is no player id in this answer, no
-- list, and no parameter through which one could be requested. The widening
-- is about WHICH APPS may be asked about; it adds no shape in which this
-- function could name a person.
--
-- THE n=1 CASE IS ACCEPTED RATHER THAN OVERLOOKED. See the file header.
-- ===========================================================================

create or replace function public.foundry_app_play_stats(p_app_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_app record;
	v_row record;
begin
	if v_uid is null then
		return null;
	end if;

	select a.owner, a.hidden_at, a.published_version_id into v_app
	from public.student_apps a where a.id = p_app_id;
	if not found then
		return null;
	end if;

	-- 0204, decision 07. THE GATE. Anybody who can see the app in the
	-- gallery, which for an unpublished app is still its author alone and
	-- for a hidden one is still an admin alone.
	if not public._foundry_app_in_population(
		v_app.owner, v_app.hidden_at, v_app.published_version_id, true, true
	) then
		return null;
	end if;

	select
		count(*)::bigint as plays,
		-- Nulls are ignored by `count(distinct)`, so a play whose account has
		-- been deleted counts as a play and not as a player. See the table's
		-- own note on why `player` is `set null` rather than cascading.
		count(distinct pl.player)::bigint as players,
		coalesce(
			sum(extract(epoch from (pl.last_seen_at - pl.started_at)))::bigint,
			0
		) as seconds_played,
		max(pl.started_at) as last_played_at
	into v_row
	from public.student_app_plays pl
	where pl.app_id = p_app_id;

	return jsonb_build_object(
		'ok', true,
		'app_id', p_app_id,
		'plays', coalesce(v_row.plays, 0),
		'players', coalesce(v_row.players, 0),
		'seconds_played', coalesce(v_row.seconds_played, 0),
		'last_played_at', v_row.last_played_at
	);
end;
$$;

revoke all on function public.foundry_app_play_stats(uuid) from public, anon, authenticated, service_role;
grant execute on function public.foundry_app_play_stats(uuid) to authenticated;

-- ===========================================================================
-- 3. A STUDENT'S OWN PLAYTIME FOR ONE APP.
--
-- Mr. Pina's words: "if I play twenty hours of cookie clicker I should see my
-- playstats." Until now there was no caller-scoped door on this table at all
-- -- the census is four functions and NONE of them is scoped to the caller's
-- own rows. The two that name `auth.uid()` use it as a signed-in gate and as
-- an owner gate; both aggregate across every player.
--
-- IT TAKES NO IDENTITY PARAMETER, so "can only read their own" is a property
-- of the SIGNATURE rather than a check that could be got wrong. There is no
-- argument through which another player could be named and no shape in which
-- another player's row could come back. That is the whole of the boundary and
-- it is why this is one narrow function rather than a parameter on the one
-- above.
--
-- IT GATES ON THE SAME POPULATION as section 2, so the two doors agree about
-- which apps exist for a caller, and so a nonexistent app and one outside the
-- population still answer identically. The cost is that a hidden app hides
-- the player's own history with it, which is correct: a hidden app is off
-- every other surface too, and staff un-hiding it restores this with it.
--
-- NO `players` COLUMN, deliberately. It is one caller, so it is 1 or 0, and a
-- column whose value is a restatement of the question is noise. What is here
-- is the four things a person asks about their own time with something: how
-- many sessions, how long in total, when they started and when they last
-- played.
-- ===========================================================================

create or replace function public.foundry_my_play_stats(p_app_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_app record;
	v_row record;
begin
	if v_uid is null then
		return null;
	end if;

	select a.owner, a.hidden_at, a.published_version_id into v_app
	from public.student_apps a where a.id = p_app_id;
	if not found then
		return null;
	end if;

	if not public._foundry_app_in_population(
		v_app.owner, v_app.hidden_at, v_app.published_version_id, true, true
	) then
		return null;
	end if;

	select
		count(*)::bigint as plays,
		coalesce(
			sum(extract(epoch from (pl.last_seen_at - pl.started_at)))::bigint,
			0
		) as seconds_played,
		min(pl.started_at) as first_played_at,
		max(pl.started_at) as last_played_at
	into v_row
	from public.student_app_plays pl
	-- THE BOUNDARY, and it is one line. `auth.uid()` and nothing a caller
	-- supplies.
	where pl.app_id = p_app_id and pl.player = v_uid;

	return jsonb_build_object(
		'ok', true,
		'app_id', p_app_id,
		'plays', coalesce(v_row.plays, 0),
		'seconds_played', coalesce(v_row.seconds_played, 0),
		'first_played_at', v_row.first_played_at,
		'last_played_at', v_row.last_played_at
	);
end;
$$;

revoke all on function public.foundry_my_play_stats(uuid) from public, anon, authenticated, service_role;
grant execute on function public.foundry_my_play_stats(uuid) to authenticated;

-- ===========================================================================
-- 4. THE `service_role` SELECT ON `student_app_plays`, which 0139 says is not
--    there and which has been there since 0139 landed.
--
-- 0139's own comment: "`service_role` gets nothing either, and that is
-- deliberate and different from `student_app_files`. Nothing writes plays
-- from a server." Its table revoke then names `anon, authenticated` and
-- stops, while all five of its FUNCTION revokes in the same file name
-- `service_role` too -- so the revoke was written one role short of the
-- comment beside it, and the file's own self-check tests only the two client
-- roles, which is why nothing reported it.
--
-- NOTHING IN `src/` BREAKS, measured rather than assumed: every one of the
-- call sites for the four telemetry RPCs goes through the caller's own
-- Supabase client, and `SUPABASE_SERVICE_ROLE_KEY` has five readers in this
-- repository and none of them touches this table.
--
-- THE REVOKE NAMES EVERY ROLE, which is the same reasoning as the function
-- grants above: a revoke that names a subset is a revoke that works under one
-- privilege configuration and silently does nothing under another.
-- ===========================================================================

revoke all on public.student_app_plays from public, anon, authenticated, service_role;

-- ===========================================================================
-- 5. WHAT THIS FILE JUST DID, ASKED OF THE CATALOG.
--
-- ASSERT THE ACL, NOT THE SELF-CHECK'S VERDICT: every claim below is read
-- back out of `pg_proc`, `pg_catalog` and `has_function_privilege` rather
-- than inferred from the statements having run without error.
-- ===========================================================================

do $check$
declare
	v_src text;
	v_n integer;
	v_name text;
	v_blank bigint;
begin
	-- 5a. The description sentence is gone from BOTH places 0173 put it, and
	-- from nowhere else, because nowhere else ever had it.
	for v_name in
		select unnest(array['_foundry_published_version_check', 'foundry_submit_version'])
	loop
		select p.prosrc into v_src
		from pg_catalog.pg_proc p
		join pg_catalog.pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = v_name;

		if v_src is null then
			raise exception '0204: public.% is not there at all.', v_name;
		end if;
		if v_src ilike '%before publishing%' or v_src ilike '%before submitting%' then
			raise exception '0204: public.% still carries the description requirement.', v_name;
		end if;
		if v_src like '%_foundry_norm(new.description)%'
			or v_src like '%_foundry_norm(v_app.description)%' then
			raise exception '0204: public.% still asks the description emptiness gate.', v_name;
		end if;
	end loop;

	-- 5b. THE TRIGGER IS BACK TO 0130'S SHAPE, and `v_moved` went with the
	-- gate rather than being left declared and unread.
	select p.prosrc into v_src
	from pg_catalog.pg_proc p
	join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = '_foundry_published_version_check';
	if v_src like '%v_moved%' then
		raise exception '0204: the publication trigger still declares v_moved, which nothing reads.';
	end if;
	-- ...and the three checks that are about the VERSION are still in it.
	if v_src not like '%That version does not exist.%'
		or v_src not like '%must belong to the app publishing it%'
		or v_src not like '%Only an approved version can be published%' then
		raise exception '0204: the publication trigger lost a check that is not decision 05.';
	end if;

	-- 5c. DECISION 06 SURVIVED THE RE-SIGNING. The cheap mistake on this file
	-- is re-signing submit from 0130 and deleting the trusted-publisher arm.
	select p.prosrc into v_src
	from pg_catalog.pg_proc p
	join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'foundry_submit_version';
	if v_src not like '%_foundry_is_trusted_email%' or v_src not like '%auto_published_at%' then
		raise exception '0204: foundry_submit_version lost decision 06 trusted publishing.';
	end if;

	-- 5d. The aggregate is gated on the POPULATION now and not on the owner.
	select p.prosrc into v_src
	from pg_catalog.pg_proc p
	join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'foundry_app_play_stats';
	if v_src like '%v_owner <> v_uid%' then
		raise exception '0204: foundry_app_play_stats still carries the owner gate.';
	end if;
	if v_src not like '%_foundry_app_in_population%' then
		raise exception '0204: foundry_app_play_stats is gated on nothing at all.';
	end if;

	-- 5e. The caller-scoped read exists exactly once, and filters on the
	-- session rather than on anything a caller sends.
	select count(*) into v_n
	from pg_catalog.pg_proc p
	join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'foundry_my_play_stats';
	if v_n <> 1 then
		raise exception '0204: expected exactly one foundry_my_play_stats, found %.', v_n;
	end if;
	select p.prosrc into v_src
	from pg_catalog.pg_proc p
	join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'foundry_my_play_stats';
	if v_src not like '%pl.player = v_uid%' then
		raise exception '0204: foundry_my_play_stats does not filter to the caller.';
	end if;

	-- 5f. THE GRANTS, read back off the catalog. Three functions, each
	-- withheld from anon and held by authenticated. This is the `0166` shape
	-- and the check `0201` did not have.
	for v_name in
		select unnest(array[
			'public.foundry_submit_version(uuid)',
			'public.foundry_app_play_stats(uuid)',
			'public.foundry_my_play_stats(uuid)'
		])
	loop
		if has_function_privilege('anon', v_name, 'execute') then
			raise exception '0204: % is executable by anon.', v_name;
		end if;
		if not has_function_privilege('authenticated', v_name, 'execute') then
			raise exception '0204: % is NOT executable by authenticated.', v_name;
		end if;
	end loop;

	-- 5g. The play table answers nobody, now including `service_role`.
	for v_name in select unnest(array['anon', 'authenticated', 'service_role'])
	loop
		if has_table_privilege(v_name, 'public.student_app_plays', 'select') then
			raise exception '0204: % still holds SELECT on student_app_plays.', v_name;
		end if;
	end loop;
	if not exists (
		select 1 from pg_catalog.pg_class c
		join pg_catalog.pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relname = 'student_app_plays' and c.relrowsecurity
	) then
		raise exception '0204: RLS is off on student_app_plays.';
	end if;

	-- 5h. The count decision 05's reversal unblocks, reported and not acted
	-- on, the way 0173 reported the count it was about to block.
	select count(*) into v_blank
	from public.student_apps a
	where a.published_version_id is not null
		and public._foundry_norm(a.description) = '';
	raise notice '0204: % PUBLISHED app(s) have no description. They can publish a new version again.', v_blank;

	raise notice '0204: description optional (2 gates removed), 3 play metrics public, foundry_my_play_stats added, service_role SELECT closed on student_app_plays.';
end;
$check$;

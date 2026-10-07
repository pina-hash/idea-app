-- ===== PART foundry-major BEGIN =====
-- ===========================================================================
-- FOUNDRY: MAJOR RELEASES (report 927b1c69, Mr. Pina, 2026-10-07).
--
-- An administrator marks ONE APP a major release: a high-effort original game,
-- as opposed to a port, which the gallery then shows in a "Major releases"
-- section above the full list. It is curation of an app, never of a person,
-- and it is not the trusted-publisher roster (0173, decision 06), which is
-- per student and keyed by address.
--
-- WHAT THIS PART DOES, IN ORDER (the order matters: the list function is
-- `language sql`, whose body is validated at create time, so the column has
-- to exist first):
--
--   A. Two columns on student_apps, a stamp and an actor, the hidden_at /
--      hidden_by shape 0130 uses. THE ACTOR IS A UUID, NEVER AN ADDRESS:
--      student_apps carries a table-wide select grant to authenticated (0130),
--      so any column on it is directly readable on every row the population
--      policy admits. No read function projects the actor.
--   B. foundry_list_apps re-projected with major_release_at. It returns a
--      table, so a new column needs a DROP at its exact, unchanged argument
--      types first; the argument list does not move, so this is not the
--      signature trap and there is no deploy ordering. The body is 0173's
--      text PATCHED with two insertions and nothing else, never retyped:
--      0173's own header records what a retyped copy silently lost (the
--      owner-or-admin gate on the submitted id, the signed-in clause and the
--      created_at tiebreaker).
--   C. foundry_get_app gains one key. It returns jsonb, so no drop: the same
--      signature, 0173's text with one inserted line.
--   D. foundry_set_app_major, the one writer. Admin only, no identity
--      parameter, idempotent both ways, and it NEVER moves updated_at:
--      curation is not an edit, and updated_at drives the gallery's
--      "Recently updated" order and the list function's own order.
--   E. A self-check over this part's own three functions, by name.
--
-- WHAT A CLIENT SEES BEFORE THIS APPLIES: no major_release_at key at all, which
-- the client reads as "cannot tell" and offers no control for. The write
-- answers PGRST202 and the console says so in a sentence. Additive, so the
-- migration and the deploy may land in either order.
--
-- UNDO: drop the write function (foundry_set_app_major(uuid, boolean)), then
-- re-paste 0173's section 4 (the list drop plus create, and the get). The two
-- columns stay; dropping them is a hand paste the apply tool refuses:
--   alter table public.student_apps drop column major_release_by,
--     drop column major_release_at;
-- ===========================================================================

-- A. THE COLUMNS.
alter table public.student_apps
	add column if not exists major_release_at timestamptz,
	add column if not exists major_release_by uuid references auth.users (id) on delete set null;

-- An actor with no stamp is a half-written record. Guarded on pg_constraint,
-- because Postgres has no add-constraint-if-not-exists.
do $fm$
begin
	if not exists (
		select 1 from pg_catalog.pg_constraint
		where conname = 'student_apps_major_release_by_needs_at'
			and conrelid = 'public.student_apps'::regclass
	) then
		alter table public.student_apps
			add constraint student_apps_major_release_by_needs_at
			check (major_release_by is null or major_release_at is not null);
	end if;
end;
$fm$;

-- B. THE LIST, re-projected. 0173's text with two insertions: the column in
-- the returned table after hidden_at, and a.major_release_at in the select.
-- The stamp is projected to EVERY caller, because it is what the gallery
-- shows; the actor is projected by nothing.
drop function if exists public.foundry_list_apps(uuid, boolean, boolean);

create or replace function public.foundry_list_apps(
	p_owner uuid default null,
	p_include_hidden boolean default false,
	p_include_unpublished boolean default false
)
returns table (
	id uuid,
	slug text,
	title text,
	tagline text,
	description text,
	cover_path text,
	build_notes text,
	owner uuid,
	owner_display_name text,
	owner_full_name text,
	owner_class text,
	published_version_id uuid,
	published_ordinal integer,
	version_count integer,
	submitted_version_id uuid,
	-- 0173. The app's OWN published version when it was auto-published by a
	-- trusted author and nobody has reviewed it yet. Null otherwise, which is
	-- every app that went through the queue.
	live_unreviewed_version_id uuid,
	metadata_flagged_at timestamptz,
	hidden_at timestamptz,
	major_release_at timestamptz,
	created_at timestamptz,
	updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fl$
	select
		a.id, a.slug, a.title, a.tagline, a.description, a.cover_path, a.build_notes,
		a.owner, p.display_name, p.full_name,
		public._foundry_author_class(a.owner),
		a.published_version_id,
		(select pv.ordinal from public.student_app_versions pv where pv.id = a.published_version_id),
		(select count(*)::integer from public.student_app_versions v where v.app_id = a.id),
		-- The review trail is the owner's and the staff's. Everyone else gets
		-- null here rather than a hint that something is sitting in the queue.
		case
			when a.owner = (select auth.uid()) or public.is_admin() then (
				select sv.id from public.student_app_versions sv
				where sv.app_id = a.id and sv.status = 'submitted'
			)
		end,
		-- 0173, decision 06. GATED THE SAME WAY the submitted id above is, and
		-- for the same reason: whether a build is waiting to be looked at is
		-- the owner's business and staff's, and nobody else's.
		--
		-- STRICTLY THE APP'S OWN PUBLISHED VERSION. A superseded auto-published
		-- build is history rather than a queue item, and offering a reviewer a
		-- take-down control for something already taken down is a control whose
		-- only possible answer is a refusal.
		case
			when a.owner = (select auth.uid()) or public.is_admin() then (
				select sv.id from public.student_app_versions sv
				where sv.id = a.published_version_id
					and sv.auto_published_at is not null
					and sv.reviewed_at is null
			)
		end,
		a.metadata_flagged_at, a.hidden_at, a.major_release_at, a.created_at, a.updated_at
	from public.student_apps a
	left join public.profiles p on p.id = a.owner
	where (select auth.uid()) is not null
		and public._foundry_app_in_population(
			a.owner, a.hidden_at, a.published_version_id,
			p_include_hidden, p_include_unpublished
		)
		and (p_owner is null or a.owner = p_owner)
	order by a.updated_at desc, a.created_at desc;
$fl$;

revoke all on function public.foundry_list_apps(uuid, boolean, boolean) from public, anon, authenticated, service_role;
grant execute on function public.foundry_list_apps(uuid, boolean, boolean) to authenticated;

-- C. ONE APP, with one more key: 0173's text with major_release_at inserted
-- after hidden_at. v_app is the whole row, so the column is already in it.
create or replace function public.foundry_get_app(
	p_slug text,
	p_include_hidden boolean default false,
	p_include_unpublished boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fg$
declare
	v_uid uuid := (select auth.uid());
	v_slug text := lower(public._foundry_norm(p_slug));
	v_app record;
	v_privileged boolean;
	v_versions jsonb;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select a.*, p.display_name as owner_display_name, p.full_name as owner_full_name
	into v_app
	from public.student_apps a
	left join public.profiles p on p.id = a.owner
	where a.slug = v_slug
		and public._foundry_app_in_population(
			a.owner, a.hidden_at, a.published_version_id,
			p_include_hidden, p_include_unpublished
		);

	if not found then
		return null;
	end if;

	v_privileged := (v_app.owner = v_uid) or public.is_admin();

	select coalesce(jsonb_agg(rows.payload order by rows.ordinal desc), '[]'::jsonb)
	into v_versions
	from (
		select v.ordinal, jsonb_build_object(
			'id', v.id,
			'ordinal', v.ordinal,
			'status', v.status,
			'manifest', v.manifest,
			'byte_size', v.byte_size,
			'file_count', v.file_count,
			'created_at', v.created_at,
			-- The zip and the review trail are privileged. A reader of a
			-- published app gets the build, never the paperwork around it.
			'zip_path', case when v_privileged then v.zip_path end,
			'reviewed_by', case when v_privileged then v.reviewed_by end,
			'reviewed_at', case when v_privileged then v.reviewed_at end,
			-- 0173. When a trusted author's submit published this without a
			-- review. Privileged beside the rest of the paperwork: a reader of a
			-- published app gets the build, never how it got there.
			'auto_published_at', case when v_privileged then v.auto_published_at end,
			'review_note', case when v_privileged then v.review_note end,
			'reject_reason', case when v_privileged then v.reject_reason end
		) as payload
		from public.student_app_versions v
		where v.app_id = v_app.id
			and (v_privileged or v.id = v_app.published_version_id)
	) rows;

	return jsonb_build_object(
		'id', v_app.id,
		'slug', v_app.slug,
		'title', v_app.title,
		'tagline', v_app.tagline,
		'description', v_app.description,
		'cover_path', v_app.cover_path,
		'build_notes', v_app.build_notes,
		'owner', v_app.owner,
		'owner_display_name', v_app.owner_display_name,
		'owner_full_name', v_app.owner_full_name,
		'owner_class', public._foundry_author_class(v_app.owner),
		'published_version_id', v_app.published_version_id,
		'metadata_flagged_at', v_app.metadata_flagged_at,
		'hidden_at', v_app.hidden_at,
		'major_release_at', v_app.major_release_at,
		'created_at', v_app.created_at,
		'updated_at', v_app.updated_at,
		'versions', v_versions
	);
end;
$fg$;

revoke all on function public.foundry_get_app(text, boolean, boolean) from public, anon, authenticated, service_role;
grant execute on function public.foundry_get_app(text, boolean, boolean) to authenticated;

-- D. THE WRITE.
--
-- RAISES for misuse (no session, not an admin, a null flag). Answers a
-- STRUCTURED refusal for the states an admin has to be shown in words:
-- not_found, and when marking, hidden and not_published. A mark on something
-- that is not on the gallery would show nothing, so marking needs a published,
-- unhidden app; UNMARKING IS ALWAYS ALLOWED, a hidden app included. Hiding
-- keeps the flag and restoring brings the app back into the section, because
-- hiding is reversible shelving.
--
-- IDEMPOTENT BOTH WAYS: a second mark or a second unmark (a double click, two
-- tabs) answers ok with changed false and keeps the original stamp, so the
-- console can say "it already was" rather than claim a write.
--
-- THE ROW LOCK is the same for-update every single-app admin write here takes.
create or replace function public.foundry_set_app_major(
	p_app_id uuid,
	p_major boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fm$
declare
	v_uid uuid := (select auth.uid());
	v_app public.student_apps%rowtype;
	v_at timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only a site administrator can make an app a major release.';
	end if;
	if p_major is null then
		raise exception 'A major release or not? That has to be one or the other.';
	end if;

	select a.* into v_app from public.student_apps a where a.id = p_app_id for update;
	if not found then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;

	if p_major then
		if v_app.major_release_at is not null then
			return jsonb_build_object(
				'ok', true, 'app_id', p_app_id,
				'major_release_at', v_app.major_release_at, 'changed', false
			);
		end if;
		if v_app.hidden_at is not null then
			return jsonb_build_object('ok', false, 'reason', 'hidden');
		end if;
		if v_app.published_version_id is null then
			return jsonb_build_object('ok', false, 'reason', 'not_published');
		end if;
	elsif v_app.major_release_at is null then
		return jsonb_build_object(
			'ok', true, 'app_id', p_app_id, 'major_release_at', null, 'changed', false
		);
	end if;

	-- updated_at is deliberately not in this list.
	update public.student_apps a set
		major_release_at = case when p_major then now() else null end,
		major_release_by = case when p_major then v_uid else null end
	where a.id = p_app_id
	returning a.major_release_at into v_at;

	return jsonb_build_object(
		'ok', true, 'app_id', p_app_id, 'major_release_at', v_at, 'changed', true
	);
end;
$fm$;

revoke all on function public.foundry_set_app_major(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.foundry_set_app_major(uuid, boolean) to authenticated;

-- E. THE SELF-CHECK, over this part's own three functions by name and nothing
-- else: a prefix sweep would be asserting something about other migrations.
do $fm$
declare
	v_n integer;
	v_major integer;
begin
	select count(*) into v_n
	from pg_catalog.pg_proc p
	join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public'
		and p.proname in ('foundry_list_apps', 'foundry_get_app', 'foundry_set_app_major');
	if v_n <> 3 then
		raise exception 'foundry-major: expected one function each for foundry_list_apps, foundry_get_app and foundry_set_app_major, found % in all.', v_n;
	end if;

	if pg_catalog.pg_get_function_result('public.foundry_list_apps(uuid, boolean, boolean)'::regprocedure)
		not like '%major_release_at timestamp with time zone%' then
		raise exception 'foundry-major: foundry_list_apps does not project major_release_at.';
	end if;

	if pg_catalog.has_function_privilege('anon', 'public.foundry_set_app_major(uuid, boolean)', 'EXECUTE')
		or pg_catalog.has_function_privilege('anon', 'public.foundry_list_apps(uuid, boolean, boolean)', 'EXECUTE')
		or pg_catalog.has_function_privilege('anon', 'public.foundry_get_app(text, boolean, boolean)', 'EXECUTE') then
		raise exception 'foundry-major: a Foundry read or the major-release write is executable by anon.';
	end if;

	if not pg_catalog.has_function_privilege('authenticated', 'public.foundry_set_app_major(uuid, boolean)', 'EXECUTE') then
		raise exception 'foundry-major: foundry_set_app_major is not executable by authenticated.';
	end if;

	select count(*) into v_major from public.student_apps where major_release_at is not null;
	raise notice 'foundry-major: % app(s) marked as a major release (none on a first apply; a re-apply keeps them).', v_major;
end;
$fm$;
-- ===== PART foundry-major END =====

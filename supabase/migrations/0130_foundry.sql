-- 0130_foundry.sql
-- IDEA FOUNDRY: students publish the static web apps they have built.
--
-- DATA LAYER ONLY. Three tables, their policies, three Storage buckets and
-- eleven RPCs. There is no route, no component and no UI in this file, and
-- nothing here renders anything. The extraction Edge Function that unpacks an
-- uploaded zip into student_app_files is a separate deployment; this file
-- defines the table it writes to and denies every client the ability to write
-- it.
--
-- THE SHAPE, AND WHY IT IS THREE TABLES.
--
--   student_apps           the thing a student owns and names. One row per app,
--                          slug-addressed, soft-deletable by staff.
--   student_app_versions   an upload attempt with a review state. An app
--                          publishes exactly one of them at a time.
--   student_app_files      one row per extracted file, written ONLY by the
--                          extraction function. This is the bundle proxy's
--                          lookup index -- the 0101 deck argument applied
--                          again: a serving route resolves one (version,
--                          relative path) pair per request, which wants an
--                          indexed lookup and not a jsonb manifest fetched and
--                          scanned thirty times per page view. It is also what
--                          keeps the serving route from ever LISTING storage.
--
-- WHAT IS ENFORCED BY THE SCHEMA RATHER THAN BY A FUNCTION, because these are
-- the rules that would otherwise be re-checked in every new call site:
--
--   1. AT MOST ONE SUBMITTED VERSION PER APP -- a partial unique index, not a
--      count-then-insert. Two tabs, two submits, one queue entry.
--   2. published_version_id BELONGS TO ITS OWN APP -- a COMPOSITE foreign key
--      (published_version_id, id) -> (id, app_id), the
--      make-the-invalid-state-unrepresentable convention 0069/0088 already use
--      for (session_id, section_id) and (folder_id, student_id). No RPC
--      re-checks it and a raw insert cannot route around it.
--   3. published_version_id POINTS AT AN APPROVED VERSION -- a trigger, in
--      BOTH directions: one refuses publishing a version that is not
--      approved, the other refuses moving a published version out of
--      approved. A foreign key cannot express "and its status column says
--      this", so this half is a trigger, and it is a trigger rather than only
--      an RPC check so that it holds for a SQL-editor update too. The RPCs
--      check it as well; that redundancy is deliberate defense in depth, and
--      the verification opened each layer separately to confirm both bite.
--
-- THE FIVE-APP CAP IS AN RPC CHECK, and it takes a row lock on the owner's
-- profile first -- the 0077 capacity rule: there is no child row to lock for a
-- caller who does not hold one yet, so two concurrent creates would both count
-- four and both insert. Locking the person serializes them.
--
-- LIVENESS IS ONE PREDICATE, NOT A FILTER PER CALL SITE. 0116 learned this the
-- expensive way: a soft-delete stamp is only as good as the filters behind it,
-- and it stamped a column then had to chase every list in the subsystem. Here
-- _foundry_app_in_population is the single expression of "which apps does this
-- caller mean", it takes the two widening flags as parameters, and the RLS
-- policy, foundry_list_apps and foundry_get_app all call it. There is no
-- inline `hidden_at is null` anywhere in this file outside that function and
-- the partial indexes.
--
-- WHAT THE PREDICATE SAYS, stated plainly because it is a disclosure decision:
--   - a published, unhidden app is visible to every signed-in account;
--   - an app with no published version is visible to its OWNER, and to an
--     admin who asks for that population;
--   - a HIDDEN app is visible to an admin who asks for that population, and to
--     NOBODY ELSE -- including its owner. Hiding is a staff act; an owner who
--     could still list around it would not have been hidden.
--
-- NO EMAIL LEAVES THESE FUNCTIONS. An app is published under a person's name,
-- so the read RPCs carry the owner's uuid and their display and full name from
-- profiles. They carry no address, and must not gain one.
--
-- ZERO CLIENT WRITE GRANTS, as everywhere else: SELECT only on all three
-- tables, every write a SECURITY DEFINER RPC that re-checks the caller in its
-- own body, and every student-facing write RPC takes NO identity parameter --
-- the caller is auth.uid(), so "can only act as themselves" is a property of
-- the signature rather than a check that could be got wrong.
--
-- PATH SAFETY REUSES _classroom_deck_path_ok (0101), AND ITS NAME LIES the way
-- _classroom_doc_ok's does. It is a PURE text predicate that names no table,
-- no column and no policy: relative, forward-slashed, contained, no traversal,
-- no scheme, no drive letter. That is exactly the rule a bundle path needs,
-- for exactly the same reason (a proxy resolves the stored string against a
-- browser's request). A second copy under a _foundry_ prefix is the thing that
-- would quietly stop matching, so this file CALLS it. Do not clone it, and do
-- not rename it -- the 0067 naming trap applies.
--
-- STORAGE, three buckets:
--   foundry-uploads   PRIVATE. Raw zips. Owner writes under <uid>/. No client
--                     read at all -- the zip is an input, not an artifact.
--   foundry-bundles   PRIVATE. Extracted files. NO client policy of ANY kind,
--                     so RLS denies every authenticated and anon request by
--                     default and only service_role (bypassrls) can touch it.
--                     The proxy reads it server-side.
--   foundry-covers    PUBLIC read. Owner writes under <uid>/.
--
-- THE BUNDLE PATH IS <app_id>/<version_id>/<path>, and that is a prune
-- decision written into the layout rather than a policy. Pruning is not built
-- here, but a whole VERSION is one prefix delete and a whole APP is one prefix
-- above that, so neither ever needs a file-by-file walk of student_app_files.
--
-- WHAT UNDOES THIS MIGRATION is at the bottom of the file, in a comment.
--
-- Apply manually in the Supabase SQL editor, after 0129.

-- ---------------------------------------------------------------------------
-- 1. Shared text rules.
--
-- ONE normalizer for every emptiness gate in this file. btrim() with no second
-- argument strips SPACES ONLY, so `length(btrim(x)) > 0` passes a value of
-- newlines and tabs -- empty to whoever typed it, empty to the client's
-- trim(), and accepted by the gate written to refuse it. build_notes is
-- REQUIRED and non-empty, so that gate is the whole point of the column and it
-- is not allowed to admit a blank.
--
-- Not btrim(x, E' \t\n\r\f\v'): an escape Postgres does not recognise in an
-- E'' string is kept as the bare LETTER, so that trim set silently also strips
-- `v` from both ends.
-- ---------------------------------------------------------------------------

create or replace function public._foundry_norm(p_text text)
returns text
language sql
immutable
as $$
	select regexp_replace(coalesce(p_text, ''), '^\s+|\s+$', '', 'g');
$$;

revoke all on function public._foundry_norm(text) from public;

-- A Foundry slug is URL-SAFE and PERMANENT. It addresses /foundry/<slug>, and
-- a printed URL is a contract, so nothing in this file changes one: the
-- metadata RPC refuses that field BY NAME rather than silently ignoring it.
--
-- No reserved-word list, unlike 0093's short links: these slugs live under a
-- fixed /foundry/ prefix and cannot shadow a real single-segment route.
--
-- Lowercase, 2..64, alphanumeric at both ends, single internal hyphens.
create or replace function public._foundry_slug_ok(p_slug text)
returns boolean
language sql
immutable
as $$
	select p_slug is not null
		and p_slug = lower(btrim(p_slug))
		and p_slug ~ '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$'
		and char_length(p_slug) between 2 and 64
		and strpos(p_slug, '--') = 0;
$$;

revoke all on function public._foundry_slug_ok(text) from public;

-- ---------------------------------------------------------------------------
-- 2. Tables.
--
-- `create table if not exists` throughout: a migration here is pasted in by
-- hand and a re-paste is an ordinary thing that happens.
-- ---------------------------------------------------------------------------

create table if not exists public.student_apps (
	id uuid primary key default gen_random_uuid(),
	-- on delete cascade: an app is the student's own work and has no life
	-- after the account. The review record lives on the versions, which cascade
	-- with it.
	owner uuid not null references auth.users (id) on delete cascade,
	slug text not null unique check (public._foundry_slug_ok(slug)),
	title text not null check (char_length(public._foundry_norm(title)) between 1 and 120),
	tagline text check (tagline is null or char_length(public._foundry_norm(tagline)) between 1 and 200),
	description text check (description is null or char_length(public._foundry_norm(description)) between 1 and 4000),
	-- A path into foundry-covers. Same containment rule as a bundle path.
	cover_path text check (cover_path is null or public._classroom_deck_path_ok(cover_path)),
	-- REQUIRED AND NON-EMPTY. How the student built it and which tools were
	-- used. This is the column the whole surface exists to collect: a published
	-- app with no account of how it was made is a screenshot.
	build_notes text not null check (char_length(public._foundry_norm(build_notes)) between 1 and 8000),
	-- The foreign key is added in section 3, once student_app_versions exists.
	published_version_id uuid,
	-- Stamped when the metadata of an ALREADY PUBLISHED app changes, so staff
	-- can see that what is on the page is no longer what they approved. It is a
	-- FLAG, not a gate: the app stays published and readable while it is set.
	metadata_flagged_at timestamptz,
	-- Soft delete, the archive-never-delete convention. The stamp/actor pair is
	-- 0116's (deleted_at / deleted_by), spelled for this surface; `on delete
	-- set null` on the actor because a departed account must not take the
	-- record of what it did with it.
	hidden_at timestamptz,
	hidden_by uuid references auth.users (id) on delete set null,
	hidden_reason text check (hidden_reason is null or char_length(public._foundry_norm(hidden_reason)) between 1 and 1000),
	created_at timestamptz not null default now(),
	-- Maintained by the RPCs explicitly, NOT by a trigger. A trigger that stops
	-- firing leaves a subtly wrong value forever with nothing to catch it; a
	-- write path that is nine functions long can simply set it.
	updated_at timestamptz not null default now()
);

create table if not exists public.student_app_versions (
	id uuid primary key default gen_random_uuid(),
	app_id uuid not null references public.student_apps (id) on delete cascade,
	-- Human-facing version number, 1-based, assigned by the create RPC under a
	-- lock on the app row. UNIQUE PER APP (index below).
	ordinal integer not null check (ordinal between 1 and 100000),
	-- The raw zip in foundry-uploads, under the OWNER's prefix.
	zip_path text not null check (public._classroom_deck_path_ok(zip_path)),
	-- Whatever the extraction function recorded about the upload: entry file,
	-- detected framework, warnings. An OBJECT, always -- a bare scalar here
	-- would make every reader test the type before reading it.
	manifest jsonb not null default '{}'::jsonb check (jsonb_typeof(manifest) = 'object'),
	status text not null default 'draft'
		check (status in ('draft', 'submitted', 'approved', 'rejected')),
	reviewed_by uuid references auth.users (id) on delete set null,
	reviewed_at timestamptz,
	-- What the reviewer wrote. REQUIRED on a reject (enforced in the RPC): a
	-- rejection with no note is a dead end for the student holding it.
	review_note text check (review_note is null or char_length(public._foundry_norm(review_note)) between 1 and 4000),
	-- A short reason kept beside the note, so a queue can group rejections
	-- without parsing prose.
	reject_reason text check (reject_reason is null or char_length(public._foundry_norm(reject_reason)) between 1 and 200),
	byte_size bigint not null default 0 check (byte_size >= 0),
	file_count integer not null default 0 check (file_count >= 0),
	created_at timestamptz not null default now()
);

create table if not exists public.student_app_files (
	id uuid primary key default gen_random_uuid(),
	version_id uuid not null references public.student_app_versions (id) on delete cascade,
	-- Relative to the bundle root, exactly as it sat in the zip. Never
	-- rewritten: an exported static site's internal references are already
	-- correct relative to its entry file, so the tree is served as a unit.
	path text not null check (public._classroom_deck_path_ok(path)),
	content_type text not null check (char_length(btrim(content_type)) between 1 and 200),
	byte_size bigint not null default 0 check (byte_size >= 0),
	-- The proxy's lookup index: one row read per served file, keyed on exactly
	-- what the browser asked for.
	unique (version_id, path)
);

-- ---------------------------------------------------------------------------
-- 3. The published-version rules, and the one-submission rule.
-- ---------------------------------------------------------------------------

-- One submitted version per app. A PARTIAL UNIQUE INDEX rather than a count in
-- the RPC: the second submit fails on the constraint, in the database, whoever
-- is calling and however many of them are calling at once.
create unique index if not exists student_app_versions_one_submitted_idx
	on public.student_app_versions (app_id)
	where status = 'submitted';

create unique index if not exists student_app_versions_app_ordinal_idx
	on public.student_app_versions (app_id, ordinal);

create index if not exists student_app_versions_app_idx
	on public.student_app_versions (app_id, ordinal desc);

create index if not exists student_app_versions_review_queue_idx
	on public.student_app_versions (created_at)
	where status = 'submitted';

create index if not exists student_apps_owner_live_idx
	on public.student_apps (owner, created_at desc)
	where hidden_at is null;

create index if not exists student_apps_published_idx
	on public.student_apps (updated_at desc)
	where hidden_at is null and published_version_id is not null;

-- The composite key that makes "published version of another app"
-- unrepresentable. student_app_versions.id is already unique as the primary
-- key, but a foreign key needs a unique constraint over the exact pair it
-- references.
do $$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'student_app_versions_id_app_key'
			and conrelid = 'public.student_app_versions'::regclass
	) then
		alter table public.student_app_versions
			add constraint student_app_versions_id_app_key unique (id, app_id);
	end if;
end
$$;

-- MATCH SIMPLE (the default) is what makes a nullable published_version_id
-- work: with it null the referencing pair carries a null and the constraint is
-- not checked at all, which is exactly "nothing published yet". With it set,
-- both columns are non-null and the pair must exist -- so the version has to
-- be one of THIS app's.
--
-- Postgres has no `add constraint if not exists`, and a blind drop-then-add
-- raises 2BP01 on a re-paste, so this is guarded on pg_constraint.
do $$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'student_apps_published_version_fkey'
			and conrelid = 'public.student_apps'::regclass
	) then
		alter table public.student_apps
			add constraint student_apps_published_version_fkey
			foreign key (published_version_id, id)
			references public.student_app_versions (id, app_id);
	end if;
end
$$;

-- The half a foreign key cannot express: the version's STATUS.
--
-- TWO triggers, because there are two ways to break the rule and closing only
-- the first leaves the second wide open -- point the app at a draft, or
-- approve a version, publish it, then move it back out of approved.
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

drop trigger if exists foundry_published_version_check on public.student_apps;
create trigger foundry_published_version_check
	before insert or update of published_version_id on public.student_apps
	for each row execute function public._foundry_published_version_check();

create or replace function public._foundry_version_status_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if old.status = 'approved' and new.status <> 'approved'
		and exists (select 1 from public.student_apps a where a.published_version_id = new.id)
	then
		raise exception 'That version is what the app currently publishes. Publish another approved version first.';
	end if;
	return new;
end;
$$;

drop trigger if exists foundry_version_status_check on public.student_app_versions;
create trigger foundry_version_status_check
	before update of status on public.student_app_versions
	for each row execute function public._foundry_version_status_check();

-- ---------------------------------------------------------------------------
-- 4. Liveness, visibility, RLS.
--
-- THE ONE PREDICATE. Every read of student_apps in this file -- the policy,
-- the list, the single-app get -- asks this and nothing else. The two flags
-- are the widening, and both are additionally gated on is_admin() INSIDE the
-- predicate, so passing `true` from a student's session widens nothing. That
-- is why the list is one function with a parameter rather than a second,
-- admin-only function whose projection would have to be kept in step.
--
-- It is not SECURITY DEFINER: it reads auth.uid() and is_admin(), and is_admin
-- is already a definer function granted to authenticated. It IS granted
-- execute to authenticated, because a function named directly inside an RLS
-- `using` clause is evaluated as the querying role -- missing that grant
-- breaks the whole read with `permission denied for function`.
-- ---------------------------------------------------------------------------

create or replace function public._foundry_app_in_population(
	p_owner uuid,
	p_hidden_at timestamptz,
	p_published_version_id uuid,
	p_include_hidden boolean default false,
	p_include_unpublished boolean default false
)
returns boolean
language sql
stable
as $$
	select case
		when p_hidden_at is not null
			then coalesce(p_include_hidden, false) and public.is_admin()
		when p_published_version_id is null
			then p_owner = (select auth.uid())
				or (coalesce(p_include_unpublished, false) and public.is_admin())
		else true
	end;
$$;

revoke all on function public._foundry_app_in_population(uuid, timestamptz, uuid, boolean, boolean) from public;
grant execute on function public._foundry_app_in_population(uuid, timestamptz, uuid, boolean, boolean) to authenticated;

-- The delegation target for the two child tables, so a version and a file are
-- exactly as visible as the app they hang on and widening the app's rule
-- widens theirs consistently. SECURITY DEFINER so the nested student_apps read
-- is a plain lookup rather than a second policy evaluation.
create or replace function public.foundry_can_read_app(p_app_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.student_apps a
		where a.id = p_app_id
			and public._foundry_app_in_population(a.owner, a.hidden_at, a.published_version_id, true, true)
	);
$$;

revoke all on function public.foundry_can_read_app(uuid) from public;
grant execute on function public.foundry_can_read_app(uuid) to authenticated;

-- A VERSION IS NARROWER THAN ITS APP, and that is a disclosure decision rather
-- than an oversight. The review trail -- what was rejected, why, how many
-- attempts it took -- is between the student and the staff who reviewed it.
-- So: the owner and admins see every version; everybody else sees exactly the
-- one the app publishes, which is the row the bundle proxy has to resolve.
create or replace function public.foundry_can_read_version(p_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1
		from public.student_app_versions v
		join public.student_apps a on a.id = v.app_id
		where v.id = p_version_id
			and public._foundry_app_in_population(a.owner, a.hidden_at, a.published_version_id, true, true)
			and (
				a.owner = (select auth.uid())
				or public.is_admin()
				or a.published_version_id = v.id
			)
	);
$$;

revoke all on function public.foundry_can_read_version(uuid) from public;
grant execute on function public.foundry_can_read_version(uuid) to authenticated;

revoke all on public.student_apps from anon, authenticated;
grant select on public.student_apps to authenticated;
grant select, insert, update, delete on public.student_apps to service_role;
alter table public.student_apps enable row level security;

drop policy if exists "foundry apps by population" on public.student_apps;
create policy "foundry apps by population"
	on public.student_apps
	for select
	to authenticated
	using (public._foundry_app_in_population(owner, hidden_at, published_version_id, true, true));

revoke all on public.student_app_versions from anon, authenticated;
grant select on public.student_app_versions to authenticated;
grant select, insert, update, delete on public.student_app_versions to service_role;
alter table public.student_app_versions enable row level security;

drop policy if exists "foundry versions follow their app" on public.student_app_versions;
create policy "foundry versions follow their app"
	on public.student_app_versions
	for select
	to authenticated
	using (public.foundry_can_read_version(id));

-- WRITTEN ONLY BY THE EXTRACTION EDGE FUNCTION. There is no insert, update or
-- delete policy on this table and no write grant to any client role, so
-- service_role -- which bypasses RLS and holds the grant below -- is the only
-- writer that exists.
revoke all on public.student_app_files from anon, authenticated;
grant select on public.student_app_files to authenticated;
grant select, insert, update, delete on public.student_app_files to service_role;
alter table public.student_app_files enable row level security;

drop policy if exists "foundry files follow their version" on public.student_app_files;
create policy "foundry files follow their version"
	on public.student_app_files
	for select
	to authenticated
	using (public.foundry_can_read_version(version_id));

-- ---------------------------------------------------------------------------
-- 5. Write RPCs.
--
-- Every one: SECURITY DEFINER, `set search_path = ''`, revoked from public,
-- granted to authenticated, returning jsonb, and re-checking the caller in its
-- own body. None of them takes an identity parameter for the acting student.
-- ---------------------------------------------------------------------------

-- Create an app. The five-app cap lives here.
create or replace function public.foundry_create_app(
	p_slug text,
	p_title text,
	p_build_notes text,
	p_tagline text default null,
	p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_slug text := lower(public._foundry_norm(p_slug));
	v_title text := public._foundry_norm(p_title);
	v_notes text := public._foundry_norm(p_build_notes);
	v_tagline text := nullif(public._foundry_norm(p_tagline), '');
	v_desc text := nullif(public._foundry_norm(p_description), '');
	v_count integer;
	v_id uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public._foundry_slug_ok(v_slug) then
		raise exception 'An address is 2 to 64 characters of lowercase letters, digits and single hyphens, starting and ending with a letter or digit.';
	end if;
	if v_title = '' then
		raise exception 'Your app needs a name.';
	end if;
	if v_notes = '' then
		raise exception 'Say how you built it and which tools you used. That part is required.';
	end if;

	-- THE CAPACITY LOCK. There is no child row to lock for a caller who does
	-- not hold one yet, so the parent being locked is the PERSON. Under READ
	-- COMMITTED the second caller waits here and then genuinely sees the
	-- first's committed row in the count below.
	perform 1 from public.profiles p where p.id = v_uid for update;

	select count(*) into v_count
	from public.student_apps a
	where a.owner = v_uid and a.hidden_at is null;

	if v_count >= 5 then
		raise exception 'You already have % apps in Foundry, which is the limit. Ask an instructor if you need another slot.', v_count;
	end if;

	if exists (select 1 from public.student_apps a where a.slug = v_slug) then
		raise exception 'The address "%" is already taken.', v_slug;
	end if;

	insert into public.student_apps (owner, slug, title, tagline, description, build_notes)
	values (v_uid, v_slug, v_title, v_tagline, v_desc, v_notes)
	returning id into v_id;

	return jsonb_build_object('ok', true, 'app_id', v_id, 'slug', v_slug);
end;
$$;

revoke all on function public.foundry_create_app(text, text, text, text, text) from public;
grant execute on function public.foundry_create_app(text, text, text, text, text) to authenticated;

-- ONE FIELD PER CALL, never a whole-row replace.
--
-- A whole-row update here would mean a client that read the app before someone
-- else edited it silently reverting their change, and it would make "which
-- field moved" -- the question metadata_flagged_at exists to answer --
-- unanswerable. So the signature is (app, field, value) over a NAMED
-- whitelist, and an unknown field is refused rather than ignored.
--
-- THE SLUG IS NOT IN THE LIST, and is refused BY NAME rather than falling
-- through to the generic message. /foundry/<slug> is a printed, shared,
-- QR-coded address; changing one breaks every link to it.
--
-- THE FLAG IS STAMPED ONLY ON A REAL CHANGE to an app that is actually
-- published. A save that changed nothing is not an edit -- comparing before
-- stamping is the difference between a signal staff can trust and a queue that
-- fills with no-ops. It is not re-taken while already set, either: the first
-- unreviewed edit is when the drift started.
create or replace function public.foundry_update_app_metadata(
	p_app_id uuid,
	p_field text,
	p_value text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_app public.student_apps%rowtype;
	v_field text := lower(public._foundry_norm(p_field));
	v_value text := public._foundry_norm(p_value);
	v_old text;
	v_flagged timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select a.* into v_app from public.student_apps a where a.id = p_app_id for update;
	if not found then
		raise exception 'That app does not exist.';
	end if;
	-- Not-found and not-yours answer identically, so an id cannot be probed.
	if v_app.owner <> v_uid and not public.is_admin() then
		raise exception 'That app does not exist.';
	end if;
	if v_app.hidden_at is not null then
		raise exception 'That app has been hidden by staff and cannot be edited.';
	end if;

	if v_field = 'slug' then
		raise exception 'An app address is permanent. Links, QR codes and handouts point at it.';
	end if;
	if v_field not in ('title', 'tagline', 'description', 'cover_path', 'build_notes') then
		raise exception 'There is no editable field called "%".', coalesce(nullif(v_field, ''), '(none)');
	end if;

	v_old := case v_field
		when 'title' then v_app.title
		when 'tagline' then v_app.tagline
		when 'description' then v_app.description
		when 'cover_path' then v_app.cover_path
		when 'build_notes' then v_app.build_notes
	end;

	-- Required fields refuse a blank; optional ones store NULL for one.
	if v_field in ('title', 'build_notes') and v_value = '' then
		raise exception 'That field cannot be empty.';
	end if;
	if v_field = 'cover_path' and v_value <> '' and not public._classroom_deck_path_ok(v_value) then
		raise exception 'That cover image path is not a legal file path.';
	end if;

	if coalesce(v_old, '') = v_value then
		return jsonb_build_object(
			'ok', true, 'app_id', p_app_id, 'field', v_field,
			'changed', false, 'metadata_flagged_at', v_app.metadata_flagged_at
		);
	end if;

	-- The flag means "what is published is no longer what was approved", so it
	-- is only meaningful once something IS published.
	v_flagged := case
		when v_app.published_version_id is null then v_app.metadata_flagged_at
		else coalesce(v_app.metadata_flagged_at, now())
	end;

	update public.student_apps a set
		title = case when v_field = 'title' then v_value else a.title end,
		tagline = case when v_field = 'tagline' then nullif(v_value, '') else a.tagline end,
		description = case when v_field = 'description' then nullif(v_value, '') else a.description end,
		cover_path = case when v_field = 'cover_path' then nullif(v_value, '') else a.cover_path end,
		build_notes = case when v_field = 'build_notes' then v_value else a.build_notes end,
		metadata_flagged_at = v_flagged,
		updated_at = now()
	where a.id = p_app_id;

	return jsonb_build_object(
		'ok', true, 'app_id', p_app_id, 'field', v_field,
		'changed', true, 'metadata_flagged_at', v_flagged
	);
end;
$$;

revoke all on function public.foundry_update_app_metadata(uuid, text, text) from public;
grant execute on function public.foundry_update_app_metadata(uuid, text, text) to authenticated;

-- A new version, always as a DRAFT. Nothing in this function can create a
-- submitted, approved or rejected row: those states are reached only through
-- the three functions below, each of which states who may make that move.
--
-- The app row is locked for the ordinal, which is otherwise a
-- read-max-then-insert with two tabs open. The unique index would catch the
-- collision; the lock means the second caller gets version 3 rather than an
-- error about version 2.
create or replace function public.foundry_create_version(
	p_app_id uuid,
	p_zip_path text,
	p_manifest jsonb default '{}'::jsonb,
	p_byte_size bigint default 0,
	p_file_count integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_app public.student_apps%rowtype;
	v_zip text := public._foundry_norm(p_zip_path);
	v_manifest jsonb := coalesce(p_manifest, '{}'::jsonb);
	v_ordinal integer;
	v_id uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select a.* into v_app from public.student_apps a where a.id = p_app_id for update;
	if not found or v_app.owner <> v_uid then
		raise exception 'That app does not exist or is not yours.';
	end if;
	if v_app.hidden_at is not null then
		raise exception 'That app has been hidden by staff, so nothing new can be uploaded to it.';
	end if;
	if not public._classroom_deck_path_ok(v_zip) then
		raise exception 'That upload path is not a legal file path.';
	end if;
	-- `is distinct from`, not `<>`: jsonb_typeof of an absent value is NULL,
	-- and a NULL in a boolean gate propagates straight through the `if not`
	-- rather than firing it (0125).
	if jsonb_typeof(v_manifest) is distinct from 'object' then
		raise exception 'The manifest must be an object.';
	end if;
	if coalesce(p_byte_size, 0) < 0 or coalesce(p_file_count, 0) < 0 then
		raise exception 'A version cannot have a negative size or file count.';
	end if;

	select coalesce(max(v.ordinal), 0) + 1 into v_ordinal
	from public.student_app_versions v where v.app_id = p_app_id;

	insert into public.student_app_versions (app_id, ordinal, zip_path, manifest, byte_size, file_count)
	values (p_app_id, v_ordinal, v_zip, v_manifest, coalesce(p_byte_size, 0), coalesce(p_file_count, 0))
	returning id into v_id;

	update public.student_apps a set updated_at = now() where a.id = p_app_id;

	return jsonb_build_object('ok', true, 'version_id', v_id, 'ordinal', v_ordinal, 'status', 'draft');
end;
$$;

revoke all on function public.foundry_create_version(uuid, text, jsonb, bigint, integer) from public;
grant execute on function public.foundry_create_version(uuid, text, jsonb, bigint, integer) to authenticated;

-- Draft -> submitted. Owner only.
--
-- ONE TRANSACTION, and the withdraw happens FIRST. The partial unique index
-- allows exactly one submitted row per app, so writing this one before
-- clearing the other would fail on the index and leave the student looking at
-- an error about a version they had forgotten they submitted. Withdrawing
-- first makes "submit this one" mean what it says.
--
-- A REJECTED VERSION CANNOT BE RESUBMITTED. The reviewer's answer stands on
-- the row they answered; a fix is a new upload, which is a new version with
-- its own ordinal and its own review. That is why this refuses anything but a
-- draft rather than accepting 'rejected' too.
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

	update public.student_app_versions v
	set status = 'submitted', reviewed_by = null, reviewed_at = null,
		review_note = null, reject_reason = null
	where v.id = p_version_id;

	update public.student_apps a set updated_at = now() where a.id = v_version.app_id;

	return jsonb_build_object(
		'ok', true, 'version_id', p_version_id, 'status', 'submitted',
		'withdrew', to_jsonb(v_withdrawn)
	);
end;
$$;

revoke all on function public.foundry_submit_version(uuid) from public;
grant execute on function public.foundry_submit_version(uuid) to authenticated;

-- Submitted -> draft. Owner only. Pulling your own work back out of the queue.
create or replace function public.foundry_withdraw_version(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_version public.student_app_versions%rowtype;
	v_owner uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select v.* into v_version from public.student_app_versions v where v.id = p_version_id for update;
	if not found then
		raise exception 'That version does not exist.';
	end if;

	select a.owner into v_owner from public.student_apps a where a.id = v_version.app_id;
	if v_owner <> v_uid then
		raise exception 'That version does not exist.';
	end if;
	if v_version.status <> 'submitted' then
		raise exception 'Only a submitted version can be withdrawn (that one is %).', v_version.status;
	end if;

	update public.student_app_versions v
	set status = 'draft', reviewed_by = null, reviewed_at = null
	where v.id = p_version_id;

	update public.student_apps a set updated_at = now() where a.id = v_version.app_id;

	return jsonb_build_object('ok', true, 'version_id', p_version_id, 'status', 'draft');
end;
$$;

revoke all on function public.foundry_withdraw_version(uuid) from public;
grant execute on function public.foundry_withdraw_version(uuid) to authenticated;

-- Approve or reject. ADMIN ONLY -- is_admin(), never role = 'teacher', which
-- the email domain hands to every member of staff (0067).
--
-- A REJECT WITHOUT A NOTE IS REFUSED. A student holding a rejection with no
-- text has nothing to act on, and the sentence that says what to change is the
-- queue's whole purpose.
--
-- ON APPROVE THE APP PUBLISHES THIS VERSION, in the same transaction. Approval
-- that left publishing to a second call would put an app in a state where
-- staff believe it is live and it is not.
--
-- IT DOES NOT CLEAR metadata_flagged_at. Approving a BUILD is not reviewing
-- the copy around it; foundry_clear_metadata_flag is that decision, made
-- deliberately by an admin who has read the text.
create or replace function public.foundry_review_version(
	p_version_id uuid,
	p_decision text,
	p_review_note text default null,
	p_reject_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_version public.student_app_versions%rowtype;
	v_decision text := lower(public._foundry_norm(p_decision));
	v_note text := nullif(public._foundry_norm(p_review_note), '');
	v_reason text := nullif(public._foundry_norm(p_reject_reason), '');
	v_status text;
	v_published boolean := false;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only an administrator can review a Foundry submission.';
	end if;
	if v_decision not in ('approve', 'reject') then
		raise exception 'A review is either "approve" or "reject".';
	end if;

	select v.* into v_version from public.student_app_versions v where v.id = p_version_id for update;
	if not found then
		raise exception 'That version does not exist.';
	end if;
	if v_version.status <> 'submitted' then
		raise exception 'Only a submitted version can be reviewed (that one is %).', v_version.status;
	end if;
	if v_decision = 'reject' and v_note is null then
		raise exception 'A rejection needs a note saying what to change.';
	end if;

	v_status := case when v_decision = 'approve' then 'approved' else 'rejected' end;

	update public.student_app_versions v
	set status = v_status,
		reviewed_by = v_uid,
		reviewed_at = now(),
		review_note = v_note,
		reject_reason = case when v_decision = 'reject' then v_reason else null end
	where v.id = p_version_id;

	if v_decision = 'approve' then
		-- The trigger re-checks both halves of the rule on the way past.
		update public.student_apps a
		set published_version_id = p_version_id, updated_at = now()
		where a.id = v_version.app_id;
		v_published := true;
	else
		update public.student_apps a set updated_at = now() where a.id = v_version.app_id;
	end if;

	return jsonb_build_object(
		'ok', true, 'version_id', p_version_id, 'status', v_status, 'published', v_published
	);
end;
$$;

revoke all on function public.foundry_review_version(uuid, text, text, text) from public;
grant execute on function public.foundry_review_version(uuid, text, text, text) to authenticated;

-- Roll back (or forward) to any version of this app that has been approved.
-- Owner OR admin: a student who ships a broken build at 8am should not have to
-- find a member of staff to put the working one back.
--
-- NOT AN UNPUBLISH. There is no null here -- taking an app off the site is
-- foundry_set_app_hidden, which is an admin act and leaves a record of who did
-- it. Allowing null would give an owner a quiet second way to do the same
-- thing with no record.
create or replace function public.foundry_set_published_version(
	p_app_id uuid,
	p_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_app public.student_apps%rowtype;
	v_version public.student_app_versions%rowtype;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_version_id is null then
		raise exception 'Which version? To take an app off the site, ask an administrator to hide it.';
	end if;

	select a.* into v_app from public.student_apps a where a.id = p_app_id for update;
	if not found then
		raise exception 'That app does not exist.';
	end if;
	if v_app.owner <> v_uid and not public.is_admin() then
		raise exception 'That app does not exist.';
	end if;
	if v_app.hidden_at is not null then
		raise exception 'That app has been hidden by staff.';
	end if;

	select v.* into v_version from public.student_app_versions v where v.id = p_version_id;
	if not found or v_version.app_id <> p_app_id then
		raise exception 'That version does not belong to this app.';
	end if;
	if v_version.status <> 'approved' then
		raise exception 'Only an approved version can be published (that one is %).', v_version.status;
	end if;

	update public.student_apps a
	set published_version_id = p_version_id, updated_at = now()
	where a.id = p_app_id;

	return jsonb_build_object('ok', true, 'app_id', p_app_id, 'published_version_id', p_version_id);
end;
$$;

revoke all on function public.foundry_set_published_version(uuid, uuid) from public;
grant execute on function public.foundry_set_published_version(uuid, uuid) to authenticated;

-- Admin only: the metadata has been read and is fine.
create or replace function public.foundry_clear_metadata_flag(p_app_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_rows integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only an administrator can clear a metadata flag.';
	end if;

	update public.student_apps a
	set metadata_flagged_at = null, updated_at = now()
	where a.id = p_app_id;
	get diagnostics v_rows = row_count;

	if v_rows = 0 then
		raise exception 'That app does not exist.';
	end if;

	return jsonb_build_object('ok', true, 'app_id', p_app_id);
end;
$$;

revoke all on function public.foundry_clear_metadata_flag(uuid) from public;
grant execute on function public.foundry_clear_metadata_flag(uuid) to authenticated;

-- Admin only: soft delete and restore. ONE function, because they are one
-- decision with a boolean in it and two would be two places to keep the
-- record-keeping honest.
--
-- Nothing is destroyed. The rows stay, the bundle stays in storage, and
-- restoring is this function with p_hidden = false.
create or replace function public.foundry_set_app_hidden(
	p_app_id uuid,
	p_hidden boolean,
	p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_app public.student_apps%rowtype;
	v_reason text := nullif(public._foundry_norm(p_reason), '');
	v_hidden_at timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only an administrator can hide or restore an app.';
	end if;
	if p_hidden is null then
		raise exception 'Hide it or restore it?';
	end if;

	select a.* into v_app from public.student_apps a where a.id = p_app_id for update;
	if not found then
		raise exception 'That app does not exist.';
	end if;

	if p_hidden and v_app.hidden_at is not null then
		raise exception 'That app is already hidden.';
	end if;
	if not p_hidden and v_app.hidden_at is null then
		raise exception 'That app is not hidden.';
	end if;

	update public.student_apps a set
		hidden_at = case when p_hidden then now() else null end,
		hidden_by = case when p_hidden then v_uid else null end,
		hidden_reason = case when p_hidden then v_reason else null end,
		updated_at = now()
	where a.id = p_app_id
	returning a.hidden_at into v_hidden_at;

	return jsonb_build_object('ok', true, 'app_id', p_app_id, 'hidden_at', v_hidden_at);
end;
$$;

revoke all on function public.foundry_set_app_hidden(uuid, boolean, text) from public;
grant execute on function public.foundry_set_app_hidden(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Read RPCs.
--
-- Both declare their population through _foundry_app_in_population and through
-- nothing else.
--
-- NEITHER CARRIES AN EMAIL. The owner is a uuid plus the display and full name
-- already on their profile.
-- ---------------------------------------------------------------------------

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
	published_version_id uuid,
	published_ordinal integer,
	version_count integer,
	submitted_version_id uuid,
	metadata_flagged_at timestamptz,
	hidden_at timestamptz,
	created_at timestamptz,
	updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
	select
		a.id, a.slug, a.title, a.tagline, a.description, a.cover_path, a.build_notes,
		a.owner, p.display_name, p.full_name,
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
		a.metadata_flagged_at, a.hidden_at, a.created_at, a.updated_at
	from public.student_apps a
	left join public.profiles p on p.id = a.owner
	where (select auth.uid()) is not null
		and public._foundry_app_in_population(
			a.owner, a.hidden_at, a.published_version_id,
			p_include_hidden, p_include_unpublished
		)
		and (p_owner is null or a.owner = p_owner)
	order by a.updated_at desc, a.created_at desc;
$$;

revoke all on function public.foundry_list_apps(uuid, boolean, boolean) from public;
grant execute on function public.foundry_list_apps(uuid, boolean, boolean) to authenticated;

-- One app by slug, with the versions the caller may see.
--
-- SAME LIVENESS RULE AS THE LIST, through the same predicate: an app the list
-- would not have shown this caller answers `null` here, which is the 404 the
-- route turns it into. "Not found" and "not yours" are the same answer, so a
-- slug cannot be probed.
--
-- THE VERSIONS ARRAY IS THE OWNER'S AND THE ADMIN'S. Everybody else gets the
-- published version alone -- the same narrowing foundry_can_read_version
-- applies to a direct select, restated here because this function is a definer
-- and therefore does not evaluate that policy.
create or replace function public.foundry_get_app(
	p_slug text,
	p_include_hidden boolean default false,
	p_include_unpublished boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
		'published_version_id', v_app.published_version_id,
		'metadata_flagged_at', v_app.metadata_flagged_at,
		'hidden_at', v_app.hidden_at,
		'created_at', v_app.created_at,
		'updated_at', v_app.updated_at,
		'versions', v_versions
	);
end;
$$;

revoke all on function public.foundry_get_app(text, boolean, boolean) from public;
grant execute on function public.foundry_get_app(text, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Storage.
--
-- The 0020 avatars shape: one policy per verb, each pinned to the bucket and
-- to (storage.foldername(name))[1] = the caller's own uid.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('foundry-uploads', 'foundry-uploads', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public)
values ('foundry-bundles', 'foundry-bundles', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public)
values ('foundry-covers', 'foundry-covers', true)
on conflict (id) do update set public = true;

-- foundry-uploads: WRITE ONLY, own folder. There is deliberately NO select
-- policy -- a raw zip is an input to the extraction function, not an artifact
-- anybody reads back, and the extracted bundle is what serves.
drop policy if exists "foundry uploads insert own folder" on storage.objects;
create policy "foundry uploads insert own folder"
	on storage.objects
	for insert
	to authenticated
	with check (
		bucket_id = 'foundry-uploads'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	);

drop policy if exists "foundry uploads update own folder" on storage.objects;
create policy "foundry uploads update own folder"
	on storage.objects
	for update
	to authenticated
	using (
		bucket_id = 'foundry-uploads'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	)
	with check (
		bucket_id = 'foundry-uploads'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	);

drop policy if exists "foundry uploads delete own folder" on storage.objects;
create policy "foundry uploads delete own folder"
	on storage.objects
	for delete
	to authenticated
	using (
		bucket_id = 'foundry-uploads'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	);

-- foundry-bundles: NO POLICY AT ALL, and that is the mechanism rather than an
-- omission. storage.objects has RLS enabled, so a bucket with no policy naming
-- it denies every authenticated and anon request -- read and write alike -- by
-- default. service_role bypasses RLS, so the extraction function writes and
-- the proxy reads, and nothing else can do either.
--
-- Any policy added here later, for any reason, is what opens it. The drops
-- below exist so a re-paste of this file cannot leave a policy behind that an
-- earlier draft created.
drop policy if exists "foundry bundles read" on storage.objects;
drop policy if exists "foundry bundles write" on storage.objects;
drop policy if exists "foundry bundles own folder" on storage.objects;

-- foundry-covers: public read (inherent to a public bucket, plus the explicit
-- select policy the 0020 avatars bucket also carries so a signed request
-- resolves the same way), owner writes own folder.
drop policy if exists "foundry covers public read" on storage.objects;
create policy "foundry covers public read"
	on storage.objects
	for select
	to public
	using (bucket_id = 'foundry-covers');

drop policy if exists "foundry covers insert own folder" on storage.objects;
create policy "foundry covers insert own folder"
	on storage.objects
	for insert
	to authenticated
	with check (
		bucket_id = 'foundry-covers'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	);

drop policy if exists "foundry covers update own folder" on storage.objects;
create policy "foundry covers update own folder"
	on storage.objects
	for update
	to authenticated
	using (
		bucket_id = 'foundry-covers'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	)
	with check (
		bucket_id = 'foundry-covers'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	);

drop policy if exists "foundry covers delete own folder" on storage.objects;
create policy "foundry covers delete own folder"
	on storage.objects
	for delete
	to authenticated
	using (
		bucket_id = 'foundry-covers'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	);

-- ---------------------------------------------------------------------------
-- WHAT UNDOES THIS MIGRATION.
--
-- Everything here is new and nothing existing is redefined, so the undo is a
-- drop -- and it takes the DATA with it, because there is no earlier state of
-- these tables to fall back to. Run it only before anyone has published.
--
--   drop function if exists public.foundry_get_app(text, boolean, boolean);
--   drop function if exists public.foundry_list_apps(uuid, boolean, boolean);
--   drop function if exists public.foundry_set_app_hidden(uuid, boolean, text);
--   drop function if exists public.foundry_clear_metadata_flag(uuid);
--   drop function if exists public.foundry_set_published_version(uuid, uuid);
--   drop function if exists public.foundry_review_version(uuid, text, text, text);
--   drop function if exists public.foundry_withdraw_version(uuid);
--   drop function if exists public.foundry_submit_version(uuid);
--   drop function if exists public.foundry_create_version(uuid, text, jsonb, bigint, integer);
--   drop function if exists public.foundry_update_app_metadata(uuid, text, text);
--   drop function if exists public.foundry_create_app(text, text, text, text, text);
--   drop table if exists public.student_app_files;
--   -- the app's key into versions has to go before the versions table can:
--   alter table public.student_apps
--     drop constraint if exists student_apps_published_version_fkey;
--   drop table if exists public.student_app_versions;
--   drop table if exists public.student_apps;
--   drop function if exists public.foundry_can_read_version(uuid);
--   drop function if exists public.foundry_can_read_app(uuid);
--   drop function if exists public._foundry_app_in_population(uuid, timestamptz, uuid, boolean, boolean);
--   drop function if exists public._foundry_version_status_check();
--   drop function if exists public._foundry_published_version_check();
--   drop function if exists public._foundry_slug_ok(text);
--   drop function if exists public._foundry_norm(text);
--   drop policy if exists "foundry uploads insert own folder" on storage.objects;
--   drop policy if exists "foundry uploads update own folder" on storage.objects;
--   drop policy if exists "foundry uploads delete own folder" on storage.objects;
--   drop policy if exists "foundry covers public read" on storage.objects;
--   drop policy if exists "foundry covers insert own folder" on storage.objects;
--   drop policy if exists "foundry covers update own folder" on storage.objects;
--   drop policy if exists "foundry covers delete own folder" on storage.objects;
--   delete from storage.buckets where id in ('foundry-uploads','foundry-bundles','foundry-covers');
--
-- Dropping the two tables also drops their triggers and policies with them.
-- The bucket deletes REFUSE while any object remains under them, which is the
-- behaviour you want: empty them deliberately first, or leave them in place.
-- Nothing in this file touches _classroom_deck_path_ok, so the undo must NOT
-- drop it -- 0101's decks still depend on it.
-- ---------------------------------------------------------------------------

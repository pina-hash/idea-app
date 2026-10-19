-- 0274_armory_part_numbers.sql
--
-- IDEA ARMORY: THE PART NUMBER REGISTRY AND THE COTS LIBRARY (ledger 0405,
-- decision 41, "Part numbers, as answered": Mr. Pina chose scheme A on
-- 2026-10-18). The SolidWorks add-in (a later lane in pina-hash/idea-armory)
-- asks this file for a number; the website lists what was handed out.
--
-- THE RULE.
--   A made part or assembly is PREFIX-YY-SS-AAPP: the team (5669) or the
--   course (IDEA100), the two-digit season, a two-letter subsystem code, a
--   two-digit assembly and a two-digit part. An assembly ends 00. A revision
--   is a letter BESIDE the number, never in it. A number is assigned once and
--   never reused, even after the file or the whole project is deleted. COTS
--   parts get no team number: vendor prefix plus the vendor's own number plus
--   a short description, in one shared library nobody edits in place.
--
-- WHAT IS HERE, AND WHAT IS NOT.
--   1. armory_part_number_problem(text) is the ONE SQL statement of the
--      format. It answers null for a well-formed number and otherwise the
--      sentence a person reads. src/lib/armory/part-numbers.ts is its mirror
--      and tests/armory-part-numbers-parity.test.ts holds the two to one
--      corpus, sentence for sentence. armory_cots_problem(text, text) is the
--      same for a COTS number.
--   2. armory_part_subsystems: the subsystem codes, DATA a mentor or a site
--      admin extends (never a CHECK constraint), seeded with the nine of the
--      decision. A code is retired, never deleted.
--   3. armory_projects.part_prefix: the team or course a project's numbers
--      start with, 5669 unless a mentor sets it. The season comes from
--      armory_projects.season (0231; null since 0232, which numbers by the
--      Los Angeles year, the rule 0232 gave the old allocator).
--   4. armory_part_numbers: the registry. One row per number ever handed
--      out, unique on the number itself across every project, so two projects
--      sharing a prefix and a season can never hand out one number twice.
--      Nothing deletes a row: a trigger refuses DELETE outright, no client
--      role holds a write or TRUNCATE grant, and the foreign keys to the file
--      and the project are ON DELETE SET NULL, so a deleted file or a purged
--      project leaves the number standing (a purge clears who took it and the
--      file's name, the way armory_purged_projects keeps no member address).
--      The next number is the highest ever taken plus one, never the first
--      gap, so a number is never handed out twice.
--   5. armory_part_number_take: the one door that hands out a number,
--      serialized per (prefix, season, subsystem) after the project row
--      (CLAUDE.md, "EVERY ARMORY WRITER TAKES ITS PROJECT ROW FIRST"), and
--      replayable through armory_replay like every other Armory write.
--      armory_part_number_describe sets the file, the description, the
--      revision (forward only) and "made from" (a COTS number in the library).
--   6. armory_cots_parts: the COTS library every project reads. A mentor of
--      any project or a site admin adds and corrects rows (the description,
--      the link, the model file); the vendor and the vendor's number never
--      change, and a row is retired, never deleted.
--   7. Reads for the website: armory_project_part_numbers and
--      armory_cots_list.
--
--   The 0231 allocator (armory_allocate_part_number, the numeric
--   5669-YY-SSNN pattern) is left exactly as it is: nothing on the website
--   calls it and the Windows app may, so dropping it is not this file's to
--   do. It writes armory_part_number_allocations, a different table; the two
--   never share a number because the old pattern has no subsystem letters.
--
--   No change-feed row is written for a number. The Windows app reads that
--   feed to sync files and nothing records how it treats a kind it has never
--   seen, so a new kind there is a decision for the add-in lane.
--
-- ROLES ARE THE EXISTING ONES. Taking a number is armory_is_member (any
-- member, a student included) or is_admin(); setting a project's prefix is a
-- mentor of it or a site admin (armory_require_role, the 0233 shape); the
-- library and the subsystem list are a mentor of ANY project or a site admin
-- (armory_parts_curator, which reads the same armory_members.role). Every
-- write is SECURITY DEFINER, takes no identity parameter and re-checks the
-- caller; every refusal is a raise with a SQLSTATE and a JSON detail carrying
-- a reason (the Armory convention: never an {ok:false} return, never 54000).
--
-- UNDO, before any client depends on it (a person's paste): drop the
-- functions this file creates, the tables armory_part_numbers,
-- armory_cots_parts and armory_part_subsystems, and the column
-- armory_projects.part_prefix. Numbers already handed out are lost with the
-- table, which is the reason not to undo it once anybody has taken one.

-- ---------------------------------------------------------------------------
-- 1. The format, first, so the object the deploy probe checks is new here.
-- ---------------------------------------------------------------------------

create or replace function public.armory_part_number_problem(p_number text) returns text
language plpgsql immutable set search_path = '' as $ap$
declare s text; g text[];
begin
	-- Spaces only at the ends (btrim), the same as the website's mirror; a tab is malformed in both.
	s := btrim(coalesce(p_number, ''));
	if s = '' then return 'Enter a part number, such as 5669-27-DT-0104.'; end if;
	if s !~ '^[ -~]+$' then
		return 'A part number is four groups joined by dashes: the team or course, the season, the subsystem, then the assembly and part, such as 5669-27-DT-0104.';
	end if;
	s := upper(s);
	if s ~ '^[A-Z0-9]{2,10}-[0-9]{2}-[A-Z]{2}-[0-9]{4}[- ]?(REV\.? ?)?[A-Z]{1,2}$' then
		return 'A revision letter goes beside the number, never in it: write 5669-27-DT-0104 and Rev B separately.';
	end if;
	g := string_to_array(s, '-');
	if cardinality(g) <> 4 then
		return 'A part number is four groups joined by dashes: the team or course, the season, the subsystem, then the assembly and part, such as 5669-27-DT-0104.';
	end if;
	if g[1] !~ '^[A-Z0-9]{2,10}$' then
		return 'The first group is the team number or the course, two to ten letters or digits, such as 5669 or IDEA100.';
	end if;
	if g[2] !~ '^[0-9]{2}$' then return 'The second group is the season in two digits, such as 27.'; end if;
	if g[3] !~ '^[A-Z]{2}$' then return 'The third group is the two-letter subsystem code, such as DT.'; end if;
	if g[4] !~ '^[0-9]{4}$' then
		return 'The last group is four digits, a two-digit assembly then a two-digit part, such as 0104.';
	end if;
	return null;
end $ap$;

create or replace function public.armory_cots_problem(p_vendor text, p_vendor_part text) returns text
language plpgsql immutable set search_path = '' as $ap$
declare v text := btrim(coalesce(p_vendor, '')); p text := btrim(coalesce(p_vendor_part, ''));
begin
	if v = '' then return 'Enter the vendor prefix, such as WCP, REV, AM or HW.'; end if;
	if upper(v) !~ '^[A-Z][A-Z0-9]{0,7}$' or v !~ '^[ -~]+$' then
		return 'The vendor prefix is one to eight letters or digits, starting with a letter, such as WCP or REV.';
	end if;
	if p = '' then return 'Enter the vendor''s own part number, such as 21-1650.'; end if;
	if p !~ '^[A-Za-z0-9][A-Za-z0-9./#-]{0,47}$' then
		return 'The vendor''s part number is up to 48 letters, digits, dots, dashes, slashes or #, with no spaces.';
	end if;
	return null;
end $ap$;

-- ---------------------------------------------------------------------------
-- 2. The subsystem codes: data, seeded once.
-- ---------------------------------------------------------------------------

create table if not exists public.armory_part_subsystems (
	code text primary key check (code ~ '^[A-Z]{2}$'),
	name text not null check (length(btrim(name)) between 1 and 40),
	sort_order smallint not null default 100,
	retired_at timestamptz,
	created_by text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

do $ap$
begin
	insert into public.armory_part_subsystems (code, name, sort_order) values
		('DT', 'Drivetrain', 10), ('SH', 'Shooter', 20), ('IN', 'Intake', 30),
		('EL', 'Elevator', 40), ('AR', 'Arm', 50), ('CL', 'Climber', 60),
		('FR', 'Frame', 70), ('EE', 'Electrical', 80), ('MS', 'Miscellaneous', 90)
	on conflict (code) do nothing;
end $ap$;

-- ---------------------------------------------------------------------------
-- 3. A project's prefix.
-- ---------------------------------------------------------------------------

alter table public.armory_projects
	add column if not exists part_prefix text not null default '5669';

do $ap$
begin
	if not exists (
		select 1 from pg_catalog.pg_constraint
		where conname = 'armory_projects_part_prefix_shape' and conrelid = 'public.armory_projects'::regclass
	) then
		alter table public.armory_projects add constraint armory_projects_part_prefix_shape
			check (part_prefix ~ '^[A-Z0-9]{2,10}$');
	end if;
end $ap$;

-- ---------------------------------------------------------------------------
-- 4. The registry.
-- ---------------------------------------------------------------------------

create table if not exists public.armory_part_numbers (
	id uuid primary key default gen_random_uuid(),
	part_number text not null unique,
	prefix text not null,
	season_yy smallint not null check (season_yy between 0 and 99),
	subsystem text not null references public.armory_part_subsystems (code),
	assembly smallint not null check (assembly between 1 and 99),
	part smallint not null check (part between 0 and 99),
	project_id uuid references public.armory_projects (id) on delete set null,
	file_id uuid references public.armory_files (id) on delete set null,
	file_name text check (file_name is null or length(file_name) <= 260),
	description text not null default '' check (length(description) <= 200),
	revision text not null default 'A' check (revision ~ '^[A-Z]{1,2}$'),
	made_from text check (made_from is null or length(made_from) <= 80),
	assigned_by text,
	assigned_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (prefix, season_yy, subsystem, assembly, part),
	check (part_number = prefix || '-' || lpad(season_yy::text, 2, '0') || '-' || subsystem || '-'
		|| lpad(assembly::text, 2, '0') || lpad(part::text, 2, '0')),
	check (public.armory_part_number_problem(part_number) is null)
);

create index if not exists armory_part_numbers_project_idx on public.armory_part_numbers (project_id);
create index if not exists armory_part_numbers_file_idx on public.armory_part_numbers (file_id);

-- A number is never removed and never renumbered. Clearing the file, the
-- project and the purge-time fields is the only change the keys may make.
create or replace function public._armory_part_number_guard() returns trigger
language plpgsql set search_path = '' as $ap$
begin
	if tg_op = 'DELETE' then
		raise exception 'A part number is assigned once and never removed.' using errcode = '55000',
			detail = jsonb_build_object('reason', 'never_removed', 'part_number', old.part_number)::text;
	end if;
	if new.part_number is distinct from old.part_number or new.prefix is distinct from old.prefix
		or new.season_yy is distinct from old.season_yy or new.subsystem is distinct from old.subsystem
		or new.assembly is distinct from old.assembly or new.part is distinct from old.part
		or new.assigned_at is distinct from old.assigned_at
		or (old.project_id is not null and new.project_id is distinct from old.project_id and new.project_id is not null) then
		raise exception 'A part number never changes once assigned.' using errcode = '55000',
			detail = jsonb_build_object('reason', 'never_renumbered', 'part_number', old.part_number)::text;
	end if;
	-- The project was deleted forever: keep the number, drop who took it and the file's name.
	if old.project_id is not null and new.project_id is null then
		new.assigned_by := null;
		new.file_name := null;
		new.description := '';
		new.made_from := null;
		new.file_id := null;
	end if;
	return new;
end $ap$;

drop trigger if exists armory_part_numbers_guard on public.armory_part_numbers;
create trigger armory_part_numbers_guard before update or delete on public.armory_part_numbers
	for each row execute function public._armory_part_number_guard();

-- ---------------------------------------------------------------------------
-- 5. The COTS library.
-- ---------------------------------------------------------------------------

create table if not exists public.armory_cots_parts (
	id uuid primary key default gen_random_uuid(),
	vendor text not null,
	vendor_part text not null,
	cots_number text generated always as (vendor || '-' || vendor_part) stored,
	description text not null check (length(btrim(description)) between 1 and 120),
	link text check (link is null or (link ~ '^https://[^[:space:]]+$' and length(link) <= 500)),
	file_id uuid references public.armory_files (id) on delete set null,
	retired_at timestamptz,
	added_by text not null,
	added_at timestamptz not null default now(),
	corrected_by text,
	corrected_at timestamptz,
	check (public.armory_cots_problem(vendor, vendor_part) is null and vendor = upper(vendor))
);

create unique index if not exists armory_cots_parts_number_key on public.armory_cots_parts (upper(cots_number));

create or replace function public._armory_cots_guard() returns trigger
language plpgsql set search_path = '' as $ap$
begin
	if tg_op = 'DELETE' then
		raise exception 'A COTS part is retired, never removed.' using errcode = '55000',
			detail = jsonb_build_object('reason', 'never_removed')::text;
	end if;
	if new.vendor is distinct from old.vendor or new.vendor_part is distinct from old.vendor_part
		or new.added_by is distinct from old.added_by or new.added_at is distinct from old.added_at then
		raise exception 'A COTS part keeps its vendor and number; retire it and add the right one.' using errcode = '55000',
			detail = jsonb_build_object('reason', 'never_renumbered')::text;
	end if;
	return new;
end $ap$;

drop trigger if exists armory_cots_parts_guard on public.armory_cots_parts;
create trigger armory_cots_parts_guard before update or delete on public.armory_cots_parts
	for each row execute function public._armory_cots_guard();

-- ---------------------------------------------------------------------------
-- 6. Who may do what: the existing roles, read from armory_members.
-- ---------------------------------------------------------------------------

-- A mentor of any project, or a site admin: the library and the subsystem list.
create or replace function public.armory_parts_curator() returns boolean
language sql stable security definer set search_path = '' as $ap$
	select coalesce(public.is_admin(), false)
		or exists (
			select 1 from public.armory_members m
			where m.email = public.current_user_email() and m.email <> '' and m.role = 'mentor')
$ap$;

-- Anybody on an Armory project, or a site admin, reads the library. Named in RLS.
create or replace function public.armory_parts_library_reader() returns boolean
language sql stable security definer set search_path = '' as $ap$
	select coalesce(public.is_admin(), false)
		or exists (
			select 1 from public.armory_members m
			where m.email = public.current_user_email() and m.email <> '')
$ap$;

create or replace function public._armory_parts_refuse(p_message text, p_code text, p_reason text, p_extra jsonb default '{}'::jsonb)
returns void
language plpgsql set search_path = '' as $ap$
begin
	raise exception '%', p_message using errcode = p_code,
		detail = (jsonb_build_object('reason', p_reason) || coalesce(p_extra, '{}'::jsonb))::text;
end $ap$;

-- One row of the registry as the website and the add-in read it. The person
-- who took it is a NAME (0233's _armory_person: the chosen display name, else
-- the full name); only the project read adds the address, and only for the
-- people who see addresses on the Team view (a mentor or a site admin).
create or replace function public._armory_part_number_json(p public.armory_part_numbers) returns jsonb
language sql stable security definer set search_path = '' as $ap$
	select jsonb_build_object(
		'id', p.id, 'part_number', p.part_number, 'prefix', p.prefix, 'season_yy', p.season_yy,
		'subsystem', p.subsystem, 'assembly', p.assembly, 'part', p.part,
		'kind', case when p.part = 0 then 'assembly' else 'part' end,
		'revision', p.revision, 'description', p.description, 'made_from', p.made_from,
		'project_id', p.project_id, 'file_id', p.file_id,
		'file_name', coalesce(f.name, p.file_name), 'file_folder', f.folder,
		'file_deleted', f.deleted_at is not null and f.id is not null,
		-- A name, never the address: a student reads this (the Team view's rule).
		'assigned_name', public._armory_person(p.assigned_by)->>'name', 'assigned_at', p.assigned_at)
	from (select 1) one
	left join public.armory_files f on f.id = p.file_id
$ap$;

-- ---------------------------------------------------------------------------
-- 7. Taking a number.
-- ---------------------------------------------------------------------------

create or replace function public.armory_part_number_take(
	p_project uuid, p_subsystem text, p_assembly int, p_file uuid, p_file_name text, p_description text, p_operation uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $ap$
declare
	e text := public.armory_current_email(); r jsonb; proj public.armory_projects; sub public.armory_part_subsystems;
	f public.armory_files; ss text; yy int; a int; n int; num text; fname text; descr text; taken text; rec public.armory_part_numbers;
begin
	r := public.armory_replay(p_operation, 'armory_part_number_take');
	if r is not null then return r; end if;
	-- The project row first, before any other lock (CLAUDE.md, the Armory lock order).
	select * into proj from public.armory_projects where id = p_project for key share;
	if not found or not (public.armory_is_member(p_project) or coalesce(public.is_admin(), false)) then
		perform public._armory_parts_refuse('not a project member', '42501', 'not_member');
	end if;
	if proj.archived_at is not null then
		perform public._armory_parts_refuse('This project is archived, so it takes no new part numbers.', '55000', 'archived');
	end if;
	ss := upper(btrim(coalesce(p_subsystem, '')));
	select * into sub from public.armory_part_subsystems where code = ss;
	if not found then
		perform public._armory_parts_refuse(
			format('There is no subsystem code %s. The codes are %s.', coalesce(nullif(ss, ''), '(none)'),
				(select string_agg(code, ', ' order by sort_order, code) from public.armory_part_subsystems where retired_at is null)),
			'22023', 'unknown_subsystem');
	end if;
	if sub.retired_at is not null then
		perform public._armory_parts_refuse(
			format('The subsystem %s (%s) is retired. Pick another, or ask a mentor to bring it back.', sub.code, sub.name),
			'22023', 'retired_subsystem');
	end if;
	if p_assembly is not null and p_assembly not between 1 and 99 then
		perform public._armory_parts_refuse('An assembly is a number from 1 to 99.', '22023', 'bad_assembly');
	end if;
	fname := nullif(btrim(coalesce(p_file_name, '')), '');
	if p_file is not null then
		select * into f from public.armory_files where id = p_file;
		if not found or f.project_id <> p_project then
			perform public._armory_parts_refuse('That file is not in this project.', '22023', 'file_not_in_project');
		end if;
		select part_number into taken from public.armory_part_numbers where file_id = p_file limit 1;
		if taken is not null then
			perform public._armory_parts_refuse(format('%s already has the number %s.', f.name, taken), '23505', 'file_numbered',
				jsonb_build_object('part_number', taken));
		end if;
		fname := coalesce(fname, f.name);
	end if;
	if fname is not null and length(fname) > 260 then
		perform public._armory_parts_refuse('A file name is at most 260 characters.', '22023', 'too_long');
	end if;
	descr := btrim(coalesce(p_description, ''));
	if length(descr) > 200 then
		perform public._armory_parts_refuse('A description is at most 200 characters.', '22023', 'too_long');
	end if;
	yy := coalesce(proj.season::int, extract(year from (now() at time zone 'America/Los_Angeles'))::int) % 100;
	-- One number space per prefix, season and subsystem, across every project that shares them.
	perform pg_advisory_xact_lock(hashtextextended('armory_part_number:' || proj.part_prefix || '-' || yy || '-' || ss, 0));
	if p_assembly is null then
		-- A new assembly: the highest assembly ever taken here, plus one. Never a gap.
		select coalesce(max(assembly), 0) + 1 into a from public.armory_part_numbers
		where prefix = proj.part_prefix and season_yy = yy and subsystem = ss;
		n := 0;
		if a > 99 then
			perform public._armory_parts_refuse(format('Subsystem %s has used all 99 assembly numbers this season.', ss), '22023', 'full');
		end if;
	else
		a := p_assembly;
		if not exists (select 1 from public.armory_part_numbers
			where prefix = proj.part_prefix and season_yy = yy and subsystem = ss and assembly = a and part = 0 and project_id = p_project) then
			perform public._armory_parts_refuse(
				format('Assembly %s has no number yet in subsystem %s on this project. Take the assembly''s number first.', lpad(a::text, 2, '0'), ss),
				'22023', 'no_assembly');
		end if;
		select coalesce(max(part), 0) + 1 into n from public.armory_part_numbers
		where prefix = proj.part_prefix and season_yy = yy and subsystem = ss and assembly = a;
		if n > 99 then
			perform public._armory_parts_refuse(format('Assembly %s in %s has used all 99 part numbers.', lpad(a::text, 2, '0'), ss), '22023', 'full');
		end if;
	end if;
	num := proj.part_prefix || '-' || lpad(yy::text, 2, '0') || '-' || ss || '-' || lpad(a::text, 2, '0') || lpad(n::text, 2, '0');
	insert into public.armory_part_numbers (part_number, prefix, season_yy, subsystem, assembly, part, project_id, file_id, file_name, description, assigned_by)
	values (num, proj.part_prefix, yy, ss, a, n, p_project, p_file, fname, descr, e)
	returning * into rec;
	return public.armory_remember(p_operation, 'armory_part_number_take', public._armory_part_number_json(rec));
end $ap$;

-- ---------------------------------------------------------------------------
-- 8. Describing a number: its file, words, revision and what it is made from.
-- Null leaves a field as it is; an empty string clears the words or made from.
-- ---------------------------------------------------------------------------

create or replace function public.armory_part_number_describe(
	p_part_number text, p_file uuid, p_file_name text, p_description text, p_revision text, p_made_from text, p_operation uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $ap$
declare
	r jsonb; problem text; num text; pid uuid; proj public.armory_projects; rec public.armory_part_numbers;
	f public.armory_files; taken text; rev text; mf text; descr text; fname text;
begin
	r := public.armory_replay(p_operation, 'armory_part_number_describe');
	if r is not null then return r; end if;
	perform public.armory_current_email();
	problem := public.armory_part_number_problem(p_part_number);
	if problem is not null then perform public._armory_parts_refuse(problem, '22023', 'malformed'); end if;
	num := upper(btrim(p_part_number));
	select project_id into pid from public.armory_part_numbers where part_number = num;
	if pid is not null then
		-- The project row first, then the number's own row.
		select * into proj from public.armory_projects where id = pid for key share;
	end if;
	if pid is null or not (public.armory_is_member(pid) or coalesce(public.is_admin(), false)) then
		perform public._armory_parts_refuse(format('There is no part number %s on a project you are on.', num), 'P0002', 'not_found');
	end if;
	if proj.archived_at is not null then
		perform public._armory_parts_refuse('This project is archived, so its part numbers do not change.', '55000', 'archived');
	end if;
	select * into rec from public.armory_part_numbers where part_number = num for update;
	if p_file is not null and p_file is distinct from rec.file_id then
		select * into f from public.armory_files where id = p_file;
		if not found or f.project_id <> pid then
			perform public._armory_parts_refuse('That file is not in this project.', '22023', 'file_not_in_project');
		end if;
		select part_number into taken from public.armory_part_numbers where file_id = p_file and id <> rec.id limit 1;
		if taken is not null then
			perform public._armory_parts_refuse(format('%s already has the number %s.', f.name, taken), '23505', 'file_numbered',
				jsonb_build_object('part_number', taken));
		end if;
		rec.file_id := p_file;
		rec.file_name := f.name;
	end if;
	fname := nullif(btrim(coalesce(p_file_name, '')), '');
	if fname is not null then
		if length(fname) > 260 then perform public._armory_parts_refuse('A file name is at most 260 characters.', '22023', 'too_long'); end if;
		rec.file_name := fname;
	end if;
	if p_description is not null then
		descr := btrim(p_description);
		if length(descr) > 200 then perform public._armory_parts_refuse('A description is at most 200 characters.', '22023', 'too_long'); end if;
		rec.description := descr;
	end if;
	if p_revision is not null then
		rev := upper(btrim(p_revision));
		if rev ~ '^REV\.? ?' then rev := regexp_replace(rev, '^REV\.? ?', ''); end if;
		if rev !~ '^[A-Z]{1,2}$' then
			perform public._armory_parts_refuse('A revision is one or two capital letters, such as B.', '22023', 'bad_revision');
		end if;
		-- Forward only: A, B, ..., Z, AA, AB, ...
		if (length(rev), rev) < (length(rec.revision), rec.revision) then
			perform public._armory_parts_refuse(format('A revision only moves forward; %s is at Rev %s.', num, rec.revision), '22023', 'revision_back');
		end if;
		rec.revision := rev;
	end if;
	if p_made_from is not null then
		mf := btrim(p_made_from);
		if mf = '' then
			rec.made_from := null;
		else
			select cots_number into mf from public.armory_cots_parts where upper(cots_number) = upper(mf);
			if mf is null then
				perform public._armory_parts_refuse(
					format('There is no COTS part %s in the library. Add it there first, or leave Made from empty.', btrim(p_made_from)),
					'22023', 'unknown_cots');
			end if;
			rec.made_from := mf;
		end if;
	end if;
	update public.armory_part_numbers
	set file_id = rec.file_id, file_name = rec.file_name, description = rec.description, revision = rec.revision,
		made_from = rec.made_from, updated_at = now()
	where id = rec.id
	returning * into rec;
	return public.armory_remember(p_operation, 'armory_part_number_describe', public._armory_part_number_json(rec));
end $ap$;

-- ---------------------------------------------------------------------------
-- 9. A project's prefix: its mentor, or a site admin (the 0233 shape).
-- ---------------------------------------------------------------------------

create or replace function public.armory_set_part_prefix(p_project uuid, p_prefix text, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $ap$
declare r jsonb; v text; old text; answer boolean;
begin
	r := public.armory_replay(p_operation, 'armory_set_part_prefix');
	if r is not null then return (r->>'result')::boolean; end if;
	if coalesce(public.is_admin(), false) then
		if not exists (select 1 from public.armory_projects where id = p_project) then
			perform public._armory_parts_refuse('project not found', 'P0002', 'not_found');
		end if;
	else
		perform public.armory_require_role(p_project, array['mentor']::public.armory_member_role[], 'only a mentor may set the part number prefix');
	end if;
	v := upper(btrim(coalesce(p_prefix, '')));
	if v !~ '^[A-Z0-9]{2,10}$' then
		perform public._armory_parts_refuse(
			'The prefix is the team number or the course, two to ten letters or digits, such as 5669 or IDEA100.', '22023', 'bad_prefix');
	end if;
	select part_prefix into old from public.armory_projects where id = p_project for update;
	answer := old <> v;
	if answer then update public.armory_projects set part_prefix = v where id = p_project; end if;
	perform public.armory_remember(p_operation, 'armory_set_part_prefix', jsonb_build_object('result', answer));
	return answer;
end $ap$;

-- ---------------------------------------------------------------------------
-- 10. The subsystem list: a curator adds, renames, retires and restores.
-- ---------------------------------------------------------------------------

create or replace function public.armory_part_subsystem_save(p_code text, p_name text, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $ap$
declare e text := public.armory_current_email(); r jsonb; c text; nm text; old text; answer boolean;
begin
	r := public.armory_replay(p_operation, 'armory_part_subsystem_save');
	if r is not null then return (r->>'result')::boolean; end if;
	if not public.armory_parts_curator() then
		perform public._armory_parts_refuse('only a mentor or a site admin may change the subsystem codes', '42501', 'not_curator');
	end if;
	c := upper(btrim(coalesce(p_code, '')));
	if c !~ '^[A-Z]{2}$' then perform public._armory_parts_refuse('A subsystem code is two letters, such as DT.', '22023', 'bad_code'); end if;
	nm := btrim(coalesce(p_name, ''));
	if length(nm) not between 1 and 40 then
		perform public._armory_parts_refuse('Name the subsystem in up to 40 characters, such as Drivetrain.', '22023', 'bad_name');
	end if;
	perform pg_advisory_xact_lock(hashtextextended('armory_part_subsystem:' || c, 0));
	select name into old from public.armory_part_subsystems where code = c for update;
	if not found then
		insert into public.armory_part_subsystems (code, name, sort_order, created_by)
		values (c, nm, coalesce((select max(sort_order) from public.armory_part_subsystems), 0) + 10, e);
		answer := true;
	else
		answer := old <> nm;
		if answer then update public.armory_part_subsystems set name = nm, updated_at = now() where code = c; end if;
	end if;
	perform public.armory_remember(p_operation, 'armory_part_subsystem_save', jsonb_build_object('result', answer));
	return answer;
end $ap$;

create or replace function public.armory_part_subsystem_retire(p_code text, p_retired boolean, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $ap$
declare r jsonb; c text; was timestamptz; answer boolean;
begin
	r := public.armory_replay(p_operation, 'armory_part_subsystem_retire');
	if r is not null then return (r->>'result')::boolean; end if;
	if not public.armory_parts_curator() then
		perform public._armory_parts_refuse('only a mentor or a site admin may change the subsystem codes', '42501', 'not_curator');
	end if;
	if p_retired is null then perform public._armory_parts_refuse('retired is true or false', '22023', 'bad_flag'); end if;
	c := upper(btrim(coalesce(p_code, '')));
	select retired_at into was from public.armory_part_subsystems where code = c for update;
	if not found then perform public._armory_parts_refuse(format('There is no subsystem code %s.', c), 'P0002', 'not_found'); end if;
	answer := (was is not null) <> p_retired;
	if answer then
		update public.armory_part_subsystems set retired_at = case when p_retired then now() else null end, updated_at = now() where code = c;
	end if;
	perform public.armory_remember(p_operation, 'armory_part_subsystem_retire', jsonb_build_object('result', answer));
	return answer;
end $ap$;

-- ---------------------------------------------------------------------------
-- 11. The COTS library's writes.
-- ---------------------------------------------------------------------------

create or replace function public.armory_cots_add(
	p_vendor text, p_vendor_part text, p_description text, p_link text, p_file uuid, p_operation uuid)
returns uuid
language plpgsql security definer set search_path = '' as $ap$
declare e text := public.armory_current_email(); r jsonb; problem text; v text; p text; d text; l text; fp uuid; existing public.armory_cots_parts; v_id uuid;
begin
	r := public.armory_replay(p_operation, 'armory_cots_add');
	if r is not null then return (r->>'id')::uuid; end if;
	if not public.armory_parts_curator() then
		perform public._armory_parts_refuse('only a mentor or a site admin may add to the COTS library', '42501', 'not_curator');
	end if;
	problem := public.armory_cots_problem(p_vendor, p_vendor_part);
	if problem is not null then perform public._armory_parts_refuse(problem, '22023', 'malformed'); end if;
	v := upper(btrim(p_vendor));
	p := btrim(p_vendor_part);
	d := btrim(coalesce(p_description, ''));
	if length(d) not between 1 and 120 then
		perform public._armory_parts_refuse('Describe the part in up to 120 characters, such as Hex Bearing.', '22023', 'bad_description');
	end if;
	l := nullif(btrim(coalesce(p_link, '')), '');
	if l is not null and (l !~ '^https://[^[:space:]]+$' or length(l) > 500) then
		perform public._armory_parts_refuse('A link starts with https:// and has no spaces.', '22023', 'bad_link');
	end if;
	if p_file is not null then
		select project_id into fp from public.armory_files where id = p_file;
		if fp is null or not public.armory_can_view(fp) then
			perform public._armory_parts_refuse('That file is not in a project you can see.', '22023', 'file_not_visible');
		end if;
	end if;
	perform pg_advisory_xact_lock(hashtextextended('armory_cots:' || upper(v || '-' || p), 0));
	select * into existing from public.armory_cots_parts where upper(cots_number) = upper(v || '-' || p);
	if found then
		perform public._armory_parts_refuse(format('The library already has %s: %s.', existing.cots_number, existing.description),
			'23505', 'duplicate', jsonb_build_object('id', existing.id));
	end if;
	insert into public.armory_cots_parts (vendor, vendor_part, description, link, file_id, added_by)
	values (v, p, d, l, p_file, e) returning armory_cots_parts.id into v_id;
	perform public.armory_remember(p_operation, 'armory_cots_add', jsonb_build_object('id', v_id));
	return v_id;
end $ap$;

create or replace function public.armory_cots_correct(p_id uuid, p_description text, p_link text, p_file uuid, p_operation uuid)
returns boolean
language plpgsql security definer set search_path = '' as $ap$
declare e text := public.armory_current_email(); r jsonb; rec public.armory_cots_parts; d text; l text; fp uuid; answer boolean;
begin
	r := public.armory_replay(p_operation, 'armory_cots_correct');
	if r is not null then return (r->>'result')::boolean; end if;
	if not public.armory_parts_curator() then
		perform public._armory_parts_refuse('only a mentor or a site admin may correct the COTS library', '42501', 'not_curator');
	end if;
	select * into rec from public.armory_cots_parts where id = p_id for update;
	if not found then perform public._armory_parts_refuse('There is no such COTS part.', 'P0002', 'not_found'); end if;
	d := rec.description;
	if p_description is not null then
		d := btrim(p_description);
		if length(d) not between 1 and 120 then
			perform public._armory_parts_refuse('Describe the part in up to 120 characters, such as Hex Bearing.', '22023', 'bad_description');
		end if;
	end if;
	l := rec.link;
	if p_link is not null then
		l := nullif(btrim(p_link), '');
		if l is not null and (l !~ '^https://[^[:space:]]+$' or length(l) > 500) then
			perform public._armory_parts_refuse('A link starts with https:// and has no spaces.', '22023', 'bad_link');
		end if;
	end if;
	fp := null;
	if p_file is not null then
		select project_id into fp from public.armory_files where id = p_file;
		if fp is null or not public.armory_can_view(fp) then
			perform public._armory_parts_refuse('That file is not in a project you can see.', '22023', 'file_not_visible');
		end if;
	end if;
	answer := d is distinct from rec.description or l is distinct from rec.link or (p_file is not null and p_file is distinct from rec.file_id);
	if answer then
		update public.armory_cots_parts
		set description = d, link = l, file_id = coalesce(p_file, rec.file_id), corrected_by = e, corrected_at = now()
		where id = p_id;
	end if;
	perform public.armory_remember(p_operation, 'armory_cots_correct', jsonb_build_object('result', answer));
	return answer;
end $ap$;

create or replace function public.armory_cots_retire(p_id uuid, p_retired boolean, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $ap$
declare e text := public.armory_current_email(); r jsonb; was timestamptz; answer boolean;
begin
	r := public.armory_replay(p_operation, 'armory_cots_retire');
	if r is not null then return (r->>'result')::boolean; end if;
	if not public.armory_parts_curator() then
		perform public._armory_parts_refuse('only a mentor or a site admin may retire a COTS part', '42501', 'not_curator');
	end if;
	if p_retired is null then perform public._armory_parts_refuse('retired is true or false', '22023', 'bad_flag'); end if;
	select retired_at into was from public.armory_cots_parts where id = p_id for update;
	if not found then perform public._armory_parts_refuse('There is no such COTS part.', 'P0002', 'not_found'); end if;
	answer := (was is not null) <> p_retired;
	if answer then
		update public.armory_cots_parts
		set retired_at = case when p_retired then now() else null end, corrected_by = e, corrected_at = now()
		where id = p_id;
	end if;
	perform public.armory_remember(p_operation, 'armory_cots_retire', jsonb_build_object('result', answer));
	return answer;
end $ap$;

-- ---------------------------------------------------------------------------
-- 12. The website's reads.
-- ---------------------------------------------------------------------------

create or replace function public.armory_project_part_numbers(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $ap$
declare proj public.armory_projects; my_role text;
begin
	select * into proj from public.armory_projects where id = p_project;
	if not found or not public.armory_can_view(p_project) then
		raise exception 'not a project member' using errcode = '42501', detail = jsonb_build_object('reason', 'not_member')::text;
	end if;
	select m.role::text into my_role from public.armory_members m where m.project_id = p_project and m.email = public.current_user_email();
	return jsonb_build_object(
		'project', jsonb_build_object('id', proj.id, 'name', proj.name, 'season', proj.season,
			'season_yy', coalesce(proj.season::int, extract(year from (now() at time zone 'America/Los_Angeles'))::int) % 100,
			'prefix', proj.part_prefix, 'archived', proj.archived_at is not null, 'role', my_role),
		'can_take', proj.archived_at is null and (public.armory_is_member(p_project) or coalesce(public.is_admin(), false)),
		'can_set_prefix', coalesce(public.is_admin(), false) or my_role = 'mentor',
		'can_curate', public.armory_parts_curator(),
		'subsystems', coalesce((select jsonb_agg(jsonb_build_object('code', s.code, 'name', s.name, 'retired', s.retired_at is not null)
			order by s.sort_order, s.code) from public.armory_part_subsystems s), '[]'::jsonb),
		'numbers', coalesce((select jsonb_agg(
				case when coalesce(public.is_admin(), false) or my_role = 'mentor'
					then public._armory_part_number_json(p) || jsonb_build_object('assigned_by', p.assigned_by)
					else public._armory_part_number_json(p) end
				order by p.subsystem, p.assembly, p.part)
			from public.armory_part_numbers p where p.project_id = p_project), '[]'::jsonb));
end $ap$;

create or replace function public.armory_cots_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $ap$
begin
	if not public.armory_parts_library_reader() then
		raise exception 'not on an Armory project' using errcode = '42501', detail = jsonb_build_object('reason', 'not_member')::text;
	end if;
	return jsonb_build_object(
		'can_curate', public.armory_parts_curator(),
		'parts', coalesce((select jsonb_agg(jsonb_build_object(
			'id', c.id, 'vendor', c.vendor, 'vendor_part', c.vendor_part, 'cots_number', c.cots_number,
			'description', c.description, 'link', c.link, 'retired', c.retired_at is not null,
			-- The model file only where this reader may see its project.
			'file', case when f.id is not null and public.armory_can_view(f.project_id)
				then jsonb_build_object('id', f.id, 'name', f.name, 'project_id', f.project_id) end,
			'added_at', c.added_at, 'corrected_at', c.corrected_at)
			order by c.vendor, c.vendor_part)
			from public.armory_cots_parts c left join public.armory_files f on f.id = c.file_id), '[]'::jsonb));
end $ap$;

-- ---------------------------------------------------------------------------
-- 13. Table grants and RLS: no client role writes, and the registry and the
-- library cannot be truncated by anybody but their owner.
-- ---------------------------------------------------------------------------

revoke all on public.armory_part_subsystems, public.armory_part_numbers, public.armory_cots_parts
	from public, anon, authenticated, service_role;
grant select on public.armory_part_subsystems, public.armory_part_numbers, public.armory_cots_parts to authenticated;

alter table public.armory_part_subsystems enable row level security;
alter table public.armory_part_numbers enable row level security;
alter table public.armory_cots_parts enable row level security;

drop policy if exists armory_part_subsystems_read on public.armory_part_subsystems;
create policy armory_part_subsystems_read on public.armory_part_subsystems for select to authenticated
	using (public.armory_parts_library_reader());
drop policy if exists armory_part_numbers_read on public.armory_part_numbers;
create policy armory_part_numbers_read on public.armory_part_numbers for select to authenticated
	using (project_id is not null and public.armory_can_view(project_id));
drop policy if exists armory_cots_parts_read on public.armory_cots_parts;
create policy armory_cots_parts_read on public.armory_cots_parts for select to authenticated
	using (public.armory_parts_library_reader());

-- ---------------------------------------------------------------------------
-- 14. Function grants, the 0166 shape: revoke from every client role BY NAME,
-- then grant back the one role that calls it.
-- ---------------------------------------------------------------------------

revoke all on function
	public._armory_part_number_guard(),
	public._armory_cots_guard(),
	public._armory_parts_refuse(text, text, text, jsonb),
	public._armory_part_number_json(public.armory_part_numbers)
from public, anon, authenticated;

revoke all on function
	public.armory_part_number_problem(text),
	public.armory_cots_problem(text, text),
	public.armory_parts_curator(),
	public.armory_parts_library_reader(),
	public.armory_part_number_take(uuid, text, int, uuid, text, text, uuid),
	public.armory_part_number_describe(text, uuid, text, text, text, text, uuid),
	public.armory_set_part_prefix(uuid, text, uuid),
	public.armory_part_subsystem_save(text, text, uuid),
	public.armory_part_subsystem_retire(text, boolean, uuid),
	public.armory_cots_add(text, text, text, text, uuid, uuid),
	public.armory_cots_correct(uuid, text, text, uuid, uuid),
	public.armory_cots_retire(uuid, boolean, uuid),
	public.armory_project_part_numbers(uuid),
	public.armory_cots_list()
from public, anon, authenticated;
grant execute on function
	public.armory_part_number_problem(text),
	public.armory_cots_problem(text, text),
	public.armory_parts_curator(),
	public.armory_parts_library_reader(),
	public.armory_part_number_take(uuid, text, int, uuid, text, text, uuid),
	public.armory_part_number_describe(text, uuid, text, text, text, text, uuid),
	public.armory_set_part_prefix(uuid, text, uuid),
	public.armory_part_subsystem_save(text, text, uuid),
	public.armory_part_subsystem_retire(text, boolean, uuid),
	public.armory_cots_add(text, text, text, text, uuid, uuid),
	public.armory_cots_correct(uuid, text, text, uuid, uuid),
	public.armory_cots_retire(uuid, boolean, uuid),
	public.armory_project_part_numbers(uuid),
	public.armory_cots_list()
to authenticated;

-- ---------------------------------------------------------------------------
-- 15. Self-check, BY NAME over this file's own objects and nothing else.
-- ---------------------------------------------------------------------------

do $ap$
declare
	v_f text;
	v_t text;
	v_n integer;
begin
	foreach v_f in array array[
		'armory_part_number_take(uuid, text, integer, uuid, text, text, uuid)',
		'armory_part_number_describe(text, uuid, text, text, text, text, uuid)',
		'armory_set_part_prefix(uuid, text, uuid)',
		'armory_part_subsystem_save(text, text, uuid)',
		'armory_part_subsystem_retire(text, boolean, uuid)',
		'armory_cots_add(text, text, text, text, uuid, uuid)',
		'armory_cots_correct(uuid, text, text, uuid, uuid)',
		'armory_cots_retire(uuid, boolean, uuid)',
		'armory_project_part_numbers(uuid)',
		'armory_cots_list()',
		'armory_parts_curator()',
		'armory_parts_library_reader()'] loop
		if not (select p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'
			from pg_catalog.pg_proc p where p.oid = ('public.' || v_f)::regprocedure) then
			raise exception '0274: public.% must be security definer with search_path pinned', v_f;
		end if;
		if pg_catalog.has_function_privilege('anon', 'public.' || v_f, 'execute') then
			raise exception '0274: anon can execute public.%', v_f;
		end if;
		if not pg_catalog.has_function_privilege('authenticated', 'public.' || v_f, 'execute') then
			raise exception '0274: authenticated cannot execute public.%', v_f;
		end if;
	end loop;
	foreach v_f in array array['armory_part_number_problem(text)', 'armory_cots_problem(text, text)'] loop
		if pg_catalog.has_function_privilege('anon', 'public.' || v_f, 'execute') then
			raise exception '0274: anon can execute public.%', v_f;
		end if;
	end loop;
	foreach v_f in array array['_armory_part_number_guard()', '_armory_cots_guard()',
		'_armory_parts_refuse(text, text, text, jsonb)', '_armory_part_number_json(public.armory_part_numbers)'] loop
		if pg_catalog.has_function_privilege('anon', 'public.' || v_f, 'execute')
			or pg_catalog.has_function_privilege('authenticated', 'public.' || v_f, 'execute') then
			raise exception '0274: a client role can execute public.%', v_f;
		end if;
	end loop;
	foreach v_t in array array['armory_part_subsystems', 'armory_part_numbers', 'armory_cots_parts'] loop
		if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = ('public.' || v_t)::regclass) then
			raise exception '0274: row level security is off on public.%', v_t;
		end if;
		if pg_catalog.has_table_privilege('anon', 'public.' || v_t, 'select')
			or pg_catalog.has_table_privilege('authenticated', 'public.' || v_t, 'insert')
			or pg_catalog.has_table_privilege('authenticated', 'public.' || v_t, 'update')
			or pg_catalog.has_table_privilege('authenticated', 'public.' || v_t, 'delete')
			or pg_catalog.has_table_privilege('authenticated', 'public.' || v_t, 'truncate')
			or pg_catalog.has_table_privilege('service_role', 'public.' || v_t, 'truncate')
			or pg_catalog.has_table_privilege('service_role', 'public.' || v_t, 'delete') then
			raise exception '0274: a client role can write or truncate public.%, or anon can read it', v_t;
		end if;
	end loop;
	select count(*) into v_n from public.armory_part_subsystems;
	raise notice '0274 armory-part-numbers: % subsystem codes, % numbers, % COTS parts; 0 executable by anon',
		v_n, (select count(*) from public.armory_part_numbers), (select count(*) from public.armory_cots_parts);
end $ap$;

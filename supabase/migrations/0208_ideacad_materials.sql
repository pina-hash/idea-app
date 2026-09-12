-- 0208_ideacad_materials.sql
--
-- Apply manually in the Supabase SQL editor. DO NOT APPLY FROM THE SESSION
-- CONTAINER: this environment cannot reach production and must not try.
--
-- PASTE ORDER: after 0205, 0206 and 0207, which are claimed by lanes still in
-- flight. Nothing here reads or redefines anything those three touch -- one new
-- table, three new functions, no `create or replace` over an existing object --
-- so the ordering is about the chain being contiguous, not about a dependency.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS IS FOR
-- ---------------------------------------------------------------------------
--
-- MATERIALS ARE DATA. Until now the IdeaCAD blade editor's material list was
-- `DEFAULT_BLADE_CONFIG` in `src/lib/ideacad/blade/materials.ts` -- two body
-- plastics and three blade stocks, hardcoded -- or a jsonb blob a teacher pasted
-- into `ideacad_editors.config`. Adding one material meant a code change and a
-- deploy. Mr. Pina's decision of 2026-09-12: a material is four numbers in a
-- form, the engine already does the calculation from input values, and shipping
-- a code change to add one is overkill.
--
-- So there are TWO LAYERS in ONE TABLE:
--
--   * A GLOBAL material has `owner` NULL. Only an admin writes one. It is
--     offered to every student in every class, with no deploy.
--
--   * A CUSTOM material has `owner` set to the student who made it. They are
--     the only person who can see it or change it. This is the answer to the
--     3D-printed case: a printed part's density depends on slicer settings, so
--     a GLOBAL figure for "PLA" would be a stated mass that is a lie -- but a
--     student who has measured their own effective density can enter it.
--
-- ONE TABLE RATHER THAN TWO, because a material is the same four numbers in
-- both layers and `evaluate()` resolves an id without caring which layer it came
-- from. Two tables would mean two shapes, two reads, two write paths and a
-- UNION in every consumer.
--
-- ---------------------------------------------------------------------------
-- THICKNESS IS DATA TOO, AND IT IS THE LESSON
-- ---------------------------------------------------------------------------
--
-- Mr. Pina, verbatim in substance: in real life you work with the thicknesses of
-- material you actually have; you cannot make it any thickness you want. So a
-- material carries a LIST of real stock thicknesses and a student PICKS from it.
-- There is no free-text thickness field anywhere, on either layer -- a custom
-- material lists the thicknesses that student actually has, and picks from that.
--
-- THE THICKNESSES ARE A PROPOSAL AND MR. PINA SHOULD CORRECT THEM. They are
-- ordinary published sheet and plate sizes, not an inventory of the Bosco Tech
-- shop, which this session has no way to see. Section 5 prints every seeded
-- thickness at apply time for exactly that reason.
--
-- ---------------------------------------------------------------------------
-- THE STOCK ID IS DERIVED, WHICH IS WHAT KEEPS EVERY STORED TREE WORKING
-- ---------------------------------------------------------------------------
--
-- `ideacad_concepts.features` stores `materials.bladeStock` as a STRING, and the
-- deployed ids are `steel-0125`, `steel-01875` and `aluminum-0125`. The client
-- builds a stock id as `<slug>-<thickness with the decimal point removed>`, so
-- seeding the carbon steel row as slug `steel` with 0.125 and 0.1875 among its
-- thicknesses, and the 6061 row as slug `aluminum` with 0.125 among its
-- thicknesses, reproduces all three of those ids exactly. No stored tree is
-- rewritten and no migration touches student work.
--
-- THAT IS ALSO WHY THE TREE'S SHAPE DOES NOT CHANGE. A schema-1 blade tree
-- still carries `materials.body`, `materials.bodySolidFraction` and
-- `materials.bladeStock`, three strings and a number, exactly as before. The
-- material and the thickness are two CONTROLS over one stored id, not two
-- stored fields; making them two fields would make every concept row already in
-- the table a legacy shape, and `validateBladeTree` would have to answer for
-- both forever.
--
-- ---------------------------------------------------------------------------
-- RETIRING, AND WHY THERE IS NO DELETE
-- ---------------------------------------------------------------------------
--
-- Retiring must not break a part already using that material. The answer:
--
--   * `retired_at` is a stamp. NOTHING IS EVER DELETED, on either layer, by
--     anybody. A row named by a stored tree must stay resolvable for as long as
--     that tree exists, and there is no way to find every tree that names one:
--     `features` is jsonb on a table of student work.
--   * A retired material is STILL RETURNED by the read and still resolves, so a
--     part already on it keeps its mass, its inertia and its rule verdicts
--     unchanged. Nothing about a saved concept moves when a material is retired.
--   * A retired material is NOT OFFERED for a new selection -- except on the
--     part that is already on it, where it is offered and marked retired, so a
--     student can see what they are on and change off it deliberately.
--   * Retiring is REVERSIBLE by the same call with p_retired false.
--
-- The rejected alternative was a delete plus a refusal when any tree names the
-- row. It cannot be written: the check would have to walk every `features` blob
-- in the table on every delete, and it would still be wrong for a document
-- nobody has opened since.
--
-- ---------------------------------------------------------------------------
-- THE DENSITIES, AND WHAT IS NOT VERIFIED ABOUT THEM
-- ---------------------------------------------------------------------------
--
-- `IDEA_MATERIALS_PROCESS.md` ("Every Material Cites Its Sources") governs, and
-- it is explicit that an AI's recollection of a datasheet is not a datasheet and
-- that a source which was not opened is not a source. THIS CONTAINER HAS NO
-- EGRESS TO ANY OF THEM -- matweb.com, azom.com, en.wikipedia.org,
-- mcmaster.com, onlinemetals.com and research.fs.usda.gov were each tried and
-- each refused by the network proxy, measured 2026-09-12.
--
-- So every seeded row NAMES THE PUBLISHED STANDARD OR DOCUMENT THAT OWNS ITS
-- DENSITY and lands with `source_verified` FALSE, which is a column and not a
-- sentence in this header: every surface that renders a material renders an
-- UNVERIFIED chip while that flag is false, exactly as the editor already does
-- for `standardParts`. An admin clears the flag from the materials console after
-- checking the value against the named source. A seeded figure is a PROPOSAL
-- until somebody with the document in front of them says otherwise.
--
-- ---------------------------------------------------------------------------
-- GRANTS: 0166's SHAPE, BECAUSE 0201 INVENTED ITS OWN AND LOST anon
-- ---------------------------------------------------------------------------
--
-- A hosted Supabase project bootstraps `alter default privileges in schema
-- public grant execute on functions to anon, authenticated, service_role` and
-- the same for `grant all on tables`, so everything created below arrives
-- holding a DIRECT grant to `anon`. `revoke ... from public` removes the single
-- PUBLIC entry the SQL default would have written and never touches that direct
-- grant. 0201 lost both halves and 0202 is the repair. This file revokes from
-- `public, anon, authenticated` BY NAME and grants back deliberately, for the
-- table and for all three functions, and section 6 reads the catalog back.
--
-- ---------------------------------------------------------------------------
-- UNDO
-- ---------------------------------------------------------------------------
--
--   drop function if exists public.ideacad_material_save_global(uuid,text,text,numeric,numeric[],text,text,boolean);
--   drop function if exists public.ideacad_material_save_custom(uuid,text,numeric,numeric[],text);
--   drop function if exists public.ideacad_material_set_retired(uuid,boolean);
--   drop table if exists public.ideacad_materials;
--
-- That is a complete undo: nothing outside those four objects is created,
-- altered or granted, and no existing object is replaced. Stored concept trees
-- are untouched by both the apply and the undo -- with the table gone the client
-- falls back to `DEFAULT_BLADE_CONFIG`, which still carries every id this file's
-- seed reproduces.

begin;

-- ---------------------------------------------------------------------------
-- 1. THE TABLE.
--
--    `owner` CARRIES NO FOREIGN KEY TO auth.users, DELIBERATELY. A cascade
--    would delete a student's custom materials when their account goes, while
--    `ideacad_documents` is EMAIL-keyed and its concepts survive -- so the trees
--    would outlive the row they name, which is the one thing the retirement rule
--    above exists to prevent. There is nothing to typo either: `owner` is only
--    ever written as `auth.uid()` inside a definer function and never from a
--    parameter, which is the "a student-facing write RPC takes no identity
--    parameter" rule doing the work a constraint would otherwise do.
-- ---------------------------------------------------------------------------

create table if not exists public.ideacad_materials (
	id uuid primary key default gen_random_uuid(),
	slug text not null,
	owner uuid,
	name text not null,
	density_g_cm3 numeric not null,
	thicknesses_in numeric[] not null default '{}'::numeric[],
	note text,
	source text not null,
	source_verified boolean not null default false,
	retired_at timestamptz,
	created_by uuid,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint ideacad_materials_slug_shape
		check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
	-- A custom slug is MINTED by the database, never chosen, and always carries
	-- the `custom-` prefix. That is what makes a global id and a custom id
	-- unambiguous in a stored tree: a student cannot shadow `steel` with their
	-- own row and quietly change the physics of a part somebody is grading.
	constraint ideacad_materials_custom_slug
		check (owner is null or slug like 'custom-%'),
	constraint ideacad_materials_global_slug
		check (owner is not null or slug not like 'custom-%'),
	constraint ideacad_materials_name_length
		check (length(btrim(name)) between 1 and 60),
	constraint ideacad_materials_source_length
		check (length(btrim(source)) between 1 and 300),
	constraint ideacad_materials_note_length
		check (note is null or length(note) <= 400),
	constraint ideacad_materials_density
		check (density_g_cm3 > 0 and density_g_cm3 <= 25),
	-- COALESCED, AND THE COALESCE IS THE POINT. `0 < all(array[null])` is NULL,
	-- not false, and a CHECK passes on NULL -- the exact fall-through 0125 and
	-- `_notebook_note_run_len` are written down for. With the coalesce a NULL
	-- element refuses instead of being admitted.
	constraint ideacad_materials_thicknesses
		check (
			coalesce(0 < all(thicknesses_in), false)
			and coalesce(4 >= all(thicknesses_in), false)
			and coalesce(array_length(thicknesses_in, 1), 0) <= 24
		)
);

comment on table public.ideacad_materials is
	'IdeaCAD material library. owner NULL = global (admin-managed); owner set = that student''s own custom material. Nothing here is ever deleted: retired_at shelves a row while every stored blade tree that names it keeps resolving.';

create unique index if not exists ideacad_materials_global_slug_uq
	on public.ideacad_materials (slug) where owner is null;
create unique index if not exists ideacad_materials_owner_slug_uq
	on public.ideacad_materials (owner, slug) where owner is not null;
create index if not exists ideacad_materials_owner_idx
	on public.ideacad_materials (owner) where owner is not null;

alter table public.ideacad_materials enable row level security;

drop policy if exists "signed in readers read global and their own materials" on public.ideacad_materials;
create policy "signed in readers read global and their own materials"
	on public.ideacad_materials for select to authenticated
	using (owner is null or owner = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. THE WRITE PATH. Three SECURITY DEFINER functions, each re-checking the
--    caller in its own body. There is no insert, update or delete grant and no
--    write policy on the table, so these are the only way a row is ever written.
-- ---------------------------------------------------------------------------

-- The one reader of the thickness list's shape, called by both write functions
-- so "what a thickness list is" has exactly one statement. It SORTS and DEDUPES
-- rather than refusing: a picker that offered 0.125 twice, or offered 0.25 above
-- 0.125, is a list nobody typed on purpose.
create or replace function public._ideacad_clean_thicknesses(p_in numeric[])
returns numeric[] language sql immutable set search_path = '' as $$
	select coalesce(
		(select array_agg(t order by t) from (select distinct round(u, 4) as t from unnest(p_in) u where u is not null and u > 0 and u <= 4) s),
		'{}'::numeric[]
	);
$$;

-- A GLOBAL material. Admin only, and `is_admin()` reads the session's JWT
-- claims, so a nested definer call cannot launder a student into one.
create or replace function public.ideacad_material_save_global(
	p_id uuid,
	p_slug text,
	p_name text,
	p_density_g_cm3 numeric,
	p_thicknesses_in numeric[],
	p_note text,
	p_source text,
	p_source_verified boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
	v_slug text := lower(btrim(coalesce(p_slug, '')));
	v_th numeric[];
	v public.ideacad_materials;
begin
	if not public.is_admin() then
		raise exception 'Only a site admin can add or change a shared material.';
	end if;
	if length(btrim(coalesce(p_name, ''))) = 0 then
		raise exception 'Give the material a name.';
	end if;
	if length(btrim(coalesce(p_source, ''))) = 0 then
		raise exception 'Name the published source the density came from.';
	end if;
	if p_density_g_cm3 is null or p_density_g_cm3 <= 0 or p_density_g_cm3 > 25 then
		raise exception 'Density must be more than 0 and no more than 25 g/cm3.';
	end if;
	v_th := public._ideacad_clean_thicknesses(p_thicknesses_in);
	if v_slug !~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$' or v_slug like 'custom-%' then
		raise exception 'A shared material id is lower-case letters, digits and hyphens, and cannot start with custom-.';
	end if;

	if p_id is null then
		insert into public.ideacad_materials
			(slug, owner, name, density_g_cm3, thicknesses_in, note, source, source_verified, created_by)
		values
			(v_slug, null, btrim(p_name), p_density_g_cm3, v_th, nullif(btrim(coalesce(p_note, '')), ''),
			 btrim(p_source), coalesce(p_source_verified, false), auth.uid())
		returning * into v;
	else
		update public.ideacad_materials set
			slug = v_slug,
			name = btrim(p_name),
			density_g_cm3 = p_density_g_cm3,
			thicknesses_in = v_th,
			note = nullif(btrim(coalesce(p_note, '')), ''),
			source = btrim(p_source),
			source_verified = coalesce(p_source_verified, false),
			updated_at = now()
		where id = p_id and owner is null
		returning * into v;
		if not found then
			raise exception 'That shared material does not exist.';
		end if;
	end if;
	return to_jsonb(v);
end$$;

-- A CUSTOM material. NO IDENTITY PARAMETER: the owner is `auth.uid()`, so "can
-- only act as themselves" is a property of the signature rather than a check
-- that could be got wrong. The slug is minted here and never accepted.
create or replace function public.ideacad_material_save_custom(
	p_id uuid,
	p_name text,
	p_density_g_cm3 numeric,
	p_thicknesses_in numeric[],
	p_note text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
	v_uid uuid := auth.uid();
	v_th numeric[];
	v_n integer;
	v public.ideacad_materials;
begin
	if v_uid is null then
		raise exception 'Sign in to add your own material.';
	end if;
	if length(btrim(coalesce(p_name, ''))) = 0 then
		raise exception 'Give the material a name.';
	end if;
	if p_density_g_cm3 is null or p_density_g_cm3 <= 0 or p_density_g_cm3 > 25 then
		raise exception 'Density must be more than 0 and no more than 25 g/cm3.';
	end if;
	v_th := public._ideacad_clean_thicknesses(p_thicknesses_in);
	if coalesce(array_length(v_th, 1), 0) = 0 then
		raise exception 'List at least one thickness you actually have, in inches.';
	end if;

	if p_id is null then
		select count(*) into v_n from public.ideacad_materials where owner = v_uid;
		if v_n >= 40 then
			raise exception 'You already have 40 of your own materials. Retire one before adding another.';
		end if;
		insert into public.ideacad_materials
			(slug, owner, name, density_g_cm3, thicknesses_in, note, source, source_verified, created_by)
		values
			('custom-' || substr(md5(random()::text || clock_timestamp()::text || coalesce(v_uid::text, '')), 1, 12), v_uid, btrim(p_name),
			 p_density_g_cm3, v_th, nullif(btrim(coalesce(p_note, '')), ''),
			 'Entered by the student who owns this material.', false, v_uid)
		returning * into v;
	else
		update public.ideacad_materials set
			name = btrim(p_name),
			density_g_cm3 = p_density_g_cm3,
			thicknesses_in = v_th,
			note = nullif(btrim(coalesce(p_note, '')), ''),
			updated_at = now()
		where id = p_id and owner = v_uid
		returning * into v;
		if not found then
			raise exception 'You can only change your own material.';
		end if;
	end if;
	return to_jsonb(v);
end$$;

-- RETIRE AND RESTORE, ONE FUNCTION, because it is one rule about one stamp. The
-- two layers differ only in who may press it: an admin for a shared material,
-- the owner for their own. NOTHING IS DELETED HERE OR ANYWHERE.
create or replace function public.ideacad_material_set_retired(
	p_id uuid,
	p_retired boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
	v public.ideacad_materials;
begin
	select * into v from public.ideacad_materials where id = p_id;
	if not found then
		raise exception 'That material does not exist.';
	end if;
	if v.owner is null then
		if not public.is_admin() then
			raise exception 'Only a site admin can retire a shared material.';
		end if;
	elsif v.owner is distinct from auth.uid() then
		raise exception 'You can only retire your own material.';
	end if;
	update public.ideacad_materials
		set retired_at = case when coalesce(p_retired, true) then coalesce(retired_at, now()) else null end,
		    updated_at = now()
		where id = p_id
		returning * into v;
	return to_jsonb(v);
end$$;

-- ---------------------------------------------------------------------------
-- 3. GRANTS. 0166's shape. `revoke ... from public` alone does NOT close a
--    function on this project; the roles are named.
--
--    `_ideacad_clean_thicknesses` is granted to NO client role. It is called
--    only from inside the two definer functions, which run as the owner, and it
--    appears in no CHECK constraint -- the 0131 trap (a CHECK's function runs as
--    the WRITING role) does not apply because the table's own thickness
--    constraint is written inline rather than through a predicate.
-- ---------------------------------------------------------------------------

revoke all on table public.ideacad_materials from public, anon, authenticated;
grant select on table public.ideacad_materials to authenticated;

revoke all on function
	public.ideacad_material_save_global(uuid,text,text,numeric,numeric[],text,text,boolean),
	public.ideacad_material_save_custom(uuid,text,numeric,numeric[],text),
	public.ideacad_material_set_retired(uuid,boolean),
	public._ideacad_clean_thicknesses(numeric[])
	from public, anon, authenticated;

grant execute on function
	public.ideacad_material_save_global(uuid,text,text,numeric,numeric[],text,text,boolean),
	public.ideacad_material_save_custom(uuid,text,numeric,numeric[],text),
	public.ideacad_material_set_retired(uuid,boolean)
	to authenticated, service_role;

grant execute on function public._ideacad_clean_thicknesses(numeric[]) to service_role;

-- ---------------------------------------------------------------------------
-- 4. THE SEED. Mr. Pina's six, verbatim: stainless steel, galvanized steel,
--    carbon or unknown steel, 6061 aluminum, polycarbonate, wood.
--
--    NO 3D-PRINTED MATERIAL IS SEEDED AS A LIVE GLOBAL, on his reasoning: a
--    printed part's density depends on slicer settings, so a stated mass would
--    be a lie. `pla` and `petg` ARE seeded, RETIRED, and only because documents
--    already saved against the hardcoded list name them -- that is the
--    retirement mechanism doing its job on day one rather than an exception to
--    his decision. They resolve, they do not appear in any picker, and a student
--    who knows their own effective density enters it as a custom material.
--
--    `on conflict do nothing` ON THE PARTIAL INDEX, so re-pasting this file is a
--    no-op and cannot overwrite an edit an admin has made since. That is the
--    "a backfill runs exactly once" rule expressed as a conflict clause rather
--    than a catalog guard, which works here because the seed is INSERT-only.
-- ---------------------------------------------------------------------------

insert into public.ideacad_materials
	(slug, owner, name, density_g_cm3, thicknesses_in, note, source, source_verified, retired_at)
values
	('stainless-steel', null, 'Stainless steel (304)', 8.00,
	 array[0.024, 0.030, 0.048, 0.0625, 0.090, 0.125]::numeric[],
	 'Type 304/304L. Type 316 and the 400 series differ; if the sheet is marked, pick the marked alloy instead.',
	 'ASTM A240/A240M, Stainless Steel Plate, Sheet and Strip, Type 304', false, null),

	('galvanized-steel', null, 'Galvanized steel', 7.85,
	 array[0.0276, 0.0336, 0.0396, 0.0516, 0.0635, 0.0785]::numeric[],
	 'This is the density of the BASE STEEL. The zinc coating is well under 1% of the mass and is not counted. The thicknesses are the usual 24, 22, 20, 18, 16 and 14 gauge sizes, coating included.',
	 'ASTM A653/A653M, Steel Sheet, Zinc-Coated (Galvanized) by the Hot-Dip Process', false, null),

	('steel', null, 'Carbon or unknown steel', 7.85,
	 array[0.0625, 0.125, 0.1875, 0.250]::numeric[],
	 'ESTIMATE. This assumes ASTM A36 mild steel, which is what unmarked shop steel usually is. A different carbon or alloy steel is within about 2% of this, so the mass is close but it is not a measured figure for the piece in your hand.',
	 'ASTM A36/A36M, Carbon Structural Steel', false, null),

	('aluminum', null, '6061 aluminum', 2.70,
	 array[0.0625, 0.125, 0.1875, 0.250]::numeric[],
	 '6061 in any temper. 5052 and 7075 are within about 4% of this.',
	 'ASTM B209, Aluminum and Aluminum-Alloy Sheet and Plate; The Aluminum Association, Aluminum Standards and Data', false, null),

	('polycarbonate', null, 'Polycarbonate', 1.20,
	 array[0.0625, 0.093, 0.125, 0.1875, 0.250]::numeric[],
	 'Unfilled polycarbonate sheet. Acrylic is lighter, about 1.18, and is not the same material.',
	 'SABIC LEXAN sheet product datasheet; density measured per ISO 1183 / ASTM D792', false, null),

	('wood', null, 'Wood (Baltic birch plywood)', 0.68,
	 array[0.118, 0.236, 0.472]::numeric[],
	 'ESTIMATE, AND THE WIDEST ONE HERE. Wood density depends on species and moisture: balsa is near 0.16 and oak is near 0.75. This assumes Baltic birch plywood, and its thicknesses are the metric sheet sizes it is actually sold in (3, 6 and 12 mm). If the shop stocks a different wood, add it as its own material.',
	 'USDA Forest Products Laboratory, Wood Handbook: Wood as an Engineering Material, FPL-GTR-282', false, null),

	-- The two compatibility rows. Retired on arrival: see section 4's header.
	('pla', null, 'PLA (3D printed)', 1.24,
	 array[]::numeric[],
	 'RETIRED. A printed part is not solid, so its effective density depends on your slicer settings and a shared figure for it would be wrong for almost everybody. 1.24 is solid filament. If you know your own printed density, add it as your own material.',
	 'Filament manufacturer datasheets for solid PLA; density per ISO 1183', false, now()),

	('petg', null, 'PETG (3D printed)', 1.27,
	 array[]::numeric[],
	 'RETIRED, for the same reason as PLA. 1.27 is solid filament.',
	 'Filament manufacturer datasheets for solid PETG; density per ISO 1183', false, now())
on conflict (slug) where owner is null do nothing;

-- ---------------------------------------------------------------------------
-- 5. THE REPORT. Every seeded row, printed, so whoever pastes this reads the
--    numbers rather than a claim about them. The thicknesses are the half Mr.
--    Pina is being asked to correct against what is actually in the shop.
-- ---------------------------------------------------------------------------

do $report$
declare
	r record;
	v_seeded integer;
begin
	select count(*) into v_seeded from public.ideacad_materials where owner is null;
	raise notice '0208: % shared material(s) in the library.', v_seeded;
	for r in
		select slug, name, density_g_cm3, thicknesses_in, retired_at is not null as retired, source
		from public.ideacad_materials where owner is null order by retired_at nulls first, name
	loop
		raise notice '0208: %  %  % g/cm3  thicknesses %  %  source: %',
			rpad(r.slug, 18), rpad(r.name, 30), r.density_g_cm3,
			coalesce(r.thicknesses_in::text, '{}'),
			case when r.retired then 'RETIRED' else 'live' end, r.source;
	end loop;
	raise notice '0208: every density above is UNVERIFIED. The session that wrote this file had no network route to any of the named sources and did not open one. Check each value against its source and clear the flag from the materials console before a class uses it.';
end;
$report$;

-- ---------------------------------------------------------------------------
-- 6. THE SELF-CHECK. Read the catalog back rather than trust that the
--    statements above ran; raise, so a partial apply cannot look like a clean
--    one and the whole file rolls back.
--
--    IT SWEEPS BY NAME PREFIX AND COUNTS NOTHING. 0202's own check asserts
--    `exactly ten ideacad functions`, which is the assertion every lane adding
--    an ideacad function breaks; this one asserts the PROPERTY instead -- no
--    function this file created is executable by anon, and every one it meant
--    to grant is executable by authenticated -- so it stays true however many
--    ideacad functions exist when it runs.
--
--    THE PLANTED CONTROL IS WHAT MAKES A CLEAN SWEEP MEAN ANYTHING. A sweep
--    looking in the wrong place reports exactly what a clean database reports,
--    so this block also asserts it can still SEE a deliberate anon grant:
--    `app_short_link_target` is granted to anon on purpose (0137 keeps it --
--    printed handouts resolve before any session exists). If that reads false
--    the instrument is broken and every assertion above it is worthless.
-- ---------------------------------------------------------------------------

do $checks$
declare
	r record;
	v_bad_anon text[] := '{}';
	v_bad_authed text[] := '{}';
	v_bad_table text[] := '{}';
	v_control boolean;
	v_seeded integer;
begin
	for r in
		select p.oid::regprocedure::text as sig,
		       has_function_privilege('anon', p.oid, 'execute') as anon_x,
		       has_function_privilege('authenticated', p.oid, 'execute') as authed_x
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public'
		  and p.proname in ('ideacad_material_save_global', 'ideacad_material_save_custom',
		                    'ideacad_material_set_retired')
		order by 1
	loop
		if r.anon_x then
			v_bad_anon := v_bad_anon || r.sig;
		end if;
		if not r.authed_x then
			v_bad_authed := v_bad_authed || r.sig;
		end if;
	end loop;

	if array_length(v_bad_anon, 1) is not null then
		raise exception '0208: % function(s) are executable by anon: %. The revoke did not name the roles it needed to -- see 0166.',
			array_length(v_bad_anon, 1), array_to_string(v_bad_anon, ', ');
	end if;
	if array_length(v_bad_authed, 1) is not null then
		raise exception '0208: % function(s) LOST the authenticated grant: %. The narrowing went too far and the feature is down.',
			array_length(v_bad_authed, 1), array_to_string(v_bad_authed, ', ');
	end if;
	if has_function_privilege('authenticated', 'public._ideacad_clean_thicknesses(numeric[])', 'execute') then
		raise exception '0208: the private thickness helper is executable by authenticated. It has no caller outside the two definer functions.';
	end if;

	for r in
		select rp.role_name, rp.priv
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		cross join (
			select roles.role_name, privs.priv
			from (values ('anon'), ('authenticated')) as roles(role_name)
			cross join (
				values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
				       ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
			) as privs(priv)
		) rp
		where n.nspname = 'public' and c.relname = 'ideacad_materials'
		  and has_table_privilege(rp.role_name, c.oid, rp.priv)
		  and not (rp.role_name = 'authenticated' and rp.priv = 'SELECT')
	loop
		v_bad_table := v_bad_table || format('%s to %s', r.priv, r.role_name);
	end loop;
	if array_length(v_bad_table, 1) is not null then
		raise exception '0208: % client privilege(s) survive on ideacad_materials beyond authenticated SELECT: %.',
			array_length(v_bad_table, 1), array_to_string(v_bad_table, ', ');
	end if;
	if not has_table_privilege('authenticated', 'public.ideacad_materials', 'SELECT') then
		raise exception '0208: authenticated LOST select on ideacad_materials. The regrant in section 3 did not run.';
	end if;
	if not exists (
		select 1 from pg_policies
		where schemaname = 'public' and tablename = 'ideacad_materials' and cmd = 'SELECT'
	) then
		raise exception '0208: the select policy is missing, so the authenticated grant reads nothing.';
	end if;
	if exists (
		select 1 from pg_policies
		where schemaname = 'public' and tablename = 'ideacad_materials' and cmd <> 'SELECT'
	) then
		raise exception '0208: a write policy exists on ideacad_materials. Every write goes through the three definer functions and nothing else.';
	end if;

	select count(*) into v_seeded from public.ideacad_materials where owner is null;
	if v_seeded < 8 then
		raise exception '0208: expected at least 8 shared materials after the seed, found %.', v_seeded;
	end if;
	-- The three ids that stored trees already name. If any of these stops
	-- resolving, every concept saved against it loses its blade mass.
	for r in
		select x.want from (values ('steel'), ('aluminum')) as x(want)
		where not exists (
			select 1 from public.ideacad_materials m
			where m.owner is null and m.slug = x.want
			  and 0.125 = any(m.thicknesses_in)
		)
	loop
		raise exception '0208: the seed does not reproduce the deployed stock id %-0125. Every concept already saved against it would stop resolving.', r.want;
	end loop;
	if not exists (
		select 1 from public.ideacad_materials
		where owner is null and slug = 'steel' and 0.1875 = any(thicknesses_in)
	) then
		raise exception '0208: the seed does not reproduce the deployed stock id steel-01875.';
	end if;

	select has_function_privilege('anon', 'public.app_short_link_target(text)', 'execute') into v_control;
	if not v_control then
		raise exception '0208: the positive control failed -- app_short_link_target does not read as anon-executable, so this file cannot tell an anon grant from its absence and none of the checks above mean anything.';
	end if;

	raise notice '0208: 3 public ideacad material functions -- anon false, authenticated true; the private helper is owner-only. ideacad_materials -- authenticated holds SELECT and nothing else, anon holds nothing, one select policy and no write policy. Seed reproduces steel-0125, steel-01875 and aluminum-0125. Positive control reads true.';
end;
$checks$;

commit;

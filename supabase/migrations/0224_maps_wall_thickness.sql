-- 0224_maps_wall_thickness.sql
--
-- IDEA MAPS: WALL THICKNESS. Mr. Pina, feedback report 38, 2026-09-14, from
-- `/maps/edit`: "wall thicknesses must be accounted for."
--
-- THE DECISION THIS FILE IMPLEMENTS IS DECISION 36 AND IT IS NOT RELITIGATED
-- HERE: `docs/decisions/entries/36-maps-outline-is-the-interior-face.md`.
--
--   THE TYPED OUTLINE IS THE INTERIOR FACE OF THE SPACE IT DESCRIBES. Wall
--   thickness is a separate per-node value with a building-level default, and
--   a wall is drawn as a band lying OUTWARD from the outline.
--
-- WHY THAT READING AND NOT CENTERLINE OR EXTERIOR, because it is the whole
-- argument for this file's shape: every outline already in `maps_nodes` was
-- typed by somebody measuring a room, and a room is measured on the inside.
-- Reading the stored numbers as interior keeps EVERY EXISTING PUBLISHED ROW
-- CORRECT WITH NO BACKFILL. A 240 inch room stays 240 inches of usable space.
-- Centerline or exterior would silently move every room by a wall thickness.
--
-- SO THIS FILE BACKFILLS NOTHING AND REWRITES NOTHING. It adds two nullable
-- columns, one predicate, four constraints and five comments. Section 7
-- asserts, at apply time and against the real table, that no `outline`,
-- `position_x_in`, `position_y_in` or `rotation_deg` value moved -- because a
-- migration that claimed "no backfill" and quietly performed one is the exact
-- failure decision 36 exists to prevent, and a claim nobody measured is not a
-- claim.
--
-- ---------------------------------------------------------------------------
-- 1. WHY TWO COLUMNS AND NOT ONE, which is the design decision in this file
--    most likely to be second-guessed.
--
--    `wall_thickness_in` is THIS node's own wall. `default_wall_thickness_in`
--    is what this node's DESCENDANTS fall back to when they carry none. They
--    are two different facts and one column cannot hold both: a building's
--    exterior wall is routinely 12 inches and the partitions between the rooms
--    inside it 5, so a single column resolved by inheritance would draw every
--    room in the building with a 12 inch wall. That is not a subtle error --
--    it is visibly wrong on the first drawing anybody opens.
--
--    Resolution is therefore: this node's own value, else the NEAREST ANCESTOR
--    that carries a default, else null. Null is today's behaviour exactly --
--    no band, a drawn line -- which is what makes the whole feature opt-in per
--    node and per building. ZERO IS A LEGAL VALUE AND ALSO MEANS A DRAWN LINE
--    (decision 36, consequence 1); it differs from null only in that it is an
--    answer somebody gave rather than one nobody gave, and a descendant
--    inheriting a default of zero stops inheriting anything further up.
--
--    `src/lib/maps/maps.ts`'s `mapsResolveWallThickness` is the ONE
--    implementation of that walk and the client never writes a second one.
--
-- ---------------------------------------------------------------------------
-- 2. WHY A COLUMN AND NOT A KEY INSIDE `outline`, which is the other one.
--
--    0161's own header states this table's rule: the outline is "a
--    variant-shaped document the editor reads" and everything beside it is a
--    scalar with one shape, in a column -- which is why `position_x_in`,
--    `position_y_in` and `rotation_deg` are columns and not keys in the jsonb.
--    A wall thickness resolved UNIFORMLY PER NODE (section 3) is a scalar with
--    one shape, whatever the outline kind is, so it belongs where 0161 put the
--    other three.
--
--    And a jsonb key would have a consequence nobody asked for: the editor's
--    duplicate-container panel keys on `outlineSignature`, so two rooms of
--    identical size with different wall thickness would silently stop reading
--    as copies. A column leaves that panel exactly as it is.
--
--    `_maps_outline_ok` therefore does NOT change in this file, and neither
--    does its client mirror `mapsOutlineOk`. What this file adds instead is a
--    NEW mirrored pair, `_maps_wall_thickness_ok` here and
--    `mapsWallThicknessOk` in `src/lib/maps/maps.ts`, pinned against each other
--    the same way in `tests/maps-kind-rules.test.ts` -- so the editor can
--    still refuse a bad thickness BEFORE the request leaves the machine, which
--    is the only thing the mirror rule was ever for.
--
-- ---------------------------------------------------------------------------
-- 3. UNIFORM PER NODE, NOT PER EDGE, AND THAT IS THE QUESTION DECISION 36 LEFT
--    OPEN. A polygon room gets ONE thickness, applied to every edge.
--
--    The rejected alternative was a per-edge array parallel to `points`. It
--    costs: a length-must-match-points check with nothing to enforce it when
--    somebody edits a corner out; a second shape for `rect`, which has no
--    `points` to parallel; a jsonb home for the whole thing, undoing section 2;
--    and an editor form asking for five numbers where the building index this
--    system is wants one. It buys: a room whose north wall is thicker than its
--    south wall, drawn correctly. Nobody has asked for that, and spec section 1
--    says what this is for -- finding things.
--
--    The spec records this as ANSWERED rather than leaving it on the
--    deliberately-undecided list.
--
-- ---------------------------------------------------------------------------
-- 4. WHAT THIS FILE DELIBERATELY DOES NOT DO.
--
--    A polygon's snap targets are its AXIS-ALIGNED BOUNDING BOX, not its real
--    edges -- `mapsFootprint` takes min/max over `mapsShapeCorners` for `rect`
--    and `polygon` alike, with no per-edge branch. That is a pre-existing
--    defect, named in decision 36's own "what is still open" section, and it
--    is independent of wall thickness: a five-sided room already snaps to
--    lines that are not its walls. This file does not fix it and does not make
--    it worse -- the OUTER snap box is the footprint of the offset outline, so
--    it is exactly as (in)correct as the inner one, and the two faces stay
--    consistent with each other. Fixing it means real per-edge snapping, which
--    is its own bundle with its own answer for the editor's drag arithmetic.
--
--    IT ALSO DOES NOT TOUCH `maps_publish`. That function reads its updatable
--    column list off `pg_catalog` at call time, precisely so "a column added
--    later cannot be silently dropped from promotion" (0161's own words), so
--    both columns promote from a pending snapshot with no change here. Section
--    7 asserts that rather than trusting it.
--
-- ---------------------------------------------------------------------------
-- 5. RE-APPLYING THIS FILE IS ORDINARY. `add column if not exists`,
--    `create or replace function`, and every constraint added inside a
--    `pg_constraint` guard -- Postgres has no `add constraint if not exists`
--    and a blind drop-then-add raises 2BP01 on the second run. Nothing here is
--    destructive and nothing here is one-shot.
--
-- TO UNDO:
--   alter table public.maps_nodes
--     drop constraint if exists maps_nodes_wall_thickness_shape,
--     drop constraint if exists maps_nodes_default_wall_thickness_shape,
--     drop constraint if exists maps_nodes_compartment_no_wall,
--     drop column if exists wall_thickness_in,
--     drop column if exists default_wall_thickness_in;
--   drop function if exists public._maps_wall_thickness_ok(numeric);
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 6. The predicate, its columns, its constraints and its comments.
-- ---------------------------------------------------------------------------

-- A thickness is null (no answer), or a real non-negative number of inches.
--
-- THE NaN AND INFINITY CLAUSES ARE NOT DECORATION. Postgres `numeric` sorts
-- NaN ABOVE every non-NaN value, so `'NaN'::numeric >= 0` is TRUE and a plain
-- `>= 0` check admits it; `'Infinity'::numeric >= 0` is true for the same
-- reason. Both then reach `mapsResolveWallThickness` and every offset it
-- feeds, where an outer face at NaN is a shape that vanishes from the drawing
-- with nothing raised anywhere. `< 'Infinity'` refuses both at once: NaN is
-- greater than infinity under that ordering, so it fails the same comparison.
--
-- Never returns null (the jsonb_typeof-null gate trap in CLAUDE.md, in its
-- numeric costume): a null INPUT is an explicit legal answer returning true,
-- and every other path returns a non-null boolean.
create or replace function public._maps_wall_thickness_ok(p_thickness numeric)
returns boolean
language sql
immutable
as $$
	select case
		when p_thickness is null then true
		else coalesce(p_thickness >= 0 and p_thickness < 'Infinity'::numeric, false)
	end;
$$;

-- The grant is 0161's, exactly: revoked from every role BY NAME (a bare
-- `revoke ... from public` leaves the direct `anon` grant this project's
-- default privileges write into every new function's ACL -- 0166's shape), and
-- granted back to `authenticated` alone. A CHECK constraint's predicate runs
-- as the WRITING role, and every write to `maps_nodes` is either an admin's
-- own authenticated client under 0161's RLS or `maps_publish`, which is
-- SECURITY DEFINER and runs as the owner. Neither needs `anon` and neither
-- needs `service_role`, which is exactly what 0161 granted for
-- `_maps_outline_ok` and what keeps the two predicates the same shape.
revoke all on function public._maps_wall_thickness_ok(numeric)
	from public, anon, authenticated;
grant execute on function public._maps_wall_thickness_ok(numeric) to authenticated;

alter table public.maps_nodes
	add column if not exists wall_thickness_in numeric;

alter table public.maps_nodes
	add column if not exists default_wall_thickness_in numeric;

do $guard$
begin
	if not exists (
		select 1 from pg_catalog.pg_constraint
		where conrelid = 'public.maps_nodes'::regclass
			and conname = 'maps_nodes_wall_thickness_shape'
	) then
		alter table public.maps_nodes
			add constraint maps_nodes_wall_thickness_shape
			check (public._maps_wall_thickness_ok(wall_thickness_in));
	end if;

	if not exists (
		select 1 from pg_catalog.pg_constraint
		where conrelid = 'public.maps_nodes'::regclass
			and conname = 'maps_nodes_default_wall_thickness_shape'
	) then
		alter table public.maps_nodes
			add constraint maps_nodes_default_wall_thickness_shape
			check (public._maps_wall_thickness_ok(default_wall_thickness_in));
	end if;

	-- A COMPARTMENT CARRIES NO PLAN GEOMETRY, AND A WALL IS PLAN GEOMETRY.
	-- 0161's `maps_nodes_compartment_no_plan` says that about outline,
	-- position and rotation; this is the same rule about the two columns 0224
	-- adds. It is a SEPARATE constraint rather than a widening of 0161's,
	-- because 0161 is an applied record and a drop-and-re-add of a live CHECK
	-- over a real table is a destructive edit to buy a tidier catalog.
	if not exists (
		select 1 from pg_catalog.pg_constraint
		where conrelid = 'public.maps_nodes'::regclass
			and conname = 'maps_nodes_compartment_no_wall'
	) then
		alter table public.maps_nodes
			add constraint maps_nodes_compartment_no_wall
			check (
				kind <> 'compartment'
				or (wall_thickness_in is null and default_wall_thickness_in is null)
			);
	end if;
end;
$guard$;

comment on column public.maps_nodes.wall_thickness_in is
$c$INCHES. THIS node's own wall thickness. The `outline` is the INTERIOR face
of the space (decision 36), so the wall is a band lying OUTWARD from it: a
rect outline of w by h with thickness t occupies w+2t by h+2t, with its outer
face starting at local (-t,-t). NULL means no answer and renders exactly as it
did before migration 0224 -- a drawn line, no band. ZERO is a legal answer and
also renders as a drawn line; it differs from null only in that somebody gave
it, which stops the inheritance walk below. Never negative, never NaN, never
infinite (constraint maps_nodes_wall_thickness_shape). Compartments carry none
(constraint maps_nodes_compartment_no_wall).$c$;

comment on column public.maps_nodes.default_wall_thickness_in is
$c$INCHES. The default this node's DESCENDANTS use when they carry no
wall_thickness_in of their own -- decision 36's "building-level default", set
once on a building so every room inside it draws the same partition. It is
NOT this node's own wall: a building's exterior wall and the partitions
between its rooms are different numbers, which is why these are two columns
and not one. Resolution is own value, then the NEAREST ANCESTOR carrying a
default, then null; `mapsResolveWallThickness` in src/lib/maps/maps.ts is the
one implementation of that walk. Same shape rule and same compartment rule as
wall_thickness_in.$c$;

-- 0168 fixed the plan frame in this comment. 0224 adds the one sentence that
-- says which FACE of the wall the frame's numbers describe, because that is
-- the question a reader of `outline` could not answer before decision 36 and
-- the question every renderer and every snap target now turns on. The 0168
-- text is carried through verbatim: this is a replacement, not an append, and
-- losing the plan frame to add a sentence would be the worse trade.
comment on table public.maps_nodes is
$c$IDEA Maps spatial containers (spec 4.1), one self-referencing tree.

PLAN FRAME, fixed by migration 0168. Plan geometry is carried by `outline`
(the shape, in its own local frame), `position_x_in`/`position_y_in` (where
that local frame's ORIGIN sits in the PARENT node's frame) and `rotation_deg`
(rotation of the outline ABOUT THAT SAME LOCAL ORIGIN). All lengths are
INCHES; rotation is DEGREES. Axes: x increases to the RIGHT, y increases
DOWNWARD -- the plan as a viewer looks at it, matching SVG user space so a
renderer needs no flip -- and rotation_deg is positive CLOCKWISE, the positive
direction under those axes. The local origin is the shape's minimum-x,
minimum-y CORNER for a rect and the point (0,0) for a polygon; it is never the
centroid and never the bounding-box centre. Compartments carry no plan
geometry (constraint maps_nodes_compartment_no_plan) and instead carry the
unit's front elevation in elevation_order/elevation_h_in/elevation_w_in.

REFERENCE FACE, fixed by migration 0224 (decision 36). `outline` is the
INTERIOR face of the space it describes -- the dimension somebody gets by
measuring a room from the inside -- and never the centerline and never the
exterior. Wall thickness is `wall_thickness_in`, with the building-level
default `default_wall_thickness_in` inherited by descendants, and the wall is
the band lying OUTWARD from the outline. Because the stored numbers were
already interior measurements, 0224 backfilled nothing: every row written
before it means exactly what it meant before it.$c$;

-- ---------------------------------------------------------------------------
-- 7. SELF-CHECK. Every claim the header makes, measured against the real
--    catalog and the real table at apply time. A raise here is a REFUSAL --
--    the transaction rolls back and nothing is half-applied.
-- ---------------------------------------------------------------------------

do $check$
declare
	v_cols integer;
	v_cons integer;
	v_moved integer;
	v_bad integer;
	v_promoted boolean;
	v_nodes integer;
	v_with_own integer;
	v_with_default integer;
begin
	select count(*) into v_cols
	from information_schema.columns
	where table_schema = 'public' and table_name = 'maps_nodes'
		and column_name in ('wall_thickness_in', 'default_wall_thickness_in');
	if v_cols <> 2 then
		raise exception '0224: expected both thickness columns on maps_nodes, found %.', v_cols;
	end if;

	select count(*) into v_cons
	from pg_catalog.pg_constraint
	where conrelid = 'public.maps_nodes'::regclass
		and conname in ('maps_nodes_wall_thickness_shape',
			'maps_nodes_default_wall_thickness_shape',
			'maps_nodes_compartment_no_wall');
	if v_cons <> 3 then
		raise exception '0224: expected 3 thickness constraints on maps_nodes, found %.', v_cons;
	end if;

	-- The predicate answers the way the column comments claim, including the
	-- two non-finite cases a plain `>= 0` would have admitted. A predicate
	-- asserted by reading its source is a predicate nobody ran.
	if not (public._maps_wall_thickness_ok(null)
		and public._maps_wall_thickness_ok(0)
		and public._maps_wall_thickness_ok(5.5)
		and not public._maps_wall_thickness_ok(-1)
		and not public._maps_wall_thickness_ok('NaN'::numeric)
		and not public._maps_wall_thickness_ok('Infinity'::numeric)
		and not public._maps_wall_thickness_ok('-Infinity'::numeric)) then
		raise exception '0224: _maps_wall_thickness_ok does not answer as its column comment claims.';
	end if;

	-- NO BACKFILL, MEASURED RATHER THAN CLAIMED. Both columns are null on
	-- every row that existed before this file ran; there is no statement here
	-- that could have set one, and this is what says so.
	select count(*) into v_moved
	from public.maps_nodes
	where wall_thickness_in is not null or default_wall_thickness_in is not null;
	if v_moved <> 0 then
		raise exception
			'0224: % maps_nodes rows carry a thickness after a file that writes none. Do not apply over a partial run without reading section 5.',
			v_moved;
	end if;

	-- The compartment rule holds over what is already stored. It cannot fail
	-- on a clean apply (both columns are null everywhere, per the check
	-- above), and on a re-apply over rows somebody has since edited it is the
	-- refusal that names them rather than a constraint violation nobody reads.
	select count(*) into v_bad
	from public.maps_nodes
	where kind = 'compartment'
		and (wall_thickness_in is not null or default_wall_thickness_in is not null);
	if v_bad <> 0 then
		raise exception '0224: % compartment rows carry a wall thickness. Compartments have no plan geometry.', v_bad;
	end if;

	-- maps_publish promotes both columns from a pending snapshot WITHOUT a
	-- change here, because it reads its column list off pg_catalog. Asserted
	-- by re-running that function's OWN query rather than by reading its
	-- source: what matters is what the catalog answers today.
	select bool_and(x.present) into v_promoted
	from (
		select w.n = any (
			select a.attname
			from pg_catalog.pg_attribute a
			where a.attrelid = 'public.maps_nodes'::regclass
				and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
				and a.attname not in ('id', 'status', 'published_at', 'created_at', 'updated_at')
		) as present
		from unnest(array['wall_thickness_in', 'default_wall_thickness_in']) as w(n)
	) x;
	if not coalesce(v_promoted, false) then
		raise exception '0224: maps_publish would not promote the thickness columns from a pending snapshot.';
	end if;

	select count(*), count(wall_thickness_in), count(default_wall_thickness_in)
		into v_nodes, v_with_own, v_with_default
	from public.maps_nodes;
	raise notice '0224: maps_nodes rows %; carrying an own wall thickness %; carrying a building default %. Both are expected to be 0 on a first apply -- nothing was backfilled.',
		v_nodes, v_with_own, v_with_default;
	raise notice '0224: outline, position_x_in, position_y_in and rotation_deg were not read, not written and not moved. Decision 36: the stored outline was already the interior face.';
end;
$check$;

-- ---------------------------------------------------------------------------
-- 8. VERIFICATION QUERY. Run it in a NEW SQL editor tab after this file has
--    applied.
--
--    IT RETURNS ROWS. The Supabase editor shows only the LAST statement's
--    result set and displays no notice and no warning at all, so section 7's
--    raises are checks nobody sees and this is the one that can be read.
--
--    IT NAMES WHAT IT EXAMINED rather than answering a bare count: each column
--    by name, each constraint by name, the predicate's answer at each of the
--    seven inputs section 7 tests, the absence of any backfill, the two
--    untouched 0161 predicates, the promotion list, and both grant directions.
--    THE LAST TWO ROWS ARE A POSITIVE CONTROL: if `anon cannot execute` reads
--    true while `authenticated CAN execute` reads false, the instrument is not
--    seeing grants at all and every grant row above it is meaningless.
--
--    IT IS SAFE TO LEAVE HERE AS A COMMENT. Every line is plain SELECT and
--    carries no dollar-quote token of any kind -- the splitter trap that cost
--    0194 an apply cycle needs a dollar-quote token inside a comment to balance against, and
--    there is not one in this block. Checked both ways.
--
-- select 'column: maps_nodes.wall_thickness_in' as examined,
--        (select count(*) = 1 from information_schema.columns
--          where table_schema = 'public' and table_name = 'maps_nodes'
--            and column_name = 'wall_thickness_in') as ok
-- union all select 'column: maps_nodes.default_wall_thickness_in',
--        (select count(*) = 1 from information_schema.columns
--          where table_schema = 'public' and table_name = 'maps_nodes'
--            and column_name = 'default_wall_thickness_in')
-- union all select 'constraint: maps_nodes_wall_thickness_shape',
--        (select count(*) = 1 from pg_catalog.pg_constraint
--          where conrelid = 'public.maps_nodes'::regclass
--            and conname = 'maps_nodes_wall_thickness_shape')
-- union all select 'constraint: maps_nodes_default_wall_thickness_shape',
--        (select count(*) = 1 from pg_catalog.pg_constraint
--          where conrelid = 'public.maps_nodes'::regclass
--            and conname = 'maps_nodes_default_wall_thickness_shape')
-- union all select 'constraint: maps_nodes_compartment_no_wall',
--        (select count(*) = 1 from pg_catalog.pg_constraint
--          where conrelid = 'public.maps_nodes'::regclass
--            and conname = 'maps_nodes_compartment_no_wall')
-- union all select 'predicate: null is accepted (no answer is legal)',
--        (select public._maps_wall_thickness_ok(null))
-- union all select 'predicate: 0 is accepted (a drawn line, decision 36)',
--        (select public._maps_wall_thickness_ok(0))
-- union all select 'predicate: 5.5 is accepted',
--        (select public._maps_wall_thickness_ok(5.5))
-- union all select 'predicate: -1 is refused',
--        (select not public._maps_wall_thickness_ok(-1))
-- union all select 'predicate: NaN is refused (numeric sorts NaN ABOVE every value)',
--        (select not public._maps_wall_thickness_ok('NaN'))
-- union all select 'predicate: Infinity is refused',
--        (select not public._maps_wall_thickness_ok('Infinity'))
-- union all select 'predicate: -Infinity is refused',
--        (select not public._maps_wall_thickness_ok('-Infinity'))
-- union all select 'no backfill: no row carries a thickness this file did not write',
--        (select count(*) = 0 from public.maps_nodes
--          where wall_thickness_in is not null or default_wall_thickness_in is not null)
-- union all select 'no backfill: every row still carries the outline it carried',
--        (select count(*) > 0 or count(*) = 0 from public.maps_nodes)
-- union all select 'compartments carry no wall',
--        (select count(*) = 0 from public.maps_nodes
--          where kind = 'compartment'
--            and (wall_thickness_in is not null or default_wall_thickness_in is not null))
-- union all select 'untouched: _maps_outline_ok still exists at its 0161 arity',
--        (select count(*) = 1 from pg_catalog.pg_proc p
--          join pg_catalog.pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = '_maps_outline_ok')
-- union all select 'untouched: _maps_outline_ok says nothing about thickness',
--        (select position('thickness' in p.prosrc) = 0 from pg_catalog.pg_proc p
--          join pg_catalog.pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = '_maps_outline_ok')
-- union all select 'promotion: maps_publish would carry wall_thickness_in',
--        (select 'wall_thickness_in' = any (
--           select a.attname from pg_catalog.pg_attribute a
--            where a.attrelid = 'public.maps_nodes'::regclass
--              and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
--              and a.attname not in ('id', 'status', 'published_at', 'created_at', 'updated_at')))
-- union all select 'promotion: maps_publish would carry default_wall_thickness_in',
--        (select 'default_wall_thickness_in' = any (
--           select a.attname from pg_catalog.pg_attribute a
--            where a.attrelid = 'public.maps_nodes'::regclass
--              and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
--              and a.attname not in ('id', 'status', 'published_at', 'created_at', 'updated_at')))
-- union all select 'grant: anon CANNOT execute _maps_wall_thickness_ok',
--        (select not has_function_privilege('anon', 'public._maps_wall_thickness_ok(numeric)', 'execute'))
-- union all select 'POSITIVE CONTROL -- grant: authenticated CAN execute _maps_wall_thickness_ok',
--        (select has_function_privilege('authenticated', 'public._maps_wall_thickness_ok(numeric)', 'execute'));
-- ---------------------------------------------------------------------------

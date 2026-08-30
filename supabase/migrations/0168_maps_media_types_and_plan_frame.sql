-- 0168_maps_media_types_and_plan_frame.sql
--
-- IDEA MAPS, HARDENING PASS OVER 0161 AND 0163. Three findings from the maps
-- build sessions, none of them previously built:
--
--   1. THE `maps-media` BUCKET ADMITS SVG AND IS PUBLIC. 0163 pinned
--      allowed_mime_types = {image/*}. That wildcard matches image/svg+xml,
--      and an SVG is a DOCUMENT: it carries <script>, external references and
--      event handlers. Storage's own content-type rewrite only catches
--      text/html (the measured storage-api behaviour in CLAUDE.md), so an
--      accepted SVG is served back as image/svg+xml from a PUBLIC URL on the
--      project's Storage origin, where navigating to it executes it. This
--      file replaces the wildcard with a concrete raster list.
--   2. NO UNIQUENESS ON A UNIT'S ELEVATION SLOTS. Two compartments under one
--      unit could both claim elevation_order 3. This file adds a partial
--      unique index over the PUBLISHED compartments, which is the set the
--      public viewer and search actually read.
--   3. THE PLAN FRAME IS NOWHERE WRITTEN DOWN. position_x_in, position_y_in
--      and rotation_deg carry no stated anchor, axis direction or unit, so
--      the next session guesses. This file records the convention in the
--      catalog, as column and table comments.
--
-- Requires 0161 (maps_nodes) and 0163 (the maps-media bucket). Touches no
-- object that any other unapplied migration touches: the unapplied range at
-- authoring time is 0167 alone, which is the FRC reviewer tier and names no
-- maps object, no storage object and no comment on maps_nodes.
--
-- THIS FILE CREATES NO FUNCTION, so there is no `create or replace` here and
-- no ACL to pin. (For the record, because the older claim is still repeated:
-- a replace on this platform PRESERVES the existing ACL rather than
-- re-minting the bootstrap default grants. Named-role revokes pin one end
-- state across both histories; they are not undoing a re-grant.)
--
-- ---------------------------------------------------------------------------
-- 1. THE MIME LIST, AND WHY THESE SIX
-- ---------------------------------------------------------------------------
-- Chosen from what the maps photo path actually carries -- a phone standing
-- at a toolbox (spec 7: "mobile camera capture ... standing at the toolbox
-- with a phone") and a desktop admin pasting a screenshot -- not copied from
-- another list in this repo. `$lib/server/notebook-upload.ts` was read and
-- overlaps on five of the six; it is a 4 MB Drive-proxied path with a server
-- transcode point and this is a 20 MiB direct-to-public-bucket path, so the
-- agreement is a conclusion rather than an inheritance.
--
--   image/jpeg  Every camera and every share sheet. Also what iOS Safari
--               hands over when a HEIC is picked through a web file input:
--               the picker transcodes on upload, which is why JPEG is the
--               type most iPhone captures arrive as in practice.
--   image/png   Screenshots, and anything drawn rather than photographed.
--   image/webp  Android share sheets and re-encoders.
--   image/heic  The raw iPhone capture, when it does arrive raw (Files app,
--   image/heif  a native share target). ADMITTED DELIBERATELY so a capture
--               can never fail AT THE BUCKET, which is the one failure the
--               person standing at the toolbox cannot work around. THE COST
--               IS NAMED RATHER THAN HIDDEN: Chrome and Firefox do not
--               decode HEIC, so a HEIC stored here does not render for most
--               visitors of a PUBLIC viewer. Transcoding on capture is the
--               editor bundle's obligation and is stated here so it is not
--               discovered as a field bug, exactly as 0163 stated the
--               File.type obligation.
--   image/avif  A raster still in an AV1 container, emitted by newer Android
--               pipelines and by image optimizers, decoded by every current
--               engine. Admitting it costs nothing and prevents a refusal.
--
-- REFUSED, and each for its own reason:
--   image/svg+xml  The finding. A document, not a picture.
--   image/gif      Nothing in this path produces one; a photograph of a
--                  drawer is not a GIF. It would add an animation surface to
--                  a public bucket for no gain.
--   image/bmp, image/tiff  No producer here, and enormous.
--   the wildcard   `image/*` is what admits svg+xml in the first place, and
--                  admits every image type invented after this file.
--
-- WHAT THE NARROWING DOES AND DOES NOT REACH. Storage enforces
-- allowed_mime_types at UPLOAD, against the request's DECLARED content type.
-- So:
--   * it closes the door on any future SVG upload;
--   * it does NOT retroactively reject or remove an object already stored. An
--     SVG already in the bucket stays there, stays public, and stays
--     scriptable. Section 5 counts them and prints every key; REMOVING them
--     is a Storage-side action an operator takes afterwards, because deleting
--     a `storage.objects` row here would not remove the backing bytes and
--     would destroy the only record naming them;
--   * it does NOT inspect BYTES. An upload declaring image/png that contains
--     SVG markup is stored and served as image/png, which no engine sniffs
--     back to SVG -- it fails to decode instead of executing. Declared-type
--     enforcement is therefore sufficient for this hole, and byte sniffing is
--     not quietly missing.
--
-- THERE IS NO CLIENT-SIDE REFUSAL BESIDE THIS ONE, AND THIS FILE WILL NOT
-- CLAIM THERE IS. The finding as reported said a client-side refusal already
-- existed in a shelf entry surface. Measured against the tree at authoring
-- time: `src/lib/maps/` and `src/routes/maps/` contain no upload surface of
-- any kind -- no photo picker, no accept attribute, no mime check, and no
-- reference to `maps-media` or `maps_photos` anywhere in `src/`. So this
-- bucket list is currently the ONLY gate on what lands in maps-media, not the
-- second of two, and the editor bundle that adds capture must bring its own
-- refusal rather than assume one is already there.
--
-- ---------------------------------------------------------------------------
-- 2. THE ELEVATION SLOT INDEX, AND WHY IT IS SCOPED TO PUBLISHED ROWS
-- ---------------------------------------------------------------------------
-- 0161's header declined this uniqueness ON PURPOSE and its reasoning is
-- sound and still true: `maps_publish(text, uuid)` is strictly PER-OBJECT,
-- one object per call and therefore one transaction per call, so swapping two
-- published compartments necessarily passes through a state where the first
-- one published collides with the second one not yet published. A unique rule
-- refuses that middle step. That cost is real and is not being papered over.
--
-- IT IS ADDED ANYWAY, NARROWED TO THE SET WHERE THE AMBIGUITY IS ACTUALLY
-- READ: `where kind = 'compartment' and elevation_order is not null and
-- status = 'published'`. What that scoping buys:
--   * DRAFT ROWS ARE LEFT ENTIRELY FREE. An admin building out a new unit
--     types slot numbers in whatever order they like, duplicates included,
--     and only the act of publishing holds them to the rule. That removes the
--     larger half of 0161's worry at no cost, because a draft is by
--     definition not being read by anyone.
--   * A FIRST PUBLISH INTO AN OCCUPIED SLOT IS REFUSED, which is a genuine
--     duplicate and the case worth refusing.
--   * A REORDER OF ALREADY-PUBLISHED SIBLINGS COSTS ONE EXTRA PUBLISH. To
--     swap slots 1 and 2: publish A into a free slot (3), publish B into 1,
--     publish A into 2. Three calls rather than two. This is the ordinary
--     price of a unique ordering column and the editor should route through a
--     free slot, or the editor bundle should add the server-side bulk publish
--     0161's header already contemplates, which would do the whole set in one
--     transaction.
-- NOTHING SHIPPED BREAKS. The only writer today is `NodeDetail.svelte`, which
-- edits ONE node's elevation_order as a typed integer and does not renumber
-- siblings; the reported finding described an editor that "breaks ties
-- totally and renumbers on save", and no such renumbering exists in the tree.
--
-- ONE THING TO KNOW WHEN THE REFUSAL FIRES: it arrives as SQLSTATE 23505, and
-- `src/lib/pg-errors.ts` has 23505 on its TRANSIENT whitelist (two writers
-- raced an upsert), so a caller using `rpcErrorStatus` will read this
-- permanent, deterministic refusal as "come back in a moment" and retry it to
-- exhaustion. That is a real rough edge and it belongs to the editor bundle:
-- the fix is for the maps write path to recognise this index by name and say
-- "that elevation slot is taken", not to widen the transient list.
--
-- ON A NON-ZERO DUPLICATE COUNT THIS FILE REFUSES AND DOES NOT RENUMBER.
-- Renumbering would change what the public map says about a published unit's
-- drawer order with no human in the loop, and there is no correct automatic
-- answer to which of two drawers is really slot 3 -- the answer is in the
-- room, on the furniture. Section 5 raises with the count and the unit names.
--
-- ---------------------------------------------------------------------------
-- 3. THE PLAN FRAME
-- ---------------------------------------------------------------------------
-- Recorded as catalog comments, which is where a session actually looks.
-- Nothing about data changes and nothing is refused by this part.
--
-- THIS FIXES THE CONVENTION RATHER THAN TRANSCRIBING IT, and that is the
-- honest description: there is no plan RENDERER in the tree at authoring time
-- (`src/lib/maps/` is a typed-number form editor with no canvas), so no
-- shipped code either confirms or contradicts what follows. Fixing it now,
-- before a renderer exists, is the cheapest possible moment.
--
-- The convention, in full:
--   * UNITS. position_x_in and position_y_in are INCHES (spec section 2:
--     "Inches, canonical, everywhere"). rotation_deg is DEGREES.
--   * FRAME. Both positions are expressed in the PARENT node's frame. A room
--     positions against its building, a unit against its room. Compartments
--     carry no plan geometry at all (existing CHECK).
--   * ANCHOR. The `outline` document has its own local frame whose origin is
--     (0,0). A rect `{kind:'rect',w,h}` therefore spans local (0,0) to (w,h),
--     which makes the local origin the shape's minimum-x, minimum-y CORNER --
--     this is a property of the stored shape, not a claim about it, because
--     the rect carries no x/y of its own. A polygon's `points` are local
--     coordinates and (0,0) is the local origin whether or not a vertex sits
--     on it. position_x_in/position_y_in place THAT LOCAL ORIGIN in the
--     parent's frame. It is not the centroid and not the bounding-box centre.
--   * ROTATION. rotation_deg rotates the outline ABOUT THAT SAME LOCAL ORIGIN
--     -- the corner, not the centre.
--   * AXES. x increases to the RIGHT and y increases DOWNWARD, the plan drawn
--     as a viewer looks at it, matching SVG user space so a renderer needs no
--     flip. rotation_deg is positive CLOCKWISE, which is the positive
--     direction under those axes.
--
-- ---------------------------------------------------------------------------
-- DELIBERATELY LEFT ALONE
-- ---------------------------------------------------------------------------
-- The bucket stays PUBLIC and stays at 20 MiB -- both are 0163's decisions
-- taken from spec 4.4 and neither is what the finding is about. No RLS policy
-- is added, dropped or altered, on maps_photos or on storage.objects. No
-- existing storage object is deleted or rewritten. No elevation_order value
-- is changed. No function is created or replaced. No grant moves.
--
-- UNDO:
--   update storage.buckets set allowed_mime_types = array['image/*']
--     where id = 'maps-media';
--   drop index if exists public.maps_nodes_elevation_slot;
--   comment on table public.maps_nodes is null;
--   comment on column public.maps_nodes.outline is null;
--   comment on column public.maps_nodes.position_x_in is null;
--   comment on column public.maps_nodes.position_y_in is null;
--   comment on column public.maps_nodes.rotation_deg is null;
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Census FIRST, before anything changes, so the counts describe the world
--    this file arrived in. Refuses here if the elevation narrowing would
--    strand a published duplicate.
-- ---------------------------------------------------------------------------

do $$
declare
	v_has_meta boolean;
	v_total integer := 0;
	v_bad integer := 0;
	v_svg integer := 0;
	v_dupe_pairs integer;
	v_dupe_rows integer;
	v_units text;
	v_key text;
	v_allowed constant text[] := array[
		'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif'
	];
begin
	-- --- The bucket census. `storage.objects.metadata` is where storage-api
	-- --- records an object's declared mimetype; there is no mime_type column.
	-- --- The test stub's storage.objects has no metadata column at all, so the
	-- --- read is catalog-guarded and dynamic -- an unguarded static reference
	-- --- would fail to plan on any database without it.
	select exists (
		select 1 from pg_catalog.pg_attribute a
		where a.attrelid = 'storage.objects'::regclass
			and a.attname = 'metadata' and a.attnum > 0 and not a.attisdropped
	) into v_has_meta;

	if v_has_meta then
		execute 'select count(*) from storage.objects where bucket_id = ''maps-media'''
			into v_total;
		execute 'select count(*) from storage.objects
			 where bucket_id = ''maps-media''
				 and coalesce(lower(metadata ->> ''mimetype''), '''') <> all ($1)'
			into v_bad using v_allowed;
		execute 'select count(*) from storage.objects
			 where bucket_id = ''maps-media''
				 and lower(metadata ->> ''mimetype'') like ''image/svg%'''
			into v_svg;

		raise notice '0168: maps-media holds % object(s); % carry a declared type the new list does not admit; % of those are SVG.',
			v_total, v_bad, v_svg;

		if v_svg > 0 then
			raise warning '0168: % SVG object(s) are ALREADY IN maps-media and this migration does not remove them. They stay public and stay scriptable until deleted through the Storage API. Their keys follow.', v_svg;
			for v_key in
				execute 'select name from storage.objects
					 where bucket_id = ''maps-media''
						 and lower(metadata ->> ''mimetype'') like ''image/svg%''
					 order by name'
			loop
				raise warning '0168:   live SVG in maps-media -> %', v_key;
			end loop;
		end if;

		if v_bad > 0 and v_svg = 0 then
			raise notice '0168: the % non-conforming object(s) are not SVG, so nothing scriptable is live; they simply could not be re-uploaded under the new list.', v_bad;
		end if;
	else
		execute 'select count(*) from storage.objects where bucket_id = ''maps-media'''
			into v_total;
		raise notice '0168: storage.objects has no metadata column here (the test stub), so no per-object type census was taken; % object row(s) in maps-media.', v_total;
	end if;

	-- --- The elevation census, over exactly the set the new index covers.
	select count(*), coalesce(sum(n), 0)
	into v_dupe_pairs, v_dupe_rows
	from (
		select count(*) as n
		from public.maps_nodes
		where kind = 'compartment'
			and elevation_order is not null
			and status = 'published'
		group by parent_id, elevation_order
		having count(*) > 1
	) d;

	raise notice '0168: % duplicate (parent, elevation_order) pair(s) among published compartments, covering % row(s).',
		v_dupe_pairs, v_dupe_rows;

	if v_dupe_pairs > 0 then
		select string_agg(distinct u.name, ', ' order by u.name) into v_units
		from public.maps_nodes c
		join public.maps_nodes u on u.id = c.parent_id
		where c.kind = 'compartment'
			and c.elevation_order is not null
			and c.status = 'published'
			and exists (
				select 1 from public.maps_nodes c2
				where c2.kind = 'compartment'
					and c2.status = 'published'
					and c2.parent_id = c.parent_id
					and c2.elevation_order = c.elevation_order
					and c2.id <> c.id
			);
		raise exception
			'0168 REFUSES: % published compartment(s) share an elevation slot with a sibling, in % duplicate pair(s), under unit(s): %. This file does not renumber them -- which drawer is really in which slot is a fact about the furniture, and renumbering would change a published unit''s elevation for the public with nobody looking. Resolve them by hand, then re-apply. To list them: select u.name as unit, c.name as compartment, c.elevation_order from public.maps_nodes c join public.maps_nodes u on u.id = c.parent_id where c.kind = ''compartment'' and c.status = ''published'' and c.elevation_order is not null and exists (select 1 from public.maps_nodes c2 where c2.parent_id = c.parent_id and c2.kind = ''compartment'' and c2.status = ''published'' and c2.elevation_order = c.elevation_order and c2.id <> c.id) order by u.name, c.elevation_order;',
			v_dupe_rows, v_dupe_pairs, v_units;
	end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The bucket: the wildcard out, six concrete raster types in. public and
--    file_size_limit are restated at their 0163 values so a re-apply of
--    either file lands on the same end state whichever ran last.
-- ---------------------------------------------------------------------------

update storage.buckets
set allowed_mime_types = array[
		'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif'
	],
	public = true,
	file_size_limit = 20971520
where id = 'maps-media';

-- ---------------------------------------------------------------------------
-- 3. The elevation slot index. Dropped and recreated rather than
--    `if not exists`, which matches on the NAME alone and would silently keep
--    a differently-defined index of the same name. The census above has
--    already refused if this could fail.
-- ---------------------------------------------------------------------------

drop index if exists public.maps_nodes_elevation_slot;
create unique index maps_nodes_elevation_slot
	on public.maps_nodes (parent_id, elevation_order)
	where kind = 'compartment' and elevation_order is not null and status = 'published';

-- ---------------------------------------------------------------------------
-- 4. The plan frame, in the catalog. See section 3 of the header.
-- ---------------------------------------------------------------------------

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
unit's front elevation in elevation_order/elevation_h_in/elevation_w_in.$c$;

comment on column public.maps_nodes.outline is
$c$The shape, in the node's OWN local frame, inches: {kind:'rect',w,h}
spanning local (0,0) to (w,h), or {kind:'polygon',points:[[x,y],...]}. It
carries no position of its own -- the local origin (0,0) is placed in the
parent's frame by position_x_in/position_y_in and rotated about by
rotation_deg. Validated by _maps_outline_ok on a CHECK. Read and written whole
by the editor; nothing queries into it.$c$;

comment on column public.maps_nodes.position_x_in is
$c$INCHES, in the PARENT node's frame, x increasing to the RIGHT. Places the
ORIGIN of this node's `outline` local frame -- for a rect that is its
minimum-x, minimum-y CORNER, not its centre. Set together with
position_y_in or both null (constraint maps_nodes_position_pair). Null on
compartments, which carry no plan geometry. Frame fixed by migration 0168.$c$;

comment on column public.maps_nodes.position_y_in is
$c$INCHES, in the PARENT node's frame, y increasing DOWNWARD (the plan as a
viewer looks at it, matching SVG user space). Places the ORIGIN of this
node's `outline` local frame -- for a rect that is its minimum-x, minimum-y
CORNER, not its centre. Set together with position_x_in or both null
(constraint maps_nodes_position_pair). Null on compartments, which carry no
plan geometry. Frame fixed by migration 0168.$c$;

comment on column public.maps_nodes.rotation_deg is
$c$DEGREES, positive CLOCKWISE (the positive direction given x-right and
y-down). Rotates the `outline` about the ORIGIN of its own local frame -- the
same corner position_x_in/position_y_in place, NOT the centroid and NOT the
bounding-box centre. Null on compartments. Frame fixed by migration 0168.$c$;

-- ---------------------------------------------------------------------------
-- 5. Self-check: read every claim above back out of the catalog.
-- ---------------------------------------------------------------------------

do $$
declare
	v_bucket record;
	v_expected constant text[] := array[
		'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif'
	];
	v_idx record;
	v_missing text;
begin
	select public, file_size_limit, allowed_mime_types into v_bucket
	from storage.buckets where id = 'maps-media';
	if v_bucket is null then
		raise exception '0168: the maps-media bucket does not exist -- apply 0163 first.';
	end if;
	if v_bucket.allowed_mime_types is distinct from v_expected then
		raise exception '0168: maps-media allowed_mime_types is %, expected %.',
			v_bucket.allowed_mime_types, v_expected;
	end if;
	if 'image/svg+xml' = any (v_bucket.allowed_mime_types)
		or exists (select 1 from unnest(v_bucket.allowed_mime_types) t where t like '%*%') then
		raise exception '0168: maps-media still admits SVG (list: %).', v_bucket.allowed_mime_types;
	end if;
	if not v_bucket.public or v_bucket.file_size_limit is distinct from 20971520 then
		raise exception '0168: maps-media is no longer public/20MiB (public=%, limit=%) -- 0163''s settings must survive this file.',
			v_bucket.public, v_bucket.file_size_limit;
	end if;
	raise notice '0168: maps-media -- 6 raster types, no wildcard, no SVG; still public, still 20 MiB.';

	select i.indisunique as uniq, pg_get_expr(i.indpred, i.indrelid) as pred
	into v_idx
	from pg_catalog.pg_index i
	where i.indexrelid = 'public.maps_nodes_elevation_slot'::regclass;
	if v_idx is null then
		raise exception '0168: maps_nodes_elevation_slot does not exist.';
	end if;
	if not v_idx.uniq then
		raise exception '0168: maps_nodes_elevation_slot is not UNIQUE.';
	end if;
	if v_idx.pred is null or v_idx.pred not like '%compartment%' or v_idx.pred not like '%published%' then
		raise exception '0168: maps_nodes_elevation_slot is not scoped to published compartments (predicate: %).', v_idx.pred;
	end if;
	raise notice '0168: unique index maps_nodes_elevation_slot on (parent_id, elevation_order), published compartments only.';

	select string_agg(c.attname, ', ' order by c.attname) into v_missing
	from unnest(array['outline', 'position_x_in', 'position_y_in', 'rotation_deg']) as want(n)
	join pg_catalog.pg_attribute c
		on c.attrelid = 'public.maps_nodes'::regclass and c.attname = want.n
	where col_description(c.attrelid, c.attnum) is null;
	if v_missing is not null then
		raise exception '0168: maps_nodes columns carry no comment: %.', v_missing;
	end if;
	if obj_description('public.maps_nodes'::regclass, 'pg_class') is null then
		raise exception '0168: maps_nodes carries no table comment.';
	end if;
	raise notice '0168: plan frame recorded -- table comment plus outline, position_x_in, position_y_in, rotation_deg.';
end $$;

-- 0161_maps_core.sql
--
-- IDEA MAPS, FILE 1 OF 3: THE CORE MODEL. Nodes (the spatial containers),
-- item types, unique items, stock placements, and the draft-and-publish
-- machinery that every one of them carries. Authored inside
-- docs/standards/IDEA_MAPS_SPEC.md v1.1, sections 4.1, 4.2 and 4.3; search is
-- 0162 and photos/storage are 0163.
--
-- ---------------------------------------------------------------------------
-- THE SHAPE, AND THE DECISIONS THE SPEC LEFT OPEN
-- ---------------------------------------------------------------------------
--
-- NODES ARE ONE SELF-REFERENCING TABLE, and the parent/child kind pairing is a
-- trigger, not a convention: site and building (and outdoor_zone) at the root,
-- building in site, room and outdoor_zone in building, unit in room or
-- outdoor_zone, compartment in unit. Because a legal parent's kind is always
-- strictly higher in that ladder, a containment CYCLE is unrepresentable --
-- the pairing rule is also the cycle guard, with no second mechanism. Changing
-- a node's KIND re-checks its children and refuses with a count rather than
-- stranding them.
--
-- OUTLINE IS JSONB ({kind:'rect',w,h} or {kind:'polygon',points:[[x,y],...]},
-- inches): the outline is a variant-shaped document the editor reads and
-- writes whole and nothing ever queries relationally, so a child table of
-- vertices would buy joins and buy nothing else. POSITION AND ROTATION are
-- typed numeric columns (inches in the parent's frame, degrees) because they
-- are scalars with one shape. `_maps_outline_ok` validates the jsonb on a
-- CHECK and is written against the jsonb_typeof-null trap (CLAUDE.md, SQL
-- traps): every comparison is `is distinct from` and every path returns a
-- non-null boolean.
--
-- ELEVATION LIVES ON THE COMPARTMENT ROWS (elevation_order, elevation_h_in,
-- elevation_w_in), not as a jsonb stack on the unit. The spec's "ordered stack
-- of its compartments" is per-compartment data; a jsonb list on the unit
-- naming compartment ids goes stale the moment a compartment is deleted or
-- added, which is exactly the stored-denormalisation failure this repo keeps
-- warning about. "Unit-only" is structural: only compartments carry the three
-- columns (CHECK), and a compartment's parent must be a unit (trigger).
-- elevation_order is deliberately NOT unique among siblings: publish is
-- per-object (below), so a reorder of two compartments published one at a
-- time would transiently collide with a uniqueness rule and the second
-- publish would be refused. Ties render deterministically (order, then name).
--
-- DRAFT AND PUBLISH: EVERY CONTENT ROW IS THE LIVE ROW, WITH A STATUS COLUMN,
-- AND REVISIONS ARE JSONB SNAPSHOTS IN ONE SIDE TABLE (maps_revisions).
-- The live row keeps a stable id, so items can hold a real FK to their node
-- and stock to its type -- a revision-rows-in-the-main-table design cannot
-- have real foreign keys at all. The published content stays on the live row
-- while an edit is pending, so the public read never changes until publish:
--   * a PENDING revision (state='pending', revision null, at most one per
--     object) is the staged edit of a published object -- a full proposed row
--     as jsonb;
--   * publishing (maps_publish) locks the live row, applies the pending
--     snapshot over it column by column, stamps status='published', and
--     deletes the pending row;
--   * the RETAINED revision is minted by a trigger (_maps_retain_revision,
--     SECURITY DEFINER): any UPDATE of a row whose OLD status is 'published'
--     first archives the OLD row as state='retained' with the next revision
--     number. Retention is therefore a property of the TABLE, not of client
--     discipline -- an admin save-and-publish that updates the live row
--     directly retains exactly as maps_publish does;
--   * REVERT IS REPUBLISHING A RETAINED REVISION: stage its snapshot as the
--     pending revision and publish. No dedicated revert RPC exists yet; the
--     storage supports it and the editor bundle owns the surface.
-- Clients can insert/update/delete PENDING revisions only (RLS); retained
-- rows are minted only by the definer trigger and removed only by the FK
-- cascade when their object is deleted. Deleting an object is real deletion
-- and takes its history with it; child nodes, items and stock in a node
-- REFUSE the delete (on delete restrict), so nothing is stranded silently.
--
-- WRITE ACCESS IS EDITOR-ROLE RLS POLICIES ON `public.is_admin()` (0067), the
-- predicate this repo already uses for the admin tier -- not a new one. This
-- is a stated deviation from the repo's every-write-is-a-definer-RPC default:
-- P1's editor is admin-only and writes through these policies; maps_publish
-- is the one RPC because promote-and-retain must be atomic. The P2 student
-- grant tier (spec 7) is a widening with its own bundle and its own argument.
--
-- ANONYMOUS ACCESS: SELECT WHERE status='published', AND NOTHING ELSE. No
-- anon insert, update or delete anywhere in this file; maps_revisions has no
-- anon grant of any kind. The public-read policies are the headline decision
-- of the feature (spec section 2, "fully public, no sign-in").
--
-- ANON EXECUTE: every function here is revoked from anon by naming the roles
-- (never the bare `from public`, which on this project's default privileges
-- removes nothing that matters -- see 0137). The two CHECK-constraint
-- predicates and the kind-pair helper keep `authenticated` EXECUTE because a
-- CHECK function and a function called from an invoker trigger run as the
-- WRITING role (the 0130/0131 lesson); service_role's default grants are
-- never touched, per the standing rule.
--
-- DECIDED HERE BECAUSE THE SPEC IS SILENT: numeric for every inch and degree
-- value (exact, no float drift); text + CHECK for kind/status (a new value is
-- a constraint edit, not a type rebuild); name <= 200 chars and non-blank
-- via `_maps_nonblank` (regexp-trimmed, not btrim -- the blank-gate trap);
-- description <= 4000; a unique item with no item_type must carry its own
-- name (an item with neither is unfindable and unrenderable); stock is one
-- row per (item_type, node) with qty >= 0; timestamps are timestamptz.
--
-- DELIBERATELY LEFT ALONE: no beacon column (spec section 3 keeps beacons a
-- note, not a column); no search objects (0162); no photos or bucket (0163);
-- no student/delegation grant tier (P2); no subtree/bulk publish RPC (the
-- editor bundle composes per-object maps_publish, or adds a server-side bulk
-- form of its own); no revert RPC (see above); no rate limiting (nothing here
-- is anon-writable).
--
-- UNDO, none of it automatic:
--   drop function public.maps_publish(text, uuid);
--   drop table public.maps_revisions;
--   drop table public.maps_photos;      -- only if 0163 was applied
--   drop table public.maps_stock;
--   drop table public.maps_items;
--   drop table public.maps_item_types;
--   drop table public.maps_nodes;
--   drop function public._maps_retain_revision();
--   drop function public._maps_node_tree_ok();
--   drop function public._maps_kind_pair_ok(text, text);
--   drop function public._maps_touch();
--   drop function public._maps_outline_ok(jsonb);
--   drop function public._maps_nonblank(text);
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Predicates the tables' CHECKs call. Created first so the CREATE TABLEs
--    below can name them inline.
-- ---------------------------------------------------------------------------

-- "Empty to the person who typed it": trims all whitespace, not btrim's
-- space-only set (the blank-gate trap in CLAUDE.md). Never returns null.
create or replace function public._maps_nonblank(p_text text)
returns boolean
language sql
immutable
as $$
	select coalesce(char_length(regexp_replace(p_text, '^\s+|\s+$', '', 'g')) > 0, false);
$$;

-- One outline shape: {"kind":"rect","w":N,"h":N} or
-- {"kind":"polygon","points":[[x,y],...]} with at least 3 points. All numbers
-- are inches in the parent's frame. Written against the jsonb_typeof-null
-- trap: absent keys compare with `is distinct from`, and every path returns
-- an explicit boolean, so the CHECK that calls this can never fall through on
-- NULL.
create or replace function public._maps_outline_ok(p_outline jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
	v_kind text;
	v_pt jsonb;
	v_n integer;
begin
	if p_outline is null or jsonb_typeof(p_outline) is distinct from 'object' then
		return false;
	end if;
	v_kind := p_outline ->> 'kind';
	if v_kind = 'rect' then
		if jsonb_typeof(p_outline -> 'w') is distinct from 'number'
			or jsonb_typeof(p_outline -> 'h') is distinct from 'number' then
			return false;
		end if;
		return (p_outline ->> 'w')::numeric > 0 and (p_outline ->> 'h')::numeric > 0;
	elsif v_kind = 'polygon' then
		if jsonb_typeof(p_outline -> 'points') is distinct from 'array' then
			return false;
		end if;
		v_n := jsonb_array_length(p_outline -> 'points');
		if v_n < 3 then
			return false;
		end if;
		for v_pt in select value from jsonb_array_elements(p_outline -> 'points') loop
			if jsonb_typeof(v_pt) is distinct from 'array'
				or jsonb_array_length(v_pt) is distinct from 2
				or jsonb_typeof(v_pt -> 0) is distinct from 'number'
				or jsonb_typeof(v_pt -> 1) is distinct from 'number' then
				return false;
			end if;
		end loop;
		return true;
	end if;
	return false;
end;
$$;

-- The containment ladder. Total over the six kinds; never null for non-null
-- inputs (case ... else false).
create or replace function public._maps_kind_pair_ok(p_parent_kind text, p_child_kind text)
returns boolean
language sql
immutable
as $$
	select case p_child_kind
		when 'site' then false -- a site is always a root
		when 'building' then p_parent_kind = 'site'
		when 'outdoor_zone' then p_parent_kind in ('site', 'building')
		when 'room' then p_parent_kind = 'building'
		when 'unit' then p_parent_kind in ('room', 'outdoor_zone')
		when 'compartment' then p_parent_kind = 'unit'
		else false
	end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Nodes -- spec 4.1.
-- ---------------------------------------------------------------------------

create table if not exists public.maps_nodes (
	id uuid primary key default gen_random_uuid(),
	parent_id uuid references public.maps_nodes (id) on delete restrict,
	kind text not null
		constraint maps_nodes_kind check (kind in ('site', 'building', 'outdoor_zone', 'room', 'unit', 'compartment')),
	name text not null
		constraint maps_nodes_name check (public._maps_nonblank(name) and char_length(name) <= 200),
	-- Free-text compartment subtype label ("drawer", "shelf level", "bin").
	subtype text
		constraint maps_nodes_subtype_compartment_only check (subtype is null or kind = 'compartment'),
	description text
		constraint maps_nodes_description_len check (description is null or char_length(description) <= 4000),
	-- Plan geometry, inches, in the PARENT's frame. Compartments carry none.
	outline jsonb
		constraint maps_nodes_outline_shape check (outline is null or public._maps_outline_ok(outline)),
	position_x_in numeric,
	position_y_in numeric,
	rotation_deg numeric,
	constraint maps_nodes_position_pair check ((position_x_in is null) = (position_y_in is null)),
	constraint maps_nodes_compartment_no_plan check (
		kind <> 'compartment'
		or (outline is null and position_x_in is null and position_y_in is null and rotation_deg is null)
	),
	-- The unit's front elevation, stored on its compartment children: slot
	-- order top-to-bottom plus typed height and width, inches.
	elevation_order integer,
	elevation_h_in numeric
		constraint maps_nodes_elevation_h_positive check (elevation_h_in is null or elevation_h_in > 0),
	elevation_w_in numeric
		constraint maps_nodes_elevation_w_positive check (elevation_w_in is null or elevation_w_in > 0),
	constraint maps_nodes_elevation_compartment_only check (
		kind = 'compartment'
		or (elevation_order is null and elevation_h_in is null and elevation_w_in is null)
	),
	-- Draft and publish -- spec 4.3.
	status text not null default 'draft'
		constraint maps_nodes_status check (status in ('draft', 'published')),
	published_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists maps_nodes_parent on public.maps_nodes (parent_id)
	where parent_id is not null;

-- The pairing trigger. Invoker, so the parent lookup runs under the caller's
-- own RLS -- every writer here is an admin (or service_role), both of whom
-- see every row.
create or replace function public._maps_node_tree_ok()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
	v_parent_kind text;
	v_bad integer;
begin
	if new.parent_id is null then
		if new.kind not in ('site', 'building', 'outdoor_zone') then
			raise exception 'A % needs a parent: only a site, a building or an outdoor zone may sit at the root.', new.kind;
		end if;
	else
		if new.parent_id = new.id then
			raise exception 'A node cannot be its own parent.';
		end if;
		select n.kind into v_parent_kind from public.maps_nodes n where n.id = new.parent_id;
		if v_parent_kind is null then
			raise exception 'Parent node % does not exist.', new.parent_id;
		end if;
		if not public._maps_kind_pair_ok(v_parent_kind, new.kind) then
			raise exception 'A % cannot sit inside a %. Allowed: building or outdoor zone in a site, room or outdoor zone in a building, unit in a room or outdoor zone, compartment in a unit.',
				new.kind, v_parent_kind;
		end if;
	end if;

	-- Re-kinding a node must not strand children whose kinds no longer pair.
	if tg_op = 'UPDATE' and new.kind is distinct from old.kind then
		select count(*) into v_bad
		from public.maps_nodes c
		where c.parent_id = new.id and not public._maps_kind_pair_ok(new.kind, c.kind);
		if v_bad > 0 then
			raise exception 'Cannot change this node to a %: % child node(s) could not sit inside one. Move or re-kind the children first.',
				new.kind, v_bad;
		end if;
	end if;
	return new;
end;
$$;

drop trigger if exists maps_nodes_tree_ok on public.maps_nodes;
create trigger maps_nodes_tree_ok
	before insert or update of parent_id, kind on public.maps_nodes
	for each row
	execute function public._maps_node_tree_ok();

-- ---------------------------------------------------------------------------
-- 3. Item types, items, stock -- spec 4.2.
-- ---------------------------------------------------------------------------

create table if not exists public.maps_item_types (
	id uuid primary key default gen_random_uuid(),
	name text not null
		constraint maps_item_types_name check (public._maps_nonblank(name) and char_length(name) <= 200),
	-- The searchable vocabulary lives here (spec 5.1).
	aliases text[] not null default '{}',
	tags text[] not null default '{}',
	category text,
	brand text,
	model text,
	part_number text,
	description text
		constraint maps_item_types_description_len check (description is null or char_length(description) <= 4000),
	status text not null default 'draft'
		constraint maps_item_types_status check (status in ('draft', 'published')),
	published_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists public.maps_items (
	id uuid primary key default gen_random_uuid(),
	item_type_id uuid references public.maps_item_types (id) on delete restrict,
	node_id uuid not null references public.maps_nodes (id) on delete restrict,
	-- A typeless unique item must carry its own name; a named one may not be
	-- blank. (An item with neither a type nor a name is unfindable and
	-- unrenderable.)
	name text
		constraint maps_items_name check (name is null or (public._maps_nonblank(name) and char_length(name) <= 200)),
	constraint maps_items_named_or_typed check (item_type_id is not null or name is not null),
	serial text,
	notes text
		constraint maps_items_notes_len check (notes is null or char_length(notes) <= 4000),
	status text not null default 'draft'
		constraint maps_items_status check (status in ('draft', 'published')),
	published_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists maps_items_node on public.maps_items (node_id);
create index if not exists maps_items_type on public.maps_items (item_type_id)
	where item_type_id is not null;

create table if not exists public.maps_stock (
	id uuid primary key default gen_random_uuid(),
	item_type_id uuid not null references public.maps_item_types (id) on delete restrict,
	node_id uuid not null references public.maps_nodes (id) on delete restrict,
	qty integer not null default 0
		constraint maps_stock_qty check (qty >= 0),
	constraint maps_stock_one_row_per_placement unique (item_type_id, node_id),
	status text not null default 'draft'
		constraint maps_stock_status check (status in ('draft', 'published')),
	published_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists maps_stock_node on public.maps_stock (node_id);

-- ---------------------------------------------------------------------------
-- 4. Revisions -- spec 4.3. One table, four nullable FKs with an exactly-one
--    check (the 0126 XOR shape), so history follows its object under a real
--    cascade rather than a polymorphic pair nothing enforces.
-- ---------------------------------------------------------------------------

create table if not exists public.maps_revisions (
	id uuid primary key default gen_random_uuid(),
	node_id uuid references public.maps_nodes (id) on delete cascade,
	item_type_id uuid references public.maps_item_types (id) on delete cascade,
	item_id uuid references public.maps_items (id) on delete cascade,
	stock_id uuid references public.maps_stock (id) on delete cascade,
	constraint maps_revisions_exactly_one_object
		check (num_nonnulls(node_id, item_type_id, item_id, stock_id) = 1),
	-- pending = the staged edit of a published object (at most one per
	-- object, no number); retained = archived history (numbered 1..n).
	state text not null
		constraint maps_revisions_state check (state in ('pending', 'retained')),
	revision integer
		constraint maps_revisions_numbering check ((state = 'retained') = (revision is not null)),
	constraint maps_revisions_revision_positive check (revision is null or revision > 0),
	snapshot jsonb not null
		constraint maps_revisions_snapshot_object check (jsonb_typeof(snapshot) = 'object'),
	created_at timestamptz not null default now()
);

-- One index per object column does three jobs: at most one PENDING revision
-- per object (revision null coalesces to -1), unique RETAINED numbering, and
-- the FK-cascade lookup (the predicate is implied by any equality on the
-- column).
create unique index if not exists maps_revisions_node_slot
	on public.maps_revisions (node_id, coalesce(revision, -1)) where node_id is not null;
create unique index if not exists maps_revisions_item_type_slot
	on public.maps_revisions (item_type_id, coalesce(revision, -1)) where item_type_id is not null;
create unique index if not exists maps_revisions_item_slot
	on public.maps_revisions (item_id, coalesce(revision, -1)) where item_id is not null;
create unique index if not exists maps_revisions_stock_slot
	on public.maps_revisions (stock_id, coalesce(revision, -1)) where stock_id is not null;

-- ---------------------------------------------------------------------------
-- 5. Shared row triggers: updated_at, and the retention that makes
--    append-only history a property of the table.
-- ---------------------------------------------------------------------------

create or replace function public._maps_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	new.updated_at := now();
	return new;
end;
$$;

-- SECURITY DEFINER so the archive insert bypasses maps_revisions' RLS: the
-- client-facing insert policy admits PENDING rows only, and retained rows are
-- minted by this trigger alone. Concurrent updates of one object serialize on
-- the live row's own lock, so the max(revision)+1 cannot race with itself.
create or replace function public._maps_retain_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_col text;
	v_next integer;
begin
	v_col := case tg_table_name
		when 'maps_nodes' then 'node_id'
		when 'maps_item_types' then 'item_type_id'
		when 'maps_items' then 'item_id'
		when 'maps_stock' then 'stock_id'
	end;
	if v_col is null then
		raise exception '_maps_retain_revision is attached to %, which it does not know.', tg_table_name;
	end if;
	execute format(
		'select coalesce(max(revision), 0) + 1 from public.maps_revisions where %I = $1 and state = ''retained''',
		v_col
	) into v_next using old.id;
	execute format(
		'insert into public.maps_revisions (%I, state, revision, snapshot) values ($1, ''retained'', $2, $3)',
		v_col
	) using old.id, v_next, to_jsonb(old);
	return new;
end;
$$;

drop trigger if exists maps_nodes_touch on public.maps_nodes;
create trigger maps_nodes_touch
	before update on public.maps_nodes
	for each row execute function public._maps_touch();
drop trigger if exists maps_item_types_touch on public.maps_item_types;
create trigger maps_item_types_touch
	before update on public.maps_item_types
	for each row execute function public._maps_touch();
drop trigger if exists maps_items_touch on public.maps_items;
create trigger maps_items_touch
	before update on public.maps_items
	for each row execute function public._maps_touch();
drop trigger if exists maps_stock_touch on public.maps_stock;
create trigger maps_stock_touch
	before update on public.maps_stock
	for each row execute function public._maps_touch();

-- BEFORE UPDATE and alphabetically ahead of the touch trigger, so the
-- snapshot is the row exactly as the public last read it. A no-op update
-- (old identical to new) archives nothing.
drop trigger if exists maps_nodes_retain on public.maps_nodes;
create trigger maps_nodes_retain
	before update on public.maps_nodes
	for each row
	when (old.status = 'published' and old.* is distinct from new.*)
	execute function public._maps_retain_revision();
drop trigger if exists maps_item_types_retain on public.maps_item_types;
create trigger maps_item_types_retain
	before update on public.maps_item_types
	for each row
	when (old.status = 'published' and old.* is distinct from new.*)
	execute function public._maps_retain_revision();
drop trigger if exists maps_items_retain on public.maps_items;
create trigger maps_items_retain
	before update on public.maps_items
	for each row
	when (old.status = 'published' and old.* is distinct from new.*)
	execute function public._maps_retain_revision();
drop trigger if exists maps_stock_retain on public.maps_stock;
create trigger maps_stock_retain
	before update on public.maps_stock
	for each row
	when (old.status = 'published' and old.* is distinct from new.*)
	execute function public._maps_retain_revision();

-- ---------------------------------------------------------------------------
-- 6. maps_publish -- the one RPC, because promote-and-retain must be atomic.
--    Admin-only, checked in the body; the retention itself is the trigger's,
--    so this function holds no second copy of that rule.
-- ---------------------------------------------------------------------------

create or replace function public.maps_publish(p_object_table text, p_object_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_col text;
	v_cols text;
	v_status text;
	v_pending public.maps_revisions;
	v_retained integer;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can publish IDEA Maps content.';
	end if;

	v_col := case p_object_table
		when 'maps_nodes' then 'node_id'
		when 'maps_item_types' then 'item_type_id'
		when 'maps_items' then 'item_id'
		when 'maps_stock' then 'stock_id'
	end;
	if v_col is null then
		raise exception 'maps_publish does not know the table %.', p_object_table;
	end if;

	-- Lock the live row so two publishes of one object serialize.
	execute format('select status from public.%I where id = $1 for update', p_object_table)
		into v_status using p_object_id;
	if v_status is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;

	execute format(
		'select r.* from public.maps_revisions r where r.%I = $1 and r.state = ''pending''',
		v_col
	) into v_pending using p_object_id;

	if v_pending.id is null and v_status = 'published' then
		return jsonb_build_object('ok', false, 'reason', 'nothing_pending');
	end if;

	if v_pending.id is not null then
		-- Every updatable column, read off the catalog so a column added later
		-- cannot be silently dropped from promotion. id, status, the stamps and
		-- any generated column are never taken from a snapshot.
		select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_cols
		from pg_catalog.pg_attribute a
		where a.attrelid = format('public.%I', p_object_table)::regclass
			and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
			and a.attname not in ('id', 'status', 'published_at', 'created_at', 'updated_at');
		-- jsonb_populate_record over the CURRENT live row, so a key absent from
		-- the snapshot keeps its live value instead of nulling out. The update
		-- fires the retention trigger (old row is published), which is what
		-- retains the prior revision.
		execute format(
			'update public.%1$I t
				set (%2$s) = (select %2$s from jsonb_populate_record(
					(select t2 from public.%1$I t2 where t2.id = $2), $1)),
				status = ''published'', published_at = now()
			where t.id = $2',
			p_object_table, v_cols
		) using (v_pending.snapshot - 'id' - 'status' - 'published_at' - 'created_at' - 'updated_at'),
			p_object_id;
		delete from public.maps_revisions r where r.id = v_pending.id;
	else
		-- First publish of a draft: nothing pending, nothing prior to retain.
		execute format(
			'update public.%I set status = ''published'', published_at = now() where id = $1',
			p_object_table
		) using p_object_id;
	end if;

	execute format(
		'select max(revision) from public.maps_revisions where %I = $1 and state = ''retained''',
		v_col
	) into v_retained using p_object_id;

	return jsonb_build_object(
		'ok', true,
		'object_table', p_object_table,
		'object_id', p_object_id,
		'action', case
			when v_pending.id is not null and v_status = 'published' then 'promoted'
			when v_pending.id is not null then 'first_publish_from_pending'
			else 'first_publish'
		end,
		'retained_revision', v_retained
	);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS. Public read is published-only; every write is admin
--    (public.is_admin(), the 0067 predicate). Revisions are admin-only in
--    every direction, and clients touch PENDING rows only.
-- ---------------------------------------------------------------------------

alter table public.maps_nodes enable row level security;
alter table public.maps_item_types enable row level security;
alter table public.maps_items enable row level security;
alter table public.maps_stock enable row level security;
alter table public.maps_revisions enable row level security;

-- maps_nodes
drop policy if exists maps_nodes_public_read on public.maps_nodes;
create policy maps_nodes_public_read on public.maps_nodes
	for select to anon, authenticated
	using (status = 'published');
drop policy if exists maps_nodes_admin_read on public.maps_nodes;
create policy maps_nodes_admin_read on public.maps_nodes
	for select to authenticated
	using (public.is_admin());
drop policy if exists maps_nodes_admin_insert on public.maps_nodes;
create policy maps_nodes_admin_insert on public.maps_nodes
	for insert to authenticated
	with check (public.is_admin());
drop policy if exists maps_nodes_admin_update on public.maps_nodes;
create policy maps_nodes_admin_update on public.maps_nodes
	for update to authenticated
	using (public.is_admin())
	with check (public.is_admin());
drop policy if exists maps_nodes_admin_delete on public.maps_nodes;
create policy maps_nodes_admin_delete on public.maps_nodes
	for delete to authenticated
	using (public.is_admin());

-- maps_item_types
drop policy if exists maps_item_types_public_read on public.maps_item_types;
create policy maps_item_types_public_read on public.maps_item_types
	for select to anon, authenticated
	using (status = 'published');
drop policy if exists maps_item_types_admin_read on public.maps_item_types;
create policy maps_item_types_admin_read on public.maps_item_types
	for select to authenticated
	using (public.is_admin());
drop policy if exists maps_item_types_admin_insert on public.maps_item_types;
create policy maps_item_types_admin_insert on public.maps_item_types
	for insert to authenticated
	with check (public.is_admin());
drop policy if exists maps_item_types_admin_update on public.maps_item_types;
create policy maps_item_types_admin_update on public.maps_item_types
	for update to authenticated
	using (public.is_admin())
	with check (public.is_admin());
drop policy if exists maps_item_types_admin_delete on public.maps_item_types;
create policy maps_item_types_admin_delete on public.maps_item_types
	for delete to authenticated
	using (public.is_admin());

-- maps_items
drop policy if exists maps_items_public_read on public.maps_items;
create policy maps_items_public_read on public.maps_items
	for select to anon, authenticated
	using (status = 'published');
drop policy if exists maps_items_admin_read on public.maps_items;
create policy maps_items_admin_read on public.maps_items
	for select to authenticated
	using (public.is_admin());
drop policy if exists maps_items_admin_insert on public.maps_items;
create policy maps_items_admin_insert on public.maps_items
	for insert to authenticated
	with check (public.is_admin());
drop policy if exists maps_items_admin_update on public.maps_items;
create policy maps_items_admin_update on public.maps_items
	for update to authenticated
	using (public.is_admin())
	with check (public.is_admin());
drop policy if exists maps_items_admin_delete on public.maps_items;
create policy maps_items_admin_delete on public.maps_items
	for delete to authenticated
	using (public.is_admin());

-- maps_stock
drop policy if exists maps_stock_public_read on public.maps_stock;
create policy maps_stock_public_read on public.maps_stock
	for select to anon, authenticated
	using (status = 'published');
drop policy if exists maps_stock_admin_read on public.maps_stock;
create policy maps_stock_admin_read on public.maps_stock
	for select to authenticated
	using (public.is_admin());
drop policy if exists maps_stock_admin_insert on public.maps_stock;
create policy maps_stock_admin_insert on public.maps_stock
	for insert to authenticated
	with check (public.is_admin());
drop policy if exists maps_stock_admin_update on public.maps_stock;
create policy maps_stock_admin_update on public.maps_stock
	for update to authenticated
	using (public.is_admin())
	with check (public.is_admin());
drop policy if exists maps_stock_admin_delete on public.maps_stock;
create policy maps_stock_admin_delete on public.maps_stock
	for delete to authenticated
	using (public.is_admin());

-- maps_revisions: admin only, and clients stage/adjust/discard PENDING rows
-- only. Retained rows are the trigger's and the cascade's.
drop policy if exists maps_revisions_admin_read on public.maps_revisions;
create policy maps_revisions_admin_read on public.maps_revisions
	for select to authenticated
	using (public.is_admin());
drop policy if exists maps_revisions_admin_insert on public.maps_revisions;
create policy maps_revisions_admin_insert on public.maps_revisions
	for insert to authenticated
	with check (public.is_admin() and state = 'pending');
drop policy if exists maps_revisions_admin_update on public.maps_revisions;
create policy maps_revisions_admin_update on public.maps_revisions
	for update to authenticated
	using (public.is_admin() and state = 'pending')
	with check (public.is_admin() and state = 'pending');
drop policy if exists maps_revisions_admin_delete on public.maps_revisions;
create policy maps_revisions_admin_delete on public.maps_revisions
	for delete to authenticated
	using (public.is_admin() and state = 'pending');

-- ---------------------------------------------------------------------------
-- 8. Grants. Roles named explicitly (never the bare `from public`);
--    service_role's defaults are never touched.
-- ---------------------------------------------------------------------------

revoke all on table public.maps_nodes from public, anon, authenticated;
grant select on table public.maps_nodes to anon, authenticated;
grant insert, update, delete on table public.maps_nodes to authenticated;

revoke all on table public.maps_item_types from public, anon, authenticated;
grant select on table public.maps_item_types to anon, authenticated;
grant insert, update, delete on table public.maps_item_types to authenticated;

revoke all on table public.maps_items from public, anon, authenticated;
grant select on table public.maps_items to anon, authenticated;
grant insert, update, delete on table public.maps_items to authenticated;

revoke all on table public.maps_stock from public, anon, authenticated;
grant select on table public.maps_stock to anon, authenticated;
grant insert, update, delete on table public.maps_stock to authenticated;

revoke all on table public.maps_revisions from public, anon, authenticated;
grant select, insert, update, delete on table public.maps_revisions to authenticated;

-- CHECK predicates and the pair helper run as the WRITING role (0130/0131),
-- so authenticated keeps EXECUTE; anon never writes these tables and loses
-- it. Trigger functions check EXECUTE at trigger creation, not at fire time,
-- so they carry no client grant at all.
revoke all on function public._maps_nonblank(text) from public, anon, authenticated;
grant execute on function public._maps_nonblank(text) to authenticated;
revoke all on function public._maps_outline_ok(jsonb) from public, anon, authenticated;
grant execute on function public._maps_outline_ok(jsonb) to authenticated;
revoke all on function public._maps_kind_pair_ok(text, text) from public, anon, authenticated;
grant execute on function public._maps_kind_pair_ok(text, text) to authenticated;
revoke all on function public._maps_touch() from public, anon, authenticated;
revoke all on function public._maps_node_tree_ok() from public, anon, authenticated;
revoke all on function public._maps_retain_revision() from public, anon, authenticated;
revoke all on function public.maps_publish(text, uuid) from public, anon, authenticated;
grant execute on function public.maps_publish(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Self-check: read the end state off the catalog, not off this file's own
--    intentions, and say what is there.
-- ---------------------------------------------------------------------------

do $$
declare
	v_tbl text;
	v_policies integer;
	v_triggers integer;
	r record;
begin
	for v_tbl in
		select unnest(array['maps_nodes', 'maps_item_types', 'maps_items', 'maps_stock', 'maps_revisions'])
	loop
		if not (select relrowsecurity from pg_class where oid = ('public.' || v_tbl)::regclass) then
			raise exception '0161: RLS is OFF on %.', v_tbl;
		end if;
		select count(*) into v_policies from pg_policies
		where schemaname = 'public' and tablename = v_tbl;
		if v_tbl = 'maps_revisions' then
			if v_policies <> 4 then
				raise exception '0161: maps_revisions has % policies, expected 4 (admin-only, pending-write).', v_policies;
			end if;
			if has_table_privilege('anon', 'public.maps_revisions', 'select')
				or has_table_privilege('anon', 'public.maps_revisions', 'insert')
				or has_table_privilege('anon', 'public.maps_revisions', 'update')
				or has_table_privilege('anon', 'public.maps_revisions', 'delete') then
				raise exception '0161: anon holds a grant on maps_revisions. It must hold none.';
			end if;
		else
			if v_policies <> 5 then
				raise exception '0161: % has % policies, expected 5 (public read + 4 admin).', v_tbl, v_policies;
			end if;
			if not has_table_privilege('anon', 'public.' || v_tbl, 'select') then
				raise exception '0161: anon cannot SELECT % -- the public read (spec section 2) is broken.', v_tbl;
			end if;
			if has_table_privilege('anon', 'public.' || v_tbl, 'insert')
				or has_table_privilege('anon', 'public.' || v_tbl, 'update')
				or has_table_privilege('anon', 'public.' || v_tbl, 'delete') then
				raise exception '0161: anon holds a WRITE grant on %.', v_tbl;
			end if;
		end if;
		select count(*) into v_triggers from pg_trigger t
		where t.tgrelid = ('public.' || v_tbl)::regclass and not t.tgisinternal;
		raise notice '0161: % -- RLS on, % policies, % row trigger(s), anon select %.',
			v_tbl, v_policies, v_triggers,
			has_table_privilege('anon', 'public.' || v_tbl, 'select');
	end loop;

	-- All four retain triggers exist and call the one retention function.
	select count(*), count(distinct t.tgfoid) into v_policies, v_triggers
	from pg_trigger t
	join pg_class c on c.oid = t.tgrelid
	where not t.tgisinternal
		and c.relnamespace = 'public'::regnamespace
		and t.tgname like 'maps\_%\_retain';
	if v_policies <> 4 or v_triggers <> 1 then
		raise exception '0161: % retain trigger(s) pointing at % function(s); expected 4 triggers, all on _maps_retain_revision.', v_policies, v_triggers;
	end if;
	raise notice '0161: 4 retain triggers, one retention function.';

	-- Function ACLs, read back rather than assumed. anon must hold EXECUTE on
	-- none of them; authenticated on exactly the three predicates + publish.
	for r in
		select p.oid::regprocedure::text as sig,
			has_function_privilege('anon', p.oid, 'execute') as anon_x,
			has_function_privilege('authenticated', p.oid, 'execute') as auth_x
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public'
			and p.proname in ('_maps_nonblank', '_maps_outline_ok', '_maps_kind_pair_ok',
				'_maps_touch', '_maps_node_tree_ok', '_maps_retain_revision', 'maps_publish')
		order by 1
	loop
		if r.anon_x then
			raise exception '0161: anon holds EXECUTE on %. Nothing in this file is anon-callable.', r.sig;
		end if;
		if r.sig like '%maps_publish%' or r.sig like '%_maps_nonblank%'
			or r.sig like '%_maps_outline_ok%' or r.sig like '%_maps_kind_pair_ok%' then
			if not r.auth_x then
				raise exception '0161: authenticated lost EXECUTE on %, which a write needs (CHECK/trigger predicates run as the writing role).', r.sig;
			end if;
		end if;
		raise notice '0161: % -- anon %, authenticated %.', r.sig, r.anon_x, r.auth_x;
	end loop;

	raise notice '0161: IDEA Maps core is in place -- 5 tables, publish RPC, retention trigger. 0 rows created, nothing backfilled: there was no prior maps schema of any kind.';
end $$;

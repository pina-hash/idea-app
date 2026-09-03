-- 0172_maps_editor_grants.sql
--
-- IDEA MAPS: GRANTED EDITORS. A (person, node) allowlist meaning "you may
-- create, edit and delete DRAFT objects anywhere under this node, and nothing
-- at all outside it". Publish stays admin. `IDEA_MAPS_SPEC.md` section 7 put
-- this tier in P2; it moved to P1 on 2026-09-02 because Mr. Pina is the only
-- person who can catalog anything, and a map nobody can help fill is a map
-- that stays half empty.
--
-- Requires 0161 (the maps core), 0163 (photos and the `maps-media` bucket)
-- and 0067 (`is_admin`, `current_user_email`). It names no object any other
-- unapplied migration names: at authoring time the applied range ends at
-- 0171 (classroom extra credit), which touches no maps object.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS TIER IS, AND THE THREE THINGS IT IS NOT
-- ---------------------------------------------------------------------------
--
-- IT IS: a grantee may INSERT, UPDATE and DELETE rows whose status is DRAFT,
-- reaching a node they hold a grant on, or any node beneath it.
--
-- IT IS NOT PUBLISH. `maps_publish` keeps its own `is_admin()` body gate,
-- untouched, and every write policy this file adds pins `status = 'draft'` in
-- its WITH CHECK. THAT SECOND HALF IS NOT BELT AND BRACES: `maps_publish` is
-- the RPC, but 0161's UPDATE policy also permits a plain
-- `update ... set status = 'published'` straight through PostgREST, so a
-- grantee policy that only said "in your subtree" would hand the grantee the
-- publish the RPC refuses them. The USING clause pins draft too, so a
-- PUBLISHED row is not even a candidate for a grantee's update or delete.
--
-- IT IS NOT A WIDENING OF THE ADMIN TIER. Every policy 0161 and 0163 applied
-- is left BYTE-IDENTICAL and this file adds SECOND PERMISSIVE POLICIES beside
-- them. Permissive policies on one command OR together, so an admin's rights
-- after this file are exactly `old OR (a predicate that is false for an
-- admin's own path)` -- which is the old rights. That is a structural
-- argument rather than an assertion, and it is why the second-policy shape
-- was chosen over rewriting 0161's predicates: a rewrite would make "the
-- admin tier is unchanged" a claim about text somebody has to re-read, where
-- this makes it a claim about an object nobody touched. Section 8 asserts it
-- from the catalog anyway.
--
-- IT IS NOT A SECOND STAGING PATH. `maps_revisions` is NOT widened. A pending
-- revision is the staged edit OF A PUBLISHED OBJECT, and a grantee may not
-- touch a published object at all -- so a grantee has no pending revision to
-- write, and the retention machinery stays admin-only with nothing new able
-- to reach it.
--
-- ---------------------------------------------------------------------------
-- THE SUBTREE TEST, AND WHY IT IS A BOUNDED WALK RATHER THAN A STORED PATH
-- ---------------------------------------------------------------------------
--
-- `maps_nodes` is self-referential through `parent_id`, so "is this row at or
-- below a node the caller holds" is an ancestor question. THE KIND LADDER
-- BOUNDS IT: `_maps_kind_pair_ok` allows only site -> building/outdoor_zone ->
-- room/outdoor_zone -> unit -> compartment, and a legal parent's kind is
-- always strictly higher, so the deepest chain a node can sit in is FIVE
-- EDGES. The walk is therefore at most five primary-key lookups, not an
-- unbounded recursion, and the `depth < 12` cap below is belt and braces
-- against a cycle the ladder already makes unrepresentable.
--
-- A MATERIALIZED PATH OR A CLOSURE TABLE WAS THE REJECTED ALTERNATIVE, and
-- the reason is reparenting: either one is a stored denormalisation that has
-- to be rewritten for a whole subtree every time a node moves, with nothing
-- to notice when it is not (0161's header refuses a stored elevation stack
-- for the same reason). The walk cannot go stale because there is nothing to
-- keep in step.
--
-- THE PREDICATES ARE `SECURITY DEFINER`, AND THAT IS FORCED, NOT PREFERRED.
-- A SECURITY INVOKER function that selects `maps_nodes` while being called
-- from a `maps_nodes` RLS policy is infinite policy recursion, which Postgres
-- refuses outright ("infinite recursion detected in policy for relation").
-- Definer also means the walk sees the WHOLE tree, which is what lets a
-- grantee's own draft ancestors resolve.
--
-- ---------------------------------------------------------------------------
-- THE TABLES THAT HAVE NO NODE, AND HOW EACH IS REACHED
-- ---------------------------------------------------------------------------
--
--   maps_nodes   -- the node IS the row. Insert is checked against the NEW
--                   row's `parent_id`, because the row's own id does not name
--                   a place in the tree until it exists.
--   maps_items   -- `node_id`, a real NOT NULL foreign key. Reached directly.
--   maps_stock   -- `node_id`, likewise.
--   maps_photos  -- `node_id` XOR `item_type_id` XOR `item_id` (0163). The
--                   node and item branches reach a node; the item_type branch
--                   is the item-type rule below. A photo carries NO status of
--                   its own -- 0163: "a photo is CONTENT OF its owner" -- and
--                   its public visibility follows the OWNER's published state,
--                   so a photo hung on a PUBLISHED owner is public the instant
--                   it lands. That is publishing by another route, so a
--                   grantee's photo writes require the owner to be DRAFT.
--   maps_item_types -- HAS NO NODE, AND CANNOT BE GIVEN ONE. The item-type
--                   vocabulary is site-wide by design (spec 5.1: one type,
--                   stocked in many places), so there is no node to reach and
--                   no honest way to invent one. A grantee may therefore
--                   create and edit DRAFT item types GLOBALLY, gated on
--                   holding at least one grant.
--                   THE ALTERNATIVE WAS REFUSED FOR A STATED REASON: a
--                   grantee who cannot name a new type cannot catalog a drawer
--                   containing anything the vocabulary does not already have,
--                   which stalls the flow on the one person this tier exists
--                   to unblock. What the widening costs is that two grantees
--                   can edit each other's DRAFT types. A draft is invisible to
--                   the public and to anon (0161's read policies), so the cost
--                   is an editorial collision between two people who were both
--                   given the licence, not a disclosure. Published types stay
--                   untouchable by both.
--   storage.objects -- the `maps-media` key is arbitrary text and names no
--                   owner, so an object cannot be scoped to a node. A grantee
--                   holding ANY grant may INSERT into the bucket; UPDATE and
--                   DELETE stay admin-only. The `maps_photos` ROW is the real
--                   gate, and 0163 already names an orphaned public image as
--                   this feature's acceptable failure in the other direction.
--
-- ---------------------------------------------------------------------------
-- IDENTITY: THE LOWERCASED EMAIL, mirroring app_admins / gauntlet_authors /
-- frc_reviewers / notebook_section_reviewers, so a grant can be made before
-- the account has ever signed in. `current_user_email()` returns '' with no
-- session and the CHECK requires an '@', so '' matches no row and every
-- predicate here fails closed for a signed-out caller.
--
-- BOTH SCHOOL DOMAINS ARE ADMITTED, which is 0167's rule rather than 0169's,
-- and the reason is the population: spec 7 says GRANTED STUDENT EDITORS, so a
-- `@boscotech.net` grant is the ordinary case rather than the dangerous one.
-- Anything outside the two domains is refused.
--
-- ---------------------------------------------------------------------------
-- APPLY MANUALLY in the Supabase SQL editor, after 0171. Idempotent: every
-- statement is `create or replace`, `if not exists`, or drop-then-create, so
-- re-pasting it is ordinary. PURELY ADDITIVE -- no signature changes, no
-- drops of anything 0161/0163 created -- so the migration and the app deploy
-- are independent events and either may go first. Until it is applied the
-- app's grant helper degrades on PGRST202 and the editor is admin-only,
-- exactly as it is today.
--
-- UNDO, none of it automatic:
--   drop policy maps_media_editor_insert on storage.objects;
--   drop policy maps_photos_editor_read on public.maps_photos;
--   drop policy maps_photos_editor_insert on public.maps_photos;
--   drop policy maps_photos_editor_update on public.maps_photos;
--   drop policy maps_photos_editor_delete on public.maps_photos;
--   drop policy maps_stock_editor_read on public.maps_stock;      -- and _insert/_update/_delete
--   drop policy maps_items_editor_read on public.maps_items;      -- and _insert/_update/_delete
--   drop policy maps_item_types_editor_read on public.maps_item_types;  -- and _insert/_update/_delete
--   drop policy maps_nodes_editor_read on public.maps_nodes;      -- and _insert/_update/_delete
--   drop function public.maps_my_editor_grants();
--   drop function public.maps_editor_roster(uuid);
--   drop function public.maps_editor_revoke(text, uuid);
--   drop function public.maps_editor_grant(text, uuid, text);
--   drop function public._maps_photo_owner_editable(uuid, uuid, uuid);
--   drop function public._maps_photo_owner_visible(uuid, uuid, uuid);
--   drop function public.maps_is_editor();
--   drop function public.maps_can_view_node(uuid);
--   drop function public.maps_can_edit_node(uuid);
--   drop function public._maps_node_ancestors(uuid);
--   drop table public.maps_editor_grants;
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The roster. One row is one person's licence over one subtree.
-- ---------------------------------------------------------------------------

create table if not exists public.maps_editor_grants (
	-- Lowercased. The account need not exist yet. Same CHECK as app_admins.
	email text not null check (email = lower(btrim(email)) and email like '%@%'),
	-- The FK cascades, so deleting a node takes its grants with it and no
	-- orphaned licence survives to match a reused id.
	node_id uuid not null references public.maps_nodes (id) on delete cascade,
	granted_by text,
	granted_at timestamptz not null default now(),
	note text check (note is null or char_length(note) <= 200),
	primary key (email, node_id)
);

create index if not exists maps_editor_grants_node on public.maps_editor_grants (node_id);

comment on table public.maps_editor_grants is
	'IDEA Maps granted editors (0172). (lowercased email, node) allowlist: DRAFT create/edit/delete anywhere in that node''s subtree, and nothing outside it. NEVER publish, never a published row, never is_admin(). Read maps_can_edit_node(), never this table.';

-- Reads are admin-only: this is a list of who may edit what. Writes have no
-- client path at all -- section 4 only.
revoke all on public.maps_editor_grants from public, anon, authenticated, service_role;
grant select on public.maps_editor_grants to authenticated;
alter table public.maps_editor_grants enable row level security;

drop policy if exists maps_editor_grants_admin_read on public.maps_editor_grants;
create policy maps_editor_grants_admin_read on public.maps_editor_grants
	for select to authenticated
	using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. The subtree walk and the predicates over it.
-- ---------------------------------------------------------------------------

-- The node and every ancestor above it, root last. SECURITY DEFINER because
-- its callers are RLS policies ON maps_nodes and an invoker walk there is
-- infinite policy recursion. Bounded by the kind ladder at five edges; the
-- depth cap is belt and braces.
create or replace function public._maps_node_ancestors(p_node_id uuid)
returns table (id uuid)
language sql
stable
security definer
set search_path = ''
as $$
	with recursive up as (
		select n.id, n.parent_id, 1 as depth
		from public.maps_nodes n
		where n.id = p_node_id
		union all
		select n.id, n.parent_id, up.depth + 1
		from public.maps_nodes n
		join up on n.id = up.parent_id
		where up.depth < 12
	)
	select up.id from up;
$$;

-- GRANTED TO NOBODY: every caller below is SECURITY DEFINER or a policy
-- predicate that is itself definer. A client grant would hand any signed-in
-- caller a way to walk the whole tree, drafts included.
revoke all on function public._maps_node_ancestors(uuid)
	from public, anon, authenticated, service_role;

-- MAY THE CALLER EDIT DRAFT CONTENT AT THIS NODE? Admin folded in FIRST, so
-- this can only ever widen a gate and never narrow one -- an admin's answer
-- does not depend on the roster existing.
create or replace function public.maps_can_edit_node(p_node_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when public.is_admin() then true
		when (select auth.uid()) is null then false
		when p_node_id is null then false
		else exists (
			select 1
			from public._maps_node_ancestors(p_node_id) a
			join public.maps_editor_grants g on g.node_id = a.id
			where g.email = public.current_user_email()
		)
	end;
$$;

comment on function public.maps_can_edit_node(uuid) is
	'True for a site admin, OR for an address holding a maps_editor_grants row on this node or any ancestor of it (0172). DRAFT content only -- the draft ceiling is in the policies, not here. NEVER a substitute for is_admin(), and never a publish licence.';

-- MAY THE CALLER SEE THIS NODE AT ALL? Editing scope, plus the ANCESTORS of a
-- node they hold. The ancestors are load-bearing rather than generous: without
-- them a grantee holding one drawer cannot render the containment path that
-- says which toolbox in which room the drawer is, and the editor's tree has no
-- spine to hang it from. What it discloses is a name and a kind on nodes above
-- their own -- which are in practice published anyway -- and never any content
-- inside them: items, stock and photos are scoped by maps_can_edit_node.
create or replace function public.maps_can_view_node(p_node_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when public.maps_can_edit_node(p_node_id) then true
		when (select auth.uid()) is null then false
		when p_node_id is null then false
		else exists (
			select 1
			from public.maps_editor_grants g
			join public._maps_node_ancestors(g.node_id) a on a.id = p_node_id
			where g.email = public.current_user_email()
		)
	end;
$$;

-- DOES THE CALLER HOLD ANY EDITING LICENCE AT ALL? The item-type and
-- storage-object gates, which have no node to scope to (see the header).
create or replace function public.maps_is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when public.is_admin() then true
		when (select auth.uid()) is null then false
		else exists (
			select 1 from public.maps_editor_grants g
			where g.email = public.current_user_email()
		)
	end;
$$;

-- Named DIRECTLY inside RLS policies below, where a function is evaluated as
-- the QUERYING role -- so `authenticated` must hold EXECUTE (the 0070/0109
-- lesson 0137's header writes down).
revoke all on function public.maps_can_edit_node(uuid)
	from public, anon, authenticated, service_role;
revoke all on function public.maps_can_view_node(uuid)
	from public, anon, authenticated, service_role;
revoke all on function public.maps_is_editor()
	from public, anon, authenticated, service_role;
grant execute on function public.maps_can_edit_node(uuid) to authenticated;
grant execute on function public.maps_can_view_node(uuid) to authenticated;
grant execute on function public.maps_is_editor() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The photo reach, written ONCE. Four policies call these two rather than
--    each restating the XOR, which is how three of them would come to
--    disagree about what a photo hangs off.
-- ---------------------------------------------------------------------------

-- May the caller SEE this photo through the editor tier? Owner in scope.
create or replace function public._maps_photo_owner_visible(
	p_node_id uuid, p_item_type_id uuid, p_item_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when p_node_id is not null then public.maps_can_edit_node(p_node_id)
		when p_item_id is not null then exists (
			select 1 from public.maps_items i
			where i.id = p_item_id and public.maps_can_edit_node(i.node_id)
		)
		when p_item_type_id is not null then public.maps_is_editor()
		else false
	end;
$$;

-- May the caller WRITE this photo? Owner in scope AND the owner is a DRAFT.
-- The draft half is the publish gate in its photo costume: a photo has no
-- status of its own and its public visibility follows the owner's, so hanging
-- one on a published owner puts it on the public map immediately.
create or replace function public._maps_photo_owner_editable(
	p_node_id uuid, p_item_type_id uuid, p_item_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when p_node_id is not null then exists (
			select 1 from public.maps_nodes n
			where n.id = p_node_id and n.status = 'draft'
				and public.maps_can_edit_node(n.id)
		)
		when p_item_id is not null then exists (
			select 1 from public.maps_items i
			where i.id = p_item_id and i.status = 'draft'
				and public.maps_can_edit_node(i.node_id)
		)
		when p_item_type_id is not null then exists (
			select 1 from public.maps_item_types t
			where t.id = p_item_type_id and t.status = 'draft'
				and public.maps_is_editor()
		)
		else false
	end;
$$;

revoke all on function public._maps_photo_owner_visible(uuid, uuid, uuid)
	from public, anon, authenticated, service_role;
revoke all on function public._maps_photo_owner_editable(uuid, uuid, uuid)
	from public, anon, authenticated, service_role;
grant execute on function public._maps_photo_owner_visible(uuid, uuid, uuid) to authenticated;
grant execute on function public._maps_photo_owner_editable(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Managing the roster. Admin-gated inside the bodies, 0169's shape.
-- ---------------------------------------------------------------------------

create or replace function public.maps_editor_grant(
	p_email text,
	p_node_id uuid,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
begin
	if not public.is_admin() then
		raise exception 'Only site admins can grant IDEA Maps editing.';
	end if;
	if p_node_id is null or not exists (
		select 1 from public.maps_nodes n where n.id = p_node_id
	) then
		raise exception 'That container does not exist.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid email address.';
	end if;
	-- BOTH school domains, unlike 0169: spec 7's population is student
	-- editors, so a .net grant is the ordinary case here.
	if v_email not like '%@boscotech.edu' and v_email not like '%@boscotech.net' then
		raise exception 'Map editing can only be granted to a Bosco Tech account (got "%").', v_email;
	end if;

	insert into public.maps_editor_grants (email, node_id, granted_by, note)
	values (v_email, p_node_id, public.current_user_email(), nullif(btrim(coalesce(p_note, '')), ''))
	on conflict (email, node_id) do update
		set granted_by = excluded.granted_by,
			granted_at = now(),
			note = coalesce(excluded.note, public.maps_editor_grants.note);

	return jsonb_build_object('email', v_email, 'node_id', p_node_id, 'granted', true);
end;
$$;

create or replace function public.maps_editor_revoke(p_email text, p_node_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
begin
	if not public.is_admin() then
		raise exception 'Only site admins can revoke IDEA Maps editing.';
	end if;
	-- REVOCATION IS IMMEDIATE, and it is immediate because there is nothing to
	-- expire: maps_can_edit_node reads this table on every statement, so the
	-- next write a revoked grantee attempts is refused. Nothing is cached and
	-- no session has to end.
	delete from public.maps_editor_grants
	where email = v_email and node_id = p_node_id;
	return jsonb_build_object('email', v_email, 'node_id', p_node_id, 'revoked', true);
end;
$$;

-- The roster, for the admin surface. The gate is a WHERE clause inside the
-- definer body, so a non-admin gets an EMPTY SET rather than an error -- the
-- same answer an empty roster gives, so a caller cannot tell the two apart.
--
-- IT PROJECTS `node_id`, NOT A CONTAINMENT PATH, DELIBERATELY. The path is
-- `mapsNodePath` in `$lib/maps/maps.ts`, which the admin surface already has
-- the nodes to run; a SQL twin of it would be a second implementation of
-- "what is this node called, in words" and the pair is what stops matching.
create or replace function public.maps_editor_roster(p_node_id uuid default null)
returns table (email text, node_id uuid, granted_by text, granted_at timestamptz, note text)
language sql
stable
security definer
set search_path = ''
as $$
	select g.email, g.node_id, g.granted_by, g.granted_at, g.note
	from public.maps_editor_grants g
	where public.is_admin()
		and (p_node_id is null or g.node_id = p_node_id)
	order by g.email, g.node_id;
$$;

-- THE CALLER'S OWN GRANTS. Takes NO identity parameter: "only their own" is a
-- property of the SIGNATURE rather than a check that could be got wrong. An
-- admin gets an empty set unless they hold literal rows, which is correct --
-- an admin's reach comes from is_admin(), never from a grant, and the editor
-- reads `admin` separately.
create or replace function public.maps_my_editor_grants()
returns table (node_id uuid, granted_at timestamptz, note text)
language sql
stable
security definer
set search_path = ''
as $$
	select g.node_id, g.granted_at, g.note
	from public.maps_editor_grants g
	where (select auth.uid()) is not null
		and g.email = public.current_user_email();
$$;

comment on function public.maps_my_editor_grants() is
	'The CALLER''s own IDEA Maps editing grants (0172). Deliberately parameterless; empty set for everyone else, including an admin who holds no literal row.';

revoke all on function public.maps_editor_grant(text, uuid, text)
	from public, anon, authenticated, service_role;
revoke all on function public.maps_editor_revoke(text, uuid)
	from public, anon, authenticated, service_role;
revoke all on function public.maps_editor_roster(uuid)
	from public, anon, authenticated, service_role;
revoke all on function public.maps_my_editor_grants()
	from public, anon, authenticated, service_role;
grant execute on function public.maps_editor_grant(text, uuid, text) to authenticated;
grant execute on function public.maps_editor_revoke(text, uuid) to authenticated;
grant execute on function public.maps_editor_roster(uuid) to authenticated;
grant execute on function public.maps_my_editor_grants() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The policies. SECOND PERMISSIVE POLICIES beside 0161's and 0163's, never
--    a rewrite of them -- see the header for why. Every write clause pins
--    `status = 'draft'` in BOTH directions, so a published row is never a
--    candidate and a draft can never be updated INTO a published one.
-- ---------------------------------------------------------------------------

-- maps_nodes ---------------------------------------------------------------

-- THE SECOND DISJUNCT IS NOT REDUNDANT AND IS NOT DEFENCE IN DEPTH: IT IS
-- WHAT MAKES `insert ... returning` WORK AT ALL. Postgres applies the SELECT
-- policies to an INSERT's RETURNING clause, and PostgREST puts a RETURNING on
-- every insert (`.insert(...).select('id')`). A predicate that walks UP FROM
-- THE ROW'S OWN ID cannot see the row it is being asked about -- the walk is
-- a STABLE function running on the command's own snapshot, which does not
-- contain the just-inserted tuple -- so the row lands and RETURNING answers
-- ZERO ROWS. Measured: every grantee insert here failed exactly that way, and
-- the client reads zero returned rows as a refused write.
-- `maps_can_edit_node(parent_id)` reads the NEW ROW'S OWN COLUMN instead, so
-- it needs no lookup of the row, and it is the same set: everything strictly
-- below a granted node. The first disjunct covers the granted node itself and
-- the ancestor spine above it, both of which already exist to be walked.
drop policy if exists maps_nodes_editor_read on public.maps_nodes;
create policy maps_nodes_editor_read on public.maps_nodes
	for select to authenticated
	using (public.maps_can_view_node(id) or public.maps_can_edit_node(parent_id));

-- The NEW row's id names no place in the tree yet, so the scope test is on
-- `parent_id`. A null parent is refused for a grantee by that same test:
-- creating a site or a building is not something a subtree grant can reach.
drop policy if exists maps_nodes_editor_insert on public.maps_nodes;
create policy maps_nodes_editor_insert on public.maps_nodes
	for insert to authenticated
	with check (status = 'draft' and public.maps_can_edit_node(parent_id));

-- USING is the OLD row (in scope, and draft). WITH CHECK is the NEW row
-- (still draft, and its parent still in scope) -- which is what stops a
-- grantee MOVING a draft out of their subtree, or up to the root.
drop policy if exists maps_nodes_editor_update on public.maps_nodes;
create policy maps_nodes_editor_update on public.maps_nodes
	for update to authenticated
	using (status = 'draft' and public.maps_can_edit_node(id))
	with check (status = 'draft' and public.maps_can_edit_node(parent_id));

drop policy if exists maps_nodes_editor_delete on public.maps_nodes;
create policy maps_nodes_editor_delete on public.maps_nodes
	for delete to authenticated
	using (status = 'draft' and public.maps_can_edit_node(id));

-- maps_item_types ----------------------------------------------------------
-- No node to reach; see the header. Any grant, drafts only.

drop policy if exists maps_item_types_editor_read on public.maps_item_types;
create policy maps_item_types_editor_read on public.maps_item_types
	for select to authenticated
	using (public.maps_is_editor());

drop policy if exists maps_item_types_editor_insert on public.maps_item_types;
create policy maps_item_types_editor_insert on public.maps_item_types
	for insert to authenticated
	with check (status = 'draft' and public.maps_is_editor());

drop policy if exists maps_item_types_editor_update on public.maps_item_types;
create policy maps_item_types_editor_update on public.maps_item_types
	for update to authenticated
	using (status = 'draft' and public.maps_is_editor())
	with check (status = 'draft' and public.maps_is_editor());

drop policy if exists maps_item_types_editor_delete on public.maps_item_types;
create policy maps_item_types_editor_delete on public.maps_item_types
	for delete to authenticated
	using (status = 'draft' and public.maps_is_editor());

-- maps_items ---------------------------------------------------------------

drop policy if exists maps_items_editor_read on public.maps_items;
create policy maps_items_editor_read on public.maps_items
	for select to authenticated
	using (public.maps_can_edit_node(node_id));

drop policy if exists maps_items_editor_insert on public.maps_items;
create policy maps_items_editor_insert on public.maps_items
	for insert to authenticated
	with check (status = 'draft' and public.maps_can_edit_node(node_id));

drop policy if exists maps_items_editor_update on public.maps_items;
create policy maps_items_editor_update on public.maps_items
	for update to authenticated
	using (status = 'draft' and public.maps_can_edit_node(node_id))
	with check (status = 'draft' and public.maps_can_edit_node(node_id));

drop policy if exists maps_items_editor_delete on public.maps_items;
create policy maps_items_editor_delete on public.maps_items
	for delete to authenticated
	using (status = 'draft' and public.maps_can_edit_node(node_id));

-- maps_stock ---------------------------------------------------------------

drop policy if exists maps_stock_editor_read on public.maps_stock;
create policy maps_stock_editor_read on public.maps_stock
	for select to authenticated
	using (public.maps_can_edit_node(node_id));

drop policy if exists maps_stock_editor_insert on public.maps_stock;
create policy maps_stock_editor_insert on public.maps_stock
	for insert to authenticated
	with check (status = 'draft' and public.maps_can_edit_node(node_id));

drop policy if exists maps_stock_editor_update on public.maps_stock;
create policy maps_stock_editor_update on public.maps_stock
	for update to authenticated
	using (status = 'draft' and public.maps_can_edit_node(node_id))
	with check (status = 'draft' and public.maps_can_edit_node(node_id));

drop policy if exists maps_stock_editor_delete on public.maps_stock;
create policy maps_stock_editor_delete on public.maps_stock
	for delete to authenticated
	using (status = 'draft' and public.maps_can_edit_node(node_id));

-- maps_photos --------------------------------------------------------------

drop policy if exists maps_photos_editor_read on public.maps_photos;
create policy maps_photos_editor_read on public.maps_photos
	for select to authenticated
	using (public._maps_photo_owner_visible(node_id, item_type_id, item_id));

drop policy if exists maps_photos_editor_insert on public.maps_photos;
create policy maps_photos_editor_insert on public.maps_photos
	for insert to authenticated
	with check (public._maps_photo_owner_editable(node_id, item_type_id, item_id));

drop policy if exists maps_photos_editor_update on public.maps_photos;
create policy maps_photos_editor_update on public.maps_photos
	for update to authenticated
	using (public._maps_photo_owner_editable(node_id, item_type_id, item_id))
	with check (public._maps_photo_owner_editable(node_id, item_type_id, item_id));

drop policy if exists maps_photos_editor_delete on public.maps_photos;
create policy maps_photos_editor_delete on public.maps_photos
	for delete to authenticated
	using (public._maps_photo_owner_editable(node_id, item_type_id, item_id));

-- storage.objects ----------------------------------------------------------
-- INSERT ONLY. The key names no owner, so the bytes cannot be scoped; the
-- maps_photos ROW is the gate that decides whether they are ever referenced,
-- and 0163 already names an unreferenced public image as this feature's
-- acceptable failure. UPDATE and DELETE stay admin-only, so a grantee can
-- never overwrite or remove an object a published photo points at.

drop policy if exists maps_media_editor_insert on storage.objects;
create policy maps_media_editor_insert on storage.objects
	for insert to authenticated
	with check (bucket_id = 'maps-media' and public.maps_is_editor());

-- ---------------------------------------------------------------------------
-- 6. Self-check: read the end state off the catalog, not off this file's own
--    intentions, and say what is there.
-- ---------------------------------------------------------------------------

do $$
declare
	v_tbl text;
	v_admin_expr text;
	v_count integer;
	v_editor integer;
	r record;
begin
	-- 6a. THE ADMIN TIER IS BYTE-IDENTICAL. Every 0161/0163 policy still reads
	-- exactly `is_admin()` (plus, on maps_revisions, the pending clause). If
	-- this file had rewritten one, this is where it would show.
	for r in
		select p.polname, c.relname,
			pg_get_expr(p.polqual, p.polrelid) as qual,
			pg_get_expr(p.polwithcheck, p.polrelid) as wc
		from pg_policy p join pg_class c on c.oid = p.polrelid
		where c.relnamespace = 'public'::regnamespace
			and c.relname like 'maps\_%'
			and p.polname like '%\_admin\_%'
		order by c.relname, p.polname
	loop
		if coalesce(r.qual, '') || coalesce(r.wc, '') not like '%is_admin()%' then
			raise exception '0172: % on % no longer names is_admin(). This file must not have touched it.', r.polname, r.relname;
		end if;
		if coalesce(r.qual, '') || coalesce(r.wc, '') like '%maps_can_%'
			or coalesce(r.qual, '') || coalesce(r.wc, '') like '%maps_is_editor%' then
			raise exception '0172: % on % was REWRITTEN to name the editor tier. The admin policies must be left alone.', r.polname, r.relname;
		end if;
	end loop;
	raise notice '0172: every 0161/0163 admin policy still reads is_admin() and names no editor predicate.';

	-- 6b. Four editor policies per content table and per maps_photos, one on
	-- storage.objects, and NONE on maps_revisions.
	for v_tbl in
		select unnest(array['maps_nodes', 'maps_item_types', 'maps_items', 'maps_stock', 'maps_photos'])
	loop
		select count(*) into v_editor from pg_policies
		where schemaname = 'public' and tablename = v_tbl and policyname like '%\_editor\_%';
		if v_editor <> 4 then
			raise exception '0172: % has % editor policies, expected 4 (read, insert, update, delete).', v_tbl, v_editor;
		end if;
		select count(*) into v_count from pg_policies
		where schemaname = 'public' and tablename = v_tbl;
		raise notice '0172: % -- % policies total, % of them the editor tier.', v_tbl, v_count, v_editor;
	end loop;

	select count(*) into v_editor from pg_policies
	where schemaname = 'public' and tablename = 'maps_revisions' and policyname like '%\_editor\_%';
	if v_editor <> 0 then
		raise exception '0172: maps_revisions grew % editor polic(ies). A grantee never stages a pending revision -- a pending revision is the staged edit of a PUBLISHED object, which a grantee may not touch.', v_editor;
	end if;
	raise notice '0172: maps_revisions has 0 editor policies, as intended -- staging stays admin-only.';

	select count(*) into v_editor from pg_policies
	where schemaname = 'storage' and tablename = 'objects' and policyname = 'maps_media_editor_insert';
	if v_editor <> 1 then
		raise exception '0172: expected exactly 1 maps_media_editor_insert policy on storage.objects, found %.', v_editor;
	end if;
	select count(*) into v_count from pg_policies
	where schemaname = 'storage' and tablename = 'objects' and policyname like 'maps\_media\_editor\_%';
	if v_count <> 1 then
		raise exception '0172: % maps_media_editor_* policies on storage.objects; only INSERT may exist (update and delete stay admin-only).', v_count;
	end if;
	raise notice '0172: storage.objects -- one maps_media_editor_insert, no editor update or delete.';

	-- 6c. THE DRAFT CEILING, asserted from the catalog rather than from the
	-- text above. Every editor WRITE policy must name status = 'draft' in
	-- every clause it has. maps_photos is the exception and states why: a
	-- photo carries no status, so its ceiling is inside
	-- _maps_photo_owner_editable, which is asserted separately in 6d.
	for r in
		select p.polname, c.relname, p.polcmd,
			pg_get_expr(p.polqual, p.polrelid) as qual,
			pg_get_expr(p.polwithcheck, p.polrelid) as wc
		from pg_policy p join pg_class c on c.oid = p.polrelid
		where c.relnamespace = 'public'::regnamespace
			and c.relname in ('maps_nodes', 'maps_item_types', 'maps_items', 'maps_stock')
			and p.polname like '%\_editor\_%'
			and p.polcmd in ('a', 'w', 'd')
		order by c.relname, p.polname
	loop
		if r.qual is not null and r.qual not like '%draft%' then
			raise exception '0172: % USING clause does not pin status = draft. A grantee could reach a published row.', r.polname;
		end if;
		if r.wc is not null and r.wc not like '%draft%' then
			raise exception '0172: % WITH CHECK does not pin status = draft. A grantee could publish by plain UPDATE, which is the whole gate maps_publish holds.', r.polname;
		end if;
	end loop;
	raise notice '0172: every editor insert/update/delete policy on the four content tables pins status = draft in every clause it has.';

	-- 6d. The photo write predicate carries the draft ceiling for all three
	-- owner shapes.
	select count(*) into v_count
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = '_maps_photo_owner_editable'
		and p.prosrc like '%draft%';
	if v_count <> 1 then
		raise exception '0172: _maps_photo_owner_editable does not name a draft status. A grantee could hang a photo on a PUBLISHED owner, which puts it on the public map immediately.';
	end if;
	raise notice '0172: _maps_photo_owner_editable pins the owner to draft.';

	-- 6e. maps_publish is UNTOUCHED and still admin-gated in its body.
	select count(*) into v_count
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'maps_publish'
		and p.prosrc like '%if not public.is_admin() then%';
	if v_count <> 1 then
		raise exception '0172: maps_publish no longer opens with an is_admin() refusal. Publish must stay admin-only.';
	end if;
	raise notice '0172: maps_publish still refuses a non-admin in its own body. Publish is unchanged.';

	-- 6f. Function ACLs, read back rather than assumed.
	for r in
		select p.oid::regprocedure::text as sig,
			has_function_privilege('anon', p.oid, 'execute') as anon_x,
			has_function_privilege('authenticated', p.oid, 'execute') as auth_x
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public'
			and p.proname in ('_maps_node_ancestors', 'maps_can_edit_node', 'maps_can_view_node',
				'maps_is_editor', '_maps_photo_owner_visible', '_maps_photo_owner_editable',
				'maps_editor_grant', 'maps_editor_revoke', 'maps_editor_roster', 'maps_my_editor_grants')
		order by 1
	loop
		if r.anon_x then
			raise exception '0172: anon holds EXECUTE on %. Nothing in this file is anon-callable.', r.sig;
		end if;
		if r.sig like '%_maps_node_ancestors%' and r.auth_x then
			raise exception '0172: authenticated holds EXECUTE on %, which would let any signed-in caller walk the whole tree including drafts.', r.sig;
		end if;
		if r.sig not like '%_maps_node_ancestors%' and not r.auth_x then
			raise exception '0172: authenticated lost EXECUTE on %, which a policy or a client call needs.', r.sig;
		end if;
		raise notice '0172: % -- anon %, authenticated %.', r.sig, r.anon_x, r.auth_x;
	end loop;

	-- 6g. The roster table's own grants.
	if has_table_privilege('anon', 'public.maps_editor_grants', 'select')
		or has_table_privilege('authenticated', 'public.maps_editor_grants', 'insert')
		or has_table_privilege('authenticated', 'public.maps_editor_grants', 'update')
		or has_table_privilege('authenticated', 'public.maps_editor_grants', 'delete') then
		raise exception '0172: maps_editor_grants holds a grant it must not -- anon SELECT, or a client write path. Section 4 is the only write path.';
	end if;
	select count(*) into v_count from public.maps_editor_grants;
	raise notice '0172: maps_editor_grants -- RLS on, admin-read only, no client write path, % row(s). No seed: an empty roster is exactly the world 0161 left behind.', v_count;

	raise notice '0172: IDEA Maps granted editors in place. Draft-only, subtree-scoped, publish unchanged. Grants are made by hand -- see section 7.';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Granting, by hand, in this editor. There is no client caller for
--    maps_editor_grant yet on the day this is applied; the admin surface
--    ships with it.
--
--   select public.maps_editor_grant('student@boscotech.net',
--     (select id from public.maps_nodes where name = 'Machine Shop'),
--     'Cataloguing the tool chests, Sept 2026');
--
--   select * from public.maps_editor_roster();
--   select public.maps_editor_revoke('student@boscotech.net',
--     (select id from public.maps_nodes where name = 'Machine Shop'));
--
-- Both run as the SQL editor's own role, which is not a signed-in admin --
-- `is_admin()` reads the session's JWT claims and there are none there. Grant
-- by plain insert instead when running from the editor:
--
--   insert into public.maps_editor_grants (email, node_id, granted_by, note)
--   values ('student@boscotech.net',
--     (select id from public.maps_nodes where name = 'Machine Shop'),
--     'apina@boscotech.edu', 'Cataloguing the tool chests')
--   on conflict (email, node_id) do nothing;
-- ---------------------------------------------------------------------------

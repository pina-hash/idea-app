-- 0162_maps_search.sql
--
-- IDEA MAPS, FILE 2 OF 3: SEARCH. The matching contract of
-- docs/standards/IDEA_MAPS_SPEC.md v1.1 section 5 -- pg_trgm, the weighted
-- full-text vector (5.2), one search function returning the matched thing
-- with its full containment chain and geometry references (5.3), and the
-- anonymous search log (5.4). Requires 0161 (the tables) and 0067
-- (public.is_admin, used by the log's admin read policy).
--
-- ---------------------------------------------------------------------------
-- THE ANCESTOR CHAIN IS A COMPUTED JOIN, NOT A MAINTAINED COLUMN, AND THE
-- INVALIDATION PATH IS THEREFORE "THERE IS NOTHING TO INVALIDATE".
-- ---------------------------------------------------------------------------
-- maps_search builds the chain with a recursive CTE over maps_nodes at query
-- time. A reparent or a rename is visible to the very next query by
-- construction, because no copy of the chain is stored anywhere. The rejected
-- alternative was a trigger-maintained denormalised names column: it would
-- need a recursive subtree recompute on every reparent AND every rename, and
-- a trigger that stops firing leaves a stale chain forever with nothing to
-- catch it -- the exact stored-derivation failure CLAUDE.md's state-modelling
-- rules exist to prevent. At this corpus's scale (one building of rooms,
-- units, compartments and their contents -- thousands of rows, not millions)
-- the recursive walk is trivially cheap per query. If whole-campus scale ever
-- makes it measurable, the revisit is a stored tsvector/chain column in its
-- own bundle, with the invalidation trigger argued for on a measurement.
--
-- MATCHING, per 5.2, three legs merged in one function:
--   * weighted full-text: A = names and aliases (an item's own name included),
--     B = tags, category, brand, model, part number (and a unique item's
--     serial, which is an identifier of the same kind), C = descriptions and
--     condition notes, D = ancestor chain names. The vector is built in BOTH
--     the 'english' and 'simple' configurations: english stems "cuts" onto a
--     "cutting" tag (the function-query case), simple keeps identifiers like
--     part numbers and brand names undamaged. websearch AND-semantics is what
--     makes "mill room caliper" narrow by place through the D band.
--   * trigram: `<%` word-similarity of the query against a per-table
--     vocabulary blob, for typos and partial tokens.
--   * prefix/substring ILIKE for live typing, wildcard-escaped.
-- Results are ranked on the greatest of the three legs' scores and ties break
-- toward SHALLOWER results (order by score desc, depth asc), per 5.2.
--
-- THE FUNCTION IS SECURITY INVOKER, WHICH IS THE PUBLISHED-ONLY GUARANTEE.
-- RLS does the filtering (0161's policies): an anonymous caller's recursive
-- chain simply cannot see a draft node, so a draft never appears as a result
-- OR as a link in anyone's chain, and there is no second, restatable copy of
-- "published only" inside this function to drift. Two structural consequences,
-- both accepted and stated: a published node under a DRAFT parent is
-- unreachable through the chain and so does not surface for anonymous callers
-- until its ancestors publish (you cannot stage a route through an
-- unpublished room); and an admin calling the same function sees drafts,
-- which is what the editor wants. Item types themselves are not standalone
-- results: a type with no placed item and no stock has no containment chain
-- to stage (5.3 says never a bare row), so its vocabulary surfaces through
-- the items and stock that place it.
--
-- TRIGRAM INDEXES cover one immutable vocabulary helper per table, and the
-- function's filters are built from those same helpers -- verbatim for nodes
-- and stock, while the items leg concatenates its own blob with its type's,
-- so its combined filter is index-assisted rather than index-exact. The
-- full-text leg is computed at query time with no stored vector, which at
-- this corpus scale is a deliberate seqscan and is part of the
-- computed-not-stored decision above.
--
-- THE ANON GRANT ON maps_search AND THE INSERT GRANT ON maps_search_log ARE
-- INTENTIONAL, AND ARE THE POINT OF THE FEATURE. Spec section 2 ("Read
-- access: fully public, no sign-in... on every read path") and section 5.4
-- ("Every query is logged... no identity (readers are anonymous)") authorise
-- both. Everything else this file creates is revoked from anon by naming the
-- roles. The three vocabulary helpers and the chain-link builder KEEP anon
-- EXECUTE deliberately: maps_search is SECURITY INVOKER, so its body -- and
-- any index recheck of the vocabulary expressions -- evaluates as the calling
-- role, and revoking anon there breaks the anonymous read exactly the way the
-- 0070/0109 lesson describes for functions named in RLS policies.
--
-- THE SEARCH LOG carries query text, result count and timestamp -- no
-- identity column of any kind, nullable or otherwise, no address, no hash.
-- Anonymous callers INSERT (the repo's documented anonymous-intake shape:
-- there is nothing to forge in a query string) and can never read it back:
-- no select grant for anon, and the only select policy is admin. No update
-- or delete exists for any client role. Logging is the CLIENT's explicit
-- write, not a side effect of maps_search -- a live-typing surface calls
-- search per keystroke and must log only the settled query, which is a
-- decision only the caller can make.
--
-- DELIBERATELY LEFT ALONE: no rate limiting on the log (bounded rows via the
-- 400-char and count checks; a flood-control decision belongs to the P2
-- admin-surface bundle that will read this table -- and that surface must
-- treat query text as untrusted input, which is its bundle's obligation to
-- prove); no fixture corpus or asserted ranks (5.5 ships with P1's CI bundle,
-- on a branch -- this file is main-only and commits no tests); no
-- search-miss authoring surface (P2, per 5.4).
--
-- UNDO:
--   drop function public.maps_search(text, integer);
--   drop function public._maps_chain_link(public.maps_nodes);
--   drop index public.maps_nodes_vocab_trgm;
--   drop index public.maps_item_types_vocab_trgm;
--   drop index public.maps_items_vocab_trgm;
--   drop function public._maps_node_vocab(text, text);
--   drop function public._maps_item_type_vocab(text, text[], text[], text, text, text, text, text);
--   drop function public._maps_item_vocab(text, text, text);
--   drop table public.maps_search_log;
--   -- pg_trgm is left installed: dropping an extension other features may
--   -- have adopted is not this file's to decide.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. pg_trgm, wherever it lives. `if not exists` respects an install already
--    made into another schema (hosted projects often hold extensions in
--    `extensions`); the do-block then points this session's search_path at
--    the real namespace so the opclass below and any editor-session re-paste
--    resolve regardless. maps_search pins `public, extensions` for the same
--    reason -- a missing schema in a search_path is skipped, so the setting
--    is safe on a database where only one of the two exists.
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm;

do $$
declare
	v_ns text;
begin
	select n.nspname into v_ns
	from pg_extension e join pg_namespace n on n.oid = e.extnamespace
	where e.extname = 'pg_trgm';
	if v_ns is null then
		raise exception '0162: pg_trgm is not installed and could not be created.';
	end if;
	perform set_config('search_path', 'public, ' || quote_ident(v_ns), false);
	raise notice '0162: pg_trgm is installed in schema %.', v_ns;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The per-table vocabulary, written ONCE each as an immutable helper the
--    index and the function share -- two spellings of a vocabulary is the
--    pair that stops matching. SQL-immutable with no SET clause so they stay
--    inlinable and index-legal; their bodies call only pg_catalog builtins,
--    which resolve ahead of any search_path. (concat_ws/array_to_string are
--    formally stable for unknown-type reasons; over text they are pure, the
--    standard justification for an immutable index wrapper.)
-- ---------------------------------------------------------------------------

create or replace function public._maps_node_vocab(p_name text, p_description text)
returns text
language sql
immutable
as $$
	select concat_ws(' ', p_name, p_description);
$$;

create or replace function public._maps_item_type_vocab(
	p_name text, p_aliases text[], p_tags text[],
	p_category text, p_brand text, p_model text, p_part_number text, p_description text
)
returns text
language sql
immutable
as $$
	select concat_ws(' ',
		p_name,
		array_to_string(p_aliases, ' '),
		array_to_string(p_tags, ' '),
		p_category, p_brand, p_model, p_part_number, p_description);
$$;

create or replace function public._maps_item_vocab(p_name text, p_serial text, p_notes text)
returns text
language sql
immutable
as $$
	select concat_ws(' ', p_name, p_serial, p_notes);
$$;

-- Trigram GIN over exactly those expressions: typos and partial tokens via
-- similarity/word-similarity operators, live-typing prefixes and substrings
-- via ILIKE, both of which gin_trgm_ops serves.
create index if not exists maps_nodes_vocab_trgm
	on public.maps_nodes
	using gin (public._maps_node_vocab(name, description) gin_trgm_ops);
create index if not exists maps_item_types_vocab_trgm
	on public.maps_item_types
	using gin (public._maps_item_type_vocab(name, aliases, tags, category, brand, model, part_number, description) gin_trgm_ops);
create index if not exists maps_items_vocab_trgm
	on public.maps_items
	using gin (public._maps_item_vocab(name, serial, notes) gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 3. One chain link, one shape. Everything the staged route needs from a node
--    (5.3/6): identity, plan geometry in the parent frame, and the elevation
--    slot for the last ten feet.
-- ---------------------------------------------------------------------------

create or replace function public._maps_chain_link(n public.maps_nodes)
returns jsonb
language sql
immutable
as $$
	select jsonb_build_object(
		'id', n.id,
		'kind', n.kind,
		'name', n.name,
		'subtype', n.subtype,
		'outline', n.outline,
		'position_x_in', n.position_x_in,
		'position_y_in', n.position_y_in,
		'rotation_deg', n.rotation_deg,
		'elevation_order', n.elevation_order,
		'elevation_h_in', n.elevation_h_in,
		'elevation_w_in', n.elevation_w_in
	);
$$;

-- ---------------------------------------------------------------------------
-- 4. The search function. SECURITY INVOKER: RLS is the published-only
--    boundary (see header). Returns the matched thing, its full containment
--    chain root-to-leaf with per-link geometry, and never a bare row.
-- ---------------------------------------------------------------------------

create or replace function public.maps_search(p_query text, p_limit integer default 20)
returns table (
	result_kind text,   -- 'node' | 'item' | 'stock'
	result_id uuid,
	item_type_id uuid,  -- null for nodes and typeless items
	label text,
	detail jsonb,       -- kind-specific fields (serial/qty/brand/...)
	node_id uuid,       -- the node the route stages to (the node itself, or the container)
	chain jsonb,        -- [{id,kind,name,subtype,outline,position_x_in,position_y_in,rotation_deg,elevation_order,elevation_h_in,elevation_w_in}] root -> leaf
	depth integer,
	score real
)
language plpgsql
stable
set search_path = public, extensions
as $$
declare
	v_q text;
	v_like text;
	v_last text;
	v_tsq tsquery;
	v_limit integer;
begin
	v_q := btrim(coalesce(p_query, ''));
	if v_q = '' then
		return;
	end if;
	v_limit := least(greatest(coalesce(p_limit, 20), 1), 100);
	v_like := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

	-- english for stems, simple for identifiers, and the last token as a
	-- simple prefix for live typing. || on tsquery is OR.
	v_tsq := websearch_to_tsquery('english', v_q) || websearch_to_tsquery('simple', v_q);
	v_last := regexp_replace(
		lower((regexp_split_to_array(v_q, '\s+'))[cardinality(regexp_split_to_array(v_q, '\s+'))]),
		'[^a-z0-9]', '', 'g');
	if v_last <> '' then
		v_tsq := v_tsq || to_tsquery('simple', v_last || ':*');
	end if;

	return query
	with recursive chain as (
		select n.id, n.parent_id, 1 as chain_depth,
			array[n.name] as chain_names,
			jsonb_build_array(public._maps_chain_link(n)) as links
		from public.maps_nodes n
		where n.parent_id is null
		union all
		select n.id, n.parent_id, c.chain_depth + 1,
			c.chain_names || n.name,
			c.links || public._maps_chain_link(n)
		from public.maps_nodes n
		join chain c on n.parent_id = c.id
	),
	hits as (
		select
			'node'::text as hit_kind,
			n.id as hit_id,
			null::uuid as hit_type_id,
			n.name as hit_label,
			jsonb_build_object('kind', n.kind, 'subtype', n.subtype, 'description', n.description) as hit_detail,
			n.id as at_node,
			public._maps_node_vocab(n.name, n.description) as vocab,
			setweight(to_tsvector('english', n.name), 'A')
				|| setweight(to_tsvector('simple', n.name), 'A')
				|| setweight(to_tsvector('english', coalesce(n.description, '')), 'C')
				|| setweight(to_tsvector('simple', coalesce(n.description, '')), 'C') as vec
		from public.maps_nodes n
		union all
		select
			'item'::text,
			i.id,
			i.item_type_id,
			coalesce(i.name, t.name),
			jsonb_build_object(
				'serial', i.serial, 'notes', i.notes,
				'category', t.category, 'brand', t.brand, 'model', t.model,
				'part_number', t.part_number, 'description', t.description),
			i.node_id,
			concat_ws(' ',
				public._maps_item_vocab(i.name, i.serial, i.notes),
				case when t.id is null then null
					else public._maps_item_type_vocab(t.name, t.aliases, t.tags, t.category, t.brand, t.model, t.part_number, t.description)
				end),
			setweight(to_tsvector('english', concat_ws(' ', i.name, t.name, array_to_string(t.aliases, ' '))), 'A')
				|| setweight(to_tsvector('simple', concat_ws(' ', i.name, t.name, array_to_string(t.aliases, ' '))), 'A')
				|| setweight(to_tsvector('english', concat_ws(' ', array_to_string(t.tags, ' '), t.category, t.brand, t.model, t.part_number, i.serial)), 'B')
				|| setweight(to_tsvector('simple', concat_ws(' ', array_to_string(t.tags, ' '), t.category, t.brand, t.model, t.part_number, i.serial)), 'B')
				|| setweight(to_tsvector('english', concat_ws(' ', t.description, i.notes)), 'C')
				|| setweight(to_tsvector('simple', concat_ws(' ', t.description, i.notes)), 'C')
		from public.maps_items i
		left join public.maps_item_types t on t.id = i.item_type_id
		union all
		select
			'stock'::text,
			s.id,
			s.item_type_id,
			t.name,
			jsonb_build_object(
				'qty', s.qty,
				'category', t.category, 'brand', t.brand, 'model', t.model,
				'part_number', t.part_number, 'description', t.description),
			s.node_id,
			public._maps_item_type_vocab(t.name, t.aliases, t.tags, t.category, t.brand, t.model, t.part_number, t.description),
			setweight(to_tsvector('english', concat_ws(' ', t.name, array_to_string(t.aliases, ' '))), 'A')
				|| setweight(to_tsvector('simple', concat_ws(' ', t.name, array_to_string(t.aliases, ' '))), 'A')
				|| setweight(to_tsvector('english', concat_ws(' ', array_to_string(t.tags, ' '), t.category, t.brand, t.model, t.part_number)), 'B')
				|| setweight(to_tsvector('simple', concat_ws(' ', array_to_string(t.tags, ' '), t.category, t.brand, t.model, t.part_number)), 'B')
				|| setweight(to_tsvector('english', coalesce(t.description, '')), 'C')
				|| setweight(to_tsvector('simple', coalesce(t.description, '')), 'C')
		from public.maps_stock s
		join public.maps_item_types t on t.id = s.item_type_id
	),
	scored as (
		select
			h.hit_kind, h.hit_id, h.hit_type_id, h.hit_label, h.hit_detail, h.at_node,
			c.links, c.chain_depth,
			(h.vec || setweight(to_tsvector('simple', array_to_string(c.chain_names, ' ')), 'D')) @@ v_tsq as ts_hit,
			v_q <% h.vocab as trgm_hit,
			h.vocab ilike '%' || v_like || '%' as substr_hit,
			greatest(
				word_similarity(v_q, h.vocab),
				case when h.vocab ilike v_like || '%' then 0.88 else 0.0 end,
				least(ts_rank_cd(
					h.vec || setweight(to_tsvector('simple', array_to_string(c.chain_names, ' ')), 'D'),
					v_tsq) * 2.0, 1.0)
			) as hit_score
		from hits h
		join chain c on c.id = h.at_node
	)
	select s.hit_kind, s.hit_id, s.hit_type_id, s.hit_label, s.hit_detail,
		s.at_node, s.links, s.chain_depth, s.hit_score::real
	from scored s
	where s.ts_hit or s.trgm_hit or s.substr_hit
	order by s.hit_score desc, s.chain_depth asc, s.hit_label asc nulls last
	limit v_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The search log -- spec 5.4. Query, count, clock. Nothing else, ever.
-- ---------------------------------------------------------------------------

create table if not exists public.maps_search_log (
	-- uuid rather than an identity column: an anon-writable table should not
	-- carry a client-reachable sequence surface.
	id uuid primary key default gen_random_uuid(),
	query text not null
		constraint maps_search_log_query_len check (char_length(query) between 1 and 400),
	result_count integer not null
		constraint maps_search_log_count check (result_count >= 0),
	created_at timestamptz not null default now()
);

alter table public.maps_search_log enable row level security;

drop policy if exists maps_search_log_public_write on public.maps_search_log;
create policy maps_search_log_public_write on public.maps_search_log
	for insert to anon, authenticated
	with check (true);

drop policy if exists maps_search_log_admin_read on public.maps_search_log;
create policy maps_search_log_admin_read on public.maps_search_log
	for select to authenticated
	using (public.is_admin());

-- No update, no delete, for anyone: the log is append-only and the misses it
-- exists to surface (5.4) must not be editable into silence.

revoke all on table public.maps_search_log from public, anon, authenticated;
grant insert on table public.maps_search_log to anon, authenticated;
grant select on table public.maps_search_log to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Function grants. maps_search and the helpers its invoker body evaluates
--    are the DELIBERATE anon surface (spec sections 2 and 5 -- see header);
--    the roles are named on every statement.
-- ---------------------------------------------------------------------------

revoke all on function public.maps_search(text, integer) from public, anon, authenticated;
grant execute on function public.maps_search(text, integer) to anon, authenticated;

revoke all on function public._maps_node_vocab(text, text) from public, anon, authenticated;
grant execute on function public._maps_node_vocab(text, text) to anon, authenticated;
revoke all on function public._maps_item_type_vocab(text, text[], text[], text, text, text, text, text) from public, anon, authenticated;
grant execute on function public._maps_item_type_vocab(text, text[], text[], text, text, text, text, text) to anon, authenticated;
revoke all on function public._maps_item_vocab(text, text, text) from public, anon, authenticated;
grant execute on function public._maps_item_vocab(text, text, text) to anon, authenticated;
revoke all on function public._maps_chain_link(public.maps_nodes) from public, anon, authenticated;
grant execute on function public._maps_chain_link(public.maps_nodes) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Self-check: the ACLs and objects read back off the catalog.
-- ---------------------------------------------------------------------------

do $$
declare
	v_count integer;
	r record;
begin
	select count(*) into v_count from pg_indexes
	where schemaname = 'public'
		and indexname in ('maps_nodes_vocab_trgm', 'maps_item_types_vocab_trgm', 'maps_items_vocab_trgm');
	if v_count <> 3 then
		raise exception '0162: % of 3 trigram indexes exist.', v_count;
	end if;
	raise notice '0162: 3 trigram vocabulary indexes in place.';

	-- The deliberate anon surface, asserted TRUE -- an accidental revoke here
	-- is the failure that breaks the headline feature.
	for r in
		select p.oid::regprocedure::text as sig,
			has_function_privilege('anon', p.oid, 'execute') as anon_x,
			has_function_privilege('authenticated', p.oid, 'execute') as auth_x
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public'
			and p.proname in ('maps_search', '_maps_node_vocab', '_maps_item_type_vocab', '_maps_item_vocab', '_maps_chain_link')
		order by 1
	loop
		if not r.anon_x or not r.auth_x then
			raise exception '0162: % must be anon- and authenticated-executable (the public search surface, spec sections 2 and 5); got anon=%, authenticated=%.',
				r.sig, r.anon_x, r.auth_x;
		end if;
		raise notice '0162: % -- anon %, authenticated % (deliberate public surface).', r.sig, r.anon_x, r.auth_x;
	end loop;

	-- The log: anon writes and cannot read; nobody updates or deletes.
	if not (select relrowsecurity from pg_class where oid = 'public.maps_search_log'::regclass) then
		raise exception '0162: RLS is OFF on maps_search_log.';
	end if;
	if not has_table_privilege('anon', 'public.maps_search_log', 'insert') then
		raise exception '0162: anon cannot INSERT into maps_search_log -- 5.4 logging is broken for the readers it exists for.';
	end if;
	if has_table_privilege('anon', 'public.maps_search_log', 'select')
		or has_table_privilege('anon', 'public.maps_search_log', 'update')
		or has_table_privilege('anon', 'public.maps_search_log', 'delete')
		or has_table_privilege('authenticated', 'public.maps_search_log', 'update')
		or has_table_privilege('authenticated', 'public.maps_search_log', 'delete') then
		raise exception '0162: maps_search_log carries a grant beyond anon/authenticated INSERT + authenticated SELECT.';
	end if;
	select count(*) into v_count from pg_policies
	where schemaname = 'public' and tablename = 'maps_search_log';
	if v_count <> 2 then
		raise exception '0162: maps_search_log has % policies, expected 2 (public insert, admin select).', v_count;
	end if;
	raise notice '0162: maps_search_log -- RLS on, 2 policies; anon insert %, anon select %.',
		has_table_privilege('anon', 'public.maps_search_log', 'insert'),
		has_table_privilege('anon', 'public.maps_search_log', 'select');

	select count(*) into v_count from public.maps_search_log;
	raise notice '0162: search is in place; the log holds % row(s) (0 expected on a first apply -- nothing is backfilled).', v_count;
end $$;

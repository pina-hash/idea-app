-- 0165_maps_search_conjunctive_tsquery.sql
--
-- IDEA MAPS, SEARCH CORRECTION: EVERY TYPED TERM IS REQUIRED AGAIN.
-- Redefines public.maps_search(text, integer) and nothing else. Requires 0162
-- (which created the function, the three vocabulary helpers, the chain-link
-- builder and the trigram indexes this file leaves exactly as it found them).
--
-- ---------------------------------------------------------------------------
-- WHAT 0162 CLAIMED, WHERE IT CLAIMED IT, AND WHY THE CLAIM WAS FALSE.
-- ---------------------------------------------------------------------------
-- 0162_maps_search.sql, header LINE 35, reads:
--
--     "websearch AND-semantics is what
--      makes "mill room caliper" narrow by place through the D band."
--
-- (the sentence opens on line 34 and the claim is completed on line 35). It
-- describes a function 0162 did not ship. Its body built the query in two
-- statements:
--
--     v_tsq := websearch_to_tsquery('english', v_q) || websearch_to_tsquery('simple', v_q);
--     ...
--     v_tsq := v_tsq || to_tsquery('simple', v_last || ':*');
--
-- `||` on tsquery is OR. The websearch halves are indeed conjunctive, but the
-- final-token PREFIX term was OR'd into the whole query as an independent
-- alternative, so a row matching that one token matched the query no matter
-- what else the person typed. Measured against the acceptance corpus on a real
-- Postgres, "mill room caliper" returned all three calipers in the building --
-- the Mill Room placement, the Machine Shop placement and the drawer-level
-- unique item -- which is exactly the set `'caliper':*` returns on its own. It
-- did not narrow by place at all. Spec 5.1 uses that phrase as its example of
-- the ancestor chain doing its job and 5.5 makes search quality a P1
-- acceptance criterion, so this was an acceptance failure and not a ranking
-- wart. THIS FILE MAKES LINE 35 TRUE. 0162 is applied and is history; its file
-- is not edited.
--
-- The defect was also ORDER-DEPENDENT, which is what hid it: the same three
-- words as "caliper mill room" put 'room' in the prefix slot, and `'room':*`
-- happens to exclude everything under Machine Shop, so that phrasing appeared
-- to narrow correctly while doing nothing of the kind. Measured after this
-- file, both orders -- and the upper-cased, extra-spaced and trailing-space
-- variants -- return the same single row.
--
-- ---------------------------------------------------------------------------
-- THE SHAPE, AND WHY IT IS STILL A DISJUNCTION.
-- ---------------------------------------------------------------------------
-- The query is now
--
--     (t1 & t2 & t3)              -- english: stems, so "cuts" reaches "cutting"
--   | (t1 & t2 & t3)              -- simple: literals, so identifiers survive
--   | (t1 & t2 & t3:*)            -- english head, final token as a prefix
--   | (t1 & t2 & t3:*)            -- simple head, final token as a prefix
--
-- Four alternatives, and EVERY ONE OF THEM CONJOINS EVERY TERM THE PERSON
-- TYPED. The disjunction is over SPELLINGS of one query, never over subsets of
-- its terms, which is the distinction 0162 lost. A row must carry every term
-- -- from its own bands or from its ancestor chain's D band -- under at least
-- one spelling, so naming a room narrows to that room.
--
-- THE THREE SPELLINGS EACH EARN THEIR PLACE, and dropping any one of them
-- breaks a measured corpus case:
--   * english and simple cannot be ANDed together. "thing that cuts aluminum"
--     stems to 'thing' & 'cut' & 'aluminum' in english and 'thing' & 'that' &
--     'cuts' & 'aluminum' in simple; requiring both would require 'that',
--     which english drops as a stopword and no document carries.
--   * the exact (non-prefix) spelling is what carries a websearch PHRASE. The
--     part-number query "505-742" becomes the phrase '505' <-> '-742'; the
--     prefix slot sees that token stripped to '505742', which matches nothing.
--     Without the exact spelling that corpus case loses its full-text leg.
--   * the prefix spelling is live typing. "cal" is not a lexeme of any
--     document ("caliper" stems to 'calip'), so only 'cal':* finds it, and it
--     is the third keystroke of the most common query in the building.
--
-- AN EMPTY HEAD IS ABSORBED RATHER THAN BRANCHED ON. `''::tsquery && x` is
-- `x` (measured in both operand orders), so a single-token query reduces to
-- the bare prefix term it was before this file, with no second code path to
-- keep in step.
--
-- THE PREFIX SPELLING IS SKIPPED WHEN THE LAST TOKEN CARRIES A WEBSEARCH
-- OPERATOR. A leading `-` is a NOT and a quote binds a phrase; neither is a
-- word somebody is halfway through typing. Re-admitting one as a bare prefix
-- would contradict the very term it was asked to exclude, which is what 0162
-- did: "caliper -mill" returned the Bridgeport Mill and the Mill Room itself.
-- Measured after this file it returns calipers only.
--
-- ---------------------------------------------------------------------------
-- TYPO TOLERANCE IS NOT PAID FOR BY THIS NARROWING, AND THAT IS STRUCTURAL.
-- ---------------------------------------------------------------------------
-- The three legs are OR'd in the WHERE clause (`ts_hit or trgm_hit or
-- substr_hit`) and this file touches ONLY the tsquery. The trigram leg is
-- still whole-query `<%` word-similarity against the per-row vocabulary blob
-- and the substring leg is still whole-query ILIKE, so neither knows or cares
-- that the full-text leg tightened. Measured: "calipre" (a transposition)
-- returns the same three placements at the same 0.625, and "dial calipre" (a
-- typo INSIDE a multi-term query) returns the same three at the same 0.769,
-- both identical to 0162.
--
-- IT IS ALSO WHAT KEEPS THE FUNCTION QUERY ALIVE, which is the case that would
-- otherwise have made this trade a real one. "thing that cuts aluminum" is
-- spec 5.5's own example and NO document contains 'thing' -- those words are
-- filler, not vocabulary -- so a conjunctive full-text query cannot match it
-- and, after this file, does not. It is carried entirely by the trigram leg:
-- word_similarity against the band saw's blob measures 0.6956, above the 0.6
-- default word_similarity_threshold, and every other row in the corpus
-- measures 0.14 or less. The query still returns exactly one row at rank 1.
-- What changed is its SCORE, 1.0 (a full-text certainty) to 0.6956 (a strong
-- fuzzy match), which is the more honest of the two numbers.
--
-- THE LIMIT THIS LEAVES, STATED RATHER THAN DISCOVERED LATER: a typo in a
-- PLACE term still finds nothing. "mill room calipre" returns zero, because
-- the full-text leg needs a 'calipre' no document has and the trigram blob
-- carries no ancestor names to match "mill room" against. It returned zero
-- under 0162 too, for the same reason, so nothing regressed here. Closing it
-- means putting the chain names into the trigram vocabulary, which changes
-- what the three GIN indexes cover and belongs in its own bundle with its own
-- measurement.
--
-- ---------------------------------------------------------------------------
-- THE RANK CLAMP STAYS, AND THE REASON IS A MEASUREMENT RATHER THAN INERTIA.
-- ---------------------------------------------------------------------------
-- `least(ts_rank_cd(...) * 2.0, 1.0)` is unchanged. It is what puts the
-- full-text leg on the same [0,1] scale as word_similarity and the 0.88
-- ILIKE-prefix constant, which spec 5.2 requires ("ranked and merged across
-- the three"). ts_rank_cd is unbounded and its magnitude tracks how OFTEN a
-- lexeme occurs and in which band, not how well the row answers the question:
-- measured over the four published item types, one query's raw ranks spread
-- 0.8 to 4.0. Un-clamped, a one-occurrence brand hit at 0.8 would sort BELOW a
-- trigram typo hit at 0.625 to 1.0, which inverts the quality order the spec
-- asks for.
--
-- AND IT DOES NOT SATURATE EVERYTHING, which is the half worth measuring
-- before reaching for it. It saturates a match that reaches raw 0.5, which is
-- an A-band or a strong B-band hit; a match found only through the ancestor
-- chain stays below. Measured on the query "mill": a name hit scores 1.0
-- (the Bridgeport Mill, the Mill Room node), a one-level D-band hit scores 0.4
-- (the caliper stocked in that room) and a deeper one scores 0.2 (the Bench
-- Cabinet). So the band weights still separate "this thing is called that"
-- from "this thing is somewhere called that", which is the distinction a
-- student is actually making. What saturates is A against B among direct
-- hits, and there spec 5.2's own tie break -- shallower first -- decides,
-- which is what it is for.
--
-- OBSERVED AND DELIBERATELY LEFT: ts_rank_cd is a COVER DENSITY rank, so it
-- penalises terms sitting far apart in the vector. A multi-term place query
-- therefore scores lower than a single-token name query -- "mill room caliper"
-- lands its one correct row at 0.5 -- and on "machine shop caliper" the room
-- node (0.619, from the trigram leg) outranks the caliper standing in it
-- (0.429). That is a leg-merge SCALE question, it is not what this file is
-- fixing, and moving the multiplier here would make it impossible to tell
-- which change moved which rank. It belongs in a ranking bundle that
-- re-derives every corpus rank from measurement.
--
-- ---------------------------------------------------------------------------
-- EVERYTHING ELSE 0162 ESTABLISHED IS PRESERVED, AND EACH WAS CHECKED RATHER
-- THAN ASSUMED. The body below is 0162's body with the query construction
-- replaced and NOTHING ELSE TOUCHED:
--   * TWO-CONFIGURATION INDEXING. Every band is still setweight'd in both
--     'english' and 'simple', so stems and identifiers both match.
--   * THE TRIGRAM UNION. `v_q <% h.vocab` and the two ILIKE legs are
--     unchanged, over the same three immutable vocabulary helpers the GIN
--     indexes cover. This file creates no index and drops none.
--   * THE WEIGHTED A/B/C/D BANDS. A = names and aliases, B = tags, category,
--     brand, model, part number and a unique item's serial, C = descriptions
--     and notes, D = ancestor chain names.
--   * THE ANCESTOR CHAIN IS STILL A RECURSIVE CTE computed at query time,
--     with nothing stored and therefore nothing to invalidate.
--   * SECURITY INVOKER. RLS remains the single gate, so the published-only
--     visibility is a consequence of 0161's policies and is not restated
--     here. The self-check asserts prosecdef is false.
--   * THE PUBLISHED-ONLY VISIBILITY that follows from it, including that a
--     published node under a draft parent stays unreachable anonymously.
--   * The signature, the return columns, the ordering, the limit clamp and
--     `set search_path = public, extensions`.
--
-- THE ANON GRANT IS RE-STATED ON PURPOSE, NOT COPIED BY HABIT. `create or
-- replace function` on this project arrives holding a FRESH direct grant to
-- anon, authenticated and service_role, because a hosted Supabase project
-- bootstraps `alter default privileges ... grant execute on functions` to
-- those roles. So the ACL is rebuilt by NAMING the roles -- never the bare
-- `revoke ... from public`, which on this project removes one entry nobody
-- holds and leaves anon granted. maps_search is DELIBERATELY anon-executable:
-- spec section 2 makes read access fully public with no sign-in on every read
-- path, and section 5 is that path. The self-check asserts the grant TRUE.
--
-- IDEMPOTENT. `create or replace` over the same signature, a revoke/grant pair
-- that is a fixed end state rather than a delta, and a self-check that only
-- reads. Re-pasting this file is an ordinary thing to do and changes nothing.
--
-- UNDO: re-paste 0162's section 4 (the function) and section 6's first two
-- grant lines. There is no schema change here to reverse -- no table, no
-- column, no index, no policy, no new object of any kind.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Preconditions. A migration REFUSES rather than destroys: if 0162 is not
--    in place, or pg_trgm is gone, the redefinition below would replace a
--    working function with one whose body cannot resolve its operators.
-- ---------------------------------------------------------------------------

do $$
declare
	v_missing text;
	v_ns text;
begin
	select string_agg(w.n, ', ' order by w.n) into v_missing
	from (values
		('maps_search'), ('_maps_node_vocab'), ('_maps_item_type_vocab'),
		('_maps_item_vocab'), ('_maps_chain_link')
	) as w(n)
	where not exists (
		select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
		where ns.nspname = 'public' and p.proname = w.n
	);
	if v_missing is not null then
		raise exception '0165: 0162 is not applied -- missing %. Apply 0162_maps_search.sql first.', v_missing;
	end if;

	select n.nspname into v_ns
	from pg_extension e join pg_namespace n on n.oid = e.extnamespace
	where e.extname = 'pg_trgm';
	if v_ns is null then
		raise exception '0165: pg_trgm is not installed; maps_search cannot resolve its word-similarity operators.';
	end if;
	raise notice '0165: 0162 in place; pg_trgm in schema %.', v_ns;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The function. 0162's body with ONE thing changed: the query the three
--    legs are matched against. See the header for the shape, and for what
--    each of the four alternatives is for.
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
	v_tok text[];
	v_last text;
	v_head text;
	v_pref tsquery;
	v_tsq tsquery;
	v_limit integer;
begin
	v_q := btrim(coalesce(p_query, ''));
	if v_q = '' then
		return;
	end if;
	v_limit := least(greatest(coalesce(p_limit, 20), 1), 100);
	v_like := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

	-- EVERY TYPED TERM IS REQUIRED. Each alternative below is one SPELLING of
	-- the whole query -- english-stemmed, simple-literal, and last-token-as-a-
	-- prefix -- and every one of them conjoins every term the person typed.
	-- `||` is OR and `&&` is AND, so the prefix term is ANDed onto the head
	-- terms and never stands alone. That is the whole of the 0162 correction.
	v_tsq := websearch_to_tsquery('english', v_q) || websearch_to_tsquery('simple', v_q);

	-- The live-typing spelling: the head terms, conjoined with the final token
	-- as a prefix. Skipped when the last token carries a websearch OPERATOR --
	-- a leading `-` is a NOT and a quote is a phrase, and neither is a word
	-- somebody is halfway through typing, so re-admitting it as a bare prefix
	-- would contradict the term it was asked to exclude or to bind.
	v_tok := regexp_split_to_array(v_q, '\s+');
	v_last := v_tok[cardinality(v_tok)];
	if v_last !~ '^-' and position('"' in v_last) = 0 then
		v_head := array_to_string(v_tok[1:cardinality(v_tok) - 1], ' ');
		v_last := regexp_replace(lower(v_last), '[^a-z0-9]', '', 'g');
		if v_last <> '' then
			-- An empty head is absorbed: `''::tsquery && x` is `x`, so a
			-- single-token query is exactly the bare prefix it used to be.
			v_pref := to_tsquery('simple', v_last || ':*');
			v_tsq := v_tsq
				|| (websearch_to_tsquery('english', v_head) && v_pref)
				|| (websearch_to_tsquery('simple', v_head) && v_pref);
		end if;
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
-- 3. The ACL, rebuilt by naming the roles. `create or replace` above arrived
--    holding this project's bootstrapped default grants, so the end state is
--    stated rather than assumed. The anon grant is INTENTIONAL -- spec
--    sections 2 and 5, the public read path -- and is the point of the
--    feature. `service_role` is not named, per the repo's standing rule.
-- ---------------------------------------------------------------------------

revoke all on function public.maps_search(text, integer) from public, anon, authenticated;
grant execute on function public.maps_search(text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Self-check. What is asserted here is the CATALOG -- one overload, the
--    security and volatility properties the published-only guarantee rests
--    on, and the ACL read back. The BEHAVIOUR (that a place term now narrows,
--    that typos and prefixes survived) is proven by the acceptance corpus in
--    tests/maps-search-corpus.test.ts, which applies the real chain to a real
--    Postgres and asserts ranks. A migration self-check cannot prove it
--    without a fixture, and this file has no fixture and creates none.
-- ---------------------------------------------------------------------------

do $$
declare
	v_count integer;
	v_def text;
	v_secdef boolean;
	v_vol "char";
	v_cfg text[];
	v_rows integer;
begin
	-- THE SIGNATURE TRAP: the parameter list did not change, so no drop was
	-- needed -- which is exactly the case where a second overload would go
	-- unnoticed. Asserted rather than assumed.
	select count(*) into v_count
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'maps_search';
	if v_count <> 1 then
		raise exception '0165: % overload(s) of public.maps_search exist, expected exactly 1.', v_count;
	end if;

	select p.prosecdef, p.provolatile, p.proconfig, pg_get_functiondef(p.oid)
	into v_secdef, v_vol, v_cfg, v_def
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'maps_search';

	if v_secdef then
		raise exception '0165: maps_search is SECURITY DEFINER. RLS is the published-only boundary (0162 section 4); a definer body would bypass it.';
	end if;
	if v_vol <> 's' then
		raise exception '0165: maps_search volatility is %, expected s (stable).', v_vol;
	end if;
	if v_cfg is null or not ('search_path=public, extensions' = any(v_cfg)) then
		raise exception '0165: maps_search lost its pinned search_path; proconfig is %.', v_cfg;
	end if;

	-- The correction itself, read back off the catalog. This says the file
	-- that just ran is the definition now in place; it is not a behavioural
	-- proof, and the comment above says where that lives.
	if position('&& v_pref' in v_def) = 0 then
		raise exception '0165: the catalog definition does not conjoin the prefix term -- the correction did not land.';
	end if;
	if position('v_tsq || to_tsquery(''simple'', v_last' in v_def) > 0 then
		raise exception '0165: the catalog definition still ORs the bare prefix term into the whole query -- that is 0162 behaviour.';
	end if;

	-- The deliberate public surface, asserted TRUE. An accidental revoke here
	-- breaks the headline feature for the readers it exists for.
	if not has_function_privilege('anon', 'public.maps_search(text, integer)', 'execute')
		or not has_function_privilege('authenticated', 'public.maps_search(text, integer)', 'execute') then
		raise exception '0165: maps_search must stay anon- and authenticated-executable (spec sections 2 and 5); got anon=%, authenticated=%.',
			has_function_privilege('anon', 'public.maps_search(text, integer)', 'execute'),
			has_function_privilege('authenticated', 'public.maps_search(text, integer)', 'execute');
	end if;

	-- The empty-input early return: the one behaviour assertable with no
	-- fixture at all, and the one the new token split runs closest to.
	select count(*) into v_count from public.maps_search('', 20);
	if v_count <> 0 then
		raise exception '0165: an empty query returned % row(s); the early return is gone.', v_count;
	end if;
	select count(*) into v_count from public.maps_search(null, 20);
	if v_count <> 0 then
		raise exception '0165: a null query returned % row(s); the early return is gone.', v_count;
	end if;
	select count(*) into v_count from public.maps_search('   ', 20);
	if v_count <> 0 then
		raise exception '0165: a whitespace-only query returned % row(s); the early return is gone.', v_count;
	end if;

	raise notice '0165: maps_search redefined. WHAT CHANGED: the final-token prefix term is now CONJOINED with the head terms (&&) instead of OR-ed into the whole query (||), so every typed term is required and "mill room caliper" narrows by place, as 0162 header line 35 already claimed. WHAT DID NOT: same signature, SECURITY INVOKER, stable, pinned search_path, the same three legs, the same A/B/C/D bands, the same recursive ancestor chain, the same rank clamp, the same indexes.';
	raise notice '0165: anon execute %, authenticated execute % (deliberate public surface, spec sections 2 and 5).',
		has_function_privilege('anon', 'public.maps_search(text, integer)', 'execute'),
		has_function_privilege('authenticated', 'public.maps_search(text, integer)', 'execute');

	select count(*) into v_rows from public.maps_nodes;
	raise notice '0165: no row was read for a decision, written, or backfilled. For the operator to check against the deployed app: maps_nodes holds % row(s).', v_rows;
end $$;

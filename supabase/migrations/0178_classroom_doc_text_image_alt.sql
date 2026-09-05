-- 0178_classroom_doc_text_image_alt.sql
--
-- An image contributes its DESCRIPTION to the plain-text projection.
--
-- One function is replaced: `_classroom_doc_text`, which gains an `img` arm.
-- No table, no column, no policy, no grant that did not already exist. The
-- only data written is a re-derivation of `classroom_items.body` for the rows
-- whose stored document actually contains a picture, counted and reported
-- first, guarded so a second run writes nothing.
--
-- ===========================================================================
-- WHAT WAS WRONG, AND WHY IT IS NOT COSMETIC
-- ===========================================================================
--
-- 0176 widened the item-body gate to accept `{ type: 'img', src, alt }`. It
-- did not touch the projection, and an image block has no `runs` -- so it fell
-- into the `else` arm, whose `coalesce(string_agg(...), '')` over an absent
-- key is the empty string. An image contributed a BLANK LINE, and a body whose
-- only content was a picture derived to ''.
--
-- `classroom_items.body` is not a preview. It is the column the app decides
-- things with, and every one of these was measured on this tree rather than
-- assumed:
--
--   * `ClassView` renders an assignment's or a material's body only
--     `{#if item.body.trim()}`, and `ItemDetail` gates the whole
--     Instructions/Details disclosure on the same test. A picture-only body
--     drew NOTHING on either surface.
--   * `itemTitle` (src/lib/classroom/classroom.ts) takes an announcement's
--     headline from the first non-blank line of this column and falls back to
--     the literal 'Untitled'. That headline is the home-feed card, the stream
--     row and its tooltip, the item page's <title> and <h1>, the breadcrumb,
--     the grading console's heading, the Grades row label, and the filename a
--     graded export downloads as.
--   * `itemBodyDoc` converts this column when `body_doc` is absent -- a
--     pre-0108 row, or a select that degraded -- so it is also what a student
--     reads on the fallback path.
--   * `constraint classroom_items_post_body` (0085) is `kind <> 'post' or
--     btrim(body) <> ''`, a TABLE check. So an announcement whose content was
--     a picture could not be inserted at all: the derived body was blank and
--     the row was refused by the database, with a message about a missing
--     body in front of somebody who had just written a description.
--
-- The last one is why this is a fix rather than a nicety. The gate 0176 opened
-- was closed again one layer down by a constraint nobody had connected to it.
--
-- ===========================================================================
-- WHY THE TYPESCRIPT MIRROR MOVES IN THE SAME COMMIT
-- ===========================================================================
--
-- `richDocText` (src/lib/rich-text-doc.ts) is the twin of this function, not an
-- independent projection: `$lib/server/classroom-doc` derives `p_body` from it,
-- `docLength` caps a body against it before the write is attempted, and on the
-- pre-0108 degrade path its output is stored VERBATIM. Widening one side alone
-- is what makes a client and its column disagree, so the two move together and
-- tests/db/classroom-doc-text-images.test.ts puts BOTH to one corpus -- the
-- same corpus, the same odd values, compared case for case.
--
-- ===========================================================================
-- WHAT IT DOES NOT CHANGE, ASSERTED IN SECTION 3
-- ===========================================================================
--
--   * A block with no `runs` and no `img` type still projects a BLANK LINE,
--     not a skipped one. The skip belongs to `string_agg` over a list with no
--     items and to nothing else, and it is 0108's behaviour.
--   * An `alt` that is absent or JSON null projects '' rather than dropping
--     the line, for the same reason.
--   * A NOTE'S GUIDANCE IS UNAFFECTED. `notebook_set_session_guidance` (0123)
--     calls this function for its 20,000-character cap, but 0176 deliberately
--     left the guidance gate narrow -- `_classroom_doc_ok(p_doc)`, the
--     one-argument wrapper, which passes `false` -- so no guidance document
--     can contain an image and no stored one does. Section 6 counts that
--     rather than asserting it from the gate.
--
-- ===========================================================================
-- WHAT UNDOES THIS
-- ===========================================================================
--
-- Re-paste the `_classroom_doc_text` block from 0122 (which is this function
-- without the `img` arm) and re-run the revoke beneath it. Nothing else has to
-- be touched: no signature moved, so every caller resolves unchanged. The rows
-- section 5 re-derived would keep their descriptions in `body` until their
-- next save, which is strictly the safe direction -- an announcement that is
-- savable today would stay savable. Run section 4's count first to be told how
-- many there are.

-- ---------------------------------------------------------------------------
-- 1. Preconditions
-- ---------------------------------------------------------------------------

do $$
begin
	if to_regprocedure('public._classroom_doc_text(jsonb)') is null then
		raise exception
			'0178 expects public._classroom_doc_text(jsonb) to exist (0108, widened by 0122). Apply those first.';
	end if;
	if to_regprocedure('public._classroom_doc_ok(jsonb, boolean)') is null then
		raise exception
			'0178 expects 0176 to be applied: public._classroom_doc_ok(jsonb, boolean) is missing, so nothing can store an image block yet and this widening would be inert.';
	end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The projection
-- ---------------------------------------------------------------------------

-- Identical to 0122 except for the one `when` arm. `create or replace` at the
-- same signature, so the OID does not move and the six write RPCs that name
-- this function keep resolving it with no edit and no deploy ordering.
--
-- `coalesce(b.value->>'alt', '')` and NOT a null line: a null line is what
-- `string_agg` SKIPS, and an image with no description must contribute the
-- same blank line every other runless block contributes rather than silently
-- vanishing from the document. The gate makes a blank description unstorable
-- through the RPCs anyway; this is what the function does with one that
-- reached the table another way.
create or replace function public._classroom_doc_text(p_doc jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
	select btrim(coalesce(string_agg(line, e'\n'), ''))
	from (
		select
			case
				when b.value->>'type' in ('ul', 'ol')
					then public._classroom_list_text(b.value->'items', 1)
				when b.value->>'type' = 'img'
					then coalesce(b.value->>'alt', '')
				else (
					select coalesce(string_agg(r.value->>'text', '' order by r.ord), '')
					from jsonb_array_elements(b.value->'runs') with ordinality as r(value, ord)
				)
			end as line
		from jsonb_array_elements(p_doc) with ordinality as b(value, ord)
		order by b.ord
	) lines
	where p_doc is not null and jsonb_typeof(p_doc) = 'array';
$$;

-- The roles are NAMED rather than left to `from public`, which on a hosted
-- Supabase project removes one grant the function never had and leaves `anon`
-- exactly where it was. This restates 0137's end state for this helper:
-- private, so both client roles come off; `service_role` untouched, because a
-- CHECK constraint's function runs as the writing role.
revoke all on function public._classroom_doc_text(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The projection answers what it should, and still answers what it did
-- ---------------------------------------------------------------------------

do $$
declare
	v_got text;
begin
	-- The new arm.
	v_got := public._classroom_doc_text('[{"type":"img","src":"attachment:caliper.png","alt":"A caliper reading 12.7 mm"}]'::jsonb);
	if v_got is distinct from 'A caliper reading 12.7 mm' then
		raise exception '0178: an image-only body projected % rather than its description', quote_literal(v_got);
	end if;

	-- One line per block, in document order, with the image among them.
	v_got := public._classroom_doc_text('[{"type":"p","runs":[{"text":"Measure it."}]},{"type":"img","src":"/idea/x.png","alt":"The bench"},{"type":"p","runs":[{"text":"Write it down."}]}]'::jsonb);
	if v_got is distinct from e'Measure it.\nThe bench\nWrite it down.' then
		raise exception '0178: a mixed body projected % rather than three lines', quote_literal(v_got);
	end if;

	-- An absent description is a BLANK LINE, never a skipped one: the middle
	-- line survives as empty, which is what keeps the block count honest.
	v_got := public._classroom_doc_text('[{"type":"p","runs":[{"text":"a"}]},{"type":"img","src":"attachment:x.png"},{"type":"p","runs":[{"text":"b"}]}]'::jsonb);
	if v_got is distinct from e'a\n\nb' then
		raise exception '0178: an image with no description projected % rather than a blank line', quote_literal(v_got);
	end if;

	-- UNCHANGED: a runless block that is not an image is still a blank line.
	v_got := public._classroom_doc_text('[{"type":"p","runs":[{"text":"a"}]},{"type":"h3"},{"type":"p","runs":[{"text":"b"}]}]'::jsonb);
	if v_got is distinct from e'a\n\nb' then
		raise exception '0178: a runless block changed answer: %', quote_literal(v_got);
	end if;

	-- UNCHANGED: a list with no items contributes NO line (the `string_agg`
	-- null 0108 wrote and 0122 preserved).
	v_got := public._classroom_doc_text('[{"type":"p","runs":[{"text":"a"}]},{"type":"ul","items":[]},{"type":"p","runs":[{"text":"b"}]}]'::jsonb);
	if v_got is distinct from e'a\nb' then
		raise exception '0178: an empty list changed answer: %', quote_literal(v_got);
	end if;

	-- UNCHANGED: nested lists, the 0122 shape, at two levels.
	v_got := public._classroom_doc_text('[{"type":"ul","items":[[{"text":"one"},{"type":"ol","items":[[{"text":"deeper"}]]}]]}]'::jsonb);
	if v_got is distinct from e'one\ndeeper' then
		raise exception '0178: nested lists changed answer: %', quote_literal(v_got);
	end if;

	-- UNCHANGED: null and a non-array are still ''.
	if public._classroom_doc_text(null) is distinct from '' then
		raise exception '0178: a null document no longer projects the empty string';
	end if;
	if public._classroom_doc_text('{"type":"p"}'::jsonb) is distinct from '' then
		raise exception '0178: a non-array document no longer projects the empty string';
	end if;

	raise notice '0178: the projection answers the image arm and every pre-existing case unchanged (8 checks).';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. How much real content this moves, counted before it is moved
-- ---------------------------------------------------------------------------

-- The one thing that can go wrong with a widened projection is that it changes
-- what a column says about content somebody has already published. So the
-- count is taken BEHAVIOURALLY -- the deployed column against what the new
-- function makes of the same document -- rather than by a second hand-written
-- walk looking for the shape, which is exactly the copy that stops matching.

do $$
declare
	v_with_image bigint;
	v_changed bigint;
	v_posts bigint;
	v_guidance bigint;
begin
	select count(*) into v_with_image
	from public.classroom_items i
	where i.body_doc is not null
	  and exists (
		select 1 from jsonb_array_elements(i.body_doc) as b(value)
		where b.value->>'type' = 'img'
	  );

	select count(*) into v_changed
	from public.classroom_items i
	where i.body_doc is not null
	  and i.body is distinct from public._classroom_doc_text(i.body_doc);

	select count(*) into v_posts
	from public.classroom_items i
	where i.kind = 'post'
	  and i.body_doc is not null
	  and i.body is distinct from public._classroom_doc_text(i.body_doc);

	if to_regclass('public.notebook_sessions') is null then
		v_guidance := 0;
	else
		execute $q$
			select count(*) from public.notebook_sessions s
			where s.guidance_doc is not null
			  and exists (
				select 1 from jsonb_array_elements(s.guidance_doc) as b(value)
				where b.value->>'type' = 'img'
			  )
		$q$ into v_guidance;
	end if;

	raise notice '0178: % item body_doc(s) contain an image block.', v_with_image;
	raise notice '0178: % item(s) have a stored body the NEW projection disagrees with (% of them announcements).', v_changed, v_posts;
	raise notice '0178: % notebook guidance document(s) contain an image block -- expected 0, since 0176 left that gate narrow.', v_guidance;

	if v_guidance > 0 then
		raise exception
			'0178 refuses: % notebook guidance document(s) contain an image block, which _classroom_doc_ok(p_doc) should have made impossible. Investigate before widening the projection they share.', v_guidance;
	end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Bringing the stored column back into agreement, exactly once
-- ---------------------------------------------------------------------------

-- `classroom_items.body` is DERIVED at write time, not at read time, so a row
-- stored before this file keeps whatever the old projection made of it until
-- somebody saves that item again. For a body carrying a picture that means the
-- description stays missing from the feed card, the headline and the stream
-- for however long nobody reopens it -- so the rows are re-derived here.
--
-- IT RUNS EXACTLY ONCE BY BEING A NO-OP THE SECOND TIME: the predicate is
-- "the column disagrees with the function", which is false for every row this
-- statement has already touched. It cannot rewrite a genuine row on a re-paste
-- the way an unguarded `where body = ''` would.
--
-- IT IS SCOPED TO DOCUMENTS THAT ACTUALLY HOLD AN IMAGE. A row disagreeing for
-- any OTHER reason is not this file's to fix -- it would mean the column and
-- the projection had already drifted, which is a finding rather than a
-- backfill, and section 4 has just printed the number.
--
-- IT CAN ONLY ADD TEXT. The image arm replaces '' with a description, so no
-- row can lose content and `classroom_items_post_body` (which refuses a blank
-- announcement body) cannot be newly violated by this statement.

do $$
declare
	v_rows bigint;
begin
	with moved as (
		update public.classroom_items i
		set body = public._classroom_doc_text(i.body_doc)
		where i.body_doc is not null
		  and i.body is distinct from public._classroom_doc_text(i.body_doc)
		  and exists (
			select 1 from jsonb_array_elements(i.body_doc) as b(value)
			where b.value->>'type' = 'img'
		  )
		returning 1
	)
	select count(*) into v_rows from moved;

	raise notice '0178: re-derived body on % item(s) whose document holds an image.', v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. What the operator should see
-- ---------------------------------------------------------------------------
--
--   NOTICE:  0178: the projection answers the image arm and every pre-existing
--            case unchanged (8 checks).
--   NOTICE:  0178: N item body_doc(s) contain an image block.
--   NOTICE:  0178: N item(s) have a stored body the NEW projection disagrees
--            with (N of them announcements).
--   NOTICE:  0178: 0 notebook guidance document(s) contain an image block --
--            expected 0, since 0176 left that gate narrow.
--   NOTICE:  0178: re-derived body on N item(s) whose document holds an image.
--
-- ON THE PRODUCTION DATABASE AS THIS IS WRITTEN, EVERY ONE OF THOSE N IS
-- EXPECTED TO BE ZERO, and that is a statement about the CLIENT rather than
-- about the gate. 0176 made an image block storable; nothing in `src/` can
-- produce one yet -- there is no `img` in the editor schema, none in the
-- normalizer's block union, none in `ItemBlock` and none in the renderer -- so
-- the only way an image reached the table would be a hand-written PostgREST
-- call on the RPC. A NON-ZERO count is therefore worth reading rather than
-- waving through: it means somebody wrote one directly.
--
-- A count that is non-zero for the SECOND line but zero for the first is a
-- different finding entirely: the column and the projection have drifted for a
-- reason that has nothing to do with images, and section 5 deliberately does
-- not touch those rows.

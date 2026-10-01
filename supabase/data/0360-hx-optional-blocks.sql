-- ---------------------------------------------------------------------------
-- 0360  MARKING A PORTED WORKSHEET'S EXTRA PHOTO SLOTS OPTIONAL.
--
-- WHAT THIS IS FOR (reports d983e776, 2d83c063 and 8f78d5bd, 2026-09-29). The
-- authoring standard told authors to give a photo answer "one required image
-- block with one or two optional slots", before a manifest had any way to SAY a
-- block was optional. So every such slot counted toward completion, a student
-- who took one photo could never reach 100%, and past the due date the class
-- list said Missing over finished work. Ledger 0360 taught the progress rail
-- and every Missing/Complete surface to skip a block whose manifest entry
-- carries "optional": true. THIS FILE ADDS THAT KEY TO A LIVE MANIFEST, for
-- the blocks somebody names; standing is derived on every read, so every
-- surface corrects the moment it lands.
--
-- THE OTHER WAY, AND THE PREFERRED ONE when the authoring chat's source is to
-- hand: re-upload the worksheet through the composer with "optional": true on
-- those blocks. Block ids unchanged, so no stored answer moves, and the upload
-- writes its own revision. This file is for when the source is not to hand.
--
-- IT IS NOT A MIGRATION. A manifest is content a teacher authored, and this is
-- a one-off correction to two rows, pasted once by hand.
--
-- A BLIND PASTE WRITES NOTHING. Section 2's list carries NULL for every item's
-- block ids, and the statement only touches an item whose NULL has been
-- replaced with a real list. Pasting this file as it stands runs the audit,
-- writes zero rows and reports zero rows.
--
-- WHAT IT NEVER TOUCHES: a block id (the join key for every stored answer), the
-- document, the filename, the rubric, and `updated_at`. Leaving `updated_at`
-- alone is deliberate: the document's bytes do not change, so ledger 0357's
-- document cache (keyed on the document and that stamp) stays warm. The
-- manifest is read fresh by every page that uses it.
--
-- IT KEEPS A REVISION FIRST, exactly as `classroom_set_html_assignment` does:
-- the whole head (document, manifest, filename) goes into
-- `classroom_content_revisions` through `_classroom_snapshot_content` before
-- the manifest moves, so the item's version history can put it back. Run from
-- the SQL editor there is no session, so that revision records an empty author
-- email and no author name; it is still a complete, restorable revision.
--
-- UNDO: restore that revision from the item's version history, or paste
-- section 4 with the same lists, which takes the key off those blocks again.
--
-- THE PASTE TRAP: this file carries no dollar sign anywhere, in a comment or
-- in code, so the editor's statement splitter cannot misread it.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. THE AUDIT. Read-only, aggregate, names nobody. Run it first.
--
--    One row per block of the two worksheets, with how many enrolled students
--    have something stored there. A block whose typed + boolean_stored + photo
--    count is far below `students` while its neighbours are near full is the
--    stuck block; an unmarked optional photo slot looks exactly like that. A
--    checkbox row with typed > 0 and boolean_stored = 0, or a text row with
--    boolean_stored > 0, is a value-shape mismatch, which ledger 0360's code
--    already counts with no edit. A high short_of_sentences points at the
--    sentence floor. Two approximations: a table holding only empty cells
--    reads as typed, and an enrolled teacher counts as a student.
-- ---------------------------------------------------------------------------

with items (item_id) as (
	values
		('e4c5d7ad-940b-4355-8bba-7cc9e0c9128a'::uuid),
		('7c374ff3-7d0f-4329-bc90-b41191ce679b'::uuid)
),
blocks as (
	select
		h.item_id,
		m.ord as module_ord,
		m.module->>'title' as module_title,
		b.ord as block_ord,
		b.block->>'id' as block_id,
		b.block->>'field' as field,
		b.block->>'type' as block_type,
		(b.block->>'minSentences')::int as min_sentences,
		coalesce(b.block->'optional' = 'true'::jsonb, false) as marked_optional
	from public.classroom_html_assignments h
	join items i on i.item_id = h.item_id
	cross join lateral jsonb_array_elements(h.manifest->'modules') with ordinality as m(module, ord)
	cross join lateral jsonb_array_elements(coalesce(m.module->'blocks', '[]'::jsonb)) with ordinality as b(block, ord)
),
roster as (
	select distinct p.item_id, e.student_email
	from public.classroom_postings p
	join items i on i.item_id = p.item_id
	join public.classroom_enrollments e on e.section_id = p.section_id and e.active
),
judged as (
	select
		b.*,
		coalesce(
			jsonb_typeof(r.value->'text') = 'string'
				and length(regexp_replace(r.value->>'text', '\s', '', 'g')) > 0,
			false
		) as has_text,
		coalesce(jsonb_typeof(r.value->'checked'->0) = 'boolean', false) as has_boolean,
		exists (
			select 1
			from public.classroom_submissions s
			join public.classroom_submission_files f on f.submission_id = s.id
			where s.item_id = b.item_id and s.student_email = ro.student_email and f.block_id = b.block_id
		) as has_photo,
		case
			when b.min_sentences > 0 and jsonb_typeof(r.value->'text') = 'string'
				then public._classroom_sentence_count(r.value->>'text')
		end as sentences
	from blocks b
	join roster ro on ro.item_id = b.item_id
	left join public.classroom_responses r
		on r.item_id = b.item_id and r.student_email = ro.student_email and r.block_id = b.block_id
)
select
	item_id,
	module_ord,
	module_title,
	block_ord,
	block_id,
	field,
	block_type,
	min_sentences,
	marked_optional,
	count(*) as students,
	count(*) filter (where has_text) as typed,
	count(*) filter (where has_boolean) as boolean_stored,
	count(*) filter (where has_photo) as photo,
	count(*) filter (where sentences < min_sentences) as short_of_sentences
from judged
group by 1, 2, 3, 4, 5, 6, 7, 8, 9
order by 1, 2, 4;


-- ---------------------------------------------------------------------------
-- 2. THE CORRECTION. Replace a NULL with the block ids the audit named as the
--    optional slots, as a text array, for example
--        array['assembly-photo-2', 'assembly-photo-3']
--    Only module blocks are marked; a header block is never counted anyway.
--    Leave an item's NULL in place and that item is not touched.
--
--    One transaction: the revision, the edit, and a check that the edited
--    manifest still passes the database's own manifest validator. If the check
--    raises, the transaction is aborted and nothing is kept.
-- ---------------------------------------------------------------------------

begin;

create temporary table hx_optional_marks (item_id uuid primary key, block_ids text[]) on commit drop;

insert into hx_optional_marks (item_id, block_ids)
select v.item_id, v.block_ids
from (
	values
		-- item id                                        block ids to mark optional
		('e4c5d7ad-940b-4355-8bba-7cc9e0c9128a'::uuid,    null::text[]),
		('7c374ff3-7d0f-4329-bc90-b41191ce679b'::uuid,    null::text[])
) as v(item_id, block_ids)
where v.block_ids is not null and cardinality(v.block_ids) > 0;

-- How many items this will touch. Zero on a blind paste.
select count(*) as items_to_mark from hx_optional_marks;

-- Any named id the manifest does not declare as a module block. Expect none:
-- a typo here would otherwise be silently ignored.
select m.item_id, wanted.block_id as not_found
from hx_optional_marks m
cross join lateral unnest(m.block_ids) as wanted(block_id)
where not exists (
	select 1
	from public.classroom_html_assignments h
	cross join lateral jsonb_array_elements(h.manifest->'modules') as mo(module)
	cross join lateral jsonb_array_elements(coalesce(mo.module->'blocks', '[]'::jsonb)) as bl(block)
	where h.item_id = m.item_id and bl.block->>'id' = wanted.block_id
);

-- The revision, first: the head as it stands, as classroom_set_html_assignment keeps it.
select
	h.item_id,
	public._classroom_snapshot_content(
		h.item_id,
		'html_assignment',
		jsonb_build_object('document', h.document, 'manifest', h.manifest, 'filename', h.filename)
	) as revision_kept
from public.classroom_html_assignments h
join hx_optional_marks m on m.item_id = h.item_id;

-- The edit: every module rebuilt in order, every block in order, the named ones
-- with "optional": true added and nothing else about them changed.
update public.classroom_html_assignments h
set manifest = jsonb_set(
	h.manifest,
	'{modules}',
	(
		select coalesce(jsonb_agg(
			case
				when jsonb_typeof(mo.module->'blocks') = 'array' then jsonb_set(
					mo.module,
					'{blocks}',
					(
						select coalesce(jsonb_agg(
							case
								when bl.block->>'id' = any (m.block_ids) then bl.block || '{"optional": true}'::jsonb
								else bl.block
							end
							order by bl.ord
						), '[]'::jsonb)
						from jsonb_array_elements(mo.module->'blocks') with ordinality as bl(block, ord)
					)
				)
				else mo.module
			end
			order by mo.ord
		), '[]'::jsonb)
		from jsonb_array_elements(h.manifest->'modules') with ordinality as mo(module, ord)
	)
)
from hx_optional_marks m
where h.item_id = m.item_id;

-- The database's own validator, over every edited manifest. It returns nothing
-- and raises on a manifest it refuses, so one row per item here means each one
-- passed; a raise aborts the transaction and the commit below keeps nothing.
select h.item_id, public._classroom_check_html_manifest(h.manifest) as validator_passed
from public.classroom_html_assignments h
join hx_optional_marks m on m.item_id = h.item_id;

commit;


-- ---------------------------------------------------------------------------
-- 3. READ IT BACK. Run section 1 again: the marked_optional column says true on
--    exactly the blocks named, and the class list, the to-do and the grading
--    roster now judge those students against the required blocks only.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 4. THE UNDO, if it is wanted. The same lists, the key taken off those blocks.
--    Blind-safe in the same way: NULL lists touch nothing. (Restoring the
--    revision section 2 kept, from the item's version history, does the same
--    and is the better undo if anything else has changed since.)
-- ---------------------------------------------------------------------------

-- update public.classroom_html_assignments h
-- set manifest = jsonb_set(
-- 	h.manifest,
-- 	'{modules}',
-- 	(
-- 		select coalesce(jsonb_agg(
-- 			case
-- 				when jsonb_typeof(mo.module->'blocks') = 'array' then jsonb_set(
-- 					mo.module,
-- 					'{blocks}',
-- 					(
-- 						select coalesce(jsonb_agg(
-- 							case
-- 								when bl.block->>'id' = any (u.block_ids) then bl.block - 'optional'
-- 								else bl.block
-- 							end
-- 							order by bl.ord
-- 						), '[]'::jsonb)
-- 						from jsonb_array_elements(mo.module->'blocks') with ordinality as bl(block, ord)
-- 					)
-- 				)
-- 				else mo.module
-- 			end
-- 			order by mo.ord
-- 		), '[]'::jsonb)
-- 		from jsonb_array_elements(h.manifest->'modules') with ordinality as mo(module, ord)
-- 	)
-- )
-- from (
-- 	values
-- 		('e4c5d7ad-940b-4355-8bba-7cc9e0c9128a'::uuid, null::text[]),
-- 		('7c374ff3-7d0f-4329-bc90-b41191ce679b'::uuid, null::text[])
-- ) as u(item_id, block_ids)
-- where h.item_id = u.item_id and u.block_ids is not null;

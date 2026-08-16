-- 0110: classroom content keeps its own history, and attaching a spec over an
-- existing one stops being destructive.
--
-- WHAT THIS REPLACES. Since 0086/0092/0095 the four content tables have been
-- single-row heads keyed on item_id, written with `on conflict (item_id) do
-- update`. Importing a spec over an existing one OVERWROTE it, with no copy of
-- what was there and no way back -- a teacher who pasted the wrong file, or a
-- newer export that turned out worse, lost the previous document outright. That
-- is the one thing this migration exists to end.
--
-- THE HEAD STAYS THE HEAD. classroom_items, classroom_assignment_specs,
-- classroom_reference_specs and classroom_rubrics are untouched in shape and
-- remain what every reader reads: no view, no "current" flag, no join to work
-- out what is live. What changes is that BEFORE a write that would displace
-- content, the content being displaced is copied into
-- classroom_content_revisions. Nothing else about a read path moves.
--
-- ONE ROW PER REVISION, NEVER AN UPDATE -- the notebook_entry_notes discipline
-- (0078) applied to teacher-authored content. There is no UPDATE or DELETE
-- grant or policy on this table at all, and the only column any function ever
-- rewrites is restored_from_id, on a row it inserted moments earlier in the same
-- transaction (see classroom_restore_revision).
--
-- THE CHAIN, and how it differs from 0078's. There, the chain's identity was a
-- logical note (note_id, a self-reference). Here the chain is identified by the
-- PAIR (item_id, target): "the reference document on this material" is one
-- history, "the rubric on this assignment" is another, and they advance
-- independently. So:
--
--   unique (item_id, target, revision)  is 0078's `unique (note_id, revision)`
--   supersedes_id UNIQUE                is 0078's, unchanged: a chain that
--                                       cannot fork into two heads
--   revision 1 <=> supersedes_id null   is 0078's pair of CHECKs, restated
--
-- supersedes_id is redundant with (item_id, target, revision) by design, exactly
-- as it is in 0078: the pointer is the readable statement of what happened, the
-- triple is the constraint that enforces it, and the two CHECKs keep them
-- agreeing.
--
-- WHAT A REVISION ROW MEANS, stated precisely because the obvious reading is
-- the wrong one. A row holds the payload that was DISPLACED, and its
-- author_email / author_name / created_at describe THE WRITE THAT DISPLACED IT
-- -- who replaced this content, and when -- not who originally authored the
-- payload or when they wrote it. That is the only attribution that is reliably
-- knowable at snapshot time (classroom_items.author_email is the item's
-- CREATOR, not its last editor, and an item may have been edited many times
-- before this migration existed), and mixing "the payload's author" for the two
-- tables that happen to record one with "the displacing author" for the two that
-- do not would be worse than either. The History panel labels it
-- "Replaced by <name>" for the same reason.
--
-- WHICH REVISION IS CURRENT IS NOT STORED, AND THE HEAD IS NOT IN THIS TABLE.
-- The live content is the head row in its own table; this table holds only what
-- has been superseded. So the head's own revision number is DERIVED -- one more
-- than the highest revision recorded for its (item, target) pair, or 1 when
-- there are none -- which is what classroom_item_revisions returns as
-- `head_revision`. Same reasoning as coin_balances summing its ledger rather
-- than storing a balance.
--
-- A NO-OP SAVE WRITES NO REVISION. For an item that is 0104's existing
-- `v_changed` -- reused, not re-derived, so "did the content change" keeps
-- exactly one definition and the Updated badge and the history can never
-- disagree about it. For the three jsonb heads, which have no such predicate
-- because they have never needed one, it is a plain `is distinct from` against
-- the stored payload.
--
-- RESTORE NEVER REWINDS. classroom_restore_revision writes the chosen payload
-- as a NEW HEAD through the ordinary setter for its target -- which snapshots
-- the head it displaces on the way, like any other write. So the chain only
-- ever grows, restoring is itself an event in the history rather than a gap in
-- it, and a restore can be undone by restoring what it displaced.
-- restored_from_id on that snapshot row names the revision that was restored,
-- so the panel can say so rather than leaving a reader to infer it from two
-- payloads happening to match. (That column is beyond the brief's list; it is
-- one nullable uuid and it is the difference between a restore being legible
-- and being reconstructable.)
--
-- WHO MAY READ IT: classroom_can_read_instructor_material (0090) -- the
-- manager-only half of classroom_can_read_item, already granted to
-- `authenticated` and already the answer to "may this caller see this item's
-- teacher-facing material". Revision history is exactly that: earlier drafts of
-- an item are teacher-facing, a student has no business reading them, and a
-- teacher of ONE of a shared item's classes can already see the current content
-- and its answer keys. It is deliberately NOT _classroom_manages_item, which is
-- the stricter EDIT bar (every posted class) and is what restoring requires --
-- and which has no grant to `authenticated` at all, so naming it in a policy
-- would fail with `permission denied for function` the moment a real client
-- read the table (the 0070 lesson).
--
-- THE EXPORT COLUMNS on classroom_items are bookkeeping for the GitHub export
-- (src/lib/server/classroom-export.ts), not content: which folder this item's
-- spec was written to, when it last succeeded, the commit it landed as, and the
-- last failure if there was one. export_slug is ASSIGNED ONCE and then never
-- recomputed, so renaming a material does not orphan its exported folder and
-- leave two copies in the repo.
--
-- Apply manually in the Supabase SQL editor, after 0109. Idempotent: every
-- statement is `if not exists` / `create or replace` / guarded, and the file
-- may be re-run over its own objects.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_content_revisions (
	id uuid primary key default gen_random_uuid(),
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	-- Which of the item's four content heads this is a history of. A CHECK
	-- rather than an enum, matching classroom_items.kind and every other small
	-- closed set in this module.
	target text not null check (target in ('item', 'assignment_spec', 'reference_spec', 'rubric')),
	revision integer not null check (revision >= 1),
	payload jsonb not null,
	-- The write that DISPLACED this payload. See the header.
	author_email text,
	author_name text,
	-- The revision this one replaced. Unique, so a chain never forks; null only
	-- on revision 1 (nulls are distinct to a unique index, so every chain's
	-- first revision is fine).
	--
	-- CASCADE, NOT SET NULL, and that is forced rather than chosen: the CHECK
	-- below requires this to be non-null on every revision above 1, so nulling
	-- it on a delete would violate the row's own constraint. 0078 is cascade for
	-- the same reason. In practice nothing deletes a revision on its own -- the
	-- only delete path is the item cascade, which takes the whole chain anyway.
	supersedes_id uuid unique references public.classroom_content_revisions (id) on delete cascade,
	-- Set only on the snapshot a RESTORE displaced, naming the revision that was
	-- restored over it. Null on every ordinary write.
	restored_from_id uuid references public.classroom_content_revisions (id) on delete set null,
	created_at timestamptz not null default now(),
	unique (item_id, target, revision),
	-- Revision 1 is the root of its own chain and replaced nothing...
	constraint classroom_content_revisions_root check (
		revision > 1 or supersedes_id is null
	),
	-- ...and every later revision replaced something.
	constraint classroom_content_revisions_chain check (
		revision = 1 or supersedes_id is not null
	)
);

create index if not exists classroom_content_revisions_item_idx
	on public.classroom_content_revisions (item_id, created_at desc);
create index if not exists classroom_content_revisions_chain_idx
	on public.classroom_content_revisions (item_id, target, revision desc);

-- ---------------------------------------------------------------------------
-- 2. Export bookkeeping on the item itself.
--
-- Four nullable columns, all written by ONE RPC (classroom_record_export) after
-- a push, and read by the manage console's failure chip. None of them is
-- content and none of them is on any student read path.
-- ---------------------------------------------------------------------------

alter table public.classroom_items
	add column if not exists export_slug text,
	add column if not exists last_export_at timestamptz,
	add column if not exists last_export_sha text,
	add column if not exists last_export_error text;

-- ---------------------------------------------------------------------------
-- 3. Privileges + RLS. SELECT only, as everywhere else in this module.
-- ---------------------------------------------------------------------------

revoke all on public.classroom_content_revisions from anon, authenticated;
grant select on public.classroom_content_revisions to authenticated;
alter table public.classroom_content_revisions enable row level security;

drop policy if exists "classroom revisions follow their item" on public.classroom_content_revisions;
create policy "classroom revisions follow their item"
	on public.classroom_content_revisions
	for select
	to authenticated
	using (public.classroom_can_read_instructor_material(item_id));

-- ---------------------------------------------------------------------------
-- 4. The snapshot helper.
--
-- Internal (no grants, the _classroom_ convention): only the SECURITY DEFINER
-- setters below reach it, and they run as the owner.
--
-- Returns the revision number it wrote, or null when there was nothing to
-- snapshot -- which is the ordinary case for the FIRST spec attached to an
-- item. A null payload is not history; it is the absence of a head.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_snapshot_content(
	p_item_id uuid,
	p_target text,
	p_payload jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_head_id uuid;
	v_head_revision integer;
	v_revision integer;
begin
	if p_payload is null or jsonb_typeof(p_payload) = 'null' then
		return null;
	end if;

	-- `for update` on the chain's current tail: two concurrent writes to the
	-- same (item, target) serialize here rather than colliding on the unique
	-- constraint with a raw error.
	select r.id, r.revision into v_head_id, v_head_revision
	from public.classroom_content_revisions r
	where r.item_id = p_item_id and r.target = p_target
	order by r.revision desc
	limit 1
	for update;

	v_revision := coalesce(v_head_revision, 0) + 1;

	insert into public.classroom_content_revisions
		(item_id, target, revision, payload, author_email, author_name, supersedes_id)
	values (
		p_item_id, p_target, v_revision, p_payload,
		public.current_user_email(), public._classroom_author_name(), v_head_id
	);

	return v_revision;
end;
$$;

revoke all on function public._classroom_snapshot_content(uuid, text, jsonb) from public;

-- The item head's own payload, in ONE place so the snapshot and the restore
-- cannot disagree about what an item revision contains. Deliberately NOT the
-- whole row: created_at, the author, the publish stamps, the pin and the export
-- bookkeeping are not content a teacher authored, and restoring them would
-- rewrite history rather than content. Links are not here either -- see
-- classroom_restore_revision.
create or replace function public._classroom_item_payload(p_item public.classroom_items)
returns jsonb
language sql
immutable
set search_path = ''
as $$
	select jsonb_build_object(
		'title', p_item.title,
		'body', p_item.body,
		'body_doc', p_item.body_doc,
		'points', p_item.points,
		'due_at', p_item.due_at,
		'category', p_item.category,
		'publish_at', p_item.publish_at
	);
$$;

revoke all on function public._classroom_item_payload(public.classroom_items) from public;

-- ---------------------------------------------------------------------------
-- 5. The four setters, recreated so a write snapshots what it displaces.
--
-- Each one is its latest shipped body with the snapshot added and NOTHING else
-- changed: 0109's classroom_update_item, 0092's two spec setters, 0095's
-- classroom_set_rubric. Every signature is identical to the one it replaces, so
-- `create or replace` is all any of them needs and no second overload can
-- exist (the 0058/0068/0096 trap).
-- ---------------------------------------------------------------------------

-- 0109's body, plus: when v_changed, snapshot the OLD item payload first.
--
-- v_changed is reused rather than re-derived. It is already the definition of
-- "the content moved" that drives the student-facing Updated badge, so binding
-- the history to it means the two can never disagree -- and it already excludes
-- the things that are not content edits (publishing a draft, rescheduling a
-- not-yet-live item), which must not mint a revision either.
create or replace function public.classroom_update_item(
	p_id uuid,
	p_title text default null,
	p_body text default '',
	p_points integer default null,
	p_due_at timestamptz default null,
	p_category text default null,
	p_published boolean default null,
	p_resources jsonb default null,
	p_body_doc jsonb default null,
	p_publish_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_old public.classroom_items%rowtype;
	v_title text := nullif(btrim(coalesce(p_title, '')), '');
	v_category text := nullif(btrim(coalesce(p_category, '')), '');
	v_published boolean;
	v_links_changed boolean;
	v_changed boolean;
	v_touched boolean;
	v_edited timestamptz;
	v_was_live boolean;
	v_doc jsonb;
	v_body text;
	v_revision integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	if not public._classroom_doc_ok(p_body_doc) then
		raise exception 'That body could not be read.';
	end if;

	select i.* into v_old from public.classroom_items i where i.id = p_id for update;
	if not found then
		raise exception 'That item does not exist.';
	end if;
	if not public._classroom_manages_item(p_id) then
		raise exception 'Only the teacher of record for every class this is posted to can edit it.';
	end if;

	if p_body_doc is null or p_body_doc = 'null'::jsonb then
		v_body := coalesce(p_body, '');
		v_doc := public._classroom_doc_from_text(v_body);
	else
		v_doc := p_body_doc;
		v_body := public._classroom_doc_text(v_doc);
	end if;

	perform public._classroom_check_item_fields(
		v_old.kind, v_title, v_body, p_points, p_due_at, v_category);

	v_published := coalesce(p_published, v_old.published);

	v_links_changed := public._classroom_resources_changed(p_id, p_resources);

	-- 0104's rule with 0108's document term, unchanged.
	v_changed :=
		coalesce(v_title, '') is distinct from coalesce(v_old.title, '')
		or v_body is distinct from v_old.body
		or v_doc is distinct from coalesce(v_old.body_doc, public._classroom_doc_from_text(v_old.body))
		or p_points is distinct from v_old.points
		or p_due_at is distinct from v_old.due_at
		or coalesce(v_category, '') is distinct from coalesce(v_old.category, '')
		or v_links_changed;

	v_touched :=
		v_changed
		or v_published is distinct from v_old.published
		or p_publish_at is distinct from v_old.publish_at;

	v_was_live := public._classroom_item_live(v_old.published, v_old.publish_at);

	v_edited := case
		when v_changed and v_old.first_published_at is not null and v_was_live then now()
		else v_old.edited_at
	end;

	-- NEW IN 0110, and the only addition: keep what is about to be overwritten.
	-- Inside the same transaction as the head write, so a failed update cannot
	-- leave a revision claiming a change that never landed.
	if v_changed then
		v_revision := public._classroom_snapshot_content(
			p_id, 'item', public._classroom_item_payload(v_old));
	end if;

	update public.classroom_items
	set title = v_title,
		body = v_body,
		body_doc = v_doc,
		points = p_points,
		due_at = p_due_at,
		category = v_category,
		published = v_published,
		publish_at = p_publish_at,
		first_published_at = coalesce(v_old.first_published_at, case when v_published then now() end),
		edited_at = v_edited,
		updated_at = case when v_touched then now() else v_old.updated_at end
	where id = p_id;

	if v_links_changed then
		perform public._classroom_write_resources(p_id, p_resources);
	end if;

	return jsonb_build_object(
		'item_id', p_id,
		'published', v_published,
		'edited', v_changed,
		'revision', v_revision,
		'live', public._classroom_item_live(v_published, p_publish_at)
	);
end;
$$;

revoke all on function public.classroom_update_item(
	uuid, text, text, integer, timestamptz, text, boolean, jsonb, jsonb, timestamptz) from public;
grant execute on function public.classroom_update_item(
	uuid, text, text, integer, timestamptz, text, boolean, jsonb, jsonb, timestamptz) to authenticated;

-- 0092's body, plus the snapshot. A REMOVAL (p_spec null) snapshots too: losing
-- a document by clearing it is exactly the loss this migration exists to stop,
-- and it is what makes "Remove" recoverable rather than final.
create or replace function public.classroom_set_assignment_spec(
	p_item_id uuid,
	p_spec jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_kind text;
	v_current jsonb;
	v_revision integer;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	select i.kind into v_kind from public.classroom_items i where i.id = p_item_id;
	if v_kind is null then
		raise exception 'That item does not exist.';
	end if;
	if v_kind <> 'assignment' then
		raise exception 'Only an assignment can carry an interactive spec.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can set its spec.';
	end if;

	select s.spec into v_current
	from public.classroom_assignment_specs s
	where s.item_id = p_item_id
	for update;

	if p_spec is null or jsonb_typeof(p_spec) = 'null' then
		v_revision := public._classroom_snapshot_content(p_item_id, 'assignment_spec', v_current);
		delete from public.classroom_assignment_specs where item_id = p_item_id;
		return jsonb_build_object(
			'ok', true, 'item_id', p_item_id, 'removed', true, 'revision', v_revision);
	end if;

	if pg_column_size(p_spec) > 400000 then
		raise exception 'The spec is too large (400 KB cap).';
	end if;
	perform public._classroom_assert_assignment_kind(p_spec);
	perform public._classroom_check_spec(p_spec);

	-- The no-op guard. These heads have never carried a changed-detection
	-- predicate because nothing needed one; jsonb equality IS the whole
	-- question for a document stored verbatim.
	if v_current is distinct from p_spec then
		v_revision := public._classroom_snapshot_content(p_item_id, 'assignment_spec', v_current);
	end if;

	insert into public.classroom_assignment_specs (item_id, spec, imported_by, updated_at)
	values (p_item_id, p_spec, public.current_user_email(), now())
	on conflict (item_id) do update
		set spec = excluded.spec, imported_by = excluded.imported_by, updated_at = now();

	return jsonb_build_object('ok', true, 'item_id', p_item_id, 'revision', v_revision);
end;
$$;

revoke all on function public.classroom_set_assignment_spec(uuid, jsonb) from public;
grant execute on function public.classroom_set_assignment_spec(uuid, jsonb) to authenticated;

-- 0092's body, plus the snapshot. Same shape as the assignment setter above.
create or replace function public.classroom_set_reference_spec(
	p_item_id uuid,
	p_spec jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_kind text;
	v_current jsonb;
	v_revision integer;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	select i.kind into v_kind from public.classroom_items i where i.id = p_item_id;
	if v_kind is null then
		raise exception 'That item does not exist.';
	end if;
	if v_kind <> 'material' then
		raise exception 'Only a material can carry a reference document.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can set its reference document.';
	end if;

	select s.spec into v_current
	from public.classroom_reference_specs s
	where s.item_id = p_item_id
	for update;

	if p_spec is null or jsonb_typeof(p_spec) = 'null' then
		v_revision := public._classroom_snapshot_content(p_item_id, 'reference_spec', v_current);
		delete from public.classroom_reference_specs where item_id = p_item_id;
		return jsonb_build_object(
			'ok', true, 'item_id', p_item_id, 'removed', true, 'revision', v_revision);
	end if;

	if pg_column_size(p_spec) > 400000 then
		raise exception 'The reference document is too large (400 KB cap).';
	end if;
	perform public._classroom_check_reference_spec(p_spec);

	if v_current is distinct from p_spec then
		v_revision := public._classroom_snapshot_content(p_item_id, 'reference_spec', v_current);
	end if;

	insert into public.classroom_reference_specs (item_id, spec, imported_by, updated_at)
	values (p_item_id, p_spec, public.current_user_email(), now())
	on conflict (item_id) do update
		set spec = excluded.spec, imported_by = excluded.imported_by, updated_at = now();

	return jsonb_build_object('ok', true, 'item_id', p_item_id, 'revision', v_revision);
end;
$$;

revoke all on function public.classroom_set_reference_spec(uuid, jsonb) from public;
grant execute on function public.classroom_set_reference_spec(uuid, jsonb) to authenticated;

-- 0095's body, plus the snapshot.
--
-- The snapshot is taken of the STORED criteria and compared against the
-- NORMALIZED incoming ones -- never against the raw parameter. _classroom_
-- normalize_rubric re-derives each criterion's points from its top level and
-- stamps `incomplete` itself, so a caller sending the same rubric with a stale
-- `points` field is a no-op and must not mint a revision that differs from its
-- predecessor only in a field the server discards.
create or replace function public.classroom_set_rubric(
	p_item_id uuid,
	p_criteria jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_kind text;
	v_criteria jsonb;
	v_current jsonb;
	v_unfinished integer;
	v_revision integer;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	select i.kind into v_kind from public.classroom_items i where i.id = p_item_id;
	if v_kind is null then
		raise exception 'That item does not exist.';
	end if;
	if v_kind <> 'assignment' then
		raise exception 'Only an assignment can carry a rubric.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can edit its rubric.';
	end if;

	select r.criteria into v_current
	from public.classroom_rubrics r
	where r.item_id = p_item_id
	for update;

	if p_criteria is null or jsonb_typeof(p_criteria) = 'null' then
		v_revision := public._classroom_snapshot_content(p_item_id, 'rubric', v_current);
		delete from public.classroom_rubrics where item_id = p_item_id;
		return jsonb_build_object(
			'ok', true, 'item_id', p_item_id, 'removed', true, 'revision', v_revision);
	end if;

	v_criteria := public._classroom_normalize_rubric(p_criteria);
	select count(*) into v_unfinished
	from jsonb_array_elements(v_criteria) c
	where (c->>'incomplete')::boolean;

	if v_current is distinct from v_criteria then
		v_revision := public._classroom_snapshot_content(p_item_id, 'rubric', v_current);
	end if;

	insert into public.classroom_rubrics (item_id, criteria, updated_by, updated_at)
	values (p_item_id, v_criteria, public.current_user_email(), now())
	on conflict (item_id) do update
		set criteria = excluded.criteria, updated_by = excluded.updated_by, updated_at = now();

	return jsonb_build_object(
		'ok', true, 'item_id', p_item_id, 'unfinished', v_unfinished, 'revision', v_revision);
end;
$$;

revoke all on function public.classroom_set_rubric(uuid, jsonb) from public;
grant execute on function public.classroom_set_rubric(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Reading the history.
--
-- A definer RPC rather than a bare select for ONE reason: `head_revision` is
-- derived per (item, target) and every caller needs it to say "r4 of 5" without
-- computing it themselves. The rows it returns are exactly the rows the SELECT
-- policy above would return -- it re-asks the SAME question
-- (classroom_can_read_instructor_material) rather than widening anything, and a
-- caller who prefers the plain select gets an identical answer.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_item_revisions(p_item_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
	v_rows jsonb;
	v_heads jsonb;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.classroom_can_read_instructor_material(p_item_id) then
		raise exception 'That item does not exist.';
	end if;

	select coalesce(jsonb_agg(entry order by row_created desc, row_revision desc), '[]'::jsonb)
	into v_rows
	from (
		select
			jsonb_build_object(
				'id', r.id,
				'target', r.target,
				'revision', r.revision,
				'payload', r.payload,
				'author_email', r.author_email,
				'author_name', r.author_name,
				'supersedes_id', r.supersedes_id,
				'restored_from_id', r.restored_from_id,
				'created_at', r.created_at
			) as entry,
			r.created_at as row_created,
			r.revision as row_revision
		from public.classroom_content_revisions r
		where r.item_id = p_item_id
	) ordered;

	-- The live version number per target: one more than the highest recorded.
	select coalesce(jsonb_object_agg(t.target, t.head), '{}'::jsonb)
	into v_heads
	from (
		select r.target, max(r.revision) + 1 as head
		from public.classroom_content_revisions r
		where r.item_id = p_item_id
		group by r.target
	) t;

	return jsonb_build_object('revisions', v_rows, 'head_revisions', v_heads);
end;
$$;

revoke all on function public.classroom_item_revisions(uuid) from public;
grant execute on function public.classroom_item_revisions(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Restore.
--
-- Applies a recorded payload as the new head THROUGH THE ORDINARY SETTER for
-- its target. That is the whole design: restoring is not a special write path
-- with its own rules, it is a normal write whose content happens to come from
-- the history. Consequences that follow for free, rather than being remembered:
--
--   * the head it displaces is snapshotted, like any other write;
--   * every validator runs again -- so restoring a payload that a later
--     migration would now refuse fails with THAT validator's own message,
--     rather than putting content into the head that the schema no longer
--     accepts;
--   * the edit-visibility rule applies unchanged, so restoring content on a
--     live item raises the student's Updated badge exactly as re-typing it
--     would;
--   * authorization is the setter's own (_classroom_manages_item, every posted
--     class), reached through a nested SECURITY DEFINER call that reads the
--     same session claims -- the coin_bulk_log_section pattern.
--
-- LINKS AND ATTACHMENTS ARE NOT RESTORED, and an item revision does not carry
-- them. p_resources is passed as null, which 0085 defines as "leave them
-- alone". Restoring a body is a content decision; silently reverting a
-- teacher's link list or removing a file uploaded since is not, and there is no
-- way to express "revert this half" that a reader would predict correctly.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_restore_revision(p_revision_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_rev public.classroom_content_revisions%rowtype;
	v_before integer;
	v_after integer;
	v_new_id uuid;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;

	select r.* into v_rev
	from public.classroom_content_revisions r
	where r.id = p_revision_id;
	if not found then
		raise exception 'That revision does not exist.';
	end if;
	-- The EDIT bar, not the read bar: putting old content back in front of a
	-- class is a write, so it needs what every other write to this item needs.
	if not public._classroom_manages_item(v_rev.item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can restore it.';
	end if;

	select max(r.revision) into v_before
	from public.classroom_content_revisions r
	where r.item_id = v_rev.item_id and r.target = v_rev.target;

	if v_rev.target = 'item' then
		perform public.classroom_update_item(
			v_rev.item_id,
			v_rev.payload ->> 'title',
			coalesce(v_rev.payload ->> 'body', ''),
			nullif(v_rev.payload ->> 'points', '')::integer,
			nullif(v_rev.payload ->> 'due_at', '')::timestamptz,
			v_rev.payload ->> 'category',
			null,
			null,
			case
				when jsonb_typeof(v_rev.payload -> 'body_doc') = 'null' then null
				else v_rev.payload -> 'body_doc'
			end,
			nullif(v_rev.payload ->> 'publish_at', '')::timestamptz
		);
	elsif v_rev.target = 'assignment_spec' then
		perform public.classroom_set_assignment_spec(v_rev.item_id, v_rev.payload);
	elsif v_rev.target = 'reference_spec' then
		perform public.classroom_set_reference_spec(v_rev.item_id, v_rev.payload);
	elsif v_rev.target = 'rubric' then
		perform public.classroom_set_rubric(v_rev.item_id, v_rev.payload);
	else
		raise exception 'That revision cannot be restored.';
	end if;

	select max(r.revision) into v_after
	from public.classroom_content_revisions r
	where r.item_id = v_rev.item_id and r.target = v_rev.target;

	-- Only when the setter actually snapshotted something: restoring content
	-- identical to what is already live is a no-op, and marking a row that was
	-- not written by this call would be a lie.
	if v_after is distinct from v_before then
		update public.classroom_content_revisions
		set restored_from_id = p_revision_id
		where item_id = v_rev.item_id and target = v_rev.target and revision = v_after
		returning id into v_new_id;
	end if;

	return jsonb_build_object(
		'ok', true,
		'item_id', v_rev.item_id,
		'target', v_rev.target,
		'restored', v_rev.revision,
		'snapshot_id', v_new_id,
		'changed', v_after is distinct from v_before
	);
end;
$$;

revoke all on function public.classroom_restore_revision(uuid) from public;
grant execute on function public.classroom_restore_revision(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Export bookkeeping.
--
-- The ONLY write path to the four export columns. Called by the server-side
-- exporter (src/lib/server/classroom-export.ts) after a push attempt, under the
-- CALLER'S OWN session, so a teacher can only ever stamp an item they manage.
--
-- p_slug is written ONCE and never overwritten -- the folder an item's spec
-- lives in must not move when its title is edited, or the repo accumulates two
-- copies of the same material under different names with no link between them.
-- The caller reads back the slug that is actually in force.
--
-- A SUCCESS CLEARS THE ERROR and a FAILURE LEAVES THE LAST GOOD SHA ALONE:
-- "this exported cleanly at 14:02, and the attempt at 14:40 failed" is two
-- facts and the chip needs both.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_record_export(
	p_item_id uuid,
	p_slug text,
	p_sha text default null,
	p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_slug text;
	v_error text := nullif(btrim(coalesce(p_error, '')), '');
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can export it.';
	end if;

	select coalesce(i.export_slug, nullif(btrim(coalesce(p_slug, '')), ''))
	into v_slug
	from public.classroom_items i
	where i.id = p_item_id
	for update;

	update public.classroom_items
	set export_slug = v_slug,
		last_export_at = case when v_error is null then now() else last_export_at end,
		last_export_sha = coalesce(nullif(btrim(coalesce(p_sha, '')), ''), last_export_sha),
		last_export_error = v_error
	where id = p_item_id;

	return jsonb_build_object('ok', true, 'item_id', p_item_id, 'slug', v_slug);
end;
$$;

revoke all on function public.classroom_record_export(uuid, text, text, text) from public;
grant execute on function public.classroom_record_export(uuid, text, text, text) to authenticated;

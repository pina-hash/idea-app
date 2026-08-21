-- 0123_notebook_session_guidance.sql
-- A notebook check-in can carry an instructor-authored GUIDANCE PROMPT: the
-- paragraph that says what to photograph and what to write about it, on the
-- check-in itself rather than squeezed into its label.
--
-- Apply manually in the Supabase SQL editor, after 0122.
--
-- ===========================================================================
-- WHAT THIS BUNDLE IS, AND WHAT IT IS NOT
-- ===========================================================================
--
-- It ships the COLUMN and the WRITE, and no client code at all. That ordering
-- is the rule this repo already follows for a validation gate: a gate that
-- accepts a shape nothing produces is INERT, while a producer emitting a shape
-- the gate refuses breaks every save on the feature at once. The same
-- asymmetry applies to storage -- a column nothing writes is inert, a client
-- naming a column that does not exist yet is a PostgREST error on every read.
-- So the column and its one RPC land first, alone.
--
-- ===========================================================================
-- THE CLASSROOM RICH-TEXT CONTRACT, REUSED RATHER THAN RESTATED
-- ===========================================================================
--
-- `guidance_doc` is the SAME closed document shape `classroom_items.body_doc`
-- carries (0108, widened for nested lists by 0122): an array of `p` / `h3` /
-- `h4` / `ul` / `ol` blocks whose runs are flat `{text, bold, italic, href}`
-- objects. It is validated by `public._classroom_doc_ok`, and THAT CALL IS THE
-- BOUNDARY -- this RPC is granted to `authenticated` and reachable straight
-- through PostgREST, so nothing upstream of it can be trusted to have
-- normalized anything.
--
-- ON THE NAME. `_classroom_doc_ok` reads as classroom-only and is not: it is a
-- PURE jsonb predicate that names no table, no column and no policy, so it is
-- as applicable here as it is there. It is CALLED rather than CLONED,
-- deliberately. A second copy of "what may a document contain" is exactly the
-- thing that quietly stops matching -- 0122 had to widen that shape once
-- already, and a clone would have kept refusing nested lists in the notebook
-- while accepting them in the classroom, with nothing anywhere to say which
-- was right. The prefix is a naming mismatch and it is NOTED here rather than
-- fixed: renaming a function that ~90 applied references resolve BY NAME is
-- how the `is_teacher()` trap was made, and the mismatch costs a comment where
-- the rename would cost a migration nobody can take back.
--
-- The character cap is `_classroom_doc_text` + 20000: the classroom body's own
-- cap, measured through the classroom body's own projection. Picking a
-- different number here would be the third contract this file exists to avoid.
--
-- ===========================================================================
-- WHY A NARROW WRITE, AND NOT A FOURTH PARAMETER ON THE UPSERT
-- ===========================================================================
--
-- `notebook_admin_upsert_session` is a WHOLE-ROW REPLACE that also RECONCILES
-- THE SECTION LIST: it adds the postings that are missing and UNPOSTS the ones
-- no longer listed, detaching those students' entries on the way out. Every
-- parameter it takes is load-bearing on every call, so a caller who wanted to
-- change only the guidance would have to restate the unit, the date, the label
-- AND every section the check-in runs in -- and getting the last of those
-- wrong, by passing null, takes the check-in out of those classes and detaches
-- the work filed against it. A parameter whose omission can unpost a class is
-- not a field, it is a hazard.
--
-- So the guidance gets its OWN RPC, and it sets exactly one column. Nothing
-- else on the row can move through it, in either direction.
--
-- NULL CLEARS, and this is the ONLY way to clear it. Removing a prompt is an
-- ordinary instructor action, not a destructive one -- the guidance is an
-- instruction, not a record -- so it needs no arming step and no second RPC.
-- SQL null, JSON `null` and an empty array all mean the same thing and are all
-- stored as SQL NULL: "a prompt with no blocks in it" is a state no reader can
-- render differently from "no prompt", and storing both shapes would make
-- every reader check for two.
--
-- ===========================================================================
-- AUTHORED ONCE, ON THE CANONICAL CHECK-IN
-- ===========================================================================
--
-- The column is on `notebook_sessions`, NOT on `notebook_session_postings`. A
-- check-in posted to three classes is ONE authored thing with three postings
-- (0098), and the posting deliberately carries no state of its own -- the
-- moment it could, the three copies could drift and a teacher would be editing
-- the same sentence three times. One check-in, one prompt, in every class it
-- runs in.
--
-- The bar for writing it is `_notebook_manages_session`: the caller must manage
-- EVERY section the check-in runs in, which is the bar editing its label or its
-- date already carries, for the same reason -- the edit changes what all of
-- those classes see.
--
-- ===========================================================================
-- NO REVISION HISTORY, DELIBERATELY
-- ===========================================================================
--
-- `classroom_content_revisions` (0110) exists because an item body is work a
-- teacher can lose. A check-in has no revision history today -- its label, date
-- and unit are plain updates -- and this column is not the thing to grow one
-- for. Editing a prompt is an instructor CORRECTING AN INSTRUCTION: what every
-- class should see afterwards is the corrected sentence, everywhere, which is
-- what an in-place update gives. A superseding-row chain would fork the prompt
-- into "current" and "what period 2 saw on Tuesday", and there is no surface
-- that wants the second one.

-- ---------------------------------------------------------------------------
-- 1. The column.
-- ---------------------------------------------------------------------------
--
-- Nullable, with NO backfill: null is the existing behaviour and every check-in
-- that exists right now has it. There is nothing to migrate, and nothing to
-- undo if this is never used.
--
-- NO TABLE CHECK CONSTRAINT, matching `classroom_items.body_doc`. There are
-- ZERO client write grants on this table (0069 grants SELECT only), so the RPC
-- below is the only door -- and re-stating the gate as a constraint would pin
-- an applied table to one version of a predicate that has already had to widen
-- once, with every stored row then standing between it and the next widening.

alter table public.notebook_sessions
	add column if not exists guidance_doc jsonb;

comment on column public.notebook_sessions.guidance_doc is
	'The instructor-authored guidance prompt for this check-in (0123), in the '
	'closed rich-text shape classroom_items.body_doc uses, validated by '
	'_classroom_doc_ok. Null = no prompt, which is every check-in made before '
	'this migration. Authored once on the canonical check-in, so every posting '
	'of it shows the same prompt. Written only by '
	'notebook_set_session_guidance.';

-- ---------------------------------------------------------------------------
-- 2. The narrow write.
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER with an empty search_path, revoked from public and granted
-- to `authenticated`, with the manager check INSIDE the body -- the UI gate is
-- convenience and this is the boundary.
--
-- A brand-new name, so there is no old arity to drop and the signature trap
-- does not apply: there is nothing for `create or replace` to leave behind as
-- a second overload. The test asserts pg_proc holds exactly one row for it
-- anyway, so that stays true if it ever gains a parameter.
--
-- It RAISES rather than returning a structured refusal, matching every other
-- check-in RPC (0098, 0120): these are setup preconditions -- signed out, gone,
-- not yours, unreadable -- not outcomes somebody reaches in the course of
-- ordinary work. Every message is written to be shown to the person who hit it,
-- in their terms rather than in ours.

create or replace function public.notebook_set_session_guidance(
	p_session_id uuid,
	p_guidance_doc jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_doc jsonb;
	v_length integer;
	v_updated integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_session_id is null or not exists (
		select 1 from public.notebook_sessions ss where ss.id = p_session_id
	) then
		raise exception 'That check-in does not exist.';
	end if;
	if not public._notebook_manages_session(p_session_id) then
		raise exception 'Only the teacher of record for every class this check-in runs in can write its guidance.';
	end if;

	-- SQL null, JSON null and an empty document are ONE state: no prompt.
	v_doc := case
		when p_guidance_doc is null then null
		when p_guidance_doc = 'null'::jsonb then null
		when p_guidance_doc = '[]'::jsonb then null
		else p_guidance_doc
	end;

	-- The gate. A document outside the closed shape is REFUSED outright rather
	-- than stripped, so a caller arriving straight through PostgREST cannot
	-- store markup, an unknown block, a run that is not text, or an unsafe
	-- href. `_classroom_doc_ok(null)` is true, so a clear passes it.
	if not public._classroom_doc_ok(v_doc) then
		raise exception 'That guidance could not be read.';
	end if;

	-- `_classroom_doc_text(null)` is '', so this is 0 for a clear.
	v_length := char_length(coalesce(public._classroom_doc_text(v_doc), ''));
	if v_length > 20000 then
		raise exception 'The guidance is limited to 20000 characters.';
	end if;

	update public.notebook_sessions
	set guidance_doc = v_doc
	where id = p_session_id;
	get diagnostics v_updated = row_count;

	return jsonb_build_object(
		'session_id', p_session_id,
		'cleared', v_doc is null,
		'length', v_length,
		'updated', v_updated
	);
end;
$$;

revoke all on function public.notebook_set_session_guidance(uuid, jsonb) from public;
grant execute on function public.notebook_set_session_guidance(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. What this file did.
-- ---------------------------------------------------------------------------

do $$
declare
	v_sessions integer;
	v_with integer;
begin
	select count(*), count(*) filter (where guidance_doc is not null)
		into v_sessions, v_with
	from public.notebook_sessions;
	raise notice '0123: % check-in(s), % carrying a guidance prompt (0 is expected on first apply).',
		v_sessions, v_with;
end;
$$;

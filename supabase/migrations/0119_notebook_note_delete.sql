-- 0119_notebook_note_delete.sql
--
-- A NOTE BECOMES REMOVABLE, AND AN ENTRY GAINS A HISTORY. Data layer only: one
-- nullable column pair, four RPCs, one refusal added to an existing RPC, and
-- the exclusion filters that keep a removed note out of every count, guard,
-- payload and read. The controls that call them are a separate change and are
-- deliberately not here.
--
-- WHAT THIS CLOSES. 0116 shipped entry and photo deletion; what had been asked
-- for was NOTE deletion, and it went in wrong. Since 0078 a student can add a
-- note and edit a note, and there has never been any way to take one back --
-- an "Edited" marker on a note whose whole point was that it should not be
-- there is not a correction. So this is the same shape as 0116/0117, applied
-- to the one row type they missed.
--
--   notebook_entry_notes  deleted_at / deleted_by
--
-- A LOGICAL NOTE IS A CHAIN, AND DELETION MARKS THE WHOLE CHAIN. A note is not
-- a row: it is every row sharing `note_id`, and which one counts is a `max()`
-- over the chain (0078). So `update ... where note_id = $1` -- not `where id =
-- $1` -- is the load-bearing line in both write RPCs below. Marking only the
-- head would leave revision N-1 as the new `max()`, and a read filtering
-- `deleted_at is null` would answer with the note as it read BEFORE the last
-- edit. That is worse than not deleting it at all: the student presses Remove
-- and an older draft of the same note takes its place, silently.
--
-- WHAT "SOFT" COSTS, AGAIN, AND IT IS THE SAME BILL 0116 PAID. The RLS policy
-- on `notebook_entry_notes` is UNCHANGED -- "notebook notes follow entry
-- visibility" (0078) still delegates to `notebook_can_read_entry` -- so a
-- marked row is still returned by a plain select and EVERY read has to say so
-- itself. That is section 4, and it is the bulk of this file.
--
-- THE HISTORY READ ADDS NO TABLE, AND THAT IS A DECISION, not an omission.
-- Everything a per-entry timeline needs is already stored as a timestamp:
-- `upload_timestamp` / `submitted_at` / `reviewed_at` / `deleted_at` on the
-- entry, `created_at` / `removed_at` on a photo, `created_at` / `revision` /
-- `deleted_at` on a note. An event-log table would be a SECOND record of the
-- same facts, free to disagree with them -- the derived-never-stored rule this
-- schema keeps everywhere else. So the timeline is assembled client-side from
-- rows that already exist ($lib/notebook-history), exactly the way noteThreads
-- already derives a note from its revisions.
--
-- WHAT THE TIMELINE CANNOT SHOW, SAID OUT LOUD. A title change writes no
-- timestamp -- `notebook_set_entry_label` overwrites `custom_label` in place --
-- so a rename is INVISIBLE to the history. Nothing here adds a column for it.
-- An entry moving folders and an entry being pinned are the same: state, not
-- events. The history is honest about the four things it can see and silent
-- about the rest, which is better than a column added in passing to a
-- migration that was not about renames.
--
-- Apply manually in the Supabase SQL editor, after 0118.

-- ---------------------------------------------------------------------------
-- 1. The columns.
--
-- `add column if not exists` skips the whole clause -- the reference included --
-- so a re-paste of this file is a no-op rather than a duplicate-object error.
--
-- `on delete set null` on the actor, the rule every other actor column in this
-- subsystem has carried since 0069: a departed account must not take the record
-- of what it did with it. Section 2's restore depends on reading it, and reads
-- a null correctly as "not you".
-- ---------------------------------------------------------------------------

alter table public.notebook_entry_notes
	add column if not exists deleted_at timestamptz;
alter table public.notebook_entry_notes
	add column if not exists deleted_by uuid references auth.users (id) on delete set null;

-- A partial index over the LIVE rows, which is what every read below asks for,
-- mirroring 0116's own two. Deliberately keyed the same way as 0078's
-- `notebook_entry_notes_entry_idx`, because the query shape does not change --
-- only the rows worth carrying in it do.
create index if not exists notebook_entry_notes_live_idx
	on public.notebook_entry_notes (entry_id, created_at)
	where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 2. The four write RPCs.
--
-- Every one on the 0116/0117 shape exactly: SECURITY DEFINER, `set search_path
-- = ''`, revoked from public and granted to authenticated, returning jsonb. NO
-- new table grant and NO new policy -- there is still no DELETE grant on any
-- notebook table and no direct client write path to `deleted_at` /
-- `deleted_by`, restore included.
--
-- `p_note_id` IS THE LOGICAL NOTE (`note_id`), NOT A ROW ID, in all four --
-- the same parameter `notebook_edit_note` has taken since 0078. A caller
-- holding a revision's own `id` is holding one link of a chain; the chain is
-- the thing that gets deleted, so the chain is what the signature names.
-- ---------------------------------------------------------------------------

-- A student removes their own note.
--
-- OWNERSHIP IS THROUGH THE PARENT ENTRY, not through `author_id`. Every note on
-- an entry was written by that entry's student (both write RPCs stamp
-- `author_id` from `auth.uid()` and neither takes an identity parameter), so
-- the two are the same set today -- and resolving through the entry is what
-- keeps them the same set if that ever stops being true. It is also the shape
-- notebook_remove_photo already uses for exactly this question.
--
-- THE SHELL GUARD IS notebook_remove_photo's, WORD FOR WORD, from the other
-- side: an entry that is turned in must not be left with no live photo and no
-- live note, because a submitted entry with nothing in it is a row an
-- instructor has to chase and a student cannot explain. A DRAFT MAY BE EMPTIED
-- -- 0118's whole point is that a draft is unfinished work in progress, and
-- emptying one is a thing people do on the way to filling it back up.
create or replace function public.notebook_delete_note(p_note_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_latest public.notebook_entry_notes%rowtype;
	v_entry public.notebook_entries%rowtype;
	v_photos bigint;
	v_notes bigint;
	v_deleted_at timestamptz;
	v_revisions bigint;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_note_id is null then
		raise exception 'Which note?';
	end if;

	-- The chain's head, which is the row that carries the note's current state.
	select n.* into v_latest
	from public.notebook_entry_notes n
	where n.note_id = p_note_id
	order by n.revision desc
	limit 1
	for update;
	if not found then
		raise exception 'That note does not exist or is not yours.';
	end if;

	-- Locks the ENTRY too, exactly as notebook_remove_photo does and for the
	-- same reason: two concurrent removals must not each see the other's
	-- content as "remaining" and empty a submitted entry between them.
	select e.* into v_entry
	from public.notebook_entries e
	where e.id = v_latest.entry_id
	for update;

	-- Ownership first, so somebody else's note answers the same way a note that
	-- does not exist would rather than reporting anything about itself.
	if v_entry.student_id is distinct from v_uid then
		raise exception 'That note does not exist or is not yours.';
	end if;
	if v_latest.deleted_at is not null then
		raise exception 'That note has already been deleted.';
	end if;

	select count(*) into v_photos
	from public.notebook_entry_photos p
	where p.entry_id = v_entry.id and p.removed_at is null;

	-- EXCLUDING THIS NOTE, by note_id: the question is what the entry still
	-- holds once this whole chain is gone, and a chain excluded by its head's
	-- id alone would leave its own older revisions counted as content.
	select count(*) into v_notes
	from public.notebook_entry_notes n
	where n.entry_id = v_entry.id
		and n.deleted_at is null
		and n.note_id <> p_note_id;

	if v_photos = 0 and v_notes = 0 and v_entry.submitted_at is not null then
		raise exception 'That is the only thing in this entry. Delete the whole entry instead.';
	end if;

	-- EVERY REVISION IN THE CHAIN. See the file header: marking only the head
	-- would promote revision N-1 to `max()` and put an older draft of the same
	-- note on screen in place of the one that was removed.
	update public.notebook_entry_notes n
	set deleted_at = now(), deleted_by = v_uid
	where n.note_id = p_note_id;
	get diagnostics v_revisions = row_count;

	select n.deleted_at into v_deleted_at
	from public.notebook_entry_notes n
	where n.id = v_latest.id;

	return jsonb_build_object(
		'ok', true,
		'note_id', p_note_id,
		'entry_id', v_entry.id,
		'revisions', v_revisions,
		'deleted_at', v_deleted_at
	);
end;
$$;

revoke all on function public.notebook_delete_note(uuid) from public;
grant execute on function public.notebook_delete_note(uuid) to authenticated;

-- A student puts their own note back.
--
-- REFUSAL ORDER, AND EVERY STEP OF IT IS A DECISION:
--
--   not found / not yours -> not deleted -> staff-deleted -> entry deleted
--
-- `not deleted` BEFORE `staff-deleted`, which is 0117's own lesson: a live note
-- has `deleted_by` null, and judging that against "is it you" first would
-- report a confusing "your instructor removed that" for a note nobody removed.
--
-- `staff-deleted` BEFORE `entry deleted`, which is the 0116 lesson pointed the
-- other way. Both can be true at once, and the staff refusal is TERMINAL while
-- the entry one is ACTIONABLE -- telling a student to go restore the entry
-- first, only to refuse them again at the end of it, sends them on an errand
-- with nothing at the end of it.
--
-- `is distinct from`, not `<>`: a departed actor's account nulls `deleted_by`
-- (section 1's `on delete set null`), and a null actor can never resolve as
-- "you", so it falls into the refusal rather than being treated as a
-- NULL-propagated non-match that silently allows it.
create or replace function public.notebook_restore_note(p_note_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_latest public.notebook_entry_notes%rowtype;
	v_entry public.notebook_entries%rowtype;
	v_revisions bigint;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_note_id is null then
		raise exception 'Which note?';
	end if;

	select n.* into v_latest
	from public.notebook_entry_notes n
	where n.note_id = p_note_id
	order by n.revision desc
	limit 1
	for update;
	if not found then
		raise exception 'That note does not exist or is not yours.';
	end if;

	select e.* into v_entry
	from public.notebook_entries e
	where e.id = v_latest.entry_id
	for update;

	if v_entry.student_id is distinct from v_uid then
		raise exception 'That note does not exist or is not yours.';
	end if;
	if v_latest.deleted_at is null then
		raise exception 'That note has not been deleted.';
	end if;
	if v_latest.deleted_by is distinct from v_uid then
		raise exception 'Your instructor removed that note, so you cannot restore it yourself. Ask them to restore it for you.';
	end if;
	if v_entry.deleted_at is not null then
		raise exception 'This entry has been deleted, so its notes cannot be restored on their own. Restore the entry first.';
	end if;

	update public.notebook_entry_notes n
	set deleted_at = null, deleted_by = null
	where n.note_id = p_note_id;
	get diagnostics v_revisions = row_count;

	return jsonb_build_object(
		'ok', true,
		'note_id', p_note_id,
		'entry_id', v_entry.id,
		'revisions', v_revisions
	);
end;
$$;

revoke all on function public.notebook_restore_note(uuid) from public;
grant execute on function public.notebook_restore_note(uuid) to authenticated;

-- An instructor removes a student's note.
--
-- GATED LIKE notebook_staff_delete_entry AFTER 0117 --
-- `classroom_manages_section(section_id) or notebook_manages_student(student_id)`
-- -- which is the READ predicate, so the ability to remove a note is never
-- narrower than the ability to see it. The free-form case is the one that
-- matters: `classroom_manages_section(null)` is `is_admin()` (0067), so on an
-- entry with no section only the chair tier would qualify without the second
-- branch, even though 0106 widened the read so that a student's own instructor
-- reaches it.
--
-- NOT-FOUND, NOT-MANAGED AND DRAFT ALL SHARE ONE MESSAGE (0102's claim
-- convention, and 0118's reason for folding the draft into it): naming a draft
-- here would confirm to a manager that a student is holding unturned-in work,
-- which is precisely what a draft is private about. To staff it is not an
-- entry, so it answers as one that is not there.
--
-- NO SHELL GUARD, AND THAT IS DELIBERATE RATHER THAN OVERLOOKED. The student's
-- path above refuses to leave a submitted entry empty; this one does not, so
-- an instructor CAN leave a turned-in entry with nothing in it. Three reasons:
-- they can already remove the entry outright (notebook_staff_delete_entry), so
-- the guard would protect nothing they could not route around; the act is
-- logged and reversible, unlike the student's; and refusing an instructor
-- because of what a student's entry would look like afterwards makes a
-- moderation tool argue with the person moderating. Worth knowing about when
-- reading the grid: an empty submitted entry is a state staff can produce, and
-- the log row says who.
create or replace function public.notebook_staff_delete_note(p_note_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_latest public.notebook_entry_notes%rowtype;
	v_entry public.notebook_entries%rowtype;
	v_found boolean;
	v_deleted_at timestamptz;
	v_revisions bigint;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_note_id is null then
		raise exception 'Which note?';
	end if;

	select n.* into v_latest
	from public.notebook_entry_notes n
	where n.note_id = p_note_id
	order by n.revision desc
	limit 1
	for update;
	v_found := found;

	if v_found then
		select e.* into v_entry
		from public.notebook_entries e
		where e.id = v_latest.entry_id
		for update;
	end if;

	-- Authorization BEFORE state, and the three failures share one message.
	if not v_found
		or v_entry.submitted_at is null
		or not (
			public.classroom_manages_section(v_entry.section_id)
			or public.notebook_manages_student(v_entry.student_id)
		)
	then
		raise exception 'That note does not exist, or is not one you manage.';
	end if;

	if v_latest.deleted_at is not null then
		raise exception 'That note has already been deleted.';
	end if;

	update public.notebook_entry_notes n
	set deleted_at = now(), deleted_by = v_uid
	where n.note_id = p_note_id;
	get diagnostics v_revisions = row_count;

	select n.deleted_at into v_deleted_at
	from public.notebook_entry_notes n
	where n.id = v_latest.id;

	-- The audit row, which is why this is a separate function rather than a
	-- branch of the student's own path: a student tidying their own notebook is
	-- not an event anyone reviews, and staff removing somebody else's writing
	-- is. `revisions` is in the details because it is the one number that says
	-- how much of a record went with it.
	perform public._notebook_log(
		'delete_note',
		v_entry.section_id,
		v_entry.session_id,
		v_entry.id,
		v_entry.student_id,
		jsonb_build_object(
			'note_id', p_note_id,
			'revisions', v_revisions,
			'status', v_entry.status,
			'reviewed_at', v_entry.reviewed_at
		)
	);

	return jsonb_build_object(
		'ok', true,
		'note_id', p_note_id,
		'entry_id', v_entry.id,
		'student_id', v_entry.student_id,
		'revisions', v_revisions,
		'deleted_at', v_deleted_at
	);
end;
$$;

revoke all on function public.notebook_staff_delete_note(uuid) from public;
grant execute on function public.notebook_staff_delete_note(uuid) to authenticated;

-- An instructor puts a student's note back.
--
-- THE SAME GATE AS THE DELETE ABOVE, never a narrower one -- 0117's rule:
-- reversing something is never harder than doing it. Logged the same way, for
-- the same reason: "who put this back, and when" is exactly the question the
-- log exists to answer.
--
-- IT RESTORES A NOTE THE STUDENT DELETED, TOO, and that is the point of it
-- existing rather than only the mirror of the line above. `notebook_restore_note`
-- refuses a staff-deleted note and tells the student to ask their instructor;
-- this is the function that answer refers to, and it would be a dead end if it
-- could only undo staff's own removals.
create or replace function public.notebook_staff_restore_note(p_note_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_latest public.notebook_entry_notes%rowtype;
	v_entry public.notebook_entries%rowtype;
	v_found boolean;
	v_revisions bigint;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_note_id is null then
		raise exception 'Which note?';
	end if;

	select n.* into v_latest
	from public.notebook_entry_notes n
	where n.note_id = p_note_id
	order by n.revision desc
	limit 1
	for update;
	v_found := found;

	if v_found then
		select e.* into v_entry
		from public.notebook_entries e
		where e.id = v_latest.entry_id
		for update;
	end if;

	if not v_found
		or v_entry.submitted_at is null
		or not (
			public.classroom_manages_section(v_entry.section_id)
			or public.notebook_manages_student(v_entry.student_id)
		)
	then
		raise exception 'That note does not exist, or is not one you manage.';
	end if;

	if v_latest.deleted_at is null then
		raise exception 'That note has not been deleted.';
	end if;
	-- The same refusal the student's path carries, and it is not redundant: a
	-- note restored onto a deleted entry is live content on a row nobody's feed
	-- shows, which is a state no surface can explain.
	if v_entry.deleted_at is not null then
		raise exception 'This entry has been deleted, so its notes cannot be restored on their own. Restore the entry first.';
	end if;

	update public.notebook_entry_notes n
	set deleted_at = null, deleted_by = null
	where n.note_id = p_note_id;
	get diagnostics v_revisions = row_count;

	perform public._notebook_log(
		'restore_note',
		v_entry.section_id,
		v_entry.session_id,
		v_entry.id,
		v_entry.student_id,
		jsonb_build_object(
			'note_id', p_note_id,
			'revisions', v_revisions,
			'deleted_at', v_latest.deleted_at,
			'deleted_by', v_latest.deleted_by
		)
	);

	return jsonb_build_object(
		'ok', true,
		'note_id', p_note_id,
		'entry_id', v_entry.id,
		'student_id', v_entry.student_id,
		'revisions', v_revisions
	);
end;
$$;

revoke all on function public.notebook_staff_restore_note(uuid) from public;
grant execute on function public.notebook_staff_restore_note(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. A deleted note cannot be edited.
--
-- 0116's definition with ONE refusal added and nothing else changed (the body
-- was extracted from 0116 and diffed, not retyped). Without it, editing a
-- deleted note INSERTS a new revision -- and that revision would carry
-- `deleted_at` null from the column default while every older revision in its
-- chain stays marked, which is the one state the whole-chain rule in section 2
-- exists to make unreachable: a note that is half deleted, whose head is live
-- and whose history is not.
--
-- IT REFUSES RATHER THAN QUIETLY RESTORING. Restoring is a separate act with
-- its own RPC and its own refusals -- notably the staff-deleted one, which an
-- edit-that-restores would route straight around.
-- ---------------------------------------------------------------------------

create or replace function public.notebook_edit_note(
	p_note_id uuid,
	p_content jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_latest public.notebook_entry_notes%rowtype;
	v_student uuid;
	v_new_id uuid := gen_random_uuid();
	v_created timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public._notebook_note_content_ok(p_content) then
		raise exception 'That note could not be saved: its content is not a valid note.';
	end if;

	select n.* into v_latest
	from public.notebook_entry_notes n
	where n.note_id = p_note_id
	order by n.revision desc
	limit 1
	for update;
	if not found then
		raise exception 'That note does not exist.';
	end if;

	select e.student_id into v_student
	from public.notebook_entries e
	where e.id = v_latest.entry_id
	for update;

	-- Ownership first, so someone else's note answers the same way a note that
	-- does not exist would rather than reporting anything about it.
	if v_student is distinct from v_uid then
		raise exception 'That note is not yours.';
	end if;

	-- AFTER the ownership check, never before it: the state of somebody else's
	-- note is not something this function reports on.
	if v_latest.deleted_at is not null then
		raise exception 'That note has been deleted. Restore it before editing it.';
	end if;

	insert into public.notebook_entry_notes
		(id, entry_id, note_id, revision, supersedes_id, content, author_id)
	values (v_new_id, v_latest.entry_id, p_note_id, v_latest.revision + 1, v_latest.id, p_content, v_uid)
	returning created_at into v_created;

	return jsonb_build_object(
		'entry_id', v_latest.entry_id,
		'note_id', p_note_id,
		'revision', v_latest.revision + 1,
		'created_at', v_created
	);
end;
$$;

revoke all on function public.notebook_edit_note(uuid, jsonb) from public;
grant execute on function public.notebook_edit_note(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. THE EXCLUSION SWEEP.
--
-- The RLS policy is unchanged, so a marked row is still SELECTable -- which
-- makes this section, not section 2, the part that decides whether removing a
-- note is visible anywhere.
--
-- THE LIST WAS BUILT BY ENUMERATION, NOT FROM MEMORY. Every live function and
-- view in the schema whose body names `notebook_entry_notes` was walked -- 11
-- of them, resolved to the migration that most recently defined each -- and
-- every one is either below or is recorded at the end of this section with the
-- reason it was left alone. The client-side half of the same sweep lives with
-- the select strings it belongs to ($lib/notebook-selects, $lib/notebook-notes).
--
-- EVERY BODY BELOW WAS EXTRACTED FROM ITS CURRENT DEFINITION AND DIFFED, not
-- reconstructed: the CLAUDE.md rule that a plausible reconstruction from memory
-- is how error semantics quietly change. The diff of each is one clause.
--
-- FOUR OF THE FIVE ARE COUNTS THAT GATE A REFUSAL, not lists that render. That
-- is the failure mode particular to this migration and it is worth naming: a
-- deleted note left in `v_notes` does not show a student anything wrong -- it
-- silently OPENS a guard. The entry keeps its last photo removable and stays
-- turn-in-able on the strength of content that is no longer there.
-- ---------------------------------------------------------------------------

-- 4a. The activity view (0116's definition). A deleted note must not be what
-- makes an entry look recently worked on -- the identical rule its photo
-- sub-select already carries for a removed photo, and for the identical
-- reason: `last_activity_at` means "when this entry was last worked on", and
-- content that is no longer part of the entry cannot be the answer.
--
-- Still security_invoker, so it adds no reach.

drop view if exists public.notebook_entry_activity;
create view public.notebook_entry_activity
with (security_invoker = true) as
select
	e.id,
	e.student_id,
	greatest(
		e.upload_timestamp,
		(select max(n.created_at)
			from public.notebook_entry_notes n
			where n.entry_id = e.id and n.deleted_at is null),
		(select max(p.created_at)
			from public.notebook_entry_photos p
			where p.entry_id = e.id and p.removed_at is null)
	) as last_activity_at
from public.notebook_entries e
where e.deleted_at is null;

grant select on public.notebook_entry_activity to authenticated;

-- 4b. The turn-in guard (0118's definition). THE COUNT DECIDES WHETHER AN
-- ENTRY HAS ANYTHING IN IT TO TURN IN, so a deleted note counted here lets a
-- student submit an entry that is genuinely empty -- and the instructor gets a
-- present cell on the grid with nothing behind it.

create or replace function public.notebook_submit_entry(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_entry public.notebook_entries%rowtype;
	v_photos bigint;
	v_notes bigint;
	v_submitted_at timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_entry_id is null then
		raise exception 'Which entry?';
	end if;

	select e.* into v_entry
	from public.notebook_entries e
	where e.id = p_entry_id and e.student_id = v_uid
	for update;
	if not found then
		raise exception 'That entry does not exist or is not yours.';
	end if;

	if v_entry.submitted_at is not null then
		raise exception 'That entry has already been turned in.';
	end if;

	select count(*) into v_photos
	from public.notebook_entry_photos p
	where p.entry_id = p_entry_id and p.removed_at is null;

	select count(*) into v_notes
	from public.notebook_entry_notes n
	where n.entry_id = p_entry_id and n.deleted_at is null;

	if v_photos = 0 and v_notes = 0 then
		raise exception 'This entry has nothing in it to turn in. Add a photo or write a note first.';
	end if;

	update public.notebook_entries e
	set submitted_at = now()
	where e.id = p_entry_id
	returning e.submitted_at into v_submitted_at;

	return jsonb_build_object(
		'ok', true,
		'entry_id', p_entry_id,
		'submitted_at', v_submitted_at
	);
end;
$$;

revoke all on function public.notebook_submit_entry(uuid) from public;
grant execute on function public.notebook_submit_entry(uuid) to authenticated;

-- 4c. The photo-removal shell guard (0118's definition), which is the mirror
-- of section 2's own guard and has to agree with it. If a deleted note still
-- counted here, the two guards would disagree: removing the note would refuse
-- (correctly) while removing the last photo would be allowed on the strength
-- of that same removed note, and the entry ends up empty by the other door.

create or replace function public.notebook_remove_photo(p_photo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_photo public.notebook_entry_photos%rowtype;
	v_student uuid;
	v_submitted timestamptz;
	v_remaining bigint;
	v_notes bigint;
	v_removed_at timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_photo_id is null then
		raise exception 'Which photo?';
	end if;

	select p.* into v_photo
	from public.notebook_entry_photos p
	where p.id = p_photo_id
	for update;
	if not found then
		raise exception 'That photo does not exist or is not yours.';
	end if;

	-- Locks the ENTRY too, so two concurrent removals cannot each see the other
	-- photo as "remaining" and empty the entry between them.
	select e.student_id, e.submitted_at into v_student, v_submitted
	from public.notebook_entries e
	where e.id = v_photo.entry_id
	for update;

	if v_student is distinct from v_uid then
		raise exception 'That photo does not exist or is not yours.';
	end if;
	if v_photo.removed_at is not null then
		raise exception 'That photo has already been removed.';
	end if;

	select count(*) into v_remaining
	from public.notebook_entry_photos p
	where p.entry_id = v_photo.entry_id
		and p.removed_at is null
		and p.id <> p_photo_id;

	-- ANY LIVE note revision counts. Which revision is current is derived (0078)
	-- and nothing here needs to know: the question is only whether the entry
	-- still says something once this photo is gone. A DELETED note (0119) says
	-- nothing -- counting one would let this guard pass on an entry whose only
	-- remaining content is a note the student already removed, which is the
	-- empty shell the guard exists to refuse.
	select count(*) into v_notes
	from public.notebook_entry_notes n
	where n.entry_id = v_photo.entry_id and n.deleted_at is null;

	if v_remaining = 0 and v_notes = 0 and v_submitted is not null then
		raise exception 'That is the only thing in this entry. Delete the whole entry instead.';
	end if;

	update public.notebook_entry_photos p
	set removed_at = now(), removed_by = v_uid
	where p.id = p_photo_id
	returning p.removed_at into v_removed_at;

	return jsonb_build_object(
		'ok', true,
		'photo_id', p_photo_id,
		'entry_id', v_photo.entry_id,
		'removed_at', v_removed_at
	);
end;
$$;

revoke all on function public.notebook_remove_photo(uuid) from public;
grant execute on function public.notebook_remove_photo(uuid) to authenticated;

-- 4d. Clearing a free entry's title (0116's definition). Same shell rule, same
-- reason: a title-only entry whose title goes has nothing left in it, and a
-- deleted note is not something left in it.

create or replace function public.notebook_set_entry_label(
	p_entry_id uuid,
	p_custom_label text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_entry public.notebook_entries%rowtype;
	v_label text;
	v_photos bigint;
	v_notes bigint;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_entry_id is null then
		raise exception 'Which entry?';
	end if;

	v_label := nullif(btrim(coalesce(p_custom_label, '')), '');
	if v_label is not null and char_length(v_label) > 200 then
		raise exception 'That title is too long: keep it to 200 characters or fewer.';
	end if;

	select e.* into v_entry
	from public.notebook_entries e
	where e.id = p_entry_id and e.student_id = v_uid
	for update;
	if not found then
		raise exception 'That entry does not exist or is not yours.';
	end if;

	if v_entry.deleted_at is not null then
		raise exception 'That entry has been deleted.';
	end if;
	if v_entry.session_id is not null then
		raise exception 'This entry is filed against a scheduled check-in, so its title comes from the check-in and cannot be changed here.';
	end if;

	if v_label is null then
		select count(*) into v_photos
		from public.notebook_entry_photos p
		where p.entry_id = p_entry_id and p.removed_at is null;
		select count(*) into v_notes
		from public.notebook_entry_notes n
		where n.entry_id = p_entry_id and n.deleted_at is null;

		if v_photos = 0 and v_notes = 0 then
			raise exception 'That title is the only thing in this entry. Delete the whole entry instead.';
		end if;
	end if;

	update public.notebook_entries e
	set custom_label = v_label
	where e.id = p_entry_id;

	return jsonb_build_object(
		'ok', true,
		'entry_id', p_entry_id,
		'custom_label', v_label
	);
end;
$$;

revoke all on function public.notebook_set_entry_label(uuid, text) from public;
grant execute on function public.notebook_set_entry_label(uuid, text) to authenticated;

-- 4e. One student's whole notebook, as a payload (0118's definition) -- the
-- STAFF read, feeding both notebook_review_student_notebook (an instructor
-- opening a name) and notebook_view_as_notebook (an admin's preview).
--
-- THE ONE PLACE IN THIS SECTION THAT IS A LIST RATHER THAN A COUNT, and the
-- one where the chain rule is doing visible work: the filter is on
-- `deleted_at`, the sub-select is ordered by `created_at, revision`, and
-- because deletion marks EVERY revision the whole thread disappears together.
-- Marking only the head would leave revisions 1..N-1 here for an instructor to
-- read as the note.

create or replace function public._notebook_student_payload(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_uid uuid := public._notebook_user_id_for_email(v_email);
	v_name text;
	v_sections uuid[];
	v_section_label text;
	v_entries jsonb;
	v_deleted_entries jsonb;
	v_folders jsonb;
	v_sessions jsonb;
	v_activity jsonb;
begin
	select min(e.display_name) into v_name
	from public.classroom_enrollments e
	where e.student_email = v_email and e.active;

	select coalesce(array_agg(e.section_id), '{}'::uuid[]) into v_sections
	from public.classroom_enrollments e
	where e.student_email = v_email and e.active;

	select case
			when count(*) = 0 then null
			when count(*) = 1 then min(nullif(concat_ws(' · ', c.code, s.label), ''))
			else count(*)::text || ' classes'
		end
	into v_section_label
	from public.classroom_sections s
	join public.classroom_courses c on c.id = s.course_id
	where s.id = any(v_sections);

	-- THEIR ENTRIES, ALL OF THEM -- every section and none, which is the point
	-- of 0106. It matches what the staff policy allows either caller to select
	-- directly, so this payload can never be a wider door than the ordinary
	-- read; the deleted ones are the one thing it is now narrower by.
	select coalesce(jsonb_agg(jsonb_build_object(
			'id', e.id,
			'session_id', e.session_id,
			'section_id', e.section_id,
			'folder_id', e.folder_id,
			'pinned_at', e.pinned_at,
			'custom_label', e.custom_label,
			'upload_timestamp', e.upload_timestamp,
			'status', e.status,
			'flag_reason', e.flag_reason,
			'instructor_comment', e.instructor_comment,
			'session', (
				select jsonb_build_object(
					'session_label', ss.session_label,
					'unit_number', ss.unit_number,
					'session_date', ss.session_date
				)
				from public.notebook_sessions ss where ss.id = e.session_id
			),
			'photos', coalesce((
				select jsonb_agg(jsonb_build_object(
					'id', p.id,
					'drive_file_id', p.drive_file_id,
					'variant', p.variant,
					'sequence_order', p.sequence_order,
					'original_filename', p.original_filename
				) order by p.sequence_order)
				from public.notebook_entry_photos p
				where p.entry_id = e.id and p.removed_at is null
			), '[]'::jsonb),
			-- EVERY LIVE revision: which one is current is derived client-side
			-- (noteThreads) and the feed shows the history.
			--
			-- A DELETED note (0119) is excluded HERE, in the payload, rather than
			-- left to the client: this feeds the two STAFF surfaces, and a note a
			-- student removed is not part of what they turned in. Deleting one
			-- marks every revision in the chain, so this single clause drops the
			-- whole thread and no older revision can surface as its head.
			'notes', coalesce((
				select jsonb_agg(jsonb_build_object(
					'id', n.id,
					'entry_id', n.entry_id,
					'note_id', n.note_id,
					'revision', n.revision,
					'content', n.content,
					'created_at', n.created_at
				) order by n.created_at, n.revision)
				from public.notebook_entry_notes n
				where n.entry_id = e.id and n.deleted_at is null
			), '[]'::jsonb)
		) order by e.upload_timestamp desc), '[]'::jsonb)
	into v_entries
	from public.notebook_entries e
	where e.student_id = v_uid
		and e.deleted_at is null
		and e.submitted_at is not null;

	-- THEIR DELETED ENTRIES (0117), separately -- newest-removed first, and
	-- deliberately shallow (see the migration header).
	select coalesce(jsonb_agg(jsonb_build_object(
			'id', e.id,
			'custom_label', e.custom_label,
			'session', (
				select jsonb_build_object(
					'session_label', ss.session_label,
					'unit_number', ss.unit_number,
					'session_date', ss.session_date
				)
				from public.notebook_sessions ss where ss.id = e.session_id
			),
			'upload_timestamp', e.upload_timestamp,
			'deleted_at', e.deleted_at,
			'deleted_by', e.deleted_by
		) order by e.deleted_at desc), '[]'::jsonb)
	into v_deleted_entries
	from public.notebook_entries e
	where e.student_id = v_uid
		and e.deleted_at is not null
		and e.submitted_at is not null;

	select coalesce(jsonb_agg(jsonb_build_object(
			'id', f.id, 'name', f.name, 'color', f.color, 'created_at', f.created_at
		) order by f.name), '[]'::jsonb)
	into v_folders
	from public.notebook_folders f
	where f.student_id = v_uid;

	select coalesce(jsonb_agg(jsonb_build_object(
			'id', ss.id,
			'section_id', pg.section_id,
			'unit_number', ss.unit_number,
			'session_date', ss.session_date,
			'session_label', ss.session_label
		) order by ss.session_date desc, ss.id), '[]'::jsonb)
	into v_sessions
	from public.notebook_session_postings pg
	join public.notebook_sessions ss on ss.id = pg.session_id
	where pg.section_id = any(v_sections);

	-- The view already excludes deleted entries (4a of 0116), so this needs no
	-- clause for those. IT DOES NEED ONE FOR DRAFTS, and the join is the whole
	-- reason: notebook_entry_activity is `security_invoker`, so selected by a
	-- staff member DIRECTLY it is already scoped by the policy in section 5 and
	-- a draft cannot come back. Read from inside a SECURITY DEFINER function it
	-- is not -- the invoker is this function's owner, which sees every row -- so
	-- the one place the view can leak a draft is exactly here, and it is the
	-- reason `student_id` is already filtered by hand two lines down.
	select coalesce(jsonb_agg(jsonb_build_object(
			'id', a.id, 'last_activity_at', a.last_activity_at
		)), '[]'::jsonb)
	into v_activity
	from public.notebook_entry_activity a
	join public.notebook_entries e on e.id = a.id
	where a.student_id = v_uid
		and e.submitted_at is not null;

	return jsonb_build_object(
		'student', jsonb_build_object(
			'email', v_email,
			'display_name', v_name,
			-- null = on a roster, no account yet.
			'user_id', v_uid
		),
		'section_label', v_section_label,
		'entries', v_entries,
		'deleted_entries', v_deleted_entries,
		'folders', v_folders,
		'sessions', v_sessions,
		'activity', v_activity
	);
end;
$$;

revoke all on function public._notebook_student_payload(text) from public;

-- ---------------------------------------------------------------------------
-- 4f. WHAT WAS WALKED AND DELIBERATELY LEFT ALONE. Recorded because the next
-- person with a reason to hide a note will read this list rather than redo the
-- enumeration -- and because "I checked it" is only useful written down.
--
--   notebook_get_section_grid (0118)
--     Untouched, and checked rather than assumed: it counts ENTRIES, not notes,
--     and names `notebook_entry_notes` nowhere in its body. A grid cell is
--     presence -- an entry was filed -- and an entry with a removed note is
--     still an entry that was filed. Nothing in it changes when a note goes.
--
--   notebook_view_as_notebook (0106), notebook_review_student_notebook (0106)
--     Untouched, and they MUST be: both are a guard plus
--     `return public._notebook_student_payload(v_email)` and nothing else. The
--     filter belongs in the payload (4e), once, so the two can never disagree
--     about what a student's notebook looks like -- which is the whole reason
--     0106 collapsed them onto one payload in the first place.
--
--   notebook_add_note (0078), notebook_create_note_entry (0118)
--     Untouched. Both INSERT against an entry the caller already named; neither
--     reads an existing note, so neither can put a deleted one into a list. A
--     new note on an entry whose old note was deleted is an ordinary thing to
--     write, and the new chain starts live.
--
--   _notebook_note_content_ok (0078), _notebook_note_run_len (0078)
--     Untouched. Pure jsonb shape validators -- they take a document, never a
--     row, and name the table not at all.
--
--   notebook_can_read_entry (0118), and the notes RLS policy (0078)
--     Untouched, on 0116's own doctrine and for the same three reasons it gave.
--     A deleted note stays READABLE to whoever could read it before, because a
--     restore has to be able to show what it is restoring, and because
--     visibility is a different question from listing. Every read above states
--     its own `deleted_at is null` where the reader can see it rather than
--     relying on a predicate three functions away.
--
--   notebook_delete_folder (0116), _notebook_detach_session_entries (0118),
--   _notebook_section_roster (0118)
--     Untouched, and each was opened rather than inferred from its name: none
--     names `notebook_entry_notes` at all. Folders and postings are filing;
--     notes are content.
--
--   notebook_edit_note (section 3 above)
--     The one WRITE against an existing note, which is why it is a refusal in
--     section 3 rather than a filter here. A filter would have made it answer
--     'That note does not exist', which is a different and worse thing to tell
--     somebody whose note is sitting in their own deleted list.
-- ---------------------------------------------------------------------------

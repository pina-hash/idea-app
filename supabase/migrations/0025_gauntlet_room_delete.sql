-- 0025_gauntlet_room_delete.sql
-- IDEA // GAUNTLET: teacher-only deletion of a live room they host. Follows the
-- room RPC pattern (0010): SECURITY DEFINER, host-enforced by host_id, so a
-- student can never delete a room even if they call the RPC directly (they are
-- not the host). Belt-and-braces is_teacher() check too (only teachers host, but
-- keep the guard explicit).
--
-- Cleanup, done explicitly so it does not depend on FK on-delete config:
--   * submissions.room_id -> NULL. A room run is an ordinary graded submission
--     that also lives on the global per-challenge board; deleting the room must
--     NOT erase a student's verified record, so we only un-tag it (this matches
--     the submissions.room_id `on delete set null` FK from 0010).
--   * gauntlet_run_tokens for the room -> deleted (session-only rows).
--   * gauntlet_room_participants for the room -> deleted (roster).
--   * gauntlet_rooms row -> deleted.
--
-- Apply manually in the Supabase SQL editor.

create or replace function public.gauntlet_room_delete(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_room public.gauntlet_rooms%rowtype;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	select * into v_room from public.gauntlet_rooms where id = p_room_id;
	if not found then
		raise exception 'Room not found.';
	end if;
	-- Host-only, enforced server-side (not just hidden in the UI). Only teachers
	-- can host, so this also confines deletion to teachers.
	if v_room.host_id <> v_uid or not public.is_teacher() then
		raise exception 'Only the hosting teacher can delete this room.';
	end if;

	-- Preserve graded records: un-tag their room, keep them on the global board.
	update public.submissions set room_id = null where room_id = p_room_id;
	-- Remove the room's session-only rows, then the room.
	delete from public.gauntlet_run_tokens where room_id = p_room_id;
	delete from public.gauntlet_room_participants where room_id = p_room_id;
	delete from public.gauntlet_rooms where id = p_room_id;
end;
$$;

revoke all on function public.gauntlet_room_delete(uuid) from public;
grant execute on function public.gauntlet_room_delete(uuid) to authenticated;

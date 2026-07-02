-- 0028_gauntlet_room_code_and_host_play.sql
-- IDEA // GAUNTLET rooms: a short 4-char join code, and the host races too.
--
-- Two changes to the 0010 room layer:
--
--   1. SHORT ROOM CODE. Room join codes were minted by gauntlet_gen_code(), the
--      same 8-char generator used for single-use SUBMIT codes. Submit codes are
--      security credentials and must stay long; join codes are read aloud in a
--      classroom and should be short. This adds gauntlet_gen_room_code(), a
--      4-char code over the existing unambiguous alphabet (no O/0/I/1/L), and
--      switches gauntlet_room_create to it. Submit-code generation is untouched.
--
--   2. HOST IS A COMPETITOR. The host was never enrolled as a participant, and
--      gauntlet_room_start only minted tokens for role='racer' participants, so
--      the host could only host, never race. Now gauntlet_room_create enrolls the
--      host as a racer (so they appear on the roster and their run ranks on the
--      board), and gauntlet_room_start mints a token for the host as well as the
--      racer participants (a UNION, so it is robust even for rooms created before
--      this migration). Everything else (shared clock, reveal gating, scoring)
--      is unchanged; the host's run flows through the same token path.
--
-- Apply manually in the Supabase SQL editor. Idempotent.

-- ---------------------------------------------------------------------------
-- 1. Short (4-char) room-code generator. Same unambiguous alphabet as
--    gauntlet_gen_code (no O/0/I/1/L); only the length differs.
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_gen_room_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
	v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
	v_code text := '';
	i int;
begin
	for i in 1..4 loop
		v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
	end loop;
	return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Create a room with a short code AND enroll the host as a racer, so the
--    host is a competitor (roster + board + a token on Start).
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_room_create()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_code text;
	v_id uuid;
begin
	if v_uid is null then raise exception 'You must be signed in.'; end if;
	if not public.is_teacher() then raise exception 'Only teachers can host rooms.'; end if;
	loop
		v_code := public.gauntlet_gen_room_code();
		begin
			insert into public.gauntlet_rooms (host_id, join_code) values (v_uid, v_code)
				returning id into v_id;
			exit;
		exception when unique_violation then
		end;
	end loop;
	-- The host is also a competitor: enroll them as a racer so Start mints them a
	-- token, they show on the roster, and their run ranks on the room board.
	insert into public.gauntlet_room_participants (room_id, user_id, role)
		values (v_id, v_uid, 'racer')
		on conflict (room_id, user_id) do nothing;
	return jsonb_build_object('id', v_id, 'join_code', v_code);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Start the round: mint one token per racer AND for the host. Reproduces the
--    0010 function verbatim except the racer set now unions in the host, so the
--    host races on the same shared clock. Idempotent create-or-replace.
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_room_start(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_room public.gauntlet_rooms%rowtype;
	v_start timestamptz := now();
	v_expires timestamptz;
	v_racer record;
	v_code text;
begin
	select * into v_room from public.gauntlet_rooms where id = p_room_id;
	if not found then raise exception 'Room not found.'; end if;
	if v_room.host_id <> v_uid then raise exception 'Only the host can start the round.'; end if;
	if v_room.state <> 'lobby' then raise exception 'The round has already started.'; end if;
	if v_room.current_challenge_id is null then raise exception 'Pick a challenge before starting.'; end if;
	if not exists (
		select 1 from public.challenges
		where id = v_room.current_challenge_id and mode = 'speedrun' and published
	) then
		raise exception 'The selected challenge is no longer a published Speedrun. Pick another.';
	end if;
	v_expires := v_start + interval '30 minutes';

	-- One authoritative clock for the round.
	update public.gauntlet_rooms set state = 'live', started_at = v_start where id = p_room_id;

	-- Bulk-mint one token per current racer AND the host; all share
	-- reveal_at = started_at, so every competitor is timed from the same instant.
	-- The union dedupes when the host is already enrolled as a racer.
	for v_racer in
		select user_id from public.gauntlet_room_participants
		where room_id = p_room_id and role = 'racer'
		union
		select v_room.host_id
	loop
		loop
			v_code := public.gauntlet_gen_code();
			begin
				insert into public.gauntlet_run_tokens (code, user_id, challenge_id, reveal_at, expires_at, room_id)
					values (v_code, v_racer.user_id, v_room.current_challenge_id, v_start, v_expires, p_room_id);
				exit;
			exception when unique_violation then
			end;
		end loop;
	end loop;

	return jsonb_build_object('id', p_room_id, 'state', 'live', 'started_at', v_start);
end;
$$;

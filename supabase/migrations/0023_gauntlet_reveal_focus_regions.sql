-- 0023_gauntlet_reveal_focus_regions.sql
-- IDEA // GAUNTLET: hand the Speedrun drawing viewer its author-defined focus
-- regions on Start, gated exactly like the dimensioned drawing itself.
--
-- Feature 1 (drawing viewer upgrade) lets a student jump to author-defined focus
-- regions on a single-image drawing. Those regions are normalized rectangles
-- (label + x/y/w/h fractions) that describe positions ON the hidden dimensioned
-- drawing, so they live in the gated `answer` (answer.focus_regions, a JSONB
-- array) and are handed back only by the reveal RPC, the same reveal-on-start
-- discipline the drawing and drawing_image_path follow. Nothing about the
-- dimensioned drawing leaks into the public page load.
--
-- This is a pure additive change to gauntlet_speedrun_reveal (last defined in
-- 0015): one more field in the returned JSON. All other behavior, the single-use
-- ~30-minute token, the server-stamped reveal_at, the teacher/published gate, is
-- byte-for-byte the same. Re-running is safe (create or replace).
--
-- Apply manually in the Supabase SQL editor. Idempotent.

create or replace function public.gauntlet_speedrun_reveal(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_mode public.gauntlet_mode;
	v_published boolean;
	v_drawing text;
	v_drawing_path text;
	v_focus jsonb;
	v_asset text;
	v_code text;
	v_reveal_at timestamptz := now();
	v_expires timestamptz := now() + interval '30 minutes';
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select c.mode, c.published, c.answer ->> 'drawing', c.answer ->> 'drawing_image_path',
			c.answer -> 'focus_regions', c.asset_ref
		into v_mode, v_published, v_drawing, v_drawing_path, v_focus, v_asset
		from public.challenges c
		where c.id = p_challenge_id;

	if not found then
		raise exception 'Challenge not found.';
	end if;
	if v_mode <> 'speedrun' then
		raise exception 'Not a Speedrun challenge.';
	end if;
	if not v_published and not public.is_teacher() then
		raise exception 'Challenge is not available.';
	end if;

	-- Only the latest reveal for this user+challenge stays live: retire any prior
	-- unused codes so a stale code cannot be held in reserve.
	update public.gauntlet_run_tokens
		set used_at = v_reveal_at
		where user_id = v_uid and challenge_id = p_challenge_id and used_at is null;

	-- Mint a unique code; retry on the rare PK collision.
	loop
		v_code := public.gauntlet_gen_code();
		begin
			insert into public.gauntlet_run_tokens (code, user_id, challenge_id, reveal_at, expires_at)
			values (v_code, v_uid, p_challenge_id, v_reveal_at, v_expires);
			exit;
		exception when unique_violation then
			-- collision, regenerate
		end;
	end loop;

	return jsonb_build_object(
		'drawing', v_drawing,
		'drawing_image_path', v_drawing_path,
		'focus_regions', v_focus,
		'asset_ref', v_asset,
		'code', v_code,
		'reveal_at', v_reveal_at,
		'expires_at', v_expires
	);
end;
$$;

revoke all on function public.gauntlet_speedrun_reveal(uuid) from public;
grant execute on function public.gauntlet_speedrun_reveal(uuid) to authenticated;

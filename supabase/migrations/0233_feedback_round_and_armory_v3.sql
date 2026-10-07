-- ===== PART student-overview BEGIN =====
-- ---------------------------------------------------------------------------
-- PART 40. ONE STUDENT IN ONE CLASS, FOR A MANAGER OF THAT CLASS
-- (reports 792eb6b1 and 63fb1c49, Mr. Pina, 2026-10-03 and 2026-10-07: "a per
-- student page with all their work and stats", "for parent teacher
-- conferences to show the student's activity in the class").
--
-- WHAT THIS IS. classroom_student_overview(p_section_id, p_student_email) is
-- the ONE new read behind the per-student page at
-- /classroom/<section>/people/<email>. Everything else that page shows comes
-- from reads a manager can already make under RLS (submissions, presence rows,
-- the notebook grid, the team board, IdeaCAD documents), each with an
-- attribution filter on the one student. This function answers the four
-- things a manager could NOT read before: the student's whole hall pass
-- history in this class, which of this class's items they opened, their song
-- request counts in this class, and their IDEA Coin balance and history.
--
-- THE GATE IS classroom_manages_section (the 0138 wrapper, which folds
-- is_admin in), asked first and inside the definer. EVERY REFUSAL IS NULL AND
-- THEY ARE IDENTICAL: no session, a null argument, a section the caller does
-- not manage, an address with no enrollment row in this section, and an
-- address that can itself MANAGE the section (0138: a person who manages a
-- section is never a student row in it). So an address cannot be probed: a
-- classmate who does not exist and a teacher's own address answer the same.
-- An INACTIVE enrollment (a student who left) is answered, because the work
-- they did in this class is still theirs and the page labels them as not on
-- the live roster.
--
-- SCOPE. Hall passes, song requests and item views are THIS SECTION's only:
-- passes and songs by their own section_id, item views through
-- classroom_postings, so an item the student opened in another class never
-- appears. COINS ARE SCHOOL-WIDE, because the coin economy is, and they are
-- projected exactly as the public IDEA Coin Ledger already projects them to
-- anyone (0096 coin_public_student: when, amount, medium, category name, the
-- newest 500), plus only the ids the one history renderer needs to collapse a
-- transfer (id, category_id, category_kind, transfer_id). NEVER the note and
-- NEVER actor_email: those are the two coin columns that are not public.
--
-- IT REVERSES ONE SENTENCE, ON MR. PINA'S REQUEST. 0085 wrote of
-- classroom_item_views: "which items a student has opened is about the
-- student, not about the class, and no surface in this module shows it to
-- anyone else". Mr. Pina asked for "any telemetry collected from them", so the
-- student's own teacher now sees the LAST-opened time per item of this class.
-- NO POLICY IS ADDED TO THE TABLE: this definer read is the only door, and it
-- answers only for the section's manager. Recorded as a decision of the
-- 2026-10-07 round.
--
-- IT ADDS NOTHING TO PRESENCE AND GRADES NOTHING. presence_limits carries
-- 0200's windows built by the SAME five helpers classroom_presence_state uses
-- (a test pins the two objects equal), so the page's coverage sentence names
-- this deployment's retention. The presence table itself is read by the page
-- under its own RLS, unchanged (0200: do not make the presence table read
-- work, and presence is never a grade input).
--
-- THE HALL PASS ROWS ARE THE MANAGER HISTORY'S OWN SHAPE (0174: pass_id,
-- student_email, student_name, opened_at, closed_at, closed_by, opened_by),
-- so the existing renderers read them verbatim. The newest 500 with a total
-- beside them, and no flag at any duration: a long pass is a conversation, not
-- a number this decides is too big.
--
-- ADDITIVE: no table, no column, no policy, no table grant, no DML. A client
-- deployed first degrades on PGRST202 alone, so there is no deploy ordering.
--
-- UNDO:
--   drop function if exists public.classroom_student_overview(uuid, text);
-- Nothing else references it.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_student_overview(
	p_section_id uuid,
	p_student_email text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $so$
declare
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_enr public.classroom_enrollments%rowtype;
	v_uid uuid;
	v_pass_total integer;
	v_passes jsonb;
	v_views jsonb;
	v_songs jsonb;
	v_coin_total integer;
	v_coin_rows jsonb;
begin
	if coalesce(public.current_user_email(), '') = '' or p_section_id is null or v_email = '' then
		return null;
	end if;
	if not public.classroom_manages_section(p_section_id) then
		return null;
	end if;

	select e.* into v_enr
	from public.classroom_enrollments e
	where e.section_id = p_section_id and e.student_email = v_email;
	if not found then
		return null;
	end if;

	-- A person who manages the section is never a student row in it (0138),
	-- whatever their enrollment says. Same NULL as every other refusal.
	if public._classroom_manages_section_email(p_section_id, v_email) then
		return null;
	end if;

	v_uid := public._notebook_user_id_for_email(v_email);

	select count(*)::integer into v_pass_total
	from public.classroom_hall_passes h
	where h.section_id = p_section_id and h.student_email = v_email;

	select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.opened_at desc), '[]'::jsonb)
	into v_passes
	from (
		select h.id as pass_id, h.student_email, v_enr.display_name as student_name,
			h.opened_at, h.closed_at, h.closed_by, h.opened_by
		from public.classroom_hall_passes h
		where h.section_id = p_section_id and h.student_email = v_email
		order by h.opened_at desc
		limit 500
	) x;

	select coalesce(jsonb_agg(jsonb_build_object('item_id', v.item_id, 'viewed_at', v.viewed_at)
		order by v.viewed_at desc), '[]'::jsonb)
	into v_views
	from public.classroom_item_views v
	where v.student_email = v_email
		and exists (
			select 1 from public.classroom_postings pg
			where pg.item_id = v.item_id and pg.section_id = p_section_id
		);

	select jsonb_build_object(
		'requested', count(*),
		'approved', count(*) filter (where public._classroom_song_status(r.decided_at, r.rejection_reason) = 'approved'),
		'rejected', count(*) filter (where public._classroom_song_status(r.decided_at, r.rejection_reason) = 'rejected'),
		'pending', count(*) filter (where public._classroom_song_status(r.decided_at, r.rejection_reason) = 'pending'))
	into v_songs
	from public.classroom_song_requests r
	where r.section_id = p_section_id and r.student_email = v_email;

	select count(*)::integer into v_coin_total
	from public.coin_transactions t
	where t.student_email = v_email;

	select coalesce(jsonb_agg(row_to_json(c)::jsonb order by c.created_at desc, c.id desc), '[]'::jsonb)
	into v_coin_rows
	from (
		select t.id, t.category_id, cat.name as category_name, cat.kind as category_kind,
			t.amount, t.medium, t.transfer_id, t.created_at
		from public.coin_transactions t
		join public.coin_categories cat on cat.id = t.category_id
		where t.student_email = v_email
		order by t.created_at desc, t.id desc
		limit 500
	) c;

	return jsonb_build_object(
		'section_id', p_section_id,
		'student_email', v_email,
		'display_name', v_enr.display_name,
		'active', v_enr.active,
		'enrolled_at', v_enr.created_at,
		'has_account', v_uid is not null,
		'user_id', v_uid,
		'at', now(),
		'hall_passes', jsonb_build_object(
			'total', v_pass_total,
			'entries', v_passes,
			'limits', public._classroom_hall_pass_limits()),
		'item_views', v_views,
		'songs', v_songs,
		'coins', jsonb_build_object(
			'balance', public._coin_balance(v_email),
			'physical_balance', public._coin_balance(v_email, 'physical'),
			'digital_balance', public._coin_balance(v_email, 'digital'),
			'total', v_coin_total,
			'transactions', v_coin_rows),
		'presence_limits', jsonb_build_object(
			'input_window_seconds', extract(epoch from public._classroom_presence_input_window())::integer,
			'away_window_seconds', extract(epoch from public._classroom_presence_away_window())::integer,
			'heartbeat_seconds', extract(epoch from public._classroom_presence_heartbeat())::integer,
			'min_gap_seconds', extract(epoch from public._classroom_presence_min_gap())::integer,
			'retention_days', extract(day from public._classroom_presence_retention())::integer)
	);
end;
$so$;

comment on function public.classroom_student_overview(uuid, text) is
'One student in one class, for a manager of that class (2026-10-07 round, the per-student page). NULL for every refusal, identically: no session, not a manager of the section, no enrollment row, or an address that manages the section. Hall passes, item views and song counts are this section only; coins are school-wide and projected as the public Ledger projects them, never with the note or who logged them. Item views reach the section manager through this read alone (reversing a sentence of 0085 on request); no policy was added to the table.';

-- The 0166 shape: name every role, grant back exactly one.
revoke all on function public.classroom_student_overview(uuid, text)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_student_overview(uuid, text) to authenticated;

-- The self-check, over THIS function's own name only (the 0214 lesson: never a
-- prefix sweep over somebody else's objects).
do $so_check$
declare
	v_rows integer;
	v_anon boolean;
	v_auth boolean;
	v_definer boolean;
	v_path boolean;
begin
	select count(*)::integer into v_rows
	from pg_catalog.pg_proc p
	join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_student_overview';
	if v_rows <> 1 then
		raise exception '0233 student-overview: expected exactly one classroom_student_overview, found %', v_rows;
	end if;

	v_anon := has_function_privilege('anon', 'public.classroom_student_overview(uuid, text)', 'execute');
	v_auth := has_function_privilege('authenticated', 'public.classroom_student_overview(uuid, text)', 'execute');
	if v_anon then
		raise exception '0233 student-overview: anon can execute classroom_student_overview';
	end if;
	if not v_auth then
		raise exception '0233 student-overview: authenticated cannot execute classroom_student_overview';
	end if;

	select p.prosecdef,
		coalesce(array_to_string(p.proconfig, ',') like '%search_path=%', false)
	into v_definer, v_path
	from pg_catalog.pg_proc p
	where p.oid = 'public.classroom_student_overview(uuid, text)'::regprocedure;
	if not v_definer then
		raise exception '0233 student-overview: classroom_student_overview is not security definer';
	end if;
	if not v_path then
		raise exception '0233 student-overview: classroom_student_overview has no pinned search_path';
	end if;

	raise notice '0233 student-overview: % function, anon execute %, authenticated execute %, security definer %, search_path pinned %',
		v_rows, v_anon, v_auth, v_definer, v_path;
end;
$so_check$;
-- ===== PART student-overview END =====

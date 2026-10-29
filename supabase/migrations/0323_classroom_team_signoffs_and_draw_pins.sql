-- 0323_classroom_team_signoffs_and_draw_pins.sql
--
-- SIGN-OFFS YOU CAN REACH AND DECIDE, TEAM POSTS THAT KEEP THEIR TEAMS, A PLAN
-- THAT CAN PASS SIGN-OFF 1, AND PHASES THAT OPEN PER TEAM (ledger 0456;
-- gap 87b6bd95, reports f10cfa95, 653c3ff6 and b27e9544). Sign-off 2 (Design)
-- is 2026-11-03 and gates metal cutting, so this lands before the team tools.
--
-- 1. A TEAM POST PINS ITS DRAW (b27e9544). Posting any new draw used to move
--    every team post in the class to the new teams, because a post read the
--    section's current draw at every call (0302's _classroom_section_team_set)
--    and the answers stayed with the old team ids. And a draw that came down
--    or ran past its end before grading left grading answering "That team does
--    not exist" and students on the "Teams are drawn in class" placeholder.
--    Now `classroom_team_post_draws` holds one draw per post per class:
--      - taken the moment a draw exists for the post (a draw posted, the post
--        shared with the class, a team manifest stored), and for every team
--        post already stored when this applies, so Launcher: Design and
--        IDEA-Blade 02 keep the draw they use today with every answer;
--      - a NEW draw posted later moves a post only while the post is unused
--        (no team answer, no team picture, no sign-off request, no grade on
--        the old teams), so a post made just before the next rotation's draw
--        still lands on the new teams;
--      - for students the pinned draw counts while it is posted and not
--        retired; its end time no longer closes the post (a team post must
--        outlive the class page's banner). Taking it down or retiring it still
--        closes it, and the People tab warns first (classroom_team_set_uses);
--      - for grading and for an instructor the pinned draw counts whatever its
--        state, so a team post can always be graded.
--    `_classroom_team_ctx` keeps its signature and now asks the pin, so every
--    caller (the save, the lock, the document, the files, the grade) follows.
-- 2. SIGN-OFFS (87b6bd95, f10cfa95). `classroom_signoff_waiting()` is the
--    count the classroom nav and home show. `classroom_item_signoff_board(item)`
--    is the teams panel on a team post: every team, its members, who owns each
--    role, how far each part is, who checked in today, its blocked tasks and
--    every checkpoint with its state, its checklist and who is missing what.
--    `classroom_signoff_teacher_decide(team, key, results, approve, note)`
--    approves or sends back from that panel, with or without a request, and
--    APPROVES ANYWAY over a failed check when the instructor writes a note
--    (each missing student's own grade still reflects their blank box). The
--    auto check now names what is missing: `_classroom_signoff_missing`.
-- 3. SEEDED TASKS TAKE THEIR DATE FROM THE POST (653c3ff6.1): the checkpoint
--    whose checklist names the box, else the pacing step that holds it, else a
--    checkpoint that checks the whole post, else the post's due date. Only a
--    task a team adds needs a typed date, so "Every task has an owner and a due
--    date" can pass.
-- 4. THE SPLIT ALLOWS A SMALL TEAM (653c3ff6.2). On a team with fewer members
--    than roles somebody owns two roles; each member's share is now their own
--    roles' points plus an even share of the rest, and the plan names who is
--    over or under and by how much.
-- 5. PHASES OPEN PER TEAM (653c3ff6.3). A module may carry `opensAfter`, a
--    checkpoint id: its boxes open for a team the moment that team's sign-off
--    is approved, or on the checkpoint's date, whichever comes first. One post
--    holds every phase; nothing is re-uploaded. A save into a phase not yet
--    open is refused as `not_open`.
--
-- DEPLOY ORDERING: none. Every changed function keeps its signature; the new
-- functions are called only by a client that degrades when they are missing.
--
-- WHAT UNDOES IT, a person's paste: re-run, with their grant lines, 0302's
-- _classroom_team_ctx, classroom_item_teams, _classroom_team_items,
-- _classroom_html_team_block and classroom_save_response; 0303's
-- _classroom_team_seed_tasks and _classroom_team_balance; 0304's
-- _classroom_signoff_auto_ok, classroom_signoff_queue, classroom_signoff_decide
-- and classroom_team_plan; 0305's _classroom_team_grading_section; 0313's two
-- carry-over trigger functions; 0316's _classroom_team_file_visible,
-- classroom_team_progress, _classroom_team_document and
-- classroom_add_submission_file; then
--   drop trigger if exists classroom_postings_team_pin on public.classroom_postings;
--   drop trigger if exists classroom_team_post_draws_notice on public.classroom_team_post_draws;
--   drop table if exists public.classroom_team_post_draws;
-- and drop the functions this file creates. The tasks' filled dates stay.

do $pre$
begin
	if to_regclass('public.classroom_signoff_requests') is null
		or to_regprocedure('public._classroom_team_carry_over(uuid, uuid)') is null
		or to_regprocedure('public.classroom_team_files(uuid)') is null then
		raise exception '0323 cannot apply: the team units of 0302 to 0316 are missing. Apply 0316 first.';
	end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- 1. The pin. The first object is new, so the apply probe can see this landed.
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_team_post_draws (
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	section_id uuid not null references public.classroom_sections (id) on delete cascade,
	team_set_id uuid not null references public.classroom_team_sets (id) on delete cascade,
	pinned_at timestamptz not null default now(),
	pinned_by text not null,
	primary key (item_id, section_id)
);

create index if not exists classroom_team_post_draws_set_idx on public.classroom_team_post_draws (team_set_id);

alter table public.classroom_team_post_draws enable row level security;
revoke all on table public.classroom_team_post_draws from public, anon, authenticated;

-- A POST'S DRAW FOR STUDENTS: the pinned draw while it is posted and not
-- retired (its end time does not close it), or with no pin the class's current
-- draw. Null is "no teams": not posted, or taken down.
create or replace function public._classroom_item_team_set(p_item_id uuid, p_section_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $f$
	select case
		when p.team_set_id is null then public._classroom_section_team_set(p_section_id)
		when s.archived_at is null and s.posted_at is not null and s.posted_at <= now() then p.team_set_id
		else null
	end
	from (select 1) one
	left join public.classroom_team_post_draws p on p.item_id = p_item_id and p.section_id = p_section_id
	left join public.classroom_team_sets s on s.id = p.team_set_id;
$f$;

-- A POST'S DRAW FOR AN INSTRUCTOR AND FOR GRADING: the pinned draw whatever
-- its state, or with no pin the class's current draw.
create or replace function public._classroom_item_team_set_any(p_item_id uuid, p_section_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce(
		(select p.team_set_id from public.classroom_team_post_draws p
		 where p.item_id = p_item_id and p.section_id = p_section_id),
		public._classroom_section_team_set(p_section_id));
$f$;

-- HAS ANY TEAM OF THIS DRAW WORKED ON THIS POST: a team answer, a picture in a
-- team or role box, a sign-off request on one of the post's checkpoints, or a
-- grade. A post nobody has touched may move to a newer draw.
create or replace function public._classroom_team_post_used(p_item_id uuid, p_team_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $f$
	select exists (
			select 1 from public.classroom_team_answers a
			join public.classroom_teams t on t.id = a.team_id
			where t.team_set_id = p_team_set_id and a.item_id = p_item_id)
		or exists (
			select 1 from public.classroom_signoff_requests r
			join public.classroom_teams t on t.id = r.team_id
			join public.classroom_signoff_checkpoints c on c.item_id = p_item_id and c.checkpoint_key = r.checkpoint_key
			where t.team_set_id = p_team_set_id)
		or exists (
			select 1 from public.classroom_submissions s
			join public.classroom_team_members m on m.student_email = s.student_email and m.team_set_id = p_team_set_id
			where s.item_id = p_item_id
				and (s.graded_at is not null or exists (
					select 1 from public.classroom_submission_files f
					where f.submission_id = s.id and f.block_id is not null
						and public._classroom_html_team_block(public._classroom_html_team_manifest(p_item_id), f.block_id) is not null)));
$f$;

-- TAKE OR MOVE ONE POST'S PIN IN ONE CLASS: pin to the class's current draw
-- when there is no pin, or move an unused pin (or one on a retired draw) to it.
-- A used pin stays. True when the pin changed.
create or replace function public._classroom_team_post_pin(p_item_id uuid, p_section_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_now uuid := public._classroom_section_team_set(p_section_id);
	v_pin public.classroom_team_post_draws;
	v_by text := coalesce(nullif(public.current_user_email(), ''), 'system');
begin
	if v_now is null or public._classroom_html_team_manifest(p_item_id) is null then
		return false;
	end if;
	select * into v_pin from public.classroom_team_post_draws p
	where p.item_id = p_item_id and p.section_id = p_section_id for update;
	if v_pin.item_id is null then
		insert into public.classroom_team_post_draws (item_id, section_id, team_set_id, pinned_by)
		values (p_item_id, p_section_id, v_now, v_by)
		on conflict (item_id, section_id) do nothing;
		return true;
	end if;
	if v_pin.team_set_id = v_now then
		return false;
	end if;
	if exists (select 1 from public.classroom_team_sets s where s.id = v_pin.team_set_id and s.archived_at is not null)
		or not public._classroom_team_post_used(p_item_id, v_pin.team_set_id) then
		update public.classroom_team_post_draws
		set team_set_id = v_now, pinned_at = now(), pinned_by = v_by
		where item_id = p_item_id and section_id = p_section_id;
		return true;
	end if;
	return false;
end;
$f$;

-- A pin taken or moved tells the class's open pages to read their teams again.
create or replace function public._classroom_team_post_draws_notice()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $f$
begin
	perform public._classroom_live_notice(coalesce(new.section_id, old.section_id)::text, 'teams');
	return null;
end;
$f$;

drop trigger if exists classroom_team_post_draws_notice on public.classroom_team_post_draws;
create trigger classroom_team_post_draws_notice
	after insert or update or delete on public.classroom_team_post_draws
	for each row execute function public._classroom_team_post_draws_notice();

-- A post shared with a class that already has teams takes its pin at once.
create or replace function public._classroom_postings_team_pin()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $f$
begin
	perform public._classroom_team_post_pin(new.item_id, new.section_id);
	return null;
end;
$f$;

drop trigger if exists classroom_postings_team_pin on public.classroom_postings;
create trigger classroom_postings_team_pin
	after insert on public.classroom_postings
	for each row execute function public._classroom_postings_team_pin();

-- 0313's two carry-over triggers, now pinning first (marked 0323) and carrying
-- over for the teams the post is pinned to.
create or replace function public._classroom_team_carry_over_html()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_team uuid;
	v_section uuid;
begin
	if jsonb_typeof(new.manifest->'team') is distinct from 'object' then
		return null;
	end if;
	-- 0323: the post takes its pin in every class it is in.
	for v_section in select pg.section_id from public.classroom_postings pg where pg.item_id = new.item_id loop
		perform public._classroom_team_post_pin(new.item_id, v_section);
	end loop;
	for v_team in
		select t.id
		from public.classroom_postings pg
		join public.classroom_teams t
			on t.team_set_id = public._classroom_item_team_set_any(new.item_id, pg.section_id)
		where pg.item_id = new.item_id
	loop
		perform public._classroom_team_carry_over(new.item_id, v_team);
	end loop;
	return null;
end;
$f$;

create or replace function public._classroom_team_carry_over_set()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_item uuid;
	v_team uuid;
begin
	if new.posted_at is null or (tg_op = 'UPDATE' and old.posted_at is not distinct from new.posted_at) then
		return null;
	end if;
	for v_item in
		select pg.item_id
		from public.classroom_postings pg
		join public.classroom_html_assignments h on h.item_id = pg.item_id
		where pg.section_id = new.section_id
			and jsonb_typeof(h.manifest->'team') = 'object'
	loop
		-- 0323: an unpinned or unused post moves to this draw; a used one stays.
		perform public._classroom_team_post_pin(v_item, new.section_id);
		continue when public._classroom_item_team_set_any(v_item, new.section_id) is distinct from new.id;
		for v_team in select t.id from public.classroom_teams t where t.team_set_id = new.id loop
			perform public._classroom_team_carry_over(v_item, v_team);
		end loop;
	end loop;
	return null;
end;
$f$;

-- THE TEAM POSTS A DRAW HOLDS, for the People tab's warning before it is taken
-- down or retired: every post pinned to it with how many of its students are
-- not yet graded. A manager of the draw's class only.
create or replace function public.classroom_team_set_uses(p_team_set_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_section uuid;
begin
	select s.section_id into v_section from public.classroom_team_sets s where s.id = p_team_set_id;
	if v_section is null or not coalesce(public.classroom_manages_section(v_section), false) then
		raise exception 'Team set not found.';
	end if;
	return jsonb_build_object('ok', true, 'posts', coalesce((
		select jsonb_agg(jsonb_build_object(
			'item_id', i.id, 'title', i.title, 'due_at', i.due_at,
			'ungraded', (select count(*) from public.classroom_team_members m
				left join public.classroom_submissions s on s.item_id = i.id and s.student_email = m.student_email
				where m.team_set_id = p_team_set_id and s.graded_at is null)
		) order by i.due_at nulls last, i.title)
		from public.classroom_team_post_draws p join public.classroom_items i on i.id = p.item_id
		where p.team_set_id = p_team_set_id and p.section_id = v_section
	), '[]'::jsonb));
end;
$f$;

revoke all on function public._classroom_item_team_set(uuid, uuid) from public, anon, authenticated;
revoke all on function public._classroom_item_team_set_any(uuid, uuid) from public, anon, authenticated;
revoke all on function public._classroom_team_post_used(uuid, uuid) from public, anon, authenticated;
revoke all on function public._classroom_team_post_pin(uuid, uuid) from public, anon, authenticated;
revoke all on function public._classroom_team_post_draws_notice() from public, anon, authenticated;
revoke all on function public._classroom_postings_team_pin() from public, anon, authenticated;
revoke all on function public._classroom_team_carry_over_html() from public, anon, authenticated;
revoke all on function public._classroom_team_carry_over_set() from public, anon, authenticated;
revoke all on function public.classroom_team_set_uses(uuid) from public, anon, authenticated;
grant execute on function public.classroom_team_set_uses(uuid) to authenticated;

-- EVERY TEAM POST ALREADY STORED PINS TO THE DRAW IT USES TODAY. The answers
-- are keyed by team, so nothing moves and nothing is lost. Only a post with no
-- pin is written, so a re-paste writes nothing.
do $pin$
declare
	v_n integer := 0;
begin
	insert into public.classroom_team_post_draws (item_id, section_id, team_set_id, pinned_by)
	select pg.item_id, pg.section_id, public._classroom_section_team_set(pg.section_id), 'system'
	from public.classroom_postings pg
	join public.classroom_html_assignments h on h.item_id = pg.item_id
	where jsonb_typeof(h.manifest->'team') = 'object'
		and public._classroom_section_team_set(pg.section_id) is not null
	on conflict (item_id, section_id) do nothing;
	get diagnostics v_n = row_count;
	raise notice '0323: % team posts pinned to the draw they use today.', v_n;
end
$pin$;

-- ---------------------------------------------------------------------------
-- 2. Everything that named the class's current draw for a post now names the
--    post's own draw (marked 0323).
-- ---------------------------------------------------------------------------

create or replace function public._classroom_team_ctx(p_item_id uuid, p_email text)
returns table (section_id uuid, team_set_id uuid, team_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_section uuid;
	v_set uuid;
	v_first_section uuid;
	v_first_set uuid;
	v_team uuid;
begin
	if coalesce(p_email, '') = '' then
		return;
	end if;
	for v_section in
		select pg.section_id
		from public.classroom_postings pg
		join public.classroom_enrollments e
			on e.section_id = pg.section_id and e.student_email = p_email and e.active
		where pg.item_id = p_item_id
		order by pg.section_id
	loop
		-- 0323: the post's own draw. Inside a team grade (0305 names the team
		-- for the transaction) the pinned draw counts whatever its state.
		v_set := case when coalesce(current_setting('idea.team_grade', true), '') <> ''
			then public._classroom_item_team_set_any(p_item_id, v_section)
			else public._classroom_item_team_set(p_item_id, v_section) end;
		if v_first_section is null then
			v_first_section := v_section;
			v_first_set := v_set;
		end if;
		continue when v_set is null;
		select m.team_id into v_team
		from public.classroom_team_members m
		where m.team_set_id = v_set and m.student_email = p_email;
		if v_team is not null then
			section_id := v_section;
			team_set_id := v_set;
			team_id := v_team;
			return next;
			return;
		end if;
		if v_first_set is null then
			v_first_section := v_section;
			v_first_set := v_set;
		end if;
	end loop;
	if v_first_section is not null then
		section_id := v_first_section;
		team_set_id := v_first_set;
		team_id := null;
		return next;
	end if;
end;
$f$;


revoke all on function public._classroom_team_ctx(uuid, text) from public, anon, authenticated;

create or replace function public.classroom_item_teams(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_out jsonb := '[]'::jsonb;
	v_section record;
	v_set uuid;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if public._classroom_html_team_manifest(p_item_id) is null then
		return jsonb_build_object('ok', true, 'team_assignment', false, 'sections', '[]'::jsonb);
	end if;
	for v_section in
		select s.id, s.label
		from public.classroom_postings pg
		join public.classroom_sections s on s.id = pg.section_id
		where pg.item_id = p_item_id and public.classroom_manages_section(s.id)
		order by s.label
	loop
		-- 0323: the post's own draw, whatever its state, so it can always be graded.
		v_set := public._classroom_item_team_set_any(p_item_id, v_section.id);
		v_out := v_out || jsonb_build_array(jsonb_build_object(
			'section_id', v_section.id,
			'label', v_section.label,
			'team_set_id', v_set,
			'set_label', (select ts.label from public.classroom_team_sets ts where ts.id = v_set),
			'teams', coalesce((
				select jsonb_agg(jsonb_build_object(
					'id', t.id,
					'number', t.team_number,
					'name', coalesce(nullif(btrim(t.name), ''), 'Team ' || t.team_number),
					'members', (
						select coalesce(jsonb_agg(public._classroom_first_name(v_section.id, m.student_email)
							order by m.student_email), '[]'::jsonb)
						from public.classroom_team_members m where m.team_id = t.id
					)
				) order by t.team_number)
				from public.classroom_teams t where t.team_set_id = v_set
			), '[]'::jsonb)
		));
	end loop;
	return jsonb_build_object('ok', true, 'team_assignment', true, 'sections', v_out);
end;
$f$;


revoke all on function public.classroom_item_teams(uuid) from public, anon, authenticated;
grant execute on function public.classroom_item_teams(uuid) to authenticated;

-- THE TEAM ASSIGNMENTS A TEAM WORKS ON: 0302's rule, with "not older than its
-- draw" replaced by the post's own draw being this team's (marked 0323).
create or replace function public._classroom_team_items(p_team_id uuid)
returns table (item_id uuid, manifest jsonb, due_at timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $f$
	select i.id, h.manifest, i.due_at, i.created_at
	from public.classroom_teams t
	join public.classroom_team_sets s on s.id = t.team_set_id
	join public.classroom_postings pg on pg.section_id = s.section_id
	join public.classroom_items i on i.id = pg.item_id
	join public.classroom_html_assignments h on h.item_id = i.id
	where t.id = p_team_id
		and i.kind = 'assignment'
		and i.assignment_schema_version = 3
		and jsonb_typeof(h.manifest->'team') = 'object'
		and public._classroom_item_live(i.published, i.publish_at)
		and public._classroom_item_team_set_any(i.id, s.section_id) = t.team_set_id;
$f$;

revoke all on function public._classroom_team_items(uuid) from public, anon, authenticated;

-- 0305's grading gate, comparing with the post's own draw (marked 0323).
create or replace function public._classroom_team_grading_section(p_item_id uuid, p_team_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $f$
	select s.section_id
	from (select public._classroom_team_section(p_team_id) as section_id) s
	where s.section_id is not null
		and public.classroom_manages_section(s.section_id)
		and exists (select 1 from public.classroom_postings pg
			where pg.item_id = p_item_id and pg.section_id = s.section_id)
		and (select t.team_set_id from public.classroom_teams t where t.id = p_team_id)
			is not distinct from public._classroom_item_team_set_any(p_item_id, s.section_id);
$f$;

revoke all on function public._classroom_team_grading_section(uuid, uuid) from public, anon, authenticated;

-- 0316's picture rule, on the post's own draw (marked 0323).
create or replace function public._classroom_team_file_visible(p_file_id uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce((
		select public._classroom_html_team_block(public._classroom_html_team_manifest(s.item_id), f.block_id) is not null
			and exists (
				select 1
				from public.classroom_postings pg
				join public.classroom_team_members mine
					on mine.team_set_id = public._classroom_item_team_set(s.item_id, pg.section_id)
					and mine.student_email = lower(btrim(p_email))
				join public.classroom_team_members theirs
					on theirs.team_id = mine.team_id and theirs.student_email = s.student_email
				join public.classroom_enrollments e
					on e.section_id = pg.section_id and e.student_email = mine.student_email and e.active
				where pg.item_id = s.item_id)
		from public.classroom_submission_files f
		join public.classroom_submissions s on s.id = f.submission_id
		where f.id = p_file_id and f.block_id is not null and coalesce(p_email, '') <> ''
	), false);
$f$;

revoke all on function public._classroom_team_file_visible(uuid, text) from public, anon, authenticated;

create or replace function public.classroom_team_progress(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_manifest jsonb := public._classroom_html_team_manifest(p_item_id);
begin
	return jsonb_build_object('ok', true, 'teams', coalesce((
		select jsonb_agg(t_row order by t_row.posted_at desc nulls last, t_row.team_number)
		from (
			select s.label as set_label, s.posted_at, t.team_number,
				coalesce(nullif(btrim(t.name), ''), 'Team ' || t.team_number) as team_name,
				(
					select coalesce(jsonb_agg(jsonb_build_object(
						'name', public._classroom_team_display_name(t.id, m.student_email),
						'me', m.student_email = v_email,
						'state', coalesce(sub.state, 'draft'),
						'answered', coalesce((
							select jsonb_agg(distinct x.block_id)
							from (
								select r.block_id
								from public.classroom_responses r
								where r.item_id = p_item_id and r.student_email = m.student_email
									and (jsonb_typeof(r.value) = 'boolean'
										or (jsonb_typeof(r.value) = 'string' and (r.value #>> '{}') ~ '[^][[:space:]",]'))
								union all
								-- 0316: the team's own answer to a shared or role box.
								select a.block_id
								from public.classroom_team_answers a
								where v_manifest is not null and a.team_id = t.id and a.item_id = p_item_id
									and public._classroom_answer_present(a.value)
							) x
						), '[]'::jsonb),
						'images', coalesce((
							select jsonb_agg(distinct y.block_id)
							from (
								select f.block_id
								from public.classroom_submission_files f
								where f.submission_id = sub.id and f.block_id is not null
								union all
								-- 0316: a teammate's picture in a shared or role box.
								select f2.block_id
								from public.classroom_submission_files f2
								join public.classroom_submissions s2 on s2.id = f2.submission_id
								join public.classroom_team_members m2 on m2.team_id = t.id and m2.student_email = s2.student_email
								where v_manifest is not null and s2.item_id = p_item_id and f2.block_id is not null
									and public._classroom_html_team_block(v_manifest, f2.block_id) is not null
							) y
						), '[]'::jsonb)
					) order by (m.student_email = v_email) desc, e.display_name, m.student_email), '[]'::jsonb)
					from public.classroom_team_members m
					left join public.classroom_enrollments e on e.section_id = s.section_id and e.student_email = m.student_email
					left join public.classroom_submissions sub on sub.item_id = p_item_id and sub.student_email = m.student_email
					where m.team_id = t.id
						and (m.student_email = v_email or m.student_email not in (select public._idea_test_emails()))
				) as members
			from public.classroom_team_sets s
			join public.classroom_teams t on t.team_set_id = s.id
			where s.archived_at is null
				-- 0323: the post's own draw in that class.
				and s.id = public._classroom_item_team_set(p_item_id, s.section_id)
				and public._classroom_team_member(t.id, v_email)
				and exists (select 1 from public.classroom_postings pg where pg.item_id = p_item_id and pg.section_id = s.section_id)
				and exists (select 1 from public.classroom_enrollments me where me.section_id = s.section_id and me.student_email = v_email and me.active)
		) t_row
	), '[]'::jsonb));
end;
$$;

revoke all on function public.classroom_team_progress(uuid) from public, anon, authenticated;
grant execute on function public.classroom_team_progress(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Phases that open per team (653c3ff6.3). A module's `opensAfter` names a
--    checkpoint; its boxes open for a team when that team's sign-off is
--    approved, or on the checkpoint's date. A display key the manifest gates
--    never read (0195, 0301); only these helpers do.
-- ---------------------------------------------------------------------------

-- The module that holds a block, or null.
create or replace function public._classroom_html_block_module(p_manifest jsonb, p_block_id text)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $f$
	select m.mod
	from jsonb_array_elements(
			case when jsonb_typeof(p_manifest->'modules') = 'array' then p_manifest->'modules' else '[]'::jsonb end) as m(mod),
		jsonb_array_elements(
			case when jsonb_typeof(m.mod->'blocks') = 'array' then m.mod->'blocks' else '[]'::jsonb end) as b(blk)
	where b.blk->>'id' = p_block_id
	limit 1;
$f$;

-- IS A PHASE OPEN FOR A TEAM: its checkpoint approved for the team, or the
-- checkpoint's date reached (the stored, admin-editable date first, else the
-- manifest's). A checkpoint the post does not declare never holds a box shut.
create or replace function public._classroom_team_phase_open(p_team_id uuid, p_item_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $f$
	with cp as (
		select coalesce(
			(select c.due_on from public.classroom_signoff_checkpoints c
			 where c.item_id = p_item_id and c.checkpoint_key = p_key),
			(select public._calendar_try_date(k->>'date')
			 from jsonb_array_elements(case when jsonb_typeof(public._classroom_html_team_manifest(p_item_id)->'team'->'checkpoints') = 'array'
				then public._classroom_html_team_manifest(p_item_id)->'team'->'checkpoints' else '[]'::jsonb end) k
			 where k->>'id' = p_key limit 1)) as day,
			exists (select 1
				from jsonb_array_elements(case when jsonb_typeof(public._classroom_html_team_manifest(p_item_id)->'team'->'checkpoints') = 'array'
					then public._classroom_html_team_manifest(p_item_id)->'team'->'checkpoints' else '[]'::jsonb end) k
				where k->>'id' = p_key)
			or exists (select 1 from public.classroom_signoff_checkpoints c
				where c.item_id = p_item_id and c.checkpoint_key = p_key) as declared
	)
	select not cp.declared
		or public._classroom_signoff_state(p_team_id, p_key) = 'approved'
		or (cp.day is not null and cp.day <= public._classroom_school_today())
	from cp;
$f$;

-- EVERY PHASE A POST'S MODULES WAIT ON, for one team:
-- {checkpoint key: {open, title, date}}.
create or replace function public._classroom_team_phases(p_item_id uuid, p_team_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	with keys as (
		select distinct m.mod->>'opensAfter' as key
		from jsonb_array_elements(case when jsonb_typeof(public._classroom_html_team_manifest(p_item_id)->'modules') = 'array'
			then public._classroom_html_team_manifest(p_item_id)->'modules' else '[]'::jsonb end) m(mod)
		where jsonb_typeof(m.mod->'opensAfter') = 'string' and m.mod->>'opensAfter' ~ '^[A-Za-z0-9_-]{1,40}$'
	)
	select coalesce(jsonb_object_agg(k.key, jsonb_build_object(
		'open', public._classroom_team_phase_open(p_team_id, p_item_id, k.key),
		'title', coalesce(
			(select c.title from public.classroom_signoff_checkpoints c where c.item_id = p_item_id and c.checkpoint_key = k.key),
			(select x->>'title' from jsonb_array_elements(case when jsonb_typeof(public._classroom_html_team_manifest(p_item_id)->'team'->'checkpoints') = 'array'
				then public._classroom_html_team_manifest(p_item_id)->'team'->'checkpoints' else '[]'::jsonb end) x where x->>'id' = k.key limit 1),
			k.key),
		'date', coalesce(
			(select c.due_on from public.classroom_signoff_checkpoints c where c.item_id = p_item_id and c.checkpoint_key = k.key),
			(select public._calendar_try_date(x->>'date') from jsonb_array_elements(case when jsonb_typeof(public._classroom_html_team_manifest(p_item_id)->'team'->'checkpoints') = 'array'
				then public._classroom_html_team_manifest(p_item_id)->'team'->'checkpoints' else '[]'::jsonb end) x where x->>'id' = k.key limit 1))
	)), '{}'::jsonb)
	from keys k;
$f$;

-- A SAVE INTO A PHASE THIS STUDENT'S TEAM HAS NOT OPENED: the refusal, or null.
-- Null for a post that is not a team post, a module with no `opensAfter`, and
-- a student with no team (the team write refuses that one itself).
create or replace function public._classroom_team_phase_refusal(p_item_id uuid, p_email text, p_block_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_manifest jsonb := public._classroom_html_team_manifest(p_item_id);
	v_key text;
	v_team uuid;
begin
	if v_manifest is null then
		return null;
	end if;
	v_key := public._classroom_html_block_module(v_manifest, p_block_id)->>'opensAfter';
	if v_key is null then
		return null;
	end if;
	select c.team_id into v_team from public._classroom_team_ctx(p_item_id, p_email) c;
	if v_team is null or public._classroom_team_phase_open(v_team, p_item_id, v_key) then
		return null;
	end if;
	return jsonb_build_object('ok', false, 'reason', 'not_open', 'checkpoint', v_key);
end;
$f$;

revoke all on function public._classroom_html_block_module(jsonb, text) from public, anon, authenticated;
revoke all on function public._classroom_team_phase_open(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public._classroom_team_phases(uuid, uuid) from public, anon, authenticated;
revoke all on function public._classroom_team_phase_refusal(uuid, text, text) from public, anon, authenticated;

create or replace function public.classroom_save_response(
	p_item_id uuid,
	p_block_id text,
	p_value jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_manifest jsonb;
	v_spec jsonb;
	v_block jsonb;
	v_module_id text;
	v_type text;
	v_state text;
	v_gated text[];
	v_team_owner jsonb;
	v_phase jsonb;
begin
	v_manifest := public._classroom_html_manifest(p_item_id);

	if v_manifest is null then
		select a.spec into v_spec
		from public.classroom_assignment_specs a where a.item_id = p_item_id;
		if v_spec is null then
			raise exception 'This assignment has no interactive spec.';
		end if;
	end if;

	if p_value is null or pg_column_size(p_value) > 100000 then
		raise exception 'That response is too large.';
	end if;

	if p_block_id = '@declaration' then
		if v_manifest is not null then
			raise exception 'This assignment has no declaration.';
		end if;
		if (v_spec->'declarations'->>'academicIntegrity')::boolean is not true then
			raise exception 'This assignment has no declaration.';
		end if;
	elsif v_manifest is not null then
		v_block := public._classroom_html_block(v_manifest, p_block_id);
		if v_block is null then
			raise exception 'Unknown block "%".', p_block_id;
		end if;
		v_type := v_block->>'type';
		if v_type not in ('text', 'longText', 'checkbox', 'radio', 'image', 'table') then
			raise exception 'Block "%" does not take a typed response.', p_block_id;
		end if;
	else
		select b.blk, m.mod->>'id' into v_block, v_module_id
		from jsonb_array_elements(v_spec->'modules') as m(mod),
			jsonb_array_elements(m.mod->'blocks') as b(blk)
		where b.blk->>'id' = p_block_id
		limit 1;
		if v_block is null then
			raise exception 'Unknown block "%".', p_block_id;
		end if;
		v_type := v_block->>'type';
		if v_type not in ('textField', 'table', 'checklist') then
			raise exception 'Block "%" does not take a typed response.', p_block_id;
		end if;

		v_gated := public._classroom_gated_modules(v_spec);
		if v_module_id = any (v_gated) and not exists (
			select 1 from public.classroom_module_approvals a
			where a.item_id = p_item_id and a.student_email = v_email
				and a.module_id = v_spec->'approvalGate'->>'afterModule'
		) then
			return jsonb_build_object('ok', false, 'reason', 'approval_pending', 'module_id', v_module_id);
		end if;
	end if;

	select s.state into v_state
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;
	if v_state = 'submitted' then
		return jsonb_build_object('ok', false, 'reason', 'locked');
	end if;

	-- 0323: a box in a phase this student's team has not opened yet.
	if v_manifest is not null then
		v_phase := public._classroom_team_phase_refusal(p_item_id, v_email, p_block_id);
		if v_phase is not null then
			return v_phase;
		end if;
	end if;

	-- 0302: A TEAM OR ROLE BLOCK OF A TEAM ASSIGNMENT IS WRITTEN FOR THE WHOLE
	-- TEAM, by its one writer. Null for every other block, which falls through
	-- to 0197's insert unchanged.
	if v_manifest is not null then
		v_team_owner := public._classroom_html_team_block(v_manifest, p_block_id);
		if v_team_owner is not null then
			return public._classroom_save_team_response(p_item_id, v_email, p_block_id, p_value, v_team_owner);
		end if;
	end if;

	insert into public.classroom_responses (item_id, student_email, block_id, value, updated_at)
	values (p_item_id, v_email, p_block_id, p_value, now())
	on conflict (item_id, student_email, block_id) do update
		set value = excluded.value, updated_at = now();

	return jsonb_build_object('ok', true);
end;
$$;


revoke all on function public.classroom_save_response(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.classroom_save_response(uuid, text, jsonb) to authenticated;

create or replace function public.classroom_add_submission_file(
	p_item_id uuid,
	p_drive_file_id text,
	p_filename text,
	p_mime_type text,
	p_size_bytes bigint,
	p_block_id text,
	p_caption text,
	p_storage_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_manifest jsonb;
	v_spec jsonb;
	v_block jsonb;
	v_module_id text;
	v_submission_id uuid;
	v_state text;
	v_next integer;
	v_id uuid;
	v_file text := nullif(btrim(coalesce(p_drive_file_id, '')), '');
	v_key text := nullif(btrim(coalesce(p_storage_key, '')), '');
	v_team_owner jsonb;
	v_ctx record;
	v_team uuid;
	v_refusal jsonb;
begin
	if (v_file is null) = (v_key is null) then
		raise exception 'Attach exactly one of a Drive file id or a storage key.';
	end if;

	if p_block_id is not null then
		v_manifest := public._classroom_html_manifest(p_item_id);
		if v_manifest is not null then
			v_block := public._classroom_html_block(v_manifest, p_block_id);
			if v_block is null or v_block->>'type' <> 'image' then
				raise exception 'Block "%" is not an image zone.', coalesce(p_block_id, '(none)');
			end if;
			-- 0323: a picture box in a phase the team has not opened yet.
			v_refusal := public._classroom_team_phase_refusal(p_item_id, v_email, p_block_id);
			if v_refusal is not null then
				return v_refusal;
			end if;
			-- 0316: A TEAM OR ROLE PICTURE is written by whoever may write that
			-- shared box (0302's one rule): the role's owner for a role block.
			v_team_owner := public._classroom_html_team_block(v_manifest, p_block_id);
			if v_team_owner is not null then
				select * into v_ctx from public._classroom_team_ctx(p_item_id, v_email);
				if v_ctx.team_id is null then
					return jsonb_build_object('ok', false,
						'reason', case when v_ctx.team_set_id is null then 'not_posted' else 'no_team' end);
				end if;
				v_team := v_ctx.team_id;
				v_refusal := public._classroom_team_block_refusal(p_item_id, v_email, v_team, v_team_owner);
				if v_refusal is not null then
					return v_refusal;
				end if;
			end if;
		else
			select a.spec into v_spec
			from public.classroom_assignment_specs a where a.item_id = p_item_id;
			if v_spec is null then
				raise exception 'This assignment has no interactive spec.';
			end if;
			select b.blk, m.mod->>'id' into v_block, v_module_id
			from jsonb_array_elements(v_spec->'modules') as m(mod),
				jsonb_array_elements(m.mod->'blocks') as b(blk)
			where b.blk->>'id' = p_block_id
			limit 1;
			if v_block is null or v_block->>'type' <> 'imageZone' then
				raise exception 'Block "%" is not an image zone.', coalesce(p_block_id, '(none)');
			end if;
			if v_module_id = any (public._classroom_gated_modules(v_spec)) and not exists (
				select 1 from public.classroom_module_approvals a
				where a.item_id = p_item_id and a.student_email = v_email
					and a.module_id = v_spec->'approvalGate'->>'afterModule'
			) then
				return jsonb_build_object('ok', false, 'reason', 'approval_pending', 'module_id', v_module_id);
			end if;
		end if;
	end if;

	select s.id, s.state into v_submission_id, v_state
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;
	if v_state = 'submitted' then
		return jsonb_build_object('ok', false, 'reason', 'locked');
	end if;
	if v_submission_id is null then
		insert into public.classroom_submissions (item_id, student_email)
		values (p_item_id, v_email)
		on conflict (item_id, student_email) do nothing
		returning id into v_submission_id;

		if v_submission_id is null then
			select s.id, s.state into v_submission_id, v_state
			from public.classroom_submissions s
			where s.item_id = p_item_id and s.student_email = v_email;

			if v_state = 'submitted' then
				return jsonb_build_object('ok', false, 'reason', 'locked');
			end if;
			if v_submission_id is null then
				raise exception 'Could not open a submission for this assignment.';
			end if;
		end if;
	end if;

	if v_key is not null and public._classroom_storage_prefix_uuid(v_key) is distinct from v_submission_id then
		raise exception 'That storage key does not belong to this submission.';
	end if;

	select coalesce(max(sort_order), 0) + 1 into v_next
	from public.classroom_submission_files where submission_id = v_submission_id;

	insert into public.classroom_submission_files
		(submission_id, block_id, caption, drive_file_id, storage_key, filename, mime_type, size_bytes, sort_order)
	values (v_submission_id, p_block_id, nullif(left(btrim(coalesce(p_caption, '')), 500), ''),
		v_file, v_key, left(btrim(coalesce(p_filename, 'file')), 300),
		left(btrim(coalesce(p_mime_type, 'application/octet-stream')), 200),
		p_size_bytes, v_next)
	returning id into v_id;

	-- 0316: a team picture tells the teammates' open pages to read again.
	if v_team is not null then
		perform public._classroom_live_notice('team-' || v_team::text, 'team-doc');
	end if;

	return jsonb_build_object(
		'ok', true,
		'file_id', v_id,
		'submission_id', v_submission_id,
		'storage_key', v_key
	);
end;
$$;


revoke all on function public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text, text)
	from public, anon, authenticated;
grant execute on function public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text, text) to authenticated;

create or replace function public._classroom_team_document(
	p_item_id uuid,
	p_team_id uuid,
	p_me text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	with team as (
		select t.id, t.team_number, s.section_id,
			coalesce(nullif(btrim(t.name), ''), 'Team ' || t.team_number) as name
		from public.classroom_teams t join public.classroom_team_sets s on s.id = t.team_set_id
		where t.id = p_team_id
	)
	select jsonb_build_object(
		'ok', true,
		'team', (select jsonb_build_object('id', team.id, 'name', team.name, 'number', team.team_number,
			'section_id', team.section_id) from team),
		'members', coalesce((
			select jsonb_agg(jsonb_build_object(
				'name', public._classroom_team_display_name(team.id, m.student_email),
				'me', m.student_email = p_me,
				'active', coalesce(e.active, false)
			) order by (m.student_email = p_me) desc, e.display_name, m.student_email)
			from team
			join public.classroom_team_members m on m.team_id = team.id
			left join public.classroom_enrollments e
				on e.section_id = team.section_id and e.student_email = m.student_email
			where m.student_email = p_me or m.student_email not in (select public._idea_test_emails())
		), '[]'::jsonb),
		'roles', coalesce((
			select jsonb_agg(jsonb_build_object(
				'id', r.role->>'id',
				'title', r.role->>'title',
				'owner', case when o.owner_email is null then null
					else public._classroom_team_display_name(team.id, o.owner_email) end,
				'mine', o.owner_email is not null and o.owner_email = p_me
			) order by r.ord)
			from team,
				jsonb_array_elements(public._classroom_team_roles(p_team_id)) with ordinality as r(role, ord)
			left join lateral (
				select public._classroom_team_role_owner(p_team_id, r.role->>'id') as owner_email
			) o on true
		), '[]'::jsonb),
		'values', coalesce((
			select jsonb_object_agg(a.block_id, jsonb_build_object(
				'value', a.value,
				'by', public._classroom_team_display_name(team.id, a.updated_by),
				'at', a.updated_at
			))
			from team
			join public.classroom_team_answers a on a.team_id = team.id and a.item_id = p_item_id
		), '{}'::jsonb),
		'locks', coalesce((
			select jsonb_object_agg(l.block_id, jsonb_build_object(
				'by', public._classroom_team_display_name(team.id, l.holder_email),
				'mine', l.holder_email = p_me,
				'until', l.touched_at + public._classroom_team_lock_ttl()
			))
			from team
			join public.classroom_team_box_locks l on l.team_id = team.id and l.item_id = p_item_id
			where l.touched_at >= now() - public._classroom_team_lock_ttl()
		), '{}'::jsonb),
		-- 0323: each checkpoint a module waits on, and whether it is open for this team.
		'phases', public._classroom_team_phases(p_item_id, p_team_id),
		'past_due', coalesce((select i.due_at is not null and now() > i.due_at
			from public.classroom_items i where i.id = p_item_id), false),
		'now', now()
	);
$f$;


revoke all on function public._classroom_team_document(uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Who is missing what, seeded dates, and the split for a small team.
-- ---------------------------------------------------------------------------

-- IS ONE BOX DONE: for a team or role block the team's answer or a teammate's
-- picture; for an individual block this member's own answer or picture. The
-- one statement of it, which the auto checks, the teams panel and the missing
-- list all ask.
create or replace function public._classroom_team_block_done(
	p_team_id uuid,
	p_item_id uuid,
	p_manifest jsonb,
	p_block_id text,
	p_email text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $f$
	select case when public._classroom_html_team_block(p_manifest, p_block_id) is not null then
		exists (select 1 from public.classroom_team_answers a
			where a.team_id = p_team_id and a.item_id = p_item_id and a.block_id = p_block_id
				and public._classroom_answer_present(a.value))
		or exists (select 1 from public.classroom_submission_files f
			join public.classroom_submissions s on s.id = f.submission_id
			join public.classroom_team_members m on m.student_email = s.student_email and m.team_id = p_team_id
			where s.item_id = p_item_id and f.block_id = p_block_id)
	else
		exists (select 1 from public.classroom_responses r
			where r.item_id = p_item_id and r.block_id = p_block_id and r.student_email = p_email
				and public._classroom_answer_present(r.value))
		or exists (select 1 from public.classroom_submission_files f
			join public.classroom_submissions s on s.id = f.submission_id
			where s.item_id = p_item_id and s.student_email = p_email and f.block_id = p_block_id)
	end;
$f$;

-- WHO IS MISSING WHAT, for a field check of a checklist:
-- [{block, label, who, kind}], empty when it passes. `who` is the role owner's
-- name for a role box ("No owner yet" when nobody holds it), "Team" for a team
-- box, and the member's name for each member with an empty individual box.
create or replace function public._classroom_signoff_missing(p_team_id uuid, p_item jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_source uuid := case when coalesce(p_item->>'source', '') ~ '^[0-9a-f-]{36}$' then (p_item->>'source')::uuid end;
	v_manifest jsonb;
	v_blocks text[] := '{}';
	v_block text;
	v_owner jsonb;
	v_blk jsonb;
	v_label text;
	v_email text;
	v_out jsonb := '[]'::jsonb;
begin
	if p_item->>'check' is null or p_item->>'check' not in ('blocks-complete', 'assignment-complete') then
		return v_out;
	end if;
	select h.manifest into v_manifest from public.classroom_html_assignments h where h.item_id = v_source;
	if p_item->>'check' = 'assignment-complete' then
		select coalesce(array_agg(b->>'id' order by mo, bo), '{}') into v_blocks
		from jsonb_array_elements(case when jsonb_typeof(v_manifest->'modules') = 'array' then v_manifest->'modules' else '[]'::jsonb end)
				with ordinality as x(m, mo),
			jsonb_array_elements(case when jsonb_typeof(m->'blocks') = 'array' then m->'blocks' else '[]'::jsonb end)
				with ordinality as y(b, bo)
		where (b->'optional') is distinct from 'true'::jsonb;
	elsif jsonb_typeof(p_item->'blocks') = 'array' then
		select coalesce(array_agg(x), '{}') into v_blocks from jsonb_array_elements_text(p_item->'blocks') x;
	end if;
	foreach v_block in array v_blocks loop
		v_owner := public._classroom_html_team_block(v_manifest, v_block);
		v_blk := public._classroom_html_block(v_manifest, v_block);
		v_label := left(btrim(coalesce(nullif(btrim(v_blk->>'task'), ''), nullif(btrim(v_blk->>'prompt'), ''),
			v_blk->>'field', v_block)), 80);
		if v_owner is not null then
			if not public._classroom_team_block_done(p_team_id, v_source, v_manifest, v_block, '') then
				v_out := v_out || jsonb_build_array(jsonb_build_object(
					'block', v_block, 'label', v_label, 'kind', v_owner->>'audience',
					'who', case when v_owner->>'audience' = 'role' then coalesce(nullif(
						public._classroom_team_display_name(p_team_id, public._classroom_team_role_owner(p_team_id, v_owner->>'role')), ''),
						'No owner yet') else 'Team' end));
			end if;
		else
			for v_email in
				select m.student_email from public.classroom_team_members m
				where m.team_id = p_team_id order by m.student_email
			loop
				if not public._classroom_team_block_done(p_team_id, v_source, v_manifest, v_block, v_email) then
					v_out := v_out || jsonb_build_array(jsonb_build_object(
						'block', v_block, 'label', v_label, 'kind', 'individual',
						'who', public._classroom_team_display_name(p_team_id, v_email)));
				end if;
			end loop;
		end if;
	end loop;
	return v_out;
end;
$f$;

-- 0304's one auto check, the field checks now asked through the missing list
-- (marked 0323) so "passes" and "who is missing what" can never disagree.
create or replace function public._classroom_signoff_auto_ok(p_team_id uuid, p_item jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $f$
begin
	if p_item->>'check' in ('plan-owners', 'roles-owned', 'plan-balanced') then
		return public._classroom_signoff_plan_check(p_team_id, p_item->>'check');
	end if;
	if p_item->>'check' in ('blocks-complete', 'assignment-complete') then
		return jsonb_array_length(public._classroom_signoff_missing(p_team_id, p_item)) = 0;
	end if;
	return true;
end;
$f$;

-- THE DATE A SEEDED TASK TAKES FROM ITS POST: the earliest checkpoint whose
-- checklist names the box, else the earliest pacing step holding its module,
-- else the earliest checkpoint that checks the whole post, else the post's due
-- date; never after the post's due date. Null when the post gives none.
create or replace function public._classroom_team_seed_due(
	p_item_id uuid,
	p_manifest jsonb,
	p_module jsonb,
	p_block_id text,
	p_due_at timestamptz
)
returns date
language sql
stable
security definer
set search_path = ''
as $f$
	with cap as (select (p_due_at at time zone 'America/Los_Angeles')::date as day),
	named as (
		select min(c.due_on) as day
		from public.classroom_signoff_checkpoints c, jsonb_array_elements(c.items) i
		where c.item_id = p_item_id and c.due_on is not null
			and i->>'check' = 'blocks-complete' and jsonb_typeof(i->'blocks') = 'array'
			and exists (select 1 from jsonb_array_elements_text(i->'blocks') b where b = p_block_id)
	),
	step as (
		select min(public._calendar_try_date(s->>'day')) as day
		from jsonb_array_elements(public._classroom_item_pacing(p_item_id)) s
		where jsonb_typeof(s->'modules') = 'array'
			and exists (select 1 from jsonb_array_elements_text(s->'modules') m where m = p_module->>'id')
	),
	whole as (
		select min(c.due_on) as day
		from public.classroom_signoff_checkpoints c, jsonb_array_elements(c.items) i
		where c.item_id = p_item_id and c.due_on is not null and i->>'check' = 'assignment-complete'
	),
	pick as (
		select coalesce((select day from named), (select day from step), (select day from whole), (select day from cap)) as day
	)
	select case when cap.day is not null and pick.day > cap.day then cap.day else pick.day end
	from cap, pick;
$f$;

-- THE SHARE (0303's), allowing a team smaller than its roles (marked 0323).
-- Each member's EXPECTED share is an even share of the total; on a team with
-- fewer members than roles somebody must own two roles, so it is their own
-- roles' points plus an even share of everything else. Balanced is every
-- member inside 0.75 to 1.25 of their expected share, with nothing unowned.
create or replace function public._classroom_team_balance(p_team_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	with plan as (select p.id from public.classroom_team_plans p where p.team_id = p_team_id),
	members as (
		select m.student_email from public.classroom_team_members m where m.team_id = p_team_id
	),
	owned as (
		select public._classroom_team_task_owner(p_team_id, t) as owner, t.points,
			(t.kind = 'seed' and t.role_id is not null) as role_task
		from public.classroom_team_tasks t, plan
		where t.plan_id = plan.id and t.removed_at is null and t.points > 0
	),
	per as (
		select mb.student_email, coalesce(sum(o.points), 0) as pts,
			coalesce(sum(o.points) filter (where o.role_task), 0) as role_pts
		from members mb left join owned o on o.owner = mb.student_email
		group by mb.student_email
	),
	totals as (
		select (select coalesce(sum(points), 0) from owned) as total,
			(select count(*) from members) as n,
			(select coalesce(sum(role_pts), 0) from per) as role_owned,
			jsonb_array_length(public._classroom_team_roles(p_team_id)) as roles
	),
	rule as (select totals.*, (totals.n > 0 and totals.roles > totals.n) as small from totals),
	expect as (
		select per.*, case when rule.n = 0 then 0
			when rule.small then per.role_pts + (rule.total - rule.role_owned)::numeric / rule.n
			else rule.total::numeric / rule.n end as expected
		from per, rule
	)
	select jsonb_build_object(
		'total', rule.total,
		'unowned', (select coalesce(sum(points), 0) from owned where owner is null),
		'even', case when rule.n > 0 then round(rule.total::numeric / rule.n, 2) else 0 end,
		'rule', case when rule.small then 'roles' else 'even' end,
		'members', coalesce((select jsonb_agg(jsonb_build_object(
			'key', public._classroom_member_key(p_team_id, e.student_email), 'points', e.pts,
			'expected', round(e.expected, 2)) order by e.student_email)
			from expect e), '[]'::jsonb),
		'balanced', rule.n > 0 and rule.total > 0
			and not exists (select 1 from owned where owner is null)
			and not exists (
				select 1 from expect e
				where e.pts < 0.75 * e.expected or e.pts > 1.25 * e.expected)
	)
	from rule;
$f$;

revoke all on function public._classroom_team_block_done(uuid, uuid, jsonb, text, text) from public, anon, authenticated;
revoke all on function public._classroom_signoff_missing(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._classroom_signoff_auto_ok(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._classroom_team_seed_due(uuid, jsonb, jsonb, text, timestamptz) from public, anon, authenticated;
revoke all on function public._classroom_team_balance(uuid) from public, anon, authenticated;

create or replace function public._classroom_team_seed_tasks(p_team_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_plan uuid := public._classroom_team_plan_id(p_team_id);
	v_item record;
	v_mod jsonb;
	v_blk jsonb;
	v_counted jsonb;
	v_n integer;
	v_i integer;
	v_pts integer;
	v_machine text;
	v_title text;
	v_member text;
	v_due date;
begin
	-- 0323: the checkpoints are stored first, so a task can take its date from one.
	perform public._classroom_signoff_seed(p_team_id);
	for v_item in select * from public._classroom_team_items(p_team_id) loop
		for v_mod in
			select m from jsonb_array_elements(
				case when jsonb_typeof(v_item.manifest->'modules') = 'array' then v_item.manifest->'modules' else '[]'::jsonb end) m
		loop
			select coalesce(jsonb_agg(b order by o), '[]'::jsonb) into v_counted
			from jsonb_array_elements(case when jsonb_typeof(v_mod->'blocks') = 'array' then v_mod->'blocks' else '[]'::jsonb end)
				with ordinality as x(b, o)
			where (x.b->'optional') is distinct from 'true'::jsonb;
			v_n := jsonb_array_length(v_counted);
			continue when v_n = 0;
			v_i := 0;
			for v_blk in select b from jsonb_array_elements(v_counted) b loop
				v_i := v_i + 1;
				if jsonb_typeof(v_blk->'taskPoints') = 'number'
					and (v_blk->>'taskPoints')::numeric >= 0
					and (v_blk->>'taskPoints')::numeric = floor((v_blk->>'taskPoints')::numeric) then
					v_pts := least((v_blk->>'taskPoints')::integer, 10000);
				else
					v_pts := coalesce((v_mod->>'points')::integer, 0) / v_n
						+ case when v_i <= coalesce((v_mod->>'points')::integer, 0) % v_n then 1 else 0 end;
				end if;
				select t.id into v_machine from public.classroom_machine_tags t
				where t.active and t.id = v_blk->>'machine';
				-- 0323: the date the post gives this box.
				v_due := public._classroom_team_seed_due(v_item.item_id, v_item.manifest, v_mod, v_blk->>'id', v_item.due_at);
				v_title := left(btrim(coalesce(nullif(btrim(v_blk->>'task'), ''), nullif(btrim(v_blk->>'prompt'), ''),
					v_blk->>'field', v_blk->>'id')), 120);
				if v_mod->>'audience' = 'individual' or v_mod->>'audience' is null then
					for v_member in select m.student_email from public.classroom_team_members m where m.team_id = p_team_id loop
						insert into public.classroom_team_tasks (plan_id, kind, item_id, block_id, member_email, title,
							owner_email, due_on, points, machine, created_by)
						values (v_plan, 'seed', v_item.item_id, v_blk->>'id', v_member, v_title,
							v_member, v_due, v_pts, v_machine, 'system')
						on conflict (plan_id, item_id, block_id, member_email) where kind = 'seed' do nothing;
					end loop;
				else
					insert into public.classroom_team_tasks (plan_id, kind, item_id, block_id, role_id, title,
						due_on, points, machine, created_by)
					values (v_plan, 'seed', v_item.item_id, v_blk->>'id',
						case when v_mod->>'audience' = 'role' then v_mod->>'role' end,
						v_title, v_due, v_pts, v_machine, 'system')
					on conflict (plan_id, item_id, block_id, member_email) where kind = 'seed' do nothing;
				end if;
			end loop;
		end loop;
	end loop;
	-- 0323: a seeded task stored before this had no date; it takes the post's.
	-- Only a task with no date is touched, so nothing a team set is changed.
	update public.classroom_team_tasks t
	set due_on = public._classroom_team_seed_due(t.item_id, h.manifest,
		public._classroom_html_block_module(h.manifest, t.block_id), t.block_id, i.due_at)
	from public.classroom_html_assignments h, public.classroom_items i
	where t.plan_id = v_plan and t.kind = 'seed' and t.due_on is null and t.removed_at is null
		and h.item_id = t.item_id and i.id = t.item_id
		and public._classroom_team_seed_due(t.item_id, h.manifest,
			public._classroom_html_block_module(h.manifest, t.block_id), t.block_id, i.due_at) is not null;
end;
$f$;


revoke all on function public._classroom_team_seed_tasks(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Deciding a sign-off: one write, three ways in.
-- ---------------------------------------------------------------------------

-- THE DECISION'S WRITES, 0304's approve and send back moved here unchanged
-- apart from the note (marked 0323), so the queue's decide and the teams
-- panel's decide write exactly the same rows. Private; both callers have
-- already checked who may decide and which items failed.
create or replace function public._classroom_signoff_close(
	p_req public.classroom_signoff_requests,
	p_cp jsonb,
	p_failed jsonb,
	p_results jsonb,
	p_approve boolean,
	p_note text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_me text := public.current_user_email();
	v_plan uuid;
	v_section uuid := public._classroom_team_section(p_req.team_id);
	v_due date;
	v_note text;
	v_by text;
begin
	v_by := coalesce((select nullif(btrim(p.full_name), '') from public.profiles p where p.id = auth.uid()), split_part(v_me, '@', 1));
	if p_approve then
		update public.classroom_signoff_requests
		set status = 'approved', decided_by = v_me, decided_at = now(), results = p_results,
			note = nullif(left(btrim(coalesce(p_note, '')), 2000), '')
		where id = p_req.id;
		-- THE 0086 APPROVAL, one row per member, on the post that declared the checkpoint.
		insert into public.classroom_module_approvals (item_id, student_email, module_id, approved_by)
		select (p_cp->>'anchor')::uuid, m.student_email, 'signoff-' || p_req.checkpoint_key, v_me
		from public.classroom_team_members m where m.team_id = p_req.team_id
		on conflict (item_id, student_email, module_id) do update
			set approved_by = excluded.approved_by, approved_at = now();
		insert into public.classroom_team_log (team_id, kind, actor_email, after, note)
		values (p_req.team_id, 'signoff-approved', v_me,
			jsonb_build_object('checkpoint', p_req.checkpoint_key, 'by', v_by, 'at', now(),
				'over', (select jsonb_agg(f->>'id') from jsonb_array_elements(p_failed) f)),
			left((p_cp->>'title') || ' approved by ' || v_by
				|| coalesce('. ' || nullif(btrim(coalesce(p_note, '')), ''), ''), 500));
	else
		v_note := (select string_agg(f->>'text', '; ' order by ord) from jsonb_array_elements(p_failed) with ordinality as x(f, ord));
		v_note := concat_ws('. ', v_note, nullif(btrim(coalesce(p_note, '')), ''));
		update public.classroom_signoff_requests
		set status = 'sent_back', decided_by = v_me, decided_at = now(), results = p_results,
			note = left(coalesce(nullif(v_note, ''), 'Sent back'), 2000)
		where id = p_req.id;
		v_plan := public._classroom_team_plan_id(p_req.team_id);
		v_due := public._classroom_next_school_day(public._classroom_school_today());
		insert into public.classroom_team_tasks (plan_id, kind, role_id, title, owner_email, due_on, source_note,
			checkpoint_key, created_by)
		select v_plan, 'sendback', null, left('Fix: ' || (f->>'text'), 120),
			case when f->>'role' is not null then public._classroom_team_role_owner(p_req.team_id, f->>'role') end,
			v_due, left((p_cp->>'title') || ' sent back by ' || v_by, 300), p_req.checkpoint_key, v_me
		from jsonb_array_elements(p_failed) f;
		insert into public.classroom_team_log (team_id, kind, actor_email, after, note)
		values (p_req.team_id, 'signoff-sent-back', v_me,
			jsonb_build_object('checkpoint', p_req.checkpoint_key, 'failed', (select jsonb_agg(f->>'id') from jsonb_array_elements(p_failed) f)),
			left(coalesce(v_note, ''), 500));
	end if;
	perform public._classroom_live_notice('team-' || p_req.team_id::text, 'team-doc');
	perform public._classroom_live_notice(v_section::text, 'signoffs');
	return jsonb_build_object('ok', true, 'status', case when p_approve then 'approved' else 'sent_back' end,
		'tasks', case when p_approve then 0 else jsonb_array_length(p_failed) end);
end;
$f$;

-- The items of a checkpoint that fail: auto from the database, tap from the
-- instructor's results.
create or replace function public._classroom_signoff_failed(p_team_id uuid, p_cp jsonb, p_results jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce(jsonb_agg(i order by ord), '[]'::jsonb)
	from jsonb_array_elements(coalesce(p_cp->'items', '[]'::jsonb)) with ordinality as x(i, ord)
	where not case when i->>'kind' = 'auto' then public._classroom_signoff_auto_ok(p_team_id, i)
		else coalesce((p_results->>(i->>'id'))::boolean, false) end;
$f$;

-- 0304's decide for the queue, through the one write (marked 0323). Approve
-- still needs every item to pass; approving over a failed item is the teams
-- panel's decide below, with a note.
create or replace function public.classroom_signoff_decide(p_request_id uuid, p_results jsonb, p_approve boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_req public.classroom_signoff_requests;
	v_cp jsonb;
	v_failed jsonb;
begin
	select * into v_req from public.classroom_signoff_requests where id = p_request_id for update;
	if v_req.id is null or not public._classroom_signoff_may_decide(v_req) then
		raise exception 'That request does not exist.';
	end if;
	if v_req.status <> 'open' then
		return jsonb_build_object('ok', false, 'reason', 'decided', 'status', v_req.status);
	end if;
	if p_results is not null and jsonb_typeof(p_results) <> 'object' then
		raise exception 'The results must be an object of item ids.';
	end if;
	select c into v_cp from jsonb_array_elements(public._classroom_team_checkpoints(v_req.team_id)) c
	where c->>'key' = v_req.checkpoint_key;
	v_failed := public._classroom_signoff_failed(v_req.team_id, v_cp, p_results);
	if p_approve and jsonb_array_length(v_failed) > 0 then
		return jsonb_build_object('ok', false, 'reason', 'items_failed',
			'items', (select jsonb_agg(f->>'id') from jsonb_array_elements(v_failed) f));
	end if;
	return public._classroom_signoff_close(v_req, v_cp, v_failed, p_results, p_approve, null);
end;
$f$;

-- DECIDE ONE TEAM'S CHECKPOINT FROM THE TEAMS PANEL (87b6bd95, f10cfa95): a
-- manager of the team's class, and Mr. Pina alone for an owner-only checkpoint.
-- With no open request one is opened in the instructor's name. Approving over
-- a failed item (an empty box, a tap marked fail) needs a note, which is kept
-- with the decision and in the team's change log; each missing student's own
-- grade still reflects their own empty box.
create or replace function public.classroom_signoff_teacher_decide(
	p_team_id uuid,
	p_checkpoint_key text,
	p_results jsonb,
	p_approve boolean,
	p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_me text := public.current_user_email();
	v_section uuid := public._classroom_team_section(p_team_id);
	v_cp jsonb;
	v_req public.classroom_signoff_requests;
	v_failed jsonb;
	v_owner_only boolean;
	v_note text := nullif(left(btrim(coalesce(p_note, '')), 1500), '');
begin
	if (select auth.uid()) is null or v_section is null
		or not coalesce(public.classroom_manages_section(v_section), false) then
		raise exception 'That team does not exist.';
	end if;
	if p_results is not null and jsonb_typeof(p_results) <> 'object' then
		raise exception 'The results must be an object of item ids.';
	end if;
	perform public._classroom_team_seed_tasks(p_team_id);
	select c into v_cp from jsonb_array_elements(public._classroom_team_checkpoints(p_team_id)) c
	where c->>'key' = p_checkpoint_key;
	if v_cp is null then
		return jsonb_build_object('ok', false, 'reason', 'unknown_checkpoint');
	end if;
	if public._classroom_signoff_state(p_team_id, p_checkpoint_key) = 'approved' then
		return jsonb_build_object('ok', false, 'reason', 'approved');
	end if;
	v_owner_only := exists (select 1 from jsonb_array_elements(v_cp->'items') i where (i->'ownerOnly') = 'true'::jsonb);
	if v_owner_only and not public.is_owner() then
		return jsonb_build_object('ok', false, 'reason', 'owner_only');
	end if;
	v_failed := public._classroom_signoff_failed(p_team_id, v_cp, p_results);
	if p_approve and jsonb_array_length(v_failed) > 0 and v_note is null then
		return jsonb_build_object('ok', false, 'reason', 'note_needed',
			'items', (select jsonb_agg(f->>'id') from jsonb_array_elements(v_failed) f));
	end if;
	select * into v_req from public.classroom_signoff_requests r
	where r.team_id = p_team_id and r.checkpoint_key = p_checkpoint_key and r.status = 'open'
	for update;
	if v_req.id is null then
		insert into public.classroom_signoff_requests (team_id, checkpoint_key, requested_by, owner_only)
		values (p_team_id, p_checkpoint_key, v_me, v_owner_only)
		on conflict (team_id, checkpoint_key) where status = 'open' do nothing;
		select * into v_req from public.classroom_signoff_requests r
		where r.team_id = p_team_id and r.checkpoint_key = p_checkpoint_key and r.status = 'open'
		for update;
	end if;
	return public._classroom_signoff_close(v_req, v_cp, v_failed, p_results, p_approve,
		case when p_approve and jsonb_array_length(v_failed) > 0 then
			'Approved over: ' || (select string_agg(f->>'text', '; ' order by ord)
				from jsonb_array_elements(v_failed) with ordinality as x(f, ord)) || '. ' || v_note
		else v_note end);
end;
$f$;

-- HOW MANY SIGN-OFFS WAIT FOR THE CALLER, and since when: the number beside
-- Sign-offs in the classroom menu and on the home page.
create or replace function public.classroom_signoff_waiting()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	select jsonb_build_object('ok', true, 'count', count(*), 'oldest', min(r.requested_at))
	from public.classroom_signoff_requests r
	where (select auth.uid()) is not null and r.status = 'open' and public._classroom_signoff_may_decide(r);
$f$;

-- THE TEAMS PANEL ON A TEAM POST (87b6bd95, d23bc63d.1): for every class of
-- the post the caller manages, every team of the post's own draw with its
-- members, who owns each role, how far each part of the post is, who checked
-- in today, its blocked tasks, its phases, and every checkpoint with its
-- state, its open request and its checklist (each auto item with what the
-- site found and who is missing what).
create or replace function public.classroom_item_signoff_board(p_item_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_manifest jsonb := public._classroom_html_team_manifest(p_item_id);
	v_today date := public._classroom_school_today();
	v_sections jsonb := '[]'::jsonb;
	v_section record;
	v_set uuid;
	v_team record;
	v_teams jsonb;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if v_manifest is null then
		return jsonb_build_object('ok', true, 'team_assignment', false, 'sections', '[]'::jsonb);
	end if;
	for v_section in
		select s.id, s.label from public.classroom_postings pg
		join public.classroom_sections s on s.id = pg.section_id
		where pg.item_id = p_item_id and public.classroom_manages_section(s.id)
		order by s.label
	loop
		v_set := public._classroom_item_team_set_any(p_item_id, v_section.id);
		v_teams := '[]'::jsonb;
		for v_team in
			select t.id, t.team_number, coalesce(nullif(btrim(t.name), ''), 'Team ' || t.team_number) as name
			from public.classroom_teams t where t.team_set_id = v_set order by t.team_number
		loop
			perform public._classroom_team_seed_tasks(v_team.id);
			v_teams := v_teams || jsonb_build_array(jsonb_build_object(
				'id', v_team.id, 'number', v_team.team_number, 'name', v_team.name,
				'members', coalesce((
					select jsonb_agg(jsonb_build_object(
						'name', public._classroom_team_display_name(v_team.id, m.student_email),
						'checked_in', exists (select 1 from public.classroom_team_checkins c
							where c.team_id = v_team.id and c.student_email = m.student_email and c.school_day = v_today),
						'done', (select count(*) from jsonb_array_elements(v_manifest->'modules') mo, jsonb_array_elements(mo->'blocks') b
							where coalesce(mo->>'audience', 'individual') = 'individual' and (b->'optional') is distinct from 'true'::jsonb
								and public._classroom_team_block_done(v_team.id, p_item_id, v_manifest, b->>'id', m.student_email)),
						'total', (select count(*) from jsonb_array_elements(v_manifest->'modules') mo, jsonb_array_elements(mo->'blocks') b
							where coalesce(mo->>'audience', 'individual') = 'individual' and (b->'optional') is distinct from 'true'::jsonb)
					) order by e.display_name, m.student_email)
					from public.classroom_team_members m
					left join public.classroom_enrollments e on e.section_id = v_section.id and e.student_email = m.student_email
					where m.team_id = v_team.id and m.student_email not in (select public._idea_test_emails())
				), '[]'::jsonb),
				-- Each shared part of the post (a team module, a role module): its
				-- owner and its boxes done of its counted boxes.
				'parts', coalesce((
					select jsonb_agg(jsonb_build_object(
						'id', mo->>'id', 'title', mo->>'title', 'audience', mo->>'audience', 'role', mo->>'role',
						'owner', case when mo->>'audience' = 'role' then nullif(public._classroom_team_display_name(v_team.id,
							public._classroom_team_role_owner(v_team.id, mo->>'role')), '') end,
						'opens_after', mo->>'opensAfter',
						'done', (select count(*) from jsonb_array_elements(mo->'blocks') b
							where (b->'optional') is distinct from 'true'::jsonb
								and public._classroom_team_block_done(v_team.id, p_item_id, v_manifest, b->>'id', '')),
						'total', (select count(*) from jsonb_array_elements(mo->'blocks') b
							where (b->'optional') is distinct from 'true'::jsonb)
					) order by mord)
					from jsonb_array_elements(v_manifest->'modules') with ordinality as x(mo, mord)
					where mo->>'audience' in ('team', 'role')
				), '[]'::jsonb),
				'blocked', coalesce((
					select jsonb_agg(jsonb_build_object('title', t.title, 'reason', t.blocked_reason,
						'owner', nullif(public._classroom_team_display_name(v_team.id, public._classroom_team_task_owner(v_team.id, t)), ''))
						order by t.blocked_at)
					from public.classroom_team_plans p join public.classroom_team_tasks t on t.plan_id = p.id
					where p.team_id = v_team.id and t.removed_at is null and t.blocked_reason is not null
				), '[]'::jsonb),
				'phases', public._classroom_team_phases(p_item_id, v_team.id),
				'checkpoints', coalesce((
					select jsonb_agg(jsonb_build_object(
						'key', c->>'key', 'title', c->>'title', 'date', c->>'date', 'gate', c->>'gate',
						'state', public._classroom_signoff_state(v_team.id, c->>'key'),
						'owner_only', exists (select 1 from jsonb_array_elements(c->'items') oi where (oi->'ownerOnly') = 'true'::jsonb),
						'request', (select jsonb_build_object('id', r.id, 'at', r.requested_at,
								'by', nullif(public._classroom_team_display_name(v_team.id, r.requested_by), ''))
							from public.classroom_signoff_requests r
							where r.team_id = v_team.id and r.checkpoint_key = c->>'key' and r.status = 'open'),
						'decision', (select jsonb_build_object('status', r.status, 'at', r.decided_at, 'note', r.note)
							from public.classroom_signoff_requests r
							where r.team_id = v_team.id and r.checkpoint_key = c->>'key' and r.status <> 'open'
							order by r.decided_at desc limit 1),
						'items', coalesce((
							select jsonb_agg(i || jsonb_build_object(
								'auto_ok', case when i->>'kind' = 'auto' then public._classroom_signoff_auto_ok(v_team.id, i) end,
								'missing', case when i->>'check' in ('blocks-complete', 'assignment-complete')
									then public._classroom_signoff_missing(v_team.id, i) end,
								'owner', case when i->>'role' is null then null else nullif(public._classroom_team_display_name(v_team.id,
									public._classroom_team_role_owner(v_team.id, i->>'role')), '') end
							) order by iord)
							from jsonb_array_elements(c->'items') with ordinality as y(i, iord)
						), '[]'::jsonb)
					) order by cord)
					from jsonb_array_elements(public._classroom_team_checkpoints(v_team.id)) with ordinality as z(c, cord)
				), '[]'::jsonb)
			));
		end loop;
		v_sections := v_sections || jsonb_build_array(jsonb_build_object(
			'section_id', v_section.id, 'label', v_section.label, 'team_set_id', v_set,
			'set_label', (select ts.label from public.classroom_team_sets ts where ts.id = v_set),
			'teams', v_teams));
	end loop;
	return jsonb_build_object('ok', true, 'team_assignment', true, 'today', v_today,
		'is_owner', public.is_owner(), 'sections', v_sections);
end;
$f$;

revoke all on function public._classroom_signoff_close(public.classroom_signoff_requests, jsonb, jsonb, jsonb, boolean, text) from public, anon, authenticated;
revoke all on function public._classroom_signoff_failed(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.classroom_signoff_decide(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.classroom_signoff_decide(uuid, jsonb, boolean) to authenticated;
revoke all on function public.classroom_signoff_teacher_decide(uuid, text, jsonb, boolean, text) from public, anon, authenticated;
grant execute on function public.classroom_signoff_teacher_decide(uuid, text, jsonb, boolean, text) to authenticated;
revoke all on function public.classroom_signoff_waiting() from public, anon, authenticated;
grant execute on function public.classroom_signoff_waiting() to authenticated;
revoke all on function public.classroom_item_signoff_board(uuid) from public, anon, authenticated;
grant execute on function public.classroom_item_signoff_board(uuid) to authenticated;

create or replace function public.classroom_team_plan(p_section_id uuid, p_team_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_me text := public.current_user_email();
	v_set uuid := public._classroom_section_team_set(p_section_id);
	v_team uuid := p_team_id;
	v_today date := public._classroom_school_today();
begin
	if (select auth.uid()) is null or coalesce(v_me, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	if v_team is null then
		if v_set is null then
			return jsonb_build_object('ok', true, 'team', null, 'reason', 'not_posted');
		end if;
		select m.team_id into v_team from public.classroom_team_members m
		where m.team_set_id = v_set and m.student_email = v_me;
		if v_team is null then
			return jsonb_build_object('ok', true, 'team', null, 'reason', 'no_team');
		end if;
	end if;
	if not public._classroom_team_plan_access(v_team)
		or public._classroom_team_section(v_team) <> p_section_id then
		raise exception 'That team does not exist.';
	end if;
	perform public._classroom_team_seed_tasks(v_team);
	perform public._classroom_signoff_seed(v_team);
	return (
		with team as (
			select t.id, t.team_number, s.section_id, s.posted_at, s.created_at as drawn_at,
				coalesce(nullif(btrim(t.name), ''), 'Team ' || t.team_number) as name
			from public.classroom_teams t join public.classroom_team_sets s on s.id = t.team_set_id
			where t.id = v_team
		), plan as (
			select p.id from public.classroom_team_plans p where p.team_id = v_team
		)
		select jsonb_build_object(
			'ok', true,
			'today', v_today,
			'team', (select jsonb_build_object('id', team.id, 'name', team.name, 'number', team.team_number,
				'section_id', team.section_id, 'drawn_on', (team.drawn_at at time zone 'America/Los_Angeles')::date) from team),
			'me', public._classroom_member_key(v_team, v_me),
			'manager', public.classroom_manages_section(p_section_id),
			'members', coalesce((
				select jsonb_agg(jsonb_build_object(
					'key', public._classroom_member_key(v_team, m.student_email),
					'name', public._classroom_first_name(team.section_id, m.student_email),
					'me', m.student_email = v_me
				) order by (m.student_email = v_me) desc, e.display_name, m.student_email)
				from team join public.classroom_team_members m on m.team_id = team.id
				left join public.classroom_enrollments e on e.section_id = team.section_id and e.student_email = m.student_email
				where m.student_email = v_me or m.student_email not in (select public._idea_test_emails())
			), '[]'::jsonb),
			'roles', coalesce((
				select jsonb_agg(jsonb_build_object(
					'id', r.role->>'id', 'title', r.role->>'title',
					'owner', case when o.owner is null then null else public._classroom_member_key(v_team, o.owner) end
				) order by r.ord)
				from jsonb_array_elements(public._classroom_team_roles(v_team)) with ordinality as r(role, ord)
				left join lateral (select public._classroom_team_role_owner(v_team, r.role->>'id') as owner) o on true
			), '[]'::jsonb),
			'items', coalesce((
				select jsonb_agg(jsonb_build_object('id', ti.item_id, 'title', i.title, 'due_at', ti.due_at)
					order by ti.due_at nulls last, ti.created_at)
				from public._classroom_team_items(v_team) ti join public.classroom_items i on i.id = ti.item_id
			), '[]'::jsonb),
			'tasks', coalesce((
				select jsonb_agg(jsonb_build_object(
					'id', t.id, 'kind', t.kind, 'title', t.title,
					'item_id', t.item_id, 'block_id', t.block_id, 'role_id', t.role_id,
					'block', case when t.item_id is null then null else
						public._classroom_html_block(h.manifest, t.block_id) end,
					'owner', case when public._classroom_team_task_owner(v_team, t) is null then null
						else public._classroom_member_key(v_team, public._classroom_team_task_owner(v_team, t)) end,
					'fixed_owner', t.kind = 'seed' and (t.role_id is not null or t.member_email <> ''),
					'due_on', t.due_on, 'cap', public._classroom_team_task_cap(v_team, t),
					'points', t.points, 'machine', t.machine, 'depends_on', t.depends_on,
					'blocked', t.blocked_reason, 'note', t.source_note,
					-- The linked answer, the team's for a shared block and the
					-- member's own for an individual one, so the page can apply
					-- the one completion rule. A picture counts by its presence.
					'value', case
						when t.item_id is null then null
						when t.member_email <> '' then (select r.value from public.classroom_responses r
							where r.item_id = t.item_id and r.block_id = t.block_id and r.student_email = t.member_email)
						else (select a.value from public.classroom_team_answers a
							where a.team_id = v_team and a.item_id = t.item_id and a.block_id = t.block_id)
					end,
					'has_image', case when t.item_id is null then false else exists (
						select 1 from public.classroom_submission_files f
						join public.classroom_submissions s on s.id = f.submission_id
						where s.item_id = t.item_id and f.block_id = t.block_id
							and (case when t.member_email <> '' then s.student_email = t.member_email
								else s.student_email in (select m.student_email from public.classroom_team_members m where m.team_id = v_team) end)
					) end,
					-- 0304: a send-back task its checkpoint has since approved.
					'cleared', t.kind = 'sendback' and exists (
						select 1 from public.classroom_signoff_requests r
						where r.team_id = v_team and r.checkpoint_key = t.checkpoint_key
							and r.status = 'approved' and r.decided_at > t.created_at),
					'on_it', coalesce((
						select jsonb_agg(public._classroom_member_key(v_team, c.student_email))
						from public.classroom_team_checkins c
						where c.team_id = v_team and c.school_day = v_today and t.id = any (c.task_ids)
					), '[]'::jsonb)
				) order by t.due_on nulls last, t.created_at, t.title)
				from plan join public.classroom_team_tasks t on t.plan_id = plan.id
				left join public.classroom_html_assignments h on h.item_id = t.item_id
				where t.removed_at is null
			), '[]'::jsonb),
			'checked_in', coalesce((
				select jsonb_agg(public._classroom_member_key(v_team, c.student_email))
				from public.classroom_team_checkins c where c.team_id = v_team and c.school_day = v_today
			), '[]'::jsonb),
			'balance', public._classroom_team_balance(v_team),
			-- 0304: the team's checkpoints with their state, and whether owners are fixed.
			'checkpoints', coalesce((
				select jsonb_agg(jsonb_build_object(
					'key', c->>'key', 'title', c->>'title', 'date', c->>'date', 'gate', c->>'gate',
					'state', public._classroom_signoff_state(v_team, c->>'key'),
					'items', c->'items',
					'auto', (select coalesce(jsonb_object_agg(i->>'id', public._classroom_signoff_auto_ok(v_team, i)), '{}'::jsonb)
						from jsonb_array_elements(c->'items') i where i->>'kind' = 'auto'),
					-- 0323: who is missing what, for each auto item that names boxes.
					'missing', (select coalesce(jsonb_object_agg(i->>'id', public._classroom_signoff_missing(v_team, i)), '{}'::jsonb)
						from jsonb_array_elements(c->'items') i
						where i->>'kind' = 'auto' and i->>'check' in ('blocks-complete', 'assignment-complete')),
					'decision', (select jsonb_build_object('status', r.status, 'at', r.decided_at, 'note', r.note,
							'by', coalesce((select nullif(btrim(p.full_name), '') from public.profiles p
								where lower(p.email) = r.decided_by limit 1), split_part(r.decided_by, '@', 1)))
						from public.classroom_signoff_requests r
						where r.team_id = v_team and r.checkpoint_key = c->>'key' and r.status <> 'open'
						order by r.decided_at desc limit 1)
				) order by ord)
				from jsonb_array_elements(public._classroom_team_checkpoints(v_team)) with ordinality as x(c, ord)
			), '[]'::jsonb),
			'owners_fixed', public._classroom_team_owners_fixed(v_team),
			'machines', coalesce((select jsonb_agg(jsonb_build_object('id', mt.id, 'label', mt.label) order by mt.sort)
				from public.classroom_machine_tags mt where mt.active), '[]'::jsonb),
			'no_school', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'label', d.label) order by d.day)
				from public.classroom_no_school_days d), '[]'::jsonb)
		)
	);
end;
$f$;


revoke all on function public.classroom_team_plan(uuid, uuid) from public, anon, authenticated;
grant execute on function public.classroom_team_plan(uuid, uuid) to authenticated;

create or replace function public.classroom_signoff_queue()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_out jsonb := '[]'::jsonb;
	v_req public.classroom_signoff_requests;
	v_cp jsonb;
	v_section uuid;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	for v_req in
		select * from public.classroom_signoff_requests r where r.status = 'open' order by r.requested_at, r.id
	loop
		continue when not public._classroom_signoff_may_decide(v_req);
		perform public._classroom_team_seed_tasks(v_req.team_id);
		select c into v_cp from jsonb_array_elements(public._classroom_team_checkpoints(v_req.team_id)) c
		where c->>'key' = v_req.checkpoint_key;
		v_section := public._classroom_team_section(v_req.team_id);
		v_out := v_out || jsonb_build_array(jsonb_build_object(
			'id', v_req.id,
			'requested_at', v_req.requested_at,
			'requested_by', public._classroom_first_name(v_section, v_req.requested_by),
			'owner_only', v_req.owner_only,
			'section', (select jsonb_build_object('id', s.id, 'label', s.label) from public.classroom_sections s where s.id = v_section),
			'team', (select jsonb_build_object('id', t.id, 'name', coalesce(nullif(btrim(t.name), ''), 'Team ' || t.team_number),
				'members', (select coalesce(jsonb_agg(public._classroom_first_name(v_section, m.student_email) order by m.student_email), '[]'::jsonb)
					from public.classroom_team_members m where m.team_id = t.id))
				from public.classroom_teams t where t.id = v_req.team_id),
			'checkpoint', jsonb_build_object('key', v_cp->>'key', 'title', v_cp->>'title', 'date', v_cp->>'date', 'gate', v_cp->>'gate'),
			'items', coalesce((
				select jsonb_agg(i || jsonb_build_object(
					'auto_ok', case when i->>'kind' = 'auto' then public._classroom_signoff_auto_ok(v_req.team_id, i) end,
					-- 0323: who is missing what.
					'missing', case when i->>'check' in ('blocks-complete', 'assignment-complete')
						then public._classroom_signoff_missing(v_req.team_id, i) end,
					'owner', case when i->>'role' is null then null else
						public._classroom_first_name(v_section, public._classroom_team_role_owner(v_req.team_id, i->>'role')) end
				) order by ord)
				from jsonb_array_elements(v_cp->'items') with ordinality as x(i, ord)
			), '[]'::jsonb)
		));
	end loop;
	return jsonb_build_object('ok', true, 'requests', v_out);
end;
$f$;


revoke all on function public.classroom_signoff_queue() from public, anon, authenticated;
grant execute on function public.classroom_signoff_queue() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Self-check and counts.
-- ---------------------------------------------------------------------------

do $check$
declare
	v_fn text;
begin
	foreach v_fn in array array[
		'public.classroom_team_set_uses(uuid)',
		'public.classroom_signoff_teacher_decide(uuid, text, jsonb, boolean, text)',
		'public.classroom_signoff_waiting()',
		'public.classroom_item_signoff_board(uuid)'
	] loop
		if has_function_privilege('anon', v_fn, 'execute') then
			raise exception '0323: % is executable by anon.', v_fn;
		end if;
	end loop;
	if has_function_privilege('authenticated', 'public._classroom_signoff_close(public.classroom_signoff_requests, jsonb, jsonb, jsonb, boolean, text)', 'execute')
		or has_function_privilege('authenticated', 'public._classroom_team_post_pin(uuid, uuid)', 'execute') then
		raise exception '0323: a private sign-off or pin function is executable by a client.';
	end if;
	raise notice '0323: % team posts pinned in all, % open sign-off requests, % seeded tasks still without a date (they take one on the next read).',
		(select count(*) from public.classroom_team_post_draws),
		(select count(*) from public.classroom_signoff_requests where status = 'open'),
		(select count(*) from public.classroom_team_tasks where kind = 'seed' and due_on is null and removed_at is null);
end
$check$;

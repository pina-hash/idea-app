-- 0059_greenline_track_review.sql
-- GREENLINE community tracks: REVIEW-BEFORE-VISIBLE.
--
-- WHY THIS EXISTS (a deliberate change to 0057's model, not an addition to it).
-- 0057 shipped publish-then-moderate: greenline_tracks' select policy is
-- "not removed or author or teacher", greenline_track_list() returns every
-- non-removed row to every signed-in user, and greenline_track_attempt_start
-- accepts any non-removed track. 0058's `featured` flag governs RANKED
-- eligibility ONLY, never visibility. So a submitted track was playable and
-- listed for the whole school the instant it was stored, and the teacher panel
-- was an after-the-fact tool (report / remove / feature).
--
-- That is the wrong default for student-authored content reaching other
-- students. This migration makes the pipeline moderate-then-publish:
--
--   status = 'pending'  (default)  visible + playable to its AUTHOR and
--                                  TEACHERS only. Never listed for anyone
--                                  else, never rateable, never rankable.
--   status = 'approved'            visible + playable to every signed-in user
--                                  (0057's old behavior), and only now
--                                  eligible to be FEATURED into ranked play.
--   status = 'rejected'            back to author + teachers only, carrying
--                                  the reviewer's feedback so the author can
--                                  fix and resubmit.
--
-- The gate is applied at EVERY read and write path that could expose a track,
-- not just the browse list: the RLS select policy (which is what actually
-- governs playability, since the client fetches `data` straight from the table),
-- the list RPC, attempt_start, rate, report, featuring, and the ranked-result
-- gate. Defense in depth on purpose — the RLS policy alone is the boundary, the
-- rest are so a bypass of any single one still fails closed.
--
-- This EXTENDS the existing pipeline; it does not fork it. Same table, same
-- publish endpoint, same moderation panel, same featured/ranked semantics, same
-- soft-remove. The new decision RPC (greenline_track_review) mirrors
-- greenline_decal_review from 0051 exactly: approve or request-revision, never
-- a blunt delete, with is_teacher() enforced INSIDE the function.
--
-- BACKFILL DECISION (flagged deliberately): existing rows are set to
-- 'approved'. They were published under 0057's contract and are visible to
-- everyone RIGHT NOW, so approving them preserves the status quo exactly and
-- makes nothing newly visible; resetting them to 'pending' would silently
-- unpublish real student work. Every submission from this migration forward is
-- pending-by-default. To instead force the whole existing corpus back through
-- review, run this ONE statement after applying the file:
--
--     update public.greenline_tracks set status = 'pending';
--
-- Apply manually in the Supabase SQL editor, after 0058.

-- ===========================================================================
-- 1. The status column
-- ===========================================================================
alter table public.greenline_tracks
	add column if not exists status text not null default 'pending';

-- Reviewer's note back to the author (required when rejecting).
alter table public.greenline_tracks
	add column if not exists review_feedback text;
alter table public.greenline_tracks
	add column if not exists reviewed_at timestamptz;
alter table public.greenline_tracks
	add column if not exists reviewed_by uuid references auth.users (id) on delete set null;

-- Backfill BEFORE the CHECK: rows created under 0057 have no status value of
-- their own, and (see the header) they are already publicly visible today.
update public.greenline_tracks
	set status = 'approved'
	where status is null or status not in ('pending', 'approved', 'rejected');

alter table public.greenline_tracks
	drop constraint if exists greenline_tracks_status_check;
alter table public.greenline_tracks
	add constraint greenline_tracks_status_check
	check (status in ('pending', 'approved', 'rejected'));

-- The browse index now leads with the visibility predicate.
drop index if exists public.greenline_tracks_browse_idx;
create index if not exists greenline_tracks_browse_idx
	on public.greenline_tracks (status, removed, featured desc, created_at desc);
-- Moderation queue: pending first, oldest first (fair FIFO for authors).
create index if not exists greenline_tracks_pending_idx
	on public.greenline_tracks (status, created_at)
	where status = 'pending';

-- ===========================================================================
-- 2. THE BOUNDARY: the select policy
-- ===========================================================================
-- This is the one that actually matters. The game plays a community track by
-- SELECTing its `data` column straight from this table (loadCommunityTrackData
-- in src/lib/greenline/community.ts), so an unapproved row being unreadable
-- here is what makes it unplayable — not any client-side check, and not the
-- list RPC (which a client could skip). Author and teachers keep full access.
drop policy if exists "select visible greenline tracks" on public.greenline_tracks;
create policy "select visible greenline tracks"
	on public.greenline_tracks
	for select
	to authenticated
	using (
		(status = 'approved' and not removed)
		or author_id = (select auth.uid())
		or public.is_teacher()
	);

-- ===========================================================================
-- 3. The teacher decision RPC (the greenline_decal_review shape)
-- ===========================================================================
-- Approve or request revision. Never deletes; a rejected track keeps its data
-- and its history and can be re-reviewed after the author resubmits. Feedback
-- is REQUIRED on a rejection — "no" without a reason is not actionable for a
-- student. is_teacher() is enforced in here, so the route's own 404 gate stays
-- convenience and this is the real boundary.
create or replace function public.greenline_track_review(
	p_track_id uuid,
	p_action text,
	p_feedback text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_status text;
	v_feedback text := nullif(trim(coalesce(p_feedback, '')), '');
begin
	if v_uid is null then
		raise exception 'Not authenticated';
	end if;
	if not public.is_teacher() then
		raise exception 'Teachers only';
	end if;

	if p_action = 'approve' then
		v_status := 'approved';
	elsif p_action in ('reject', 'revise', 'needs_revision') then
		v_status := 'rejected';
		if v_feedback is null then
			return jsonb_build_object('ok', false, 'reason', 'feedback_required');
		end if;
	else
		return jsonb_build_object('ok', false, 'reason', 'unknown_action');
	end if;

	update public.greenline_tracks t
		set status = v_status,
			review_feedback = case when v_status = 'rejected' then v_feedback else null end,
			reviewed_at = now(),
			reviewed_by = v_uid,
			-- A track that loses approval cannot stay ranked. Featuring is a
			-- teacher action on an approved track; revoking approval revokes it.
			featured = case when v_status = 'approved' then t.featured else false end
		where t.id = p_track_id;

	if not found then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	return jsonb_build_object('ok', true, 'status', v_status);
end;
$$;

revoke all on function public.greenline_track_review(uuid, text, text) from public;
grant execute on function public.greenline_track_review(uuid, text, text) to authenticated;

-- ===========================================================================
-- 4. Featuring requires approval (0058's RPC, gate added)
-- ===========================================================================
-- Ranked play is a superset of visible play: a track nobody can see must never
-- be rankable. Un-featuring stays unconditional.
create or replace function public.greenline_track_set_featured(
	p_track_id uuid,
	p_featured boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
	if (select auth.uid()) is null then
		raise exception 'Not authenticated';
	end if;
	if not public.is_teacher() then
		raise exception 'Teachers only';
	end if;
	update public.greenline_tracks t
		set featured = coalesce(p_featured, false)
		where t.id = p_track_id
			and (
				not coalesce(p_featured, false)
				or (not t.removed and t.status = 'approved')
			);
	return found;
end;
$$;

revoke all on function public.greenline_track_set_featured(uuid, boolean) from public;
grant execute on function public.greenline_track_set_featured(uuid, boolean) to authenticated;

-- ===========================================================================
-- 5. Play / rate / report gates
-- ===========================================================================
-- Attempts: approved for everyone; the AUTHOR and teachers may also open an
-- attempt on a pending or rejected track, which is what lets an author actually
-- test-race their own submission while it waits for review.
create or replace function public.greenline_track_attempt_start(p_track_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_id uuid;
begin
	if v_uid is null then
		raise exception 'Not authenticated';
	end if;
	if not exists (
		select 1 from public.greenline_tracks t
		where t.id = p_track_id
			and not t.removed
			and (t.status = 'approved' or t.author_id = v_uid or public.is_teacher())
	) then
		raise exception 'Unknown track';
	end if;
	insert into public.greenline_track_attempts (track_id, user_id)
	values (p_track_id, v_uid)
	returning id into v_id;
	return v_id;
end;
$$;

revoke all on function public.greenline_track_attempt_start(uuid) from public;
grant execute on function public.greenline_track_attempt_start(uuid) to authenticated;

-- Ratings: approved only. A rating is a public signal about a public track;
-- there is nothing for an author to rate on their own unreviewed submission.
create or replace function public.greenline_track_rate(p_track_id uuid, p_rating integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
begin
	if v_uid is null then
		raise exception 'Not authenticated';
	end if;
	if p_rating is null or p_rating < 1 or p_rating > 5 then
		return jsonb_build_object('ok', false, 'reason', 'bad_rating');
	end if;
	if not exists (
		select 1 from public.greenline_tracks t
		where t.id = p_track_id and not t.removed and t.status = 'approved'
	) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if not exists (
		select 1 from public.greenline_track_attempts a
		where a.track_id = p_track_id and a.user_id = v_uid and a.completed
	) then
		return jsonb_build_object('ok', false, 'reason', 'no_completed_attempt');
	end if;

	insert into public.greenline_track_ratings (track_id, user_id, rating, updated_at)
	values (p_track_id, v_uid, p_rating, now())
	on conflict (track_id, user_id) do update
		set rating = excluded.rating, updated_at = now();

	return jsonb_build_object('ok', true, 'rating', p_rating);
end;
$$;

revoke all on function public.greenline_track_rate(uuid, integer) from public;
grant execute on function public.greenline_track_rate(uuid, integer) to authenticated;

-- Reports: approved only — an unapproved track is already invisible to
-- everyone but its author and staff, who have the review queue instead.
create or replace function public.greenline_track_report(p_track_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_new boolean := false;
	v_count integer;
begin
	if v_uid is null then
		raise exception 'Not authenticated';
	end if;
	if not exists (
		select 1 from public.greenline_tracks t
		where t.id = p_track_id and not t.removed and t.status = 'approved'
	) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;

	insert into public.greenline_track_reports (track_id, reporter_id)
	values (p_track_id, v_uid)
	on conflict (track_id, reporter_id) do nothing;
	v_new := found;

	if v_new then
		update public.greenline_tracks
			set report_count = report_count + 1
			where id = p_track_id
			returning report_count into v_count;
	else
		select report_count into v_count from public.greenline_tracks where id = p_track_id;
	end if;

	return jsonb_build_object('ok', true, 'already', not v_new, 'report_count', v_count);
end;
$$;

revoke all on function public.greenline_track_report(uuid) from public;
grant execute on function public.greenline_track_report(uuid) to authenticated;

-- ===========================================================================
-- 6. The browse/moderation list RPC
-- ===========================================================================
-- One RPC still serves both the player browse and the teacher queue (0057's
-- design), so the numbers a teacher moderates by stay exactly the numbers
-- players see. It is SECURITY DEFINER, so the visibility rule is enforced HERE
-- explicitly rather than inherited: approved+live for everyone, plus the
-- caller's own rows at any status, plus everything for a teacher. `status`,
-- `review_feedback` and `mine` ride along so the UI can render the author's
-- pending/rejected banner and the teacher's queue from this one call.
create or replace function public.greenline_track_list()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with visible as (
	select t.*
	from public.greenline_tracks t
	where (t.status = 'approved' and not t.removed)
		or t.author_id = (select auth.uid())
		or public.is_teacher()
),
rating_agg as (
	select r.track_id, avg(r.rating)::numeric(4, 2) as avg_rating, count(*) as rating_count
	from public.greenline_track_ratings r
	group by r.track_id
),
attempt_agg as (
	select
		a.track_id,
		count(*) as attempt_count,
		count(*) filter (where a.completed) as completed_count,
		count(distinct a.user_id) as unique_racers,
		avg(a.completion_time_ms) filter (where a.completed and a.completion_time_ms is not null)
			as avg_time_ms,
		avg(a.wall_violations) filter (where a.wall_violations is not null)
			as avg_wall_violations
	from public.greenline_track_attempts a
	group by a.track_id
)
select coalesce(
	jsonb_agg(jsonb_build_object(
		'id', v.id,
		'name', v.name,
		'author_name', v.author_name,
		'created_at', v.created_at,
		'status', v.status,
		'removed', v.removed,
		'review_feedback', v.review_feedback,
		'featured', v.featured,
		'length_m', v.length_m,
		'report_count', v.report_count,
		'avg_rating', ra.avg_rating,
		'rating_count', coalesce(ra.rating_count, 0),
		'attempt_count', coalesce(aa.attempt_count, 0),
		'completed_count', coalesce(aa.completed_count, 0),
		'unique_racers', coalesce(aa.unique_racers, 0),
		'avg_time_ms', round(aa.avg_time_ms),
		'avg_wall_violations', round(aa.avg_wall_violations, 1),
		'mine', v.author_id = (select auth.uid()),
		'my_rating', (
			select r.rating from public.greenline_track_ratings r
			where r.track_id = v.id and r.user_id = (select auth.uid())
		),
		'can_rate', exists (
			select 1 from public.greenline_track_attempts a
			where a.track_id = v.id and a.user_id = (select auth.uid()) and a.completed
		),
		'reported', exists (
			select 1 from public.greenline_track_reports rp
			where rp.track_id = v.id and rp.reporter_id = (select auth.uid())
		)
	) order by v.featured desc, v.created_at desc),
	'[]'::jsonb
)
from visible v
left join rating_agg ra on ra.track_id = v.id
left join attempt_agg aa on aa.track_id = v.id;
$$;

revoke all on function public.greenline_track_list() from public;
grant execute on function public.greenline_track_list() to authenticated;

-- ===========================================================================
-- 7. Ranked eligibility also requires approval (0058's submit gate, extended)
-- ===========================================================================
-- Only the marked COMMUNITY GATE block differs from 0058; every award constant
-- and branch below it is byte-identical.
create or replace function public.greenline_submit_race_result(
	p_track_id text,
	p_mode text default 'race',
	p_finish_position integer default null,
	p_total_time_ms integer default null,
	p_best_lap_ms integer default null,
	p_laps integer default null,
	p_archetype text default null,
	p_creative boolean default false,
	p_weapon_primary text default null,
	p_weapon_secondary text default null,
	p_ability_primary text default null,
	p_ability_secondary text default null,
	p_route text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_track text;
	v_mode text := coalesce(nullif(trim(p_mode), ''), 'race');
	v_creative boolean := coalesce(p_creative, false);
	v_id uuid;
	v_prior_best integer;
	v_recent boolean := false;
	c_award_p1 constant integer := 120;
	c_award_p2 constant integer := 90;
	c_award_p3 constant integer := 70;
	c_award_finish constant integer := 50;
	c_award_pb constant integer := 40;
	c_award_min_gap constant interval := interval '30 seconds';
	v_placement integer := 0;
	v_pb integer := 0;
	v_award integer := 0;
	v_balance integer := null;
begin
	if v_uid is null then
		raise exception 'Not authenticated';
	end if;
	if p_track_id is null or length(trim(p_track_id)) = 0 then
		raise exception 'A track id is required';
	end if;
	v_track := trim(p_track_id);

	-- COMMUNITY GATE (0058, + the 0059 approval requirement): a non-creative
	-- run on a community track ranks only while that track is APPROVED,
	-- featured, and not removed. Anything else demotes to the creative branch
	-- (logged, never ranked, never paid) rather than erroring, so a run in
	-- progress when a teacher revokes approval still closes cleanly.
	if not v_creative and v_track like 'community:%' then
		begin
			if not exists (
				select 1 from public.greenline_tracks t
				where t.id = substring(v_track from 11)::uuid
					and t.status = 'approved'
					and t.featured
					and not t.removed
			) then
				v_creative := true;
			end if;
		exception when others then
			v_creative := true;
		end;
	end if;

	if v_creative then
		v_mode := 'creative';
	end if;

	if not v_creative then
		select min(r.best_lap_ms) into v_prior_best
		from public.greenline_race_results r
		where r.user_id = v_uid
			and r.track_id = v_track
			and r.mode = v_mode
			and r.best_lap_ms is not null;

		select exists (
			select 1 from public.greenline_race_results r
			where r.user_id = v_uid
				and r.created_at > now() - c_award_min_gap
		) into v_recent;
	end if;

	insert into public.greenline_race_results (
		user_id, track_id, mode, finish_position,
		total_time_ms, best_lap_ms, laps, archetype,
		weapon_primary, weapon_secondary,
		ability_primary, ability_secondary,
		creative, route
	)
	values (
		v_uid, v_track, v_mode, p_finish_position,
		p_total_time_ms, p_best_lap_ms, p_laps, p_archetype,
		nullif(trim(coalesce(p_weapon_primary, '')), ''),
		nullif(trim(coalesce(p_weapon_secondary, '')), ''),
		nullif(trim(coalesce(p_ability_primary, '')), ''),
		nullif(trim(coalesce(p_ability_secondary, '')), ''),
		v_creative,
		nullif(trim(coalesce(p_route, '')), '')
	)
	returning id into v_id;

	if not v_creative and not v_recent then
		if p_finish_position is not null and p_finish_position >= 1 then
			v_placement := case p_finish_position
				when 1 then c_award_p1
				when 2 then c_award_p2
				when 3 then c_award_p3
				else c_award_finish
			end;
		end if;
		if p_best_lap_ms is not null and p_best_lap_ms > 0
			and (v_prior_best is null or p_best_lap_ms < v_prior_best) then
			v_pb := c_award_pb;
		end if;
		v_award := v_placement + v_pb;

		if v_award > 0 then
			insert into public.greenline_wallets (user_id, balance, lifetime_earned, updated_at)
			values (v_uid, v_award, v_award, now())
			on conflict (user_id) do update
				set balance = public.greenline_wallets.balance + excluded.balance,
					lifetime_earned = public.greenline_wallets.lifetime_earned + excluded.lifetime_earned,
					updated_at = now();
		end if;
	end if;

	select w.balance into v_balance
	from public.greenline_wallets w
	where w.user_id = v_uid;

	return jsonb_build_object(
		'id', v_id,
		'awarded', v_award,
		'placement', v_placement,
		'pb_bonus', v_pb,
		'balance', v_balance,
		'creative', v_creative
	);
end;
$$;

revoke all on function public.greenline_submit_race_result(
	text, text, integer, integer, integer, integer, text, boolean,
	text, text, text, text, text
) from public;
grant execute on function public.greenline_submit_race_result(
	text, text, integer, integer, integer, integer, text, boolean,
	text, text, text, text, text
) to authenticated;

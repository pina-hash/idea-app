-- 0289: TEST STUDENT ACCOUNTS ARE HIDDEN FROM EVERY LIST OF PEOPLE (ledger 0422, feedback d1c9ed15).
--
-- A test account (0288's `test_accounts`) behaves as a student wherever it is
-- the one looking, and appears nowhere anybody else is looking: no class
-- roster, grade view, count, coin roster or leaderboard, stock leaderboard,
-- class stock signal, job badge, certification holders list, GAUNTLET or
-- GREENLINE board. Each list is redefined from its latest definition with ONE
-- added condition and nothing else changed; the comment above each names the
-- file it was copied from. Where the test account itself is the caller, it
-- still sees itself (`or ... = current_user_email()`), so a session viewing
-- or acting as it sees what a student sees.
--
-- The roster functions most surfaces read are classroom_section_roster (the
-- teacher's roster, the grades page, the people pages, the home page's "to
-- grade" counts, the connector's name lookup), _notebook_section_roster (the
-- grid, presence and the live view), _coin_economy_enrollments (about thirty
-- coin functions) and _coin_public_roster (the public coin surface).
--
-- UNDO: re-run each function's definition from the file named above it, and
-- the 0251 definition of coin_balances.

-- For the one security-invoker view below, which runs as the caller: true when
-- the address is a test account that is not the caller. It answers about one
-- address at a time and never lists them.
create or replace function public.idea_hidden_test_account(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select lower(btrim(coalesce(p_email, ''))) <> public.current_user_email()
		and public._idea_is_test_email(p_email);
$$;
revoke all on function public.idea_hidden_test_account(text) from public, anon, authenticated;
grant execute on function public.idea_hidden_test_account(text) to authenticated;

-- classroom_section_roster: a teacher's roster never lists a test account
-- (latest definition before this file: 0179_classroom_roster_avatar.sql)
create or replace function public.classroom_section_roster(p_section_id uuid default null)
returns table (
	section_id uuid,
	student_email text,
	display_name text,
	active boolean,
	updated_at timestamptz,
	manages boolean,
	avatar text,
	avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $$
	select
		e.section_id,
		e.student_email,
		e.display_name,
		e.active,
		e.updated_at,
		public._classroom_manages_section_email(e.section_id, e.student_email) as manages,
		p.avatar,
		p.avatar_url
	from public.classroom_enrollments e
	-- LEFT joins, both of them, and the row survives either one missing.
	left join lateral (
		select public._notebook_user_id_for_email(e.student_email) as id
	) u on true
	left join public.profiles p on p.id = u.id
	where (p_section_id is null or e.section_id = p_section_id)
		and public.classroom_manages_section(e.section_id)
		and e.student_email not in (select public._idea_test_emails())
	order by e.display_name, e.student_email;
$$;

-- _notebook_section_roster: the grid, presence and live view list a test account only to itself
-- (latest definition before this file: 0180_notebook_grid_avatar.sql)
create or replace function public._notebook_section_roster(p_section_id uuid)
returns table (
	student_key text,
	student_id uuid,
	email text,
	name text,
	enrolled boolean,
	-- 0180. Read off the `profiles` row the final select already
	-- left-joins for `name` and `email`; null wherever that join found
	-- nothing, which is the ordinary case.
	avatar text,
	avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $$
	with enrolled as (
		select
			ce.student_email as email,
			ce.display_name as roster_name,
			public._notebook_user_id_for_email(ce.student_email) as student_id
		from public.classroom_enrollments ce
		where ce.section_id = p_section_id
			and ce.active
			and not public._classroom_manages_section_email(p_section_id, ce.student_email)
			and (ce.student_email not in (select public._idea_test_emails()) or ce.student_email = public.current_user_email())
	),
	holders as (
		select
			p.id as student_id,
			public._notebook_email_for_user(p.id) as email
		from public.profiles p
		where exists (
				select 1 from public.notebook_entries e
				where e.student_id = p.id
					and e.section_id = p_section_id
					and e.deleted_at is null
					and e.submitted_at is not null
			)
			or exists (
				select 1
				from public.notebook_session_excusals x
				join public.notebook_session_postings pg on pg.session_id = x.session_id
				where x.student_id = p.id and pg.section_id = p_section_id
			)
	),
	combined as (
		select e.email, e.student_id, e.roster_name, true as enrolled
		from enrolled e
		union all
		select h.email, h.student_id, null::text as roster_name, false as enrolled
		from holders h
		where not exists (
			select 1 from enrolled e
			where e.student_id = h.student_id
				or (h.email is not null and e.email = h.email)
		)
			and not public._classroom_manages_section_email(p_section_id, h.email)
			and (h.student_id not in (select public._idea_test_user_ids()) or h.student_id = (select auth.uid()))
	)
	select
		coalesce(c.email, c.student_id::text) as student_key,
		c.student_id,
		coalesce(c.email, p.email) as email,
		coalesce(
			nullif(btrim(c.roster_name), ''),
			nullif(btrim(p.display_name), ''),
			nullif(btrim(p.full_name), ''),
			c.email,
			p.email,
			'Student'
		) as name,
		c.enrolled,
		p.avatar,
		p.avatar_url
	from combined c
	left join public.profiles p on p.id = c.student_id;
$$;

-- _coin_economy_enrollments: every coin roster, directory, payday and board leaves a test account out, except to itself
-- (latest definition before this file: 0286_coin_members_without_a_class.sql)
create or replace function public._coin_economy_enrollments()
returns table (student_email text, section_id uuid, display_name text, enrolled_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
	with enrolled as (
		select e.student_email, e.section_id, e.display_name, e.created_at
		from public.classroom_enrollments e
		join public.classroom_sections s on s.id = e.section_id
		where e.active and s.active and s.coin_economy_on
			and not public._classroom_manages_section_email(e.section_id, e.student_email)
			and (e.student_email not in (select public._idea_test_emails()) or e.student_email = public.current_user_email())
	)
	select x.student_email, x.section_id, x.display_name, x.created_at from enrolled x
	union all
	select public.current_user_email(), null::uuid,
		coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), '')), null::timestamptz
	from public.profiles p
	where public.current_user_email() <> ''
		and lower(btrim(coalesce(p.email, ''))) = public.current_user_email()
		and p.role in ('student', 'visitor')
		and not public._admin_is_email(public.current_user_email())
		and not exists (select 1 from enrolled y where y.student_email = public.current_user_email());
$$;

-- _coin_public_roster: the public leaderboard, badges and student pages leave a test account out, even one with transactions
-- (latest definition before this file: 0251_coin_v2_retire_the_old_model.sql)
create or replace function public._coin_public_roster()
returns table (
	student_email text,
	public_id text,
	display_name text,
	section text,
	section_color text
)
language sql
stable
security definer
set search_path = ''
as $$
	with salt as (select s.salt from public.coin_public_id_secret s where s.id limit 1),
	enr as (
		select distinct on (x.student_email) x.student_email,
			public._coin_classroom_section_label(x.section_id) as label, x.display_name
		from public._coin_economy_enrollments() x
		order by x.student_email, public._coin_classroom_section_label(x.section_id)
	),
	emails as (
		select t.student_email as email from public.coin_transactions t
		where t.student_email not in (select public._idea_test_emails()) or t.student_email = public.current_user_email()
		union
		select enr.student_email from enr
	)
	select
		e.email,
		md5((select salt.salt from salt) || e.email),
		coalesce(
			nullif(btrim(enr.display_name), ''),
			nullif(btrim(p.display_name), ''),
			nullif(btrim(p.full_name), ''),
			public._coin_public_name_fallback()
		),
		enr.label,
		null::text
	from emails e
	left join enr on enr.student_email = e.email
	left join public.profiles p on lower(p.email) = e.email;
$$;

-- coin_stocks_board: the stock leaderboard leaves a test account out, except to itself
-- (latest definition before this file: 0283_coin_stocks_relaunch.sql)
create or replace function public.coin_stocks_board()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
begin
	if (select auth.uid()) is null or v_email = '' then
		return jsonb_build_object('signed_in', false);
	end if;
	return jsonb_build_object(
		'signed_in', true,
		'in_economy', exists (select 1 from public._coin_economy_enrollments() x where x.student_email = v_email),
		'balance', public._coin_balance(v_email),
		'open_today', public._coin_is_class_day(public._coin_la_today()),
		'launched_at', (select min(s.launched_at) from public.coin_stocks s where s.kind <> 'class'),
		'last_tick_at', (select st.last_tick_at from public.coin_stock_state st where st.id),
		'rules', public._coin_stock_rules() || jsonb_build_object(
			'fee_percent', coalesce((public._coin_setting('stock_fee_percent') #>> '{}')::numeric, 2),
			'position_cap', coalesce((public._coin_setting('stock_position_cap') #>> '{}')::numeric, 50),
			'floor', coalesce((public._coin_setting('stock_floor') #>> '{}')::numeric, 1),
			'ceiling', coalesce((public._coin_setting('stock_ceiling') #>> '{}')::numeric, 100),
			'base', coalesce((public._coin_setting('stock_base') #>> '{}')::numeric, 10),
			'class_window_weeks', coalesce((public._coin_setting('stock_class_window_weeks') #>> '{}')::numeric, 4),
			'min_class_students', coalesce((public._coin_setting('stock_min_class_students') #>> '{}')::numeric, 3)),
		'stocks', coalesce((select jsonb_agg(public._coin_stock_json(s, 240) order by (s.kind = 'index') desc, s.sort_order, s.ticker)
			from public.coin_stocks s where s.active), '[]'::jsonb),
		'portfolio', public._coin_portfolio(v_email),
		'leaderboard', coalesce((select jsonb_agg(jsonb_build_object('name', public._coin_market_name(b.email),
				'value', b.value, 'me', b.email = v_email) order by b.value desc)
			from (select p.student_email as email, round(sum(p.shares * coalesce(l.close, 0)), 2) as value
				from public.coin_stock_positions p
				left join lateral (select c.close from public.coin_stock_closes c where c.stock_id = p.stock_id
					order by c.day desc limit 1) l on true
				where p.shares > 0
					and (p.student_email not in (select public._idea_test_emails()) or p.student_email = v_email)
				group by p.student_email
				order by 2 desc limit 20) b), '[]'::jsonb));
end;
$$;

-- coin_section_role_badges: a class's job badges leave a test account out
-- (latest definition before this file: 0247_coin_v2_roles.sql)
create or replace function public.coin_section_role_badges(p_section_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if p_section_id is null or not public.classroom_manages_section(p_section_id) then
		return '[]'::jsonb;
	end if;
	return coalesce((select jsonb_agg(jsonb_build_object('email', h.student_email, 'role_id', h.role_id, 'role', d.name)
			order by d.sort_order)
		from public.coin_role_holders h
		join public.coin_role_definitions d on d.id = h.role_id
		join public.classroom_enrollments e on e.student_email = h.student_email and e.section_id = p_section_id and e.active
		where h.revoked_at is null and h.student_email not in (select public._idea_test_emails()) and (h.expires_at is null or h.expires_at > now())), '[]'::jsonb);
end;
$$;

-- _coin_stock_signal: a class stock moves on real students only
-- (latest definition before this file: 0287_coin_stock_areas.sql)
create or replace function public._coin_stock_signal(p_stock public.coin_stocks, p_at timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_weeks integer := coalesce((public._coin_setting('stock_class_window_weeks') #>> '{}')::integer, 4);
	v_min integer := coalesce((public._coin_setting('stock_min_class_students') #>> '{}')::integer, 3);
	v_from timestamptz;
	v_earned numeric;
	v_out numeric;
	v_students integer;
	v_items integer;
	v_pd integer;
	v_people integer;
begin
	if p_stock.kind = 'class' then
		if p_stock.section_id is null then
			return jsonb_build_object('has_data', false, 'inputs', '{}'::jsonb, 'why_not', 'This class no longer exists.');
		end if;
		v_from := p_at - make_interval(days => v_weeks * 7);
		select coalesce(sum(o.earned), 0), coalesce(sum(o.out_of), 0), count(distinct o.student_email), count(distinct o.item_id)
		into v_earned, v_out, v_students, v_items
		from (
			select s.student_email, s.item_id,
				coalesce(s.score, 0) - coalesce(s.extra_credit, 0) as earned,
				public._classroom_item_out_of(s.item_id) as out_of
			from public.classroom_submissions s
			join public.classroom_postings p on p.item_id = s.item_id and p.section_id = p_stock.section_id
			join public.classroom_enrollments e on e.section_id = p_stock.section_id and e.student_email = s.student_email and e.active
			where s.state = 'returned' and s.returned_at > v_from and s.returned_at <= p_at
				and not public._classroom_manages_section_email(p_stock.section_id, s.student_email)
				and s.student_email not in (select public._idea_test_emails())
		) o
		where o.out_of is not null and o.out_of > 0;
		return jsonb_build_object(
			'has_data', v_out > 0 and v_students >= v_min,
			'signal', case when v_out > 0 and v_students >= v_min then round(v_earned / v_out, 6) end,
			'inputs', jsonb_build_object('earned', v_earned, 'out_of', v_out, 'students', v_students,
				'items', v_items, 'window_start', v_from, 'window_end', p_at, 'min_students', v_min),
			'why_not', case when v_out <= 0 then 'No work was returned in this class in the last ' || v_weeks || ' weeks.'
				when v_students < v_min then 'Fewer than ' || v_min || ' students had work returned in the last ' || v_weeks || ' weeks.' end);
	end if;

	if p_stock.kind = 'area' then
		return public._coin_stock_area_signal(coalesce(p_stock.params ->> 'area', ''), p_at);
	end if;

	v_from := p_at - interval '7 days';
	if p_stock.kind = 'foundry' then
		select count(*), count(distinct x.who) into v_pd, v_people from (
			select pl.player as who, public._coin_la_today(pl.started_at) as d from public.student_app_plays pl
			where pl.player is not null and pl.started_at > v_from and pl.started_at <= p_at
			union
			select a.owner, public._coin_la_today(v.created_at) from public.student_app_versions v
			join public.student_apps a on a.id = v.app_id
			where v.created_at > v_from and v.created_at <= p_at
		) x;
	elsif p_stock.kind = 'gauntlet' then
		select count(*), count(distinct x.who) into v_pd, v_people from (
			select distinct s.user_id as who, public._coin_la_today(s.created_at) as d from public.submissions s
			where s.created_at > v_from and s.created_at <= p_at
		) x;
	else
		return jsonb_build_object('has_data', false, 'inputs', '{}'::jsonb, 'why_not', 'This kind of stock has no signal.');
	end if;
	return jsonb_build_object('has_data', true, 'signal', round(v_pd / 7.0, 6),
		'inputs', jsonb_build_object('person_days', v_pd, 'people', v_people, 'window_start', v_from, 'window_end', p_at));
end;
$$;

-- greenline_leaderboard: race boards leave a test account out
-- (latest definition before this file: 0049_greenline_accounts.sql)
create or replace function public.greenline_leaderboard(
	p_track_id text,
	p_mode text default 'race',
	p_limit integer default 100
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with filtered as (
	select r.*
	from public.greenline_race_results r
	where r.track_id = p_track_id
		and r.mode = coalesce(nullif(trim(p_mode), ''), 'race')
),
best_run as (
	-- Fastest completed run per player (their leaderboard entry).
	select distinct on (f.user_id)
		f.user_id, f.finish_position, f.total_time_ms, f.laps, f.archetype, f.created_at
	from filtered f
	where f.total_time_ms is not null
	order by f.user_id, f.total_time_ms asc, f.created_at asc
),
best_lap as (
	-- True best single lap across ALL of the player's runs on the track.
	select f.user_id, min(f.best_lap_ms) as best_lap_ms
	from filtered f
	where f.best_lap_ms is not null
	group by f.user_id
),
ranked as (
	select
		b.user_id,
		b.finish_position,
		b.total_time_ms,
		b.laps,
		b.archetype,
		bl.best_lap_ms,
		p.display_name, p.full_name, p.avatar, p.avatar_url,
		rank() over (order by b.total_time_ms asc, b.created_at asc) as rank
	from best_run b
	join public.profiles p on p.id = b.user_id
		and (b.user_id not in (select public._idea_test_user_ids()) or b.user_id = (select auth.uid()))
	left join best_lap bl on bl.user_id = b.user_id
	order by rank asc
	limit greatest(coalesce(p_limit, 100), 1)
)
select coalesce(
	jsonb_agg(jsonb_build_object(
		'user_id', user_id,
		'display_name', display_name,
		'full_name', full_name,
		'avatar', avatar,
		'avatar_url', avatar_url,
		'archetype', archetype,
		'finish_position', finish_position,
		'total_time_ms', total_time_ms,
		'best_lap_ms', best_lap_ms,
		'laps', laps,
		'rank', rank
	) order by rank asc),
	'[]'::jsonb
)
from ranked;
$$;

-- cert_holders: the holders list leaves a test account out
-- (latest definition before this file: 0263_cert_awards.sql)
create or replace function public.cert_holders()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
	perform public._cert_caller();
	return jsonb_build_object(
		'by_certification', coalesce((
			select jsonb_agg(jsonb_build_object('code', c.code, 'name', c.name, 'level', c.level, 'category', c.category,
				'holders', coalesce((
					select jsonb_agg(jsonb_build_object('name', a.holder_name, 'awarded_at', a.awarded_at,
						'status', public._cert_award_status(a)) order by a.holder_name, a.awarded_at)
					from public.cert_awards a where a.certification_id = c.id
						and a.email not in (select public._idea_test_emails())
				), '[]'::jsonb)) order by c.cat_sort, c.category, c.sort_order, c.level, c.code)
			from (
				select x.*, min(x.sort_order) over (partition by x.category) as cat_sort
				from public.cert_certifications x
				where x.state <> 'draft' and exists (select 1 from public.cert_awards a where a.certification_id = x.id)
			) c
		), '[]'::jsonb),
		'by_person', coalesce((
			select jsonb_agg(jsonb_build_object('name', p.name, 'email_hash', p.email_hash,
				'certifications', p.certifications) order by p.name, p.email_hash)
			from (
				select min(a.holder_name) as name,
					encode(sha256(convert_to(a.email, 'UTF8')), 'hex') as email_hash,
					jsonb_agg(jsonb_build_object('code', a.code, 'level', a.level, 'awarded_at', a.awarded_at,
						'status', public._cert_award_status(a)) order by a.awarded_at) as certifications
				from public.cert_awards a
				where a.email not in (select public._idea_test_emails())
				group by a.email
			) p
		), '[]'::jsonb)
	);
end;
$fn$;

-- gauntlet_leaderboard: GAUNTLET boards leave a test account out, except to itself
-- (latest definition before this file: 0194_gauntlet_verification_floor.sql)
create or replace view public.gauntlet_leaderboard as
select
	best.challenge_id,
	best.mode,
	best.user_id,
	coalesce(p.full_name, 'Player') as player,
	best.is_correct,
	best.score_metric,
	best.created_at,
	-- 0194: a HELD run holds no seat. Partitioning by `rank_state` keeps the
	-- ranked rows' numbering dense and unchanged -- 1..n over the ranked rows
	-- of the challenge, exactly what it was before this file -- and the `case`
	-- nulls the held partition's own numbering rather than publishing it.
	case when best.rank_state = 'ranked' then
		rank() over (
			partition by best.challenge_id, best.rank_state
			order by best.is_correct desc nulls last, best.score_metric asc nulls last, best.tiebreak asc nulls last, best.created_at asc
		)
	end as rank,
	best.rank_state
from (
	select distinct on (cand.user_id, cand.challenge_id)
		cand.user_id,
		cand.challenge_id,
		cand.mode,
		cand.is_correct,
		cand.score_metric,
		cand.created_at,
		cand.tiebreak,
		cand.rank_state
	from (
		select
			s.user_id,
			s.challenge_id,
			s.mode,
			s.is_correct,
			s.score_metric,
			s.created_at,
			(s.value ->> 'elapsed_ms')::numeric as tiebreak,
			-- 0194: THE PLAUSIBILITY FLOOR, WHICH NOW HOLDS RATHER THAN DROPS.
			-- The threshold is read from the settings row, not written here as
			-- a literal; `coalesce` covers the case where section 1's seed was
			-- removed by hand, and covers it with 0154's own number.
			--
			-- A MISSING `elapsed_ms` IS HELD. `0154` refused it (NULL >= 30000
			-- is NULL) and said so; `is null or < floor` is that same refusal
			-- with a teacher able to see the row. Every macro submit since
			-- `0006` writes the key, so such a row is not a legacy shape but a
			-- row nothing in this codebase wrote.
			--
			-- The expression is the tiebreak's, character for character, for
			-- `0154`'s reason: `score_metric` is only the clock for `speedrun`,
			-- so a macro mode admitted later would be floored on a feature
			-- count.
			case
				when s.source = 'macro'
					and s.mode in ('speedrun')
					and (
						(s.value ->> 'elapsed_ms')::numeric is null
						or (s.value ->> 'elapsed_ms')::numeric < f.floor_ms
					)
				then 'pending_verification'
				else 'ranked'
			end as rank_state
		from public.submissions s
		cross join lateral (
			select coalesce(
				(select g.speedrun_floor_ms from public.gauntlet_rank_settings g where g.id),
				30000
			)::numeric as floor_ms
		) f
		-- 0154: A RESULT IS A CORRECT RESULT. `is_correct = true` (not
		-- `is_correct`) so a NULL is refused rather than being asked to be
		-- truthy. Unchanged.
		where s.is_correct = true
			and (
				s.mode in ('drawing_reading', 'gdt_tolerance', 'spot_the_error')
				-- 0146's allowlist, unchanged and still an allowlist: a macro
				-- mode added later must be admitted by somebody who has decided
				-- its metric is checkable. What 0194 removes from this branch is
				-- ONLY the floor term -- the row now enters and is labelled,
				-- rather than being excluded.
				or (
					s.source = 'macro'
					and s.mode in ('speedrun')
				)
			)
	) cand
	order by cand.user_id, cand.challenge_id,
		-- 0194: A RANKED ROW OUTRANKS A HELD ONE FOR THE SAME PLAYER. This is
		-- where `0154`'s "it removes the run, not the player" now lives: it was
		-- a consequence of the WHERE excluding held rows, and the WHERE no
		-- longer does, so it is stated. Without this term a student's held
		-- 4-second run would represent them on a challenge they also cleared
		-- honestly, and their honest seat would disappear.
		(cand.rank_state = 'ranked') desc,
		cand.is_correct desc nulls last,
		cand.score_metric asc nulls last,
		cand.tiebreak asc nulls last,
		cand.created_at asc
) best
join public.profiles p on p.id = best.user_id
join public.challenges c on c.id = best.challenge_id
where c.published
	and (best.user_id not in (select public._idea_test_user_ids()) or best.user_id = (select auth.uid()));

-- coin_balances: the Coin Desk's balances leave a test account out
-- (latest definition before this file: 0251_coin_v2_retire_the_old_model.sql).
create or replace view public.coin_balances
with (security_invoker = true) as
select g.student_email, g.balance, g.last_activity_at, g.transaction_count
from (
	select
		student_email,
		coalesce(sum(amount) filter (where medium = 'digital'), 0)::numeric(12,2) as balance,
		max(created_at) as last_activity_at,
		count(*)::integer as transaction_count
	from public.coin_transactions
	group by student_email
) g
where not public.idea_hidden_test_account(g.student_email);

do $$
begin
	raise notice '0289: % test accounts are now hidden from every list', (select count(*) from public.test_accounts);
end;
$$;

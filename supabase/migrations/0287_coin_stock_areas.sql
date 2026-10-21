-- 0287_coin_stock_areas.sql
--
-- Feedback 616b93c3 and f2aa1311. One stock for each active area of the site,
-- each priced from an index of three or four real counts for that area, and a
-- volume figure on each day so the chart can draw volume bars.
--
-- WHAT IT ADDS
--   1. coin_stocks.kind accepts 'area'.
--   2. _coin_area_metrics(area, from, to): the real counts for one area over a
--      window. These are the ONLY numbers an area stock is priced from:
--        classroom      work handed in, work returned, posts published, people who handed in
--        coin desk      coin entries (not stock trades), people with an entry, coin requests
--        market         listings posted, orders placed, coins sent between students
--        tournaments    tournaments created, entries registered, matches played
--        armory         file versions saved, part numbers assigned, changes synced
--        certifications exams submitted, certifications awarded, attempts started, lessons finished
--        maps           map edits saved, viewer searches, photos added, items published
--        ideacad        edits made, models touched, people editing
--        notebook       entries uploaded, people uploading, entries reviewed
--        feedback       reports sent, reports reviewed, reports with a screenshot
--   3. _coin_stock_area_signal(area, at): each count this week divided by its own
--      average week over the four weeks before, each softened by adding 2 so a
--      handful of events cannot swing it, then averaged. Nothing is invented: a
--      quiet area reads about 1.0 and a busier one reads higher. With under 8
--      events in five weeks it has no reading and the price holds.
--   4. _coin_stock_signal gains the 'area' branch (0283's body otherwise unchanged).
--   5. Ten new stocks (id area:<name>), each launched now at the base price, so
--      they run the same launch ramp and circuit breakers as every other stock
--      from their own launch. The IDEA index averages them in with the rest.
--   6. coin_stock_detail returns volume (coins traded) and a trade count on each
--      day (0283's body otherwise unchanged).
--
-- DEPLOY ORDER: either. Old pages ignore the new kind and the new keys.
-- IDEMPOTENT: constraints and rows are guarded; functions are create or replace.
-- WHAT UNDOES IT: delete from public.coin_stocks where kind = 'area' (after
--   deleting their closes, ticks, halts and state rows), then re-paste 0283's
--   _coin_stock_signal and coin_stock_detail and drop the two new functions.

do $pre$
begin
	if to_regprocedure('public._coin_stock_signal(public.coin_stocks, timestamptz)') is null then
		raise exception '0287 cannot apply: 0283 (the stocks relaunch) is not applied.';
	end if;
	if to_regclass('public.coin_stock_trades') is null then
		raise exception '0287 cannot apply: coin_stock_trades does not exist.';
	end if;
end
$pre$;

do $kind$
declare
	v_name text;
begin
	for v_name in
		select c.conname from pg_constraint c
		where c.conrelid = 'public.coin_stocks'::regclass and c.contype = 'c'
			and pg_get_constraintdef(c.oid) like '%kind%' and pg_get_constraintdef(c.oid) like '%gauntlet%'
	loop
		execute format('alter table public.coin_stocks drop constraint %I', v_name);
	end loop;
	if not exists (select 1 from pg_constraint where conname = 'coin_stocks_kind_check_v3' and conrelid = 'public.coin_stocks'::regclass) then
		alter table public.coin_stocks add constraint coin_stocks_kind_check_v3
			check (kind in ('class', 'foundry', 'gauntlet', 'index', 'area'));
	end if;
end
$kind$;

create or replace function public._coin_area_metrics(p_area text, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v jsonb;
begin
	if p_area = 'classroom' then
		v := jsonb_build_array(
			jsonb_build_object('key', 'handed_in', 'label', 'Work handed in', 'n', (select count(*) from public.classroom_submissions s where s.submitted_at > p_from and s.submitted_at <= p_to)),
			jsonb_build_object('key', 'returned', 'label', 'Work returned', 'n', (select count(*) from public.classroom_submissions s where s.returned_at > p_from and s.returned_at <= p_to)),
			jsonb_build_object('key', 'posts', 'label', 'Posts published', 'n', (select count(*) from public.classroom_items i where i.first_published_at > p_from and i.first_published_at <= p_to)),
			jsonb_build_object('key', 'people', 'label', 'People who handed in', 'n', (select count(distinct s.student_email) from public.classroom_submissions s where s.submitted_at > p_from and s.submitted_at <= p_to)));
	elsif p_area = 'coin_desk' then
		v := jsonb_build_array(
			jsonb_build_object('key', 'entries', 'label', 'Coin entries', 'n', (select count(*) from public.coin_transactions t where t.created_at > p_from and t.created_at <= p_to and t.category_id not like 'stock\_%')),
			jsonb_build_object('key', 'people', 'label', 'People with an entry', 'n', (select count(distinct t.student_email) from public.coin_transactions t where t.created_at > p_from and t.created_at <= p_to and t.category_id not like 'stock\_%')),
			jsonb_build_object('key', 'requests', 'label', 'Coin requests', 'n', (select count(*) from public.coin_requests r where r.created_at > p_from and r.created_at <= p_to)));
	elsif p_area = 'market' then
		v := jsonb_build_array(
			jsonb_build_object('key', 'listings', 'label', 'Listings posted', 'n', (select count(*) from public.coin_market_listings l where l.created_at > p_from and l.created_at <= p_to)),
			jsonb_build_object('key', 'orders', 'label', 'Orders placed', 'n', (select count(*) from public.coin_market_orders o where o.created_at > p_from and o.created_at <= p_to)),
			jsonb_build_object('key', 'transfers', 'label', 'Coins sent between students', 'n', (select count(*) from public.coin_transfers x where x.created_at > p_from and x.created_at <= p_to)));
	elsif p_area = 'tournaments' then
		v := jsonb_build_array(
			jsonb_build_object('key', 'created', 'label', 'Tournaments created', 'n', (select count(*) from public.tournaments t where t.created_at > p_from and t.created_at <= p_to)),
			jsonb_build_object('key', 'entries', 'label', 'Entries registered', 'n', (select count(*) from public.tournament_entries e where e.created_at > p_from and e.created_at <= p_to)),
			jsonb_build_object('key', 'matches', 'label', 'Matches played', 'n', (select count(*) from public.tournament_bracket_matches m where m.completed_at > p_from and m.completed_at <= p_to)));
	elsif p_area = 'armory' then
		v := jsonb_build_array(
			jsonb_build_object('key', 'versions', 'label', 'File versions saved', 'n', (select count(*) from public.armory_versions a where a.created_at > p_from and a.created_at <= p_to)),
			jsonb_build_object('key', 'parts', 'label', 'Part numbers assigned', 'n', (select count(*) from public.armory_part_numbers a where a.assigned_at > p_from and a.assigned_at <= p_to)),
			jsonb_build_object('key', 'changes', 'label', 'Changes synced', 'n', (select count(*) from public.armory_change_feed a where a.created_at > p_from and a.created_at <= p_to)));
	elsif p_area = 'certifications' then
		v := jsonb_build_array(
			jsonb_build_object('key', 'exams', 'label', 'Exams submitted', 'n', (select count(*) from public.cert_exam_attempts a where a.submitted_at > p_from and a.submitted_at <= p_to)),
			jsonb_build_object('key', 'awards', 'label', 'Certifications awarded', 'n', (select count(*) from public.cert_awards a where a.awarded_at > p_from and a.awarded_at <= p_to)),
			jsonb_build_object('key', 'attempts', 'label', 'Attempts started', 'n', (select count(*) from public.cert_attempts a where a.started_at > p_from and a.started_at <= p_to)),
			jsonb_build_object('key', 'lessons', 'label', 'Lessons finished', 'n', (select count(*) from public.cert_training_progress a where a.completed_at > p_from and a.completed_at <= p_to)));
	elsif p_area = 'maps' then
		v := jsonb_build_array(
			jsonb_build_object('key', 'edits', 'label', 'Map edits saved', 'n', (select count(*) from public.maps_revisions r where r.created_at > p_from and r.created_at <= p_to)),
			jsonb_build_object('key', 'searches', 'label', 'Viewer searches', 'n', (select count(*) from public.maps_search_log l where l.created_at > p_from and l.created_at <= p_to)),
			jsonb_build_object('key', 'photos', 'label', 'Photos added', 'n', (select count(*) from public.maps_photos p where p.created_at > p_from and p.created_at <= p_to)),
			jsonb_build_object('key', 'items', 'label', 'Items published', 'n', (select count(*) from public.maps_items i where i.published_at > p_from and i.published_at <= p_to)));
	elsif p_area = 'ideacad' then
		v := jsonb_build_array(
			jsonb_build_object('key', 'edits', 'label', 'Edits made', 'n', (select count(*) from public.ideacad_history h where h.at > p_from and h.at <= p_to)),
			jsonb_build_object('key', 'models', 'label', 'Models touched', 'n', (select count(distinct h.concept_id) from public.ideacad_history h where h.at > p_from and h.at <= p_to)),
			jsonb_build_object('key', 'people', 'label', 'People editing', 'n', (select count(distinct h.actor) from public.ideacad_history h where h.at > p_from and h.at <= p_to)));
	elsif p_area = 'notebook' then
		v := jsonb_build_array(
			jsonb_build_object('key', 'entries', 'label', 'Entries uploaded', 'n', (select count(*) from public.notebook_entries e where e.upload_timestamp > p_from and e.upload_timestamp <= p_to)),
			jsonb_build_object('key', 'people', 'label', 'People uploading', 'n', (select count(distinct e.student_id) from public.notebook_entries e where e.upload_timestamp > p_from and e.upload_timestamp <= p_to)),
			jsonb_build_object('key', 'reviewed', 'label', 'Entries reviewed', 'n', (select count(*) from public.notebook_entries e where e.reviewed_at > p_from and e.reviewed_at <= p_to)));
	elsif p_area = 'feedback' then
		v := jsonb_build_array(
			jsonb_build_object('key', 'sent', 'label', 'Reports sent', 'n', (select count(*) from public.app_feedback f where f.created_at > p_from and f.created_at <= p_to)),
			jsonb_build_object('key', 'reviewed', 'label', 'Reports reviewed', 'n', (select count(*) from public.app_feedback f where f.reviewed_at > p_from and f.reviewed_at <= p_to)),
			jsonb_build_object('key', 'shots', 'label', 'Reports with a screenshot', 'n', (select count(*) from public.app_feedback f where f.created_at > p_from and f.created_at <= p_to and f.screenshot_path is not null)));
	else
		return '[]'::jsonb;
	end if;
	return v;
end;
$$;
revoke all on function public._coin_area_metrics(text, timestamptz, timestamptz) from public, anon, authenticated, service_role;

create or replace function public._coin_stock_area_signal(p_area text, p_at timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_now jsonb;
	v_before jsonb;
	v_rows jsonb := '[]'::jsonb;
	v_sum numeric := 0;
	v_k integer := 0;
	v_events numeric := 0;
	m jsonb;
	i integer;
	v_n numeric;
	v_b numeric;
	v_ratio numeric;
begin
	-- AN AREA THAT CANNOT BE READ MUST NEVER STOP THE TICK FOR EVERY OTHER STOCK:
	-- a missing table or column reads as "no reading", and the price holds.
	begin
		v_now := public._coin_area_metrics(p_area, p_at - interval '7 days', p_at);
		v_before := public._coin_area_metrics(p_area, p_at - interval '35 days', p_at - interval '7 days');
	exception when others then
		return jsonb_build_object('has_data', false, 'inputs', '{}'::jsonb, 'why_not', 'This area''s numbers could not be read just now, so the price holds.');
	end;
	if jsonb_array_length(v_now) = 0 then
		return jsonb_build_object('has_data', false, 'inputs', '{}'::jsonb, 'why_not', 'This area has no measures.');
	end if;
	for i in 0 .. jsonb_array_length(v_now) - 1 loop
		m := v_now -> i;
		v_n := (m ->> 'n')::numeric;
		v_b := coalesce(((v_before -> i) ->> 'n')::numeric, 0);
		v_ratio := (v_n + 2) / (v_b / 4.0 + 2);
		v_sum := v_sum + v_ratio;
		v_k := v_k + 1;
		v_events := v_events + v_n + v_b;
		v_rows := v_rows || jsonb_build_array(jsonb_build_object('key', m ->> 'key', 'label', m ->> 'label',
			'this_week', v_n, 'average_week', round(v_b / 4.0, 2), 'ratio', round(v_ratio, 4)));
	end loop;
	return jsonb_build_object(
		'has_data', v_events >= 8,
		'signal', case when v_events >= 8 then round(v_sum / v_k, 6) end,
		'inputs', jsonb_build_object('area', p_area, 'metrics', v_rows, 'events', v_events, 'window_end', p_at),
		'why_not', case when v_events < 8 then 'Fewer than 8 events in this area in the last five weeks, so there is no reading yet.' end);
end;
$$;
revoke all on function public._coin_stock_area_signal(text, timestamptz) from public, anon, authenticated, service_role;

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
revoke all on function public._coin_stock_signal(public.coin_stocks, timestamptz) from public, anon, authenticated, service_role;

create or replace function public.coin_stock_detail(p_stock_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_s public.coin_stocks;
	v_email text := public.current_user_email();
begin
	if (select auth.uid()) is null or v_email = '' then
		return jsonb_build_object('ok', false, 'reason', 'signed_out');
	end if;
	select * into v_s from public.coin_stocks s where s.id = p_stock_id and (s.active or public._coin_full_staff());
	if v_s.id is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	return jsonb_build_object('ok', true, 'stock', public._coin_stock_json(v_s, 1000),
		'launch', jsonb_build_object('at', v_s.launched_at, 'price', v_s.launch_price,
			'anchor_price', v_s.anchor_price, 'anchor_signal', v_s.anchor_signal),
		'days', coalesce((select jsonb_agg(jsonb_build_object('day', c.day, 'open', coalesce(c.open, c.close), 'high', coalesce(c.high, c.close),
				'low', coalesce(c.low, c.close), 'close', c.close, 'prev', c.prev_close, 'changes', c.ticks,
				'volume', coalesce((select round(sum(t3.gross), 2) from public.coin_stock_trades t3
					where t3.stock_id = v_s.id and t3.price_day = c.day), 0),
				'trades', (select count(*) from public.coin_stock_trades t4
					where t4.stock_id = v_s.id and t4.price_day = c.day)) order by c.day desc)
			from (select * from public.coin_stock_closes c2 where c2.stock_id = v_s.id order by c2.day desc limit 60) c), '[]'::jsonb),
		'ticks', coalesce((select jsonb_agg(jsonb_build_object('at', t.at, 'price', t.price, 'raw', t.raw, 'signal', t.signal,
				'ref', t.ref_price, 'phase', t.phase, 'cap_percent', t.cap_percent, 'carried', t.carried, 'note', t.note,
				'inputs', t.inputs, 'formula_version', t.formula_version) order by t.at desc, t.id desc)
			from (select * from public.coin_stock_ticks t2 where t2.stock_id = v_s.id order by t2.at desc, t2.id desc limit 60) t), '[]'::jsonb),
		'halts', coalesce((select jsonb_agg(jsonb_build_object('day', h.day, 'level', h.level, 'move_percent', h.move_percent,
				'started_at', h.started_at, 'until', h.ends_at) order by h.started_at desc)
			from (select * from public.coin_stock_halts h2 where h2.stock_id = v_s.id order by h2.started_at desc limit 20) h), '[]'::jsonb),
		'position', (select jsonb_build_object('shares', p.shares, 'cost_basis', p.cost_basis)
			from public.coin_stock_positions p where p.student_email = v_email and p.stock_id = v_s.id and p.shares > 0),
		'trades', coalesce((select jsonb_agg(jsonb_build_object('at', t.created_at, 'side', t.side, 'shares', t.shares,
				'price', t.price, 'gross', t.gross, 'fee', t.fee, 'pnl', t.pnl) order by t.created_at desc)
			from (select * from public.coin_stock_trades t2 where t2.student_email = v_email and t2.stock_id = v_s.id
				order by t2.created_at desc limit 30) t), '[]'::jsonb));
end;
$$;

revoke all on function public.coin_stock_detail(text) from public, anon, authenticated, service_role;
grant execute on function public.coin_stock_detail(text) to authenticated;

do $seed$
declare
	v_base numeric := coalesce((public._coin_setting('stock_base') #>> '{}')::numeric, 10);
	v_n integer;
begin
	insert into public.coin_stocks (id, kind, ticker, name, sort_order, params, launched_at, launch_price, anchor_price)
	values
		('area:classroom', 'area', 'CLASS', 'IDEA Classroom', 30, '{"area":"classroom"}'::jsonb, now(), v_base, v_base),
		('area:coin_desk', 'area', 'DESK', 'Coin Desk', 40, '{"area":"coin_desk"}'::jsonb, now(), v_base, v_base),
		('area:market', 'area', 'MARKT', 'IDEA Market', 50, '{"area":"market"}'::jsonb, now(), v_base, v_base),
		('area:tournaments', 'area', 'TOURN', 'Tournaments', 60, '{"area":"tournaments"}'::jsonb, now(), v_base, v_base),
		('area:armory', 'area', 'ARMRY', 'IDEA Armory', 70, '{"area":"armory"}'::jsonb, now(), v_base, v_base),
		('area:certifications', 'area', 'CERTS', 'IDEA Certifications', 80, '{"area":"certifications"}'::jsonb, now(), v_base, v_base),
		('area:maps', 'area', 'MAPS', 'IDEA Maps', 90, '{"area":"maps"}'::jsonb, now(), v_base, v_base),
		('area:ideacad', 'area', 'IDCAD', 'IdeaCAD', 100, '{"area":"ideacad"}'::jsonb, now(), v_base, v_base),
		('area:notebook', 'area', 'NOTE', 'Digital Notebook', 110, '{"area":"notebook"}'::jsonb, now(), v_base, v_base),
		('area:feedback', 'area', 'FEED', 'Feedback', 120, '{"area":"feedback"}'::jsonb, now(), v_base, v_base)
	on conflict (id) do nothing;
	get diagnostics v_n = row_count;
	raise notice '0287: % area stocks added, each at % and measured from its first real reading', v_n, v_base;
end
$seed$;

do $post$
begin
	if not exists (select 1 from public.coin_stocks where kind = 'area') then
		raise exception '0287 self-check failed: no area stocks exist.';
	end if;
	if has_function_privilege('anon', 'public._coin_area_metrics(text, timestamptz, timestamptz)', 'execute')
		or has_function_privilege('authenticated', 'public._coin_stock_area_signal(text, timestamptz)', 'execute') then
		raise exception '0287 self-check failed: a client role can execute an area signal function.';
	end if;
end
$post$;

-- 0290: WHAT THE CONNECTOR COULD NOT DO, AND THE SITE NEEDED TO (ledger 0422).
--
-- Each part closes an open connector gap or a feedback report, and each is a
-- definer function that re-checks its caller; the connector reaches them as
-- the admin, exactly as the site does.
--
--   1. classroom_team_progress (gap 673cbfa2): a student reads how far each
--      teammate on their own team is through a shared HTML assignment: which
--      steps hold an answer, never the answers. Own team only, read-only,
--      only a posted team set the class can see.
--   2. Retired questions (gap 03246300): replacing an HTML assignment's
--      document can RETIRE a question it drops instead of orphaning its
--      answers. The question leaves the worksheet; its stored answers stay,
--      shown to the teacher in grading under the question it was.
--   3. connector_lookup (the new item): a record by the name he says it, for
--      every kind of id a site action takes, so no action needs an id nobody
--      can look up.
--   4. tournament_host_add_team (gap a478ca9a): a team with its real players,
--      by school address, in one step, with no placeholder player.
--   5. The IDEA Market list for staff (gap 8020d662): every card with its id
--      and whether it is featured, hidden or closed; listing_staff gains
--      restore, which reopens a removed card.
--   6. Contracts (gaps a9d4bab4, ab5610b6): edit any field of an existing
--      contract, assign one to a student, and restore a cancelled one.
--   7. connector_uploads (gap d782fd4e): a one-time place to send a file's
--      bytes, so a large file reaches the site from a chat with no browser.
--
-- UNDO: drop the functions named above, connector_uploads, the
-- connector-uploads bucket and classroom_html_retired_blocks; re-run
-- coin_market_listing_staff from 0276.

-- ---------------------------------------------------------------------------
-- 1. Teammates' progress on a shared HTML assignment
-- ---------------------------------------------------------------------------

create or replace function public.classroom_team_progress(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_engine_student(p_item_id);
begin
	return jsonb_build_object('ok', true, 'teams', coalesce((
		select jsonb_agg(t_row order by t_row.posted_at desc nulls last, t_row.team_number)
		from (
			select s.label as set_label, s.posted_at, t.team_number,
				coalesce(nullif(btrim(t.name), ''), 'Team ' || t.team_number) as team_name,
				(
					select coalesce(jsonb_agg(jsonb_build_object(
						'name', coalesce(nullif(btrim(e.display_name), ''), split_part(m.student_email, '@', 1)),
						'me', m.student_email = v_email,
						'state', coalesce(sub.state, 'draft'),
						'answered', coalesce((
							select jsonb_agg(r.block_id order by r.block_id)
							from public.classroom_responses r
							where r.item_id = p_item_id and r.student_email = m.student_email
								and (jsonb_typeof(r.value) = 'boolean'
									or (jsonb_typeof(r.value) = 'string' and (r.value #>> '{}') ~ '[^][[:space:]",]'))
						), '[]'::jsonb),
						'images', coalesce((
							select jsonb_agg(distinct f.block_id)
							from public.classroom_submission_files f
							where f.submission_id = sub.id and f.block_id is not null
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
				and public._classroom_team_set_visible(s.id)
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
-- 2. Retired questions
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_html_retired_blocks (
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	block_id text not null check (char_length(block_id) between 1 and 64),
	-- The manifest's own entry for the block, as it was when it was retired.
	block jsonb not null check (jsonb_typeof(block) = 'object'),
	module_title text,
	retired_by text not null,
	retired_at timestamptz not null default now(),
	primary key (item_id, block_id)
);
alter table public.classroom_html_retired_blocks enable row level security;
revoke all on table public.classroom_html_retired_blocks from public, anon, authenticated;

-- As an admin (the importer's own gate), before the document that drops them
-- is set. Each element: {block_id, block, module_title}. A block that is
-- already retired keeps its first record.
create or replace function public.classroom_html_retire_blocks(p_item_id uuid, p_blocks jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_n integer := 0;
	v_ids text[] := '{}';
	b jsonb;
begin
	if not public.is_admin() then
		raise exception 'Only a site admin can change an HTML assignment.';
	end if;
	if not exists (select 1 from public.classroom_items i where i.id = p_item_id) then
		raise exception 'That assignment does not exist.';
	end if;
	if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
		raise exception 'Name the questions to retire.';
	end if;
	for b in select * from jsonb_array_elements(p_blocks) loop
		if coalesce(b ->> 'block_id', '') !~ '^[A-Za-z0-9_-]{1,64}' or jsonb_typeof(b -> 'block') <> 'object' then
			raise exception 'Each retired question needs its id and its entry from the old document.';
		end if;
		insert into public.classroom_html_retired_blocks (item_id, block_id, block, module_title, retired_by)
		values (p_item_id, b ->> 'block_id', b -> 'block', nullif(btrim(coalesce(b ->> 'module_title', '')), ''),
			public.current_user_email())
		on conflict (item_id, block_id) do nothing;
		if found then
			v_n := v_n + 1;
			v_ids := v_ids || (b ->> 'block_id');
		end if;
	end loop;
	return jsonb_build_object('ok', true, 'retired', v_n, 'block_ids', to_jsonb(v_ids));
end;
$$;
revoke all on function public.classroom_html_retire_blocks(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.classroom_html_retire_blocks(uuid, jsonb) to authenticated;

-- The reverse: un-retire, for the connector's undo. The question does not
-- come back into the worksheet (the document no longer has it); its answers
-- simply stop being shown in grading again.
create or replace function public.classroom_html_unretire_blocks(p_item_id uuid, p_block_ids text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_n integer;
begin
	if not public.is_admin() then
		raise exception 'Only a site admin can change an HTML assignment.';
	end if;
	delete from public.classroom_html_retired_blocks r
	where r.item_id = p_item_id and r.block_id = any(coalesce(p_block_ids, '{}'::text[]));
	get diagnostics v_n = row_count;
	return jsonb_build_object('ok', true, 'unretired', v_n);
end;
$$;
revoke all on function public.classroom_html_unretire_blocks(uuid, text[]) from public, anon, authenticated;
grant execute on function public.classroom_html_unretire_blocks(uuid, text[]) to authenticated;

-- As anyone who reviews the work: the retired questions, for grading.
create or replace function public.classroom_html_retired_blocks(p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(jsonb_agg(jsonb_build_object('block_id', r.block_id, 'block', r.block,
			'module_title', r.module_title, 'retired_at', r.retired_at) order by r.retired_at, r.block_id), '[]'::jsonb)
	from public.classroom_html_retired_blocks r
	where r.item_id = p_item_id
		and (public.is_admin() or exists (
			select 1 from public.classroom_postings pg
			where pg.item_id = p_item_id and public.classroom_manages_section(pg.section_id)));
$$;
revoke all on function public.classroom_html_retired_blocks(uuid) from public, anon, authenticated;
grant execute on function public.classroom_html_retired_blocks(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. A record by the name he says it
-- ---------------------------------------------------------------------------

create or replace function public._connector_lookup_norm(p text)
returns text
language sql
immutable
set search_path = ''
as $$
	select btrim(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9@.]+', ' ', 'g'));
$$;
revoke all on function public._connector_lookup_norm(text) from public, anon, authenticated;

-- Every word he said appears in the name; an exact name ranks first.
create or replace function public._connector_lookup_hit(p_name text, p_said text)
returns integer
language sql
immutable
set search_path = ''
as $$
	select case
		when public._connector_lookup_norm(p_name) = public._connector_lookup_norm(p_said) then 2
		when not exists (
			select 1 from unnest(string_to_array(public._connector_lookup_norm(p_said), ' ')) w
			where w <> '' and position(w in public._connector_lookup_norm(p_name)) = 0
		) then 1
		else 0 end;
$$;
revoke all on function public._connector_lookup_hit(text, text) from public, anon, authenticated;

create or replace function public.connector_lookup(p_kind text, p_said text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_kind text := lower(btrim(coalesce(p_kind, '')));
	v_said text := btrim(coalesce(p_said, ''));
	v_rows jsonb;
begin
	if (select auth.uid()) is null or not public.is_admin() then
		raise exception 'Not found.' using errcode = '42501';
	end if;
	if v_kind not in ('section', 'course', 'post', 'quick_post', 'student', 'user', 'tournament', 'app', 'listing',
		'contract', 'track', 'challenge', 'team_set', 'stock', 'project', 'cert', 'role_holder') then
		raise exception 'There is no lookup for "%".', v_kind;
	end if;
	if v_said = '' then
		return jsonb_build_object('kind', v_kind, 'matches', '[]'::jsonb);
	end if;
	with c(id, name, detail) as (
		select x.id, x.name, x.detail from (
			select s.id::text as id, coalesce(cc.code, '') || ' ' || s.label || coalesce(' ' || s.block, '') as name, s.teacher_email as detail
			from public.classroom_sections s left join public.classroom_courses cc on cc.id = s.course_id
			where v_kind = 'section' and s.active
			union all
			select cc.id::text, cc.code || ' ' || cc.title, null from public.classroom_courses cc where v_kind = 'course'
			union all
			select i.id::text, coalesce(i.title, left(i.body, 80)), i.kind from public.classroom_items i where v_kind = 'post'
			union all
			select q.id::text, left(q.body, 80), to_char(q.created_at, 'YYYY-MM-DD')
			from public.classroom_quick_posts q where v_kind = 'quick_post' and q.taken_down_at is null
			union all
			select lower(p.email), coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''), p.email) || ' ' || coalesce(p.full_name, '') || ' ' || lower(p.email), p.role
			from public.profiles p where v_kind = 'student' and p.email is not null
			union all
			select e.student_email, e.display_name || ' ' || e.student_email, 'on a class roster'
			from public.classroom_enrollments e
			where v_kind = 'student' and e.active
				and not exists (select 1 from public.profiles p2 where lower(p2.email) = e.student_email)
			union all
			select p.id::text, coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''), p.email) || ' ' || coalesce(p.full_name, '') || ' ' || coalesce(lower(p.email), ''), p.role
			from public.profiles p where v_kind = 'user'
			union all
			select t.id::text, t.name, t.status from public.tournaments t where v_kind = 'tournament'
			union all
			select a.id::text, a.title || ' ' || a.slug, a.slug from public.student_apps a where v_kind = 'app'
			union all
			select l.id::text, l.title, l.zone || case when l.featured_at is not null then ', featured' else '' end
				|| case when l.closed_at is not null then ', closed' else '' end
			from public.coin_market_listings l where v_kind = 'listing'
			union all
			select k.id::text, k.title, case when k.cancelled_at is not null then 'cancelled' when k.completed_at is not null then 'completed' else 'open' end
			from public.coin_contracts k where v_kind = 'contract'
			union all
			select g.id::text, g.name, null from public.greenline_tracks g where v_kind = 'track'
			union all
			select ch.id::text, ch.title, null from public.challenges ch where v_kind = 'challenge'
			union all
			select ts.id::text, ts.label, null from public.classroom_team_sets ts where v_kind = 'team_set' and ts.archived_at is null
			union all
			select st.id, st.ticker || ' ' || st.name, st.kind from public.coin_stocks st where v_kind = 'stock'
			union all
			select ap.id::text, ap.name, null from public.armory_projects ap where v_kind = 'project'
			union all
			select ce.id::text, ce.code || ' ' || ce.name, ce.state from public.cert_certifications ce where v_kind = 'cert'
			union all
			select h.id::text, h.student_email || ' ' || coalesce(d.name, h.role_id), coalesce(d.name, h.role_id)
			from public.coin_role_holders h left join public.coin_role_definitions d on d.id = h.role_id
			where v_kind = 'role_holder' and h.revoked_at is null
		) x
	),
	scored as (
		select c.id, c.name, c.detail,
			case when c.id = v_said or lower(c.id) = lower(v_said) then 3 else public._connector_lookup_hit(c.name, v_said) end as score
		from c
	)
	select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', btrim(s.name), 'detail', s.detail) order by s.score desc, s.name), '[]'::jsonb)
	into v_rows
	from (select * from scored where score > 0 order by score desc, name limit 10) s;
	return jsonb_build_object('kind', v_kind, 'said', v_said, 'matches', v_rows);
end;
$$;
revoke all on function public.connector_lookup(text, text) from public, anon, authenticated;
grant execute on function public.connector_lookup(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. A tournament team with its real players, no placeholder
-- ---------------------------------------------------------------------------

create or replace function public.tournament_host_add_team(
	p_tournament_id uuid,
	p_display_name text,
	p_emails text[],
	p_description text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_t public.tournaments;
	v_team integer;
	v_emails text[];
	v_email text;
	v_user uuid;
	v_name text;
	v_id uuid;
	v_members jsonb := '[]'::jsonb;
begin
	v_t := public._tournament_require_host(p_tournament_id);
	select * into v_t from public.tournaments where id = p_tournament_id for update;
	if v_t.status not in ('registration_open', 'seeding') then
		raise exception 'Teams can only be added while registration is open or during seeding.';
	end if;
	if p_display_name is null or btrim(p_display_name) = '' or char_length(btrim(p_display_name)) > 40 then
		raise exception 'A team name must be 1 to 40 characters.';
	end if;
	select coalesce(array_agg(distinct lower(btrim(x))), '{}') into v_emails
	from unnest(coalesce(p_emails, '{}'::text[])) x where btrim(coalesce(x, '')) <> '';
	if cardinality(v_emails) = 0 then
		raise exception 'Name at least one player by school address.';
	end if;
	v_team := public._tournament_team_size(v_t.config);
	if cardinality(v_emails) > v_team then
		raise exception 'This tournament takes teams of up to %, and % players were named.', v_team, cardinality(v_emails);
	end if;
	foreach v_email in array v_emails loop
		select p.id into v_user from public.profiles p where lower(p.email) = v_email;
		if v_user is null then
			raise exception 'No account found for %. They need to sign in to the site once first.', v_email;
		end if;
		if exists (select 1 from public.tournament_entry_members where tournament_id = p_tournament_id and user_id = v_user)
			or exists (select 1 from public.tournament_entries where tournament_id = p_tournament_id and user_id = v_user) then
			raise exception '% is already registered in this tournament.', v_email;
		end if;
	end loop;
	insert into public.tournament_entries (tournament_id, user_id, display_name, description, thumbnail_url, seed, created_by)
	values (p_tournament_id, null, btrim(p_display_name), coalesce(p_description, ''), null,
		(select coalesce(max(seed), 0) + 1 from public.tournament_entries where tournament_id = p_tournament_id), v_uid)
	returning id into v_id;
	foreach v_email in array v_emails loop
		select p.id, left(coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''), split_part(v_email, '@', 1)), 40)
		into v_user, v_name
		from public.profiles p where lower(p.email) = v_email;
		insert into public.tournament_entry_members (entry_id, tournament_id, user_id, name, added_by, created_at)
		values (v_id, p_tournament_id, v_user, v_name, v_uid, clock_timestamp());
		v_members := v_members || jsonb_build_object('name', v_name, 'email', v_email);
	end loop;
	return jsonb_build_object('ok', true, 'entry_id', v_id, 'team', btrim(p_display_name), 'players', v_members);
end;
$$;
revoke all on function public.tournament_host_add_team(uuid, text, text[], text) from public, anon, authenticated;
grant execute on function public.tournament_host_add_team(uuid, text, text[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The IDEA Market, every card, for staff
-- ---------------------------------------------------------------------------

create or replace function public.coin_market_admin_listings(p_include_closed boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can list every IDEA Market card.';
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', l.id, 'title', l.title, 'zone', l.zone, 'kind', l.kind,
			'owner', case when l.zone = 'official' then 'official' else l.owner_email end,
			'price', l.price, 'class', public._coin_classroom_section_label(l.section_id),
			'featured', l.featured_at is not null, 'featured_at', l.featured_at,
			'hidden', l.hidden_at is not null, 'closed', l.closed_at is not null, 'closed_reason', l.closed_reason,
			'expires_at', l.expires_at, 'created_at', l.created_at
		) order by (l.zone = 'official') desc, (l.featured_at is not null) desc, l.created_at desc)
		from public.coin_market_listings l
		where (coalesce(p_include_closed, false) or l.closed_at is null)
			and (l.zone = 'official' and (public._coin_full_staff() or public._coin_section_in_scope(l.section_id))
				or l.zone = 'student' and public._coin_student_in_scope(l.owner_email))
	), '[]'::jsonb);
end;
$$;
revoke all on function public.coin_market_admin_listings(boolean) from public, anon, authenticated;
grant execute on function public.coin_market_admin_listings(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Contracts: edit, assign, restore
-- ---------------------------------------------------------------------------

-- Every argument left null keeps what is there; p_clear_class takes a
-- contract back to every class.
create or replace function public.coin_admin_edit_contract(
	p_contract_id uuid,
	p_title text default null,
	p_description text default null,
	p_pay_type text default null,
	p_payout_amount integer default null,
	p_hourly_rate numeric default null,
	p_max_contractors integer default null,
	p_section_id uuid default null,
	p_debt_only boolean default null,
	p_clear_class boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v public.coin_contracts;
	v_title text;
	v_pay text;
	v_claims integer;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can change a contract.';
	end if;
	select * into v from public.coin_contracts where id = p_contract_id for update;
	if v.id is null then
		raise exception 'Unknown contract.';
	end if;
	v_title := coalesce(nullif(btrim(coalesce(p_title, '')), ''), v.title);
	if char_length(v_title) > 200 then
		return jsonb_build_object('ok', false, 'reason', 'title');
	end if;
	v_pay := coalesce(p_pay_type, v.pay_type);
	if v_pay not in ('hourly', 'flat', 'quality') then
		return jsonb_build_object('ok', false, 'reason', 'pay_type');
	end if;
	if v_pay = 'hourly' and coalesce(p_hourly_rate, v.hourly_rate) is null then
		return jsonb_build_object('ok', false, 'reason', 'hourly_rate');
	end if;
	if p_hourly_rate is not null and (p_hourly_rate <= 0 or p_hourly_rate > 1000) then
		return jsonb_build_object('ok', false, 'reason', 'hourly_rate');
	end if;
	if p_payout_amount is not null and p_payout_amount <= 0 then
		return jsonb_build_object('ok', false, 'reason', 'payout');
	end if;
	if p_max_contractors is not null then
		select count(*) into v_claims from public.coin_contract_claims where contract_id = v.id;
		if p_max_contractors < 1 or p_max_contractors > 50 or p_max_contractors < v_claims then
			return jsonb_build_object('ok', false, 'reason', 'max_contractors', 'claimed', v_claims);
		end if;
	end if;
	if p_section_id is not null and not exists (select 1 from public.classroom_sections where id = p_section_id) then
		return jsonb_build_object('ok', false, 'reason', 'unknown_class');
	end if;
	update public.coin_contracts set
		title = v_title,
		description = case when p_description is null then description else nullif(btrim(p_description), '') end,
		pay_type = v_pay,
		payout_amount = coalesce(p_payout_amount, payout_amount),
		hourly_rate = case when v_pay = 'hourly' then round(coalesce(p_hourly_rate, hourly_rate), 2) else null end,
		max_contractors = coalesce(p_max_contractors, max_contractors),
		class_section_id = case when coalesce(p_clear_class, false) then null else coalesce(p_section_id, class_section_id) end,
		debt_only = coalesce(p_debt_only, debt_only)
	where id = v.id;
	return jsonb_build_object('ok', true, 'id', v.id, 'title', v_title);
end;
$$;
revoke all on function public.coin_admin_edit_contract(uuid, text, text, text, integer, numeric, integer, uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.coin_admin_edit_contract(uuid, text, text, text, integer, numeric, integer, uuid, boolean, boolean) to authenticated;

-- Put a student on a contract, as if they had claimed it. Allowed past the
-- class and debt-only scope, which is the point of a staff assignment; never
-- past full or onto a closed contract.
create or replace function public.coin_admin_assign_contract(p_contract_id uuid, p_student_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v public.coin_contracts;
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_count integer;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can assign a contract.';
	end if;
	select * into v from public.coin_contracts where id = p_contract_id for update;
	if v.id is null then
		raise exception 'Unknown contract.';
	end if;
	if v.completed_at is not null or v.cancelled_at is not null then
		return jsonb_build_object('ok', false, 'reason', 'not_open');
	end if;
	if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+' then
		return jsonb_build_object('ok', false, 'reason', 'student');
	end if;
	if exists (select 1 from public.coin_contract_claims where contract_id = v.id and student_email = v_email) then
		return jsonb_build_object('ok', false, 'reason', 'already_claimed');
	end if;
	select count(*) into v_count from public.coin_contract_claims where contract_id = v.id;
	if v_count >= v.max_contractors then
		return jsonb_build_object('ok', false, 'reason', 'full', 'max_contractors', v.max_contractors);
	end if;
	insert into public.coin_contract_claims (contract_id, student_email) values (v.id, v_email);
	return jsonb_build_object('ok', true, 'contract_id', v.id, 'student_email', v_email, 'claimed_count', v_count + 1);
end;
$$;
revoke all on function public.coin_admin_assign_contract(uuid, text) from public, anon, authenticated;
grant execute on function public.coin_admin_assign_contract(uuid, text) to authenticated;

create or replace function public.coin_admin_restore_contract(p_contract_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v public.coin_contracts;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can restore a contract.';
	end if;
	select * into v from public.coin_contracts where id = p_contract_id for update;
	if v.id is null then
		raise exception 'Unknown contract.';
	end if;
	if v.cancelled_at is null then
		return jsonb_build_object('ok', false, 'reason', 'not_cancelled');
	end if;
	update public.coin_contracts set cancelled_at = null, cancel_reason = null where id = v.id;
	return jsonb_build_object('ok', true, 'contract_id', v.id);
end;
$$;
revoke all on function public.coin_admin_restore_contract(uuid) from public, anon, authenticated;
grant execute on function public.coin_admin_restore_contract(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. A one-time place to send a file's bytes from a chat
-- ---------------------------------------------------------------------------

create table if not exists public.connector_uploads (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null,
	token_hash text not null unique,
	filename text not null check (char_length(filename) between 1 and 200),
	content_type text,
	max_bytes bigint not null check (max_bytes between 1 and 104857600),
	size_bytes bigint,
	storage_path text,
	created_at timestamptz not null default now(),
	expires_at timestamptz not null,
	uploaded_at timestamptz
);
create index if not exists connector_uploads_user_idx on public.connector_uploads (user_id, created_at desc);
alter table public.connector_uploads enable row level security;
revoke all on table public.connector_uploads from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.connector_uploads to service_role;

do $$
begin
	insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
	values ('connector-uploads', 'connector-uploads', false, 104857600, null)
	on conflict (id) do update set public = false, file_size_limit = 104857600, allowed_mime_types = null;
end;
$$;

-- coin_market_listing_staff: the same as 0276 plus restore, which reopens a
-- card staff removed (latest definition before this file: 0276_coin_market.sql).
create or replace function public.coin_market_listing_staff(p_listing_id uuid, p_action text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_l public.coin_market_listings;
	v_me text := public.current_user_email();
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can moderate the marketplace.';
	end if;
	if p_action is null or p_action not in ('feature', 'unfeature', 'hide', 'unhide', 'remove', 'restore') then
		return jsonb_build_object('ok', false, 'reason', 'action');
	end if;
	select * into v_l from public.coin_market_listings l where l.id = p_listing_id for update;
	if v_l.id is null
		or (v_l.zone = 'student' and not public._coin_student_in_scope(v_l.owner_email))
		or (v_l.zone = 'official' and not (public._coin_full_staff() or public._coin_section_in_scope(v_l.section_id))) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if p_action = 'restore' and coalesce(v_l.closed_reason, '') <> 'removed' then
		return jsonb_build_object('ok', false, 'reason', 'not_removed');
	end if;
	if p_action = 'hide' and char_length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
		return jsonb_build_object('ok', false, 'reason', 'hide_reason');
	end if;
	update public.coin_market_listings l set
		featured_at = case p_action when 'feature' then now() when 'unfeature' then null else l.featured_at end,
		featured_by = case p_action when 'feature' then v_me when 'unfeature' then null else l.featured_by end,
		hidden_at = case p_action when 'hide' then now() when 'unhide' then null else l.hidden_at end,
		hidden_by = case p_action when 'hide' then v_me when 'unhide' then null else l.hidden_by end,
		hidden_reason = case p_action when 'hide' then left(btrim(p_reason), 300) when 'unhide' then null else l.hidden_reason end,
		closed_at = case p_action when 'remove' then now() when 'restore' then null else l.closed_at end,
		closed_reason = case p_action when 'remove' then 'removed' when 'restore' then null else l.closed_reason end,
		expires_at = case when p_action = 'restore' then greatest(l.expires_at, now() + interval '14 days') else l.expires_at end,
		updated_at = now()
	where l.id = v_l.id;
	return jsonb_build_object('ok', true, 'listing_id', v_l.id, 'action', p_action);
end;
$$;

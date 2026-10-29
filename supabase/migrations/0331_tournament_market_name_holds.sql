-- 0331_tournament_market_name_holds.sql
--
-- TOURNAMENT ENTRIES AND IDEA MARKET LISTINGS THAT NAME A CLASSMATE ARE HELD
-- FOR AN OK (ledger 0471, part 3, report 3d4d8b76). The report: during Oct 28
-- grading, team names, taglines and a team theme mocking a named student in
-- another class went live with nothing flagging them; team names, taglines,
-- tournament entries and market listings are to be checked against the
-- rosters on save, and a match to another student's name held for Mr. Pina's
-- OK before it shows.
--
-- 0324 (ledger 0456) built THE ONE CHECK, `_idea_roster_name_hits(text,
-- except)`, and held team names and taglines with it. This file CALLS that
-- function from four more places and states no second copy of it:
--
--   tournament_entries.display_name       an entry's name
--   tournament_entry_members.name         a registrant's roster name
--   tournament_entry_styles.tagline       an entry's tagline
--   coin_market_listings title and text   a student listing on the IDEA Market
--
-- BY TRIGGER, AS 0324 DID, so every write path is covered: registering, a
-- host adding an entry, renaming, joining, the class-team mirror, the
-- connector. The writer's own entry (its registrants) or the listing's own
-- poster is left out of the match, exactly as 0324 leaves out a team's own
-- members.
--
-- WHAT HOLDING MEANS. The text does not show until it is allowed:
--   * an entry name or roster name on a NEW row shows "Name waiting for an
--     OK"; on an edit, the old name stays;
--   * a tagline on a new banner is left empty; on an edit, the old one stays;
--   * a listing is posted HIDDEN (0276's own hidden state, so every read that
--     shows a listing already leaves it out), and its poster reads why.
-- The held text waits in `idea_text_holds`. Allowing it applies it (or
-- unhides the listing); turning it down leaves the stand-in in place, and a
-- listing turned down is closed as removed.
--
-- WHO IS NEVER HELD: staff (a boscotech.edu account, or any admin), and a
-- write with no session at all (the system). A student host is held like
-- any student: anyone may create a tournament (0062).
--
-- WHO DECIDES, on the sign-offs page beside held team names
-- (`idea_text_holds_list`, `idea_text_hold_decide`):
--   * a tournament hold: an admin, or a staff host of that tournament;
--   * a listing hold: coin staff whose scope reaches the poster
--     (`_coin_staff()` and `_coin_student_in_scope`, 0276's own moderation
--     rule for a listing).
-- Anything else answers "That held name does not exist.", the same sentence
-- as a hold that is not there.
--
-- DEPLOY ORDERING: none. No existing function changes; the two reads are new
-- and the page degrades without them.
--
-- WHAT UNDOES IT, a person's paste:
--   drop trigger if exists tournament_entries_name_hold on public.tournament_entries;
--   drop trigger if exists tournament_entry_members_name_hold on public.tournament_entry_members;
--   drop trigger if exists tournament_entry_styles_tagline_hold on public.tournament_entry_styles;
--   drop trigger if exists coin_market_listings_name_hold on public.coin_market_listings;
--   drop function if exists public.idea_text_hold_decide(uuid, boolean), public.idea_text_holds_list(),
--     public._idea_text_hold_trigger(), public._idea_text_hold_put(text, uuid, text, text[]),
--     public._idea_text_hold_exempt(), public._idea_text_hold_may_decide(public.idea_text_holds);
--   drop table if exists public.idea_text_holds;
-- A listing held when this is undone stays hidden; unhide it from the
-- market's staff tools.

do $pre$
begin
	if to_regprocedure('public._idea_roster_name_hits(text, text[])') is null then
		raise exception '0331 cannot apply: _idea_roster_name_hits does not exist. Apply 0324 first.';
	end if;
	if to_regclass('public.tournament_entry_members') is null or to_regclass('public.tournament_entry_styles') is null then
		raise exception '0331 cannot apply: the tournament roster and banner tables do not exist. Apply 0192 first.';
	end if;
	if to_regclass('public.coin_market_listings') is null then
		raise exception '0331 cannot apply: coin_market_listings does not exist. Apply 0276 first.';
	end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- 1. The holds. One row per held text. The target is one of three keys, by
--    kind; each key is deferred so a row can be held in the same statement
--    that creates it.
-- ---------------------------------------------------------------------------

create table if not exists public.idea_text_holds (
	id uuid primary key default gen_random_uuid(),
	kind text not null check (kind in ('tournament_entry', 'tournament_member', 'tournament_tagline', 'market_listing')),
	entry_id uuid references public.tournament_entries (id) on delete cascade deferrable initially deferred,
	member_id uuid references public.tournament_entry_members (id) on delete cascade deferrable initially deferred,
	listing_id uuid references public.coin_market_listings (id) on delete cascade deferrable initially deferred,
	text text not null check (char_length(text) between 1 and 1200),
	hits text[] not null default '{}',
	held_by text not null,
	held_at timestamptz not null default now(),
	status text not null default 'held' check (status in ('held', 'approved', 'rejected', 'superseded')),
	decided_by text,
	decided_at timestamptz,
	constraint idea_text_holds_one_target check (
		(kind in ('tournament_entry', 'tournament_tagline') and entry_id is not null and member_id is null and listing_id is null)
		or (kind = 'tournament_member' and member_id is not null and entry_id is null and listing_id is null)
		or (kind = 'market_listing' and listing_id is not null and entry_id is null and member_id is null))
);

create index if not exists idea_text_holds_open on public.idea_text_holds (kind, status) where status = 'held';

alter table public.idea_text_holds enable row level security;
revoke all on table public.idea_text_holds from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Helpers.
-- ---------------------------------------------------------------------------

-- Never held: no session (the system), staff, or any admin.
create or replace function public._idea_text_hold_exempt()
returns boolean
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce(public.current_user_email(), '') = ''
		or public.role_for_email(public.current_user_email()) = 'teacher'
		or coalesce(public.is_admin(), false);
$f$;

-- Record one held text, superseding any earlier hold on the same target.
create or replace function public._idea_text_hold_put(p_kind text, p_target uuid, p_text text, p_hits text[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $f$
begin
	update public.idea_text_holds set status = 'superseded'
	where status = 'held' and kind = p_kind
		and coalesce(entry_id, member_id, listing_id) = p_target;
	insert into public.idea_text_holds (kind, entry_id, member_id, listing_id, text, hits, held_by)
	values (p_kind,
		case when p_kind in ('tournament_entry', 'tournament_tagline') then p_target end,
		case when p_kind = 'tournament_member' then p_target end,
		case when p_kind = 'market_listing' then p_target end,
		left(p_text, 1200), p_hits, public.current_user_email());
end;
$f$;

-- ---------------------------------------------------------------------------
-- 3. The one trigger function, for all four tables. It decides what text is
--    new, whose names are left out, and what shows while it waits; the match
--    itself is 0324's `_idea_roster_name_hits`.
-- ---------------------------------------------------------------------------

create or replace function public._idea_text_hold_trigger()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_kind text;
	v_target uuid;
	v_entry uuid;
	v_text text;
	v_old text;
	v_except text[];
	v_hits text[];
	v_waiting constant text := 'Name waiting for an OK';
begin
	if tg_table_name = 'tournament_entries' then
		v_kind := 'tournament_entry'; v_target := new.id; v_entry := new.id;
		v_text := new.display_name;
		v_old := case when tg_op = 'UPDATE' then old.display_name end;
	elsif tg_table_name = 'tournament_entry_members' then
		v_kind := 'tournament_member'; v_target := new.id; v_entry := new.entry_id;
		v_text := new.name;
		v_old := case when tg_op = 'UPDATE' then old.name end;
	elsif tg_table_name = 'tournament_entry_styles' then
		v_kind := 'tournament_tagline'; v_target := new.entry_id; v_entry := new.entry_id;
		v_text := new.tagline;
		v_old := case when tg_op = 'UPDATE' then old.tagline
			else (select s.tagline from public.tournament_entry_styles s where s.entry_id = new.entry_id) end;
	else
		if new.zone <> 'student' then
			return new;
		end if;
		v_kind := 'market_listing'; v_target := new.id;
		v_text := btrim(coalesce(new.title, '') || E'\n' || coalesce(new.description, ''));
		v_old := null;
	end if;

	if v_text is not distinct from v_old or coalesce(btrim(v_text), '') = '' then
		return new;
	end if;
	if public._idea_text_hold_exempt() then
		-- An accepted change replaces whatever was waiting for this target.
		update public.idea_text_holds set status = 'superseded'
		where status = 'held' and kind = v_kind and coalesce(entry_id, member_id, listing_id) = v_target;
		return new;
	end if;

	if v_kind = 'market_listing' then
		v_except := array[new.owner_email];
	else
		select coalesce(array_agg(distinct lower(u.email)), '{}') into v_except
		from auth.users u
		where u.id in (
			select m.user_id from public.tournament_entry_members m where m.entry_id = v_entry and m.user_id is not null
			union
			select e.user_id from public.tournament_entries e where e.id = v_entry and e.user_id is not null
		);
		-- A new row's own account is not on the roster yet. Nested, never one
		-- AND: the banner table has no user_id for the expression to name.
		if v_kind in ('tournament_entry', 'tournament_member') then
			if new.user_id is not null then
				v_except := v_except || (select coalesce(array_agg(lower(u.email)), '{}') from auth.users u where u.id = new.user_id);
			end if;
		end if;
	end if;

	v_hits := public._idea_roster_name_hits(v_text, v_except);
	if cardinality(v_hits) = 0 then
		update public.idea_text_holds set status = 'superseded'
		where status = 'held' and kind = v_kind and coalesce(entry_id, member_id, listing_id) = v_target;
		return new;
	end if;

	perform public._idea_text_hold_put(v_kind, v_target, v_text, v_hits);
	if v_kind = 'tournament_entry' then
		new.display_name := coalesce(v_old, v_waiting);
	elsif v_kind = 'tournament_member' then
		new.name := coalesce(v_old, v_waiting);
	elsif v_kind = 'tournament_tagline' then
		new.tagline := v_old;
	else
		new.hidden_at := now();
		new.hidden_by := 'name check';
		new.hidden_reason := 'Waiting for a teacher''s OK because it names a classmate.';
	end if;
	return new;
end;
$f$;

drop trigger if exists tournament_entries_name_hold on public.tournament_entries;
create trigger tournament_entries_name_hold
	before insert or update of display_name on public.tournament_entries
	for each row execute function public._idea_text_hold_trigger();

drop trigger if exists tournament_entry_members_name_hold on public.tournament_entry_members;
create trigger tournament_entry_members_name_hold
	before insert or update of name on public.tournament_entry_members
	for each row execute function public._idea_text_hold_trigger();

drop trigger if exists tournament_entry_styles_tagline_hold on public.tournament_entry_styles;
create trigger tournament_entry_styles_tagline_hold
	before insert or update of tagline on public.tournament_entry_styles
	for each row execute function public._idea_text_hold_trigger();

drop trigger if exists coin_market_listings_name_hold on public.coin_market_listings;
create trigger coin_market_listings_name_hold
	before insert on public.coin_market_listings
	for each row execute function public._idea_text_hold_trigger();

-- ---------------------------------------------------------------------------
-- 4. Who may decide one hold: a tournament's to an admin or a staff host of
--    that tournament; a listing's to coin staff whose scope reaches its
--    poster. False for anything not there.
-- ---------------------------------------------------------------------------

create or replace function public._idea_text_hold_may_decide(h public.idea_text_holds)
returns boolean
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce(case
		when h.id is null or (select auth.uid()) is null then false
		when h.kind = 'market_listing' then
			public._coin_staff() and exists (
				select 1 from public.coin_market_listings l
				where l.id = h.listing_id and public._coin_student_in_scope(l.owner_email))
		else exists (
			select 1 from public.tournament_entries e
			where e.id = coalesce(h.entry_id, (select m.entry_id from public.tournament_entry_members m where m.id = h.member_id))
				and (public.is_admin()
					or (public.role_for_email(public.current_user_email()) = 'teacher'
						and public._tournament_can_manage(e.tournament_id))))
	end, false);
$f$;

-- ---------------------------------------------------------------------------
-- 5. The held texts the caller may decide, oldest first.
-- ---------------------------------------------------------------------------

create or replace function public.idea_text_holds_list()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	select jsonb_build_object('ok', true, 'holds', coalesce(jsonb_agg(jsonb_build_object(
		'id', h.id, 'kind', h.kind,
		'field', case h.kind when 'tournament_entry' then 'entry name' when 'tournament_member' then 'roster name'
			when 'tournament_tagline' then 'tagline' else 'listing' end,
		'text', h.text, 'hits', to_jsonb(h.hits), 'at', h.held_at,
		'by', coalesce(
			(select public._classroom_given_name(e.display_name) from public.classroom_enrollments e
				where e.student_email = h.held_by and e.active order by e.section_id limit 1),
			split_part(h.held_by, '@', 1)),
		'where', case when h.kind = 'market_listing' then 'IDEA Market'
			else 'Tournament: ' || coalesce((select t.name from public.tournaments t
				join public.tournament_entries e on e.tournament_id = t.id
				where e.id = coalesce(h.entry_id, (select m.entry_id from public.tournament_entry_members m where m.id = h.member_id))),
				'a tournament') end
	) order by h.held_at, h.id), '[]'::jsonb))
	from public.idea_text_holds h
	where h.status = 'held' and public._idea_text_hold_may_decide(h);
$f$;

-- ---------------------------------------------------------------------------
-- 6. Allow a held text (it is applied as the decider's own write, which is
--    never held) or turn it down.
-- ---------------------------------------------------------------------------

create or replace function public.idea_text_hold_decide(p_hold_id uuid, p_approve boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	h public.idea_text_holds;
begin
	select * into h from public.idea_text_holds where id = p_hold_id for update;
	if h.id is null or not public._idea_text_hold_may_decide(h) then
		raise exception 'That held name does not exist.';
	end if;
	if h.status <> 'held' then
		return jsonb_build_object('ok', false, 'reason', 'decided', 'status', h.status);
	end if;
	if p_approve is null then
		raise exception 'Choose to allow it or turn it down.';
	end if;
	update public.idea_text_holds
	set status = case when p_approve then 'approved' else 'rejected' end,
		decided_by = public.current_user_email(), decided_at = now()
	where id = h.id;
	if h.kind = 'market_listing' then
		if p_approve then
			update public.coin_market_listings
			set hidden_at = null, hidden_by = null, hidden_reason = null, updated_at = now()
			where id = h.listing_id and hidden_by = 'name check';
		else
			update public.coin_market_listings
			set hidden_reason = 'Turned down by a teacher because it names a classmate.',
				closed_at = coalesce(closed_at, now()), closed_reason = coalesce(closed_reason, 'removed'), updated_at = now()
			where id = h.listing_id and hidden_by = 'name check';
		end if;
	elsif p_approve then
		if h.kind = 'tournament_entry' then
			update public.tournament_entries set display_name = left(h.text, 40) where id = h.entry_id;
		elsif h.kind = 'tournament_member' then
			update public.tournament_entry_members set name = left(h.text, 40) where id = h.member_id;
		else
			update public.tournament_entry_styles set tagline = left(h.text, 48), updated_at = now() where entry_id = h.entry_id;
		end if;
	end if;
	return jsonb_build_object('ok', true, 'status', case when p_approve then 'approved' else 'rejected' end);
end;
$f$;

-- ---------------------------------------------------------------------------
-- 7. Grants, in 0166's shape: the helpers and the trigger function to no
--    client role, the two entry points to authenticated.
-- ---------------------------------------------------------------------------

revoke all on function
	public._idea_text_hold_exempt(),
	public._idea_text_hold_put(text, uuid, text, text[]),
	public._idea_text_hold_trigger(),
	public._idea_text_hold_may_decide(public.idea_text_holds),
	public.idea_text_holds_list(),
	public.idea_text_hold_decide(uuid, boolean)
	from public, anon, authenticated;
grant execute on function
	public.idea_text_holds_list(),
	public.idea_text_hold_decide(uuid, boolean)
	to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Self-check over this file's own names.
-- ---------------------------------------------------------------------------

do $check$
declare
	v_fn text;
	v_n integer;
begin
	foreach v_fn in array array[
		'public._idea_text_hold_exempt()',
		'public._idea_text_hold_put(text, uuid, text, text[])',
		'public._idea_text_hold_trigger()',
		'public._idea_text_hold_may_decide(public.idea_text_holds)',
		'public.idea_text_holds_list()',
		'public.idea_text_hold_decide(uuid, boolean)'
	] loop
		if has_function_privilege('anon', v_fn, 'execute') then
			raise exception '0331: % is executable by anon.', v_fn;
		end if;
	end loop;
	foreach v_fn in array array[
		'public._idea_text_hold_exempt()',
		'public._idea_text_hold_put(text, uuid, text, text[])',
		'public._idea_text_hold_trigger()',
		'public._idea_text_hold_may_decide(public.idea_text_holds)'
	] loop
		if has_function_privilege('authenticated', v_fn, 'execute') then
			raise exception '0331: % is executable by authenticated.', v_fn;
		end if;
	end loop;
	if has_table_privilege('authenticated', 'public.idea_text_holds', 'select')
		or has_table_privilege('anon', 'public.idea_text_holds', 'select') then
		raise exception '0331: idea_text_holds is readable by a client role.';
	end if;
	select count(*) into v_n from pg_trigger
	where not tgisinternal and tgname in ('tournament_entries_name_hold', 'tournament_entry_members_name_hold',
		'tournament_entry_styles_tagline_hold', 'coin_market_listings_name_hold');
	if v_n <> 4 then
		raise exception '0331: expected 4 name-hold triggers, found %.', v_n;
	end if;
	raise notice '0331: tournament entries and market listings now hold a classmate''s name for an OK; % holds on file.',
		(select count(*) from public.idea_text_holds);
end
$check$;

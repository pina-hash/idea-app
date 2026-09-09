-- 0192_tournament_entry_members_and_admin_hosts.sql
--
-- AN ENTRY HOLDS ONE OR MORE REGISTRANTS, A SITE ADMIN IS A HOST EVERYWHERE,
-- AND A CONTENDER RENAMES THEIR ENTRY UNTIL THE BRACKET EXISTS. Three asks
-- from prompt 0110 (items 5, 6 and 7 in its ledger entry), landed as one file
-- because the third changes what the first two have to be true OF: once an
-- entry is a roster rather than a person, "the owner" is a set, and every rule
-- that used to read `entries.user_id = auth.uid()` has to read the set.
--
-- ---------------------------------------------------------------------------
-- WHAT 0062 BUILT, AND WHERE IT STOPPED
-- ---------------------------------------------------------------------------
-- `tournament_entries.user_id` is one account per entry, nullable for a
-- walk-up a host typed in by hand, and `tournament_entries_one_per_user`
-- makes it one entry per account per tournament. Every write the entry's own
-- player may make (0064's banner editor) is gated on that column, every reward
-- (0063) is paid to that column, and every host action is gated on
-- `_tournament_require_host`, which asks `tournament_hosts` and nothing else.
-- So a two-person robot team was one account with a shared name, a teammate
-- earned nothing, a host could not hand off a tournament to staff without
-- adding them as a host first, and an entry name was fixed at registration --
-- there was no RPC that changed it, ever.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DOES
-- ---------------------------------------------------------------------------
--
-- 1. `public.tournament_entry_members` -- the roster under an entry. One row
--    per registrant; `user_id` is null for a teammate with no account (a
--    walk-up's teammate, or a name a captain typed in). `name` is the CHOSEN
--    name and never a profile name -- 0062's identity rule, kept: nothing here
--    surfaces a Google account name. Public read, zero client writes, the 0062
--    loop shape. Realtime through the 0062 guard (publication-existence first),
--    so a test database with no publication still applies the file.
--
--    INVARIANT: EVERY ENTRY HAS AT LEAST ONE MEMBER. The CAPTAIN is the member
--    whose `user_id` equals `tournament_entries.user_id`; for an unlinked entry
--    it is the oldest member. The backfill below inserts one member for every
--    existing entry that has none (user_id, name, added_by and created_at all
--    copied off the entry row), reports the count, and REFUSES if any entry is
--    still bare. It is idempotent by construction rather than by a catalog
--    guard: it inserts only where no member exists, and after the first run no
--    such entry exists, so a re-paste inserts nothing and rewrites nothing.
--
--    `tournament_entry_members_one_per_user` extends 0062's one-entry-per-
--    account rule to teammates: an account is on at most one entry in a
--    tournament, whether as its captain or as a member.
--
-- 2. ADMIN IS A HOST EVERYWHERE. `_tournament_require_host` (0062) now passes a
--    caller who holds a `tournament_hosts` row OR `public.is_admin()`. Same
--    signature, same `for update` lock, same not-found; one clause and one
--    message changed. Because 0062 through 0065 all route their host actions
--    through it, this re-gates every host RPC at once -- update, status moves,
--    host-added entries, invites, seeding, the bracket, match control, reward
--    rules, pings -- with no second statement of the rule. `tournament_delete`
--    (0068) never called it (it reads the host row itself so it can lock and
--    count in one place) and is redefined here with `is_teacher()` swapped for
--    `public.is_admin()` -- 0067's naming trap says never to write a new
--    `is_teacher()` call, and this file writes none -- and with the new table
--    in its teardown. `_tournament_can_manage(uuid)` is the same predicate as
--    a boolean, for the entry-side RPCs below that need "host or admin" as one
--    branch of a wider rule rather than as a refusal.
--
-- 3. `team_size` IN THE CONFIG. `_tournament_normalize_config` reads it
--    (integer, default 1, 1..6) and returns it in the canonical object.
--    `tournament_update` already locks the format once the bracket exists; it
--    additionally refuses a `team_size` smaller than the largest entry's
--    roster, because the normalizer cannot see the tournament and the refusal
--    has to name the number. A config written before this file has no
--    `team_size` key and reads as 1 everywhere (`_tournament_team_size`).
--
--    THE ONE PLACE WHOLE-OBJECT REPLACEMENT IS SOFTENED, AND WHY. 0062's
--    `tournament_update` treats `p_config` as the whole object: what is sent
--    is normalized and what is not sent takes the normalizer's default. That
--    was harmless while every key was a format knob a client always resent.
--    `team_size` is not one: a deployed client that knows nothing about it
--    resends `best_of` alone, and under whole-object replacement that call
--    would silently shrink a team event to solo -- and then the floor check
--    below would REFUSE the very call the host meant as a best_of change,
--    naming a number they never typed. So when `p_config` is an object with
--    no `team_size` key, `tournament_update` folds the STORED value in
--    (`coalesce((config->>'team_size')::integer, 1)`) before normalizing.
--    A key that is present is honoured exactly as before, including a
--    deliberate `team_size: 1`; only ABSENCE keeps the stored value. No
--    other key is softened this way, on purpose: the others have no
--    deployed client that omits them, and a second softened key is a second
--    rule to keep in step with the normalizer's defaults.
--
-- 4. REWARDS PAY EVERY REGISTRANT. `tournament_reward_ledger` gains
--    `member_id` (null on every row written before this file), and
--    `_tournament_award` writes ONE ROW PER MEMBER of the entry, each carrying
--    the FULL amount, `user_id` = that member's account (null for an unlinked
--    teammate) and `member_id` = that member's row. An entry that somehow has
--    no member rows gets the single legacy row (user_id = the entry's,
--    member_id null) so a payout is never silently skipped. The callers
--    (`_tournament_award_match_win`, `_tournament_award_placements`) are
--    untouched, and the placement settle guard -- any ledger row with a null
--    match_id -- still holds, because a per-member placement row is still a
--    null-match row.
--
--    CONSEQUENCE, STATED SO NOBODY READS IT AS A BUG: `tournament_delete`'s
--    "total coins paid" (`sum(amount)`) now counts every registrant's rows,
--    which is the true total that was credited, and its "entries paid"
--    (`count(distinct entry_id)`) is unchanged.
--
-- 5. RENAME WHILE NOT STARTED. `tournament_update_entry` changes an entry's
--    display name, description and thumbnail. Caller: a linked member of the
--    entry (any member row with user_id = auth.uid(), which includes the
--    captain) OR `_tournament_can_manage`. NOT STARTED means
--    `tournaments.status not in ('live', 'complete')`: the bracket is what
--    starts an event and `tournament_generate_bracket` is what stamps `live`;
--    qualifying pools run during `seeding` and a name change there is
--    harmless. After that, EVERYONE is refused -- the owner, a host and an
--    admin alike -- with 'Entry names lock once the bracket is generated.'
--    ONE RULE, NO HOST CARVE-OUT: a bracket is a printed thing by then, and
--    the name on the projector, the name in the match events and the name on
--    the ledger have to stay one name.
--
-- 6. THE MEMBERS RPCs. `tournament_add_entry_member` (a member or a manager
--    adds an UNLINKED teammate by name; a manager -- a host or an admin --
--    may additionally resolve an account by email and add it as a LINKED
--    member), `tournament_join_entry` (a signed-in account joins an entry
--    itself), `tournament_remove_entry_member` (leaving, or the captain or a
--    manager removing a teammate; never the last member, never the
--    registering account while others remain), `tournament_rename_entry_member`
--    (the same not-started rule as item 5). Every one locks the tournament
--    row `for update` first (0062's serialization rule) and checks
--    `auth.uid()` before anything else. "Registration window" is
--    `registration_open` or `seeding`, exactly as `tournament_host_add_entry`
--    reads it.
--
--    ADDING BY ACCOUNT IS A MANAGER ACTION, NOT A CAPTAIN'S. A captain who
--    could put any account on their roster by typing its email would be
--    registering somebody else in a tournament without their consent -- the
--    one-per-tournament index then REFUSES that account its own entry, and
--    nothing tells them why. So the email branch refuses a caller who is not
--    a host or an admin with 'Only a tournament host or a site admin can add
--    a teammate by account. Teammates with an account can join the entry
--    themselves.' A captain adds unlinked teammates by name exactly as
--    before, and a teammate with an account joins through
--    `tournament_join_entry`, which is the consent path: the account itself
--    is the caller. The refusal is raised BEFORE the window and the capacity
--    checks, because it is about who is asking and not about the entry.
--
--    THE ENTRY IS READ BEFORE THE LOCK AND RE-CHECKED AFTER IT. Each of these
--    RPCs has to read the entry (or the member) row to learn WHICH tournament
--    to lock, so that read necessarily happens unlocked; a host removing the
--    entry (`tournament_remove_entry`, which holds the lock) can commit
--    between that read and the lock being granted. Without a re-check the
--    rename would become a silent 0-row update reported as success, and the
--    member insert a raw foreign-key error. So after the lock every one of
--    them re-asks whether its row still exists and refuses 'Entry not found.'
--    (or 'Registrant not found.') if it went away -- the same sentence the
--    caller would have got a moment earlier.
--
--    `tournament_register_entry` gains a WIDE form,
--    `(uuid, text, text, text, p_member_name text, p_teammates text[])`, with
--    NO defaults, that writes the captain member and one unlinked member per
--    teammate; the NARROW 0062 form keeps its signature and defaults verbatim
--    and becomes a thin wrapper calling the wide one with (null, null). That is
--    CLAUDE.md's exception to the signature trap: a deployed client calling
--    with four keys binds only the narrow form, a new client calling with six
--    binds only the wide one, and no payload can bind to both. The wide
--    signature is `drop function if exists`ed before it is created because
--    Postgres refuses to remove a default through `create or replace`, and a
--    file that cannot be re-pasted is a file that fails exactly when someone
--    retries it. `tournament_host_add_entry` and `tournament_respond_invite`
--    are the 0062 bodies plus the captain member insert.
--
--    NOTHING LOGS TO `tournament_match_events`. No event type there fits a
--    roster change, and a pre-bracket name is not audit-worthy; the stream
--    stays what 0062 made it, a record of the matches.
--
-- 7. `tournament_set_entry_style` (0064) reads the roster instead of the
--    column: a LINKED MEMBER of the entry may restyle it; a host or admin may
--    restyle an entry with NO linked member (an unlinked walk-up); a host or
--    admin may NOT restyle an entry that has a linked member, because that
--    banner is the student's identity. `tournament_ping_entry` (0063) returns
--    `user_ids`, every linked member's account, with `user_id` kept as the
--    first of them for a client that has not been redeployed, and refuses only
--    when there is nobody to notify.
--
-- EVERY REDECLARED FUNCTION IS ITS SOURCE BODY COPIED VERBATIM PLUS THE ONE
-- STATED CHANGE, then diffed against the source file. The diffs, so a reader
-- can check them without a second window:
--   _tournament_require_host   0062: `or public.is_admin()` in the exists test;
--                              one message.
--   _tournament_normalize_config 0062: two declarations, one parse block, one
--                              key in the returned object.
--   tournament_update          0062: three declarations (v_config, v_largest,
--                              v_team) and one added block between the lock
--                              check and the update -- the team_size fold-in
--                              (item 3) and the roster floor -- and the update
--                              normalizes v_config where 0062 normalized
--                              p_config (the normalizer is deterministic, so
--                              the call inside the update is the block's own
--                              answer).
--   tournament_register_entry  0062: the body moves to the wide form; it gains
--                              the roster half of "already registered" (an
--                              account on somebody else's entry), the teammate
--                              validation before the entry insert and the
--                              member inserts after it; the narrow form is a
--                              one-line wrapper.
--   tournament_host_add_entry  0062: the roster half of "already registered"
--                              for the linked user, and the captain member
--                              insert after the entry insert.
--   tournament_respond_invite  0062: the roster half of "already registered"
--                              (an invitee on somebody else's entry accepts
--                              as a no-op, exactly like one who already holds
--                              an entry), `returning id into v_id` on the
--                              entry insert (one new declaration) and the
--                              captain member insert after it.
--   _tournament_award          0063: the per-member select in place of the
--                              single-row select, with the legacy row as the
--                              no-member branch.
--   tournament_ping_entry      0063: the linked-account test reads the roster;
--                              one added key in the returned object.
--   tournament_set_entry_style 0064: the authorization block.
--   tournament_delete          0068: `is_teacher()` -> `public.is_admin()`, its
--                              message, and one teardown line.
--
-- GRANTS. Every public function here: `revoke all ... from public, anon,
-- authenticated, service_role; grant execute ... to authenticated;` -- the
-- four roles by name, because this project's default privileges hand every
-- new function a direct `anon` grant that `from public` alone does not remove
-- (CLAUDE.md, the `revoke ... from public` rule), and 0137 ran before this
-- file on production, so nothing created here is covered by it. Every
-- `_tournament_*` helper: revoked from all four, no grant; definer callers
-- reach it as the owner.
--
-- ---------------------------------------------------------------------------
-- WHAT UNDOES IT
-- ---------------------------------------------------------------------------
-- Re-paste 0062 sections 4-6 (`_tournament_require_host`,
-- `_tournament_normalize_config`, `tournament_update`,
-- `tournament_register_entry`, `tournament_host_add_entry`,
-- `tournament_respond_invite`), 0063's `_tournament_award` and
-- `tournament_ping_entry`, 0064's `tournament_set_entry_style` and 0068's
-- `tournament_delete`; then
--   drop function public.tournament_register_entry(uuid, text, text, text, text, text[]);
--   drop function public.tournament_update_entry(uuid, text, text, text);
--   drop function public.tournament_add_entry_member(uuid, text, text);
--   drop function public.tournament_join_entry(uuid, text);
--   drop function public.tournament_remove_entry_member(uuid);
--   drop function public.tournament_rename_entry_member(uuid, text);
--   drop function public._tournament_can_manage(uuid);
--   drop function public._tournament_team_size(jsonb);
--   alter table public.tournament_reward_ledger drop column member_id;
--   drop table public.tournament_entry_members;
-- The table drop is what loses data (every teammate, every chosen roster
-- name); the ledger rows written per member survive minus their member_id.
-- A `team_size` key left in `tournaments.config` is ignored by the 0062
-- normalizer on the next update and does no harm until then.
--
-- Apply manually in the Supabase SQL editor, after 0189. Idempotent: the file
-- re-applies over itself and moves nothing.
--
-- ---------------------------------------------------------------------------
-- VERIFICATION QUERY (paste after applying; the expected answers follow it)
-- ---------------------------------------------------------------------------
--   select
--     (select count(*) from public.tournament_entry_members) as members,
--     (select count(*) from public.tournament_entries e
--        where not exists (select 1 from public.tournament_entry_members m where m.entry_id = e.id)) as entries_without_members,
--     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--        where n.nspname = 'public' and p.proname = 'tournament_register_entry') as register_overloads,
--     (select bool_and(p.pronargdefaults = 0) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--        where n.nspname = 'public' and p.proname = 'tournament_register_entry' and p.pronargs = 6) as wide_form_has_no_defaults,
--     (select position('is_admin' in p.prosrc) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--        where n.nspname = 'public' and p.proname = '_tournament_require_host') as host_guard_admin_aware,
--     (select exists (select 1 from information_schema.columns
--        where table_schema = 'public' and table_name = 'tournament_reward_ledger' and column_name = 'member_id')) as ledger_member_column,
--     (select not has_function_privilege('anon', 'public.tournament_join_entry(uuid, text)', 'execute')) as anon_cannot_join;
--
-- Expected: entries_without_members 0, register_overloads 2,
-- wide_form_has_no_defaults true, host_guard_admin_aware true,
-- ledger_member_column true, anon_cannot_join true. `members` is at least the
-- entry count.

-- ---------------------------------------------------------------------------
-- 1. The roster table
-- ---------------------------------------------------------------------------

create table if not exists public.tournament_entry_members (
	id uuid primary key default gen_random_uuid(),
	entry_id uuid not null references public.tournament_entries (id) on delete cascade,
	-- Denormalized for the realtime filter, like tournament_match_games.
	tournament_id uuid not null references public.tournaments (id) on delete cascade,
	-- Null = no account (a walk-up teammate, or a name a captain typed in).
	user_id uuid references auth.users (id) on delete set null,
	-- The CHOSEN name; never a profile name.
	name text not null check (char_length(btrim(name)) between 1 and 40),
	added_by uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now()
);

create index if not exists tournament_entry_members_entry_idx
	on public.tournament_entry_members (entry_id);
create index if not exists tournament_entry_members_tournament_idx
	on public.tournament_entry_members (tournament_id);
-- One entry per account per tournament: 0062's rule, extended to teammates.
create unique index if not exists tournament_entry_members_one_per_user
	on public.tournament_entry_members (tournament_id, user_id)
	where user_id is not null;

-- Public read, zero client writes: the 0062 loop shape for one table.
revoke all on public.tournament_entry_members from anon, authenticated;
grant select on public.tournament_entry_members to anon, authenticated;
alter table public.tournament_entry_members enable row level security;
drop policy if exists "public read" on public.tournament_entry_members;
create policy "public read"
	on public.tournament_entry_members
	for select
	to anon, authenticated
	using (true);

-- ---------------------------------------------------------------------------
-- 2. The ledger column: which registrant a payout row is for. Null on every
-- row written before this file.
-- ---------------------------------------------------------------------------

alter table public.tournament_reward_ledger
	add column if not exists member_id uuid
		references public.tournament_entry_members (id) on delete set null;

create index if not exists tournament_reward_ledger_member_idx
	on public.tournament_reward_ledger (member_id);

-- ---------------------------------------------------------------------------
-- 3. Backfill: one member per bare entry. Idempotent by construction (see the
-- header); refuses if any entry is still bare afterwards.
-- ---------------------------------------------------------------------------

do $$
declare
	v_inserted integer;
	v_bare integer;
begin
	insert into public.tournament_entry_members
		(entry_id, tournament_id, user_id, name, added_by, created_at)
	select e.id, e.tournament_id, e.user_id, e.display_name, e.created_by, e.created_at
	from public.tournament_entries e
	where not exists (
		select 1 from public.tournament_entry_members m where m.entry_id = e.id
	);
	get diagnostics v_inserted = row_count;

	select count(*) into v_bare
	from public.tournament_entries e
	where not exists (
		select 1 from public.tournament_entry_members m where m.entry_id = e.id
	);

	raise notice '0192: backfilled % member row(s), one per entry that had none.', v_inserted;
	if v_bare > 0 then
		raise exception '0192: % entry/entries still have no member row after the backfill.', v_bare;
	end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Helpers (no grants: definer callers only)
-- ---------------------------------------------------------------------------

-- 0062's body verbatim plus `or public.is_admin()` and its message. The lock
-- and the not-found are unchanged; every host RPC in 0062-0065 calls this, so
-- this one clause is what makes an admin a host everywhere.
create or replace function public._tournament_require_host(p_tournament_id uuid)
returns public.tournaments
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_t public.tournaments;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	select * into v_t from public.tournaments where id = p_tournament_id for update;
	if not found then
		raise exception 'Tournament not found.';
	end if;
	if not (
		exists (
			select 1 from public.tournament_hosts
			where tournament_id = p_tournament_id and user_id = v_uid
		)
		or public.is_admin()
	) then
		raise exception 'Only a tournament host or a site admin can do that.';
	end if;
	return v_t;
end;
$$;

revoke all on function public._tournament_require_host(uuid)
	from public, anon, authenticated, service_role;

-- The same predicate as a boolean: a host row for auth.uid(), or an admin.
-- False with no session. Takes NO lock -- its callers lock the tournament
-- themselves, before asking.
create or replace function public._tournament_can_manage(p_tournament_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
begin
	if v_uid is null then
		return false;
	end if;
	return exists (
		select 1 from public.tournament_hosts
		where tournament_id = p_tournament_id and user_id = v_uid
	) or public.is_admin();
end;
$$;

revoke all on function public._tournament_can_manage(uuid)
	from public, anon, authenticated, service_role;

-- The one reading of team_size off a stored config: a config written before
-- this file has no key and is a solo tournament.
create or replace function public._tournament_team_size(p_config jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
	select greatest(1, coalesce((p_config ->> 'team_size')::integer, 1));
$$;

revoke all on function public._tournament_team_size(jsonb)
	from public, anon, authenticated, service_role;

-- 0062's body verbatim plus team_size.
create or replace function public._tournament_normalize_config(p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_in jsonb := coalesce(p_config, '{}'::jsonb);
	v_quals boolean;
	v_score boolean;
	v_default integer;
	v_best_of jsonb;
	v_key text;
	v_val integer;
	v_team integer;
begin
	if jsonb_typeof(v_in) <> 'object' then
		raise exception 'Config must be a JSON object.';
	end if;
	v_quals := coalesce((v_in ->> 'quals_enabled')::boolean, false);
	v_score := coalesce((v_in ->> 'score_entry')::boolean, false);
	v_default := coalesce((v_in ->> 'best_of_default')::integer, 1);
	if v_default < 1 or v_default > 15 or v_default % 2 = 0 then
		raise exception 'best_of_default must be an odd number from 1 to 15.';
	end if;
	v_best_of := coalesce(v_in -> 'best_of', '{}'::jsonb);
	if jsonb_typeof(v_best_of) <> 'object' then
		raise exception 'best_of must be a JSON object of round overrides.';
	end if;
	for v_key in select jsonb_object_keys(v_best_of) loop
		if v_key !~ '^(winners|losers|grand_final)(:[0-9]{1,2})?$' then
			raise exception
				'Unknown best_of key "%": use winners, losers, grand_final, winners:<round> or losers:<round>.',
				v_key;
		end if;
		begin
			v_val := (v_best_of ->> v_key)::integer;
		exception when others then
			raise exception 'best_of.% must be a number.', v_key;
		end;
		if v_val < 1 or v_val > 15 or v_val % 2 = 0 then
			raise exception 'best_of.% must be an odd number from 1 to 15.', v_key;
		end if;
	end loop;
	begin
		v_team := coalesce((v_in ->> 'team_size')::integer, 1);
	exception when others then
		raise exception 'team_size must be a whole number from 1 to 6.';
	end;
	if v_team < 1 or v_team > 6 then
		raise exception 'team_size must be a whole number from 1 to 6.';
	end if;
	return jsonb_build_object(
		'quals_enabled', v_quals,
		'score_entry', v_score,
		'best_of_default', v_default,
		'best_of', v_best_of,
		'team_size', v_team
	);
end;
$$;

revoke all on function public._tournament_normalize_config(jsonb)
	from public, anon, authenticated, service_role;

-- 0063's helper, now one row per member. Rows are written captain-first, then
-- by roster order, so the ledger reads the way the roster does.
create or replace function public._tournament_award(
	p_tournament_id uuid,
	p_entry_id uuid,
	p_amount integer,
	p_reason text,
	p_match_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
	-- 0192 award: one row per member (begin)
	insert into public.tournament_reward_ledger
		(tournament_id, entry_id, user_id, amount, reason, match_id, member_id)
	select x.tournament_id, x.entry_id, x.user_id, x.amount, x.reason, x.match_id, x.member_id
	from (
		select p_tournament_id as tournament_id, e.id as entry_id, m.user_id, p_amount as amount,
			p_reason as reason, p_match_id as match_id, m.id as member_id,
			(m.user_id is not null and m.user_id = e.user_id) as is_captain,
			m.created_at as member_created
		from public.tournament_entries e
		join public.tournament_entry_members m on m.entry_id = e.id
		where e.id = p_entry_id
		union all
		-- The legacy row, ONLY for an entry with no member rows at all, so a
		-- payout is never silently skipped.
		select p_tournament_id, e.id, e.user_id, p_amount, p_reason, p_match_id, null::uuid,
			true, e.created_at
		from public.tournament_entries e
		where e.id = p_entry_id
			and not exists (select 1 from public.tournament_entry_members m where m.entry_id = e.id)
	) x
	order by x.is_captain desc, x.member_created asc, x.member_id asc;
	-- 0192 award: one row per member (end)
$$;

revoke all on function public._tournament_award(uuid, uuid, integer, text, uuid)
	from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Tournament management: the 0062 update body plus the team_size floor
-- ---------------------------------------------------------------------------

create or replace function public.tournament_update(
	p_tournament_id uuid,
	p_name text default null,
	p_description text default null,
	p_config jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_t public.tournaments;
	v_config jsonb := p_config;
	v_largest integer;
	v_team integer;
begin
	v_t := public._tournament_require_host(p_tournament_id);
	if p_name is not null then
		if btrim(p_name) = '' or char_length(btrim(p_name)) > 80 then
			raise exception 'Tournament name must be 1 to 80 characters.';
		end if;
	end if;
	-- Format rules are locked once the bracket exists: matches were stamped
	-- from them.
	if p_config is not null and v_t.status in ('live', 'complete') then
		raise exception 'Format settings are locked once the bracket is generated.';
	end if;
	if p_config is not null then
		-- THE ONE SOFTENING OF WHOLE-OBJECT REPLACEMENT (header, item 3): a
		-- config with NO team_size key keeps the STORED value rather than the
		-- normalizer's default of 1, so a client resending best_of alone does
		-- not silently shrink a team event. A key that is present, 1 included,
		-- is honoured as sent. A non-object is left for the normalizer's own
		-- refusal.
		if jsonb_typeof(v_config) = 'object' and not (v_config ? 'team_size') then
			v_config := v_config || jsonb_build_object(
				'team_size', coalesce((v_t.config ->> 'team_size')::integer, 1)
			);
		end if;
		-- A team_size below the largest roster already registered would leave
		-- an entry over the cap with no way to say so; refuse with the number.
		v_team := public._tournament_team_size(public._tournament_normalize_config(v_config));
		select coalesce(max(c.n), 0) into v_largest
		from (
			select count(*) as n from public.tournament_entry_members
			where tournament_id = p_tournament_id
			group by entry_id
		) c;
		if v_largest > v_team then
			raise exception 'team_size cannot be lower than the largest entry (% registrants).', v_largest;
		end if;
	end if;
	update public.tournaments
	set name = coalesce(btrim(p_name), name),
		description = coalesce(p_description, description),
		config = case when p_config is null then config
			else public._tournament_normalize_config(v_config) end
	where id = p_tournament_id;
end;
$$;

revoke all on function public.tournament_update(uuid, text, text, jsonb)
	from public, anon, authenticated, service_role;
grant execute on function public.tournament_update(uuid, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Registration: the wide form, the narrow wrapper, and the two other entry
-- writers, each with the captain member insert.
-- ---------------------------------------------------------------------------

-- The wide signature is dropped first: Postgres refuses to remove a default
-- through `create or replace`, and a re-paste over a machine that took an
-- earlier draft must still land. NO DEFAULTS, so a four-key call can never
-- bind here (the signature-trap exception in CLAUDE.md).
drop function if exists public.tournament_register_entry(uuid, text, text, text, text, text[]);

create function public.tournament_register_entry(
	p_tournament_id uuid,
	p_display_name text,
	p_description text,
	p_thumbnail_url text,
	p_member_name text,
	p_teammates text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_t public.tournaments;
	v_id uuid;
	v_team integer;
	v_names text[] := '{}'::text[];
	v_name text;
	v_captain text;
begin
	if v_uid is null then
		raise exception 'You must be signed in to register.';
	end if;
	select * into v_t from public.tournaments where id = p_tournament_id for update;
	if not found then
		raise exception 'Tournament not found.';
	end if;
	if v_t.status <> 'registration_open' then
		raise exception 'Registration is not open for this tournament.';
	end if;
	if p_display_name is null or btrim(p_display_name) = ''
		or char_length(btrim(p_display_name)) > 40 then
		raise exception 'Display name must be 1 to 40 characters.';
	end if;
	if exists (
		select 1 from public.tournament_entries
		where tournament_id = p_tournament_id and user_id = v_uid
	) then
		raise exception 'You are already registered for this tournament.';
	end if;
	-- Since 0192: an account on somebody else's roster is registered too.
	if exists (
		select 1 from public.tournament_entry_members
		where tournament_id = p_tournament_id and user_id = v_uid
	) then
		raise exception 'You are already registered for this tournament.';
	end if;
	-- The roster, validated before anything is written.
	v_captain := coalesce(nullif(btrim(p_member_name), ''), btrim(p_display_name));
	if char_length(v_captain) > 40 then
		raise exception 'Your roster name must be 1 to 40 characters.';
	end if;
	foreach v_name in array coalesce(p_teammates, '{}'::text[]) loop
		if v_name is null or btrim(v_name) = '' then
			continue;
		end if;
		if char_length(btrim(v_name)) > 40 then
			raise exception 'Teammate names must be 1 to 40 characters.';
		end if;
		v_names := array_append(v_names, btrim(v_name));
	end loop;
	v_team := public._tournament_team_size(v_t.config);
	if 1 + cardinality(v_names) > v_team then
		raise exception 'This tournament allows entries of up to % registrants.', v_team;
	end if;
	insert into public.tournament_entries
		(tournament_id, user_id, display_name, description, thumbnail_url, seed, created_by)
	values
		(p_tournament_id, v_uid, btrim(p_display_name), coalesce(p_description, ''),
			nullif(btrim(coalesce(p_thumbnail_url, '')), ''),
			(select coalesce(max(seed), 0) + 1 from public.tournament_entries
				where tournament_id = p_tournament_id),
			v_uid)
	returning id into v_id;
	-- The captain, then the teammates in the order they were typed.
	-- `clock_timestamp()` rather than the column's `now()` default: `now()` is
	-- TRANSACTION time, so every row of one registration would tie on
	-- created_at and the roster's order would fall to a random uuid.
	insert into public.tournament_entry_members (entry_id, tournament_id, user_id, name, added_by, created_at)
	values (v_id, p_tournament_id, v_uid, v_captain, v_uid, clock_timestamp());
	foreach v_name in array v_names loop
		insert into public.tournament_entry_members (entry_id, tournament_id, user_id, name, added_by, created_at)
		values (v_id, p_tournament_id, null, v_name, v_uid, clock_timestamp());
	end loop;
	return v_id;
end;
$$;

revoke all on function public.tournament_register_entry(uuid, text, text, text, text, text[])
	from public, anon, authenticated, service_role;
grant execute on function public.tournament_register_entry(uuid, text, text, text, text, text[])
	to authenticated;

-- The 0062 signature, defaults included, verbatim: a thin wrapper. Every
-- refusal a deployed client has ever seen from this form is raised by the
-- wide one in the same words.
create or replace function public.tournament_register_entry(
	p_tournament_id uuid,
	p_display_name text,
	p_description text default '',
	p_thumbnail_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
	return public.tournament_register_entry(
		p_tournament_id, p_display_name, p_description, p_thumbnail_url,
		null::text, null::text[]
	);
end;
$$;

revoke all on function public.tournament_register_entry(uuid, text, text, text)
	from public, anon, authenticated, service_role;
grant execute on function public.tournament_register_entry(uuid, text, text, text) to authenticated;

-- 0062's body verbatim plus the captain member insert.
create or replace function public.tournament_host_add_entry(
	p_tournament_id uuid,
	p_display_name text,
	p_description text default '',
	p_thumbnail_url text default null,
	p_linked_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_t public.tournaments;
	v_id uuid;
begin
	v_t := public._tournament_require_host(p_tournament_id);
	if v_t.status not in ('registration_open', 'seeding') then
		raise exception 'Entries can only be added while registration is open or during seeding.';
	end if;
	if p_display_name is null or btrim(p_display_name) = ''
		or char_length(btrim(p_display_name)) > 40 then
		raise exception 'Display name must be 1 to 40 characters.';
	end if;
	if p_linked_user_id is not null then
		if not exists (select 1 from public.profiles where id = p_linked_user_id) then
			raise exception 'No account found for the linked user.';
		end if;
		if exists (
			select 1 from public.tournament_entries
			where tournament_id = p_tournament_id and user_id = p_linked_user_id
		) then
			raise exception 'That user is already registered for this tournament.';
		end if;
		if exists (
			select 1 from public.tournament_entry_members
			where tournament_id = p_tournament_id and user_id = p_linked_user_id
		) then
			raise exception 'That user is already registered for this tournament.';
		end if;
	end if;
	insert into public.tournament_entries
		(tournament_id, user_id, display_name, description, thumbnail_url, seed, created_by)
	values
		(p_tournament_id, p_linked_user_id, btrim(p_display_name), coalesce(p_description, ''),
			nullif(btrim(coalesce(p_thumbnail_url, '')), ''),
			(select coalesce(max(seed), 0) + 1 from public.tournament_entries
				where tournament_id = p_tournament_id),
			v_uid)
	returning id into v_id;
	insert into public.tournament_entry_members (entry_id, tournament_id, user_id, name, added_by)
	values (v_id, p_tournament_id, p_linked_user_id, btrim(p_display_name), v_uid);
	return v_id;
end;
$$;

revoke all on function public.tournament_host_add_entry(uuid, text, text, text, uuid)
	from public, anon, authenticated, service_role;
grant execute on function public.tournament_host_add_entry(uuid, text, text, text, uuid)
	to authenticated;

-- 0062's body verbatim plus `returning id into v_id` and the captain member
-- insert.
create or replace function public.tournament_respond_invite(
	p_invite_id uuid,
	p_accept boolean,
	p_display_name text default null,
	p_description text default '',
	p_thumbnail_url text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_inv public.tournament_invites;
	v_t public.tournaments;
	v_id uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	select * into v_inv from public.tournament_invites where id = p_invite_id for update;
	if not found then
		raise exception 'Invite not found.';
	end if;
	if v_inv.invited_user_id <> v_uid then
		raise exception 'This invite is not yours.';
	end if;
	if v_inv.status <> 'pending' then
		raise exception 'This invite was already %.', v_inv.status;
	end if;

	if not coalesce(p_accept, false) then
		update public.tournament_invites
		set status = 'declined', responded_at = now()
		where id = p_invite_id;
		return;
	end if;

	select * into v_t from public.tournaments where id = v_inv.tournament_id for update;
	if v_t.status not in ('registration_open', 'seeding') then
		raise exception 'This tournament is no longer accepting entries.';
	end if;
	-- Since 0192 the roster is the other half of "already registered": an
	-- invitee who joined somebody else's entry between the invite and the
	-- accept is IN the tournament, so the accept is a no-op accept exactly as
	-- it is for an invitee who already holds an entry -- and not a second
	-- entry, which the one-per-user index would refuse as a bare 23505 that
	-- `rpcErrorStatus` reads as transient and a client would retry.
	-- `tournament_send_invite` (0062, untouched) still asks only the entries
	-- table, so the invite can legitimately arrive in either order.
	if not exists (
		select 1 from public.tournament_entries
		where tournament_id = v_inv.tournament_id and user_id = v_uid
	) and not exists (
		select 1 from public.tournament_entry_members
		where tournament_id = v_inv.tournament_id and user_id = v_uid
	) then
		if p_display_name is null or btrim(p_display_name) = ''
			or char_length(btrim(p_display_name)) > 40 then
			raise exception 'Pick a display name (1 to 40 characters) to accept.';
		end if;
		insert into public.tournament_entries
			(tournament_id, user_id, display_name, description, thumbnail_url, seed, created_by)
		values
			(v_inv.tournament_id, v_uid, btrim(p_display_name), coalesce(p_description, ''),
				nullif(btrim(coalesce(p_thumbnail_url, '')), ''),
				(select coalesce(max(seed), 0) + 1 from public.tournament_entries
					where tournament_id = v_inv.tournament_id),
				v_uid)
		returning id into v_id;
		insert into public.tournament_entry_members (entry_id, tournament_id, user_id, name, added_by)
		values (v_id, v_inv.tournament_id, v_uid, btrim(p_display_name), v_uid);
	end if;
	update public.tournament_invites
	set status = 'accepted', responded_at = now()
	where id = p_invite_id;
end;
$$;

revoke all on function public.tournament_respond_invite(uuid, boolean, text, text, text)
	from public, anon, authenticated, service_role;
grant execute on function public.tournament_respond_invite(uuid, boolean, text, text, text)
	to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Rename while not started
-- ---------------------------------------------------------------------------

create or replace function public.tournament_update_entry(
	p_entry_id uuid,
	p_display_name text,
	p_description text default null,
	p_thumbnail_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_e public.tournament_entries;
	v_t public.tournaments;
	v_member boolean;
	v_desc text;
	v_thumb text;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	select * into v_e from public.tournament_entries where id = p_entry_id;
	if not found then
		raise exception 'Entry not found.';
	end if;
	-- The lock first, then every question (the serialization rule).
	select * into v_t from public.tournaments where id = v_e.tournament_id for update;
	if not found then
		raise exception 'Tournament not found.';
	end if;
	-- The entry was read UNLOCKED to learn which tournament to lock; a host
	-- removal can commit in between. Re-read it under the lock so a rename
	-- of a vanished entry is a refusal and not a silent 0-row update.
	select * into v_e from public.tournament_entries where id = p_entry_id;
	if not found then
		raise exception 'Entry not found.';
	end if;
	v_member := exists (
		select 1 from public.tournament_entry_members
		where entry_id = p_entry_id and user_id = v_uid
	);
	if not v_member and not public._tournament_can_manage(v_e.tournament_id) then
		raise exception 'Only a registrant on this entry, a tournament host or a site admin can edit it.';
	end if;
	-- ONE RULE, NO HOST CARVE-OUT: the bracket is a printed thing by now.
	if v_t.status in ('live', 'complete') then
		raise exception 'Entry names lock once the bracket is generated.';
	end if;
	if p_display_name is null or btrim(p_display_name) = ''
		or char_length(btrim(p_display_name)) > 40 then
		raise exception 'Display name must be 1 to 40 characters.';
	end if;
	if p_description is not null then
		v_desc := btrim(p_description);
		if char_length(v_desc) > 200 then
			raise exception 'Description is limited to 200 characters.';
		end if;
	end if;
	if p_thumbnail_url is not null then
		v_thumb := btrim(p_thumbnail_url);
		if char_length(v_thumb) > 600 then
			raise exception 'Thumbnail URL is too long.';
		end if;
	end if;
	update public.tournament_entries
	set display_name = btrim(p_display_name),
		description = coalesce(v_desc, description),
		thumbnail_url = case
			when p_thumbnail_url is null then thumbnail_url
			else nullif(v_thumb, '')
		end
	where id = p_entry_id;
	return p_entry_id;
end;
$$;

revoke all on function public.tournament_update_entry(uuid, text, text, text)
	from public, anon, authenticated, service_role;
grant execute on function public.tournament_update_entry(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. The members RPCs
-- ---------------------------------------------------------------------------

-- A member or a manager adds an UNLINKED teammate by name. With an email the
-- teammate is a LINKED member (their account), which only a manager -- a host
-- or an admin -- may do (header, item 6): a captain typing somebody's email
-- would be registering that account without its consent. A teammate with an
-- account joins through tournament_join_entry instead. The linked account
-- must not already be in the tournament.
create or replace function public.tournament_add_entry_member(
	p_entry_id uuid,
	p_name text,
	p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_e public.tournament_entries;
	v_t public.tournaments;
	v_member boolean;
	v_manage boolean;
	v_count integer;
	v_team integer;
	v_target uuid;
	v_id uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	select * into v_e from public.tournament_entries where id = p_entry_id;
	if not found then
		raise exception 'Entry not found.';
	end if;
	select * into v_t from public.tournaments where id = v_e.tournament_id for update;
	if not found then
		raise exception 'Tournament not found.';
	end if;
	-- Re-read under the lock: a host removal between the unlocked read above
	-- and the lock would otherwise surface as a raw foreign-key error on the
	-- insert below rather than as this sentence.
	select * into v_e from public.tournament_entries where id = p_entry_id;
	if not found then
		raise exception 'Entry not found.';
	end if;
	v_member := exists (
		select 1 from public.tournament_entry_members
		where entry_id = p_entry_id and user_id = v_uid
	);
	v_manage := public._tournament_can_manage(v_e.tournament_id);
	if not v_member and not v_manage then
		raise exception 'Only a registrant on this entry, a tournament host or a site admin can add a teammate.';
	end if;
	-- Adding BY ACCOUNT is a manager action (header, item 6). Asked before the
	-- window and the capacity: it is about who is asking, not about the entry.
	if p_email is not null and btrim(p_email) <> '' and not v_manage then
		raise exception 'Only a tournament host or a site admin can add a teammate by account. Teammates with an account can join the entry themselves.';
	end if;
	if v_t.status not in ('registration_open', 'seeding') then
		raise exception 'Teammates can only be added while registration is open or during seeding.';
	end if;
	select count(*) into v_count from public.tournament_entry_members where entry_id = p_entry_id;
	v_team := public._tournament_team_size(v_t.config);
	if v_count >= v_team then
		raise exception 'This entry is full (% of %).', v_count, v_team;
	end if;
	if p_name is null or btrim(p_name) = '' or char_length(btrim(p_name)) > 40 then
		raise exception 'Teammate names must be 1 to 40 characters.';
	end if;
	if p_email is not null and btrim(p_email) <> '' then
		select id into v_target from public.profiles where lower(email) = lower(btrim(p_email));
		if v_target is null then
			raise exception 'No account found for that email.';
		end if;
		if exists (
			select 1 from public.tournament_entry_members
			where tournament_id = v_e.tournament_id and user_id = v_target
		) or exists (
			select 1 from public.tournament_entries
			where tournament_id = v_e.tournament_id and user_id = v_target
		) then
			raise exception 'That account is already registered in this tournament.';
		end if;
	end if;
	insert into public.tournament_entry_members (entry_id, tournament_id, user_id, name, added_by, created_at)
	values (p_entry_id, v_e.tournament_id, v_target, btrim(p_name), v_uid, clock_timestamp())
	returning id into v_id;
	return v_id;
end;
$$;

revoke all on function public.tournament_add_entry_member(uuid, text, text)
	from public, anon, authenticated, service_role;
grant execute on function public.tournament_add_entry_member(uuid, text, text) to authenticated;

-- A signed-in account joins an entry itself, while registration is open.
create or replace function public.tournament_join_entry(
	p_entry_id uuid,
	p_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_e public.tournament_entries;
	v_t public.tournaments;
	v_count integer;
	v_team integer;
	v_id uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in to register.';
	end if;
	select * into v_e from public.tournament_entries where id = p_entry_id;
	if not found then
		raise exception 'Entry not found.';
	end if;
	select * into v_t from public.tournaments where id = v_e.tournament_id for update;
	if not found then
		raise exception 'Tournament not found.';
	end if;
	-- Re-read under the lock (the same race as tournament_add_entry_member).
	select * into v_e from public.tournament_entries where id = p_entry_id;
	if not found then
		raise exception 'Entry not found.';
	end if;
	if v_t.status <> 'registration_open' then
		raise exception 'Registration is not open for this tournament.';
	end if;
	select count(*) into v_count from public.tournament_entry_members where entry_id = p_entry_id;
	v_team := public._tournament_team_size(v_t.config);
	if v_count >= v_team then
		raise exception 'This entry is full (% of %).', v_count, v_team;
	end if;
	if exists (
		select 1 from public.tournament_entry_members
		where tournament_id = v_e.tournament_id and user_id = v_uid
	) or exists (
		select 1 from public.tournament_entries
		where tournament_id = v_e.tournament_id and user_id = v_uid
	) then
		raise exception 'You are already registered for this tournament.';
	end if;
	if p_name is null or btrim(p_name) = '' or char_length(btrim(p_name)) > 40 then
		raise exception 'Your roster name must be 1 to 40 characters.';
	end if;
	insert into public.tournament_entry_members (entry_id, tournament_id, user_id, name, added_by, created_at)
	values (p_entry_id, v_e.tournament_id, v_uid, btrim(p_name), v_uid, clock_timestamp())
	returning id into v_id;
	return v_id;
end;
$$;

revoke all on function public.tournament_join_entry(uuid, text)
	from public, anon, authenticated, service_role;
grant execute on function public.tournament_join_entry(uuid, text) to authenticated;

-- Leaving, or the captain or a manager removing a teammate. The LAST member
-- is never removed (remove the entry instead), and the REGISTERING ACCOUNT's
-- own row stays while anyone else is on the entry: withdrawing is removing
-- the entry, not quietly handing it to a teammate. "The captain's row" is the
-- member whose account is the entry's; an unlinked entry has no such row and
-- only the last-member rule applies to it.
--
-- BOTH REFUSALS NAME WHO CAN TAKE THE REMEDY, because the caller usually
-- cannot: the only entry-removal RPC is `tournament_remove_entry` (0062),
-- gated on `_tournament_require_host` -- a host or, since this file, a site
-- admin -- and no RPC lets a captain withdraw their own entry. A sentence
-- reading "Remove the entry instead" told a student to press a control they
-- do not have. There is no owner withdraw path in this file; adding one is a
-- widening of 0062's gate with its own answer for a seeded pool, and belongs
-- in its own bundle.
create or replace function public.tournament_remove_entry_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_m public.tournament_entry_members;
	v_e public.tournament_entries;
	v_t public.tournaments;
	v_count integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	select * into v_m from public.tournament_entry_members where id = p_member_id;
	if not found then
		raise exception 'Registrant not found.';
	end if;
	select * into v_t from public.tournaments where id = v_m.tournament_id for update;
	if not found then
		raise exception 'Tournament not found.';
	end if;
	-- Re-read the member AND its entry under the lock: a host removal of the
	-- entry cascades the roster away, and the delete below would otherwise be
	-- a silent 0-row success.
	select * into v_m from public.tournament_entry_members where id = p_member_id;
	if not found then
		raise exception 'Registrant not found.';
	end if;
	select * into v_e from public.tournament_entries where id = v_m.entry_id;
	if not found then
		raise exception 'Entry not found.';
	end if;
	if not (
		(v_m.user_id is not null and v_m.user_id = v_uid)
		or (v_e.user_id is not null and v_e.user_id = v_uid)
		or public._tournament_can_manage(v_m.tournament_id)
	) then
		raise exception 'Only that registrant, the registering account, a tournament host or a site admin can remove a teammate.';
	end if;
	if v_t.status not in ('registration_open', 'seeding') then
		raise exception 'Teammates can only be removed while registration is open or during seeding.';
	end if;
	select count(*) into v_count from public.tournament_entry_members where entry_id = v_m.entry_id;
	if v_count <= 1 then
		raise exception 'An entry needs at least one registrant. A host or a site admin can remove the entry instead.';
	end if;
	if v_m.user_id is not null and v_m.user_id = v_e.user_id then
		raise exception 'The registering account stays on the entry. A host or a site admin can remove the entry to withdraw it.';
	end if;
	delete from public.tournament_entry_members where id = p_member_id;
end;
$$;

revoke all on function public.tournament_remove_entry_member(uuid)
	from public, anon, authenticated, service_role;
grant execute on function public.tournament_remove_entry_member(uuid) to authenticated;

-- That member, the captain or a manager renames a roster row, while the
-- event has not started (the same rule and message as tournament_update_entry).
create or replace function public.tournament_rename_entry_member(
	p_member_id uuid,
	p_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_m public.tournament_entry_members;
	v_e public.tournament_entries;
	v_t public.tournaments;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	select * into v_m from public.tournament_entry_members where id = p_member_id;
	if not found then
		raise exception 'Registrant not found.';
	end if;
	select * into v_t from public.tournaments where id = v_m.tournament_id for update;
	if not found then
		raise exception 'Tournament not found.';
	end if;
	-- Re-read the member and its entry under the lock (the same race as
	-- tournament_remove_entry_member; the update below would be a silent
	-- 0-row success).
	select * into v_m from public.tournament_entry_members where id = p_member_id;
	if not found then
		raise exception 'Registrant not found.';
	end if;
	select * into v_e from public.tournament_entries where id = v_m.entry_id;
	if not found then
		raise exception 'Entry not found.';
	end if;
	if not (
		(v_m.user_id is not null and v_m.user_id = v_uid)
		or (v_e.user_id is not null and v_e.user_id = v_uid)
		or public._tournament_can_manage(v_m.tournament_id)
	) then
		raise exception 'Only that registrant, the registering account, a tournament host or a site admin can rename a teammate.';
	end if;
	if v_t.status in ('live', 'complete') then
		raise exception 'Entry names lock once the bracket is generated.';
	end if;
	if p_name is null or btrim(p_name) = '' or char_length(btrim(p_name)) > 40 then
		raise exception 'Teammate names must be 1 to 40 characters.';
	end if;
	update public.tournament_entry_members set name = btrim(p_name) where id = p_member_id;
end;
$$;

revoke all on function public.tournament_rename_entry_member(uuid, text)
	from public, anon, authenticated, service_role;
grant execute on function public.tournament_rename_entry_member(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. 0064's banner editor reads the roster
-- ---------------------------------------------------------------------------

create or replace function public.tournament_set_entry_style(
	p_entry_id uuid,
	p_background_type text default null,
	p_background_value jsonb default null,
	p_accent_color text default null,
	p_badge text default null,
	p_flourish text default null,
	p_tagline text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_e public.tournament_entries;
	v_bg_type text := nullif(btrim(coalesce(p_background_type, '')), '');
	v_bg jsonb;
	v_accent text := nullif(lower(btrim(coalesce(p_accent_color, ''))), '');
	v_badge text := nullif(btrim(coalesce(p_badge, '')), '');
	v_flourish text := nullif(btrim(coalesce(p_flourish, '')), '');
	v_tagline text := nullif(btrim(coalesce(p_tagline, '')), '');
begin
	if v_uid is null then
		raise exception 'You must be signed in to customize an entry.';
	end if;

	select * into v_e from public.tournament_entries where id = p_entry_id;
	if not found then
		raise exception 'Entry not found.';
	end if;

	-- Authorization: a LINKED MEMBER of the entry (the captain included), or a
	-- host or admin standing in for an entry with NO linked member (an
	-- unlinked walk-up). A host or admin may NOT restyle an entry that has a
	-- linked member: that banner is the student's identity.
	if exists (
		select 1 from public.tournament_entry_members
		where entry_id = p_entry_id and user_id is not null
	) then
		if not exists (
			select 1 from public.tournament_entry_members
			where entry_id = p_entry_id and user_id = v_uid
		) then
			raise exception 'Only a player on this entry can customize it.';
		end if;
	else
		if not public._tournament_can_manage(v_e.tournament_id) then
			raise exception 'Only a host or a site admin can customize a walk-up entry.';
		end if;
	end if;

	v_bg := public._tournament_normalize_background(v_bg_type, p_background_value);

	if v_accent is not null and v_accent !~ '^#[0-9a-f]{6}$' then
		raise exception 'Accent color must be a hex value like #1f6feb.';
	end if;
	if v_badge is not null and v_badge not in (
		'bolt', 'flame', 'star', 'shield', 'gear', 'skull', 'crown', 'rocket'
	) then
		raise exception 'Unknown badge: %', v_badge;
	end if;
	if v_flourish is not null and v_flourish not in (
		'glow-pulse', 'particle-trail', 'screen-shake-on-elimination', 'confetti-on-win'
	) then
		raise exception 'Unknown flourish: %', v_flourish;
	end if;
	if v_tagline is not null and char_length(v_tagline) > 48 then
		raise exception 'Tagline must be 48 characters or fewer.';
	end if;

	-- Nothing set at all: clear the row, back to the default treatment.
	if v_bg_type is null and v_accent is null and v_badge is null
		and v_flourish is null and v_tagline is null then
		delete from public.tournament_entry_styles where entry_id = p_entry_id;
		return null;
	end if;

	insert into public.tournament_entry_styles as s (
		entry_id, tournament_id, background_type, background_value,
		accent_color, badge, flourish, tagline, updated_by, updated_at
	)
	values (
		p_entry_id, v_e.tournament_id, v_bg_type, v_bg,
		v_accent, v_badge, v_flourish, v_tagline, v_uid, now()
	)
	on conflict (entry_id) do update set
		background_type = excluded.background_type,
		background_value = excluded.background_value,
		accent_color = excluded.accent_color,
		badge = excluded.badge,
		flourish = excluded.flourish,
		tagline = excluded.tagline,
		updated_by = excluded.updated_by,
		updated_at = excluded.updated_at
	where s.entry_id = p_entry_id;

	return p_entry_id;
end;
$$;

revoke all on function public.tournament_set_entry_style(
	uuid, text, jsonb, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.tournament_set_entry_style(
	uuid, text, jsonb, text, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. 0063's ping returns every linked registrant
-- ---------------------------------------------------------------------------

create or replace function public.tournament_ping_entry(p_match_id uuid, p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_m public.tournament_bracket_matches;
	v_t public.tournaments;
	v_e public.tournament_entries;
	v_opp_name text;
	v_ids uuid[];
begin
	select * into v_m from public.tournament_bracket_matches where id = p_match_id;
	if not found then
		raise exception 'Match not found.';
	end if;
	v_t := public._tournament_require_host(v_m.tournament_id);
	-- Deliberately NO match-state check: a host may ping regardless of state.
	if p_entry_id is null
		or (p_entry_id is distinct from v_m.entry_a_id
			and p_entry_id is distinct from v_m.entry_b_id) then
		raise exception 'That entry is not in this match.';
	end if;
	select * into v_e from public.tournament_entries where id = p_entry_id;
	-- Every linked registrant, captain first; the entry's own account is added
	-- if no member row carries it (after the backfill one always does).
	select coalesce(array_agg(m.user_id order by (m.user_id = v_e.user_id) desc, m.created_at, m.id), '{}'::uuid[])
	into v_ids
	from public.tournament_entry_members m
	where m.entry_id = p_entry_id and m.user_id is not null;
	if v_e.user_id is not null and not (v_e.user_id = any (v_ids)) then
		v_ids := array_prepend(v_e.user_id, v_ids);
	end if;
	if cardinality(v_ids) = 0 then
		raise exception 'That entry has no linked account to notify.';
	end if;
	select display_name into v_opp_name from public.tournament_entries
	where id = case when v_m.entry_a_id = p_entry_id then v_m.entry_b_id else v_m.entry_a_id end;
	return jsonb_build_object(
		'tournament_id', v_m.tournament_id,
		'tournament_name', v_t.name,
		'user_id', v_ids[1],
		'user_ids', to_jsonb(v_ids),
		'entry_name', v_e.display_name,
		'opponent_name', v_opp_name,
		'bracket', v_m.bracket,
		'round', v_m.round,
		'slot', v_m.slot
	);
end;
$$;

revoke all on function public.tournament_ping_entry(uuid, uuid)
	from public, anon, authenticated, service_role;
grant execute on function public.tournament_ping_entry(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. 0068's delete: admin instead of the teacher shim, and the roster in the
-- teardown
-- ---------------------------------------------------------------------------

create or replace function public.tournament_delete(
	p_tournament_id uuid,
	p_confirm_name text default null,
	p_acknowledge_payout_loss boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_t public.tournaments;
	v_is_host boolean;
	v_entries integer;
	v_matches integer;
	v_rewards integer;
	v_reward_coins integer;
	v_reward_entries integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	-- Lock the row so a concurrent host mutation cannot interleave with the
	-- teardown below (the _tournament_require_host serialization rule).
	select * into v_t from public.tournaments where id = p_tournament_id for update;
	if not found then
		raise exception 'Tournament not found.';
	end if;

	select exists (
		select 1 from public.tournament_hosts
		where tournament_id = p_tournament_id and user_id = v_uid
	) into v_is_host;

	if not v_is_host and not public.is_admin() then
		raise exception 'Only a host of this tournament, or a site admin, can delete it.';
	end if;

	select count(*) into v_entries
	from public.tournament_entries where tournament_id = p_tournament_id;
	select count(*) into v_matches
	from public.tournament_bracket_matches where tournament_id = p_tournament_id;
	select count(*), coalesce(sum(amount), 0), count(distinct entry_id)
	into v_rewards, v_reward_coins, v_reward_entries
	from public.tournament_reward_ledger where tournament_id = p_tournament_id;

	-- Payout acknowledgment, required as soon as there is a real reward
	-- record to lose. Checked before the name match so the caller learns the
	-- real numbers even if they have not yet gotten as far as typing a name.
	if v_rewards > 0 and not coalesce(p_acknowledge_payout_loss, false) then
		raise exception
			'This tournament has paid out % IDEA Coins to % % as reward payouts. Deleting it permanently erases that record. Acknowledge the payout loss to continue.',
			v_reward_coins,
			v_reward_entries,
			(case when v_reward_entries = 1 then 'entry' else 'entries' end);
	end if;

	-- Name confirmation, required as soon as there is anything to lose.
	if v_entries > 0
		and lower(btrim(coalesce(p_confirm_name, ''))) <> lower(btrim(v_t.name)) then
		raise exception
			'Type the tournament name exactly to confirm deletion: "%". This permanently removes % entries, % bracket matches and % reward payouts.',
			v_t.name, v_entries, v_matches, v_rewards;
	end if;

	-- Teardown, deepest dependency first. See 0066's header for why this is
	-- not left to ON DELETE CASCADE.
	delete from public.tournament_match_events where tournament_id = p_tournament_id;
	delete from public.tournament_reward_ledger where tournament_id = p_tournament_id;
	delete from public.tournament_reward_rules where tournament_id = p_tournament_id;
	delete from public.tournament_match_games where tournament_id = p_tournament_id;
	delete from public.tournament_bracket_matches where tournament_id = p_tournament_id;
	delete from public.tournament_qual_matches where tournament_id = p_tournament_id;
	delete from public.tournament_qual_pools where tournament_id = p_tournament_id;
	delete from public.tournament_entry_styles where tournament_id = p_tournament_id;
	delete from public.tournament_invites where tournament_id = p_tournament_id;
	delete from public.tournament_hosts where tournament_id = p_tournament_id;
	-- Drop the champion pointer before the entries it references.
	update public.tournaments set champion_entry_id = null where id = p_tournament_id;
	delete from public.tournament_entry_members where tournament_id = p_tournament_id;
	delete from public.tournament_entries where tournament_id = p_tournament_id;
	delete from public.tournaments where id = p_tournament_id;

	return jsonb_build_object(
		'deleted', true,
		'name', v_t.name,
		'entries', v_entries,
		'matches', v_matches,
		'reward_rows', v_rewards,
		'reward_coins', v_reward_coins,
		'reward_entries', v_reward_entries
	);
end;
$$;

revoke all on function public.tournament_delete(uuid, text, boolean)
	from public, anon, authenticated, service_role;
grant execute on function public.tournament_delete(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Realtime: the roster shows up live on the public page and the TV
-- projector. The 0062 guard shape: publication-existence first, so a database
-- with no `supabase_realtime` still applies this file.
-- ---------------------------------------------------------------------------

do $$
begin
	if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
		if not exists (
			select 1 from pg_publication_tables
			where pubname = 'supabase_realtime'
				and schemaname = 'public'
				and tablename = 'tournament_entry_members'
		) then
			alter publication supabase_realtime add table public.tournament_entry_members;
		end if;
	end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 13. Self-check. Counts by notice; a violated invariant refuses the file.
-- ---------------------------------------------------------------------------

do $$
declare
	v_bare integer;
	v_members integer;
	v_ledger_col boolean;
	v_name text;
	v_n integer;
	v_wide_defaults integer;
	v_sig text;
begin
	select count(*) into v_bare
	from public.tournament_entries e
	where not exists (
		select 1 from public.tournament_entry_members m where m.entry_id = e.id
	);
	if v_bare > 0 then
		raise exception '0192: % entry/entries have no member row.', v_bare;
	end if;

	-- Exactly one of each; a survivor from an earlier signature would be a
	-- second overload PostgREST cannot resolve (the signature trap).
	foreach v_name in array array[
		'_tournament_require_host', '_tournament_can_manage', '_tournament_team_size',
		'_tournament_award', '_tournament_normalize_config',
		'tournament_update_entry', 'tournament_add_entry_member', 'tournament_join_entry',
		'tournament_remove_entry_member', 'tournament_rename_entry_member',
		'tournament_delete', 'tournament_set_entry_style', 'tournament_ping_entry',
		'tournament_update'
	] loop
		select count(*) into v_n
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = v_name;
		if v_n <> 1 then
			raise exception '0192: expected exactly 1 pg_proc row for %, found %.', v_name, v_n;
		end if;
	end loop;

	-- Two register overloads, and the wide one carries no defaults -- that is
	-- what makes the pair unambiguous under any resolution rule.
	select count(*) into v_n
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'tournament_register_entry';
	if v_n <> 2 then
		raise exception '0192: expected exactly 2 tournament_register_entry overloads, found %.', v_n;
	end if;
	select p.pronargdefaults into v_wide_defaults
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'tournament_register_entry' and p.pronargs = 6;
	if v_wide_defaults is distinct from 0 then
		raise exception '0192: the 6-argument tournament_register_entry must carry no defaults (pronargdefaults = %).', v_wide_defaults;
	end if;

	-- The ACL, read back rather than trusted: anon false, authenticated true,
	-- on every public function this file declares.
	foreach v_sig in array array[
		'public.tournament_update(uuid, text, text, jsonb)',
		'public.tournament_register_entry(uuid, text, text, text, text, text[])',
		'public.tournament_register_entry(uuid, text, text, text)',
		'public.tournament_host_add_entry(uuid, text, text, text, uuid)',
		'public.tournament_respond_invite(uuid, boolean, text, text, text)',
		'public.tournament_update_entry(uuid, text, text, text)',
		'public.tournament_add_entry_member(uuid, text, text)',
		'public.tournament_join_entry(uuid, text)',
		'public.tournament_remove_entry_member(uuid)',
		'public.tournament_rename_entry_member(uuid, text)',
		'public.tournament_set_entry_style(uuid, text, jsonb, text, text, text, text)',
		'public.tournament_ping_entry(uuid, uuid)',
		'public.tournament_delete(uuid, text, boolean)'
	] loop
		if has_function_privilege('anon', v_sig, 'execute') then
			raise exception '0192: anon holds EXECUTE on %.', v_sig;
		end if;
		if not has_function_privilege('authenticated', v_sig, 'execute') then
			raise exception '0192: authenticated does not hold EXECUTE on %.', v_sig;
		end if;
	end loop;
	foreach v_sig in array array[
		'public._tournament_require_host(uuid)',
		'public._tournament_can_manage(uuid)',
		'public._tournament_team_size(jsonb)',
		'public._tournament_award(uuid, uuid, integer, text, uuid)',
		'public._tournament_normalize_config(jsonb)'
	] loop
		if has_function_privilege('anon', v_sig, 'execute')
			or has_function_privilege('authenticated', v_sig, 'execute') then
			raise exception '0192: a client role holds EXECUTE on the private helper %.', v_sig;
		end if;
	end loop;

	select count(*) into v_members from public.tournament_entry_members;
	select exists (
		select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'tournament_reward_ledger'
			and column_name = 'member_id'
	) into v_ledger_col;

	-- The boolean is spelled out: `%` on a boolean prints `t`.
	raise notice '0192: % member row(s) in total; 0 entries without a member; tournament_reward_ledger.member_id present = %.',
		v_members, case when v_ledger_col then 'true' else 'false' end;
	raise notice '0192: 13 public functions checked (anon false, authenticated true); 5 private helpers closed to both; tournament_register_entry has 2 overloads and the wide one has 0 defaults.';
end
$$;

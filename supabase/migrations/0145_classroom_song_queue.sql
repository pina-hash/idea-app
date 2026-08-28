-- 0145_classroom_song_queue.sql
--
-- THE CLASSROOM SONG QUEUE: a student asks for a song, an instructor of that
-- section approves or rejects it, and approval charges the student.
--
-- Asked for by a student on 2026-08-21 -- "a program on the website for if a
-- teacher wants music to be played in the class, and it can be uploaded by
-- students and moderated by instructors" -- and built as a MODERATED REQUEST
-- QUEUE rather than as the thing the sentence literally describes.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS IS NOT, AND THE THREE ARE SCOPE RATHER THAN PHASING
-- ---------------------------------------------------------------------------
--
-- IT ACCEPTS NO BYTES. There is no bucket, no storage policy, no ingest and no
-- `mime_type` anywhere in this file. A request is an https URL and an optional
-- note. That is what removes the copyright question the school would otherwise
-- have to answer about audio a student uploaded, and it removes a
-- playback-safety question this codebase has never measured. `0133` made
-- classroom uploads cheap and safe, which makes "just add a bucket" the easy
-- wrong instinct here: the reason there is no bucket is not that it would be
-- hard.
--
-- NOTHING PLAYS. No column here is a duration, an offset, a cursor or a
-- position, and there is no ordering column that means "next". An instructor
-- opens the approved list and plays from whatever they already use. A player is
-- a different feature with different risks.
--
-- NO SERVICE IS PARSED OR SPECIAL-CASED. `_classroom_song_url_ok` asks exactly
-- one question -- is this an https URL with a host -- and never which host. A
-- per-service integration is a maintenance commitment against somebody else's
-- URL formats, for a feature worth two coins, and the instructor is already the
-- filter that a parser would be pretending to be.
--
-- ---------------------------------------------------------------------------
-- THE PRICE MOVES, AND THAT IS A CHANGE TO A ROW THAT IS ALREADY LIVE
-- ---------------------------------------------------------------------------
--
-- `0070` priced `song_request` at 3i¢ as a `purchase`, with the note
-- "Approval-gated: nothing plays until reviewed. The price is for the request,
-- not a guarantee it gets played."
--
-- UNDER THIS FILE THAT SENTENCE SAYS THE OPPOSITE OF THE TRUTH. Requesting is
-- FREE and the two coins are charged AT APPROVAL, so the price is now precisely
-- a guarantee it gets played. Section 7 updates the row in place -- price 2, and
-- a note that describes what actually happens. THE ID IS KEPT: `song_request`
-- is a stable key, `coin_transactions.category_id` references it, and every row
-- already logged against it stays valid and readable. A new id would orphan the
-- history and leave two categories meaning one thing.
--
-- ---------------------------------------------------------------------------
-- THE CHARGE, WHICH IS THE PART THAT CAN FAIL
-- ---------------------------------------------------------------------------
--
-- MOVING THE CHARGE TO APPROVAL MAKES APPROVAL FALLIBLE. A request costs
-- nothing to make, so nothing is refunded when one is rejected -- there is no
-- refund path in this file and none is needed. What is new is that pressing
-- Approve can now legitimately fail, which pressing it never could before.
--
-- WHAT THIS COIN SYSTEM ALREADY DOES WHEN SOMEBODY CANNOT AFFORD SOMETHING,
-- READ OFF `0096` RATHER THAN INVENTED HERE:
--
--   * BALANCES MAY GO NEGATIVE. The lockout fires only while the balance is
--     ALREADY negative; a purchase that itself dips a non-negative balance below
--     zero is ALLOWED, which `0070` calls "the docs' literal condition" and
--     `0096` restates per medium. So a student with 1i¢ CAN have a song approved
--     and lands at -1i¢. This file does not tighten that, and tightening it here
--     would mean this one feature quietly enforcing a rule the coin desk does
--     not.
--   * THE REFUSAL IS `{ok:false, reason:'debt', ...}`, structured jsonb, not a
--     raise. Section 5 answers with that same `reason` string so a caller that
--     already understands the coin desk's vocabulary understands this one.
--
-- IT IS THE DIGITAL BALANCE. `0096`'s two media are "coins handed over in
-- class" and "credited digitally"; an approval happening inside the app with
-- nobody handing over a coin is digital by that definition, and spending the
-- digital balance directly is exactly what `0096` says the digital balance is
-- for. So the debt question is asked of the DIGITAL balance, per `0096`'s
-- per-medium lockout, and never of the total.
--
-- A HALF-COMPLETED APPROVAL IS UNREPRESENTABLE, NOT MERELY AVOIDED. The two
-- things that must happen together are the coin row and the flip, and there are
-- two independent reasons they cannot come apart:
--
--   1. THEY ARE ONE STATEMENT'S WORTH OF ONE TRANSACTION. A plpgsql function
--      body runs in the caller's transaction, so the insert and the update
--      commit together or roll back together. Nothing here opens a second one.
--   2. THE CHECK CONSTRAINT. `classroom_song_requests_approved_is_charged` says
--      `(charge_transaction_id is not null) = (decided_at is not null and
--      rejection_reason is null)` -- APPROVED IF AND ONLY IF CHARGED. An
--      approved row with no charge and a charge with no approval are both
--      refused by the database, so neither half can be reached by a future
--      write path, a hand-run UPDATE in the SQL editor, or a bug in section 5.
--      Reason (1) is the mechanism; reason (2) is what survives somebody
--      changing the mechanism.
--
-- THE REFUSAL NAMES THE STUDENT, because the instructor is the person who has
-- to do something about it -- tell them, or wait. A bare "could not approve"
-- in front of a queue of six names is unactionable. AND THE REQUEST STAYS
-- PENDING: it is not rejected, not marked, and not moved, so the same press
-- works later with nothing to undo. Nothing is written at all on this path.
--
-- ---------------------------------------------------------------------------
-- THE CHARGE IS MINTED THROUGH `_coin_insert` AND NOT THROUGH
-- `coin_log_transaction`, AND THIS IS THE DECISION IN THIS FILE MOST WORTH
-- REVISITING
-- ---------------------------------------------------------------------------
--
-- `coin_log_transaction` (`0070`, current signature `0096`) is THE purchase
-- path, and every existing caller of it -- the section bulk log, the role
-- stipend, contract completion, the payout, the bulk student log -- reaches it
-- from an admin-gated RPC. Its first line is `if not public.is_admin() then
-- raise`, and a nested SECURITY DEFINER call does NOT escape that: `is_admin()`
-- reads the session's JWT claims, so it answers about the ORIGINAL caller.
--
-- THE APPROVER HERE IS A SECTION MANAGER, WHO IS ROUTINELY NOT AN ADMIN.
-- `classroom_manages_section` is `is_admin() OR teacher_email = me`, and the
-- teacher of record is the normal case. Calling `coin_log_transaction` would
-- therefore raise "Only site admins can log IDEA Coin transactions" for exactly
-- the person this feature is for, on most approvals.
--
-- SO SECTION 5 MINTS THE ROW ITSELF, and the duplication is held to two lines
-- by using the existing single implementations for everything else:
--
--   * `_coin_insert` is THE row shape (actor, semester key, medium,
--     transfer id). Not re-implemented -- called, under the `_coin_` internal
--     helper convention (`0070` section 6: owned by the migration role, reached
--     from another definer with no grant).
--   * `_coin_balance` is THE balance derivation (`0096` section 4, which exists
--     precisely because there were seventeen inline copies of it).
--   * THE PRICE IS READ FROM `coin_categories`, never written down here. A
--     literal 2 in this file would be a second price list, and section 7 moves
--     the real one in the same commit.
--
-- WHAT IS GENUINELY RESTATED is that a `purchase` is signed NEGATIVE and that
-- an already-negative balance refuses one. THE RETROFIT THAT WOULD REMOVE IT,
-- named so nobody has to work it out later: give `coin_log_transaction` an
-- authorization seam other than `is_admin()`, or extract its
-- price/sign/debt/insert middle into a private helper both it and this call.
-- Either is a change to the busiest function in the coin system and belongs in
-- its own bundle with its own answer for every existing caller; doing it inside
-- a migration about song requests is how a narrow feature takes the coin desk
-- down. `grep _coin_insert` finds both minting sites, which is what keeps this
-- findable in the meantime.
--
-- ---------------------------------------------------------------------------
-- FREE REQUESTS REMOVE THE THROTTLE, SO THERE IS AN EXPLICIT CAP
-- ---------------------------------------------------------------------------
--
-- THREE COINS WAS THE RATE LIMIT. It was never described as one, but it was
-- the only thing standing between one student and forty requests in a period.
-- Making the request free removes it, so the cap is now a rule rather than a
-- side effect: THREE OPEN PENDING REQUESTS per student per section,
-- `_classroom_song_pending_cap()`.
--
-- IT COUNTS PENDING ONLY, which is what makes it a queue-depth limit rather
-- than a quota. A decided request -- approved or rejected -- stops counting the
-- moment it is decided, so a student whose songs get played can keep asking and
-- a student who never gets reviewed cannot flood the queue. Nothing here caps a
-- term, a day or a total.
--
-- IT IS A ROW LOCK ON THE ENROLLMENT, NOT A UNIQUE INDEX, AND THAT DIFFERS FROM
-- `0143` ON PURPOSE. `0143` caps at ONE and can therefore be a PARTIAL UNIQUE
-- INDEX on `(section_id) where closed_at is null` -- the cap and the uniqueness
-- are the same statement. A cap of THREE has nothing to be unique on: it would
-- need a synthetic slot number, which is a stored value that can drift from the
-- rows it counts, and which a delete leaves a hole in. So this takes the shape
-- CLAUDE.md's own "SQL traps" section prescribes for a capacity check that is
-- not a uniqueness: `select ... for update` on THE PARENT, then count under the
-- lock.
--
--   * THE PARENT IS THE ENROLLMENT ROW. It is exactly one row per (section,
--     student), it is guaranteed to exist -- the composite foreign key below
--     makes a request without one unrepresentable -- and it is the natural
--     parent of "this student's requests in this class". A count-then-insert
--     with no lock is the documented wrong answer: under READ COMMITTED three
--     concurrent submits all count three and all insert, and the fourth row
--     lands.
--   * IT IS NOT `pg_advisory_xact_lock`. `0139` needed one because its window
--     is `now()`-relative and a volatile expression cannot appear in an index
--     predicate, leaving no row to lock. Here there IS a row, and locking the
--     real one is better than agreeing on a hash of two ids.
--   * THE COUNT IS RE-ASKED UNDER THE LOCK, never before it. Reading it first
--     and locking afterwards is the same race with an extra step.
--
-- AND THE STUDENT IS TOLD THE NUMBER. The refusal carries `cap` and `pending`,
-- so the sentence can name the cap instead of being a bare "no". A student who
-- hits it never sees a database error -- see the `reason` vocabulary in
-- section 4.
--
-- ---------------------------------------------------------------------------
-- DISCLOSURE, WHICH IS ENFORCED IN SQL AND NOT BY OMITTING A COLUMN
-- ---------------------------------------------------------------------------
--
-- A QUEUE THAT PUBLISHES REFUSALS TO THIRTY CLASSMATES IS A DIFFERENT AND WORSE
-- FEATURE. A rejection is between the instructor and the person who asked.
--
--   * AN ENROLLED STUDENT sees the APPROVED list for their section, plus THEIR
--     OWN requests in every state with their own rejection reasons. They never
--     see another student's pending or rejected request, in any form: not the
--     row, not the url, not the note, not a count, and not the fact that one
--     exists.
--   * AN INSTRUCTOR OF THE SECTION sees everything, with names.
--   * ANYONE ELSE gets NULL -- the same answer a section id that does not exist
--     returns, so an id cannot be probed. `0143`'s rule.
--
-- THREE INDEPENDENT ENFORCEMENTS, and no one of them is trusted alone:
--
--   1. THE TABLE IS SHUT. RLS enabled, NO POLICY and NO GRANT to `anon` or
--      `authenticated` -- the `student_app_plays` (`0139`) and
--      `classroom_hall_passes` (`0143`) shape. Either half alone denies every
--      select, so a student reading the raw table through PostgREST gets a
--      permission error whatever their session says. THERE IS NO VIEW OVER THIS
--      TABLE AND THERE MUST NEVER BE ONE.
--   2. THE READ FUNCTION BUILDS TWO OBJECTS IN TWO BRANCHES. There is exactly
--      one read path, `classroom_song_queue`, and the student branch is not the
--      manager object with fields stripped -- it is assembled separately, from
--      queries whose WHERE clauses cannot return another student's undecided
--      row. A field cannot leak by being forgotten in a strip step that does not
--      exist. `0143`'s argument, and the reason both files are written this way.
--   3. THE STUDENT'S OWN QUERY IS PINNED IN ITS WHERE CLAUSE, not filtered
--      afterwards: `r.student_email = v_email`. There is no expression anywhere
--      in the student branch that could evaluate to another person's row.
--
-- THE APPROVED LIST CARRIES NO REQUESTER NAME FOR A PEER, and this is the one
-- disclosure judgement in this file that nobody handed down. An approved song
-- is going to be played out loud in the room, so the SONG is public within the
-- class by construction; WHO ASKED FOR IT is not, and attaching a student's
-- music taste to their name in a list thirty classmates read buys the feature
-- nothing it needs. The requester sees `mine` on their own rows and the manager
-- sees every name. Adding a name to the peer projection is a DISCLOSURE
-- DECISION, not a field addition.
--
-- ---------------------------------------------------------------------------
-- STATE IS DERIVED, NEVER STORED -- `0143`'s rule, scaled to three states
-- ---------------------------------------------------------------------------
--
-- There is no `status` column, no enum and no boolean. A request is:
--
--     decided_at is null                                  -> 'pending'
--     decided_at is not null and rejection_reason is null -> 'approved'
--     decided_at is not null and rejection_reason is set  -> 'rejected'
--
-- THE REJECTION REASON IS THE DISCRIMINATOR, and that is safe only because the
-- database makes the two ambiguous shapes impossible: a reason cannot exist on
-- an undecided row, and section 5's reject path cannot write a blank one (the
-- reason is a REQUIRED PARAMETER of `classroom_song_reject`, so "a rejection
-- carries a reason" is a property of the SIGNATURE rather than a check somebody
-- could forget). Approval, symmetrically, is pinned to the charge by the
-- approved-is-charged constraint above.
--
-- `_classroom_song_status` IS THE ONE IMPLEMENTATION of that derivation. Every
-- projection in this file calls it; nothing spells the three-way case out a
-- second time, and no client re-derives it -- the status arrives as a string on
-- the payload.
--
-- ---------------------------------------------------------------------------
-- THE ENROLLMENT IS A COMPOSITE FOREIGN KEY (`0143`'s convention)
-- ---------------------------------------------------------------------------
--
-- `(section_id, student_email)` references `classroom_enrollments` on its own
-- primary key, so a request from somebody not on that section's roster is
-- UNREPRESENTABLE rather than merely refused, and it is the row the cap locks.
--
-- IT CASCADES, THE SAME DELIBERATE ASYMMETRY WITH `0138` THAT `0143` TAKES. A
-- song request is not WORK: removing a student's enrollment takes their request
-- history with it, and adding song requests to `classroom_remove_enrollment`'s
-- stranding counts would make a roster correction refusable because somebody
-- once asked for a song. The COIN ROWS ARE NOT TOUCHED BY THAT CASCADE and must
-- not be: `coin_transactions` is email-keyed, append-only and independent of
-- any roster, so a charge survives the request it paid for. That is correct --
-- the coin was spent, and the ledger is the record of it.
--
-- Apply manually in the Supabase SQL editor, after 0144.

-- ---------------------------------------------------------------------------
-- 1. Constants and pure predicates.
--
-- Each is written down ONCE and called from everywhere that needs it, the
-- `_foundry_play_window()` (`0139`) shape: a cap spelled out at two call sites
-- is how a refusal and the sentence describing it stop agreeing.
-- ---------------------------------------------------------------------------

-- HOW MANY UNDECIDED REQUESTS ONE STUDENT MAY HOLD IN ONE SECTION.
create or replace function public._classroom_song_pending_cap()
returns integer
language sql
immutable
as $$
	select 3;
$$;

revoke all on function public._classroom_song_pending_cap()
	from public, anon, authenticated, service_role;

-- THE WHOLE URL RULE: https, and a host. Nothing about which host.
--
-- `https` ONLY, never `http`: the link is opened from a page served over TLS,
-- and a plain-http link is both a mixed-content warning and a downgrade nobody
-- chose. There is no allowlist here and there must not be one -- see the header.
create or replace function public._classroom_song_url_ok(p_url text)
returns boolean
language sql
immutable
as $$
	-- 'https://' then at least one character that is not a slash, a space or a
	-- control character. `~*` so a pasted `HTTPS://` is judged on what it means
	-- rather than on its casing; section 4 stores the url exactly as typed.
	select coalesce(p_url, '') ~* '^https://[^/\s]+';
$$;

revoke all on function public._classroom_song_url_ok(text)
	from public, anon, authenticated, service_role;

-- THE THREE-WAY DERIVATION, IN ONE PLACE. See the header for why the rejection
-- reason is a safe discriminator.
create or replace function public._classroom_song_status(
	p_decided_at timestamptz,
	p_rejection_reason text
)
returns text
language sql
immutable
as $$
	select case
		when p_decided_at is null then 'pending'
		when p_rejection_reason is null then 'approved'
		else 'rejected'
	end;
$$;

revoke all on function public._classroom_song_status(timestamptz, text)
	from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The table.
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_song_requests (
	id uuid primary key default gen_random_uuid(),
	section_id uuid not null,
	-- Lowercased, exactly as `classroom_enrollments.student_email` is -- the
	-- composite key below cannot match otherwise, and `current_user_email()`
	-- already lowercases what it returns.
	student_email text not null
		check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	-- STORED EXACTLY AS TYPED (trimmed of surrounding whitespace, nothing else).
	-- Not normalized, not canonicalized, not stripped of query parameters: a
	-- share link's parameters are frequently the part that identifies the track,
	-- and an instructor opening the link needs the bytes the student had.
	url text not null
		check (char_length(url) between 1 and 2000 and public._classroom_song_url_ok(url)),
	-- OPTIONAL. The link IS the request; the note is context ("for the last ten
	-- minutes", "clean version"). Requiring it would put a field between a
	-- student and the one thing they came to do, and an instructor who needs to
	-- know something can reject and say so.
	note text check (note is null or char_length(btrim(note)) between 1 and 300),
	created_at timestamptz not null default now(),
	-- THE STATE, DERIVED FROM THESE THREE. Null decided_at is pending; see
	-- `_classroom_song_status` and the header.
	decided_at timestamptz,
	decided_by text,
	rejection_reason text
		check (rejection_reason is null or char_length(btrim(rejection_reason)) between 1 and 500),
	-- THE COIN ROW THIS APPROVAL MINTED. A link rather than derived state: there
	-- is nothing on `coin_transactions` pointing back, so the association has to
	-- live on one side, and this is the side that has one row per charge.
	charge_transaction_id uuid references public.coin_transactions (id),

	-- A decision has a decider and a time, or it has neither.
	constraint classroom_song_requests_decided_pair
		check ((decided_at is null) = (decided_by is null)),
	-- An undecided request cannot carry a rejection reason.
	constraint classroom_song_requests_reason_needs_decision
		check (decided_at is not null or rejection_reason is null),
	-- APPROVED IF AND ONLY IF CHARGED. The half-completed approval this feature
	-- has to rule out is not merely avoided by section 5, it is unrepresentable.
	-- See the header.
	constraint classroom_song_requests_approved_is_charged
		check (
			(charge_transaction_id is not null)
			= (decided_at is not null and rejection_reason is null)
		),
	-- A decision that precedes the request is a clock or a caller fault.
	constraint classroom_song_requests_decided_after_created
		check (decided_at is null or decided_at >= created_at),
	constraint classroom_song_requests_enrollment_fk
		foreign key (section_id, student_email)
		references public.classroom_enrollments (section_id, student_email)
		on delete cascade
);

-- The manager's queue read and the student's own read are both "this section,
-- newest first"; the cap counts this student's undecided rows in this section.
create index if not exists classroom_song_requests_section_created_idx
	on public.classroom_song_requests (section_id, created_at desc);

create index if not exists classroom_song_requests_pending_idx
	on public.classroom_song_requests (section_id, student_email)
	where decided_at is null;

comment on table public.classroom_song_requests is
'One row per song request. LINKS ONLY -- there is no bucket, no bytes and no audio anywhere in this feature, and nothing plays in the app.

State is DERIVED, never stored: decided_at null is pending, decided with no rejection_reason is approved, decided with one is rejected. There is no status column. _classroom_song_status is the one implementation of that derivation.

APPROVED IF AND ONLY IF CHARGED, enforced by classroom_song_requests_approved_is_charged: an approved row with no coin transaction, and a charge with no approval, are both impossible. The charge is 2i¢ from the requester''s DIGITAL balance at APPROVAL; a request is free and a rejection refunds nothing because nothing was taken.

RLS is enabled with NO POLICY and NO GRANT to anon or authenticated, deliberately: every path is a SECURITY DEFINER RPC. A student sees the approved list plus their OWN requests; they never see another student''s pending or rejected request. Do not add a policy, a grant or a view over this table.';

-- RLS ON, NO POLICY, NO GRANT. Both halves are load-bearing; either one alone
-- already denies every client read. `0137`'s sweep is about FUNCTION grants, so
-- a table created after it is covered by nothing -- the absence below is the
-- whole mechanism.
alter table public.classroom_song_requests enable row level security;
revoke all on table public.classroom_song_requests from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reading the queue: ONE function, two projections, built separately.
--
-- The `0143` shape and for the `0143` reason: "what can a student learn" is
-- answerable by reading one function straight through, and the student's object
-- is assembled rather than filtered, so there is no strip step in which a field
-- can be forgotten.
-- ---------------------------------------------------------------------------
create or replace function public.classroom_song_queue(
	p_section_id uuid,
	p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_manages boolean;
	v_limit integer := least(greatest(coalesce(p_limit, 50), 0), 200);
	v_cap integer := public._classroom_song_pending_cap();
	v_approved jsonb;
	v_pending jsonb;
	v_decided jsonb;
	v_mine jsonb;
	v_my_pending integer;
	v_price integer;
begin
	-- No session is not an error, it is simply nobody to answer about.
	if v_email = '' or p_section_id is null then
		return null;
	end if;

	v_manages := public.classroom_manages_section(p_section_id);

	-- A SECTION THE CALLER IS NEITHER IN NOR OVER IS INDISTINGUISHABLE FROM ONE
	-- THAT DOES NOT EXIST. Both are null; neither raises.
	if not v_manages and not public.classroom_is_enrolled(p_section_id) then
		return null;
	end if;

	-- THE PRICE COMES FROM THE PRICE LIST, on every read, so the surface can say
	-- what an approval will cost without a second copy of the number. Null when
	-- the category is retired or missing, which is exactly when section 5 will
	-- refuse -- so a surface can say so before anybody presses.
	select c.amount into v_price
	from public.coin_categories c
	where c.id = 'song_request' and c.active and c.kind = 'purchase' and c.pricing_model = 'flat';

	if v_manages then
		-- THE MANAGER SEES EVERYTHING, WITH NAMES. The name is the ROSTER's
		-- `display_name` -- the enrollment row this request is keyed to already
		-- carries it, so there is no profiles join and no email/uuid bridge.
		select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at), '[]'::jsonb)
		into v_pending
		from (
			select
				r.id as request_id,
				r.url,
				r.note,
				r.created_at,
				r.student_email,
				coalesce(e.display_name, r.student_email) as student_name,
				public._classroom_song_status(r.decided_at, r.rejection_reason) as status
			from public.classroom_song_requests r
			left join public.classroom_enrollments e
				on e.section_id = r.section_id and e.student_email = r.student_email
			where r.section_id = p_section_id and r.decided_at is null
			-- OLDEST FIRST, and only here. A review queue is a line: the request
			-- that has been waiting longest is the one to decide next. Every other
			-- list in this function is newest first, because those are records.
			order by r.created_at
			limit v_limit
		) x;

		select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.decided_at desc), '[]'::jsonb)
		into v_decided
		from (
			select
				r.id as request_id,
				r.url,
				r.note,
				r.created_at,
				r.decided_at,
				r.decided_by,
				r.rejection_reason,
				r.student_email,
				coalesce(e.display_name, r.student_email) as student_name,
				public._classroom_song_status(r.decided_at, r.rejection_reason) as status
			from public.classroom_song_requests r
			left join public.classroom_enrollments e
				on e.section_id = r.section_id and e.student_email = r.student_email
			where r.section_id = p_section_id and r.decided_at is not null
			order by r.decided_at desc
			limit v_limit
		) x;

		return jsonb_build_object(
			'scope', 'manager',
			'section_id', p_section_id,
			'price', v_price,
			'pending_cap', v_cap,
			'pending', v_pending,
			'decided', v_decided
		);
	end if;

	-- -------------------------------------------------------------------
	-- THE STUDENT PROJECTION. Assembled from two queries, neither of which
	-- CAN return another student's undecided row:
	--
	--   * the approved list filters `rejection_reason is null and decided_at
	--     is not null`, so a pending or rejected row is not in its result set
	--     at all -- and it selects NO name, NO email and NO decided_by, so
	--     there is no expression here capable of identifying anybody.
	--   * the caller's own list is pinned in its WHERE clause to
	--     `r.student_email = v_email`.
	--
	-- Neither is the manager object with keys removed, and `v_pending` /
	-- `v_decided` are never even populated on this path.
	-- -------------------------------------------------------------------
	select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.decided_at desc), '[]'::jsonb)
	into v_approved
	from (
		select
			r.id as request_id,
			r.url,
			r.note,
			r.decided_at,
			-- WHOSE IT IS, AS ONE BIT AND NEVER AS A NAME. True only for the
			-- caller's own row; see the header for why a peer's name is withheld
			-- from a list of songs that will be played out loud anyway.
			r.student_email = v_email as mine
		from public.classroom_song_requests r
		where r.section_id = p_section_id
			and r.decided_at is not null
			and r.rejection_reason is null
		order by r.decided_at desc
		limit v_limit
	) x;

	select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc), '[]'::jsonb)
	into v_mine
	from (
		select
			r.id as request_id,
			r.url,
			r.note,
			r.created_at,
			r.decided_at,
			-- THEIR OWN REJECTION REASON, WHICH IS ADDRESSED TO THEM. It reaches
			-- nobody else: this query is pinned to the caller's own email and the
			-- approved list above selects no reason at all.
			r.rejection_reason,
			public._classroom_song_status(r.decided_at, r.rejection_reason) as status
		from public.classroom_song_requests r
		where r.section_id = p_section_id and r.student_email = v_email
		order by r.created_at desc
		limit v_limit
	) x;

	select count(*)::integer into v_my_pending
	from public.classroom_song_requests r
	where r.section_id = p_section_id and r.student_email = v_email and r.decided_at is null;

	return jsonb_build_object(
		'scope', 'student',
		'section_id', p_section_id,
		'price', v_price,
		'pending_cap', v_cap,
		-- THE CALLER'S OWN COUNT, so the surface can say "2 of 3 waiting" before
		-- they hit the cap rather than only afterwards. It is a count of their
		-- own rows and discloses nothing about anybody else's.
		'my_pending', v_my_pending,
		'approved', v_approved,
		'mine', v_mine
	);
end;
$$;

comment on function public.classroom_song_queue(uuid, integer) is
'The song queue for one section, projected by what the caller is.

A MANAGER gets every request with the requester''s name and email: the pending queue oldest first (a line), and the decided list newest first. AN ENROLLED STUDENT gets the APPROVED list -- carrying no requester name or email for anybody, only a `mine` bit on their own -- plus their OWN requests in every state with their own rejection reasons, and their own pending count. Anyone else gets NULL, which is also what a section id that does not exist returns.

A student never sees another student''s pending or rejected request through this function, in any form. The two projections are built in separate branches from separately pinned queries, on purpose: a field cannot leak by being forgotten in a strip step, because there is no strip step. Do not refactor them into one object.';

revoke all on function public.classroom_song_queue(uuid, integer)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_song_queue(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Asking for a song.
--
-- NO IDENTITY PARAMETER. The student is `current_user_email()`, so this
-- function cannot be asked to submit on somebody else's behalf -- there is no
-- argument through which to name them. That is the convention every other
-- student-facing classroom write follows, and it makes "can only act as
-- themselves" a property of the SIGNATURE rather than a check.
-- ---------------------------------------------------------------------------
create or replace function public.classroom_song_request(
	p_section_id uuid,
	p_url text,
	p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_url text := btrim(coalesce(p_url, ''));
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_cap integer := public._classroom_song_pending_cap();
	v_pending integer;
	v_id uuid;
	v_created timestamptz;
begin
	if v_email = '' then
		raise exception 'You must be signed in.';
	end if;

	-- A section this caller cannot see and one that does not exist answer the
	-- same way, so an id cannot be probed through the write path either.
	if p_section_id is null or not public.classroom_can_read_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;

	-- AN INSTRUCTOR DOES NOT REQUEST A SONG, and this is not covered by the
	-- enrollment check below: instructors enroll themselves to see a class the
	-- way a student does, and roster imports sweep them in (`0138`). So the
	-- manage question is asked separately and first. An instructor who wants a
	-- song plays one; there is nobody to charge and nobody to review it.
	if public.classroom_manages_section(p_section_id) then
		return jsonb_build_object('ok', false, 'reason', 'not_a_student');
	end if;

	if not public.classroom_is_enrolled(p_section_id) then
		raise exception 'Only a student enrolled in this class can request a song.';
	end if;

	-- A REFUSAL, NOT A RAISE. A mistyped link is an ordinary thing that happens
	-- to somebody mid-task, and the surface has to render it where they are
	-- working rather than as an error.
	if not public._classroom_song_url_ok(v_url) then
		return jsonb_build_object('ok', false, 'reason', 'bad_url');
	end if;
	if char_length(v_url) > 2000 then
		return jsonb_build_object('ok', false, 'reason', 'url_too_long', 'max', 2000);
	end if;
	if v_note is not null and char_length(v_note) > 300 then
		return jsonb_build_object('ok', false, 'reason', 'note_too_long', 'max', 300);
	end if;

	-- ------------------------------------------------------------------
	-- THE CAPACITY CHECK. See the header: this is the enforcement, not the
	-- UI, and the LOCK is what makes it one.
	--
	-- The enrollment row is the parent, it is guaranteed to exist (the
	-- composite foreign key on this table requires it), and holding it for
	-- the rest of the transaction is what serializes two submits from the
	-- same student. The count is taken AFTER the lock, never before: under
	-- READ COMMITTED the statement after the wait gets a fresh snapshot, so
	-- it genuinely sees the winner's committed row.
	-- ------------------------------------------------------------------
	perform 1 from public.classroom_enrollments e
	where e.section_id = p_section_id and e.student_email = v_email
	for update;

	select count(*)::integer into v_pending
	from public.classroom_song_requests r
	where r.section_id = p_section_id and r.student_email = v_email and r.decided_at is null;

	if v_pending >= v_cap then
		-- THE NUMBERS RIDE ALONG so the sentence can name the cap. A refusal that
		-- says only "no" leaves a student guessing at a rule nothing states.
		return jsonb_build_object(
			'ok', false, 'reason', 'pending_cap', 'cap', v_cap, 'pending', v_pending
		);
	end if;

	insert into public.classroom_song_requests (section_id, student_email, url, note)
	values (p_section_id, v_email, v_url, v_note)
	returning id, created_at into v_id, v_created;

	return jsonb_build_object(
		'ok', true,
		'request_id', v_id,
		'section_id', p_section_id,
		'created_at', v_created,
		'status', 'pending',
		'pending', v_pending + 1,
		'cap', v_cap
	);
end;
$$;

comment on function public.classroom_song_request(uuid, text, text) is
'Requests a song for one section, as the CALLER. Takes no identity parameter: the student is current_user_email(), so asking on somebody else''s behalf is not expressible.

FREE. Nothing is charged here; the 2i¢ lands at APPROVAL (classroom_song_approve), which is why a rejection refunds nothing.

The url must be https with a host, and no service is parsed or special-cased. Refuses with reason ''pending_cap'' (carrying cap and pending) once the caller already holds _classroom_song_pending_cap() undecided requests in this section -- a real capacity check taken under a row lock on the enrollment, not a hidden button. An instructor of the section is refused with ''not_a_student'' even when they hold an enrollment row, which they often do.';

revoke all on function public.classroom_song_request(uuid, text, text)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_song_request(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Approving, which is also where the coin moves.
--
-- TWO FUNCTIONS RATHER THAN ONE TAKING A BOOLEAN, for the reason `ENDPOINTS` in
-- `$lib/classroom/file-upload.ts` is a literal map and `0144` split the hall
-- pass close in two: a flag is a value that can be computed wrongly, where two
-- names cannot be. And it buys something specific here -- the REASON is a
-- REQUIRED PARAMETER of `classroom_song_reject`, so "a rejection carries a
-- reason" is a property of the signature rather than a check inside a branch
-- somebody could take the wrong side of.
--
-- IT NAMES THE REQUEST, not the section. A manager's own payload already hands
-- them every request id, so a handle costs no disclosure -- and naming it is
-- what carries the instructor's intent across the gap between reading the queue
-- and pressing, which is `0144`'s whole lesson. A section-keyed approve would
-- re-resolve "the oldest pending one" at the instant the request landed.
-- ---------------------------------------------------------------------------
create or replace function public.classroom_song_approve(p_request_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_req public.classroom_song_requests;
	v_name text;
	v_price integer;
	v_balance integer;
	v_txn public.coin_transactions;
	v_decided timestamptz;
	-- `0096`: an approval happens in the app with nobody handing over a coin,
	-- which is what that migration calls digital. Written down once, here.
	v_medium constant text := 'digital';
begin
	if v_email = '' then
		raise exception 'You must be signed in.';
	end if;
	if p_request_id is null then
		raise exception 'That request does not exist.';
	end if;

	-- `for update` so two instructors pressing at once do not both charge. The
	-- loser re-reads inside the lock and finds it already decided, which is the
	-- `already_decided` refusal below -- so the coin cannot be taken twice.
	select * into v_req
	from public.classroom_song_requests
	where id = p_request_id
	for update;

	-- A REQUEST THE CALLER MAY NOT REVIEW AND ONE THAT DOES NOT EXIST ANSWER
	-- IDENTICALLY, so an id cannot be probed. The manage question is asked of
	-- the row's OWN section, which is the only section that could authorize it.
	if v_req.id is null or not public.classroom_manages_section(v_req.section_id) then
		raise exception 'That request does not exist.';
	end if;

	if v_req.decided_at is not null then
		-- A REFUSAL, NOT A RAISE, AND IT CARRIES WHAT HAPPENED INSTEAD. Two
		-- instructors deciding one request a second apart is ordinary; the second
		-- one is a no-op somebody should be told about, and told WHICH way it
		-- went -- reporting an approval for a request a colleague just rejected
		-- is how somebody concludes their press worked.
		return jsonb_build_object(
			'ok', false,
			'reason', 'already_decided',
			'request_id', v_req.id,
			'status', public._classroom_song_status(v_req.decided_at, v_req.rejection_reason)
		);
	end if;

	select e.display_name into v_name
	from public.classroom_enrollments e
	where e.section_id = v_req.section_id and e.student_email = v_req.student_email;
	v_name := coalesce(v_name, v_req.student_email);

	-- ------------------------------------------------------------------
	-- THE PRICE, FROM THE PRICE LIST. Never a literal in this file: section
	-- 7 moves the real number and a copy here would be a second price list.
	--
	-- A RETIRED OR RESHAPED CATEGORY REFUSES RATHER THAN APPROVING FREE.
	-- `active = false` is how this schema retires a category (`0080`), and
	-- an admin who retires `song_request` has decided to stop charging for
	-- this. Approving free would be that decision silently becoming a
	-- different one; refusing is legible and recoverable, and the
	-- approved-is-charged constraint would refuse the write anyway.
	-- ------------------------------------------------------------------
	select c.amount into v_price
	from public.coin_categories c
	where c.id = 'song_request' and c.active and c.kind = 'purchase' and c.pricing_model = 'flat';

	if v_price is null then
		return jsonb_build_object(
			'ok', false,
			'reason', 'not_priced',
			'request_id', v_req.id,
			'student_name', v_name
		);
	end if;

	-- ------------------------------------------------------------------
	-- THE DEBT LOCKOUT, ASKED OF THE DIGITAL BALANCE, `0096`'s rule.
	--
	-- ALREADY negative refuses; a purchase that itself dips a non-negative
	-- balance below zero is allowed, which is what this coin system does
	-- everywhere else and is not this feature's to tighten.
	-- ------------------------------------------------------------------
	v_balance := public._coin_balance(v_req.student_email, v_medium);
	if v_balance < 0 then
		-- THE REFUSAL NAMES THE STUDENT, because the instructor is the person who
		-- has to act on it. AND NOTHING IS WRITTEN: the request is still pending,
		-- unmarked and unmoved, so the same press works later with nothing to
		-- undo. `reason` is `debt`, the same word the coin desk already answers
		-- with.
		return jsonb_build_object(
			'ok', false,
			'reason', 'debt',
			'request_id', v_req.id,
			'student_email', v_req.student_email,
			'student_name', v_name,
			'medium', v_medium,
			'balance', v_balance,
			'price', v_price
		);
	end if;

	-- ------------------------------------------------------------------
	-- THE CHARGE AND THE FLIP. One transaction, and the constraint on the
	-- table makes either one alone impossible -- see the header.
	--
	-- The insert comes FIRST because the flip needs the transaction's id to
	-- satisfy `classroom_song_requests_approved_is_charged`. If the update
	-- below failed for any reason the insert rolls back with it, so the
	-- ordering costs nothing.
	--
	-- `_coin_insert` is THE row shape and is called, not re-implemented; it
	-- stamps `actor_email` from `current_user_email()`, which is this
	-- instructor, and that is exactly right -- they are who spent it.
	-- ------------------------------------------------------------------
	v_txn := public._coin_insert(
		v_req.student_email,
		'song_request',
		-- A `purchase` is signed NEGATIVE. The one line of `coin_log_transaction`
		-- genuinely restated here; the header names the retrofit that removes it.
		-v_price,
		null,
		'Song request approved in class.',
		jsonb_build_object('song_request_id', v_req.id, 'section_id', v_req.section_id),
		v_medium
	);

	update public.classroom_song_requests r
	set decided_at = now(),
		decided_by = v_email,
		charge_transaction_id = v_txn.id
	where r.id = v_req.id
	returning r.decided_at into v_decided;

	return jsonb_build_object(
		'ok', true,
		'request_id', v_req.id,
		'section_id', v_req.section_id,
		'status', 'approved',
		'decided_at', v_decided,
		'student_email', v_req.student_email,
		'student_name', v_name,
		'charged', v_price,
		'transaction_id', v_txn.id,
		'medium', v_medium,
		'balance', public._coin_balance(v_req.student_email, v_medium)
	);
end;
$$;

comment on function public.classroom_song_approve(uuid) is
'Approves one named song request and charges its requester in the same transaction.

THE CHARGE IS THE PRICE OF coin_categories.song_request, taken from the student''s DIGITAL balance (0096: an approval in the app hands nobody a coin). It refuses with reason ''debt'' -- naming the student, because the instructor is who must act on it -- when that balance is ALREADY negative, which is this coin system''s existing rule and not a stricter one; a purchase that itself dips a non-negative balance below zero is allowed. On a debt refusal NOTHING is written and the request stays pending, so the same press works later.

Refuses ''not_priced'' if the song_request category has been retired or reshaped, rather than approving free. Refuses ''already_decided'' (carrying the status it actually has) when a colleague got there first, which is what stops a request being charged twice.

Approved and charged cannot come apart: they are one transaction, and classroom_song_requests_approved_is_charged makes either half alone unrepresentable.

Caller must manage the request''s own section; anyone else gets the same "does not exist" a bad id gets.';

revoke all on function public.classroom_song_approve(uuid)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_song_approve(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Rejecting, which costs nothing and refunds nothing.
--
-- THE REASON IS A REQUIRED PARAMETER. Not defaulted, not nullable in practice:
-- "a rejection carries a reason" is the established shape for every review
-- queue here (the Foundry console's `reviewCanSend`, whose note the `0130` RPC
-- raises without), and making it required in the SIGNATURE is what means no
-- branch has to remember it.
--
-- NOTHING WAS CHARGED, SO NOTHING IS REFUNDED, and there is no refund path in
-- this file at all. That is the whole reason the price moved to approval.
-- ---------------------------------------------------------------------------
create or replace function public.classroom_song_reject(
	p_request_id uuid,
	p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	-- NOT `btrim`: a reason of newlines and tabs is empty to whoever typed it
	-- and empty to the client's `trim()`, and `btrim` with no second argument
	-- strips SPACES ONLY. The regexp is the repo's own spelling of this
	-- (CLAUDE.md, SQL traps) -- `btrim(x, E' \t\n')` is the trap, because an
	-- escape Postgres does not recognise in an E'' string is kept as the bare
	-- letter.
	v_reason text := nullif(regexp_replace(coalesce(p_reason, ''), '^\s+|\s+$', '', 'g'), '');
	v_req public.classroom_song_requests;
	v_name text;
	v_decided timestamptz;
begin
	if v_email = '' then
		raise exception 'You must be signed in.';
	end if;
	if p_request_id is null then
		raise exception 'That request does not exist.';
	end if;

	select * into v_req
	from public.classroom_song_requests
	where id = p_request_id
	for update;

	if v_req.id is null or not public.classroom_manages_section(v_req.section_id) then
		raise exception 'That request does not exist.';
	end if;

	if v_req.decided_at is not null then
		return jsonb_build_object(
			'ok', false,
			'reason', 'already_decided',
			'request_id', v_req.id,
			'status', public._classroom_song_status(v_req.decided_at, v_req.rejection_reason)
		);
	end if;

	-- A REFUSAL RATHER THAN A RAISE, so the console renders it in the same
	-- problem list as everything else. The database would refuse the write in
	-- any case -- a rejected row with no reason is not a representable state --
	-- but a caller must not have to read a constraint violation to learn it.
	if v_reason is null then
		return jsonb_build_object('ok', false, 'reason', 'reason_required', 'request_id', v_req.id);
	end if;
	if char_length(v_reason) > 500 then
		return jsonb_build_object(
			'ok', false, 'reason', 'reason_too_long', 'max', 500, 'request_id', v_req.id
		);
	end if;

	select e.display_name into v_name
	from public.classroom_enrollments e
	where e.section_id = v_req.section_id and e.student_email = v_req.student_email;

	update public.classroom_song_requests r
	set decided_at = now(),
		decided_by = v_email,
		rejection_reason = v_reason
	where r.id = v_req.id
	returning r.decided_at into v_decided;

	return jsonb_build_object(
		'ok', true,
		'request_id', v_req.id,
		'section_id', v_req.section_id,
		'status', 'rejected',
		'decided_at', v_decided,
		'student_email', v_req.student_email,
		'student_name', coalesce(v_name, v_req.student_email),
		'rejection_reason', v_reason,
		-- STATED RATHER THAN IMPLIED. A console that has just charged somebody on
		-- the row above must not leave "was this one charged too" to be inferred.
		'charged', 0
	);
end;
$$;

comment on function public.classroom_song_reject(uuid, text) is
'Rejects one named song request with a reason.

THE REASON IS A REQUIRED PARAMETER, so "a rejection carries a reason" is a property of the signature rather than a check inside a branch. A blank or whitespace-only reason is refused with ''reason_required'' (whitespace judged the repo''s way, not with btrim, which strips spaces only).

NOTHING IS CHARGED AND NOTHING IS REFUNDED: a request is free, so a rejection has no coin consequence at all and the response says charged 0 rather than leaving it to be inferred.

The reason reaches the requester and NOBODY ELSE -- classroom_song_queue''s student branch selects it only from a query pinned to the caller''s own email, and its approved list selects no reason at all.

Caller must manage the request''s own section; anyone else gets the same "does not exist" a bad id gets.';

revoke all on function public.classroom_song_reject(uuid, text)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_song_reject(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The price list moves: song_request 3i¢ -> 2i¢, with a note that is true.
--
-- THE ID IS KEPT. `song_request` is a stable key that
-- `coin_transactions.category_id` references; a new row would orphan every
-- charge already logged and leave two categories meaning one thing. `0080`'s
-- own doctrine, one level up: retire, never delete, and here not even retire.
--
-- IDEMPOTENT AND RE-APPLIABLE. A plain UPDATE to fixed values converges: the
-- second application changes nothing and reports the same end state. The
-- notice prints what the row held BEFORE, so an operator re-pasting this file
-- can see whether it was already applied rather than guessing.
--
-- IT IS NOT GUARDED AGAINST A LATER ADMIN EDIT, and that is deliberate rather
-- than overlooked: `0080` gives an admin no way to change a price at all
-- (`coin_admin_set_category_active` only ever flips `active`, and
-- `coin_admin_create_category` only creates), so the SQL editor is the one
-- place this number can move and a re-paste of this file is a statement about
-- what it should be.
--
-- ROWS ALREADY LOGGED AT 3i¢ ARE NOT TOUCHED, and must not be. They are
-- HISTORY: somebody really was charged three coins for a request under the old
-- rule, and `coin_transactions` is append-only with no UPDATE grant precisely
-- so that a price change cannot rewrite what happened. Every balance stays
-- exactly what it was.
-- ---------------------------------------------------------------------------

do $$
declare
	v_before public.coin_categories;
	v_after public.coin_categories;
	v_logged integer;
begin
	select * into v_before from public.coin_categories where id = 'song_request';

	if v_before.id is null then
		-- REFUSE RATHER THAN CREATE. A missing row means this database is not the
		-- one `0070` was applied to, and inventing a category here would hide
		-- that. A migration refuses when a precondition is unmet.
		raise exception '0145: coin_categories has no song_request row. 0070 is the file that creates it -- this database has not had it applied, and 0145 will not invent a price list entry.';
	end if;

	update public.coin_categories
	set amount = 2,
		notes = 'Free to ask. The 2i¢ is charged only if an instructor APPROVES the request, from the student''s digital balance; a rejected request costs nothing. Requests are per class, capped at 3 waiting at once, and are links only -- nothing is uploaded and nothing plays in the app.'
	where id = 'song_request';

	select * into v_after from public.coin_categories where id = 'song_request';

	select count(*)::integer into v_logged
	from public.coin_transactions where category_id = 'song_request';

	raise notice '0145: song_request price % -> % i¢. Kind %, pricing_model %, active %.',
		v_before.amount, v_after.amount, v_after.kind, v_after.pricing_model, v_after.active;
	raise notice '0145: % song_request transaction(s) already logged. NONE were altered -- coin_transactions is append-only and every existing balance is unchanged.',
		v_logged;

	if v_after.amount <> 2 or v_after.kind <> 'purchase' or v_after.pricing_model <> 'flat' or not v_after.active then
		raise exception '0145: song_request did not end up priced 2i¢ as an active flat purchase (amount %, kind %, model %, active %). classroom_song_approve refuses on anything else.',
			v_after.amount, v_after.kind, v_after.pricing_model, v_after.active;
	end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. What this deployment actually holds.
--
-- The ACL and the catalog are READ BACK rather than assumed: a self-check
-- reporting that a revoke statement ran tells an operator only that the
-- statement ran (`0143`'s section 5, and the CLAUDE.md rule it comes from --
-- assert the ACL, not the self-check's verdict).
-- ---------------------------------------------------------------------------

do $$
declare
	v_rls boolean;
	v_policies integer;
	v_table_grants integer;
	v_constraints integer;
	v_sections integer;
	v_enrollments integer;
	r record;
begin
	select relrowsecurity into v_rls
	from pg_class where oid = 'public.classroom_song_requests'::regclass;

	select count(*) into v_policies
	from pg_policies where schemaname = 'public' and tablename = 'classroom_song_requests';

	select count(*) into v_table_grants
	from information_schema.role_table_grants
	where table_schema = 'public'
		and table_name = 'classroom_song_requests'
		and grantee in ('anon', 'authenticated', 'public');

	if not v_rls then
		raise exception '0145: RLS is OFF on classroom_song_requests. The table is open.';
	end if;
	if v_policies <> 0 then
		raise exception '0145: classroom_song_requests has % policy/policies. It must have NONE -- every path is a definer RPC.', v_policies;
	end if;
	if v_table_grants <> 0 then
		raise exception '0145: classroom_song_requests carries % grant(s) to anon/authenticated/public. It must carry none.', v_table_grants;
	end if;

	-- THE HALF-APPROVAL CONSTRAINT BY NAME. It is the thing that makes "the coin
	-- and the flip happen together or not at all" survive a future write path,
	-- so its absence is a finding rather than a detail.
	select count(*) into v_constraints
	from pg_constraint
	where conrelid = 'public.classroom_song_requests'::regclass
		and conname = 'classroom_song_requests_approved_is_charged';
	if v_constraints <> 1 then
		raise exception '0145: classroom_song_requests_approved_is_charged is missing. An approved request could exist with no charge.';
	end if;

	raise notice '0145: classroom_song_requests -- RLS on, 0 policies, 0 client grants, approved-is-charged constraint present.';

	-- The functions, read off the catalog rather than assumed. The three private
	-- helpers must hold NEITHER grant; the three public RPCs must hold
	-- `authenticated` and not `anon`.
	for r in
		select p.oid::regprocedure::text as sig,
			p.proname,
			has_function_privilege('anon', p.oid, 'execute') as anon_x,
			has_function_privilege('authenticated', p.oid, 'execute') as auth_x
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public'
			and (p.proname like 'classroom_song%' or p.proname like '\_classroom\_song%')
		order by 1
	loop
		if r.proname like '\_%' then
			if r.anon_x or r.auth_x then
				raise exception '0145: private helper % is granted -- anon %, authenticated %. Expected false/false.',
					r.sig, r.anon_x, r.auth_x;
			end if;
		elsif r.anon_x or not r.auth_x then
			raise exception '0145: grant is wrong on % -- anon execute=%, authenticated execute=%. Expected false/true.',
				r.sig, r.anon_x, r.auth_x;
		end if;
		raise notice '0145: % -- anon %, authenticated %.', r.sig, r.anon_x, r.auth_x;
	end loop;

	select count(*) into v_sections from public.classroom_sections;
	select count(*) into v_enrollments from public.classroom_enrollments where active;
	raise notice '0145: the song queue is now available in % section(s), to % active enrollment(s). No rows were created and nothing was backfilled -- there was no prior request concept of any kind to migrate.',
		v_sections, v_enrollments;
	raise notice '0145: TO UNDO -- drop function classroom_song_reject(uuid,text), classroom_song_approve(uuid), classroom_song_request(uuid,text,text), classroom_song_queue(uuid,integer), _classroom_song_status(timestamptz,text), _classroom_song_url_ok(text), _classroom_song_pending_cap(); drop table classroom_song_requests; then update coin_categories set amount = 3, notes = (0070 text) where id = ''song_request''. Dropping the table destroys the request history and the charge links, but NOT the coin rows themselves.';
end $$;

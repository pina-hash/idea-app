-- supabase/data/0203-ideacad-realtime-verification.sql
--
-- READ ONLY. Paste this into the Supabase SQL editor AFTER
-- supabase/migrations/0211_ideacad_realtime_policy.sql has applied.
--
-- It writes nothing to the schema. It creates ONE TEMPORARY table, `partc_out`,
-- which part C fills and the statement after it reads. It sets a request claim
-- inside a
-- transaction-local set_config and clears it again, so it leaves no role and no
-- setting behind and a second run reads exactly the same.
--
-- WHY IT IS IN THIS DIRECTORY. supabase/data holds hand-pasted SQL that is not
-- a migration, named for the ledger entry that produced it -- 0191 and 0194 are
-- the two before it. Those two are data CORRECTIONS and this is a PROBE, which
-- is a different job; what it shares with them is the thing the directory is
-- actually for: it is pasted by hand, tools/apply-migration.mjs does not know
-- about it and must not be taught to, and it is superseded rather than amended.
--
-- WHY IT IS NOT AT THE BOTTOM OF 0211. The probe needs a plpgsql block, and a
-- dollar-quote token inside a leading-dash comment balances in Postgres while
-- breaking the Supabase editor's own client-side statement splitter. Commenting
-- this out inside the migration is the exact shape that cost 0194 a full apply
-- cycle. Neither file carries a dollar sign in any comment.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS ANSWERS THAT THE MIGRATION'S OWN SELF-CHECK CANNOT
-- ---------------------------------------------------------------------------
--
-- 0211 section 6 proves the two policies EXIST, carry the right command and the
-- right role, and are not bare permits. It cannot prove they ANSWER DIFFERENTLY
-- FOR TWO DIFFERENT PEOPLE.
--
-- THAT IS THE WHOLE POINT OF THIS FILE. A policy that permits everyone and a
-- policy that is correct are INDISTINGUISHABLE in any catalog listing and in
-- any row count: both show two policies on realtime.messages. So part C below
-- asks the same question twice -- once as a real document's real owner, once as
-- a planted stranger on no roster -- and prints both answers beside the
-- identity of the document it asked about.
--
-- EVERY PART NAMES WHAT IT EXAMINED. There is no bare count anywhere in this
-- file, deliberately: a count is the one answer that cannot be checked.
--
-- ---------------------------------------------------------------------------
-- HOW TO READ IT
-- ---------------------------------------------------------------------------
--
--   Part A  the two policies with their FULL expression. An expression that
--           reads merely `true` is a policy permitting everything while
--           looking present.
--   Part B  whether realtime.messages is enforcing at all. A policy on a table
--           with RLS off is inert and part A looks identical either way.
--   Part C  the behavioural probe. This is the one that matters.
--
-- PART C EXPECTED READING:
--
--   FRAME topic   owner:    read = t   send = t
--                 stranger: read = f   send = f
--   PING  topic   owner:    send = t   (read = f, unless that owner also
--                                       manages the item, which a student does
--                                       not -- f is the correct student answer)
--                 stranger: read = f   send = f
--
-- ANY OTHER READING IS A FAILURE and each means something different:
--
--   both read true          the gate is PERMITTING EVERYTHING. This is the
--                           reading parts A and B cannot see.
--   owner read false        the gate is REFUSING THE OWNER. Live preview is
--                           dead rather than private.
--   owner ping send false   students cannot heartbeat, so the teacher's live
--                           roster stays EMPTY. See 0211's note on the join
--                           rule for the one-line widening that fixes it.
--   probe_state not 'probed'
--                           it examined NOTHING. The true/false columns are
--                           meaningless; do not read them as a pass.
--   any answer NULL         INDETERMINATE. A NULL is neither a grant nor a
--                           refusal, and it fell through every test in the
--                           deployed plpgsql ladder into the PASS arm. It is
--                           now its own rung, read FIRST, for that reason.
--
-- Part C RETURNS THESE AS ROWS, one per line above, ending in a `C. VERDICT`
-- row that says which of them it got. It does NOT print notices: the Supabase
-- SQL editor displays neither `raise notice` nor `raise warning`, so the
-- plpgsql version this replaces was indistinguishable from a run that examined
-- nothing. Read the `detail` column of the last row.
--
-- THE EDITOR SHOWS ONLY THE LAST STATEMENT'S RESULT SET, so run A, B and C by
-- selecting each section and running it on its own. Part C is last so that a
-- whole-file run still shows the verdict.
--
-- THE PROBE SIGNS ITS SUBJECTS IN BY `sub`, NOT BY `email`, AND THE VERSION
-- BEFORE THIS ONE DID NOT. `current_user_email()` (0067) does not read the
-- claim's `email` at all -- it looks `auth.uid()` up in `auth.users`, and
-- `auth.uid()` reads `sub`. A claim carrying only `email` therefore leaves
-- `current_user_email()` returning the EMPTY STRING, which is the first branch
-- `_ideacad_document_role` tests, so the owner resolved to no role and every
-- one of the eight answers came back false. Measured on the real chain against
-- the DEPLOYED block: `current_user_email=[]`, owner frame_read=f. The verdict
-- ladder then reported `FAIL -- REFUSING THE OWNER`, which is an accusation
-- against 0211 for a fault entirely inside this file. So part C could never
-- have returned PASS, on any database, with or without a document in it.
--
-- TWO STRANGERS, BECAUSE THEY PROVE DIFFERENT THINGS. The PLANTED address is
-- on no roster and in no `auth.users` row, so it is the SIGNED-OUT control and
-- it proves only that the gate refuses a caller with no session. The CLASSMATE
-- is a real signed-in account enrolled in a section this item is posted to,
-- holding no grant on the document, and confirmed NOT to manage the item -- so
-- they are the adversary that matters, and the one a roster-shaped predicate
-- would wrongly have admitted. A run that finds no classmate says so on its own
-- row rather than quietly testing the weaker half.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- A. THE POLICIES ON realtime.messages, WITH THEIR WHOLE EXPRESSION.
-- ---------------------------------------------------------------------------

select
	'A. policy' as part,
	pol.polname as policy_name,
	case pol.polcmd
		when 'r' then 'SELECT' when 'a' then 'INSERT'
		when 'w' then 'UPDATE' when 'd' then 'DELETE'
		else pol.polcmd::text
	end as command,
	coalesce(
		(select string_agg(r.rolname, ', ' order by r.rolname)
		 from pg_roles r where r.oid = any (pol.polroles)),
		'PUBLIC'
	) as granted_to,
	coalesce(
		pg_get_expr(pol.polqual, pol.polrelid),
		pg_get_expr(pol.polwithcheck, pol.polrelid)
	) as expression
from pg_policy pol
where pol.polrelid = 'realtime.messages'::regclass
order by pol.polname;

-- ---------------------------------------------------------------------------
-- B. IS THE TABLE ENFORCING AT ALL, and the three new functions' anon reach.
-- ---------------------------------------------------------------------------

select
	'B. table' as part,
	n.nspname || '.' || c.relname as object,
	c.relrowsecurity as rls_enabled,
	c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'realtime' and c.relname = 'messages';

select
	'B. function' as part,
	p.oid::regprocedure::text as object,
	has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
	has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
	and p.proname in (
		'_ideacad_realtime_topic_id',
		'_ideacad_realtime_can_read',
		'_ideacad_realtime_can_send'
	)
order by p.proname;

-- Expected for the block above:
--   _ideacad_realtime_topic_id   anon f   authenticated f
--   _ideacad_realtime_can_read   anon f   authenticated t
--   _ideacad_realtime_can_send   anon f   authenticated t
-- Any anon t is the 0201 defect returning: the revoke did not name anon.
-- authenticated f on either wrapper means every join fails with
-- "permission denied for function" rather than being refused.

-- ---------------------------------------------------------------------------
-- C. THE BEHAVIOURAL PROBE.
--
-- IT RETURNS ROWS. It used to be a plpgsql block reporting through
-- `raise notice` and `raise warning`, and the Supabase SQL editor DISPLAYS
-- NEITHER -- so a correct run and a run that reached no document looked
-- identical from the editor: an empty pane either way. That cost an hour on
-- 2026-09-13 and would have cost it again, which is why every line this part
-- has to say is now a ROW in a result set. There is no dollar-quoting left in
-- the file at all, which is also why the paste trap that sank 0194 cannot
-- reach it.
--
-- IT IS STILL A plpgsql BLOCK, AND THAT IS FORCED RATHER THAN PREFERRED. The
-- obvious rewrite is one big SELECT returning rows, and it CANNOT WORK here:
-- `current_user_email()` is STABLE and takes no arguments, so Postgres is free
-- to evaluate it ONCE PER STATEMENT and reuse the answer. Measured on the real
-- chain -- inside a single statement that signs the owner in, reads, then signs
-- a stranger in and reads again, the stranger's read came back as the OWNER
-- (`str_seen` = the owner's address, `str_fr` = true), while the identical
-- sequence split across two statements answered correctly (`''`, false). A
-- single statement therefore cannot probe two identities at all, and a version
-- that tried would have reported PERMITTING EVERYTHING against a policy that
-- was working. Each `perform`/assignment inside a block is its own statement,
-- which is why the block shape is the correct one.
--
-- SO THE BLOCK WRITES ROWS INSTEAD OF RAISING THEM. It fills a TEMP TABLE and a
-- plain `select` after it returns them. That is the one thing this file now
-- creates: `partc_out`, temporary, dropped at the top of every run and gone
-- when the connection closes. It touches no table in the schema.
--
-- `set_config(..., true)` is transaction-local exactly as before, so it dies
-- with the block's own statement, and the explicit clearing call is kept.
-- ---------------------------------------------------------------------------



drop table if exists partc_out;

create temp table partc_out (
	seq int,
	part text,
	topic text,
	subject text,
	can_read boolean,
	can_send boolean,
	detail text
);

do $verify$
declare
	v_doc uuid;
	v_item uuid;
	v_owner text;
	v_owner_sub uuid;
	v_stranger constant text := 'nobody.not-on-any-roster@example.invalid';
	v_mate text;
	v_mate_sub uuid;
	v_cand record;
	v_topic_doc text;
	v_topic_item text;
	v_owner_frame_read boolean; v_owner_frame_send boolean;
	v_owner_ping_read boolean;  v_owner_ping_send boolean;
	v_str_frame_read boolean;   v_str_frame_send boolean;
	v_str_ping_read boolean;    v_str_ping_send boolean;
	v_mate_frame_read boolean;  v_mate_frame_send boolean;
	v_mate_ping_read boolean;   v_mate_ping_send boolean;
	v_control uuid;
	v_mate_label text;
begin
	-- The instrument control, read FIRST. If the parser cannot read a topic it
	-- built itself, every false below is the parser and not the policy.
	v_control := public._ideacad_realtime_topic_id(
		'ideacad-doc:00000000-0000-0000-0000-000000000001', 'ideacad-doc:');
	if v_control is distinct from '00000000-0000-0000-0000-000000000001'::uuid then
		insert into partc_out values (0, 'C. probe_state', null, null, null, null,
			'INSTRUMENT BROKEN. _ideacad_realtime_topic_id did not parse a '
			|| 'well-formed topic, so nothing below would distinguish a refusal '
			|| 'from a parse failure. Stop and re-read 0211 section 2.');
		return;
	end if;

	select d.id, d.item_id, d.student_email
	into v_doc, v_item, v_owner
	from public.ideacad_documents d
	where exists (
		select 1 from public.classroom_postings cp where cp.item_id = d.item_id
	)
	order by d.created_at desc
	limit 1;

	if v_doc is null then
		insert into partc_out values (0, 'C. probe_state', null, null, null, null,
			'NO DOCUMENT EXAMINED. There is no ideacad_documents row on a posted '
			|| 'item, so this probe tested NOTHING and is not a pass. Open one '
			|| 'IdeaCAD document on a posted assignment and run part C again.');
		return;
	end if;

	-- The owner's `sub`. current_user_email() resolves auth.uid() against
	-- auth.users and ignores the claim's `email` entirely, so without this the
	-- owner is not signed in and every answer below is false for a reason that
	-- has nothing to do with the policy.
	select u.id into v_owner_sub
	from auth.users u where lower(u.email) = lower(v_owner);

	if v_owner_sub is null then
		insert into partc_out values (0, 'C. probe_state', null, null, null, null,
			'OWNER NOT RESOLVABLE. Document ' || v_doc::text || ' belongs to <'
			|| v_owner || '>, and no auth.users row carries that address, so the '
			|| 'probe cannot sign the owner in and cannot tell a refusal from a '
			|| 'caller who was never there. This is the instrument, NOT the policy.');
		return;
	end if;

	v_topic_doc := 'ideacad-doc:' || v_doc::text;
	v_topic_item := 'ideacad-live:' || v_item::text;

	-- The SIGNED-IN adversary: a real account enrolled in a section this item is
	-- posted to, holding no grant on the document, and NOT a manager of the item
	-- (a manager is the teacher of record and is supposed to read everything, so
	-- admitting one would manufacture a false FAIL). Each candidate is signed in
	-- and asked, because manage-ness is only answerable as that caller.
	for v_cand in
		select distinct u.id as sub, lower(u.email) as email
		from public.classroom_postings cp
		join public.classroom_enrollments ce
			on ce.section_id = cp.section_id and ce.active
		join auth.users u on lower(u.email) = lower(ce.student_email)
		where cp.item_id = v_item
			and lower(u.email) is distinct from lower(v_owner)
			and not exists (
				select 1 from public.ideacad_grants g
				where g.document_id = v_doc
					and lower(g.grantee_email) = lower(u.email)
			)
	loop
		perform set_config('request.jwt.claims',
			json_build_object('sub', v_cand.sub::text, 'email', v_cand.email)::text,
			true);
		if public._classroom_manages_item(v_item) is distinct from true then
			v_mate := v_cand.email;
			v_mate_sub := v_cand.sub;
			exit;
		end if;
	end loop;

	perform set_config('request.jwt.claims',
		json_build_object('sub', v_owner_sub::text, 'email', v_owner)::text, true);
	v_owner_frame_read := public._ideacad_realtime_can_read(v_topic_doc);
	v_owner_frame_send := public._ideacad_realtime_can_send(v_topic_doc);
	v_owner_ping_read := public._ideacad_realtime_can_read(v_topic_item);
	v_owner_ping_send := public._ideacad_realtime_can_send(v_topic_item);

	perform set_config('request.jwt.claims',
		json_build_object('email', v_stranger)::text, true);
	v_str_frame_read := public._ideacad_realtime_can_read(v_topic_doc);
	v_str_frame_send := public._ideacad_realtime_can_send(v_topic_doc);
	v_str_ping_read := public._ideacad_realtime_can_read(v_topic_item);
	v_str_ping_send := public._ideacad_realtime_can_send(v_topic_item);

	if v_mate_sub is not null then
		perform set_config('request.jwt.claims',
			json_build_object('sub', v_mate_sub::text, 'email', v_mate)::text, true);
		v_mate_frame_read := public._ideacad_realtime_can_read(v_topic_doc);
		v_mate_frame_send := public._ideacad_realtime_can_send(v_topic_doc);
		v_mate_ping_read := public._ideacad_realtime_can_read(v_topic_item);
		v_mate_ping_send := public._ideacad_realtime_can_send(v_topic_item);
	end if;

	perform set_config('request.jwt.claims', '', true);

	v_mate_label := case when v_mate is null then 'NONE FOUND'
		else '<' || v_mate || '>' end;

	insert into partc_out values (1, 'C. probe_state',
		v_topic_doc || ' + ' || v_topic_item,
		'document ' || v_doc::text || ' on item ' || v_item::text, null, null,
		'probed. owner <' || v_owner || '>, planted stranger <' || v_stranger
		|| '>, classmate ' || v_mate_label || '.');

	insert into partc_out values
		(2, 'C. FRAME', v_topic_doc, 'owner <' || v_owner || '>',
			v_owner_frame_read, v_owner_frame_send, null),
		(3, 'C. FRAME', v_topic_doc, 'planted stranger <' || v_stranger || '>',
			v_str_frame_read, v_str_frame_send, null),
		(4, 'C. FRAME', v_topic_doc, 'classmate ' || v_mate_label,
			v_mate_frame_read, v_mate_frame_send,
			case when v_mate is null then 'No enrolled account without a grant '
				|| 'was found, so the signed-in adversary was never asked.' end),
		(5, 'C. PING', v_topic_item, 'owner <' || v_owner || '>',
			v_owner_ping_read, v_owner_ping_send, null),
		(6, 'C. PING', v_topic_item, 'planted stranger <' || v_stranger || '>',
			v_str_ping_read, v_str_ping_send, null),
		(7, 'C. PING', v_topic_item, 'classmate ' || v_mate_label,
			v_mate_ping_read, v_mate_ping_send, null);

	-- The verdict ladder, in the order the header lists it. A NULL is read
	-- FIRST, because a NULL is neither a grant nor a refusal and in the version
	-- before this one it fell through every test into the PASS arm.
	if v_owner_frame_read is null or v_owner_frame_send is null
		or v_owner_ping_read is null or v_owner_ping_send is null
		or v_str_frame_read is null or v_str_frame_send is null
		or v_str_ping_read is null or v_str_ping_send is null then
		insert into partc_out values (8, 'C. VERDICT', null, null, null, null,
			'FAIL -- INDETERMINATE. At least one answer came back NULL, which is '
			|| 'neither a grant nor a refusal. Do not read the rows above as a '
			|| 'pass: a NULL falls through every test below into the PASS arm.');
	elsif v_owner_frame_read and v_str_frame_read then
		insert into partc_out values (8, 'C. VERDICT', null, null, null, null,
			'FAIL -- PERMITTING EVERYTHING. The planted stranger <' || v_stranger
			|| '> can read the frames of document ' || v_doc::text
			|| ', which belongs to <' || v_owner || '>. Parts A and B cannot see '
			|| 'this; a row count would have read as a pass.');
	elsif not v_owner_frame_read then
		insert into partc_out values (8, 'C. VERDICT', null, null, null, null,
			'FAIL -- REFUSING THE OWNER. <' || v_owner || '> cannot read the '
			|| 'frames of their own document ' || v_doc::text
			|| '. Live preview is dead rather than private.');
	elsif v_str_frame_read or v_str_frame_send
		or v_str_ping_read or v_str_ping_send then
		insert into partc_out values (8, 'C. VERDICT', null, null, null, null,
			'FAIL -- the planted stranger <' || v_stranger || '> holds at least '
			|| 'one permission on document ' || v_doc::text || ' or item '
			|| v_item::text || '.');
	elsif coalesce(v_mate_frame_read, false) or coalesce(v_mate_frame_send, false) then
		insert into partc_out values (8, 'C. VERDICT', null, null, null, null,
			'FAIL -- the classmate <' || coalesce(v_mate, '?') || '> is signed '
			|| 'in, enrolled in this section, and holds NO grant on document '
			|| v_doc::text || ', yet can reach its frame channel. This is the '
			|| 'exact reading a roster-shaped predicate produces, and the one the '
			|| 'planted stranger cannot see.');
	elsif not v_owner_frame_send then
		insert into partc_out values (8, 'C. VERDICT', null, null, null, null,
			'FAIL -- the owner <' || v_owner || '> cannot SEND frames for '
			|| 'document ' || v_doc::text || ', so nothing will ever appear on a '
			|| 'teacher''s live preview.');
	elsif not v_owner_ping_send then
		insert into partc_out values (8, 'C. VERDICT', null, null, null, null,
			'FAIL -- the owner <' || v_owner || '> cannot SEND a ping on item '
			|| v_item::text || ', so the teacher''s live roster will stay EMPTY '
			|| 'while the editor works normally. See 0211 section: the join rule, '
			|| 'for the one-line widening that fixes it.');
	elsif v_mate is null then
		insert into partc_out values (8, 'C. VERDICT', null, null, null, null,
			'PASS (PARTIAL) -- ENFORCING against a signed-out caller. Owner <'
			|| v_owner || '> reads and sends document ' || v_doc::text
			|| ' and sends pings on item ' || v_item::text || '; the planted '
			|| 'stranger got nothing. NO CLASSMATE WAS FOUND, so the signed-in '
			|| 'adversary was never asked and this run does NOT prove the gate '
			|| 'refuses one. Enrol a second account on this item and run again.');
	else
		insert into partc_out values (8, 'C. VERDICT', null, null, null, null,
			'PASS -- ENFORCING. Owner <' || v_owner || '> reads and sends '
			|| 'document ' || v_doc::text || ' and sends pings on item '
			|| v_item::text || '; the planted stranger and the signed-in '
			|| 'classmate <' || v_mate || '> both got nothing on either topic. '
			|| 'The answers differ by identity, so the gate is deciding rather '
			|| 'than permitting.');
	end if;
end
$verify$;

select seq, part, topic, subject, can_read, can_send, detail
from partc_out
order by seq;

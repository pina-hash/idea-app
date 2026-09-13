-- supabase/data/0203-ideacad-realtime-verification.sql
--
-- READ ONLY. Paste this into the Supabase SQL editor AFTER
-- supabase/migrations/0211_ideacad_realtime_policy.sql has applied.
--
-- It writes nothing. It creates nothing. It sets a request claim inside a
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
--
-- Part C prints its own VERDICT line saying which of those it got.
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
-- ---------------------------------------------------------------------------

do $verify$
declare
	v_doc uuid;
	v_item uuid;
	v_owner text;
	v_stranger constant text := 'nobody.not-on-any-roster@example.invalid';
	v_topic_doc text;
	v_topic_item text;
	v_owner_frame_read boolean; v_owner_frame_send boolean;
	v_owner_ping_read boolean;  v_owner_ping_send boolean;
	v_str_frame_read boolean;   v_str_frame_send boolean;
	v_str_ping_read boolean;    v_str_ping_send boolean;
	v_control uuid;
begin
	-- The instrument control, read FIRST. If the parser cannot read a topic it
	-- built itself, every false below is the parser and not the policy.
	v_control := public._ideacad_realtime_topic_id(
		'ideacad-doc:00000000-0000-0000-0000-000000000001', 'ideacad-doc:');
	if v_control is distinct from '00000000-0000-0000-0000-000000000001'::uuid then
		raise warning 'C. probe_state = INSTRUMENT BROKEN. _ideacad_realtime_topic_id did not parse a well-formed topic, so nothing below distinguishes a refusal from a parse failure. Stop and re-read 0211 section 2.';
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
		raise warning 'C. probe_state = NO DOCUMENT EXAMINED. There is no ideacad_documents row on a posted item, so this probe tested NOTHING and is not a pass. Open one IdeaCAD document on a posted assignment and run part C again.';
		return;
	end if;

	v_topic_doc := 'ideacad-doc:' || v_doc::text;
	v_topic_item := 'ideacad-live:' || v_item::text;

	raise notice 'C. probe_state = probed. document % on item %, owner <%>, planted stranger <%>.',
		v_doc, v_item, v_owner, v_stranger;
	raise notice 'C. topics examined: % and %.', v_topic_doc, v_topic_item;

	perform set_config('request.jwt.claims',
		json_build_object('email', v_owner)::text, true);
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

	perform set_config('request.jwt.claims', '', true);

	raise notice 'C. FRAME % -- owner <%> read=% send=% | stranger <%> read=% send=%',
		v_topic_doc, v_owner, v_owner_frame_read, v_owner_frame_send,
		v_stranger, v_str_frame_read, v_str_frame_send;
	raise notice 'C. PING  % -- owner <%> read=% send=% | stranger <%> read=% send=%',
		v_topic_item, v_owner, v_owner_ping_read, v_owner_ping_send,
		v_stranger, v_str_ping_read, v_str_ping_send;

	if v_owner_frame_read and v_str_frame_read then
		raise warning 'C. VERDICT: FAIL -- PERMITTING EVERYTHING. The planted stranger <%> can read the frames of document %, which belongs to <%>. Parts A and B cannot see this; a row count would have read as a pass.',
			v_stranger, v_doc, v_owner;
	elsif not v_owner_frame_read then
		raise warning 'C. VERDICT: FAIL -- REFUSING THE OWNER. <%> cannot read the frames of their own document %. Live preview is dead rather than private.',
			v_owner, v_doc;
	elsif v_str_frame_read or v_str_frame_send or v_str_ping_read or v_str_ping_send then
		raise warning 'C. VERDICT: FAIL -- the planted stranger <%> holds at least one permission on document % or item %.',
			v_stranger, v_doc, v_item;
	elsif not v_owner_frame_send then
		raise warning 'C. VERDICT: FAIL -- the owner <%> cannot SEND frames for document %, so nothing will ever appear on a teacher''s live preview.',
			v_owner, v_doc;
	elsif not v_owner_ping_send then
		raise warning 'C. VERDICT: FAIL -- the owner <%> cannot SEND a ping on item %, so the teacher''s live roster will stay EMPTY while the editor works normally. See 0211 section: the join rule, for the one-line widening that fixes it.',
			v_owner, v_item;
	else
		raise notice 'C. VERDICT: PASS -- ENFORCING. Owner <%> reads and sends document % and sends pings on item %; planted stranger <%> got nothing on either topic. The two answers differ, so the gate is deciding rather than permitting.',
			v_owner, v_doc, v_item, v_stranger;
	end if;
end
$verify$;

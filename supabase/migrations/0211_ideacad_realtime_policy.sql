-- 0211_ideacad_realtime_policy.sql
--
-- Apply manually in the Supabase SQL editor, AFTER 0210.
-- DO NOT APPLY FROM THE SESSION CONTAINER. This environment cannot reach
-- production and must not try: the egress proxy accepts a CONNECT to port 5432
-- and then carries no bytes, permanently. Measured again on 2026-09-13, twenty
-- seconds, zero bytes from the server.
--
-- A VERIFICATION QUERY TO PASTE AFTER THIS FILE is section 7. It is not part of
-- the migration and writes nothing. Run it; it names what it examined.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS IS
-- ---------------------------------------------------------------------------
--
-- Mr. Pina's decision 25, 2026-09-13: OPTION B, build it properly. IdeaCAD's
-- live-preview broadcast moves onto AUTHORIZED PRIVATE Realtime channels, so
-- that the database decides who may publish a frame and who may receive one,
-- instead of that being any holder of the public anon key.
--
-- docs/decisions/entries/25-ideacad-private-realtime.md is the record. It
-- carries the measurement and the two refused alternatives, and this file does
-- not restate them beyond the one that must not be reinvented:
--
--   OPTION C, SIGNING THE FRAME PAYLOAD, IS REFUSED. A secret in the browser is
--   not a secret. It is the shape that looks like a control and is not. Do not
--   revisit it; if this policy ever has to be replaced, replace it with another
--   database gate.
--
-- ---------------------------------------------------------------------------
-- THIS IS THE FIRST realtime. POLICY IN THE SCHEMA
-- ---------------------------------------------------------------------------
--
-- Re-measured 2026-09-13 before a line of this was written:
-- `grep -rn 'realtime\.' supabase/migrations/*.sql` returns NOTHING across the
-- whole chain, 0001 through 0210. So there is no prior shape in this repo to
-- copy and nothing here is modelled on a neighbour. The shape is Supabase's own
-- documented one for Realtime Authorization: RLS policies on realtime.messages,
-- with realtime.topic() naming the channel the caller is trying to join.
--
-- WHAT THIS DOES NOT TOUCH. Realtime consults these policies only for a channel
-- the client opened with `config.private = true`. Every other channel in this
-- codebase -- classroom presence, the GAUNTLET rooms, the FSP feed, IdeaCAD's
-- own ASSEMBLY channel from 0207 -- is a public channel and is not affected by
-- a policy on realtime.messages. This file changes the behaviour of exactly the
-- two topics section 2 names and nothing else.
--
-- ---------------------------------------------------------------------------
-- THE TWO TOPICS, AND WHY EACH SIDE IS GATED THE WAY IT IS
-- ---------------------------------------------------------------------------
--
-- src/lib/ideacad/live.ts mints exactly two channel names:
--
--   ideacad-live:<itemId>       the PING channel -- a student's heartbeat, so a
--                               teacher's live view knows who is working. The
--                               payload is {documentId, conceptId, revision}.
--
--   ideacad-doc:<documentId>    the FRAME channel -- the actual live preview of
--                               one document's feature tree.
--
-- THE PING CHANNEL IS ASYMMETRIC ON PURPOSE, AND SUPABASE'S JOIN RULE IS WHAT
-- MAKES THAT EXPRESSIBLE. The documentation is explicit: "To join a Broadcast
-- Channel, a user must have at least one read or write permission on the
-- Channel topic." So a caller holding INSERT and not SELECT still joins, and
-- simply never receives. That is exactly a student: they SEND a heartbeat and
-- have no reason to receive one.
--
--   ping SELECT (receive):  _classroom_manages_item(itemId)
--   ping INSERT (send):     classroom_can_read_item(itemId)
--
-- classroom_can_read_item is 0109's function and is already the roster
-- predicate this decision asked for -- it is "manages the section, or the item
-- is live and the caller is enrolled in a section it is posted to". It is
-- already granted to authenticated. Nothing about it is restated here.
--
-- WHY A STUDENT DOES NOT RECEIVE PINGS, stated as a decision rather than left
-- to be inferred: no client code subscribes to pings except the teacher's view,
-- so granting classmates SELECT would be granting a permission with no caller.
-- The codebase's own rule is that an omitted transport removes the control.
--
--   IF THE JOIN RULE ABOVE IS EVER WRONG, HERE IS THE SYMPTOM AND THE FIX, so
--   nobody has to rediscover it. Symptom: students' editors work normally,
--   saves land, the frame channel is fine, and the teacher's live roster stays
--   EMPTY because no ping ever arrived. Fix: widen the ping SELECT policy to
--   classroom_can_read_item, the same predicate its INSERT already uses. That
--   is a one-line change and it costs only what the paragraph below describes.
--   It was not taken pre-emptively because it grants a read nothing needs.
--
-- THE FRAME CHANNEL DELEGATES TO 0205 AND MUST NOT USE A ROSTER PREDICATE.
-- This is the one place decision 25 is out of date: it was written on
-- 2026-09-11 and 0205 shipped SHARING after it, so a document now has viewers
-- and editors who are not its owner.
--
--   frame SELECT (receive):  _ideacad_can_read_document(documentId)
--   frame INSERT (send):     _ideacad_can_write_document(documentId)
--
-- A ROSTER PREDICATE HERE WOULD BE WRONG IN BOTH DIRECTIONS, and the wide
-- direction is the serious one. Too NARROW: 0205 lets an owner share a document
-- to a classmate as editor, and a roster test does not know about the grant
-- row, so a shared editor would be refused the channel and lose live preview in
-- exactly the collaboration case sharing was built for. Too WIDE: every student
-- enrolled in the section passes a roster test, so a roster-gated frame channel
-- would hand EVERY CLASSMATE a live view of EVERY OTHER STUDENT'S SCREEN. That
-- is a worse leak than the one this migration closes, and it is what "enrolled
-- in a section this item is posted to" produces if it is applied to the frame
-- channel instead of the ping channel.
--
-- So the frame channel asks 0205's own predicates, which already answer
-- owner-or-viewer-or-editor-or-manager for the read and owner-or-editor for the
-- write. THIS FILE REDEFINES NEITHER; it calls them. A teacher of record reads
-- every document and cannot write one -- that is 0205's answer, not a new one
-- here, and it is the right answer for frames too: a manager who cannot save a
-- concept has no screen state to broadcast.
--
-- ---------------------------------------------------------------------------
-- WHAT A CLASSMATE CAN STILL LEARN, STATED RATHER THAN GLOSSED
-- ---------------------------------------------------------------------------
--
-- Nothing, from either channel. A classmate is refused SELECT on the ping topic
-- and refused both verbs on any frame topic that is not theirs and was not
-- shared to them. A classmate who IS a shared viewer receives that document's
-- frames, which is what being a viewer means.
--
-- ---------------------------------------------------------------------------
-- WHY THREE NEW FUNCTIONS RATHER THAN THE PREDICATES INLINE
-- ---------------------------------------------------------------------------
--
-- An RLS policy expression is evaluated as the QUERYING role, so any function
-- named directly in it must be EXECUTE-granted to authenticated. That is the
-- 0070 lesson 0109 wrote down. Two of the four predicates this file needs are
-- deliberately NOT granted to authenticated:
--
--   _ideacad_can_write_document(uuid)  0205 withholds it -- definer bodies only
--   _classroom_manages_item(uuid)      0085 revokes it and never grants it back
--
-- Naming either one in a policy would mean granting it to authenticated, which
-- widens a surface two earlier migrations closed on purpose. So this file adds
-- its own SECURITY DEFINER wrappers, grants only THOSE to authenticated, and
-- reaches the private predicates from inside them as the owner. The wrappers
-- are new objects owned by this migration alone and collide with nothing:
-- checked against 0201 and 0205 by name before they were written.
--
-- ---------------------------------------------------------------------------
-- WHAT UNDOES THIS FILE
-- ---------------------------------------------------------------------------
--
--   drop policy if exists "ideacad realtime receive" on realtime.messages;
--   drop policy if exists "ideacad realtime send" on realtime.messages;
--   drop function if exists public._ideacad_realtime_can_read(text);
--   drop function if exists public._ideacad_realtime_can_send(text);
--   drop function if exists public._ideacad_realtime_topic_id(text, text);
--
-- and set the two channels back to public in src/lib/ideacad/live.ts by
-- dropping `private: true`. The client and the policy are independent: a client
-- still opening PUBLIC channels ignores these policies entirely, and a client
-- opening PRIVATE channels against a database without them is refused every
-- join and degrades to no live preview. Neither order breaks a save.
--
-- IT IS RE-APPLIABLE. Every statement is create-or-replace or
-- drop-if-exists-then-create, and section 6 reads the catalog rather than
-- assuming section 4 ran.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. PRECONDITIONS. This file REFUSES rather than half-applying. Each check
--    names what is missing and what to do about it.
-- ---------------------------------------------------------------------------

do $preconditions$
declare
	v_missing text[] := '{}';
	v_sig text;
begin
	if to_regclass('realtime.messages') is null then
		raise exception '0211: realtime.messages does not exist on this database, so there is nothing to attach a policy to and the two channels would stay public with nobody able to tell. This file is for a hosted Supabase project. Do not create a stand-in table to get past this.';
	end if;

	if not exists (
		select 1 from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'realtime' and p.proname = 'topic' and p.pronargs = 0
	) then
		raise exception '0211: realtime.topic() does not exist, so a policy could not tell which channel it is being asked about. Every policy below would then be a permit-nothing, which reads on the catalog exactly like a permit-everything.';
	end if;

	foreach v_sig in array array[
		'public.classroom_can_read_item(uuid)',
		'public._classroom_manages_item(uuid)',
		'public._ideacad_can_read_document(uuid)',
		'public._ideacad_can_write_document(uuid)'
	] loop
		if to_regprocedure(v_sig) is null then
			v_missing := v_missing || v_sig;
		end if;
	end loop;

	if array_length(v_missing, 1) is not null then
		raise exception '0211: the predicate(s) this file delegates to are absent: %. classroom_can_read_item is 0109, _classroom_manages_item is 0085, and the two _ideacad_can_*_document are 0205. Apply those first; this file deliberately reimplements none of them.',
			array_to_string(v_missing, ', ');
	end if;

	raise notice '0211: preconditions met -- realtime.messages, realtime.topic() and all four delegated predicates are present.';
end
$preconditions$;

-- ---------------------------------------------------------------------------
-- 2. THE TOPIC PARSER. One function, and it can never raise.
--
--    A policy expression that throws does not deny the join, it errors it, and
--    the caller reads a Postgres cast failure instead of a refusal. The topic
--    is a string an arbitrary client chose, so `ideacad-doc:' || anything` is
--    reachable and a bare ::uuid cast on it is a live error path. This matches
--    the uuid shape first and casts only what matched.
--
--    It returns NULL for a topic that is not ours at all, which is how both
--    wrappers below answer FALSE for every other feature's channel rather than
--    accidentally speaking for one.
-- ---------------------------------------------------------------------------

create or replace function public._ideacad_realtime_topic_id(p_topic text, p_prefix text)
returns uuid
language sql
immutable
as $topicid$
	select case
		when p_topic is null or p_prefix is null then null
		when left(p_topic, length(p_prefix)) <> p_prefix then null
		when substr(p_topic, length(p_prefix) + 1)
			~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
			then substr(p_topic, length(p_prefix) + 1)::uuid
		else null
	end;
$topicid$;

-- ---------------------------------------------------------------------------
-- 3. THE TWO WRAPPERS. SECURITY DEFINER so they may reach the private
--    predicates as the owner; `set search_path = ''` like every definer in this
--    schema. Each answers for BOTH topic shapes, so there is one statement of
--    "which channel is this" rather than one per verb.
-- ---------------------------------------------------------------------------

create or replace function public._ideacad_realtime_can_read(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $canread$
	select case
		when public._ideacad_realtime_topic_id(p_topic, 'ideacad-live:') is not null
			then public._classroom_manages_item(
				public._ideacad_realtime_topic_id(p_topic, 'ideacad-live:'))
		when public._ideacad_realtime_topic_id(p_topic, 'ideacad-doc:') is not null
			then public._ideacad_can_read_document(
				public._ideacad_realtime_topic_id(p_topic, 'ideacad-doc:'))
		else false
	end;
$canread$;

create or replace function public._ideacad_realtime_can_send(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $cansend$
	select case
		when public._ideacad_realtime_topic_id(p_topic, 'ideacad-live:') is not null
			then public.classroom_can_read_item(
				public._ideacad_realtime_topic_id(p_topic, 'ideacad-live:'))
		when public._ideacad_realtime_topic_id(p_topic, 'ideacad-doc:') is not null
			then public._ideacad_can_write_document(
				public._ideacad_realtime_topic_id(p_topic, 'ideacad-doc:'))
		else false
	end;
$cansend$;

-- ---------------------------------------------------------------------------
-- 4. GRANTS, in 0166's shape and not the other one.
--
--    `revoke ... from public` alone does NOT close a function on this project:
--    a hosted Supabase project bootstraps default privileges that write a
--    DIRECT anon grant into every new function's ACL, and removing the PUBLIC
--    entry leaves it untouched. 0201 used the short form and left ten functions
--    anon-reachable; 0202 and 0203 were the repair. So every role is named.
--
--    The two wrappers ARE named in a policy, so authenticated must hold EXECUTE
--    or the join fails with "permission denied for function" instead of being
--    refused. The parser is reached only from those two definer bodies, as the
--    owner, so no client role gets it -- 0205's split, applied again.
-- ---------------------------------------------------------------------------

revoke all on function
	public._ideacad_realtime_topic_id(text, text),
	public._ideacad_realtime_can_read(text),
	public._ideacad_realtime_can_send(text)
	from public, anon, authenticated, service_role;

grant execute on function
	public._ideacad_realtime_can_read(text),
	public._ideacad_realtime_can_send(text)
	to authenticated, service_role;

grant execute on function
	public._ideacad_realtime_topic_id(text, text)
	to service_role;

-- ---------------------------------------------------------------------------
-- 5. THE POLICIES.
--
--    `to authenticated` and NOT anon: anon holds no policy on either topic at
--    all, so a signed-out caller cannot join a private IdeaCAD channel by any
--    route. That is the whole point of the file and it is expressed as an
--    absence rather than as a check.
--
--    The extension test pins these to BROADCAST. Presence on these topics is
--    not granted by either policy, so it stays refused; nothing asks for it.
-- ---------------------------------------------------------------------------

drop policy if exists "ideacad realtime receive" on realtime.messages;
create policy "ideacad realtime receive"
	on realtime.messages
	for select
	to authenticated
	using (
		realtime.messages.extension = 'broadcast'
		and public._ideacad_realtime_can_read(realtime.topic())
	);

drop policy if exists "ideacad realtime send" on realtime.messages;
create policy "ideacad realtime send"
	on realtime.messages
	for insert
	to authenticated
	with check (
		realtime.messages.extension = 'broadcast'
		and public._ideacad_realtime_can_send(realtime.topic())
	);

-- ---------------------------------------------------------------------------
-- 6. THE SELF-CHECK. Reads the catalog and the parser's own behaviour; asserts
--    nothing about the verdict of the section above having "run".
-- ---------------------------------------------------------------------------

do $selfcheck$
declare
	v_rls boolean;
	v_read record;
	v_send record;
	v_anon text[] := '{}';
	r record;
begin
	-- (a) RLS must be ON. A policy on a table with RLS disabled is inert, and a
	--     catalog listing of policies looks identical either way. This is the
	--     difference between "present and enforcing" and "present and
	--     permitting everything", and it is the first thing checked.
	select c.relrowsecurity into v_rls
	from pg_class c join pg_namespace n on n.oid = c.relnamespace
	where n.nspname = 'realtime' and c.relname = 'messages';

	if not coalesce(v_rls, false) then
		raise exception '0211: row level security is DISABLED on realtime.messages, so both policies below are inert and every private channel would permit everything. This file does not enable it: on a hosted project Supabase owns that table and ships it with RLS on, so this reading means something else is wrong. Investigate before re-pasting.';
	end if;

	-- (b) Both policies present, with the right command and the right role.
	select polname, polcmd, pg_get_expr(polqual, polrelid) as qual
	into v_read
	from pg_policy
	where polrelid = 'realtime.messages'::regclass and polname = 'ideacad realtime receive';

	select polname, polcmd, pg_get_expr(polwithcheck, polrelid) as chk
	into v_send
	from pg_policy
	where polrelid = 'realtime.messages'::regclass and polname = 'ideacad realtime send';

	if v_read.polname is null then
		raise exception '0211: the receive policy is not on realtime.messages after this file ran.';
	end if;
	if v_send.polname is null then
		raise exception '0211: the send policy is not on realtime.messages after this file ran.';
	end if;
	if v_read.polcmd <> 'r' then
		raise exception '0211: the receive policy is not a SELECT policy (polcmd %).', v_read.polcmd;
	end if;
	if v_send.polcmd <> 'a' then
		raise exception '0211: the send policy is not an INSERT policy (polcmd %).', v_send.polcmd;
	end if;

	-- (c) Neither expression may be a bare permit. If a later edit ever reduces
	--     one to `true`, the catalog still lists two policies and the count is
	--     unchanged, so the EXPRESSION is what is checked.
	if v_read.qual is null or v_read.qual !~ '_ideacad_realtime_can_read' then
		raise exception '0211: the receive policy does not call _ideacad_realtime_can_read. Its expression is: %', coalesce(v_read.qual, '<null>');
	end if;
	if v_send.chk is null or v_send.chk !~ '_ideacad_realtime_can_send' then
		raise exception '0211: the send policy does not call _ideacad_realtime_can_send. Its expression is: %', coalesce(v_send.chk, '<null>');
	end if;

	-- (d) The parser, behaviourally. Identity-free, so it means the same thing
	--     whoever pastes this.
	if public._ideacad_realtime_topic_id('ideacad-doc:00000000-0000-0000-0000-000000000001', 'ideacad-doc:')
		is distinct from '00000000-0000-0000-0000-000000000001'::uuid then
		raise exception '0211: the topic parser did not read a well-formed document topic.';
	end if;
	if public._ideacad_realtime_topic_id('ideacad-doc:not-a-uuid', 'ideacad-doc:') is not null then
		raise exception '0211: the topic parser accepted a malformed uuid.';
	end if;
	if public._ideacad_realtime_topic_id('some-other-feature:00000000-0000-0000-0000-000000000001', 'ideacad-doc:') is not null then
		raise exception '0211: the topic parser claimed another feature''s channel.';
	end if;
	if public._ideacad_realtime_can_read('some-other-feature:x') then
		raise exception '0211: the read wrapper answered true for a topic that is not ours.';
	end if;
	if public._ideacad_realtime_can_send('some-other-feature:x') then
		raise exception '0211: the send wrapper answered true for a topic that is not ours.';
	end if;

	-- (e) anon reaches none of the three. Read off the ACL, not off the revoke
	--     statement having been written.
	for r in
		select p.oid::regprocedure::text as sig
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public'
			and p.proname in ('_ideacad_realtime_topic_id', '_ideacad_realtime_can_read', '_ideacad_realtime_can_send')
			and has_function_privilege('anon', p.oid, 'execute')
	loop
		v_anon := v_anon || r.sig;
	end loop;

	if array_length(v_anon, 1) is not null then
		raise exception '0211: anon can execute %. The revoke in section 4 must name anon explicitly; `from public` alone does not remove the hosted default-privilege grant.',
			array_to_string(v_anon, ', ');
	end if;

	-- (f) The positive control for (e). If anon reads as unprivileged on a
	--     function that IS granted to it, the sweep above cannot tell a grant
	--     from its absence and (e) proved nothing.
	if to_regprocedure('public.app_short_link_target(text)') is not null
		and not has_function_privilege('anon', 'public.app_short_link_target(text)', 'execute') then
		raise exception '0211: the positive control failed -- app_short_link_target does not read as anon-executable, so check (e) cannot distinguish a grant from its absence.';
	end if;

	raise notice '0211: applied. realtime.messages RLS on; policies "ideacad realtime receive" (select) and "ideacad realtime send" (insert), both to authenticated, both broadcast-only. Ping topic: receive = manages the item, send = can read the item. Frame topic: receive = can read the document (0205, so a shared viewer or editor is included), send = can write it (owner or editor). anon holds none of the three new functions.';
	raise notice '0211: NOW RUN THE VERIFICATION QUERY in section 7 of this file. The self-check above proves the policies EXIST and are not bare permits; only the section 7 probe shows them ANSWERING DIFFERENTLY for two different people, which is the only thing that separates enforcing from permitting.';
end
$selfcheck$;

-- ---------------------------------------------------------------------------
-- 7. THE VERIFICATION QUERY LIVES IN ITS OWN FILE, AND THAT IS THE PASTE TRAP
--    RATHER THAN a preference.
--
--    It is supabase/data/0203-ideacad-realtime-verification.sql. Paste that
--    file into a new SQL editor tab after this one has applied. It is READ
--    ONLY: it writes nothing, creates nothing, and leaves no role or setting
--    behind.
--
--    IT IS NOT COMMENTED OUT AT THE BOTTOM OF THIS FILE because the probe needs
--    a plpgsql block, and a dollar-quote token inside a leading-dash comment
--    balances in Postgres while breaking the Supabase editor's own client-side
--    statement splitter. That cost 0194 a whole apply cycle. So this file
--    carries no dollar sign in any comment, and the query that needs one is a
--    file of its own.
--
--    WHAT IT ANSWERS, so it is not skipped as boilerplate: the self-check in
--    section 6 proves the two policies EXIST, name the right command and role,
--    and are not bare permits. It cannot prove they ANSWER DIFFERENTLY FOR TWO
--    DIFFERENT PEOPLE, and a policy that permits everyone looks identical to a
--    correct one in any catalog listing or row count. The probe is what
--    separates those two, by asking the same question as a document's real
--    owner and as a planted stranger and reporting both answers next to the
--    identity of the document it asked about.
-- ---------------------------------------------------------------------------

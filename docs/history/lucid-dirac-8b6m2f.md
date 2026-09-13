---
title: "Ledger 0203: IdeaCAD's live channels go private, and the roster predicate the decision asked for would have leaked every screen (`claude/lucid-dirac-8b6m2f`, migration 0211)"
date: 2026-09-13
branches: [claude/lucid-dirac-8b6m2f]
migrations: ["0211"]
subsystems: ["IdeaCAD", "Realtime", "Security", "Classroom", "Testing", "Decisions"]
---

Mr. Pina decided decision 25 on 2026-09-13: **option B, build it properly**.
IdeaCAD's two broadcast topics stop being public channels that any holder of the
anon key can publish to, and become authorized private channels the database
decides about. This is the **first `realtime.` policy in this schema's history** --
re-measured before anything was written, `grep -rn 'realtime\.' supabase/migrations/*.sql`
returns nothing across 0001 through 0210 -- so there was no prior shape in the
repo to copy and the shape is Supabase's own documented one.

`0211` is **delivered and not applied.** No cloud session can reach production.

## What was measured before building, because the decision entry is two days old

All three of decision 25's stated facts re-verified on 2026-09-13:

| claim | re-measured |
|---|---|
| channels are public broadcast | yes -- `live.ts` line 10, `supabase.channel(name, {config:{broadcast:{...}}})` and nothing else |
| names are guessable by construction | yes -- line 5, `ideacad-live:<itemId>` and `ideacad-doc:<documentId>` |
| no `realtime.` policy anywhere in the chain | yes -- zero hits across all 210 files |

And the environment claim the prompt makes: a TCP connect to port 5432 through
the egress proxy returned **zero bytes in twenty seconds**. There is no `.env` in
the container and no `IDEA_MIGRATION_URL`. Production is unreachable, so `0211`
ships as a file plus a verification query.

## The thing decision 25 could not have known, and it is the load-bearing finding

Decision 25 was written 2026-09-11 and says the policy "must express 'enrolled in
a section this item is posted to' -- `_classroom_manages_item` on the instructor
side and a roster predicate on the student side."

**`0205` shipped document sharing after that was written, and following it
literally on the frame channel would have been a worse leak than the one this
migration closes.**

The prompt flagged the narrow half: a roster predicate refuses a shared editor,
so live preview dies in exactly the collaboration case sharing exists for. That
is true. But the wide half is the one that matters and it was not flagged:

> **Every student enrolled in the section passes a roster test.** So a
> roster-gated `ideacad-doc:<documentId>` channel would have handed EVERY
> CLASSMATE a live view of EVERY OTHER STUDENT'S SCREEN -- continuously, in real
> time, for the whole class.

The exposure the migration was written to close is a forged frame putting a wrong
picture on one teacher's screen for up to fifteen seconds. The roster predicate
would have traded that for a permanent broadcast of every student's work to every
peer. So:

- **The PING topic uses the roster predicate**, and that is where it belongs.
- **The FRAME topic delegates to `0205`'s own predicates** and reimplements
  neither -- `_ideacad_can_read_document` (owner, viewer, editor or manager) to
  receive, `_ideacad_can_write_document` (owner or editor) to send.

`tests/db/ideacad-realtime-policy.test.ts` pins the in-class classmate out by
name. Mutating the frame gate to the roster predicate reddens three assertions.

## The two topics, and why the ping channel is asymmetric

|  | receive (SELECT) | send (INSERT) |
|---|---|---|
| `ideacad-live:<itemId>` | `_classroom_manages_item` | `classroom_can_read_item` |
| `ideacad-doc:<documentId>` | `_ideacad_can_read_document` | `_ideacad_can_write_document` |

A student **sends** a heartbeat and has no reason to **receive** one -- no client
code subscribes to pings except the teacher's view, so granting classmates SELECT
would grant a permission with no caller.

That asymmetry is only expressible because of a Supabase rule worth writing down,
quoted verbatim from the Realtime Authorization documentation:

> "To join a Broadcast Channel, a user must have at least one read or write
> permission on the Channel topic."

So a caller holding INSERT and not SELECT still joins, and simply never receives.
**This is documentation, not something this session could measure** -- no test
here reaches real Supabase Realtime. If it is ever wrong the symptom is specific
and the fix is one line, and both are written into `0211`'s own header: students'
editors work normally, saves land, frames are fine, and the teacher's live roster
stays EMPTY. The fix is to widen the ping SELECT to `classroom_can_read_item`.

## Three new functions, and why they are not the four predicates inline

An RLS policy expression is evaluated as the **querying** role, so any function
named in it must be EXECUTE-granted to `authenticated`. Two of the four needed
are deliberately not:

- `_classroom_manages_item(uuid)` -- 0085 revokes it and never grants it back.
- `_ideacad_can_write_document(uuid)` -- 0205 withholds it, definer bodies only.

Naming either in a policy would have meant granting it to `authenticated`, which
widens a surface two earlier migrations closed on purpose. So `0211` adds its own
SECURITY DEFINER wrappers (`_ideacad_realtime_can_read`,
`_ideacad_realtime_can_send`, and a `_ideacad_realtime_topic_id` parser), grants
only the two policy-named ones to `authenticated`, and reaches the private
predicates from inside them as the owner. **It redefines nothing 0201 or 0205
owns**, checked by name before a line of DDL was written.

The parser exists because a topic is a string an arbitrary client chose:
`'ideacad-doc:' || anything` is reachable, and a bare `::uuid` cast in a policy is
a live error path. A policy that throws does not deny a join, it errors it. So the
parser matches the uuid shape first and casts only what matched, and returns NULL
for any topic that is not ours -- which is how both wrappers answer FALSE for
every other feature's channel instead of accidentally speaking for one.

The grants follow `0166`'s shape and name every role. `revoke ... from public`
alone does not close a function on this project; `0201` used the short form and
left ten functions anon-reachable.

## The client, and the refused state

`live.ts` opens both channels with `private: true` -- without it the topic is
public and the whole migration is inert. A refused join (`CHANNEL_ERROR` or
`TIMED_OUT`) is **terminal**: the channel is torn out of the client, which is what
stops supabase-js's own rejoin timer retrying a decision the database already
made, and every later send against that topic is a no-op. `CLOSED` is an ordinary
teardown and is deliberately *not* a refusal -- treating it as one would make a
normal unmount permanently disable the feature.

The three properties the prompt required, each with its own assertion:

1. **Does not break the editor** -- no call throws once refused.
2. **Does not block a save** -- structural: the module has no write path at all,
   asserted by pinning its whole key set. Every mutation goes through the
   0201/0205 RPCs on a different object.
3. **Does not spin a retry loop** -- twenty further calls after a refusal open
   zero channels and `subscribe` is called exactly once, pinned.

A partial refusal refuses one topic and leaves the other live, which is exactly
the ping-channel-only case above.

**The convenience layer is kept, and that is a rule rather than an oversight.**
`frameAllowed`'s roster-and-revision filter and `IDEACAD_ROSTER_POLL_MS` at 15 000
both stay and are pinned by test. The policy makes forgery impossible; those two
keep the picture correct when the channel is fine and the data is stale. Removing
either because the policy now covers it would be a regression.

The two new interface members are **optional**, because two stubs in other lanes'
files implement `IdeacadLive` -- and because that is this codebase's own idiom: an
omitted transport removes the control it drives.

## The shared file, declared rather than slipped in

`tests/db/supabase-stub.sql` gains a `realtime` schema, `realtime.messages` with
RLS enabled and the client-role grants, and `realtime.topic()`, appended in one
delimited block. It is not optional: **eighteen db test files apply the whole
migrations directory** by `readdirSync`, and `0211` REFUSES on a database with no
`realtime.messages` rather than skipping silently. Without the stub all eighteen
would have gone red.

The grants in it are load-bearing rather than decoration. Without them a denial in
the tests would be the missing GRANT rather than the policy, and every refusal
assertion would pass vacuously.

The second shared file is `tests/db/ideacad-grants-anon-execute-surface.test.ts`,
which sweeps every function matching `^_?ideacad` and refuses any it cannot
classify. `0211`'s three match -- deliberately, because that is what puts them
under `0206`'s universal anon guard for free -- so three rows were added: both
wrappers as `client` (an RLS policy names them, so `authenticated` must hold
EXECUTE) and the parser as `definer`. That file's own comment calls the
classification "a fact about the function itself, and it is the one a later
migration can answer for its own objects", so this is its intended extension
point.

**It caught a real omission, and how it did is worth recording.** The first
full-suite run failed on exactly this assertion -- **and `npm test` exited 0
while doing it**. That is ledger 0199's trap live: 1 failed, 8607 passed, exit
code 0. Every count in this bundle, the mutation runs included, was read off the
summary line rather than inferred from an exit status, which is the only reason
it was seen at all.

## Verification

- **Full suite** green; **`svelte-check` 0 errors, 37 warnings in 20 files**,
  breakdown 31 `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class` -- the CLAUDE.md baseline exactly, re-derived rather
  than trusted, with the two `PUBLIC_` values exported before `svelte-kit sync`.
- **Mutation proof, both halves, both directions.** Pass and fail COUNTS were read,
  never vitest's exit code -- ledger 0199's runner judged by exit code and reported
  two survivors as killed. Every restore was from an in-memory copy and md5-checked,
  never `git checkout --`, which discards uncommitted work.

Four client mutants, all killed: dropping `private: true`; not tearing the channel
out on refusal; letting a refused topic reopen; never mapping a status to refused.

Six SQL mutants, all killed:

| mutant | how it died |
|---|---|
| frame read uses the ROSTER predicate | 3 assertions red |
| ping read opened to the whole roster | 2 assertions red |
| receive policy reduced to a bare permit | **migration refused to apply** |
| send policy reduced to a bare permit | **migration refused to apply** |
| `revoke ... from public` only (the 0201 anon defect) | **migration refused to apply** |
| topic parser accepts any suffix | **migration refused to apply** |

Four of six were killed by the file's own apply-time self-check declining to
apply at all, which is the refusal design doing its job before anything reaches
production.

**NOT verified:** anything against the live Supabase project -- unreachable, and
this session never tried beyond the reachability probe. The behaviour of real
Supabase Realtime: no test here speaks the Realtime protocol, so what is proved is
that the POLICIES decide correctly, not that the Realtime server consults them the
way the documentation says. No browser pass -- nothing mounted changed, and
`live.ts` has no mounted caller in `src/` at all today.

## Decision 13, closed under delegation

Mr. Pina delegated decision 13 on 2026-09-13. Recorded as **this assistant's call
under his delegation, not as his answer** -- the distinction is written into the
entry, because he never expressed a preference and recording one would put words
in his mouth. The spec table's row reordering **stays removed**: the removal was
measured on the real component at 375px, a third and fourth 44px control takes the
ops column from 100px to 192.8px inside a 293px wrapper, the spec table is a
student surface at a bench, and reordering is alive on five other classroom
screens. **Drag** is named as the reversal path, since it adds no control to the
row. **No source file was changed for it.**

## The verification query, reproduced here

`supabase/data/0203-ideacad-realtime-verification.sql` is the file to paste after
`0211`. It is read-only and it is **not** at the bottom of the migration, because a
dollar-quote token inside a leading-dash comment balances in Postgres while
breaking the Supabase editor's own statement splitter -- the trap that cost `0194`
a full apply cycle. Neither file carries a `$` in any comment.

**Why it exists at all:** the migration's self-check proves the policies EXIST,
carry the right command and role, and are not bare permits. It cannot prove they
**answer differently for two different people**, and a policy permitting everyone
is indistinguishable from a correct one in any catalog listing or row count. Part C
below is the only thing that separates them: it asks the same question as a real
document's real owner and as a planted stranger, and prints both answers beside the
identity of the document it asked about. **No part of it returns a bare count.**

Expected reading:

```
FRAME   owner:    read = t   send = t
        stranger: read = f   send = f
PING    owner:    read = f   send = t     (read = f is correct for a student)
        stranger: read = f   send = f
```

Anything else is a failure, and each means something different: both reads true is
**permitting everything**; owner read false is **refusing the owner**, so live
preview is dead rather than private; owner ping send false means the teacher's
roster stays empty; and `probe_state` other than `probed` means it examined
**nothing** and the booleans are meaningless. Part C prints its own VERDICT line
saying which it got.

```sql
-- A. the policies, with their WHOLE expression (a bare `true` is visible here)
select 'A. policy' as part, pol.polname as policy_name,
  case pol.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
       when 'w' then 'UPDATE' when 'd' then 'DELETE' else pol.polcmd::text end as command,
  coalesce((select string_agg(r.rolname, ', ' order by r.rolname)
            from pg_roles r where r.oid = any (pol.polroles)), 'PUBLIC') as granted_to,
  coalesce(pg_get_expr(pol.polqual, pol.polrelid),
           pg_get_expr(pol.polwithcheck, pol.polrelid)) as expression
from pg_policy pol
where pol.polrelid = 'realtime.messages'::regclass
order by pol.polname;

-- B. is it enforcing at all -- a policy on a table with RLS off is inert
select 'B. table' as part, n.nspname || '.' || c.relname as object,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'realtime' and c.relname = 'messages';

select 'B. function' as part, p.oid::regprocedure::text as object,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in
  ('_ideacad_realtime_topic_id','_ideacad_realtime_can_read','_ideacad_realtime_can_send')
order by p.proname;
-- expected: topic_id anon f / authenticated f; both wrappers anon f / authenticated t

-- C. the behavioural probe. THE ONE THAT MATTERS.
do $verify$
declare
	v_doc uuid; v_item uuid; v_owner text;
	v_stranger constant text := 'nobody.not-on-any-roster@example.invalid';
	v_topic_doc text; v_topic_item text;
	v_owner_frame_read boolean; v_owner_frame_send boolean;
	v_owner_ping_read boolean;  v_owner_ping_send boolean;
	v_str_frame_read boolean;   v_str_frame_send boolean;
	v_str_ping_read boolean;    v_str_ping_send boolean;
	v_control uuid;
begin
	v_control := public._ideacad_realtime_topic_id(
		'ideacad-doc:00000000-0000-0000-0000-000000000001', 'ideacad-doc:');
	if v_control is distinct from '00000000-0000-0000-0000-000000000001'::uuid then
		raise warning 'C. probe_state = INSTRUMENT BROKEN. The parser did not read a topic it built itself, so nothing below distinguishes a refusal from a parse failure.';
		return;
	end if;

	select d.id, d.item_id, d.student_email into v_doc, v_item, v_owner
	from public.ideacad_documents d
	where exists (select 1 from public.classroom_postings cp where cp.item_id = d.item_id)
	order by d.created_at desc limit 1;

	if v_doc is null then
		raise warning 'C. probe_state = NO DOCUMENT EXAMINED. This tested NOTHING and is not a pass.';
		return;
	end if;

	v_topic_doc := 'ideacad-doc:' || v_doc::text;
	v_topic_item := 'ideacad-live:' || v_item::text;
	raise notice 'C. probe_state = probed. document % on item %, owner <%>, planted stranger <%>.',
		v_doc, v_item, v_owner, v_stranger;

	perform set_config('request.jwt.claims', json_build_object('email', v_owner)::text, true);
	v_owner_frame_read := public._ideacad_realtime_can_read(v_topic_doc);
	v_owner_frame_send := public._ideacad_realtime_can_send(v_topic_doc);
	v_owner_ping_read  := public._ideacad_realtime_can_read(v_topic_item);
	v_owner_ping_send  := public._ideacad_realtime_can_send(v_topic_item);

	perform set_config('request.jwt.claims', json_build_object('email', v_stranger)::text, true);
	v_str_frame_read := public._ideacad_realtime_can_read(v_topic_doc);
	v_str_frame_send := public._ideacad_realtime_can_send(v_topic_doc);
	v_str_ping_read  := public._ideacad_realtime_can_read(v_topic_item);
	v_str_ping_send  := public._ideacad_realtime_can_send(v_topic_item);

	perform set_config('request.jwt.claims', '', true);

	raise notice 'C. FRAME % -- owner <%> read=% send=% | stranger <%> read=% send=%',
		v_topic_doc, v_owner, v_owner_frame_read, v_owner_frame_send,
		v_stranger, v_str_frame_read, v_str_frame_send;
	raise notice 'C. PING  % -- owner <%> read=% send=% | stranger <%> read=% send=%',
		v_topic_item, v_owner, v_owner_ping_read, v_owner_ping_send,
		v_stranger, v_str_ping_read, v_str_ping_send;

	if v_owner_frame_read and v_str_frame_read then
		raise warning 'C. VERDICT: FAIL -- PERMITTING EVERYTHING. Stranger <%> can read document % owned by <%>.',
			v_stranger, v_doc, v_owner;
	elsif not v_owner_frame_read then
		raise warning 'C. VERDICT: FAIL -- REFUSING THE OWNER <%> of document %. Live preview is dead rather than private.',
			v_owner, v_doc;
	elsif v_str_frame_read or v_str_frame_send or v_str_ping_read or v_str_ping_send then
		raise warning 'C. VERDICT: FAIL -- stranger <%> holds a permission on document % or item %.',
			v_stranger, v_doc, v_item;
	elsif not v_owner_frame_send then
		raise warning 'C. VERDICT: FAIL -- owner <%> cannot SEND frames for document %.', v_owner, v_doc;
	elsif not v_owner_ping_send then
		raise warning 'C. VERDICT: FAIL -- owner <%> cannot SEND a ping on item %, so the teacher roster stays EMPTY.',
			v_owner, v_item;
	else
		raise notice 'C. VERDICT: PASS -- ENFORCING. Owner <%> reads and sends document % and pings item %; stranger <%> got nothing. The two answers differ, so the gate is deciding rather than permitting.',
			v_owner, v_doc, v_item, v_stranger;
	end if;
end
$verify$;
```

## What undoes it

```sql
drop policy if exists "ideacad realtime receive" on realtime.messages;
drop policy if exists "ideacad realtime send" on realtime.messages;
drop function if exists public._ideacad_realtime_can_read(text);
drop function if exists public._ideacad_realtime_can_send(text);
drop function if exists public._ideacad_realtime_topic_id(text, text);
```

and drop `private: true` from `live.ts`. The client and the policy are
independent in both directions: a client still opening public channels ignores
these policies entirely, and a client opening private channels against a database
without them is refused every join and degrades to no live preview. **Neither
order breaks a save**, which is why there is no deploy-ordering constraint here.

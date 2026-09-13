# 25 Should IdeaCAD use authorized private Realtime channels?

- Raised: 2026-09-11  By: ledger 0145
- Status: DECIDED 2026-09-13 and BUILT by ledger 0203. The migration is
  `supabase/migrations/0211_ideacad_realtime_policy.sql`. It is DELIVERED AND NOT
  APPLIED -- no cloud session can reach production -- so the applied state of the
  database is unchanged until Mr. Pina pastes it.
- Decision: 2026-09-13, Mr. Pina: **OPTION B, BUILD IT PROPERLY.**
- Against the default: no, it agrees with it in substance and overrides it on urgency.
  The default below was "yes, in the next bundle, not urgently". He took B now.
- **OPTION C REMAINS REFUSED AND IS NAMED IN THE MIGRATION'S OWN HEADER** so it is not
  reinvented: do not sign the frame payload. A secret in the browser is not a secret,
  and that is the shape that looks like a control and is not.
- What the build actually did, in one paragraph, because the table below prices B
  before 0205 existed and one line of it is now wrong. Two policies on
  `realtime.messages`, `to authenticated` only, both broadcast-only. The PING topic
  (`ideacad-live:<itemId>`) is asymmetric: send is `classroom_can_read_item`, which is
  the roster predicate this entry asked for, and receive is `_classroom_manages_item`,
  so a student heartbeats and only the teacher of record hears it. The FRAME topic
  (`ideacad-doc:<documentId>`) does NOT use a roster predicate at all -- see the
  correction below. Three new SECURITY DEFINER wrappers in `public` carry the rule,
  because two of the four predicates involved are deliberately not granted to
  `authenticated` and naming them in a policy would have widened a surface 0085 and
  0205 closed on purpose. The client opens both channels with `private: true` and
  treats a refused join as terminal.
- **THE CORRECTION THIS ENTRY NEEDS, AND IT IS THE ONE THING THE ENTRY GOT WRONG.**
  This entry was written 2026-09-11; `0205` shipped DOCUMENT SHARING after it. The row
  in the table below reads "the policy must express 'enrolled in a section this item is
  posted to', which is `_classroom_manages_item` on one side and a roster predicate on
  the other". **That is right for the ping topic and WRONG FOR THE FRAME TOPIC, in both
  directions, and the wide direction is the serious one.** Too narrow: 0205 lets an
  owner share a document to a classmate as an EDITOR, and a roster test knows nothing
  about the grant row, so a shared editor would be refused the channel and lose live
  preview in exactly the collaboration case sharing was built for. Too wide, and this is
  the half that matters: EVERY student enrolled in the section passes a roster test, so
  a roster-gated frame channel would have handed every classmate a live view of every
  other student's screen -- a worse leak than the one this decision closes. So the frame
  topic delegates to 0205's own `_ideacad_can_read_document` (owner, viewer, editor or
  manager) and `_ideacad_can_write_document` (owner or editor), and reimplements
  neither. `tests/db/ideacad-realtime-policy.test.ts` pins the in-class classmate out
  by name, and mutating the frame gate to the roster predicate reddens three of its
  assertions.
- Verification, since this cannot be applied from a session: the file's own apply-time
  self-check refuses a bare-permit policy, a missing `anon` revoke and a broken topic
  parser -- proved by mutation, four of six SQL mutants were killed by the migration
  declining to apply at all. What a self-check CANNOT see is whether the policy answers
  DIFFERENTLY FOR TWO DIFFERENT PEOPLE, which is indistinguishable from a permit-all in
  any catalog listing or row count, so a behavioural probe ships beside it at
  `supabase/data/0203-ideacad-realtime-verification.sql` and is pasted after the
  migration.
- Why it was blocked on him: unchanged and now spent. It added the first authorization
  surface of its kind to this schema and cost a migration.
- Context: `src/lib/ideacad/live.ts`; `supabase/migrations/0211_ideacad_realtime_policy.sql`;
  `supabase/data/0203-ideacad-realtime-verification.sql`;
  `docs/prompt-ledger/entries/0203-ideacad-private-realtime.md`;
  `docs/history/lucid-dirac-8b6m2f.md`.

## The question, in one sentence

Should the IdeaCAD live-preview broadcast move onto authorized private Realtime channels,
so that only an enrolled student can publish a frame, instead of any holder of the public
anon key?

## What is true in the tree today (measured 2026-09-11)

- **Channels are public broadcast.** `src/lib/ideacad/live.ts` **line 10** opens them with
  `supabase.channel(name, { config: { broadcast: { self: false, ack: false } } })` and
  nothing else. The names are guessable by construction: **line 5**,
  `ideacad-live:<itemId>` and `ideacad-doc:<documentId>`.
- **There is no `realtime.messages` policy in any migration.** `grep -rn 'realtime\.'
  supabase/migrations/*.sql` returns nothing across the whole chain. So the authorization
  surface this decision is about does not exist yet anywhere in the schema.
- **A frame is a hint and never a write.** `live.ts` **line 2** says so in the module's own
  header, and the write path is unrelated: every mutation goes through the ten `0201` RPCs,
  each pinned to `student_email = current_user_email()`. **A forged frame cannot change a
  row.**
- **Two filters already bound the damage.** `frameAllowed` (**line 6**) accepts a frame
  only when `roster.has(frame.documentId)` AND `frame.revision >= lastRevision`, so an
  off-roster document id and a rewound revision are both refused. `IDEACAD_ROSTER_POLL_MS`
  (**line 3**) is 15 000, so the teacher's view re-reads the database every 15 seconds and
  a forged frame is corrected on the next poll.
- **What is left, exactly:** somebody holding the public anon key, who knows or guesses a
  document id on the roster, can put a wrong intermediate PICTURE on a teacher's live view
  for up to 15 seconds. They cannot write, cannot read another student's document (the
  `0201` read policies at lines 22-24 are owner-or-manager), and cannot rewind a revision.

## What each option costs

| | Migration? | Applied production state? | Cost |
|---|---|---|---|
| **A. Leave it** | no | no | A forged frame can misrepresent a student's screen to their teacher for up to 15s. Nothing is written and nothing leaks. |
| **B. Private channels with a `realtime.messages` policy** | **yes, one** | yes, once applied | The first `realtime.` policy in the schema, so there is no prior shape to copy; the policy must express "enrolled in a section this item is posted to", which is `_classroom_manages_item` on one side and a roster predicate on the other. Client change in `live.ts` to authorized channels. |
| **C. Sign the frame payload instead** | no | no | No new authorization surface, but a secret in the browser is not a secret; this is the shape that looks like a control and is not. **Refused, named here so it is not reinvented.** |

## Why B, and why it waits

B is the only option that makes forgery impossible rather than brief, and the policy is
the honest place for it: the same argument the rest of this codebase makes everywhere --
the database is the boundary, a client filter is convenience. The shipped `frameAllowed`
and the 15-second reread are exactly that convenience layer, and they are doing their job.

It waits because the exposure is a wrong picture for fifteen seconds on one teacher's
screen, in a classroom, where the teacher is standing next to the student. That does not
outrank shipping on 2026-09-14, and a first-of-its-kind policy written in a hurry is worse
than the gap it closes.

## If nobody decides

A is what ships. The gap is documented here and in `live.ts` line 2's own header, which
says "Private authorized channels are follow-on work" -- so it stays a deferral rather than
becoming an oversight. Nothing degrades over time; the exposure does not widen with use.

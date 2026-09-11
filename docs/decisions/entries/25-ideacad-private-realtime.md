# 25 Should IdeaCAD use authorized private Realtime channels?

- Raised: 2026-09-11  By: ledger 0145
- Status: open
- Decision: blank.
- Default this assistant would pick: **yes, in the next bundle, not urgently** -- the
  shipped roster-and-revision filter plus the 15-second database reread already bounds a
  forged frame to a wrong PICTURE on a teacher's screen and permits no write, so this buys
  display integrity rather than closing a data hole.
- Why it is blocked on him: it adds a `realtime.messages` policy, which is a new
  authorization surface in a schema that has none today, and the cost is paid in a
  migration on a feature shipping 2026-09-14.
- What it unblocks: nothing is waiting. It narrows one display cost.
- Context: `src/lib/ideacad/live.ts`; `supabase/migrations/0201_ideacad_blade_editor.sql`;
  `docs/prompt-ledger/entries/0145-ideacad-blade-editor.md`.

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

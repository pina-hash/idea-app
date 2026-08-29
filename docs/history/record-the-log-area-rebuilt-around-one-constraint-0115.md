---
title: "The Log area, rebuilt around one constraint (`0115`)"
date: 2026-08-18
branches: []
migrations: ["0058", "0068", "0115"]
subsystems: ["IDEA Coin economy"]
record_order: 8
---

Migration `0115_coin_bulk_log_students.sql` (apply manually after `0114`) plus a
rebuilt `/coin-desk` Log area. **The rule that drove every decision here:
LOGGING A TRANSACTION REQUIRES NO SCROLLING AT ALL at a working desktop size.**
Not less scrolling. None.

**What it replaced.** Three stacked cards: find a student, then the student's
whole summary (balance, the two media, wage tier, Eating Pass and up to 25
recent transactions), then the entry form. The summary sat BETWEEN the search
box and the thing the operator came to do, so the form was reliably below the
fold -- and the cards were a plain vertical stack with no viewport arithmetic
anywhere, so "below the fold" was not tuned, it was unconsidered. Measured
before: roughly six clicks, two typing bursts and one mandatory scroll.

### The shell is the shared one, and three of its knobs are the design

`$lib/shell/ClassSplit` + `split.css`, which the classroom and both notebook
surfaces already mount. **`.cd-root` is registered there as the FOURTH room**
(the file's own rule: a surface that needs a different arrangement gets a class
there, never a second split). The coin desk brings no room palette -- it sits on
the portal's dark plate -- so it imports `split.css` directly from its layout
rather than through a room stylesheet.

- **`scroll="page"` -- THE DOCUMENT OWNS THE SCROLL and neither pane bounds
  itself.** The alternative, `panes`, sizes each pane at `100vh -
  --cr-chrome-h`, which is right when the split IS the page (the classroom: a
  breadcrumb above, nothing below). The coin desk has a masthead, a hero, a
  sub-nav AND a version footer, which is the shape `split.css`'s own header
  explains at length cannot be fixed by tuning that constant. **It would also
  be the wrong tool even if it fitted: a pane that clips its overflow SATISFIES
  a no-scroll measurement by hiding the form.** Under `page` the guarantee comes
  from the content genuinely fitting, which is what the rule actually means.
- **`navWidth="wide"` -- the roster is A TABLE YOU SCAN**, the exact case
  `split.css` documents that variant for, and it is also what makes the rule
  hold against a real class: a wide pane lays the roster out in columns
  (`auto-fill`, measured 4 at 1440px and 3 at 1280px), so forty students are
  forty names on screen rather than forty rows to scroll past. The entry form is
  a narrow stack of labelled inputs and is comfortable in the 27rem detail pane
  -- the same width the notebook's review console gives its entry panel.
- **`narrow="stack"` -- below 1024px both panes render in one column, form
  first.** The no-scroll rule is a DESKTOP rule; the phone layout is sensible
  and is not contorted to meet it.

### What moved out of the path of logging

The student summary is ONE compressed strip (email, total, physical, digital,
wage tier, Eating Pass). Recent transactions are behind a disclosure, CLOSED by
default. **The debt panel is behind one too, and that was found by measurement
rather than reasoning:** logging a fine that takes a student negative made
`DebtPaymentPanel` appear, which grew the page to 1035px against a 900px
viewport on the very next frame after a successful log. Paying a debt is an
action the operator sometimes takes, not a step in logging. The debt is not
hidden -- the strip reads it in amber and the summary names the amount.

**The masthead is a line, not a hero.** The shared `.hero` is `padding: 4rem
1rem 2.5rem` with a centred stack under it, which measured **191px** -- a fifth
of the viewport, above the split, on every area, on a tool whose whole
constraint is that the form fits. It is 45px now, and the three sentences of
migration history it carried are in these docs where they belong.

### The keyboard path is zero clicks

Search is focused on load. Type a name, Enter selects the top match and moves
focus to the category; the category is a **type-to-filter combobox** (it was a
39-option `<select>` in four optgroups -- a control whose cost is a scroll
through a list you cannot search, on the one field touched for every entry);
type, Enter selects. **ONE rule governs the rest, stated once and applied from
every field: Enter submits when nothing further is required, and otherwise moves
to the first field still holding the entry up.** `pendingFields` is that list,
and it drives the submit button's enabled state, the Enter target and the
post-category landing, so the three cannot disagree about what "required" means.

**Nothing submits on the same keystroke that picks a category** -- the amount
preview has to be readable before it is committed -- so the final Enter is
always separate and deliberate.

**Measured: 2 typing bursts + 3 Enter presses, 0 clicks, 0 scrolls** for a flat
category on a fresh student, against the six clicks + two typing bursts + one
scroll it replaced.

**THE AUTOFOCUS IS KEYED ON THE ELEMENT, NOT ON MOUNT.** The input is bound
inside a snippet `ClassSplit` renders, so at the parent's `onMount` the binding
is not necessarily set -- measured: it was null and the focus call was a silent
no-op. An effect runs it the first time there is something to focus, once.

### Multi-select, and the RPC under it

The roster gains checkbox multi-select following **the notebook's pattern**
(`selectMode`, a `SvelteSet` of ids, `togglePick`, one batched call), because
that is the app's only true multi-select and a second shape for the same idea is
how the two stop behaving alike. **It is a sub-state of student mode, not a
fourth mode**: ticking two names IS how you address two students, with no mode
to switch first.

**`coin_bulk_log_students(p_emails text[], ...)`** mirrors
`coin_bulk_log_section`'s contract exactly -- one round trip, ONE server-side
transaction, the same `{total, succeeded, refused, results[]}` shape, the same
per-student medium overrides, the same "an override that matched nobody is
REPORTED, never silently dropped" rule, and the same per-student exception
handler. It reimplements no business rule: per student it calls the EXISTING
`coin_log_transaction`.

**AND `coin_bulk_log_section` DELEGATES TO IT.** The two differed in exactly one
thing -- where the list of emails comes from -- and everything after that was
identical and would have drifted the first time either side was tuned. What the
delegation had to preserve, checked term by term rather than assumed:

- The **signature is byte-identical** to `0096`'s, so this is a plain `create or
  replace`: no drop, no second overload, no deploy-ordering problem (the
  `0058`/`0068`/`0096` trap does not apply when the parameter list does not
  move).
- `section_id` is still in the response, added back by the wrapper.
- **Error order is unchanged**: the section function still checks `is_admin()`
  and the section's existence FIRST.
- **Row order is unchanged**: the delegate normalizes, dedupes and SORTS its
  email list, and the roster was already read `order by student_email`.
- **An empty roster still returns `{total: 0}` rather than raising**, which is
  what `0096` does. That is also why the delegate does not raise on an empty
  array: it would be a behaviour change to the section path smuggled in as a new
  function's input validation. The UI is what refuses to submit an empty
  selection.

Deduping is not cosmetic: a balance is keyed on the email, so `A@x` and `a@x`
are one student and logging both would charge them twice with two perfectly
ordinary rows to show for it.

**Bulk eligibility is unchanged** -- flat, range and variable only, minus
`extra_credit` and (at the UI layer) `weekly_role_stipend`. **No grant on any
coin table changed and the ledger stays append-only**: this function can only
INSERT, through `coin_log_transaction`.

### The `coinDesk` preference namespace

Default mode (single student vs section) and default medium, stored in
`profiles.preferences.coinDesk` -- **the fourth namespace** in the same
free-form JSONB the launcher, the class view and the home feed already use, with
its own parser in `coin-desk.ts` beside the others and the same whole-blob
spread-merge write, so a sibling key can never be clobbered. No migration: the
column exists and the namespaces do not know about each other. It also costs no
query -- `preferences` already rides `userProfile` from the root layout.

**Values are validated against the unions, not merely type-checked**: an
unrecognised mode or medium is DROPPED so the form falls back to a documented
default rather than entering a state no branch renders. **What deliberately is
NOT stored: the last student, category or amount.** Those are the entry itself,
and remembering them across sessions is how the wrong student gets charged.

### The curriculum picker

`curriculumSectionOptions` filtered only on "already has a coin section". It now
also respects `status`: **`planned` is not offered** (a planning-sheet row is not
a class anybody can be in), while **`live` and `upcoming` both are** -- every
2026-27 section is `upcoming`, and setting a roster up before a class starts is
the picker's main job, so excluding it would leave the picker empty.

**The concluded programme is excluded by the `FSP_CONCLUDED` flag, NOT by `term
=== 'Summer'`** -- the rule `curriculum.ts`'s own `activeCourseCount()` already
applies, for the reason written down there: a term label says WHEN a course runs,
not whether it has finished. The term is surfaced in the picker's LABEL instead
(`termLabel`), which is what it is for. `isOfferableSection` is the predicate,
extracted because the catalog holds no `planned` row today, so a test written
only against `SECTIONS` could not tell the rule from its absence.

**Nothing here touches live data.** This is which rows a picker offers;
archiving a coin section is an operator action against `coin_sections.active`.

### Verified

- **`tests/coin-bulk-students.test.ts` (20 tests)**, the coin chain plus `0096`
  and `0115` on real embedded Postgres. The headline compares a SECTION run and
  a PICKED run over the same four students **field for field** -- excluding only
  the three that legitimately differ between two sequential runs (the resulting
  balances and the transaction id), because "both returned something sensible"
  is exactly what a drifted pair would also do. Plus the preserved empty-roster
  behaviour, the error order, the dedupe (asserted by transaction COUNT, not
  just the response), a student on no roster at all, both halves of "one student
  never blocks the rest" (a structured refusal AND a raised exception -- two
  different code paths), overrides with unmatched reporting, the scope refusals,
  up-front shape validation writing nothing, one surviving signature each, and
  the permission/append-only boundary.
- **`tests/coin-desk-prefs.test.ts` (14 tests, pure)**: the parser's vocabulary
  validation, every shape of missing, that it reads only its own namespace, and
  **the spread-merge leaving all three sibling namespaces intact** -- the
  failure that produces no error and no visible symptom on this page at all.
  Plus the picker's rules against CONSTRUCTED sections, including a summer
  section that is not the concluded one, which is the only assertion that can
  tell the flag rule from a term rule.
- **MUTATION-CHECKED 14 WAYS, every one caught**, each file restored
  byte-identical (md5): the wrapper dropping `section_id` (2 red), no dedupe/sort
  (2), an empty selection raising (2), no up-front validation (2), the admin gate
  dropped (1), the section checking the category first (1), a per-student
  exception aborting the batch (1), unmatched overrides dropped (1), preferences
  passed through unvalidated (2), the parser reading the top level (5), the
  planned rule dropped (1), the concluded programme offered again (1), the picker
  gating on the term (1), and a room added to `split.css`'s gutter list but not
  to its `scrollbar-width` rule (1).
- **TWO OF THOSE FOUND REAL GAPS on the first pass and are the reason the suite
  is what it is.** The per-student exception handler was not covered at all --
  the partial-refusal test used a STRUCTURED refusal, which is
  `coin_log_transaction` answering rather than raising. And the "not the term"
  claim was pinned only against the fixture, so gating on `term === 'Summer'`
  passed. Both have real assertions now.
- **`tests/classroom-measure.test.ts`: 2 assertions generalized, none deleted.**
  They spelled the room selector lists out, which adding a third room
  necessarily breaks; they DERIVE the room list from the file now and assert
  every room appears in both the gutter block and the `scrollbar-width` rule --
  which is the real regression (a room that misses the second gets the
  platform's default bar).
- **Browser-measured at 1440x900 and 1280x800** through `/dev/coin-desk`, which
  mounts the REAL component and now seeds a **44-student class** deliberately
  larger than any real IDEA section (the documented ones run 10-20). Through the
  entire flow -- empty state, typed name, student open, category list open,
  category picked, logged, and the in-debt state that follows -- **document
  `scrollHeight` equals `clientHeight` (900/900 and 800/800), no pane scrolls,
  and there is no scrolling region anywhere on the page.** The keyboard path was
  driven with dispatched input: **0 clicks, 2 typing bursts, 3 Enter presses.**
  A multi-student log was driven end to end including a partial refusal: `1
  succeeded, 1 refused`, the refused student named with the real per-medium debt
  reason, and **nothing written for them** (digital balance unchanged, zero rows
  added -- checked in their own history). 375px: no horizontal overflow, stacked
  with the form first, logging still works. Zero console errors throughout, and
  the signed-out 404 on all `/coin-desk` routes is intact.
- **THE ROSTER THRESHOLD, since the roster is the thing that can break the
  rule: 56 students at 1440x900 and 42 at 1280x800** before the roster LIST
  itself begins to scroll (4 and 3 columns x 14 rows at a 24rem cap). Both above
  40. Past that it is the list that scrolls, never the page and never a pane, so
  the entry form does not move.
- **NOT verified: the live Supabase project.** The local `.env` is the
  placeholder project, so `0115` has never been applied anywhere and the real
  signed-in route could only be probed signed out. Apply it by hand after `0114`
  **before deploying** -- the client calls `coin_bulk_log_students`, and without
  it a multi-student log fails while everything else keeps working. Then check
  with two real accounts that a section run and a picked run over the same
  students agree.
- **Also not verified: screenshots.** The Browser pane does not composite, so
  every visual claim above is a measured DOM or computed-style read. The
  autofocus is a specific instance: the pane's tab is `visibilityState: 'hidden'`
  and drops `activeElement` after load, so it was verified by instrumenting the
  effect (it ran, and `document.activeElement === searchEl` at that instant)
  rather than by reading focus afterwards.


# Database conventions beyond migrations

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). Grants and revokes, the signature trap, write and read paths, state modelling, refusals, SQL traps, select ladders and paging. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

### `revoke ... FROM public` DOES NOT CLOSE A FUNCTION ON THIS PROJECT

**A hosted Supabase project bootstraps `alter default privileges in schema
public grant execute on functions to anon, authenticated, service_role`**, which
writes a DIRECT grant to each of those roles into every new function's `proacl`
AT CREATION TIME. That is not the SQL default -- the SQL default is one grant to
`PUBLIC` -- so `revoke all on function f from public` removes exactly that one
entry and the function stays granted to `anon`. Measured on the catalog, same
body, same revoke: without the defaults `proacl` comes out
`postgres=X/postgres | authenticated=X/postgres` and `anon` is false; WITH them
it comes out `postgres=X/postgres | anon=X/postgres | authenticated=X/postgres |
service_role=X/postgres` and **`anon` is true**.

- **A NARROWING MUST NAME THE ROLES**: `revoke all on function f(...) from
  public, anon, authenticated, service_role;` then grant back only what should
  hold it. That end state is independent of whatever default privileges the
  database carries, which is the whole point -- a narrowing that works under one
  privilege configuration and silently does nothing under the other is not a
  narrowing.
- **THE FIXTURE NOW CARRIES THOSE DEFAULTS, AND 0137 IS WHAT MAKES IT GREEN.**
  `tests/db/supabase-stub.sql` used to set no default privileges, so the
  `from public` form appeared to work and every assertion about `anon` passed
  VACUOUSLY -- 41 of them, across 32 files, written deliberately by past
  sessions. The three lines are in the stub now and **0137
  (`0137_anon_execute_sweep.sql`) is the migration that closes the gap**:
  `anon` went from 360 of 369 functions to the 18 deliberate public surfaces,
  and 88 private helpers lost `authenticated` with it.
- **0137 GOES LAST IN EVERY TEST CHAIN, INCLUDING THE HARNESS DEFAULT**, because
  it is a sweep over whatever the chain above it created. **A migration applied
  BY HAND after the chain needs the sweep re-applied after it** -- a
  `create or replace` under the project's default privileges hands the new
  function a fresh `anon` grant, so `notebook-session-postings`, `coin-medium`
  and `classroom-leveled-rubrics` each re-run it. A "world as it was" half
  filters it out instead.
- **A NEW FUNCTION IS NOT COVERED BY 0137 AND MUST REVOKE FOR ITSELF.** The
  sweep is a one-time repair of what was already there; anything created after
  it arrives granted to `anon` again unless its own migration names the roles.
- **`0166` IS THE SHAPE. COPY IT; DO NOT INVENT ANOTHER, AND `0201` IS WHY THAT
  IS A RULE RATHER THAN A PREFERENCE.** A migration revokes from `anon` BY NAME
  -- `revoke all on function f(...) from public, anon, authenticated;` then a
  grant naming exactly who should hold it -- because `revoke ... from public` is
  not sufficient on this project: the default privileges above write a DIRECT
  `anon` grant that the `public` entry's removal never touches.
  `0166_short_link_reserve_maps.sql` carries that shape with its reasoning in
  its own header, and `0196` through `0199` all follow it. `0201` invented its
  own -- `revoke ... from public` then `grant ... to authenticated` -- and all
  ten of its functions came out anon-executable on production (measured
  2026-09-11, against `classroom_save_response`,
  `classroom_save_instructor_response` and `classroom_close_assignment` as the
  controls, all three `anon false`). It is the first file in this repo to depart
  from `0166` and `0202_ideacad_anon_grant_repair.sql` is the repair. **THE
  IDENTICAL BOOTSTRAP CARRIES `grant all on tables`, so the table half is the
  same decision and `0201` lost both**: its four tables arrived holding all
  seven privileges for both client roles, and RLS covers none of TRUNCATE,
  REFERENCES or TRIGGER. A migration creating a table revokes and grants back
  the one privilege it means, exactly as it does for a function. **Neither half
  is trusted to review**: `tests/db/ideacad-grants-anon-execute-surface.test.ts`
  sweeps every non-extension function in `public` after the whole chain and
  reconciles the anon-executable set against a named allowlist with a reason per
  entry, and `tests/grant-surface.test.ts` does the same for tables and views.
- **DO NOT SWEEP THE GRANTS BLIND.** The partition is the whole job and 0137's
  header carries it: 18 functions are granted to `anon` DELIBERATELY (the public
  coin ledger, the public reference viewer and its attachments, short links, the
  unauthenticated GAUNTLET run path), and `is_teacher` must keep
  `authenticated` because it is named inside RLS policies, where a function is
  evaluated as the QUERYING role -- revoking it breaks the read rather than
  narrowing it (the 0070 lesson 0109 writes down). **`service_role` is never
  touched**, because a CHECK constraint's function runs as the WRITING role
  (0131).
- **ASSERT THE ACL, NOT THE SELF-CHECK'S VERDICT.** A migration's own guard
  passing tells you the guard ran; reading `proacl` and
  `has_function_privilege` back tells you what is actually granted.
- **AND ASSERT IT OVER THE OBJECTS THE FILE ITSELF WRITES, NEVER OVER A WHOLE
  SUBSYSTEM BY NAME PREFIX.** `0206`'s own header states the general form -- an
  apply-time guard that sweeps a subsystem is asserting something about
  migrations that are not this file's -- and `0214` made the mistake anyway and
  was caught by a test rather than by reading. The cost is specific: the suite
  deliberately builds chains with a repair migration LEFT OUT as a negative
  control (`tests/db/ideacad-grants-anon-execute-surface.test.ts` removes `0202`
  and `0206` to reproduce the hole `0202` closed), and a prefix sweep in a later
  file REFUSES TO APPLY there over functions it never touches. **A migration that
  cannot apply because a file BEFORE it is missing its repair is holding somebody
  else's ground.** A subsystem-wide sweep belongs in a guard migration written
  for it, plus `tests/db/`, which run against whatever is there; a new migration
  checks its own names and leaves the rest alone.

### THE SIGNATURE TRAP

**A function that gains a parameter is `drop function`ed at its exact old
argument types FIRST.** `create or replace` keys on the parameter list, so merely
adding one leaves the old arity callable as a SECOND OVERLOAD.

Two ways that bites, both seen here:

1. The old arity stays callable and silently ignores the new parameter.
2. **Two overloads differing only by a defaulted trailing parameter make
   PostgREST unable to resolve the call AT ALL** -- so a surviving old arity
   BREAKS the client rather than quietly serving it.

Re-defaulting a parameter that already exists is NOT this trap and needs no drop.
Assert `pg_proc` holds exactly one row for the function in the test.

**THE EXCEPTION, AND IT IS THE ONE THAT MATTERS WHEN A CLIENT IS ALREADY
DEPLOYED: where the RUNNING client calls the old arity, dropping it is not
available, and the answer is to KEEP BOTH and remove the DEFAULTS from the wide
one.** A drop and a deploy are mutually blocking -- apply first and every call
breaks until the client ships, ship first and every call breaks until it is
applied -- so there is no correct order, and the way out is that there is no
drop. What makes the surviving pair safe is not the drop, it is that no payload
can bind to both:

- the WIDE form declares **no defaults at all** (Postgres forbids a required
  parameter after a defaulted one, so this is all-or-nothing), which means the
  old key set cannot reach it;
- the NARROW form keeps its original signature verbatim, defaults included, and
  has no parameter for the new key, so the new key set cannot reach it;
- the narrow form becomes a THIN WRAPPER that calls through with the new
  argument null, so there is still exactly one copy of the rule -- and it
  re-raises its OWN original refusal text ahead of delegating, so a client that
  has not been redeployed sees the errors it has always seen.

The smallest call the wide form accepts is then strictly larger than the largest
call the narrow one accepts, so the pair is unambiguous under ANY resolution
rule rather than under a particular one. Assert that structurally -- both
arities present, `pronargdefaults = 0` on the wide one -- not just the count: a
count of two passes on exactly the arrangement that breaks every call. Removing
a default through `create or replace` is REFUSED by Postgres, so the wide form
is `drop function`ed at its OWN exact (new) signature first, which keeps the
file re-appliable over a machine that took an earlier draft.

### Write path

- **ZERO client write grants on feature tables.** No insert/update/delete grant
  or policy. Every write is a **SECURITY DEFINER RPC that re-checks the caller
  inside its own body**. UI gating is convenience; the RPC is the boundary.
- **A student-facing write RPC takes NO identity parameter.** The caller is
  `auth.uid()` / `current_user_email()`, so "can only act as themselves" is a
  property of the SIGNATURE rather than a check that could be got wrong.
- **Documented exceptions, each for a stated reason:** anonymous intake
  (`fsp_frc_interest`, `app_feedback`, `fsp_item_opens`) writes directly under an
  own-row `WITH CHECK`, because there is nothing to forge in a comment about
  yourself; and the legacy coin import writes rows directly because they are
  HISTORY, not events, and no live rule should read them.

- **AN INSTRUCTOR'S OWN ANSWERS ARE THEIR OWN TABLE, NOT A FLAG ON THE
  STUDENT'S** (0128). `classroom_instructor_responses` mirrors
  `classroom_responses` column for column with the student replaced by the
  instructor, and `classroom_instructor_keys` (one row per item) says which copy
  is the answer key. Every reader of `classroom_responses` -- the grading
  console, the FACTS CSV, the Grades tab, the export -- assumes a row there
  belongs to a student on somebody's roster, so an `is_instructor` column would
  make ONE forgotten `and not is_instructor` enough to grade a teacher or put an
  answer key in a CSV. **NO STUDENT READ PATH EXISTS**: both policies gate on
  `classroom_can_read_instructor_material` first, and there must never be a
  policy, payload or proxy that changes that. Writing and designating need only
  that gate (manages ANY posted section, so a Block 4 instructor can keep a
  copy), never `_classroom_manages_item`; an UNDESIGNATED copy is private to its
  author; undesignating is the author, the designator or an admin, and anyone
  else REPLACES instead.
- **A SPEC'S RUBRIC AND AN ITEM'S RUBRIC ARE TWO DIFFERENT RECORDS, AND ONLY ONE
  OF THEM IS GRADED AGAINST.** The criteria an author writes live inside the
  spec JSON (written by `classroom_set_assignment_spec` or
  `classroom_set_reference_spec`, both validated by `_classroom_check_spec`);
  **there is no `classroom_set_spec`** -- that name is a contraction of the
  two, it names no database object, and three source comments under
  `src/lib/classroom/` still use it;
  grading reads `classroom_rubrics`, written only by `classroom_set_rubric` and
  loaded by the item page as its own `rubric`. Nothing in the database bridges
  them, and nothing should -- a rubric is editable after generation, so a
  derived copy is the point rather than a duplication. **`rubricFromSpec` is the
  ONE translator between the two** and every path that needs one calls it: the
  builder's "Generate from spec", `levelShort`'s spec lookup, and
  `stagedRubricAfterSpec`, which is what carries a spec's rubric onto an
  assignment at CREATION (staging it exactly as the spec itself is staged, since
  `classroom_set_rubric` needs the item to exist). **A second implementation
  flattens the levels**, which is the failure this is most likely to take: a
  rubric imported without them is not a partially imported rubric, it is a
  broken one, because every leveled criterion collapses to a number a grader has
  to override to reach. **A rubric that went through the builder is never
  re-derived** -- `stagedRubricAfterSpec`'s `derived` flag is what tells the two
  apart, and without it re-pasting a corrected spec eats whatever somebody
  typed.
- **A cross-user staff write is always an RPC**, never a direct client write.
- **Nested SECURITY DEFINER calls are the reuse mechanism.** `is_admin()` /
  `current_user_email()` read the session's JWT claims, not the executing role, so
  an inner call is authorized as the same caller. Bulk RPCs call the single-row
  RPC per row rather than reimplementing any rule.

### Read path

- **Reads run as the CALLER with no identity filter -- RLS does the filtering.**
  Do not write `.eq('student_id', uid)` "for safety"; the policy is the boundary
  and a second copy can stop matching.
- **The exception, and it is a real one:** where the SAME policy legitimately
  returns other people's rows to a DIFFERENT caller (a teacher reading their
  sections), a page computing "MY rows" adds the explicit filter. Authorization
  and ATTRIBUTION are different jobs.
- **A ROSTER-SHAPED LIST TAKES ITS ROWS FROM THE ROSTER, NEVER FROM THE
  PAYLOAD.** Reshaping work rows into a per-person list, do not create a person
  because an email turned up in the data: the policies scope on "may I review
  this", which for a manager of two sections legitimately returns the OTHER
  section's students on a co-posted item, and an invented row is `active`, named
  from the local part of an address, and indistinguishable from a student in the
  roster, the chips, the returned count, the CSV and a Grades tally whose
  denominator excludes it. **Drop it, but say how many** -- a silent drop hides a
  real enrollment mistake exactly as well as it hides the expected case. Report
  the COUNT, not the addresses: what reaches a console reaches an export, a paste
  and a screenshot.
- **AND A PERSON WHO CAN MANAGE THE SECTION IS NEVER A STUDENT ROW IN IT (0138),
  WHATEVER THEIR ENROLLMENT SAYS.** Instructors enroll themselves to see a class
  the way a student does, and roster imports sweep them in; the row then reads as
  a student on the check-in grid (name, LEFT badge, dashed cells, a work count),
  in the grading roster, in the FACTS CSV and in the Grades denominator.
  - **`classroom_section_roster(uuid default null)` IS THE ONE ROSTER READ**, and
    it PROJECTS a `manages` flag rather than filtering: the People tab has to SHOW
    that row, because it is the row somebody came there to remove. Null section
    means every section the caller manages, which is what the home feed needs.
    `loadSectionRoster` is its single reader, with a `PGRST202` rung down to the
    plain table select where `manages` is UNDEFINED -- "cannot tell" must never
    read as "yes".
  - **`splitRoster` IS THE ONE IMPLEMENTATION OF DROPPING THEM.** The client never
    re-derives manage-ness and could not: admin-ness is keyed on `app_admins`,
    which is admin-only readable, so a browser has no way to ask. A surface that
    spells out "is this the teacher of record" is the second definition.
  - **THE MANAGER LIST AND THE OFF-ROSTER LIST ARE TWO FINDINGS WITH TWO LABELS,
    and only one of them is an error.** An off-roster email means work arrived
    with no enrollment behind it; a manager exclusion is the roster working. One
    sentence covering both makes the working case read as a fault every time.
  - **A TALLY IS NOT A ROSTER, AND HAS TO BE TOLD SEPARATELY.** The home feed's
    to-grade chip counts submissions, so `buildFeed` takes `managerEmails` per
    section; empty is the honest pre-0138 answer, never a guess.
- **AN ENROLLMENT CAN BE REMOVED, BUT ONLY WHEN NOTHING HANGS OFF IT (0138).**
  `classroom_remove_enrollment` is the ONLY delete path -- `classroom_enrollments`
  still carries `grant select` and nothing else, and adding a DELETE grant or a
  write policy is what would open a second one. It re-checks
  `classroom_manages_section` (no new gate), counts responses, submissions,
  approvals and notebook entries scoped to the SECTION through
  `classroom_postings`, and refuses with those counts rather than deleting.
  **Soft-deleted notebook entries are counted deliberately**: 0116/0117 make them
  restorable, so an entry in the bin is work a delete here would strand.
  Deactivating (`active = false`) stays the answer for a student who left.
- **An owner-privileged view (not `security_invoker`) MUST carry its own explicit
  row predicate** to replace the RLS it bypasses.
- **`security_invoker = true`** wherever a view should add no reach.
- **A function referenced DIRECTLY inside an RLS `using` clause must be granted
  EXECUTE to `authenticated`** -- it is evaluated as the querying role, not from
  inside a definer function. Missing that grant breaks the whole own-row read with
  `permission denied for function`.
- **No public response ever carries an email.** A public surface over an
  email-keyed schema uses `anon`-granted RPCs that project the address away inside
  the database -- never a table grant, never a `security_invoker` view. Per-row
  identity is an OPAQUE id (`md5(secret salt || email)`, salt minted at apply time
  and readable by nobody). There must be no parameter or field through which an
  address can be requested or returned.
- **Visibility DELEGATES to one function.** Photos, notes, folders and attachments ask
  the same `*_can_read_*` their parent uses rather than restating who staff are, so
  widening one function widens all of them consistently and a draft's children can
  never leak independently.
- **A function whose NAME says the wrong thing is DROPPED, not redefined.** Redefining
  the body is what created the `is_teacher()` trap; it is a last resort for policies
  already applied, never the choice for a function you can still replace.

### State modelling

- **Derived, never stored.** A balance is a `sum()` over the ledger; "current note
  revision" is a `max()`; contract, lap and expiry state are computed at read
  time. There is no mutable column to drift and no cron. A trigger that stops
  firing leaves a subtly wrong value forever with nothing to catch it.
- **Append-only where the record matters.** `coin_transactions`,
  `notebook_entry_notes`, `classroom_content_revisions`,
  `tournament_match_events` and `app_feedback` have no UPDATE or DELETE grant at
  all. Editing INSERTS a superseding row; the chain is `supersedes_id` + a unique
  `(logical_id, revision)`, so "current" is a plain `max()` and two concurrent
  edits collide on the constraint instead of silently losing one.
  - **AN ADMIN MAY CORRECT A FILED REPORT, AND THE REPORTER'S ROW STILL NEVER
    CHANGES (0233, report d362bfb3).** `app_feedback_edit` (admin only) inserts
    revision n+1 of the kind, message and "tried" into `app_feedback_edits`,
    which is append-only too (no client grant at all) but carries no
    `supersedes_id`: it is keyed `(feedback_id, revision)` alone, so the
    current correction is the `max()` of the revision; two concurrent saves
    queue on the report's own row lock (`for update`), so the second reads the
    first's revision and is refused, with the key as the backstop. It refuses
    a form opened on an older revision
    as `stale`, and stamps nothing for a save that changes nothing (asked before
    staleness, so a retried save finds its own words). The wide
    `app_feedback_admin_list` projects the latest as `edit` on EVERY row, null
    when unedited, and that key's presence is what licenses the Edit control.
    `rowKind`, `rowMessage` and `rowTried` in `$lib/feedback/console.ts` are the
    one reader of what a report says now; the JSON export and the archive's
    index.json keep the reporter's words on the row with `edit` beside them, and
    `tools/feedback_digest.py` prints the corrected words, tagged `[edited]`.
    (Status and horizon were always admin-updated columns; the reporter's own
    columns are what no write path touches.) **An open edit never vanishes with
    its words**: the console, not the form, holds them (`FeedbackEditDraft`),
    because a filter change or a bulk move that hides the report moves its card
    under "Being edited" and REMOUNTS the form, which opens on them again; the
    card's own status and horizon keys are aria-disabled while it is open.
  - **THE ONE NARROWING, AND IT IS ABOUT WHAT NOBODY HAS READ YET (0129).** A
    revision an AUTOSAVE wrote may be replaced in place by the next autosave,
    because otherwise a debounce mints a revision per keystroke burst and a
    ten-minute writing session turns in a version list dozens long -- which
    makes the history the chain exists for unreadable and gives a whole-chain
    delete far more to walk. **The grants do not move**: there is still no
    UPDATE grant and no UPDATE policy, and the replacement happens inside a
    SECURITY DEFINER RPC. **The licence comes from the AUDIENCE, not from the
    convenience**: the row must be the head of its chain, written by the
    caller themselves, live, and on a DRAFT -- which 0118 makes invisible to
    staff -- so what append-only protects, the version somebody else saw, is
    never what gets overwritten. `notebook_entry_notes.autosave` means
    REPLACEABLE, not "was an autosave"; **an explicit save and a turn-in STAMP
    A BOUNDARY** (`notebook_seal_notes`, and `notebook_submit_entry` does it
    itself so no client can forget), and the predicate refuses a submitted
    entry as a redundant second layer. `created_at` says when the revision was
    STARTED and a replacement never moves it; `updated_at` says when it last
    absorbed one. **Do not extend this to a surface whose writes are visible
    to anyone but their author.**
- **SOFT-DELETING A REVISION CHAIN MARKS EVERY ROW IN IT, never just the head.**
  Where "current" is a `max()` over a chain, stamping only the newest row promotes
  the one beneath it: a read filtering `deleted_at is null` then answers with the
  content as it read BEFORE the last edit, with nothing raised anywhere. Key the
  UPDATE on the LOGICAL id (`note_id`), and refuse an EDIT of a deleted chain --
  an insert would otherwise graft a live head onto a marked history. A shell or
  emptiness guard excludes the chain by that same logical id, or the rows being
  deleted count themselves as remaining content.
- **Archive, never delete.** `active = false` / `revoked_at` / `removed` keep
  history, roster and board rows intact. A real delete is offered only where the
  row holds no record worth keeping (a notebook FOLDER is organization, so
  deleting one unfiles its entries and loses only the filing). IDEA Armory's
  Delete forever (0233) is the one deliberate exception, Mr. Pina's, behind an
  archived project, a typed name and a site admin; see the Armory paragraph.
- **A soft-delete stamp is not a boundary.** The stamp is only as good as the
  filters behind it: enumerate every function, view and select that lists the
  table and exclude there, and pair each exclusion assertion with a positive
  control.
- **Make the invalid state unrepresentable with a COMPOSITE foreign key** rather
  than an RPC check: `(folder_id, student_id)`, `(session_id, section_id)`,
  `(item_id, section_id)`. Then no RPC has to re-check it and a raw insert cannot
  route around it. Assert it in a test **with RLS out of the way entirely** (as
  the connection owner), so nothing but the key itself can be what refuses.
- **Email-keyed, not user-id-keyed, wherever a roster must exist before people
  sign in** (`coin_transactions`, `classroom_enrollments`, `app_admins`). A
  balance or enrollment is simply there on first login; there is no linking step.
  The notebook stays uuid-keyed; the bridge between the two is two no-grant helper
  functions, never a granted view (a view mapping emails to user ids is a school
  directory).
- **A canonical record + a postings join table** is how one authored thing appears
  in N classes (`classroom_items` + `classroom_postings`, `notebook_sessions` +
  `notebook_session_postings`). **The posting carries no state of its own** -- the
  moment it could, the copies could drift again.
- **A one-way conversion is TWO LINKED ROWS sharing a transfer id**, never one
  special-cased row, so balance derivation stays a plain per-medium sum with no
  exceptions -- and a transfer is then excluded from "earned" and "spent", because
  it is neither.
- **The sign, the label and the total come from the STORED value, always.** Never
  reconstruct one from a type string or a whitelist of names: a row stored `+40`
  rendered as a red `-40` for months because the renderer re-derived its sign.
- **Ask what a row MEANS, not what sign it carries**, when bucketing into totals. A
  correction and a transfer are neither income nor spending, and both hid for months
  because the reader's own reconciliation cancelled out and agreed with the wrong
  numbers.

### Refusals

- **A refusal a caller must display gracefully returns structured
  `{ok:false, reason:...}` jsonb.** Genuine misuse raises.
- **Bulk RPCs return `{total, succeeded, refused, results:[...]}`** so one
  student's refusal never obscures whether the rest landed, with a per-row
  exception handler so one failure cannot abort the batch.
- **One round trip, one server-side transaction** -- never a client-side loop that
  can stop halfway with nobody able to say how much landed.
- **An unmatched override is REPORTED, never silently dropped.**
- **Normalize, dedupe and sort a list of identity keys before acting on it.** A
  balance is keyed on the email, so `A@x` and `a@x` are one person and processing
  both charges them twice with two perfectly ordinary rows to show for it.
- **A capacity check needs a ROW LOCK on the parent** (`select ... for update`),
  not a count-then-insert: there is no child row to lock for a caller who does not
  hold one yet. Under READ COMMITTED each statement gets a fresh snapshot, so the
  count after the wait genuinely sees the winner's commit.

### SQL traps

- **`jsonb_typeof(x) <> 'string'` is NULL -- not true -- for an ABSENT key**, so
  the guard falls straight through and the check never fires. Use
  `is distinct from`. This has bitten three times, and the third one is the
  reason it matters: **in a boolean GATE the NULL does not stop there.** It
  propagates through whatever the guard was protecting, out of the function as
  SQL NULL, and every caller asks `if not <gate> then raise` -- which does NOT
  fire on NULL. So the fall-through does not merely skip a check, it ACCEPTS
  the write. `_notebook_note_run_len` (0078) did this for a run carrying no
  `text` key for four months, and 0125 fixed it; `_classroom_run_ok` (0108) is
  the same function written correctly and always was. When a gate can return
  NULL, assert `toBeNull()` on it in a test rather than `toBe(false)` -- they
  are wildly different outcomes and only one of them refuses anything.
  - **FIXING ONE IS A NARROWING, AND A NARROWING REFUSES RATHER THAN
    TIGHTENS.** The gate starts saying no to something already in the table,
    and it does it SILENTLY: every stored row keeps rendering, and only the
    next save of it fails, mid-edit, in front of whoever wrote it. So the
    migration COUNTS the affected rows itself, at apply time, against the real
    table, and raises with the number rather than applying (0125). Whether to
    strand that work is a decision a person makes with the count in front of
    them. **Take the count as `<gate>(col) IS NULL` under the DEPLOYED
    function** -- the behavioural probe -- never as a second hand-written walk
    looking for the bad shape: the question is which rows CHANGE ANSWER, and a
    second copy of "what a run is" is the thing that quietly stops matching.
  - **The `_notebook_note_content_ok` backstop is DEFENCE IN DEPTH, not
    belt-and-braces**: its final `return` refuses a NULL total outright, so
    reopening the run guard one level down still fails closed. Verified by
    opening each layer separately and confirming only the pair reddens.
- **An RLS policy records a real dependency on every FUNCTION and COLUMN its
  expression names.** Drop the policy before dropping the column, and recreate it
  after.
- **A constraint another constraint depends on cannot be dropped and re-added.**
  Postgres has no `add constraint if not exists`; guard on `pg_constraint` in a
  `do $$` block instead. A blind drop-then-add raises `2BP01` on the second run.
- **Postgres `round()` is half-up (away from zero), not banker's rounding**, and
  agrees with JS `Math.round()` at ties for positive inputs.
- **`btrim(x)` with no second argument strips SPACES ONLY, where JavaScript's
  `trim()` also strips newlines and tabs.** A TypeScript mirror of a SQL
  projection that ends in `btrim` must not spell it `trim()`: the two agree until
  the first value whose first or last line is blank, and then the client and the
  column disagree with nothing to say so.
  - **AN EMPTINESS GATE SPELLED WITH `btrim` ACCEPTS A BLANK.** `length(trim(x))
    > 0` passes a value of newlines and tabs, which is empty to whoever typed it
    and empty to the client's `trim()` -- so the gate admits the one thing it
    was written to refuse. Where a gate must agree with a person's idea of
    empty, normalize with `regexp_replace(x, '^\s+|\s+$', '', 'g')`, in ONE
    private function the whole file calls. Not `btrim(x, E' \t\n\r\f\v')`: an
    escape Postgres does not recognise in an `E''` string is kept as the bare
    LETTER, so that trim set silently also strips `v` from both ends.
- **A LAZY "CREATE THE ROW IF IT IS MISSING" IS A RACE THE MOMENT ITS CALLER
  BECOMES CONCURRENT.** `select ... ; if not found then insert` is correct under
  one caller and wrong under two: READ COMMITTED gives each its own snapshot,
  several read nothing, several insert, and the losers get a unique violation
  the caller then has to interpret. **`on conflict (...) do nothing` plus a
  RE-READ** is the fix, and the re-read is not tidiness -- `insert ...
  returning ... into` leaves the target NULL when the conflict fires, so the
  re-read is the branch that actually finds the winner's row. **RE-ASK ANY
  STATE QUESTION AFTER IT**: between the first select and the insert the winner
  may have changed the row's state, and the correct answer is then the ordinary
  refusal rather than writing anyway. A count-then-insert is NOT the
  alternative here -- there is no parent row to `for update` before the first
  caller holds one -- so the unique index IS the serialization point and the
  only question is who apologises for it. 0134 is this, exposed by 0133 making
  the student file uploads concurrent (latent since 0086); the test that proves
  it is a PAIRED measurement across two chains, because a burst that happens
  not to overlap passes on the broken code too.
- **A volatile expression like `now()` cannot appear in an index predicate**, so
  "currently active" cannot be a partial unique index on its own; pair
  `revoked_at is null` in the index with a lazily-stamped close on the row.
- **A CHECK CONSTRAINT'S FUNCTION RUNS AS THE WRITING ROLE, so `service_role`
  needs EXECUTE on it.** `service_role` bypasses RLS; it does NOT bypass
  function grants. A private predicate `revoke`d from `public` and granted only
  to `authenticated` therefore makes a table UNWRITABLE by a server holding the
  service key, with `permission denied for function <name>`, even though the
  table's own `grant insert ... to service_role` is right there. The RPCs do not
  show this, because SECURITY DEFINER runs their checks as the owner -- so the
  hole only opens for the one caller that writes DIRECTLY, which is exactly the
  Edge Function a table like `student_app_files` exists to be written by. 0130
  shipped with this (`_classroom_deck_path_ok`, `_foundry_norm`). Grant the
  predicate to every role that writes the column, not just to the ones that read
  it.
- **When re-signing a function to change one term, DIFF IT AGAINST THE SOURCE.**
  A plausible reconstruction from memory is how error semantics quietly change.

---

## Client data access

### A READ THAT CAN RETURN MORE THAN 1000 ROWS IS PAGED

**PostgREST caps one response at the project's `max_rows` (1000 by default on
Supabase) and says nothing.** A read with one row per student per block --
`classroom_responses`, module approvals, hand-in files -- crosses that on one
large worksheet (a 63-block worksheet at 16 students), and every row past the cap
was simply missing: until ledger 0298 a grading screen could show a student's
answers blank on such an item. `readWorkPages` in `src/lib/classroom/transports.ts`
is the grading pager: ordered on the table's own key so no row repeats or is
skipped, a short page ends it, a later page's failure keeps what arrived, and rows
are deduplicated on the key because a student saving mid-read shifts every offset.
`readAllPages` in `src/lib/classroom/student-work.ts` is the completeness pager and
answers null instead of a partial set, because a partial set would judge a student.
Pick the one whose failure answer is right for the surface; a third pager is a
third set of edge cases. `tests/classroom-grading-work-paging.test.ts` drives the
real loads against a fake that enforces the cap.

### Select ladders (widen-then-degrade)

Migrations are applied by hand and separately, so **a deployment sitting between
two of them is a real state.** Every select naming a column or embed a newer
migration added is written as a LADDER: widest first, retried one capability
narrower on failure, ending on a select that works on the oldest supported schema.

- **A new capability gets its OWN rung.** Never fold it into an existing one --
  degrading would then cost an unrelated capability too.
- **Each capability reports itself** (`notesReady`, `foldersReady`, `pinsReady`,
  `deletionReady`), starting FALSE and turned on only by a rung that actually
  included it succeeding. The UI turns off exactly what is missing and says so; it
  never blanks the page.
  - **A RUNG CAN ALSO BE WHAT LICENSES NAMING A NEW RPC PARAMETER**, and that
    is the tidiest form of the deploy-ordering rule: a column and the parameter
    that goes with it land in the same migration, so a rung that came back
    PROVES the parameter exists. `coalescingReady` (0129) is the case --
    `updated_at` on the note embed is what says `p_autosave` is safe to send.
    Better than a `PGRST202` retry, which spends a failed round trip to learn
    the same thing.
- **A FILTER on a new column has the same problem as selecting it** -- PostgREST
  rejects a filter naming an unknown column. Apply it only on the rung that has
  the column, or try-then-fall-back.
- **The narrowest possible probe decides "is this configured"** -- scalar columns
  only, no embedded resource -- so the "not available" card can only ever mean
  what it claims.
- Ladders live in one shared module per subsystem (e.g.
  `src/lib/notebook-selects.ts`), not inline in a route, and are covered by a test
  asserting the rungs strictly narrow.

### THE STALE POSTGREST EMBED

**A select string naming an embedded resource is an assertion about the FOREIGN
KEYS, and nothing type-checks it.** A migration that repoints a key silently
invalidates every embed through it: PostgREST answers `PGRST200` and fails the
WHOLE select, so a fully-migrated database reports the feature missing.

SQL-level tests cannot see this and never will -- SQL does not need a foreign key
to join two tables. The cheap durable guard is a test asserting **every table
embedded in the shipped select strings has a real relationship to its parent**,
read from the live catalog and pinned against a parser that returns nothing.

### RPC degradation

Degrade past a missing RPC on the **`PGRST202` code ALONE**, so a runtime error
inside the function fails closed rather than falling through to a weaker path.

---

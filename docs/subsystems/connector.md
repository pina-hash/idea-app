# The IDEA Website connector

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). The remote MCP server that lets a site admin act through the site's own functions. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

### THE IDEA WEBSITE CONNECTOR -- Claude acting as an admin, through the site's own functions

**`https://ideabosco.com/mcp` IS A REMOTE MCP SERVER THAT LETS A SITE ADMIN DO
FROM ANY CLAUDE CHAT WHAT THEY DO ON THE SITE BY HAND, AS THEMSELVES (ledgers
0400 and 0401, migrations 0270 through 0272).** `docs/connector/DESIGN.md` is
the spec, decided by Mr. Pina on 2026-10-17, with "What 0400 built" and "What
0401 built" notes at its end; `docs/connector/EVALS.md` is the finish line. The site is its own OAuth server
(`src/lib/server/connector/oauth.ts`): the two `.well-known` documents,
`/connector/authorize` (the consent card, the site's own Google session being
the sign-in), `/connector/token`, `/connector/register` and `/connector/revoke`.
None is under `authedPrefixes`; the MCP route answers its own 401 with the
`resource_metadata` pointer.

- **IT ACTS AS THE TOKEN'S USER AND NOBODY ELSE.** `handleMcp` turns the bearer
  into a connection row, mints a Supabase session for that user (the Armory
  pattern, cached in memory, never stored) and runs every tool through a client
  carrying it, so `auth.uid()`, `is_admin()` and every policy see that user. The
  service role is in one file, `src/lib/server/connector/backend.ts`, for the
  `connector_*` tables and minting only; `tests/connector-service-role.test.ts`
  holds it there. No identity constant exists: any admin may connect.
- **TWO GATES STOP A STUDENT ACCOUNT, AND THE SWITCH IS A THIRD.** Consent
  answers 404 to a non-admin, and every MCP request asks `is_admin()` AS THE
  MINTED USER before any tool runs; an address taken off `app_admins` has its
  connection revoked on its next call. `/admin/connector` holds the switch
  (`connector_settings.enabled`, off answers 401 on every request), the
  connections with Disconnect and Disconnect all, and the audit log.
- **EVERY WRITE GOES THROUGH `connector_call`, WHICH IS SECURITY INVOKER.** It
  builds the call from `pg_proc` (named arguments, each cast to its declared
  type), so the inner function is gated exactly as from the browser; a caller
  who is not an admin reads the inner function's own refusal, text for text, and
  one whose call would have worked reads "The IDEA Website connector is for
  site admins." and nothing lands. `tests/db/connector-permissions.test.ts`
  holds that for every write entry, and that the admin's connector call writes
  the same rows as the direct call.
- **THREE LEVELS, ENFORCED BY THE SERVER FROM THE REGISTRY, NEVER BY A PROMPT.**
  `read` runs at once with no audit row; `undo` runs, is logged, previews on
  `dry_run`, and names its reverse (`undo_last` runs it); `confirm` always
  previews first and writes only on a second call carrying the stored,
  single-use `confirm_token` within ten minutes with identical arguments
  (`src/lib/server/connector/engine.ts`). A preview is the write rolled back by
  a `CONNECTOR_PREVIEW:` raise. Repeats never double: Claude's `request_id`, or
  a derived key matched within 120 seconds, answers the stored result with
  `repeated: true`; `again: true` is the deliberate second.
- **ONE AUDIT ROW PER WRITE, IN THE SAME TRANSACTION, "VIA CLAUDE".** The
  site's own logs are written by the inner function, unchanged (a coin award is
  the Coin Desk's row, logged by the admin, with the reason they said);
  `connector_audit` adds who, tool, function, arguments, result, the rows
  written (read from `connector_log_tables` by an exact in-progress-xmin test
  that catches subtransaction writes, `tests/db/connector-xmin.test.ts`) and the
  computed undo. A failure is recorded on its own statement
  (`connector_audit_failure`). The `connector_*` tables carry no policy and no
  client grant; the private helpers refuse outside a `connector_call` of the
  same transaction.
- **THE REGISTRY IS THE ONLY SOURCE OF TOOLS, AND IT WRITES ITSELF (ledger
  0416).** Four layers, one builder (`src/lib/server/connector/registry.ts`):
  the inventory of every function the site calls under `src/` and every
  `+server.ts`, the schema read from `pg_proc` on the whole migration chain,
  the hand-written YAML overlay in `src/lib/server/connector/registry/` (the
  only layer anybody edits; `tools.yaml` holds the voice-shaped facades), and
  the GENERATED layer `src/lib/server/connector/auto.generated.json` (with
  `endpoints.generated.ts` for its route imports), which
  `tools/connector/auto.mjs` writes for every function and route the overlay
  does not name. `npm run connector:build` regenerates all of them and the
  safety-level table in `docs/connector/DESIGN.md` section 7, and
  `.github/workflows/connector.yml` runs that build on every push to `main` and
  commits what changed, so **a new admin action ships its tool on the push that
  adds it, with nobody asked** (Mr. Pina, 2026-10-19).
  - **WHAT THE INVENTORY SEES.** A literal `.rpc('name')`, AND any quoted string
    in the site's code (comments stripped, the connector's own files and
    `/dev` aside) that names a public function some migration creates: most of
    the Coin Desk, the IDEA Market, the certifications desk and the Armory call
    through a helper that passes the name along, and on 2026-10-19 that hid 253
    functions, the market banner among them.
  - **WHAT IS AN ADMIN ACTION** is read off the function body, never its name:
    it reaches a staff gate in `tools/connector/gates.mjs` (`STAFF_GATES`),
    directly or through a private `_helper`, never through a public read check
    like `classroom_can_read_item` that a student passes too. A route is one
    when its handler calls `isAdmin(` or `isOwner(`.
  - **WHAT A GENERATED TOOL IS.** A `site_call` entry at `read` when the body
    writes nothing (transitively, `bodyWrites` and `writers`), otherwise
    `confirm`, which always previews and hands back a `confirm_token`. It never
    claims `undo` (a reverse is a judgement), its arguments are `pg_proc`'s with
    spoken names, and an Armory `p_operation uuid` is filled by the server. A
    function with no staff gate is a generated exclusion ("acts as whoever
    calls it"). A hand entry always replaces a generated one: that is where a
    tool gets its words, its undo and its sample.
  - **THE PROOF.** `tests/connector-coverage.test.ts` fails on a stale
    generated file and on any admin action with neither a tool nor a
    hand-written exclusion of at least twenty characters. A hand entry's write
    needs a sample in `tests/db/connector-samples.ts`; an entry marked
    `proof: generic` (every generated one, and a hand entry at `read` or
    `confirm` only) is called there with placeholder arguments of the right
    types and held to the first half of `tests/db/connector-permissions.test.ts`
    (nobody but an admin gets anything through it, nothing is written) and to
    asking first. Every table a hand entry's rows land in is named in
    `src/lib/server/connector/log-tables.ts` (synced into `connector_log_tables`
    by the server, never by a migration).
  - **WHAT IT STILL CANNOT REACH: a write a page makes straight into a table**
    under its RLS policy (the IDEA Maps editor, GAUNTLET series, a role edit on
    `/dashboard`). The connector calls functions; a new admin write belongs in a
    definer function (`docs/subsystems/database.md`), which it then picks up.
- **A VALUE THE SERVER FILLS IS NOT PART OF WHAT HE CONFIRMS (ledger 0416).** A
  `fill: uuid` argument is drawn fresh per call, so the confirmation hash and
  the repeat key are taken over the arguments he gave (`givenArgs` in
  `engine.ts`) and the commit reuses the values stored with the preview; before
  this every Armory confirm was refused as "for different arguments".
- **ONE FORM OF A FUNCTION MUST TAKE THE ARGUMENTS SENT (`fitOverload`).** With
  two forms, a subset can fit neither and PostgREST answers "could not find the
  function"; `site_call` now says what is missing instead, and an entry over
  several forms gives its optional arguments a `default` so one form always
  fits (`app_feedback_admin_list`). The coverage test holds every live entry to
  this for any one optional argument.
- **A LEVEL MAY DEPEND ON THE ARGUMENTS OR ON WHAT IS THERE BEFORE, AND THE
  SERVER DECIDES IT (`level_when`, `levelFor`).** A condition names an argument
  (`p_amount > 0`) or a value the entry's own `before` read found as him
  (`$before.found`, `$before.status = draft`); the branch with no reverse asks
  first. An undo entry names its reverse from `$before`, `$args`, `$result`,
  `$written` or `$user`, and `tests/db/connector-levels.test.ts` runs every one
  and judges the reversal on the log tables; a reversal that leaves a record on
  purpose (a revoked grade, a removed note) is named there with its reason.
- **A SITE ROUTE IS RUN IN-PROCESS AS HIM, NEVER FETCHED.** An endpoint `call`
  entry is one of the literal imports in `src/lib/server/connector/endpoints.ts`,
  handed `locals.supabase` on the minted session, so every gate in the route
  decides as on the site; it is audited by `connector_endpoint_begin`/`_finish`
  (0272). A route added there gains no caller it did not have.
- **EVERY TOOL TAKES `said`, HIS WORDS, AND THE SERVER KEEPS THEM (0272).**
  `connector_request_log` writes the request and appends a saved request
  (`connector_evals`) for words it has not seen; `site_call` on a name the
  registry lacks, and `report_gap`, write an open gap (`connector_gaps`), shown
  on `/admin/feedback/connector`, where Built takes the ledger that built it.
  These are definer functions re-checking `is_admin()`, with no client grant
  and no policy on the tables. `docs/connector/EVALS.md` is GENERATED from the
  table by `tools/connector/evals/export.mjs` (`--json` takes the download on
  `/admin/connector`); never edit it by hand.
- **`/mcp/practice` IS THE SAME SERVER WITH EVERY WRITE A PREVIEW, FIXED BY THE
  URL, NEVER BY AN ARGUMENT.** Nothing commits and nothing is logged there
  except a replay result (`record_eval_result`), and
  `tests/db/connector-requests.test.ts` drives every write entry through it and
  holds every log table and connector table unchanged.
- **NAMES ARE RESOLVED AGAINST THE CLASSES THE ADMIN TEACHES, NEVER GUESSED.**
  `src/lib/server/connector/resolve.ts` looks at sections where the admin is
  teacher of record (an admin manages every section, so "manages" would be the
  whole school); an ambiguous or unknown name writes nothing and says so. Dates
  are school time through `$lib/classroom/school-calendar`.
- **`replace_html_assignment` REFUSES WHEN AN ANSWERED BLOCK WOULD DISAPPEAR**,
  naming the ids, using the importer's own `stageHtmlDocument`; 0195's setter
  does not check this itself.
- **THE TOKEN AND REVOCATION ENDPOINTS TAKE CROSS-SITE FORM POSTS WITH NO
  ORIGIN, SO SVELTEKIT'S BUILT-IN CHECK IS OFF AND `connectorCsrfGuard`
  RESTATES IT.** `svelte.config.js` sets `csrf.trustedOrigins` to `['*']` only
  because the guard runs first in `hooks.server.ts` with exactly those two paths
  exempt; every other route keeps the check, which matters because a student
  bundle on the apps origin is same-site. `tests/connector-csrf.test.ts` holds
  both halves.
- **`/mcp` AND `/connector` ARE RESERVED SHORT LINKS (0271).** The local
  backend (`src/lib/server/connector/backend-local.ts`, dev only, over an
  embedded cluster booted by `tools/connector/local-backend.mjs`) is how the MCP
  Inspector run is done with no Supabase project.
- **VOICE TO ACTION: ONE CALL PER EVERYDAY REQUEST, MEASURED (ledger 0432).**
  On 2026-10-23 his 222 saved requests (1775 requests) were read: 1417 went
  through `site_call`, almost all of them one status change at a time on the
  Armory incidents (1037), the Armory notes (926) and the site's reports (96),
  then the Armory lists (181), the gaps (75) and a roster (20); coin awards and
  fines took 1.64 calls each because a name went through `find_student`
  first. So each got one direct tool: `coin_transact` (coins from his words,
  `src/lib/server/connector/coin-voice.ts` the one statement of the amount
  rule), `mark_feedback` (many rows of any of the three lists, one write, one
  undo, no confirm because a status flip is reversible), `list_armory_reports`,
  `read_armory_incident`, `class_roster` and `list_gaps`.
  - **THE AMOUNT RULE IS HIS, AND THE TOOL NEVER INVENTS A NUMBER.** A matched
    category with a set price uses it; a saved phrase uses its default unless
    he says a number, which then replaces it; a new phrase with a number logs
    a Custom Award, Fine or Purchase and saves the phrase
    (`coin_phrase_aliases`, 0300); no number and nothing listed answers
    `needs_amount` and writes nothing. `tests/db/connector-coin-voice.test.ts`
    holds the no-write half with a planted control.
  - **A REPLACED TOOL ANSWERS BUT IS NOT OFFERED (`replaced_by`).**
    `award_coins` and `fine_coins` still run for an old chat or a saved
    request that names them; `toolList` leaves them out so a model on a phone
    sees one coin tool. The list cap in `tests/connector-registry.test.ts` is
    45; a tool past it is a decision.
  - **A STUDENT ACTION IS NEVER A TOOL (`CALLER_SEAMS`).** See
    `docs/subsystems/coins.md`; the generated layer excludes anything that
    reaches the coin student seam.
- **GRADING FROM A CHAT: ONE READ IN, ONE CALL OUT (ledger 0438, feedback
  6db4fbe5, gap 8fd1c0bb).** `grading_packet` reads a whole assignment as him:
  the questions (retired ones included), the rubric with criterion ids, the
  post's own files and answer keys, the worksheet's HTML on request, and per
  student the status, earlier grade and comments, text answers, handed-in files
  and his notes (`classroom_feedback_list`). For a team assignment it adds each
  team through `classroom_item_teams`, `classroom_team_grading` and
  `classroom_team_document_for`. **A FILE IS A LINK, NEVER BYTES**: each is
  signed AS HIM for `GRADING_LINK_SECONDS` through `signStorage`, so the bucket's
  own policy decides, and `read_answers` carries the same links. **WHO A PACKET
  CARRIES IS THE CLASS ROSTER**: an admin reads every row of a cross-posted
  assignment, so the class narrowing is the privacy line, and
  `tests/db/connector-grading.test.ts` holds it both ways (mutation proved).
  `grade` takes `grades` (many students, by score or by rubric criterion with
  `notes`, HELD unless `return`), each its own undoable write in one group so
  `undo_last` takes the batch back, and `returnHeld` returns what was held with
  the score it already has. A team assignment is graded by team through
  `classroom_grade_team` (a hand entry, asks first), never through `grade`.
- **AN EDIT NAMES ITS FIELDS (ledger 0438, gap 4353a482).** PostgREST cannot
  tell a field left out from one sent as null, so `classroom_update_item`
  (0311) takes `p_fields`, and an argument with `fill: fields` is filled by
  `site_call` with the names of the arguments he gave (never the post itself).
  `set_points` and `set_due` name their one field. Left null, the call is the
  item editor's full edit, unchanged. `tests/db/connector-edit-post.test.ts`
  replays the 2026-10-26 call that emptied a live post and reads every other
  column back.


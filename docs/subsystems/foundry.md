# IDEA Foundry

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). Student-published apps: data layer, gallery, review queue, serving routes, ingest, preflight, plays, curation. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

**FOUNDRY IS COMPLETE END TO END**: the data layer (0130/0131/0132), the
`foundry-ingest` function, the SERVING ROUTE that puts a bundle's bytes in
front of a browser, the submit surface (`/foundry/submit`,
`/foundry/mine`, `/foundry/contract`), the GALLERY (`/foundry`) and the REVIEW
QUEUE (`/foundry/review`, admin only), and since ledger 0360 the request board
(`/foundry/requests`), the trusted-publisher application (`/foundry/apply`) and
its review (`/foundry/review/publishers`, admin only). Several things about it
are rules rather than history.

**EVERY FOUNDRY PAGE IS `FoundryPage`, AND ITS `width: 100%` IS THE FIX FOR A
TRAP, NOT DECORATION (ledger 0360, reports R01/R05/R10).** Above 1024px the
gallery and the queue are full-height applications, so the page is an item in
`.fg-body`'s flex COLUMN, and `margin: 0 auto` with no width cancels the stretch:
the gallery shrink-wrapped to its 42rem lead paragraph (about 608px) at every
desktop size. `forge.css` points `--measure-split` at `--measure-console` on
`.fg-root`, so the page, the split and the masthead take the window in one
declaration, and the mosaic tops out at eight columns. `foundryIsApplication` in
`$lib/foundry/nav.ts` names exactly `/foundry` and `/foundry/review`; keyed more
loosely it put the author page in app mode and clipped its lower cards. Nothing
sits under the queue in that column (the trust roster lives on
`/foundry/review/publishers`), and the review area's admin gate is its own
`+layout.server.ts`.
  - **TWO PRESSES TO A GAME.** The idle `AppStage` is the app's cover with
    Launch app and Launch full screen on it; the second key calls `start()` then
    `enterFull()` in ONE click handler, so the request keeps its transient
    activation, and the overlay floor still applies when the API refuses.

**THE WHOLE FOUNDRY HAS ONE OFF SWITCH, AND IT REACHES THE APPS ORIGIN WITHOUT A
SESSION (ledger 0360, report R02, 0230).** `foundry_set_site_open` is admin-only,
on `/foundry/classes`, and separate from the per-class control; Off takes two
presses and On one. `foundry_section_access` projects `site_open`, `site_note`,
`site_closed_at` and `site_exempt`, and an ABSENT key reads as on. While it is
off a non-admin reads `FoundrySiteOff` in place of every portal page, an admin
keeps the room under a banner, the preview, download and starter routes answer
one shared 503, the gallery, request and author loads return empty payloads,
and `/a/` and `/b/` refuse EVERYONE an HTML document, because the apps host has
no session to exempt anybody with. That read is `foundrySiteClosed` in
`$lib/server/foundry-bundle.ts`, so the service-role census stays five: once per
instance per `FOUNDRY_SITE_CACHE_MS` (30s), for document paths only, a missing
relation read as open and any other failure answered with the bodyless 404 and
not cached. A running game's assets keep serving. `closed_by` is never projected.

**A CLASS'S FOUNDRY CLOSES BY ITS OWN SCHEDULE, AND "CLOSED" IS DERIVED AT READ
TIME (ledger 0380, report 84e293d4, 0237).** An instructor gives a class a weekly
pattern (days and times on the school clock, America/Los_Angeles) and date
exceptions (`foundry_class_schedule_set`, `foundry_class_schedule_day_set`); a
date with ANY exception row ignores the weekly pattern for that date, which is
how one odd day, no class, or an early open is said. `_foundry_section_closed`
is the one statement of "closed right now and why": the hand-pressed stamp
(`foundry_closed_at`, which stays until the teacher opens it) wins, otherwise a
scheduled window closes it unless the teacher opened it by hand for that
window (`foundry_open_until`, set by `foundry_set_section_open` and ending with
the window). Nothing is swept and nothing ticks, so a scheduled close never
needs undoing, and `foundry_section_access` is still the only reader the
students' surfaces ask. The schedule is a section manager's, "not yours" is "not
found", and every write refuses in words before it writes.

**A TRUSTED-PUBLISHER APPLICATION IS ANSWERS TO STORED QUESTIONS, AND APPROVAL IS
THE EXISTING GRANT (ledger 0360, report R03, 0230).** `foundry_publisher_decide`
approves through `foundry_trusted_grant`, so `foundry_trusted_publishers` keeps
one writer and no new flag exists. The student's question type carries no trick
field: `is_trick`, `flag_choices` and the reviewer note are admin projections
only. Questions are retired, never deleted, and every application stores a
snapshot of what it answered. `publisherCanSend` mirrors 0230's refusal order.

**THE GAME REQUEST BOARD MOVES NO COINS AND RENDERS TEXT ONLY (ledger 0360,
report R04).** A title, a message and an optional free-text offer, with
`FOUNDRY_REQUEST_OFFER_NOTE` beside every offer; no `{@html}`, no markdown, no
link. It never projects an address, its `hidden` key reaches only an admin and
the request's author, and Hide is handed to the board only for an admin.
`foundry_publisher_applications` and `foundry_game_requests` are each both a
table and an RPC; the tables carry no client grant, so PostgREST only reaches
the function.

**THE GALLERY, THE DETAIL VIEW AND THE REVIEW QUEUE ARE ONE RENDER PATH, AND
`FoundryDetail` HAS NO STAFF BRANCH IN IT.** `/foundry/review` mounts the
IDENTICAL `FoundryDetail` the gallery mounts and puts `FoundryInspector` in the
column BESIDE it -- it is not a second gallery with extra columns, and there is
no `staff` flag inside the detail component to forget. "What does a student see"
is answerable by reading that one file straight through. The only prop that
differs is `versionId`: the gallery runs `published_version_id`, the queue runs
the SUBMITTED version, which by definition is not published yet.
  - **`AppStage` IS THE LIFECYCLE AND `AppFrame` IS THE SANDBOX**, and both
    surfaces mount the same two. Nothing frames a bundle on load: a gallery that
    started every app in the list would run every app in the list.
  - **FULL SCREEN IS A CLASS ON THE STAGE, NEVER A SECOND FRAME.** The control
    beside Stop app puts `.is-full` on `AppStage`'s own element and then asks
    the Fullscreen API; the `<iframe>` is never unmounted and its `src` is never
    rewritten, so a running app keeps its state, its timers and its audio. THE
    OVERLAY IS THE FLOOR AND NATIVE IS THE UPGRADE -- the class goes on first
    and the API's rejection (iOS has no element fullscreen; every engine
    refuses without a gesture) costs nothing, so both paths land on the same
    layout and only the ESCAPE differs: native Escape is the browser's and
    works with focus inside the bundle, the overlay's is a keydown a focused
    cross-origin frame never delivers, so the VISIBLE control is the guarantee
    and the hint says which one this viewer has. Stop app stays on screen in
    both, because an app can still wedge and unmounting the frame is still the
    only way out of that.
  - **THE STOP CONTROL UNMOUNTS THE FRAME, AND NOTHING ON THAT PATH MAY USE
    `requestAnimationFrame`.** Measured against a bundle running `while (true)`:
    the child's heartbeat stops dead, the parent's `setTimeout(100)` fires at
    995ms (late but alive), and the parent's rAF NEVER FIRES. So the parent is
    degraded rather than unaffected -- what survives is the task queue, which is
    all a click handler and a synchronous state change need. A teardown
    scheduled on an animation frame would never run in exactly the case it
    exists for.
  - **THE SOURCE VIEWER SHOWS THE STORED BYTES, never the uploaded archive.**
    Ingest decides what comes out of a zip (a wrapper stripped, OS noise
    dropped, ignored extensions removed), so a reviewer reading the upload is
    reviewing something nobody will execute. The tree is built from
    `student_app_files`, which IS the serving route's allowlist.
  - **THE METADATA FLAG CANNOT SAY WHICH FIELD MOVED, AND MUST NOT CLAIM TO.**
    `metadata_flagged_at` is a timestamp; there is no metadata history table and
    the version manifest carries build facts only. The panel reports the two
    timestamps that ARE known and names the fields capable of having moved. A
    per-field diff is a migration, not a rendering decision.
  - **A REJECTION NEEDS A CATEGORY AND A NOTE.** The note is the DATABASE's rule
    (0130 raises without one); the fixed reason list is the console's, so
    rejections are countable and read the same in front of two reviewers. One
    predicate (`reviewCanSend`) drives both the control and the handler --
    two spellings of "is this ready" is what produces a click that does nothing.
    The control is `aria-disabled`, never `disabled`, so it can explain itself.

**HIDE AND DELETE ARE TWO DECISIONS AND NEITHER MAY ABSORB THE OTHER.**
`foundry_set_app_hidden` (0130) is ADMIN ONLY and shelves: off the gallery, off
the serving route, files intact, reversible by the same call with `false`.
`foundry_delete_app` / `foundry_delete_version` (0136) are the OWNER's as well
as an admin's and are real deletion, with no undo and nothing to restore from.
One "remove" verb would be either a delete a student cannot trust or a hide
staff cannot reverse, so the review console renders the two as a definition list
and states the difference in words. Both confirm in two steps and the delete
confirm names the app.
  - **THE OWNER IS THE HALF THAT MATTERS.** Before 0136 there was no path of any
    kind by which a student could remove their own app. Deleting your own app
    takes its PUBLISHED version with it, because the thing being removed is the
    app; deleting a single version is refused for the published one, for an
    admin too, because what that would leave behind is a live app pointing at a
    version that does not exist. `versionIsDeletable` mirrors that rule so no
    control is offered whose only possible answer is a refusal, and the live row
    SAYS why rather than merely lacking a button.
  - **A HIDDEN APP IS NOT THE OWNER'S TO DELETE.** 0130 already refuses their
    EDIT of one; a hidden app is under discussion with staff, and the refusal
    names who to ask. An admin can delete it and an admin can restore it.

**ROWS FIRST, THEN OBJECTS, AND A FAILED SWEEP IS NOT A FAILED DELETE.** There
is no transaction between Postgres and Storage, so one write can land alone and
something has to be the acceptable failure. Objects-first leaves a LIVE APP
whose every file 404s, which reads as a corrupted upload and which the student
finds. Rows-first leaves an ORPHANED OBJECT: bytes in a private bucket that no
row names, that nothing serves (the serving route's allowlist IS
`student_app_files`) and that no client can list. So the RPC deletes the rows
and RETURNS the paths it just orphaned -- they only exist while the rows do --
and `POST /api/foundry/delete` sweeps them with the service role.
  - **`ok` IS TRUE THE MOMENT THE RPC RETURNS.** A partial sweep adds
    `storageProblem`, a sentence shown beside the confirmation, and a server log
    line naming every survivor, which is the only remaining record of them.
    Reporting a completed delete as an error is how somebody presses it again.
  - **THE ROUTE IS NOT THE AUTHORIZATION BOUNDARY**, even though it holds the
    key: it calls the RPC on `locals.supabase`, the CALLER's own client, so
    `auth.uid()` and `is_admin()` are the real thing and the service role only
    ever removes paths the database itself just handed back. It exists because
    `foundry-bundles` has no storage policy (no browser client can delete a
    bundle byte) and the other two buckets' policies are pinned to `auth.uid()`
    (an admin deleting a student's app cannot satisfy them).
  - **THE SWEEP RE-LISTS RATHER THAN PARSING `remove()`'s ANSWER.** Matching a
    returned `FileObject[]` back against the keys sent would fail silently in
    one of two directions, and a claimed clean sweep is unrecoverable once the
    rows that named the objects are gone. It removes, then LISTS again and
    reports what is still there. It lists the bundle PREFIX rather than the
    rows, which is strictly more complete: a half-finished ingest leaves objects
    no row ever named.

**THE REVIEW LOAD ASKS FOR HIDDEN APPS, AND MUST KEEP DOING SO.** Hiding is
reversible, but a hidden app is on no other surface -- not the gallery, not its
owner's list, not the queue -- so without `p_include_hidden` the Hide control is
a ONE-WAY DOOR with a Restore nothing can ever be selected to press. `queueOrder`
still filters on `submitted_version_id`, so the queue is unchanged; the shelved
apps get their own list below it, and a queue row that is ALSO hidden carries a
shelved chip, because hiding does not move a version's status and deciding about
a shelved app without knowing it is shelved is the trap. The widening is not the
route's to grant: `_foundry_app_in_population` gates both flags on `is_admin()`
inside itself.

**A BUNDLE URL CARRIES NO TOKEN, AND THE PUBLICATION GATE IS THE VERSION'S OWN
STATUS.** `foundryBundleUrl(appsOrigin, appId, versionId)` is the whole frame
src -- `<apps origin>/b/<app id>/<version id>/` -- plain, stable, unexpiring,
and safe to log, screenshot and paste into a bug report. `serveBundleFile` in
`$lib/server/foundry-bundle.ts` decides on every request whether to answer --
**a version serves when it is the app's `published_version_id` OR its status is
`submitted`**, and never when the app is hidden.
  - **`submitted` IS WHAT REPLACED THE REVIEW-KIND TOKEN.** The queue has to RUN
    the build it is deciding about, and a submitted version is by definition not
    the published one. The old design signed an admin's licence into the token
    bytes; the licence now comes from the row. It costs one thing -- a student
    who knows their own version uuid can hand somebody a link to a build that is
    submitted but unapproved -- and buys immediacy: a DRAFT and a REJECTED
    version, a rolled-back one and a hidden app all stop serving in the same
    statement that changes them, where a thirty-minute token could not.
    Verified in both directions against the real RPCs and the real function.
  - **DO NOT REINTRODUCE A SIGNED TOKEN TO NARROW THAT.** It is the machinery
    this lane removed, and the narrowing it buys is one link a student could
    equally send as a zip. If the exposure ever has to close, close it by
    dropping `submitted` from the gate and giving the queue a different way to
    run a build -- not by putting a signature back on every request.

**THERE ARE TWO MOUNTS AND THEY DIFFER ONLY IN WHERE THE VERSION ID COMES FROM.**
`/b/<app>/<version>/` is the FRAME src and names a build, because its callers
are deciding about one. `/a/<app>/` is the DIRECT PAGE -- `foundryAppUrl`, the
whole document, no iframe and no chrome -- and names an APP, resolving
`published_version_id` per request through `publishedVersionOf`. Everything
downstream of that one difference is `$lib/server/foundry-bundle-response.ts`,
which both routes call: the host gate, the publication re-check, the header set,
the shim injection, the trailing-slash repair and the one bodyless 404.
  - **A SECOND COPY OF THE HEADER SET IS A PAGE THAT ISOLATES NOTHING WHILE
    LOOKING IDENTICAL.** The CSP `sandbox` directive is what puts a DIRECTLY
    NAVIGATED bundle in an opaque origin -- the iframe attribute needs a frame
    to be on -- so a route that served the same bytes with a weaker policy would
    render perfectly and run a student's document with full rights on a host of
    ours. `tests/foundry-app-route.test.ts` therefore asserts the two responses'
    header sets are EQUAL rather than listing what they should contain: a header
    added to only one of them reddens.
  - **THE OBVIOUS NAME FOR THAT MODULE IS TAKEN.** `$lib/server/foundry-serve.ts`
    is a deleted module of the token proxy and `tests/foundry-bundle-url.test.ts`
    sweeps the tree for it. Do not rename the responder to it.
  - **`/a/` IS STRICTLY NARROWER THAN `/b/`: IT NEVER SERVES A SUBMITTED BUILD.**
    `/b/` does, because the review queue has to run the thing it is deciding
    about. An app's own public address does not, and `publishedVersionOf` reads
    one column and cannot return one.
  - **THE PATH SHAPE IS HOW RELATIVE ASSETS RESOLVE, AND INJECTING A `<base>`
    IS STILL NOT THE ANSWER -- FOR A DIFFERENT REASON THAN THIS RULE USED TO
    GIVE.** The document is served at `/a/<app>/`, so `style.css` resolves to
    `/a/<app>/style.css` and arrives at the same handler. This rule used to say
    a `<base>` CANNOT work, because the CSP carried `base-uri 'none'` and the
    browser ignored the element outright. **That is no longer true and must not
    be restated**: `base-uri` names the bundle origin and `https:` now, so a
    `<base href>` a STUDENT ships is honoured. What rules out injecting one
    OURSELVES is the byte rule, which never depended on the CSP -- ingest, the
    source viewer and both serving routes all agree that a stored byte is served
    back unchanged, so a reviewer reads what executes, and a route that rewrote
    the entry document would end that. A redirect to `/b/<app>/<version>/` was
    the other rejected shape -- it leaves the VERSION URL in the address bar, so
    a bookmark or a re-paste of what is on screen carries a link that dies at
    the next publish.
  - **THE DIRECT PAGE IS PUBLIC AND IS NOT MISSING A SESSION CHECK.** There is
    no session on the apps host to check -- that absence is the point of the
    split -- so requiring one means either `Domain`-scoping the portal's cookies
    onto that host or putting a signed token back on every request. Anyone
    proposing a gate here answers that first. **WHAT IS PUBLIC IS THE WORK, NOT
    THE STUDENT**: the route reads one column of the app row and the version's
    files, and never the author, the class, the build notes, the description or
    the version list. Those are gallery surfaces and the gallery is signed in.
    A field added to this route's read is a disclosure decision.
  - **THE SHARE CONTROL SAYS SO IN WORDS, BEFORE THE LINK, AND IT IS ONE
    COMPONENT.** `FoundryShare` renders the URL as selectable text beside a copy
    control, and states that anyone with it can open the app without signing in
    and that the page carries no name, class or build notes. A student should
    know what they are handing over before they hand it over. **The gallery
    (`FoundryDetail`) and `/foundry/mine` both mount it** -- a student wants
    their own link more than a visitor does -- so the publication rule, the
    sentence and the copy handler cannot drift apart between them. The sentence
    is the half that matters: a surface that quietly lost it is one where a
    student shares something without knowing what is on it. It keys on
    `published_version_id` and NOT on the version being SHOWN (the review queue
    shows the submitted one); a hidden app and an unset
    `PUBLIC_FOUNDRY_APPS_ORIGIN` each get no link at all, because `/a/` refuses
    one and a control whose only outcome is a refusal must not be offered.

**THE STUDENT HANDS OVER ONE OF THREE SHAPES AND THE BROWSER MAKES THEM ALL A
ZIP** -- a `.zip` passes through untouched, a folder is zipped client-side, a
single HTML file is packed as `index.html`. `src/lib/foundry/normalize.ts` does
it and `src/lib/foundry/zip-write.ts` is the writer, which is the deliberate
mirror of `zip.ts`'s reader. The point is that `foundry-ingest` keeps ONE input
shape, so every structural assertion already proven against it stays proven;
teaching the function two more shapes would mean re-proving all of them twice.
  - **NORMALIZING JUDGES NOTHING.** It decides what was handed over and packs
    it; whether the result is a legal bundle is the preflight's question, asked
    afterwards on the zip it produced. That separation is what stops
    "normalize" becoming a second, softer copy of the rules.
  - **THE WRAPPER DIRECTORY IS NOT STRIPPED THERE.** `stripWrapperDirectory`
    inside `planStructure` is the ONE implementation of that repair and it runs
    on both sides; doing it again while packing would be a second copy that
    could stop agreeing about when it applies. A picked folder therefore
    carries its own name into the zip and the preflight reports removing it,
    exactly as it does for a right-click-Compress archive.
  - **FOLDER NOISE IS A WIDER SET THAN ZIP NOISE, AND THE TWO PREDICATES STAY
    APART.** `isOsNoise` is what a zipper added unasked and is dropped on both
    paths; `folderNoiseLabel` adds `.git` and `node_modules`, which only a
    dragged development folder carries. Folding them together would change what
    the SERVER does with an uploaded zip, where `node_modules` means the student
    zipped the wrong folder and the honest answer is the refusal they already
    get. Every drop is reported by category, never silently.

**THE NETWORK IS NOT A PREFLIGHT RULE, AND UNDOING THAT IS THE EASY WRONG
INSTINCT.** A bundle is served with no `connect-src` restriction, so a CDN
script, a Google Fonts stylesheet, a remote ES-module specifier and a `fetch`
all WORK. `classifyReference` returns `ok` for http, https and the
protocol-relative form; `scanJs` no longer mentions `fetch`, `XMLHttpRequest`,
`WebSocket` or `EventSource` at all. React and Babel from unpkg -- which is
what a student's AI tool writes when asked for a React app -- is the ORDINARY
case, and refusing it taught a student only that the platform is arbitrary.
  - **WHAT STILL REFUSES IS CONTAINMENT, NOT REACH**: a path starting with a
    forward slash, a `..` that climbs out, a scheme that is neither the web nor
    an inline value (`file:`, `ftp:`), a disallowed extension, and the caps.
  - **THERE IS NO ALLOWED ABSOLUTE PATH ANY MORE, INCLUDING THE ONE THERE USED
    TO BE.** `/_platform/fonts.css` resolved while bundles came off a host of
    ours; they come off the Supabase project host now, where a leading slash
    resolves to Supabase. So the exception is GONE and the contract names the
    whole URL (`FOUNDRY_PLATFORM_ORIGIN` in `preflight.ts`), with a refusal
    message that hands the URL back to anyone who wrote the old form. The route
    moved to the MAIN host and serves `access-control-allow-origin: *`, which
    is load-bearing rather than decorative: an opaque origin makes even a
    same-host font fetch cross-origin, and a `@font-face` request is CORS-mode
    by specification. Measured in a real browser from a genuine opaque origin
    -- the sheet loads, `cssRules` throws `SecurityError` (so it really is
    cross-origin), and `document.fonts.check('16px Rajdhani')` is true.
  - **STORAGE DID NOT RELAX AND IS THE ONE WARNING LEFT.** `localStorage` still
    throws in an opaque origin, so touching it earns a warning naming the shim
    and the entry file. It is a WARNING and not a refusal, and it is
    unconditional -- the sentence also says nothing survives a reload, which is
    true of a correctly shimmed app too, so suppressing it by detecting the
    shim would trade a true sentence for a heuristic.

**THE BUILD CONTRACT IS GENERATED FROM THE PREFLIGHT CONSTANTS, IN
`preflight.ts` ITSELF** (`foundryBuildContract()`), and rendered at
`/foundry/contract`. Every cap, the extension list, the entry filename, the
platform fonts URL and the storage shim are read from the values and the module
the checks actually use, so a rule change rewrites the document in the same
commit. **Do not write the contract down anywhere else** -- a second statement
of the rules is the one that drifts.
**THE "EXTRA FILES" PARAGRAPH IS SORTED BY PUTTING EACH CANDIDATE THROUGH THE
REAL PREDICATES**, so the document cannot claim an outcome the code does not
produce. It used to read "Do not produce a README, a package.json, a lockfile,
a config file, or a build script. They are not used and several of them are
refused" -- vague, and also WRONG: `package.json` and `package-lock.json` are
`.json`, which is on the allowlist, so they upload perfectly happily and a
student who deleted them on that advice deleted them for nothing.

It is addressed to an AI TOOL rather than to a reader, because that is what will
be pasted it; imperative, specific, and using the same spellings the failure
messages use.

**A FOUNDRY AUTHOR'S CLASS COMES FROM THE ROSTER, PROJECTED INSIDE THE DEFINER
(0132), AND NEVER FROM `profiles.section_id`.** `foundry_list_apps` and
`foundry_get_app` return `owner_class`: the TITLE of the author's IDEA course,
or NULL. Both tables behind it stay shut -- `profiles` is own-row-or-admin and
`classroom_enrollments` is own-rows-or-manager -- so a student browsing the
gallery learns a name and a class and gains no other reach.
  - **`profiles.section_id` IS REFUSED FOR THIS, AND IT IS THE EASY WRONG
    ANSWER** because it sits on the row these functions already join. 0003 added
    it as a value the student SELF-SELECTS, free-form text, "intentionally not a
    FK", validated by nothing. Rendering it under a published app presents a
    student's own claim as a roster fact. It must not appear on any Foundry
    surface.
  - **NULL IS A NORMAL ANSWER AND RENDERS AS NOTHING** -- no placeholder, no
    fallback, no empty label. An app outlives an enrollment, a roster import
    lags a term, a student transfers, an alumnus keeps a published app.
  - **WHICH COURSES COUNT IS A PREDICATE, `_foundry_is_idea_course(code)`, AND
    A PINNED CONSTANT IS THE WRONG SHAPE.** The code, uppercased and
    whitespace-stripped, begins with IDEA. That covers `IDEA209H` and
    `IDEA 100` (the space is INSIDE the code, so `btrim` does not touch it) and
    every `IDEAnnn` the A-G work adds later, with no second migration. **What
    breaks it is an IDEA course whose code does not START with IDEA**, and it
    breaks SILENTLY -- the student simply projects null -- which is why 0132's
    last section prints the codes it matched at apply time. The rejected
    alternative was the one 0132 shipped with first: a constant `'IDEA'`,
    matching NEITHER real course, so every author would have projected null and
    the gallery would have shown no class for anyone.
  - **A STUDENT MAY HOLD TWO IDEA ENROLLMENTS, SO THE RESOLUTION IS A TOTAL
    ORDER**: prefer a course still `active`, then the most recent enrollment by
    its OWN `created_at`, then the section's `created_at`, then `s.id`.
    `created_at` and NOT `updated_at`, because every roster upsert stamps
    `updated_at` and re-importing last year's file would make last year's class
    the newest. The section fallback is load-bearing rather than defensive:
    `now()` is TRANSACTION time and a roster import writes a whole file in one
    transaction, so two enrollments from one import tie exactly. A card must not
    change its class between two page loads.
  - **THE COURSE `active` FLAG IS A PREFERENCE; THE ENROLLMENT `active` FLAG IS
    A FILTER.** A roster row says whether the student is still in the class (0082
    soft-deletes by clearing it); a retired course says the school stopped
    teaching it, which is not a claim about whether they took it.
  - **IT PROJECTS THE COURSE TITLE, NEVER THE SECTION LABEL AND NEVER THE
    BLOCK.** "Engineering I Honors" means something to someone browsing a
    gallery; "Block 3" is internal scheduling, tells a viewer nothing, and does
    not even distinguish two IDEA courses from one another.
  - **THE uuid/email BRIDGE IS `_notebook_email_for_user`, THE 0094 ONE.**
    `student_apps.owner` is a uuid and enrollments are email-keyed. That helper
    is a pure lookup with no notebook in it; its prefix says where it was born,
    not what it does, and copying it under a `_foundry_` name would be a second
    implementation of the one mapping this codebase is most careful about. No
    view, ever -- a granted email-to-uuid view is a school directory.
  - **THE NAME IS `display_name` WHEN SET, `full_name` OTHERWISE, NEVER BOTH,
    and `foundryAuthorName` is the ONE implementation.** Do NOT use
    `displayName()` from `$lib/profile` on a Foundry surface: its third rung is
    the EMAIL ADDRESS, which on a gallery every signed-in student can read is a
    disclosure. Sampled against production, ten students, none had chosen a
    display name -- so `full_name` is the NORMAL path and not an exceptional
    fallback, which makes the first rung the one dropped by accident and the
    third the one added by accident. `tests/foundry-author-name.test.ts` pins
    both directions and sweeps every Foundry surface for that import.
  - **A NULL NAME OR CLASS RENDERS NOTHING, AND THE SEPARATOR LIVES INSIDE THE
    BRANCH.** `foundryAuthorLine` joins them only when both are there; written
    inline at two call sites, that expression is where a card ends up reading
    "Ana Reyes ·".

**THE JS SCANNER READS INLINE `<script>` BLOCKS TOO, AND IT IS ONE SCANNER.**
`scanJs` only ever saw `.js` files, which meant every JavaScript rule was
switched off for the submission shape where ALL the JavaScript is inline -- a
single HTML file, which is now first-class and will be the most common upload.
`scanHtml` feeds it the body of every `<script>` WITHOUT a `src` (the ones with
a `src` are already judged as references) and hands it a LINE OFFSET.
  - **THE OFFSET IS A PARAMETER, NOT A SECOND SCANNER.** It moves the number
    INSIDE the sentence, not just the `line` field: the messages are built from
    `where(path, line)`, so a caller correcting only the field would leave a
    student reading a line number and looking at the wrong line.
  - **THE BLOCK IS LOCATED OVER A CARRIAGE-RETURN-STRIPPED COPY OF BOTH SIDES.**
    An HTML parser normalizes CRLF to LF in the DOM, so on a file saved by a
    Windows editor the text the parser returns is not a substring of the source
    and every lookup fails silently. Line numbers are counts of `
`, so
    stripping the carriage returns cannot move one.
  - **A CALL AT COLUMN 0 USED TO BE REPORTED ONE LINE EARLY, IN `.js` FILES
    TOO.** The patterns open with `(?:^|[^\w$.])` so `prefetch` and `this.fetch`
    do not match, which makes the match START at the character before the call --
    and at column 0 that character is the previous line's newline. Measured: a
    `fetch` on line 3 answered "app.js line 2". Statements at column 0 are most
    of the statements anybody writes, so it was wrong more often than right. The
    lookup now uses the identifier's own index.

**AN EXTENSION IS ALLOWED, IGNORED, OR REFUSED, AND THE THREE ARE DIFFERENT
DECISIONS.** `FOUNDRY_ALLOWED_EXTENSIONS` is served; `FOUNDRY_IGNORED_EXTENSIONS`
is dropped on the way in with a note, exactly as `isOsNoise` is; everything else
stops the upload.
  - **`.ico` IS ALLOWED.** A favicon is inert, every scaffold emits one, and
    refusing an upload over it teaches a student only that the platform is
    arbitrary.
  - **`.md` IS IGNORED, NOT REFUSED.** A README is among the most common things
    a generation tool emits and it cannot execute or be served, so failing a
    whole upload over one is the wrong trade.
  - **KEEP THE IGNORED LIST SHORT AND INERT.** An extension belongs there only
    if dropping it changes nothing about the app. A `.ts` or a `.scss` is a
    SOURCE file and a bundle carrying one means the student shipped the wrong
    folder -- that stays a refusal, because the refusal is what tells them. An
    extension may never be on both lists: one branch would be unreachable and
    nobody would know which.

**A REFUSAL IS RENDERED VERBATIM, AND FIXING ITS WORDING MEANS EDITING
`preflight.ts`.** `FoundryIssues.svelte` never rewrites, shortens or re-tones a
sentence -- the same string is produced by the browser preflight and by
`foundry-ingest`, and a student reads one of them before uploading and the other
after. Each message is copyable on its own and the list is copyable at once,
because the next thing that happens to a failure is being pasted back into
whatever generated the app.
  - **THE SENTENCES ALREADY CARRY THEIR OWN LOCATION.** Nearly every one starts
    from `where(path, line)` and the structural ones lead with the filename, so
    a surface adding a file/line chip beside them prints it twice -- and a copy
    button that prefixes it again puts the stutter on the clipboard. `locationOf`
    adds a location only to the issues whose sentence lacks one.
  - **AN EXAMPLE IN A MESSAGE MUST BE VALID IN THE LANGUAGE IT WILL BE PASTED
    INTO.** `relativeExample` returns `url("bg.png")` for a CSS refusal and
    `src="logo.png"` for an HTML one. It returned the attribute form for both
    until the browser pass put `url="bg.png"` on screen -- offered to a student,
    inside a stylesheet, as the thing to write instead.
  - **TWO STUDENT-FACING SENTENCES LIVE IN THE INGEST FUNCTION, AND THEY ARE
    PINNED BY TEXT** in `tests/foundry-preflight-parity.test.ts`: a storage
    object gone missing between upload and invoke, and a file the function could
    not decode. Both describe moments the browser never reaches. A THIRD one
    reddens that sweep and has to earn its place.

**PREFLIGHT PASSING IS NOT SUBMISSION.** A pass uploads the zip, creates the
version and runs ingest, and the version stays a DRAFT; submitting for review is
a separate, deliberate press, offered on `/foundry/submit` once ingest succeeds
(the optional `submitVersion` transport) and still available on `/foundry/mine`.
It is never a side effect of the upload finishing. The surface says so in words,
because a student who reads "uploaded" as "submitted" walks away believing a
review is queued when nothing is.

**THE UPLOAD PATH IS KEYED TO A PER-UPLOAD UUID, NOT TO THE VERSION ID, AND
THAT IS FORCED.** `foundry_create_version` takes the zip path as an INPUT, so
the row -- and therefore its id -- does not exist until after the object has to
be named. The path is `<uid>/<uuid>.zip`, which is what the bucket policy allows
and is one-to-one with the version it becomes. Changing it to the version id
means changing that RPC's signature, which is a migration.

**`foundry-bundles` HAS NO STORAGE POLICY, AND THAT IS THE MECHANISM** --
`storage.objects` has RLS on, so a bucket no policy names denies every
`authenticated` and `anon` request by default and only `service_role` reaches
it. Any policy added there, for any reason, is what opens it; the serving route
reads it server side with that key. **MAKING IT PUBLIC IS THE OBVIOUS WRONG
ANSWER AND WAS TRIED**: it would put every extracted version -- drafts,
rejected builds, superseded builds, the builds of hidden apps -- one guessed
pair of uuids from the open internet, and it does not even work (see the
Storage `text/html` rule below). And **LIVENESS GOES THROUGH
`_foundry_app_in_population` AND
NOTHING ELSE** -- a new read of `student_apps` calls that predicate rather than
writing its own `hidden_at is null`, and its two widening flags are gated on
`is_admin()` inside the function, which is why the admin populations are a
parameter on one list rather than a second list function.

**EVERY FOUNDRY PLAY FIGURE IS PLAYS THROUGH THE PORTAL, AND THE HOLE IS
STRUCTURAL (0139).** A play started from an app's own direct address,
`/a/<appId>/`, is NOT COUNTED: that route is the whole document with no iframe,
no portal chrome and no session, so there is nothing of ours on the page to see
it -- and there cannot be without either injecting a script into a student's own
document (the byte rule forbids it: a stored byte is served back unchanged, so a
reviewer reads what executes) or scoping the portal's cookies onto the apps host
(the one thing the origin split exists to prevent). **A shared link opened by
fifty people adds nothing to any count.** So every surface that renders a figure
renders `FOUNDRY_PLAY_COVERAGE_NOTE` beside it, zero included -- a zero is
exactly when somebody reads a count as "nobody opened it". This rule was written
down ONLY in the migration's header, which is the one place nobody reads; it is
a rule and not history because it qualifies every number the feature will ever
show.
  - **A REVIEW RUN IS NOT A PLAY, AND IT IS EXCLUDED TWICE OVER**, so opening one
    layer leaves the other closed. `/foundry/review` hands `AppStage` NO
    recording transport at all -- absence is the mechanism here, exactly as it is
    for every other omitted transport -- and `foundry_play_start` accepts ONLY
    the app's `published_version_id`, so a draft the owner is testing and a
    submitted build are both refused by the database. The CLIENT half is the one
    that regresses silently: adding a transport "for consistency" does not throw,
    does not fail a type check and does not look wrong on screen, which is why it
    has a sweep with a positive control.
  - **NOBODY READS ANOTHER NAMED STUDENT'S PLAY DATA, ADMIN INCLUDED, AND THAT
    IS TWO INDEPENDENT REFUSALS.** `student_app_plays` has RLS enabled with NO
    POLICY and NO GRANT to `anon`, `authenticated` or `service_role`; either
    alone denies every select. There is no function, view, policy or grant that
    returns another person's play ROW to any client. **This rule used to say NO
    PER-PLAYER READ EXISTS FOR ANYONE and that `foundry_app_play_stats` returns
    NULL for a non-owner. `0204` ended both halves on Mr. Pina's answer to
    decisions 05 and 07**, and the sentence that replaces them is narrower and
    is the one to hold on to: **PUBLIC MEANS AGGREGATE.**
    - **`foundry_app_play_stats` IS GATED ON THE POPULATION NOW, NOT ON THE
      OWNER.** All three formerly owner-only metrics -- `players`,
      `seconds_played`, `last_played_at` -- answer any signed-in caller who can
      see the app. (`plays`, the fourth scalar, was never owner-only;
      `foundry_play_counts` has answered it since 0139.) **Decision 07's title
      says "the two owner-only metrics" and there are THREE**, which is the
      thing to check against before touching this: widening two and leaving one
      passes every assertion phrased over the object as a whole. The gate is
      `_foundry_app_in_population(..., true, true)`, so an UNPUBLISHED app is
      still its author's alone and a HIDDEN one still an admin's, and an app
      outside the population answers identically to one that does not exist.
    - **`foundry_my_play_stats(p_app_id)` IS THE ONLY CALLER-SCOPED DOOR AND IT
      TAKES NO IDENTITY PARAMETER**, so "can only read their own" is a property
      of the SIGNATURE rather than a check that could be got wrong. A parameter
      added there is the whole boundary, not a convenience.
    - **THE n=1 CASE IS ACCEPTED, EXPLICITLY, AND IS NOT TO BE REOPENED.** On an
      app one person has played, "1 player, last played 3:47pm" identifies when
      that student played. Mr. Pina was asked precisely this on 2026-09-12 and
      said it is fine. **Do not add a threshold, a floor or a rounding scheme**;
      `docs/decisions/entries/07-*` carries the acceptance so the next session
      does not raise it again.
    - What an admin has that an author does not is still OTHER APPS, never more
      detail about one person.
    - **AN AGGREGATE OVER ONE APP AND A COLUMN OVER EVERY APP ARE TWO
      DIFFERENT DISCLOSURES, AND `0221` IS WHERE THAT LINE IS DRAWN.**
      `foundry_play_counts` gained `seconds_played` and `plays_prev_7d` and
      deliberately has **NO `players` COLUMN**. The per-app door
      (`foundry_app_play_stats`) answers a distinct player count for ONE app
      the caller named, which is what decision 07 opened; a cross-app one
      would let a reader SCAN a whole gallery for the apps with exactly one
      player, and on those apps `seconds_played` IS one named student's
      playtime. The n=1 acceptance was about somebody opening one app, never
      about handing out the list of every app where n is 1. `0221`'s own
      apply-time guard raises if the column ever appears, and
      `tests/db/foundry-play-boards.test.ts` asserts the absence with the
      per-app read as its positive control.
  - **THE GALLERY IS ONE LIST WITH ONE SORT CONTROL AND ONE CURATED SECTION,
    AND THERE ARE NO RANKED SECTIONS AND NO BOARD PAGE** (decision 39,
    `docs/decisions/entries/39-*`, narrowed, not reversed, by Mr. Pina's
    report 927b1c69 of 2026-10-07).
    This rule used to read "THE GALLERY'S RANKED SECTIONS ARE THE
    LEADERBOARDS": 0221 answered reports 30 and 32b with up to four
    sideways-scrolling "boards" above the list, and Mr. Pina filed that on
    2026-09-25 as dead space and a stack of scrollbars and asked for one
    drop-down that sorts every app. The dead space had a cause worth keeping:
    a card is its cover's own shape, so one portrait cover in a flex ROW made
    the whole row tall; the multicol mosaic has no rows to lock.
    `FOUNDRY_GALLERY_SORTS` is every order, in the order the native `<select>`
    lists them (Most played first; the default is still its own constant,
    `FOUNDRY_GALLERY_DEFAULT_SORT`, per decision 04), and every one is
    `sortGallery`'s OWN ranking -- one comparator, never a second ranking
    implementation over the same counts. A new order is an arm in
    `foundrySortScore` plus an option; it is never a new page or a new section.
    The order stays out of the URL (decision 04).
    - **MAJOR RELEASES IS THE FIRST CURATED SECTION, AND IT IS AN ADMIN'S
      CURATION OF AN APP, NOT A RANKING AND NOT A PERSON.** `foundry_set_app_major` (0233) is
      the one writer: `is_admin()`, no identity parameter, idempotent both ways
      (`changed: false`), structured refusals `not_found`, `hidden` and
      `not_published` (unmarking is always allowed; hiding keeps the flag), and
      it NEVER moves `updated_at`, because curation is not an edit and
      `updated_at` is what Recently updated and the list's own order read.
      `major_release_by` is a uuid because `student_apps` carries a table-wide
      select grant, and no function projects it. The section is the SAME
      multicol mosaic (`foundryMosaicStyle`) under its own class,
      `fdy-gal-major-grid`, so `.fdy-gal-mosaic` still means the full list to
      every probe; its cards are `ordered.filter(isMajorRelease)`, so the one
      control orders both; it renders only while it has a card, the gallery is
      not empty and nobody is searching; and the full list under "All apps"
      still holds every app, a marked one badged. The control is
      `FoundryInspector`'s alone, offered only with `setMajor` AND a payload
      carrying the key (`majorReleaseReady`: absent is "cannot tell", never
      "no"). IDEA GREENLINE and VANGUARD are link cards (`FoundryHouseCard`,
      `foundryHouseReleases` over `PORTAL_APPS`, never an admin-only entry) that
      reach the gallery only through the `houseReleases` prop the /foundry
      route passes; they are outside the sort, the search and every count.
    - **THE GALLERY HAS TWO MORE CURATED SECTIONS, AND NEITHER IS A RANKING OR A
      NEW PAGE (ledger 0380, reports 415af89e and 762bb647).** Directly under
      Major releases sits the FEATURED row: an admin's hand-picked, ordered list
      (`foundry_featured_set`, at most 12, never a rank), with any spare slots
      (up to six in all) filled in the client from the top of Most played and
      Trending (`foundryFeaturedRow`), skipping an app nobody has played or
      voted on. **SINCE LEDGER 0381 THE FILL RUNS WITH NO PICKS TOO** (decision
      63, amending 59's default): a gallery nobody curated still leads with its
      most played and rising apps, and a gallery with no plays and no votes has
      no row, because a tied list has no top. Under it sit the
      COLLECTIONS: `foundry_collection_save` and its siblings (admin-only,
      published or not, reorderable, really deletable because a collection is
      curation and its members are only references), each published one drawn
      as ONE card that opens to its members (`FoundryCollectionCard`, the
      members being the identical cards the rest of the gallery draws). EVERY
      LAYER NAMES A CARD BY A SUBJECT (`app:<uuid>` or `house:<id>`,
      `$lib/foundry/gallery-extras.ts`), the same string in the database and the
      client, and a subject whose app is hidden or unpublished is not drawn
      (`_foundry_subject_visible` and `resolveSubjects`, two layers, so hiding
      an app needs no cleanup anywhere). An admin's card details
      (`foundry_gallery_override_set`: title, description, thumbnail, each null
      meaning "the default") change what a CARD says and never the student's
      app record, the detail pane or the search; a thumbnail is a path in
      `foundry-covers` uploaded into the admin's own folder, so no storage
      policy was added. The editors are one page, `/foundry/review/gallery`,
      behind the review area's admin gate. **Each layer is read through a
      call that fails to `null` on a database without 0237, and a null layer
      draws nothing**; an EMPTY layer also draws nothing, and the admin page
      says "not available yet" only for null.
      - **A COVER IS AN OVERRIDE TOO: A PICTURE, AN HTML COVER, OR NEITHER
        (ledger 0422, migration 0291, feedback 1cc58a6e).** `foundry_cover_set`
        builds on the same layer and never touches the student's record. The
        editor (`FoundryCoverEditor`) opens from the card inside the gallery's
        staff wrapper; `FoundryDetail` keeps no staff branch. An HTML cover is
        never served from the portal: it is the apps-origin route
        `/c/<app id>` (`FOUNDRY_COVER_HTML_PREFIX`, `foundryCoverHtmlUrl`),
        read through `foundry_cover_html` as an anonymous caller, which answers
        only for an app the gallery shows. The card frames it with the same
        `FOUNDRY_COVER_SANDBOX` (`allow-scripts`, never `allow-same-origin`),
        out of the tab order, and a click inside it still opens the card
        because the window's focus moves to the frame. **A cover that never
        takes focus (its own CSS sets `pointer-events: none`) opens nothing
        when its picture is clicked**; the name plate and keyboard focus still
        do. The connector sets covers through `set_foundry_cover`
        (`/api/admin/files/foundry-cover`) or `foundry_cover_set`. The CSP and
        the serving gate are the origin split's (`docs/subsystems/origin-split.md`).
    - **VOTES ARE ONE PER PERSON PER GAME, AND NO READ NAMES A VOTER (ledger
      0380, report 8274b260).** `foundry_vote` takes no identity parameter, takes
      1, -1 or 0 (take it back), refuses your own game and any game the gallery
      would not show with one shape of refusal, and `foundry_vote_counts` returns
      net, net in the last seven days and the caller's own vote and NOTHING
      split: no up count, no down count, no voter count, because a column over
      every app is the n=1 scan 0221 refused for players. The table has no
      grant and no policy. Net votes ride in `FoundryPlayCounts`
      (`foundryMergeVotes`), feed the Most liked order and add this week's net
      to the Trending rise; Most liked is not a play order, so the play
      coverage note does not sit beside it.
    - **"TRENDING" IS A FORMULA AND NOT A WORD:** plays in the last seven days
      MINUS plays in the seven before that, PLUS the net of this week's votes
      (`foundryTrendScore`). A RISE, not a
      level -- "Most played" is already the all-time level and "Played this
      week" is already the recent one, so an order ranking on either is a copy
      of one of them under a different label.
    - **AN ORDER WITH NOTHING TO RANK SAYS SO, IN WORDS BESIDE THE CONTROL.**
      On a gallery nobody has played, every play order ranks every app at zero
      and a stable sort renders the list exactly as it arrived -- which looks
      ranked and tells the reader something false, because a ranking implies
      the order was earned. The boards hid themselves when flat; one list
      cannot, so `foundrySortNote` swaps the option's rule for its flat
      sentence whenever `foundrySortHasSignal` says so. A flat sentence that
      names an order must be true of it, which is why only the all-tied cases
      say "recently updated order". **A COUNT READ THAT FAILED IS NOT ZERO
      PLAYS**: the gallery load degrades a failed `foundry_play_counts` read to
      no counts, the same input as an unplayed gallery, so it also returns
      `playCountsKnown` and a play order then reads
      `FOUNDRY_PLAY_COUNTS_UNKNOWN_NOTE` instead of "Nothing has been played
      here yet" -- an instrument's silence is never a fact about the apps.
    - **THE FIGURE ON A CARD IS THE ORDER IN FORCE'S OWN METRIC**
      (`foundrySortFigure`), and nothing under an order that ranks on a date.
      Until decision 39 the list printed PLAYS under Most hours and Most
      updated, a number that did not explain the order it sat in.
    - **`FOUNDRY_PLAY_COVERAGE_NOTE` SITS BESIDE THE CONTROL WHENEVER THE ORDER
      RANKS ON PLAYS (`ranksPlays`), zero included**, and still renders on a
      one-app gallery that has no control, because its one card still carries
      a figure. It lived inside the boards region, so deleting that region
      without moving it would have stripped it from every figure silently.
    - **`recent` AND `new` ARE TWO DIFFERENT QUESTIONS.** `recent` is
      `foundry_list_apps`'s own `updated_at desc`, which a metadata edit moves;
      `new` reads `created_at`, which nothing moves. Ranking "Newest" on
      `updated_at` puts a four-term-old app first the day its author fixed a
      typo in its tagline.
    - **`trending` AND `new` ARE OPTIONS, AND `isGallerySort` ADMITS THEM.**
      They were board-only orders, refused on the grounds that seven buttons in
      one group is a control nobody reads at 375px; a `<select>` holds seven at
      every width. The rule underneath did not move: a stored or URL value must
      never put the control into a state with no option under it, so
      `isGallerySort` admits exactly the offered ids, and the select's own
      value goes through it before it becomes state.
  - **SEARCH IS CLIENT-SIDE, MATCHES ANY TOKEN RATHER THAN EVERY ONE, AND THAT
    IS FORCED BY THE REPORT THAT ASKED FOR IT.** `$lib/foundry/search.ts` runs
    over the list the route already loaded. Requiring every query token to
    match is the usual default and makes "Cookie Clicker" find nothing, which
    is precisely the search report 32b calls broken -- one shared token
    surfaces "Cookie Press" and everything else is RANKING. **The tolerance is
    DAMERAU at k = 1, not Levenshtein**: `cookei` against `cookie` is an
    adjacent TRANSPOSITION, the commonest typing mistake there is, and plain
    Levenshtein scores it 2. Synonyms and `pg_trgm` are named in that file with
    their costs and are deliberately not built.
    - **IT SEARCHES THE NAME A CARD SHOWS, NEVER THE ONE A CHOSEN DISPLAY NAME
      REPLACED.** It reads `foundryAuthorName`, so a student who has chosen a
      display name cannot be found by their account name -- which is the
      chosen-identity rule applied to a surface nobody thinks of as a surface.
      Reaching for `displayName()` instead would also make the box a
      disclosure by probe: type a suspected address, see whether anything
      comes back.
    - **IT IS COMPLETE ONLY WHILE `foundry_list_apps` RETURNS EVERYTHING.**
      There is no pagination today, so this covers the whole gallery. A limit
      added to that function silently turns this into a search over a page,
      which is the failure to watch for; the answer at that point is the
      database, not a bigger client.
  - **A PUBLISHER HAS A PAGE AND THE DOOR IS AN APP, NEVER A PERSON.**
    `/foundry/author/<owner uuid>` mounts `FoundryAuthorPage`;
    `foundry_author_profile` (0221) answers NULL unless the caller can already
    see at least one of that author's apps, so a uuid naming nobody answers
    identically and the page cannot be used to probe for a student. Its app
    list is `foundry_list_apps(p_owner)` -- the same function the gallery calls
    with no owner, so there is no second population rule. It projects the
    avatar and the pathway `gauntlet_leaderboards` has shown every signed-in
    student since 0024 and 0038 (decision 14), and refuses the address,
    `section_id`, `role` and `preferences` by name. **The author link lives on
    `FoundryDetail`'s author line and not on a card**: a card is itself a link,
    and an anchor inside an anchor stops the card being clickable past the
    name.
  - **THE RESUME WINDOW IS THE RATE LIMIT, AND IT IS WRITTEN DOWN ONCE** --
    `_foundry_play_window()`, thirty minutes. The START resumes inside it and the
    PING refuses outside it, because they are the same rule about what one
    session is. Two literals thirty lines apart is how a resume window and a
    staleness window stop being the same number, which leaves a row a start will
    not resume and a ping will still extend. It cannot be a unique index -- an
    index predicate may not contain a volatile expression like `now()` -- so
    concurrent starts are serialized on the (player, app) pair with
    `pg_advisory_xact_lock` instead.

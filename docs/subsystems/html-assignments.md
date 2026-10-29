# Ported HTML assignments

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). Schema-3 worksheets served from /hx, the bridge, the write gate and the answer paths. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

### PORTED HTML ASSIGNMENTS -- a second origin split, and the ONE rule that outranks the rest

**A PORTED HTML ASSIGNMENT IS A WHOLE DOCUMENT A STUDENT WORKS INSIDE**, served
by `src/routes/hx/[docId]/+server.ts` from `classroom_html_assignments` (0195),
framed by `HtmlAssignmentFrame.svelte`, and spoken to only through
`bridge.ts`. An item is one when `classroom_items.assignment_schema_version` is
`3`, and `$lib/classroom/html-assignment/mount.ts` is the ONE place that
question is answered -- two spellings of "is this a ported document" is how a
student gets a worksheet and an instructor gets a blank spec panel.

**A BLOCK ID IS PERMANENT, BECAUSE IT IS THE JOIN KEY FOR EVERY ANSWER EVER
STORED UNDER IT.** A renamed `block_id` orphans them and the answer silently
stops rendering -- no error, no empty row, just a worksheet that has quietly
lost a term of work. Ids are fixed at import and nothing may rewrite one
afterwards. **The `field` is the document author's own name for an input and IS
renameable**; the two are deliberately different strings in every fixture, so a
lookup that is the identity function cannot pass for a working mapping. The
charset is `^[A-Za-z0-9_-]{1,40}$`, which is 0086's rule for
`classroom_responses.block_id` and therefore not negotiable -- **the contract
never wrote it down, and a port shipped 63 dotted ids nothing would accept**
(`docs/decisions/entries/22-*`).

**THE ORIGIN SPLIT IS THE SAME ARGUMENT AS FOUNDRY'S AND THE TWO MUST NOT BE
CONFLATED.** `PUBLIC_HX_SANDBOX_ORIGIN` is where documents are served from;
unset means the route answers on ANY host, which is dev and preview.
`PUBLIC_HX_PORTAL_ORIGIN` becomes `frame-ancestors`, resolved by `hxPortalOrigin`
rather than read. **On a preview leave BOTH unset**: naming one origin there
makes `frame-ancestors` name a host that is not doing the framing, and the
browser refuses to embed the document at all, which reads as a broken feature.

**THE CSP CARRIES A `sandbox` DIRECTIVE AND THAT IS WHAT COVERS A DIRECT
NAVIGATION.** The iframe `sandbox` attribute governs a document the portal
FRAMED; a student who types or pastes `/hx/<docId>` reaches the same bytes with
no frame and therefore no attribute. With `PUBLIC_HX_SANDBOX_ORIGIN` unset the
route answers on `ideabosco.com`, where the session cookies live and where
`@supabase/ssr` writes them `httpOnly: false` so `document.cookie` can read
them. **`HX_SANDBOX_FLAGS` in `bridge.ts` is the ONE spelling**, imported by
both the element and `hxDocumentCsp`; a second literal is a framed document and
a navigated one drifting apart with nothing able to compare them. Measured by
DIRECT NAVIGATION in the container's Chromium, with a cookie planted on the
serving origin as a positive control: `window.origin` is `"null"`,
`document.cookie` and `localStorage` throw `SecurityError`, and a credentialed
`fetch` refuses; remove the directive and all three reach, reading the planted
token back.
  - **`allow-same-origin` MUST NEVER JOIN THE SET HERE, and this is the
    one place Foundry's conditional grant does NOT transfer.** Foundry grants it
    when the bundle origin and the portal origin differ, which its own host gate
    guarantees. This route has no such guarantee -- with the sandbox origin
    unset it answers on the portal host itself -- so withholding it
    unconditionally is the only correct answer and the condition Foundry can
    assert is one this route cannot.
  - **THE SET DOES CARRY `allow-popups allow-popups-to-escape-sandbox`, ON
    MR. PINA'S DECISION OF 2026-09-11, AND THAT IS A WIDENING RATHER THAN
    HOUSEKEEPING.** Without them a document cannot open a link in a new tab at
    all -- `window.open` returns null -- and IDEA100 Blade CAD 01 has an Open
    slides button. `allow-popups` ALONE is not enough and this was measured, not
    assumed: the popup inherits the sandbox, lands at an opaque origin and
    throws on `document.cookie` and `localStorage`, which is a tab Slides cannot
    run in. **What it costs is a stronger phishing surface than the same form
    drawn inline**, because the new tab carries a real address bar; the
    mitigation on record is that import is admin-only.
    `docs/standards/IDEA_HTML_ASSIGNMENT_SPEC.md` section 5.6 carries the
    measured table -- a popup cannot read the opener, the opener's parent or the
    opener's top, and cannot navigate either of them, so the widening did NOT
    buy `allow-top-navigation` by proxy.
  - **THE SET ALSO CARRIES `allow-downloads`, ON MR. PINA'S REPORT OF
    2026-10-06 ("download button to download a file from an html is not
    working"), AND THAT IS THE SECOND WIDENING (ledger 0368).** Chromium refuses
    every download a document sandboxed without it initiates, including the
    FIRST navigation of a popup it opens, so AUTHORING 9b's Download button (the
    stored proxy URL in a new tab, which 302s to an attachment) did nothing.
    **What it costs: a document can now put a file on a viewer's disk WITHOUT A
    CLICK** -- measured, 0 of 4 no-gesture downloads under the old set and 4 of
    4 with the flag, where before the only route was a self-navigating popup a
    real Chrome blocks without a gesture. The mitigation on record is still
    admin-only import, and the fallback if it is ever withdrawn is an
    `idea:download { field }` message (SPEC 5.7, which carries both tables;
    `tools/browser-verify/_hx-downloads.mjs` re-counts them from the constant).
    **`allow-top-navigation`, `allow-forms` and `allow-modals` stay refused in
    every configuration.**
  - **`connect-src 'none'` IS AN INDEPENDENT LEVER AND NEITHER IS EVIDENCE
    ABOUT THE OTHER.** A fetch from inside the document is refused with either
    one in force. The discriminator, measured: open `connect-src` with the
    sandbox intact and the credentialed fetch still refuses; drop the sandbox
    too and it answers 200.
  - **`PUBLIC_HX_SANDBOX_ORIGIN` IS DEFENCE IN DEPTH NOW, NOT A PREREQUISITE**,
    and is still the stronger deployment: a second host's cookies are not merely
    unreadable, they are not there, and an absence cannot regress.

**BYTES GO FRAME-TO-PARENT ONLY, NEVER BACK.** `idea:image` carries base64 up;
what returns in `idea:state` is a URL the parent minted through the ORDINARY
submission-file path. `img-src data: blob:` would happily render a
round-tripped data URI, which is exactly why this is written down rather than
left to fail loudly: it would work, and it would quietly make the document the
system of record for a student's photograph. **A restored picture therefore
cannot render inside the document at all** -- the URL is a portal proxy the CSP
admits no host for, and the request would arrive credential-free -- so restored
images are drawn in PARENT CHROME: over a box the document holds open
(`idea:image-box`, below), or in the list under the frame when it reports none.
Do not weaken the CSP to move them inside, and do not send the bytes down.

**A VIDEO IS PLAYED BY THE PARENT, OVER A BOX THE DOCUMENT HOLDS OPEN, AND THAT IS FORCED
(ledger 0349).** A YouTube player framed inside the document inherits the sandbox and draws
nothing (measured: the same embed drew its player from an ordinary page and an empty box
under `HX_SANDBOX_FLAGS`), and the only document-side repair is `allow-same-origin`. So the
document sends `idea:video` with a YouTube id and its box's rectangle, and
`HtmlAssignmentFrame` draws the player over the frame there. **The document names an id and
never a URL** (`HX_VIDEO_ID`, `hxVideoEmbedUrl` on youtube-nocookie), plus optionally a whole-second `start`
(`hxVideoStart`, ledger 0373, so a chaptered walkthrough plays from a step), and the served CSP
still has no `frame-src`. Do not widen `frame-src` in `hxDocumentCsp` to move the player
inside: it would not play there anyway.

**A STORED PICTURE IS DRAWN BY THE PARENT, OVER A BOX THE DOCUMENT HOLDS OPEN (ledger 0368,
Mr. Pina: "show within html assignments not under them").** The document sends
`idea:image-box` with a FIELD (never a URL or a block id, resolved through the parent's own
map) and its box's rectangle, judged by `hxBoxOf`, the video box's rule; `null` withdraws
it. **`hxImagePlacement` is the one rule of where a stored picture is drawn: over its box,
or in the list under the frame, never both and never neither**, and a document that predates
the message keeps every picture in the list. Picture or file is `isImageFilename`, so a
`.SLDPRT` is a tile with a Download and never an `<img>` request, and `undecodable` is keyed
on the URL. Every picture opens in `$lib/media/Lightbox.svelte` and every stored file has a
worded 44px Download, in the frame and in `HtmlAnswerList`. **A picture appears inside a live
document only after that document is re-uploaded with the AUTHORING 10b reporter.**

**THE PARENT TELLS THE DOCUMENT WHETHER THE SITE IS LIGHT OR DARK (ledger 0350).** A sandboxed
document cannot read `data-theme` or keep a setting, so `HtmlAssignmentFrame` sends
`idea:theme` (`hxThemeOf`: Space White is `light`, anything else `dark`) after the first state
and on every `data-theme` change. It is advisory; a document that ignores it is unaffected.

**A DOCUMENT MAY CARRY ITS OWN TYPEFACES, AND ONLY AS `data:` (ledger 0351).** `hxDocumentCsp`
admits `font-src data:` and no host, so an `@font-face` whose `src` is a data URI renders and an
`@import` of a font host is still refused. Measure a font claim by rendered width; the spec's
section 6.3 says why `document.fonts.check()` answers true for a font that is not there.

**THE DOCUMENT'S BYTES ARE CACHED BY VERSION AND THE ACCESS DECISION IS NOT
(ledger 0357).** `(document_id, updated_at)` names one set of bytes, because
every write is `classroom_set_html_assignment`, which stamps `updated_at = now()`
in the statement that writes them and keeps `document_id` across a re-import.
So `hxStoredDocumentHead` reads the row's version and the item's
`kind`/`published`/`publish_at` on EVERY request, and only then are bytes served
from the instance's memory, a strong ETag sent, and a matching `If-None-Match`
answered 304 without reading `document` at all, cold instance included. An
unpublished or scheduled item is a 404 whether or not the cache is warm or the
browser holds a tag, and `tests/hx-document-cache.test.ts` mutates each guard.
**A HAND EDIT OF `document` IN THE SQL EDITOR MUST SET `updated_at = now()` IN
THE SAME STATEMENT**, or warm instances and browsers keep the old bytes (the
server half is bounded by `HX_CACHE_MAX_AGE_MS`).

**A MANIFEST BLOCK MAY CARRY THREE KEYS THAT ARE NOT TYPES, AND NONE OF THEM
DECIDES A WRITE (ledger 0360).** `optional`, `prompt` and `link: "presentation"`
have one reader each in `manifest.ts` (`hxBlockIsOptional`, `hxBlockPrompt`,
`hxBlockLinkKind`); 0195 stores them verbatim and the 0197/0199 gates never read
them, so a new key of this kind is a key, never a seventh block type. Both
validators WARN on a bad `prompt` or `link` and REFUSE a non-boolean `optional`,
because `optional` decides what counts. `HTML_LINK_KINDS` is append-only.
**`openableUrl` in `$lib/classroom/answer-links.ts` is the one gate on a link
before it gets an Open key**, `AnswerLinks.svelte` the one Open key, and
`HtmlAnswerList.svelte` the one renderer of a student's answers without the
document. The Answers CSV (`gradingAnswersCsv`) is built from the export
payload, and nothing on that path reads `classroom_html_assignments.document`.
Presentation mode (`PresentationLinks.svelte`) is a dialog on the grading route,
not a projected route, and shows names, never an address.
  - **AN OPTIONAL BLOCK IS JUDGED, NEVER COUNTED.** It sits in `hxProgress`'s
    blocks at weight 0, like the header: never in the denominator, never the
    next answer named, never the reason a worksheet is incomplete, and
    `hxIncompleteBlocks` skips it, so the rail, `hxCompletion` and every
    Missing/Complete surface agree. A live manifest is marked by a re-upload
    with ids unchanged, or by `supabase/data/0360-hx-optional-blocks.sql`,
    which writes nothing when pasted unedited and never touches `updated_at`
    (0357's cache key). `hxBlockHasResponse` believes the value's shape over the
    block's type in the widening direction only: any stored boolean counts, and
    so does a non-empty string on a checkbox.
  - **THE RAIL'S 100 MEANS STORED, NOT TYPED.** `hxProgress` takes the
    store's unsaved fields, so `filled` and `complete` are two facts; a filled
    worksheet still owed reads 99, and `Progress` mounts the real
    `SaveIndicator` with its Retry in parent chrome. `hxCompletion` passes no
    such option, so the server's judgment is unchanged.
  - **AN ANSWER WRITE CARRIES WHY IT FAILED: `hxSaveResponse` IS THE CALL AND
    `hxRpcFailure` THE ONE READER OF ITS ERROR.** `fail()` dropped the SQLSTATE
    and the status, so a statement timeout during the 2026-09-29 stall reached
    `HxAnswers` unclassified and was never retried. Now a lost session is never
    retried, a transient SQLSTATE, status 0 or a 5xx gets four attempts, and a
    considered refusal is answered once; typing re-arms busy blocks only. The
    spec engine and the instructor copy save through the same call.
  - **THE CLASS LIST BESIDE AN OPEN WORKSHEET IS TOLD, NEVER RE-READ.** The rail
    publishes into the section layout's `LiveWork` only after an acknowledged
    write, and `overlayWork` lays it over `data.work` with no network call. It
    never touches a submitted or returned row, never replaces the server's own
    instant, and is not cleared by a re-read.
  - **A WORKSHEET'S BACKUP COPY IS A CALLER OF
    `$lib/classroom/assignment-draft-mirror`, NOT A FOURTH MIRROR.** It is read
    on `attach()`, never in the constructor, written before the machines go
    down, and holds no photographs, which its restore notice says.

**SUBMIT IS A PARENT CONTROL IN PARENT CHROME**, and the completeness check is
the parent's, from the manifest's `minSentences`. A Submit inside the document
would be a button whose handler the document itself wrote.

**THE RUBRIC IS GENERATED FROM THE MANIFEST AT IMPORT AND AT EVERY RE-UPLOAD**,
by `manifestToRubric`, which DELEGATES to `rubricFromSpec` so byte equality with
a spec-derived rubric is structural rather than coincidental. A second
implementation flattens the levels, and a rubric imported without them is not
partially imported, it is broken. `stagedRubricAfterManifest` takes the
DECISION from `stagedRubricAfterSpec` and the ROWS from `manifestToRubric`,
because the gate passes the current rubric in as `previous` and that preserves a
positional `<module>-r<n>` id a manifest can never generate -- an id that is not
the join key. A hand-edited rubric is never re-derived. **The grading console is
handed `spec = null`**, which is a ported assignment's normal state and not a
degraded one: `levelShort` answers from rung one for every manifest level,
because the contract requires a `short` and the validator refuses an empty one.

**THE WRITE GATE IS ONE FUNCTION WIDENED, NEVER A SECOND WRITE PATH (0197), AND
THIS RULE USED TO SAY THE GATE WAS SHUT.** `classroom_save_response` is still
the only function in the schema that writes `classroom_responses`, and
`classroom_add_submission_file` is still the only one that hangs a file off a
block. Both used to read `classroom_assignment_specs`, raise 'This assignment
has no interactive spec.' without a row, and resolve the block id AGAINST that
spec -- with a type gate accepting `textField`, `table`, `checklist` where a
manifest declares `text`, `longText`, `checkbox`, `radio`, `image`, `table`, an
overlap of ONE. `0197` adds one branch to each: `_classroom_html_manifest(item)`
answers the manifest when `classroom_items.assignment_schema_version` is 3 and
null otherwise, and `_classroom_html_block(manifest, id)` resolves the id across
the header AND the modules. Signatures unchanged, so there is no deploy
ordering.
  - **THE DISCRIMINATOR IS THE ITEM'S OWN COLUMN, the same one
    `htmlAssignmentMount` reads.** An item carrying BOTH a manifest and a spec
    is a legal state and the MANIFEST decides, which is the order every
    rendering surface already takes; deciding the other way is 0134's Surface A
    bug, where an item renders one document and records against another.
  - **NOT A COMPANION SPEC ROW GENERATED FROM THE MANIFEST**, which is the
    cheap-looking fix and manufactures exactly that bug on purpose. **NOT A
    SECOND WRITE FUNCTION** either: `IDEA_CLASSROOM_REBUILD_PLAN.md` decision 12
    refused a second scoring path beside `classroom_grade_submission` and the
    FACTS export, and a second definition of what an ANSWER is fails one step
    earlier for the same reason.
  - **THE MANIFEST ARM HAS NO APPROVAL GATE AND REFUSES `@declaration`**, and
    both absences are deliberate. `_classroom_check_html_manifest` validates
    neither key, so honouring one would let an unchecked field decide whether a
    student may write.
  - **A SPEC-BACKED ASSIGNMENT ANSWERS EXACTLY AS IT DID**, refusal text and
    refusal ORDER included, and that is proven rather than argued:
    `tests/db/html-assignment-spec-path-unchanged.test.ts` puts a corpus of
    twenty-six calls to the DEPLOYED functions, applies 0197 over the same
    database, and compares case for case, with two ported calls as the positive
    control that a no-op apply cannot pass.
  - `tests/db/html-assignment-write-gate.test.ts` was the probe that measured
    the shut gate, written to be DELETED rather than inverted once it moved. It
    has been.

**AND `classroom_save_instructor_response` IS THE THIRD, WIDENED THE SAME WAY BY
0199.** 0197's census was the two functions that write a STUDENT answer; 0128's
instructor working copy writes `classroom_instructor_responses` and was outside
it, so it went on raising 'This assignment has no interactive spec.' on every
schema-3 item with a type gate overlapping a manifest's vocabulary by the single
word `table`. **The cost of that was the whole feature**: nobody could open a
ported worksheet and confirm it saves before a class used it, so the first person
to find a broken document was a student. 0199 gives it 0197's branch --
`_classroom_html_manifest` and `_classroom_html_block`, CALLED and not
reimplemented -- and touches nothing else.
  - **THE SIX-TYPE VOCABULARY IS NOW STATED IN TWO FUNCTIONS**, deliberately,
    against the alternative of replacing the live student write function to
    share a predicate. `tests/db/html-assignment-instructor-gate.test.ts` puts
    all six types plus a control to BOTH on one database and reddens if either
    admits or refuses a type the other does not; 0199's own apply-time check
    reads the deployed `classroom_save_response` back off `prosrc` and refuses
    to apply over a narrower student gate. A test that runs every suite run is
    the durable half of that pin.
  - **THE ANSWER-KEY FUNCTIONS NEEDED NO CHANGE AND MUST NOT GET ONE.**
    `classroom_designate_instructor_key` keys on the PRESENCE of a row, never on
    a block type, so a ported copy becomes designatable the moment the save
    lands one.
  - **AN INSTRUCTOR STILL CANNOT ATTACH A PHOTOGRAPH, and 0199 did not change
    that.** There is no counterpart to `classroom_submission_files` for an
    instructor, so `hxInstructorAnswerTransports` projects `saveResponse` ALONE
    and the three file transports are absent -- which `HxAnswerTransports` now
    admits, each one optional. Handing the ENGINE's uploader over instead is the
    tempting one-line fix and is much worse than nothing: it opens a
    `classroom_submissions` row for its caller, so a teacher pressing a camera
    in their own working copy would acquire a hand-in on their own assignment.
    **Each absence settles a REFUSAL rather than dropping the message**, because
    a camera control that silently does nothing is the failure this lane exists
    to prevent.

**THE CLIENT ANSWER PATH IS WIRED ON BOTH SIDES NOW, AND THIS RULE USED TO SAY
IT WAS WIRED ON NEITHER.** It read "No route supplies the import or answer
transports, so nothing creates a schema-3 item and one would render read-only",
which stopped being true of the STUDENT half when the item route started
building an `HxAnswersStore` over `createHtmlAnswerTransports`, and of the
INSTRUCTOR half with 0199. `ContentComposer`'s import panel creates a schema-3
item and re-uploads over one.
  - **A WORKSHEET THAT TAKES TYPING AND SAVES NOTHING IS STILL THE ONE FAILURE
    WORTH AVOIDING HERE**, and that has not moved an inch: read-only is
    structural on every surface that has no write path -- no answers controller
    means no callback is handed down -- rather than a flag. `HtmlInstructorCopy`
    inverts the same rule to the same end: its `answers` prop is REQUIRED, so
    there is no way to mount the working copy in a read-only shape at all, and a
    surface that cannot build a controller renders the ordinary frame instead.
  - **THE GRADING CONSOLE'S VIEW OF A STUDENT'S WORKSHEET STAYS READ-ONLY, and
    it is now TWO sweeps rather than one.** `tests/html-assignment-instructor-readonly.test.ts`
    checks that the grading mount hands down none of the four write callbacks
    AND that it mounts no `HtmlInstructorCopy` -- the second sweep is not
    redundant, because that component mounts the frame inside ITSELF, so the
    callback sweep cannot see it.
  - **A MANAGER GETS THE WORKING COPY, NEVER THE STUDENT CONTROLLER.**
    `htmlAnswers` and `htmlInstructorAnswers` are two props for two RPCs writing
    two tables, and a single prop whose meaning turned on `canManage` is exactly
    how a teacher's answers would one day land in `classroom_responses` as a
    student hand-in. The working copy REPLACES the read-only frame rather than
    joining it: two mounts of one document are two worksheets a teacher can type
    into, and the one that records nothing looks identical.

### LEDGER 0431: A COPY CARRIES ITS DOCUMENT, THE REPO CARRIES EVERY DOCUMENT, AND AN OPEN WORKSHEET HEARS A CLOSE

**A DUPLICATE COPIES THE WORK SURFACE, IN SQL, AND THE CONNECTOR GETS IT FOR
FREE.** `classroom_duplicate_item` (0193's body, re-run by 0298) now calls
`_classroom_duplicate_work_surface`, which copies the `classroom_html_assignments`
row (document, manifest, filename, `show_title`) under a NEW `document_id` and
sets `assignment_schema_version` 3 in the same transaction, or the IdeaCAD
`ideacad_editors` row and version 4. The version is written only beside its row.
The connector's `duplicate_post` calls the same function and needed no change.
The copy skips the admin season gate of `classroom_set_html_assignment` on
purpose: it puts back bytes an admin already imported, never new ones.
`tests/db/classroom-duplicate-html-assignment.test.ts` compares each copy's
document byte for byte with the literal its own source was given, across two
classes, and carries the read-only SELECT (in
`docs/feedback/2026-10-23/RESULTS-0431.md`) that lists duplicates made empty
before the fix.

**EVERY HTML ASSIGNMENT EXPORTS TO THE COURSE'S FOLDER UNDER `materials/`, AS
A SPEC DOES.** `readExportSubject` in `src/lib/server/classroom-export.ts` is the one
reader for both the per-save export and the backfill: a schema-3 item with a
document writes the file assignment.html (verbatim: no newline added, no re-encode),
`manifest.json`, `rubric.json` and `material.json`; the manifest decides over a
leftover spec. The document's `material.json` carries `documentUpdatedAt` and NO
export time, so exporting an unchanged worksheet again builds the identical
tree and commits nothing (every commit to `main` is a deploy).
`createHtmlAssignmentTransports` pings the export after an upload lands.
**THE CONNECTOR'S `replace_html_assignment` DOES NOT PING IT** (it writes
server side, in connector code this lane did not own); the backfill catches it
up. `exportHtmlBackfill`, behind the admin route `/api/classroom/export/html`,
exports every document the caller can read in commits of at most
`HTML_BACKFILL_BATCH_BYTES`, gives a second item that would take an existing
folder its id's first segment (never renaming a frozen `export_slug`), and is
safe to run again.

**AN OPEN WORKSHEET HEARS A CLOSE THREE WAYS, ALL READING THE STUDENT'S OWN
ROW, AND NONE IS A NEW POLL.** The item page's call budget is spent
(`tests/classroom-poll.test.ts`), so: 0298 gives `classroom_presence_ping` a
`lock` key (the caller's `state` and `submitted_at`), read by `presenceLockOf`;
the grading page announces the payload-free `lock` topic after a close or reopen
lands, and a student's page re-reads its row within `LOCK_NOTICE_JITTER_MS`; and
a save answered `locked` calls `onlocked`, which flips the frame at once. The
frame's `lock` prop is the page's live answer (`htmlLock` on `ItemDetail`),
falling back to the load. **What was typed after a close is kept**: the frame
shows it read only, `hxUnsavedAnswers` lays it out above the frame with Copy,
and a reopen calls `resendAfterReopen`, which re-arms exactly the blocks refused
as shut. A close made through the connector arrives by the next beat (about 40
seconds), not by the notice.

**FULL PAGE IS THE SAME ELEMENT, FIXED, NEVER MOVED.** `expandable` on
`HtmlAssignmentFrame` draws a Full page key; open, the wrapper is
`position: fixed` over the window (moving an iframe reloads it), the page's
scroll is held with `lockDocumentScroll`, and `onexpand` lets `ItemDetail` drop
its stacking context (`edit-layer-open`) exactly as its edit layer does. Exit
full page is always on screen because a keydown inside the sandboxed document
never reaches the window; Escape is the convenience. It is remembered in this
browser only (`idea.hx.fullpage`), wrapped in try/catch.

**ANSWERS LEFT TAKES THE STUDENT TO AN ANSWER THROUGH THE BRIDGE.**
`hxAnswersLeft` is `hxProgress`'s own unmet, counted blocks, so the list and the
chip's count are one answer. A row calls the frame's `focusField`, which focuses
the frame and sends `idea:focus` (`HX_FOCUS_TYPE`, a field name only); a
document that knows it focuses the field without scrolling and answers
`idea:field-box`, and the parent scrolls to that box and rings it. A document
that predates the message falls back, after a short wait, to a box the parent
already holds or to the top of the frame, and the list says so. The reference
responders are `bridgeClient()` in `src/routes/hx/_documents.ts` and the kit's
`kit.js`; **a live document gets the jump only once it is rebuilt on the kit
and re-uploaded.** `tools/browser-verify/routes/html-assignment-live*.mjs`
measures all three at 375 and 1440 on `/dev/html-assignment-live`.

### LEDGER 0458: ANY ONE OF THESE, ONE HEADER AND ONE RAIL, AND A REPLACE THAT NEVER UNDOES A NEWER SAVE

**"ANY ONE OF THESE" IS A GROUP OF OPTIONAL BLOCKS COUNTED AS ONE REQUIREMENT
(report 3d205727).** A block key `anyOf: "<group id>"` (read by `hxBlockAnyOf`,
the one reader) on two or more `optional` blocks of one module is the kit's
`data-any-one` in the manifest. `requiredUnits` in `progress.ts` is the one
statement of a module's units (required blocks, and each group as one unit at
its first member), so the rail, `hxCompletion`, Answers left and the grading
counts read the group once, met by any member; its row carries `group`.
`validateHtmlManifest` refuses a member that is not optional, a group of one, a
malformed id and a group in two modules. The database gates never read the key,
so it needed no migration; the team SQL that counts boxes (`_classroom_team_block_done`,
`classroom_team_progress`) still reads each member as optional. `HtmlAnswerList`
shows a group as one question.

**A 0-POINT MODULE MAY CARRY NO CRITERIA (0326, reports 6c5c7cc8 and
569a1891).** `_classroom_html_module_ungraded` is the gate's one test, and the
client validator says the same; such a module adds no rubric row and, on the
points basis, no weight on the bar, so a whole post of them is ungraded.

**ONE HEADER AND ONE RAIL (report 4930ba0e).** The frame sends `idea:host`
(`hxHostMessage`) when the page draws the steps (`hostSteps`: the rail is on
screen and full page is shut) or the title (`hostTitle`: the item page shows
the post title, 0284). A kit document then hides its own step track, its "You
are here" line and, when asked, its title, and reports `idea:steps` after every
refresh; `hxReceive` judges it (titles cut, a colour only through
`hxStepColor`, which keeps anything that could leave a `style` attribute out),
`Progress` draws one 44px key per step, counted over REQUIRED steps only
(`hxStepsCount`, report 88ad281b), and a key sends `idea:go-step`. The kit
reports nothing until it hears `idea:host`, so a document never sends the
message to a portal that did not ask, and a document that never answers keeps
its own track and title. `tools/browser-verify/_hx-steps.mjs` measures both
halves at 375 and 1440 on `/dev/html-assignment-live?doc=kit-starter` (the kit
starter built on the kit in this tree, dev only, `hxKitFixture`).

**A PLAN DAY MAY NAME A PACING STEP (report f8c1b1d8).** A day in `hx-plan-data`
carrying `"pace": "<pacing step id>"` takes its date from the `schedule` the
portal sends (the class calendar's resolution of the manifest's `pacing`), and
shows "<label> · <date>"; the kit also takes the school's `today` from it. No
date is typed into the page. Without a portal, or a matching step, it shows its
label alone.

**A REPLACE NEVER UNDOES A NEWER SAVE (report aa9ce822).** `htmlBasedOnMatches`
in `store.ts` is the one rule: the copy a replace was made from, named by the
stored bytes' SHA-256 or by its saved time, must be the live one. The
connector requires it (`basis`) once a post has a document; the replace screen
asks `readSavedAt` before anything is retired or written (`htmlReplaceStillCurrent`,
against the saved time the page loaded or its own last save). A refusal is
`HTML_REPLACE_STALE`.

### LEDGER 0436: A TEAM ASSIGNMENT IS ONE SHARED DOCUMENT PER TEAM, PINNED TO THE DRAW IT IS WRITTEN UNDER

**A MANIFEST WITH A TOP-LEVEL `team` IS A TEAM ASSIGNMENT (0301, 0302; spec section 16,
decision 71).** `team` modules hold one answer per block per team, `role` modules belong to
the member who owns the role in the team plan, and every other module is the student's own;
a manifest without `team` is per student whatever `audience` says, so every stored worksheet
answers as before (`tests/db/html-manifest-team-roles.test.ts` puts every exported manifest
under `materials/` through the deployed gate and then 0301).
- **A TEAM POST PINS ITS DRAW, PER CLASS (0323, ledger 0456, Mr. Pina's report b27e9544;
  this bullet said "do not add a pin" until then, and the measured cost of that rule was a
  presentation-groups draw silently re-teaming Launcher: Design mid-unit).**
  `classroom_team_post_draws` holds one draw per post per class, taken when a post and a
  posted draw first meet (`_classroom_team_post_pin`, called by the draw-posted and
  manifest-stored triggers and by `classroom_postings_team_pin`). A newer draw moves a post
  ONLY while `_classroom_team_post_used` says nobody worked on it. `_classroom_item_team_set`
  is the student's answer (the pin while posted and not retired, its end time ignored) and
  `_classroom_item_team_set_any` the instructor's and grading's (the pin, whatever its
  state); `_classroom_team_ctx` asks the first, or the second inside a team grade.
  **A NEW READ OF "WHICH TEAMS" FOR A POST ASKS ONE OF THOSE TWO, never
  `_classroom_section_team_set`**, which is the class page's current draw and nothing more.
  The People tab warns before a draw a post still uses comes down (`classroom_team_set_uses`).
  `tests/db/classroom-team-signoffs-0323.test.ts` is mutation-proven on "a used post stays".
- **THE TEAM'S ANSWER IS `classroom_team_answers`, AND THE MEMBER ROWS ARE ITS COPIES.**
  `classroom_save_response` (still the one student write, widened by 0302 with one branch
  before its insert) writes the team row and every current member's `classroom_responses`
  row in one statement, so grading, the bulk path, the FACTS export, Missing and Complete
  and 0290's teammate progress read a team answer with no change. A move takes the old
  team's answers out of the student's rows (only rows still equal to the team's value) and
  puts the new team's in (`_classroom_team_members_resync`), so work never follows a
  student. **Never read the team's value off a member row**: it is the team row.
- **THE LOCK IS THE SERVER'S.** `_classroom_team_block_refusal` is the one statement of who
  may write a shared box (past due, closed, role owner) and `_classroom_team_take_lock` the
  one lock (two minutes after the last touch, read at call time); the save and
  `classroom_team_box_lock` both ask them. The page only mirrors it: `TeamDocSession`
  (`team-doc-session.svelte.ts`) takes the lock on `idea:field-focus`, lets the box's write
  land and releases it on `idea:field-blur`, and drops a change to a box the student may
  not write before it reaches the save path. `HxAnswers.adoptRemote` lays a teammate's
  saved answers down and NEVER over a box still owed a write or one touched after the read
  left (`readSince`), which is the measured race: a notice for the student's own save
  re-read the team before the save landed and put the old words back.
- **A STORED VALUE IS READ BACK THROUGH `hxBridgeValue`.** A team row holds the ordinary
  stored shape (`{ text }`), and the harness showed nothing reaching a teammate until
  `teamValuesFor` read it that way.
- **WHERE IT IS MEASURED.** `tests/db/classroom-team-documents.test.ts` (privacy both ways,
  owner and lock refusals, posting and unposting, a move, mutation-proven in the permissive
  direction) and `/dev/team-document`, two browser contexts as two teammates over the
  in-memory stand-in in `_fake.ts`, which is never evidence for a database rule.
- **A POST THAT BECOMES A TEAM POST CARRIES ITS STUDENTS' ANSWERS OVER (0313, spec 16.9).**
  `_classroom_team_carry_over` fills an empty team or role box from the members' own rows
  (newest wins, every differing answer logged to `classroom_team_log` first) when a team
  manifest is stored (`classroom_html_assignments_team_carry_over`) and when a draw is
  posted (`classroom_team_sets_carry_over`). Without it the first teammate's save
  overwrote every member's row, which is how a mid-assignment switch lost work. Never
  widen it to individual blocks: `tests/db/classroom-team-carry-over.test.ts` is
  mutation-proven on exactly that.
- **A PICTURE IN A TEAM OR ROLE BOX IS THE TEAM'S (0316, ledger 0456; it used to show only
  for its uploader).** `_classroom_team_file_visible(file, email)` is the one rule: a picture
  in a `team` or `role` block, read by a member of the uploader's team in that section's
  current draw. Both read paths ask it: one permissive row policy beside 0086's (through the
  caller-scoped `_classroom_team_file_visible_to_me`) and a branch in
  `classroom_can_read_submission_object`, the storage policy's predicate, so the file route's
  signed URL is minted on the teammate's own session. `classroom_team_files` lists the team's
  newest picture per box; `TeamDocSession.images` lays it into the document through
  `teamImagesFrom`, and the item page's ONE image map (`htmlImages` in `ItemDetail`) feeds the
  frame, the rail and the pacing strip, so every teammate's progress counts the team's
  pictures (and `classroom_team_progress` counts the team's boxes for every member). A role
  picture is written only by the role's owner (`classroom_add_submission_file` asks
  `_classroom_team_block_refusal`). **A picture in an individual block stays its uploader's**:
  it is that student's own graded answer. `tests/db/classroom-team-photos.test.ts` is
  mutation-proven on the rule.
- **SIGN-OFFS ARE DECIDED IN THREE PLACES THROUGH ONE WRITE (0323).** The queue
  (`/classroom/signoffs`, the classroom header's Sign-offs door and the home line, counted by
  `classroom_signoff_waiting`), the teams panel on a team post (`TeamSignoffPanel`, read by
  `classroom_item_signoff_board`), and the connector. Every decision writes through
  `_classroom_signoff_close`; `classroom_signoff_teacher_decide` opens a request when there is
  none and approves over a failed item only with a note. Both pages mount `SignoffCard`, the
  one checklist. A field check's pass and its "who is missing what" are one rule
  (`_classroom_signoff_missing` over `_classroom_team_block_done`); never test a box's
  completion a second way.
- **A TEAM TABLE LOCKS BY ROW (0324, gap 2d621bcc).** A lock key `<block>#r<n>` names one
  row of a `table` block; `classroom_team_box_lock` never locks a whole table, and
  `_classroom_save_team_response` merges a table row by row (`_classroom_table_rows`,
  `_classroom_table_text`, which writes the kit's own compact spelling), taking each changed
  row's lock and keeping a row a teammate holds. Every other box still locks whole. A
  document built before the kit sent `row` still gets concurrent rows (the save takes the
  row locks), but only a rebuilt one lays a teammate's rows down while the student is in the
  table (`teamAdoptRows` in `tools/hx-kit/kit/team.js`).
- **NAMES THAT TARGET A CLASSMATE (0324, report 3d4d8b76).** `_idea_roster_name_hits` is the
  one check, and `classroom_teams_name_hold` holds a student's team name or tagline that
  matches into `classroom_team_text_holds`; a manager's write is never held. Another lane's
  student-typed text (tournament entries, market listings) calls the same function rather
  than writing a second matcher.
- **SEEDED TASK DATES, THE SPLIT AND PHASES (0323).** `_classroom_team_seed_due` gives a
  seeded task its date from the post (spec 16.6), `_classroom_team_balance` judges each member
  against their own share (`rule` "roles" on a team smaller than its roles), and a module's
  `opensAfter` holds its boxes shut per team (`_classroom_team_phase_refusal` in the save and
  the file record, `phases` on the team document, team-state `later`; spec 16.10).
- **NAMES.** `_classroom_first_name` reads the given name ("Last, First" or "First Last"),
  and `_classroom_team_display_name(team, email)` is "First L." where two members of one team
  share a first name; every team payload names members through it (0316).
- **A TEAM ASSIGNMENT IS GRADED ONLY BY TEAM (0305).** `classroom_grade_submission` refuses
  a team assignment's grade unless `classroom_grade_team` named the student's team for the
  transaction (`idea.team_grade`, set with `set_config(..., true)`, the 0270 connector
  pattern), so the per-student console, the bulk path called directly and a direct score
  all refuse it; `/classroom/<id>/item/<id>/grade` sends a team post to `.../teams`. Inside,
  the one grading rule does the team arithmetic: a role criterion (`_classroom_role_criteria`)
  counts only for its owner (`_classroom_owned_roles`), a double owner gets the mean of the
  role blocks, and `_classroom_item_out_of` is the team and individual criteria plus ONE
  role block. Any surface showing a team assignment's "out of" asks `teamRubricOutOf`
  (`src/lib/classroom/team-grade.ts`), the mirror of that function, never `rubricTotal`.

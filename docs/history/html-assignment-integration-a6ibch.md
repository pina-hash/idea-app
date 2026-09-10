---
title: "Prompt 0134: finishing the HTML assignment system -- the `sandbox` directive that closes a direct navigation, the wiring four lanes left undone, and a fixture the shipped importer refuses (`claude/html-assignment-integration-a6ibch`, no migration)"
date: 2026-09-10
branches: [claude/html-assignment-integration-a6ibch]
migrations: []
subsystems: ["Classroom", "HTML assignments", "Security boundary", "Rubrics", "Browser harness"]
---

Four lanes built the pieces of the ported-HTML-assignment subsystem against one
normative contract and none of them touch. Nothing rendered and nothing saved.
This bundle is the wiring, one security change, and the deploy.

`Claims: none.` Answers land in `classroom_responses` through the EXISTING
`classroom_save_response`, unchanged; that is the design rather than an
economy, and needing a migration would have meant the design had drifted.
`0193` through `0196` are applied to production.

## The opening

Duplicate check clean: no `docs/prompt-ledger/entries/0134-*` on any ref
(`git log --all --diff-filter=A` over that glob, zero hits; `origin/main` and
`origin/integration` both topped out at `0133`), and every remote `claude/**`
branch swept for a commit touching a `0134` path, zero hits.

`git fetch --unshallow origin` succeeded -- the clone WAS shallow -- leaving
2003 commits on `origin/main` and `is-shallow-repository` false. Identity:
`Claude <noreply@anthropic.com>`.

Branched from `origin/integration` at `00623a40`. The ledger was the first
commit and was pushed alone, per the ledger README's own rule: a claim recorded
in an entry is visible for the whole window before the work lands.

## Step 1, merging 0126

`claude/html-assignment-manifest-contract-tpr7eg` carried the serving route,
`bridge.ts` and `HtmlAssignmentFrame.svelte`. One conflict, in
`tools/browser-verify/README.md`, both hunks entirely inside the
`counts:static` markers (179/72/100/358 against 176/71/98/352). Resolved by
`npm run verify:counts` on the merged tree, never by taking a side, per the
standing rule that a conflict fully inside the generated markers is resolved by
regenerating. The merged tree measures 180 specs over 73 routes, 101 `/dev`
pages, 360 runs.

## Step 2, the security change, which was the gate on everything else

**What 0126 measured and left open.** The iframe `sandbox` attribute is on the
`<iframe>` element, so it governs a document the PORTAL FRAMED and nothing
else. A student who types or pastes `/hx/<docId>` reaches the same bytes with
no frame around them and therefore no attribute, so the document is not placed
in an opaque origin. `PUBLIC_HX_SANDBOX_ORIGIN` is not set in production, so
`hxOnServingHost` answers true for every host and the route answers on
`ideabosco.com` -- the host the session cookies live on, and the host
`@supabase/ssr` writes them `httpOnly: false` so `document.cookie` can read
them. An uploaded document navigated to directly would have run in that origin,
with that session.

**The change.** `hxDocumentCsp` now emits `sandbox ${HX_SANDBOX_FLAGS}` as its
first directive. The flags are IMPORTED from `bridge.ts`, never retyped: one
spelling, two readers, which is `foundrySandboxFlags`' arrangement for the
identical reason. A second literal would be a framed document and a navigated
one drifting apart with nothing able to compare them.

`allow-scripts` alone, and `allow-same-origin` must never join it. Foundry
grants that flag CONDITIONALLY, on the two origins differing, because its
bundles answer on a host that is by construction not the portal. This route has
no such guarantee -- with the sandbox origin unset it answers on the portal host
itself -- so the strict set is the only correct answer here, and the condition
Foundry can assert is one this route cannot.

### The proof, by direct navigation, in the container's Chromium

Never inside a frame: measuring inside one proves nothing about the directive,
because the attribute would be doing the work. Every reading was taken after
`page.goto()` on the `/hx/` URL itself.

**The positive control first.** A cookie `hx_proof_session=PORTAL-SESSION-TOKEN`
was set on the serving origin and read back from an ordinary page on that
origin, so a refusal below cannot pass for the boring reason that there was
nothing to read.

| case | `window.origin` | `document.cookie` | `localStorage` | credentialed `fetch` |
| --- | --- | --- | --- | --- |
| baseline | `"null"` | SecurityError | SecurityError | TypeError |
| directive removed (0126's state) | `http://127.0.0.1:5199` | reads the token | writes and reads back | TypeError |
| `+ allow-same-origin` | `http://127.0.0.1:5199` | reads the token | writes and reads back | TypeError |
| `connect-src` open, sandbox intact | `"null"` | SecurityError | SecurityError | TypeError |
| `connect-src` open, sandbox dropped | `http://127.0.0.1:5199` | reads the token | writes and reads back | **status 200** |

**The last two rows are the discriminator, and 0126's own comment asked for
it**: it warned not to read a passing fetch control as evidence about the
sandbox, because `connect-src 'none'` refuses a fetch independently. With
`connect-src` wide open and the sandbox in force the credentialed fetch still
refuses -- an opaque origin makes it cross-origin and no CORS header answers it
-- and only dropping the sandbox too lets it through. So the fetch control is
genuinely reddened by this directive and not only by the other lever.

Both mutated files were restored FROM A COPY taken before the run and
md5-checked identical (`3334d660...` and `e29dda6f...`). Never
`git checkout --`, which restores from HEAD and would have discarded the
bundle's own uncommitted work -- the failure CLAUDE.md records three sessions
hitting in one week.

**`PUBLIC_HX_SANDBOX_ORIGIN` stays supported and remains the stronger
deployment.** A second host carries no session cookie at all, which is an
ABSENCE rather than a browser honouring a directive, and an absence cannot
regress. What the directive changes is that the variable is now DEFENCE IN
DEPTH rather than a prerequisite: production is safe today, unconfigured, which
it was not before this bundle.

## Step 4's import leg failed first, and the reason was not the wiring

The ported Blade fixture -- the document step 4 requires importing -- is
refused by `validateHtmlManifest` with **66 errors**, in four categories: 44
block ids and 19 criterion ids carrying a dot, which
`^[A-Za-z0-9_-]{1,40}$` does not admit; one 0-point module with no criteria
array; and two criteria worth 1 carrying three levels with a middle level worth
`0.5`.

**`tests/html-assignment-port.test.ts` had twenty-six green assertions over
those exact bytes and never once called that validator.** Its checks were
hand-written expectations about what a good port looks like, taken from
`IDEA_RUBRIC_STANDARDS`; none of them was the shipped gate. A test written from
the standard cannot see a conflict with the code, and a test written from the
code cannot see a conflict with the standard. That is the whole mechanism by
which a fixture nobody could import shipped green.

The two 1-point criteria are not a porting mistake. They are a genuine conflict
between the rubric standard ("never two" levels, "top level equals the
criterion maximum") and applied migration `0195` (a level's points must be a
whole number; a criterion needs one point per level above the bottom). **A
1-point leveled criterion is unrepresentable.** Recorded as
`docs/decisions/entries/22-a-one-point-leveled-criterion-is-unrepresentable.md`,
`Status: open`, with three candidate resolutions and a stated default that is
argued rather than asserted. It is not resolved here: it changes how every
future manifest and every future spec rubric is authored.

The fixture was re-ported around it, under an explicit instruction. It is a
`/dev` artifact; `src/lib/legacy/assignments/idea100-blade-01.html`, what
IDEA100 students are working in, was NOT touched and was md5-verified unchanged
(`2211141fc0d2e08ee6c005d3d0d639d3`) at the end of the bundle.

- Every dot to a hyphen, 63 of them. Safe **only because nothing has ever been
  imported from that fixture**: a block id is the permanent join key for every
  answer stored under it, and a renamed id orphans them silently. That window
  closes at the first import.
- The 0-point `package` module becomes `header`, its contract home. A 0-point
  module renders in the grading console as something to score, which is exactly
  what `header` was added to the contract to end.
- `identity-mood` 1 to 2, keeping all three tiers and its wording, its `0.5`
  middle becoming `1`; `identity-personality` 3 to 2 so the module still sums to
  10, its four levels becoming three by merging the two that both describe a
  theme connection that is not made.
- `manufacturing-justification` merged into `manufacturing-processes` (3 points,
  four levels). The module is worth 5 across three criteria and none may be
  worth 1, so three criteria at 2 or more need at least 6 points: the arithmetic
  left no move other than the merge the validator's own message proposes.

Afterwards: 0 errors, 6 modules, 10 header blocks, 44 blocks, a 44-entry field
map, 9 blocks carrying a sentence minimum.

**The port test was generalised rather than adjusted.** Its `blocks` read was a
second flatten over `manifest.modules`, which silently stopped seeing the ten
header blocks and then failed as "ten fields in the document have no block" --
which reads as a fault in the DOCUMENT. It reads `manifestBlocks` now, the
shipped helper every real caller uses. Four assertions were added: the fixture
goes through the real validator with zero errors, a positive control proves that
validator can still find a fault, the id charset is pinned against `HTML_ID_RE`
with a control that a dot is refused, and identity fields must sit in `header`
with no 0-point module anywhere.

**The second gap is a contract gap and not a decision.** The HTML-assignment
contract never named an id charset at all. 0127 correctly took `0086`'s rule for
`classroom_responses.block_id`, which is the right rule; it simply was not
written where a porting lane would read it. Decision 22's last section records
that.

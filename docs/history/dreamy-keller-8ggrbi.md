---
title: "Ledger 0158: four loose ends, of which one was already closed by the lanes that left it -- the update log, a test that read as a rule, the template's `alt` line, and a README that still said foundation (`claude/dreamy-keller-8ggrbi`, no migration)"
date: 2026-09-11
branches: ['claude/dreamy-keller-8ggrbi']
migrations: []
subsystems: ['Classroom', 'HTML assignments', 'legacy-assignments', 'Testing', 'Docs']
---

Four ends, each left deliberately by the lane that found it and each named in a history
entry. Branched from `origin/integration` at `10565935`. The duplicate check, the three
opening fetches and the identity check are in the ledger entry
(`docs/prompt-ledger/entries/0158-four-loose-ends.md`) and the one thing the check
actually caught is below, because it changed the work.

## ONE. The update log, and the four entries that were already there

**The duplicate check found four of the six named changes already written.** The prompt
listed six things a student would notice and said four lanes had each declined to write
any of them. That was true when the prompt was written and had stopped being true by the
time it ran: `classroom-updates.json` on `origin/main` and `origin/integration` (identical,
151 entries, no diff between the refs) already carried, all dated 2026-09-11:

| prompt's item | entry already on both refs |
|---|---|
| the progress bar above an HTML assignment | "A progress bar at the top of every online worksheet" |
| the wider frame | "Online worksheets use the whole page, and their links open in a new tab" |
| a document reopened in a new tab | the same entry |
| an assignment closed at a unit's end | "Your teacher can close an assignment when a unit ends" |

Plus two nobody asked for: "Your class page fills the screen properly again" (the column
defect) and "Worksheet answers are safer if you close the tab quickly" (0141's draft
mirror). **Writing them again would have been six entries for four changes**, which on a
page a student reads as a list of what is new is worse than none. So three were written,
not six: the grading console, the Foundry overlay, and the sketch captions.

**The grading-console entry is the half of 0141 that was missed.** The draft-mirror half
of that bundle has an entry; the half where a teacher could not see a student's work at
all does not, and it is the one with an instruction attached -- a worksheet marked "In
progress" that came back without comments is worth asking about.

**The Foundry entry says what was measured and not what was hoped.** 0148's own history
is explicit that the `100dvh` half is unverified: there is no WebKit build in the
container, and deleting the two height declarations changed nothing in 22 measurements.
The 52px bar is measured and is stated flatly; the bottom edge is stated as "should also
sit above your browser's toolbars", which is the honest strength of the claim.

### The sketch entry is the one that was left to a person, and it is placed deliberately

0150 repaired image order and caption identity and wrote down, in its own history, that
**work already saved is not repaired**: `loadData` pushes `_images` in stored order, so a
student whose sketches were scrambled still has them scrambled and a caption already bound
to the wrong picture stays bound to it. The fix stops the defect happening and cannot know
which of two stored pictures a student meant.

**It leads its date group rather than being appended, and that is not cosmetic.**
`CLASSROOM_UPDATES` sorts by date descending and `Array.prototype.sort` is stable, so
entries sharing a date keep file order -- and `recentUpdates(3)` is what the classroom home
shows. Appended, this entry sat ninth among 2026-09-11 and would not have appeared there at
all. It is the only entry today that asks a student to go and do something, so it is first
in the file. The other two were left appended.

The exact sentence was put at the top of the final report for Mr. Pina to change before it
ships, because wording a "your saved work may be wrong and we cannot fix it" notice without
alarming a class is a judgement a session should not make alone.

## TWO. A test that read as a rule and was a fact about one file

Ledger 0153 found `tests/html-assignment-port.test.ts` asserting the sandbox tokens of a
second literal in `src/routes/dev/html-assignment/fixtures/+page.svelte`, which does not
read `HX_SANDBOX_FLAGS`. It asserted `toEqual(['allow-scripts'])` and
`not.toContain('allow-popups-to-escape-sandbox')`, both green, both **stricter than the
frame students actually work in** since Mr. Pina's decision of 2026-09-11 widened the
constant to `allow-scripts allow-popups allow-popups-to-escape-sandbox`.

**The harness binds to the constant now, prose included.** `sandbox={HX_SANDBOX_FLAGS}` on
the `<iframe>`, and the header sentence renders the same string rather than spelling
`allow-scripts` a second time. A harness framing its document under a different sandbox
from the portal's is a harness measuring something nobody ships.

**The test asserts the binding and not the rule, which is the whole of what changed.**
Which flags may be in that string is already asserted on the constant itself in
`tests/html-assignment-bridge.test.ts` -- the exact token set, the three refused flags, and
the pairing that makes `allow-popups` useful. Restating any of it in the port test would be
a second copy of the rule. What is left there is the one question the bridge test cannot
answer: does the harness read the constant, or a second spelling of it?

### The division of labour is proven by mutation, in three directions

Each mutant applied to a file copied first and restored from that copy, md5-checked
identical afterwards (`git checkout --` is a discard-to-HEAD and was not used).

| mutant | port test | bridge test |
|---|---|---|
| A: the old `sandbox="allow-scripts"` literal back on the frame | **FAIL**, `expected [] to deeply equal [ 'HX_SANDBOX_FLAGS' ]` | -- |
| B: a local `const HX_SANDBOX_FLAGS = 'allow-scripts'` shadowing the import | **FAIL** | -- |
| C: `allow-same-origin` added to the constant itself | **30 passed** (correctly) | **FAIL**, 6 tests including "never grants allow-same-origin" |

C is the control that gives the split its meaning: the constant moving dangerously reddens
the file that owns the rule, and does not redden the file that owns the fact. A and B are
the control that the fact is still asserted. `9f0ca3bc...` and `48a0e466...` were the md5s
before and after for the harness and `bridge.ts` respectively.

## THREE. The template's `alt` line, carried

0137 wrote three fixes into `_TEMPLATE.html`; 0150 transcribed two into the live Blade
assignment and left `img.alt = imgObj.name || 'Uploaded image'`, because a third change to
a file a class is working in wanted its own decision. **It is a plain accessibility
improvement with no behavioural effect, and that is measured rather than argued.**

Paired measurement in the container's Chromium over `file://`, two header-verified PNGs
uploaded as `01-top.png` and `02-side.png` and captioned:

| | before | after |
|---|---|---|
| `alt` on the two preview images | `[null, null]` | `["01-top.png", "02-side.png"]` |
| `collectData()._images[0]` keys | `["name","caption","dataUrl"]` | `["name","caption","dataUrl"]` |
| images under `#sketch-preview` in the export clone | 0 | 0 |
| total `alt=` occurrences in the export | **1** | **1** |
| page errors | none | none |

The single `alt=` in the export is the static `<img id="lightbox-img" src="" alt="">`,
present either way. `downloadHTML` empties `#sketch-preview` in the clone, so the attribute
can never reach an exported file; `alt` appears nowhere else in the document and no CSS or
JS reads it; `imgObj.name` already exists on both paths (`{name: file.name, ...}` on upload
and restored by `loadData`). So the export bytes are unmoved and the stored shape is
unmoved. What changes is that a screen reader announces the filename instead of nothing,
and a picture that fails to decode shows its name instead of a broken-image box.

**`STORAGE_KEY` does not appear in the diff at all**, which is the cheapest way to say it.
The whole change is one line.

## FOUR. The README

It opened "This phase is the foundation only: Google login, a profiles/roles backend, and
the public-vs-protected route split", and its project layout listed nine files. The tree
carries fourteen subsystems, 196 migration files, 385 test files and three origins.

**Written from `src/lib/site-manifest.ts` and `src/routes/`, and every claim in it checked
against the tree** rather than taken from the audit that reported it or from the prompt:
all 18 route directories named were confirmed to exist, as were `/classroom/updates`,
`/dev/login`, `[shortlink]`, `tools/apply-migration.mjs`, `tests/db/harness.ts`,
`tools/run-tests.mjs` and `supabase/functions/foundry-ingest`; `/209h` was read out of the
shortlink route's own header; all **103** of the 103 directories under `src/routes/dev/`
carry the `if (!dev) error(404)` guard; `/maps` is absent from `authedPrefixes`; and the
lockfile is 4,649 lines with `package.json` tab-indented and `package-lock.json`
two-space, confirmed with `cat -A`.

**It said `npm install`**, which in this repo rewrites that entire lockfile to match
`package.json`'s indentation. It says `npm ci` now, with the reason.

It is 129 lines. The subsystem table is the shape that survives another six months: a row
per thing with its route prefix, pointing at `CLAUDE.md` for anything with reasoning behind
it, so the README does not become a second place the rules are written down and drift.

## Verified

- **`svelte-check` 0 errors / 37 warnings / 31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`.** Baseline re-derived on this branch
  at branch time with the two public env values exported before `svelte-kit sync`, and
  identical after. Unchanged in both numbers and mix.
- **Full suite 385 files / 7575 tests, all passed**, as the branch-time baseline. The
  touched files re-run green afterwards (`html-assignment-port`, `html-assignment-bridge`,
  `legacy-assignments`, `assignment-cache`, `claude-md`: 5 files, 124 tests).
- `node tools/claude-md-check.mjs`: "CLAUDE.md agrees with the tree."
- **The harness rendered in a real Chromium** against the dev server: the `<iframe>`
  carries `sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"`, the prose
  `<code>` carries the identical string, and the frame has its `blob:` src.
- `classroom-updates.json` parses, 154 entries, none missing a required field, and
  `recentUpdates(3)` now leads with the sketch entry. The diff is 31 added lines and no
  reformat. No em dashes and no jargon on the added lines.

## Not verified

- **No WebKit**, so the iPhone half of the Foundry entry's claim is described from 0148's
  own measurements and its own statement that the `100dvh` half could not be driven in this
  container. Nothing here re-measured it.
- **No production read of the update log**, no signed-in session, no live Supabase. The
  local `.env` is a placeholder project.
- **`npm run verify:browser` was not run**: no route spec is added and no `/dev` surface
  changed except the fixtures harness, which was driven directly instead and reported
  above. `npm run verify:readme` deliberately not run, for the same reason.
- **The two console errors on the fixtures harness were not controlled against `HEAD`**: a
  Google Fonts stylesheet refused by the framed fixture's own contract CSP, and an
  `ERR_CONNECTION_RESET` for the same request, which is the container's documented outbound
  block. Neither is reachable from a diff that touched an import, a sandbox attribute, a
  comment and one sentence of prose.
- **The sketch entry's wording is a draft.** It is in the final report for Mr. Pina to
  change, and it shipped in the state he leaves it.

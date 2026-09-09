---
title: "The export that doubles a student's sketches, audited across the whole IDEA113 blade family and fixed in the one file that had it (`claude/idea113-export-doubling-fct5fc`, no migration)"
date: 2026-09-09
branches: [main]
migrations: []
subsystems: ["Legacy assignments", "IDEA-Blade", "Browser harness"]
---

Prompt 0105. No migration. Prompt 0103 fixed `idea100-blade-01.html`, whose
`downloadHTML()` cloned the LIVE document and then appended the collected data to the
clone, so the exported file rendered its sketches and its extra table rows a second time
on open. It reported the same shape in the five `idea113-blade-*` files. This bundle
audited all six, measured the defect by round trip in a real Chromium over `file://`,
and fixed **one** of them: `idea113-blade-01.html`. The other four were measured clean
and were left alone.

## The base

`origin/main` at `99255036`, working directory `/home/user/idea-app`. The harness minted
`claude/idea113-export-doubling-fct5fc` but the prompt directs commits to `main`
directly, so `main` is where they went; the branch carries nothing. `git fetch
--unshallow origin` succeeded and brought the full history plus every `claude/**` branch
and `integration`. Git already carried `Claude <noreply@anthropic.com>`; nothing was set.
The ledger entry `docs/prompt-ledger/entries/0105-idea113-export-defect.md` was the first
commit, pushed alone (`ec017b9d`).

Fresh checkout: `npm ci` (never `npm install` — the lockfile-reindentation trap;
`git status` confirmed `package-lock.json` untouched), then `npx svelte-kit sync` with
the two `PUBLIC_SUPABASE_*` placeholders exported. Baseline `npx svelte-check`:
**0 errors, 37 warnings**, breakdown **31 `state_referenced_locally` / 5
`css_unused_selector` / 1 `perf_avoid_nested_class`**. Unchanged at the end.

## A1: the six files

Measured by reading each file and then by driving it, not by grep alone. The prompt's own
figures are corrected where the tree disagreed.

| file | export | renders images | add-row tables | storage key |
| --- | --- | --- | --- | --- |
| `-01` | `downloadHTML`, clone of the live document, **nothing reset** | yes, `_images` -> `#sketch-preview` | `addMfgRow` -> `#mfg-tbody` | `idea113-blade-01` |
| `-02` | `downloadHTML`, clone **plus** an input/`#comp-body`/`#mfg-sequence-list` reset | no | `addTableRow(tbodyId)` -> `#comp-body` | `idea113-blade-02` |
| `-03` | `async downloadHTML`, clone **plus** an input and four-tbody reset | yes, IndexedDB `imgStore` -> `#ss-mass` `#ss-iso` `#ss-top` `#ss-side` | `addBoltRow`, `addDevRow`, `addDevLogRow`, `addTableRow` | `idea113-blade-03` (plus `-autosave`, `-fitcalc`, `-mod-<n>-collapsed`) |
| `-04` | `async downloadHTML`, clone **plus** an input, three-tbody and two-container reset | yes, `imgStore` -> `#asm-photos` | `addMfgRow`, `addChangeRow`, `addStepRow` | `idea113-blade-04` (plus `-autosave`, `-mod-<n>`) |
| `-05` | `downloadHTML`, clone **plus** an input, match-card, rebuild and instructor-score reset | no | `addRebuildRow` -> `#rebuild-body` | `idea113-blade-05` (plus `-autosave`, `-mod-<n>`) |
| `-05-qr` | none | no | none | none |

**Two of the prompt's four measured claims were wrong, and the tree won both times.**

- "`-03`, `-04` and `-05` did not match `STORAGE_KEY` and may name it differently or not
  at all." They all three declare `const STORAGE_KEY=...`, without the spaces around `=`
  that the grep looked for. All five files use the same name.
- "Only `-01` contains an `_images` array, so the sketch-doubling half may be confined to
  it." True about the identifier and true about the conclusion, but not for the reason
  given: `-03` and `-04` hold images in a variable called `imgStore` backed by IndexedDB,
  so they very much render images. What confines the doubling is something else entirely,
  below.

`-05-qr.html` is a 1,636-byte standalone QR page with no form, no storage and no export.
It needs nothing and was not touched.

## A2: the fix already shipped in `idea100-blade-01.html`

Commit `22016bbd`, "Blade 01: export a blank template plus its data". `downloadHTML()`
still clones `document.documentElement`, but before the collected data is appended to the
clone it EMPTIES the two regions that `loadData()` rebuilds from that data: it sets
`#sketch-preview`'s `innerHTML` to `''`, and it removes every `#mfg-tbody` row whose
`data-row` is not 1 through 5. The exported file is then a blank template plus its data,
never a template plus its data plus a picture of its data. It costs nothing, because the
embedded data is what restores both regions on open, and it drops the duplicated base64
from the file as well. That is the shape reused here verbatim, with the comment rewritten
around this file's own measured numbers.

## A3: which files actually have the defect, and the reason only one does

Driven per file in the harness Chromium (141.0.7390.37, `/opt/pw-browsers/chromium`,
`playwright-core` 1.56.1) over `file://`: fill one field in each module, upload two
images where the file supports them, caption them, add one table row, export, then open
the exported file in a FRESH browser context and read it back.

**`-01`: the defect is present, in both halves.**

| | live before export | exported file reopened |
| --- | --- | --- |
| `#sketch-preview` items | 2 | **4** |
| their captions | `CAP-0-0`, `CAP-0-1` | **`(blank)`, `(blank)`,** `CAP-0-0`, `CAP-0-1` |
| `#mfg-tbody` rows | 6 | **7** |
| elements carrying a `data-field` | 43 | **46** |
| duplicated `data-field` | none | **`mfg-06-p` x2, `mfg-06-c` x2, `mfg-06-w` x2** (all `textarea`) |

The two blank captions are the first two items, and they are blank because an input's
live value is not serialized into `outerHTML` — so the copies that came from the clone
markup arrive stripped of the caption the student typed.

**`-02`, `-03`, `-04`: measured clean. `-05`: measured clean. None was edited.**

`-02` and `-05` reset every script-built region in the clone already. `-03` and `-04` do
not reset their image containers — and it does not matter, which is the finding that a
code read alone would have got wrong. Their `renderImgs(zone)` opens with
`c.innerHTML=''`, so it CLEARS the container before rendering, where `-01`'s
`renderImageItem` only ever appends. A self-clearing renderer makes the stale clone
markup unreachable. Measured: `-03` 2+2 images and 1 row in, 2+2 images and 1 row back,
15 `data-field` elements before and after, no duplicates; `-04` 2 images and 1 row in, 2
images and 1 row back, no duplicates.

Per the prompt, they were left alone rather than edited to make the set uniform.

One reading of `-04` looked at first like a lost field — the harness reported
`module-1-field` coming back empty. It is a harness artefact, not a defect: the harness
re-finds "the first text control in module 1" and the rebuilt step row puts a different
control first. Read directly, the exported file carries
`stepDescs: ["RT-1-module-1-field", "(empty)"]` and an embedded
`_stepRows: [{desc: "RT-1-module-1-field"}, {desc: ""}]`. Nothing was lost.

## The fix

`idea113-blade-01.html`, `downloadHTML()`, 25 added lines and nothing removed: the same
two resets as `idea100-blade-01.html`, with a comment carrying this file's own measured
numbers. Round-tripped again afterwards:

| | before the fix | after the fix |
| --- | --- | --- |
| 2 sketches in -> out | 2 -> **4** | 2 -> **2** |
| captions | two blanks prepended | both preserved, in order |
| 6 mfg rows in -> out | 6 -> **7** | 6 -> **6** |
| `data-field` elements | 43 -> **46** | 43 -> **43** |
| duplicated `data-field` | `mfg-06-p/c/w` x2 | **none** |
| module fields restored | 5/5 | 5/5 |

Stable over a second generation: exporting the fixed export again gives 4 images and 7
rows for 4 images and 7 rows, still with no duplicate `data-field`.

And it halves the file. With two 1.85 MB photos the `-01` export goes from **10,176,104
bytes to 5,133,000 bytes**, because the base64 payload was being written twice — once as
`<img src="data:...">` in the cloned markup and once in the `__ib_data__` JSON. Counted
directly in the exported bytes, `data:image/png;base64,` occurs **4** times before the
fix and **2** after, for two uploaded pictures.

## A4: students have already exported these, and what that costs

**Yes, and the run is over.** IDEA-113 IDEA-Blade is a discontinued 2025-26 course
(`ARCHIVE_COURSES` in `src/lib/curriculum.ts`, "Discontinued 2025-26 courses ... Kept for
reference; the assignments remain open"). The files entered this repo already written, in
`b3e7e16d` / `b9f3dd06` on 2026-06-20, carried over from the static site — so the class
that used them used them in their defective form, from the old portal, for a whole year.
Whatever they exported is already in Google Classroom. This fix protects a future reader
of the archive, not a live class.

**The data inside an already-doubled export is intact.** Measured on a real doubled
export: the embedded `__IB_DATA__` holds `_images` of length **2** (not 4), both captions
correct, and `_mfgRowCount` **6** (not 7); re-running `collectData()` on that same
doubled document returns the same correct values. The doubling is in the rendered markup
only. Nothing a student typed before the export was lost by exporting.

**It is repairable, but not by the student.** Transplanting a doubled export's own
`<script id="__ib_data__">` block into the fixed template gives exactly 2 sketch items
with the right captions, 6 mfg rows, and no duplicate `data-field` — a clean recovery.
But the file IS the app: there is no import control, so the repair is an HTML edit
somebody has to make on the student's behalf, one file at a time.

**Two things get worse if a doubled file keeps being used, and Mr. Pina should know
both.**

1. **It compounds.** Re-exporting from a doubled file gives **6 preview items and 8 mfg
   rows**, with `mfg-06-p`, `mfg-06-c` and `mfg-06-w` each appearing **three** times. Each
   generation adds one more copy.
2. **Work typed into a doubled file can be silently discarded, and it is the copy nearer
   the top of the table that loses.** With distinct text typed into both `mfg-06-p`
   controls, `collectData()` keeps `TYPED-INTO-COPY-2` and drops `TYPED-INTO-COPY-1` —
   last-in-DOM-order wins, and the surviving copy is the lower one. A student filling in
   the row they see first is the case that loses. This is the serious half the prompt
   named, measured.

## The unfixed copies on the `mrpina-dev/IDEA` portal, confirmed rather than assumed

Not owned here, and reported as the prompt asks. `add_repo` for `mrpina-dev/IDEA` was
denied in this session, so the repository itself was not read; the SERVED copies were
fetched instead, and they settle it.

All six are live and answer HTTP 200 at
`https://mrpina-dev.github.io/IDEA/idea113-blade-<nn>.html`, and every one is
**byte-identical (md5) to this repo's pre-fix file**:

```
-01     559b0cd5662072f8ec415b9bcf58c67b
-02     bb72e553efe757ee808201528f5ba792
-03     e2e39966e0d082f7020ce065bcd924fe
-04     7dc8f0e29e2eb74468497cd9fa40d6bf
-05     93a4b19d91dd7e662dcb100e21cb0cf1
-05-qr  31ebe06857defb8475d32ef4c7c4de9b
```

The portal copy of `-01` contains `documentElement.cloneNode` and zero occurrences of
`clonePreview`: unfixed, exactly as the prompt claimed. After this bundle the two trees
disagree on `-01` and agree on the other five.

**A wrinkle worth knowing: the portal's INDEX no longer serves these, but the files
themselves still answer.** `https://mrpina-dev.github.io/IDEA/` is now a redirect notice
whose only link is `https://idea-app-sage.vercel.app/` (which `vercel.json` 308s on to
`ideabosco.com`, so it lands right). The assignments are not linked from it, and
`/IDEA/assignments/idea113-blade-01.html` is a 404. But the flat
`/IDEA/idea113-blade-01.html` URLs are all still 200, so a bookmark, a QR code or a
Classroom link minted last year still reaches the unfixed copy. Deleting or redirecting
those six paths is the only thing that closes it, and it is not this repo's to do.

## Two defects found and deliberately NOT fixed

Both are in `-01`, both predate this bundle, and both are outside what prompt 0105 owns.
Reported rather than folded in, because the prompt says to fix the export defect and not
to widen.

1. **`-01` identifies an image by its bytes, so uploading the same picture twice
   corrupts its captions and its delete.** `cap.oninput` and the remove button both do
   `images.findIndex(i => i.dataUrl === dataUrl)`, which returns the FIRST match.
   Measured, and identical before and after this bundle's change (so it is not
   introduced here): upload one file twice, type `CAP-0` and `CAP-1` into the two caption
   boxes, and the page shows `["CAP-0","CAP-1"]` while what is STORED is
   `["CAP-1","(blank)"]` — the second box wrote into the first entry and the second entry
   never got a caption. The delete button has the same shape, so pressing x on the second
   copy removes the first entry from the data while leaving both previews on screen. The
   fix is an identity that is not the payload (a per-image id), which is a change to the
   stored `_images` shape and belongs in its own bundle.
2. **`-03` and `-04` write every photo into the export twice.** Same root cause as the
   fixed defect — the clone keeps the rendered `<img src="data:...">` markup while the
   JSON carries the same base64 — but it does not double on screen, because their
   renderers self-clear. Counted in the exported bytes: `data:image/png;base64,` occurs
   **8** times for `-03` with four pictures and **4** times for `-04` with two. With 1.85
   MB photos that is a **20,405,896-byte** `-03` export and a **10,217,959-byte** `-04`
   export, roughly half of each being the duplicate. Emptying `#ss-mass`/`#ss-iso`/
   `#ss-top`/`#ss-side` and `#asm-photos` in those clones would halve both, and it is a
   one-line change in each — but the prompt says a file that does not need the fix is left
   alone and the set is not made uniform, and these do not have the defect the prompt
   defines. Mr. Pina's call.

## Verification

- `npx svelte-check`: **0 errors, 37 warnings**, breakdown **31 / 5 / 1**. Unchanged from
  the baseline taken before any edit.
- `npm test`: **327 files, 6525 tests, all passing**, 317.29s.
- Round trip in the harness Chromium over `file://` for all five form files, before, and
  again for `-01` after, plus a second-generation round trip on the fixed export. Numbers
  above.
- The `mrpina-dev` portal copies fetched over HTTPS and md5'd against this repo's
  pre-fix files.

## NOT verified

- **Nothing was checked in a signed-in session or against the live Supabase project.**
  These are public `/assignments/<slug>` pages served from a raw import and read no
  session, so there was nothing to sign in to, but the SERVED page was not opened —
  the round trips ran against the raw files over `file://`, which is how a student uses
  an exported copy but not how they first open one. `rewriteLegacyLinks` and
  `injectVersionBadge` operate on the served string and were not exercised here; neither
  touches `downloadHTML`.
- **No real phone photo, no real HEIC, and no iOS or Android browser.** The images were
  synthetic PNGs, two tiny and two of 1.85 MB. The size figures are therefore about
  payload duplication, not about what a particular camera produces.
- **`mrpina-dev/IDEA` as a REPOSITORY was not read** — `add_repo` was denied. Everything
  said about it above is from its served bytes.
- **No visual or layout pass.** `npm run verify:browser` covers `/dev` routes and these
  are not among them, and this change alters no markup, no stylesheet and no rendered
  geometry — the 25 added lines run only inside the export handler.

## Not written

No `classroom-updates.json` entry. The standing directive is for a change to what a CLASS
sees; IDEA-113 is a discontinued course with no roster, and its assignments sit on the
public archive rather than on any classroom surface. No migration, so no apply list.

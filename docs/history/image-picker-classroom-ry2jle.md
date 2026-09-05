---
title: "The image control asks for a filename; give it a picker (`claude/image-picker-classroom-ry2jle`)"
date: 2026-09-05
branches: [claude/image-picker-classroom-ry2jle]
migrations: []
subsystems: ["Classroom", "Dev harnesses", "Testing"]
---

Prompt 0041. Prompt 0030 shipped a picture in an item body and named, in its own entry, the
thing it could not finish: the editor's Image control ASKED FOR A FILENAME, typed by hand,
because `ContentComposer` passed the editor no attachment list and that prop was not in 0030's
owned set. A key typed wrong produces a body naming a picture that will never load, and nothing
on any screen says so until a student opens the page three days later. This bundle is the list
that replaced the text box.

Started from `origin/integration` at `e97b18d` (not `main`, which had moved past it at
`1895925`); working directory `/home/user/idea-app`. The container's git already carried a
committer identity, so the "Please tell me who you are" failure that reads like a conflict did
not arise.

## The audit, which is where the shape came from

**A1 -- what the control asked for.** Verified: a free-text `imageRef`, prefilled
`'attachment:'`, plus a free-text `imageAlt`, written into the document as
`{ type: ITEM_IMAGE_NODE.name, attrs: { src, alt } }`. 0030's claim holds exactly.

**A2 -- THE TWO LISTS ARE NOT THE SAME LIST, AND THE ORDERING CANNOT BE FIXED.** This is the
finding the rest of the bundle is built on.

`ContentComposer`'s `existing` is `item?.attachments` minus removals. On an EDIT that is a
strict SUBSET of what the item saves with, so every name in it resolves after the save. On a
CREATE it is EMPTY: the item's attachments come entirely from `FileUploadPanel`'s staged
`File[]`, and `filePanel.runAll(itemId)` cannot run until `res.data.itemId` exists. The upload
needs an item id and the id needs the create. That is 0133's shape, not a bug to reorder, and
no amount of moving code inside the composer changes it.

**What closes the gap is the ALIAS, and it is the reason a picker is possible at all.**
`attachment:<filename>` is keyed on the RECORDED FILENAME, and
`/api/classroom/attachment/+server.ts` derives that from the uploaded file's name by a pure
function -- `sanitizeAttachmentFilename(name.trim().slice(0, 300)) || 'attachment'`. So a
staged file's eventual reference is COMPUTED before a single byte moves, not guessed. Had the
alias been a file id, as MATERIAL_SPEC v2.2 records it deliberately is not, the create case
would have had no honest answer and this bundle would have had to leave the text field
standing.

The one residual case is an upload that FAILS. The composer already keeps that file staged,
names it in the failure list and retries exactly the rest on the next save; a reference with no
row behind it renders as its caption plus a marker, which is 0030's designed degradation rather
than a broken page. It is not silent either: the row says `Added when you save` before it is
chosen.

**A3 -- what is offered and what is refused.**

Offered: an attachment already on the item whose name reads as a picture and whose alias
actually resolves; a staged student-facing file under the name the item will record.

Refused, each for its own reason and each a silent failure if it got through:

- anything `resolveFigureSrc` refuses -- above all an SVG, which it refuses by NAME and
  independently by STORED MIME, so `sneaky.png` carrying `image/svg+xml` is caught by the half
  a name check cannot see;
- anything whose name does not read as a picture. `resolveFigureSrc` resolves
  `safety-sheet.pdf` perfectly happily -- it decides ACCESS, not whether bytes decode -- so
  without `isImageFilename` the picker would offer a broken picture with a valid reference
  behind it;
- a name a candidate earlier in the list already claims. The alias matches case-insensitively
  and FIRST MATCH WINS, so two rows offering one string are two rows that cannot be told apart
  by the document they produce.

**Instructor-only files are not an input at all**, which is stronger than refusing them:
`imageChoices` has no parameter through which one could be passed. They live in their own
bucket and their own table, an item body's alias resolves against the STUDENT-FACING
attachments only, and a body is read by the whole class.

**A4 -- the predicate is asked, never re-implemented.** `imageChoices` calls `resolveFigureSrc`
on the same attachment list the renderer will be given, and `isImageFilename` for the decode
question. A second copy of either would be the thing that quietly stops agreeing, and here it
would stop agreeing in the worst direction -- by offering a choice the page then declines to
draw, which is this bundle's own defect wearing a picker's clothes.

**A5 -- the counts block.** The prompt says prompt 0039 deliberately recorded two
outside-threshold rows for the spec table's row-action glyphs. **That is true of `main` and not
of `integration`, which is where this bundle was told to start.** Integration's measured region
was taken on `4dc9df8` and its data line reads `outside: 0, outsideRows: []`. The two rows are
on `main`, in `56b26c7`, taken on `700a56d`.

**And integration's measured region was already inconsistent with its own data line**, which
`tests/derived-numbers.test.ts` was already red on before this branch touched anything. The
merge at `28ceeb0` took the CLEAN data line from one side and the outside-rows PROSE line from
the other, so the region read `Measurements outside threshold on that run:` above a data line
saying there were none. Measured directly against the pristine integration README with the
whole branch's code out of the picture. `npm run verify:readme` is what repairs it, and this
bundle was going to run it anyway.

## What was built

**`src/lib/classroom/attachments.ts`** -- new, pure, client-safe, no DOM and no Svelte, which
is what lets the whole rule be asserted in the `node` project without a mount. `imageChoices`
builds the offer; `recordedAttachmentFilename` predicts the recorded name; `isOfferedRef` is
the insert handler's allowlist; `attachmentRef` is the writing half of the scheme
`resolveFigureSrc` reads.

**`RichTextEditor.svelte`** -- two new optional props and one new branch.

**ABSENCE IS THE MECHANISM, and it is what kept this surgical.** `images` is null for a caller
that cannot say which pictures exist, and the control stays the free-text field it has always
been. That is not a courtesy: `SpecProseField` and `CheckInGuidance` mount this same editor,
neither is 0041's to change, and neither has an attachment list to offer. `SpecProseField`
already has its own affordance for this -- drop a file, which uploads it and appends the figure
reference -- and it is untouched.

**AN EMPTY ARRAY IS NOT THE SAME AS NULL**, and the difference is the whole of B2. `[]` means
"this surface knows, and the answer is none", which the popover says in words along with how to
leave the state. Falling back to free text there would put the exact defect this bundle removed
back on the one surface that had the information to prevent it -- an item with no files at all,
and a key typed by hand into it.

**The prefill had to go in picking mode, and that is load-bearing rather than tidy.**
`imageReady` reads the reference as non-empty, so `imageRef = 'attachment:'` with nothing
selected would arm Add the moment a description was typed and insert `src: "attachment:"` -- a
reference `resolveFigureSrc` refuses as `empty`. The dangling picture, re-created by the
control built to prevent it.

**The offer is the allowlist.** `applyImage` asks `isOfferedRef` before writing anything, so
"this document can only ever name a picture that was on screen" is a property of the handler
rather than of the markup. A selection left stale by a file being removed mid-edit is refused
there even though the row it came from is gone.

**A NARROWING, NAMED.** The composer's Image control no longer accepts a static path under
`FIGURE_STATIC_PREFIXES` (`/IDEA/...`), because it no longer accepts typed text at all.
Nothing already stored stops rendering -- `ItemBody` and `resolveFigureSrc` are untouched and
were read-only for this bundle -- and the spec markdown path still takes one. The control's own
title has always read "Add a picture from this item's files", so what it advertised and what it
accepted have only now been made the same thing. Keeping a text box beside the picker was the
rejected alternative: it keeps the failure mode available while claiming to have fixed it.

**0030's alt-text contract is untouched**: required, refused rather than dropped,
`aria-disabled` never `disabled` so the control can explain itself, and the sentence on screen
before anything is pressed. The expression is byte-identical, which is what lets 0030's own
assertion keep passing unchanged.

**`ContentComposer.svelte`** -- reads the staged names through `FileUploadPanel`'s existing
`oncountchange`, which already fires on every mutation the panel makes. The count changing IS
the moment to re-read `files()`. `FileUploadPanel` is not in 0041's owned set and did not need
to be: no second callback, no interface change.

## What was measured

**`svelte-check`: 0 errors, 37 warnings**, the baseline, re-derived rather than trusted --
`npx svelte-kit sync` after exporting placeholder `PUBLIC_SUPABASE_URL` / `_ANON_KEY`, since a
fresh clone has no `.env` and reports 11 phantom errors without them. Breakdown 31
`state_referenced_locally`, 5 `css_unused_selector`, 1 `perf_avoid_nested_class`, unmoved.

**Full suite: 5549 tests, 267 files.** The only failures were the two `derived-numbers` cases
above, both counts-region staleness and both cleared by regenerating.

**Browser, `/dev/item-images` and its two alias specs, at 375 and 1440: 6 route/width runs, 108
measurements, 0 outside threshold, 0 console errors, 0px horizontal overflow at both widths.**

- The picker offers 4 of 7 candidates at both widths, ceiling as well as floor -- an EXTRA row
  here is a picture offered that the page then refuses to draw, so the ceiling is the half that
  matters. `schematic.svg`, `safety-sheet.pdf` and `BEARING-RACE.PNG` are each absent by name.
- Tap targets: 285.8x44 at 375px and 412.1x44 at 1440px, 0 of 4 under the floor. The editor
  declares no named density contract, so `IDEA_INTERFACE_STANDARDS` 10 grants it no exception.
- Contrast: a picture's name 7.27:1, the added-on-save chip 7.27:1, the empty-case sentence
  7.27:1, all against the popover's real rendered ground.
- The empty case shows its sentence, 0 rows and 0 free-text fields; the no-picker case shows
  1 free-text field and 0 pickers. Both directions, on both surfaces.
- Every prepare click landed on attempt 1 of 12, against its own `until` predicate rather than
  a timer or a `window` marker, with the page rendering in 492ms to 1017ms. `waitForApp`
  returns on DOM stability, which SSR markup satisfies before hydration, and this control sits
  behind a dynamic import of Tiptap on top of that.

**EACH POPOVER NEEDED ITS OWN RUN, and that is forced rather than a style choice.** Every
`RichTextEditor` instance closes its own popover on a pointerdown outside its wrapper, so
opening the second closes the first. Three cases cannot be measured in one pass, which is why
the empty case and the free-text case are `aliasOf` specs of the same page rather than more
rows on the parent spec. Static counts move 99 to 101 specs and 198 to 202 runs; routes stay 51
because both aliases resolve to `/dev/item-images`, and `/dev` pages stay 82 because no
directory was added.

**Both required positive controls bit, and both files were restored from `cp` copies and
md5-verified.**

1. Offering a key `resolveFigureSrc` would refuse -- the resolver's verdict ignored in
   `imageChoices` -- reddened 2 of 22 cases, including the generated sweep that puts every
   offer back through the resolver.
2. Removing the alt-text requirement from `imageReady` reddened 2 cases across two files: this
   bundle's own and 0030's, which is the better of the two results, because it says the old
   contract is still being enforced by the test that was written for it.

`git checkout --` was not used for either restore. It restores from HEAD, not from what a
mutation saved, and would have discarded this session's uncommitted work along with the
mutation -- the failure mode whose tell is a mutation suite that suddenly all passes.

## What was NOT verified

- **Mr. Pina's check is the one thing nobody has done, and this bundle did not do it either.**
  No real photograph of a real part has been put into a real assignment and confirmed to draw
  for a student. No `attachment:` alias has ever been seen to resolve through the real proxy
  end to end. Every measurement here goes through `registerLocalAttachmentUrl`, the components'
  own dev-harness seam, or through a static `/IDEA/` path -- the proxy needs a session and a
  row that no automated run in this container holds. **The picker being right and the alias
  resolving in production are two separate claims and only the first is measured.**
- The live Supabase project. Nothing here can apply a migration or sign in against production,
  and this bundle carries no migration.
- A signed-in session on any real classroom surface. `/dev/login` against a local stack was not
  run; the local Supabase stack was not needed and was not started.
- The `prefers-reduced-motion` path: the harness reports `no-preference`, so it is not
  exercised. Nothing added here animates.
- Web fonts: the harness blocks every non-loopback request, so all text above is measured in
  the fallback stack.

## Deferred, deliberately

- **`recordedAttachmentFilename` and the record route are two statements of one rule.** 0041
  owns neither `src/routes/api/classroom/attachment/+server.ts` nor a migration, so they are
  pinned together by a tripwire that reads the route's source and asserts its three
  constituents rather than its whole expression. **Folding the route onto the helper is one
  import and belongs to whoever owns that route next.** The duplication is real and is named
  here rather than left for someone to find.
- **A staged file gets no thumbnail.** Its bytes exist nowhere but the browser's memory, and
  drawing one means object URLs and their revocation. The composer's own `FileUploadPanel` is
  already previewing exactly those files a few centimetres below, so the cost was not worth
  paying twice. The raggedness is meaningful rather than unfinished: a row with a thumbnail is
  on the item, a row without one is not yet.
- **`SpecProseField` and `CheckInGuidance` keep the free-text field.** Not an oversight and not
  a second sanctioned pattern -- neither is 0041's to change and neither has a list to offer.
  A future bundle owning `SpecProseField` could hand it the item's attachments; a check-in's
  guidance has no attachment list at all and would need one to exist first.

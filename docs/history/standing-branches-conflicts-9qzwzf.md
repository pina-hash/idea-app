---
title: "Unblocking the standing branches: the changelog conflict is a union of two real entries, and the maps branch was stale against a slug reservation that already existed (`claude/standing-branches-conflicts-9qzwzf`, no migration)"
date: 2026-08-30
branches: [claude/standing-branches-conflicts-9qzwzf]
migrations: []
subsystems: ["Classroom update log", "Short links", "Repository mechanics"]
---

The Integrate workflow was refusing one branch and leaving it untouched:

    Auto-merging classroom-updates.json
    CONFLICT (content): Merge conflict in classroom-updates.json

Two branches were standing, and only one of them was the conflict. This bundle
merges `origin/integration` into both, resolves the one conflict, and pushes.
It writes no feature and changes no behaviour: every line it lands was written
by another session.

## The changelog conflict is a false conflict, and the union is the resolution

`classroom-updates.json` is append-only and the page sorts by date, so POSITION
in the array carries no meaning at all. Both sides had inserted a new object at
index 0, and both new objects open with the identical line `"date":
"2026-08-30",` -- which is the whole of why a line-based merge could not tell
them apart. It is not a disagreement about content; it is two appends landing on
one line number.

**Both entries are real work and both are kept.** `claude/grading-console-
incomplete-indicator-qg0tuy` carried "You can turn work in before every check is
finished"; `origin/integration` carried "Photos you hand in are shown at their
own shape", from `claude/classroom-image-blank-space-11qo8n`. Neither is a
revision of the other and neither supersedes the other.

**THE RESOLUTION WAS COMPUTED FROM THE THREE STAGES, NEVER HAND-EDITED AROUND
THE MARKERS.** `:1:`, `:2:` and `:3:` were read out of the index and compared as
parsed JSON rather than as text, which is what established the shape of the
conflict before anything was written: base 107 entries, each side 108, one
addition per side, **zero removals and zero modifications on either side**. A
hand-edit that deleted a stray brace would have looked identical in the diff and
been invisible until the page failed to load.

**The writer round-trips byte-identically.** `json.dumps(..., indent='\t',
ensure_ascii=False)` was put to the BASE file first and compared against the
base bytes; identical, so the formatting the resolution emits is the file's own
and the diff carries no whitespace churn. Then: ours-only entries, then theirs'
full list. 109 entries, 109 unique.

## The duplicate check is the point of the exercise, and it is semantic

Counting to 109 only proves no OBJECT is repeated. A student reading two entries
that say the same thing in different words has read a duplicate whatever the
objects look like, so the check was made on meaning.

**Exactly one entry announces that work can be handed in before every completion
check is met**, which is the outcome the two sessions intended. `claude/
assignment-submission-ui-sync-g428o2` shipped the STUDENT-facing copy for that
same change (the preflight list stops reading "Before you can submit") and
deliberately wrote no second entry, having read the first; its history entry
names `qg0tuy` twice as the branch the instructor half lives on. Its merge into
integration touched no changelog, which is the evidence rather than the claim.
Nothing had to be dropped and nothing had to be chosen between.

A similarity sweep over all 109 entries (title and first 600 body characters,
every pair) returned 12 candidates above 0.6 on the title. **All twelve are
phrasing, not substance** -- body ratios 0.22 and below, all of them pre-existing
on integration, none involving either entry this resolution combined. The
closest-looking pair is "Photos you hand in are shown at their own shape"
(2026-08-30, aspect-ratio framing) against "Photos you hand in show as photos
again" (2026-08-25, images rendering as download rows after the storage move):
title ratio 0.67, body ratio 0.02, two different changes five days apart.

## The maps branch was not conflicted, it was stale -- against `main`, not integration

`claude/idea-maps-admin-editor-65iyd4` merged `origin/integration` with no
conflict at all, and then reddened two assertions in
`tests/short-link-reserved-names.test.ts`: the branch adds a top-level
`src/routes/maps/` directory, and SvelteKit answers a real route before the
`[shortlink]` catch-all, so `maps` has to be in `RESERVED_SLUGS` or a short link
with that slug could never be reached. The second failure was the file's own
mutation proof, reddening for the same reason -- `uncovered` came back
`["maps", "zz-mutation-proof-stray-route"]` where the positive control expects
the stray alone. One cause, two assertions, which is the sweep working.

**The fix already existed and had to be brought in rather than written.**
`a85927b` on `origin/main` ("Short links: reserve the slug maps ahead of the
IDEA Maps page") is another session's bundle doing exactly this, with `0166`
moving the database mirror in the same commit because the two must move
together. Integration was behind `main` by that one commit and nothing else.

So `origin/main` was merged into the branch as well. That is the ordinary
staleness repair CLAUDE.md already prescribes ("pull the latest `main` into the
branch and resolve every conflict ON THE BRANCH") and it is the opposite of
editing code to satisfy a test: **the alternative was to add `'maps'` to
`RESERVED_SLUGS` by hand, which would have been a second, divergent statement of
a rule that already exists, and would have split it from the migration it is
required to move with.** The merge was verified before committing to bring
`a85927b` and nothing else -- four files, no overlap with anything the branch
touches, no conflict. **No migration number was taken and no `.sql` was
written**; `0166` arrives on the branch as a file that is already on `main`.

## Measured

Both branches, after their merges, on a fresh `npm ci` checkout with
`PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY` exported before
`npx svelte-kit sync` (without them the sync writes a module exporting nothing
and eleven phantom errors land in files no change touched):

  * `claude/grading-console-incomplete-indicator-qg0tuy` -- `svelte-check`
    **0 errors, 37 warnings**, breakdown 31 `state_referenced_locally` /
    5 `css_unused_selector` / 1 `perf_avoid_nested_class`. Suite:
    **211 files, 4404 tests, all passing**, 189s.
  * `claude/idea-maps-admin-editor-65iyd4` -- `svelte-check` **0 errors,
    37 warnings**, same 31/5/1 breakdown. Suite: **214 files, 4420 tests, all
    passing**, 188s.

`tests/coin-public-anon-projection.test.ts` (23 tests) passed on both runs. It
is the known flake another session was repairing concurrently and it was not
touched here; it simply did not fire on either run, so this bundle has nothing
to say about whether the flake is fixed.

**Both branches were then dry-run merged into `origin/integration` in BOTH
orders**, in a throwaway clone: whichever lands first fast-forwards, the second
merges by `ort`, no conflict either way, and `classroom-updates.json` comes out
at 109 entries and 109 unique keys under both orders. Ordering was checked
rather than assumed because the workflow merges whichever branch goes green
first.

## Not verified

No browser pass and no `npm run verify:browser` run: this bundle mounts nothing
and moves no pixel, and both branches' own surfaces were verified by the
sessions that wrote them. Nothing was checked against the live Supabase project.
`0166` is a file on `main` here; whether it is applied to production is not
something this session can see.

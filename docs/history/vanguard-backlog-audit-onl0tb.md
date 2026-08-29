---
title: "The DEV console is removed from a student's bytes rather than declining to activate, the non-admin gate becomes an asserted table, and two dead portal globals go (`claude/vanguard-backlog-audit-onl0tb`, no migration)"
date: 2026-08-28
branches: [claude/vanguard-backlog-audit-onl0tb]
migrations: []
subsystems: ["VANGUARD", "portal injection"]
---

Started as a read-only audit of `docs/VANGUARD_BACKLOG.md` against the code. The
audit's four findings were handed back as claims to verify rather than facts to
act on, which was the right instruction: one of them was stated too strongly and
one of my own test assertions written from it was simply wrong.

### The gate that was not the gate

`+server.ts` strips TUNE from a non-admin's copy of the game by REMOVAL -- the
`?tune=1` check is replaced and the whole balancing panel is regex-sliced out.
The DEV console at `index.html:8000-8275` is a **separate IIFE** that the TUNE
slice never covered, and it shipped to every visitor. It holds god mode and its
damage bypass, spawn suppression, arbitrary wave and boss spawns, a hitbox
overlay and a text command console, and it was held shut only by
`gameMode==='dev'` tests inside its own render loop (`:8262`, `:8268`).

That is a client-side test, of a client-side variable, in a page the client
owns. Today the mode allowlist makes `dev` unpickable so the two gates compose,
but composing is not the same as the capability being absent, and VANGUARD posts
to a ranked leaderboard. It is now removed on the same terms as TUNE.

**REMOVING IT STRANDS NOTHING, AND THAT WAS CHECKED RATHER THAN ASSUMED.** The
block is self-contained; every reference to what it defines lives outside it
behind a guard or is a write. `__devSetGod` and `__devDrawHitboxes` are called
only inside `if (window.__devX)` (`:2183`, `:7990`), `__devInput` only inside
`window.__devInput && ...` (`:5602`), `__devTime` is read as
`(window.__devTime==null?1:...)` (`:7984`), and `__devTime`, `__devStep` and
`__devNoSpawn` are all assigned at run start by code outside the block
(`:2182`). Enumerated by script over the real file, not by reading.

### The mechanism is the hazard, so the gate became data

These are `.replace()` calls against a build this session may not edit.
`String.prototype.replace` neither throws nor reports a miss, so an anchor that
drifts turns a gate off while the handler still answers 200 with a page that
looks right. Adding a fifth replace to a chain of four would have added a fifth
thing that can silently stop applying.

So the four existing replaces and the new one are now `_NON_ADMIN_STRIPS`, a
named table in `+server.ts`, applied by `_stripForNonAdmin()`.
`tests/vanguard-admin-gate.test.ts` imports **that table** rather than a copy of
it and asserts of every entry, by name: the anchor matches the shipped build
EXACTLY ONCE, it is absent from a student's copy, it survives in an admin's, and
it is not a global regex (which would make "exactly once" meaningless). A strip
added later is covered the moment it is added. The list length is pinned so a
sweep that generated nothing cannot pass.

**THE `_` PREFIX IS LOAD-BEARING AND IS NOT A NAMING PREFERENCE.** SvelteKit
validates `+server.ts` exports (`validate_server_exports`, called from
`runtime/server/respond.js` and `core/postbuild/analyse.js`) and THROWS on any
export outside the HTTP-method set -- except keys beginning with `_`, which
`utils/exports.js` skips explicitly. Exporting `NON_ADMIN_STRIPS` would have
thrown at runtime in production and taken VANGUARD down; it would not have been
caught by `svelte-check` or by the suite, because vitest imports the module
directly and never goes through SvelteKit's router. Checked in `node_modules`
before writing the export, not after.

### Mutation proof

This is an exclusion sweep on a security boundary, so per `CLAUDE.md` the test
had to be proven to bite. Three mutations, each in the permissive direction,
against `tests/vanguard-admin-gate.test.ts` (22 tests):

- **anchor drift** (`dev mode` -> `dev tools` in the `devConsole` pattern, which
  is what an upstream rename to `index.html` would look like): 3 failures, the
  first naming `devConsole: anchor must match the build exactly once`.
- **gate never applies** (`if (!isAdminUser)` -> `if (false)`, the end state a
  silent no-op produces): 7 failures, every non-admin exclusion assertion.
- **entry silently dropped from the table** (someone "tidies up"): 2 failures,
  the pinned length and the DEV console absence.

`src/routes/vanguard/+server.ts` restored byte-identically after each
(`md5sum -c`, OK).

### Measured

| | bytes |
| --- | --- |
| `index.html` on disk | 732,833 |
| served to an admin | 768,421 |
| served to a non-admin | 736,331 |
| removed for a non-admin | 32,090 |

Per strip: `devConsole` cuts 21,646 and writes back a 25-byte comment;
`tunePanel` cuts 10,388 for 34; `devModeButton` 49 for 0; `modeAllowlist` 67 for
44; `tuneQueryHook` 67 for 24. An admin receives the file unmodified plus the
injection. Before this bundle a non-admin received 757,952 bytes -- the 21,621
net difference is the console.

### The two dead globals

`window.__ideaIsTeacher` (one reference repo-wide, the assignment) and
`window.__ideaSignedIn` (likewise) were set on every load and read by nothing.
Both deleted, with the `IS_TEACHER` local and the `isAdminUser` parameter to
`injectionScript` that existed only to feed the first.

`__ideaIsTeacher` published the viewer's admin status into a global on a page
that runs a student's game. `__ideaSignedIn` is the more interesting one: it had
a plausible consumer, since the REPORT box must choose between the signed-in and
anonymous endpoints -- but that choice is resolved server-side and baked into the
injected `FB` object, so the flag was never read. A hook whose natural consumer
was built the other way, not a half-built feature.

`window.__ideaGameInfo` was left alone: it has a live reader in the report box
and exists because the game body is one IIFE.

### What the audit got wrong, and what I got wrong

The audit said the DEV console assertion could name `window.__devSetGod`. It
cannot: that name also appears in the **guarded call sites outside** the block,
which correctly survive. The first test run failed on exactly that, which is the
test doing its job. The assertion now names the definitions
(`window.__devSetGod=function`) and a second test asserts the guarded call sites
are still present -- the other half of "removing it strands nothing".

I also ran `npx prettier --write` on `+server.ts` out of habit. **This repo has
no prettier config**, so it applied 2-space defaults to a tab-indented file and
turned a surgical change into 244 insertions / 163 deletions. Reverted and redone
by hand; the diff is 91/30. Do not run prettier in this repo without a config.

### The backlog

Rewritten in place, 193 -> 331 lines. The corrections: DEV described as ungated
(it is gated, by removal, on the portal side); "two dev-only query flags" (there
are three -- `?vgheadless=1` swaps rAF for a `MessageChannel` pump and is the flag
a browser-verification session needs, the VANGUARD twin of `?glheadless=1`);
section 2 conflating a server-removed panel with a client-checked console; and
section 4's category tally, which summed to 31 only because 194 and 198 were
counted twice while 187 and 211 fell into no category -- the union was 29. Header
moved 212 -> 213.

**THE STRUCTURAL NOTE AT THE TOP IS THE FINDING WORTH KEEPING.** The file is
organised by build number; build numbers only track `index.html`; so a fix made
in `+server.ts` can never appear in section 4, and section 4 can never close an
item in section 2. That is precisely why the DEV entry was wrong and why nothing
in the document could have revealed it. Anyone reading section 2 has to be told
it cannot report portal-side gating from build history.

`VERSION='213'` with the newest `CHANGELOG` entry at 212 is recorded as the
failure mode that makes section 4 quietly incomplete. The tooling build 185
refers to **does exist** -- `tools/post-commit-vanguard.js` -- and is **not
wired**: no `.git/hooks/post-commit`, `core.hooksPath` unset, both re-checked
here. Its own header explains that a local git hook cannot work in a cloud-only
workflow of fresh ephemeral clones, and that the uptick is happening by hand,
which is how 213 came to have no entry.

### Reported, not changed

`flattenForDevice`, `Snapshot` and `PrefBucket` in `src/lib/vanguard-save.ts`
are all zero-reader. That file was not this session's to edit; the recommendation
is in the session report and the hazard is now stated more precisely in the
backlog (`mergeIntoStored` does clean the migrated keys out of pref buckets on
write, so `flattenForDevice`'s shadowing risk is confined to rows not yet
rewritten).

### Verification

- `svelte-check`: **0 errors, 37 warnings**, mix 31 `state_referenced_locally` /
  5 `css_unused_selector` / 1 `perf_avoid_nested_class`. Baseline held exactly,
  before and after.
- Full suite: **138 files / 3174 tests before, 138 files / 3186 after**, all
  passing. The +12 is `vanguard-admin-gate` going 10 -> 22.
- **NOT verified:** nothing was run in a browser. No signed-in session, no
  admin session, no Vercel preview, no live Supabase. The gate is verified
  through the real `GET` handler against the real file on disk with a stubbed
  `locals.supabase`, which is where the transform happens, but nobody has loaded
  `/vanguard/` and pressed anything. `npm run build` was not run.
- **Not attributable:** this repo's history is squashed to a root commit
  (`17fc421`, 2026-08-26), so `git log -S` cannot date when the DEV-button strip
  was added. No build number is claimed for it.

### Deferred

`CLAUDE.md` was not edited. The removal-versus-runtime-check distinction is
arguably a rule worth promoting, but that file was not in this session's
ownership list and two other sessions were live; a concurrent edit there is the
shared write point the history split exists to avoid. Flagged in the session
report instead.

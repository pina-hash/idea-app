# 0151 Open redirect on the OAuth callback, and two SSRF gaps in link preview

- Issued: 2026-09-11
- By: a security session, carrying two confirmed defects found by reading the
  source on 2026-09-11 and a third gap referred back as a decision.
- Owns: `src/routes/auth/callback/+server.ts`,
  `src/lib/server/link-preview.ts`,
  `src/routes/api/classroom/link-preview/+server.ts`, `tests/auth-callback*`,
  `tests/link-preview*`, `docs/prompt-ledger/entries/0151-*`, the decision
  entry it raises, and its own `docs/history/` entry. NO OTHER SOURCE FILE.
  Ledgers 0147 through 0150 run in parallel and own classroom, notebook,
  foundry and legacy surfaces; none of them was touched, including
  `tests/classroom-link-preview.test.ts`, which sits under a name this bundle
  does not own even though it covers a module this bundle does. That file was
  RUN and passes unchanged.
- Migration permitted: NONE. None was written, and nothing in this bundle
  touches `supabase/migrations/`.
- Claims: none.
- Status: issued
- Branch: `claude/blissful-ritchie-sk8orl`, branched from `origin/integration`
  at `7be051f6`.
- Notes:

  **DUPLICATE CHECK, CLEAN, BOTH HALVES.** No
  `docs/prompt-ledger/entries/0151-*` existed on any ref: every
  `refs/remotes/*` and `refs/heads/*` was swept individually with
  `git ls-tree -r --name-only <ref>` filtered to
  `docs/prompt-ledger/entries/0151-`, and the sweep returned nothing on any of
  them; `git log --all --diff-filter=A -- 'docs/prompt-ledger/entries/0151-*'`
  likewise returned nothing. The 44 standing `claude/**` and `codex/**`
  branches were then swept a second way, by diffing each against
  `origin/integration` and flagging any whose whole diff is a ledger file: two
  came back, `claude/lucid-mccarthy-88p4bl` carrying only
  `docs/prompt-ledger/entries/0148-foundry-fullscreen-ios.md` and
  `claude/quirky-euler-w4qqzt` carrying only
  `docs/prompt-ledger/entries/0150-idea100-blade-image-order-and-template-route.md`.
  Both are the parallel lanes named in the prompt, neither is 0151.

  **THE THREE OPENING CHECKS, REPORTED AS ASKED.** The repository was already
  complete, so `git fetch --unshallow origin` had nothing to do and the
  `|| git fetch origin` fallback ran;
  `git rev-parse --is-shallow-repository` answers `false` and 2074 commits are
  reachable from `HEAD`. `git fetch origin integration` succeeded.
  `git config user.name` -> `Claude`, `user.email` ->
  `noreply@anthropic.com`.

  **DEFECT ONE, CONFIRMED BEFORE IT WAS FIXED.** `src/routes/auth/callback/+server.ts`
  line 11 read `const next = url.searchParams.get('next') ?? '/dashboard'` and
  line 16 `redirect(303, next)`, with nothing between them. `_safeNext` now
  accepts a same-origin relative path and answers `/dashboard` for everything
  else, refusing in four layers: a control character (a browser STRIPS tab,
  newline and carriage return before resolving, so a tab between the slashes
  leaves the browser as `//evil.example`), a backslash, anything not starting
  with exactly one slash, and an origin re-check after resolving against a
  fixed unreachable base. It is exported under the `_` prefix SvelteKit
  requires of a non-method export from a `+server.ts`, which is the mechanism
  `src/routes/vanguard/+server.ts` already uses.

  **DEFECT TWO, BOTH HALVES CONFIRMED BEFORE THEY WERE FIXED.**
  `isBlockedHost('::ffff:127.0.0.1')` answered `false` under the deployed body,
  run directly; line 200 read `redirect: 'follow'`. Both are closed. Two
  measurements shaped the fix: WHATWG `URL` already canonicalizes decimal,
  octal and hex IPv4 (`http://2130706433/` arrives as `127.0.0.1`), so those
  were never a gap and are now pinned rather than newly handled; and `URL`
  canonicalizes `[::ffff:127.0.0.1]` to the HEX form `[::ffff:7f00:1]`, so a
  check written against the dotted spelling would not have caught it either.
  The IPv4 POLICY did not move -- same five ranges, same regexes -- only what
  arrives at them. A third, incidental defect was fixed on the way: the
  `fc`/`fd` IPv6 prefix was tested against the BARE hostname, so `fcc.gov`,
  `fdic.gov` and `fdn.fr` were all refused for their first two letters
  (measured). It only ever over-blocked.

  **THE THIRD GAP WAS NOT IMPLEMENTED, AND THAT IS THE PROMPT'S OWN
  INSTRUCTION FOLLOWED RATHER THAN A SHORTFALL.**
  `docs/decisions/entries/23-link-preview-dns-pinning.md` carries it with
  `Status: open`, three options and the one I would pick. It cannot be done
  cleanly here, measured: `undici` is not a dependency and
  `require('undici')` answers `MODULE_NOT_FOUND` (the lockfile's only related
  entry is `undici-types`, types-only), so
  `new Agent({ connect: { lookup } })` is unreachable; the internal `Agent`
  IS reachable after one fetch via `Symbol.for('undici.globalDispatcher.1')`
  and is refused precisely because a Node upgrade would drop the protection
  SILENTLY. Nothing was half-resolved.

  **VERIFICATION.** `svelte-check` 0 errors / 37 warnings at 31/5/1,
  re-derived at the baseline and again at the end with the two `PUBLIC_`
  values exported before the sync (this checkout has no `.env`). It caught a
  defect of my own that vitest could not: a table in the new auth test
  annotated `[string, string][]` while holding 3-tuples, 11 errors in 21
  files until corrected. Full suite at the baseline 378 files / 7454 tests,
  matching the prompt's figure; at the end 380 / 7526, exit 0 -- the delta is
  exactly this bundle's two files and 72 tests. **11 mutations, 11 killed,
  every file restored byte-identical by md5 from a `cp` taken before any
  mutation ran; `git checkout --` was not used anywhere.**

  **MY FIRST INSTRUMENT WAS VACUOUS AND WAS REBUILT, which is the finding
  worth carrying.** Asserting the redirect fix by pointing the fetcher at a
  local server with `allowPrivateHosts: true` proves nothing: that flag turns
  the guard off wholesale, so the hostile hop is PERMITTED, and the resulting
  `ok: false` is the metadata service being unreachable rather than a
  refusal. A spy on `globalThis.fetch` does not rescue it either, because
  under `redirect: 'follow'` undici walks the chain INSIDE itself and no spy
  at that boundary sees hop two. Restoring the original `redirect: 'follow'`
  killed 1 assertion of 8. Rebuilt with the guard fully on, a PUBLIC host the
  guard permits mapped onto loopback, and a separate PRIVATE server that logs
  what reaches it, the same mutation kills 6 of 34 and the pre-fix host guard
  kills 4.

  **NO ENTRY WAS ADDED TO `classroom-updates.json`, deliberately.** The
  standing directive's bar is what a student will notice and do differently,
  and neither change clears it: one is a `Location` header on a sign-in hop
  and the other is which links a card can be built for. It is also a file
  four parallel lanes may be appending to, and this bundle does not own it.
  Raised here rather than left silent.

  **NOT VERIFIED, STATED AS A RESULT.** No browser pass, and none is owed --
  neither change has a rendered surface. Nothing was run against the live
  Supabase project. The real Google OAuth round trip was not exercised;
  `_safeNext` is asserted directly and the handler around it is unchanged
  apart from the one call.

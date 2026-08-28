---
title: "The bundle root, which is the only URL the frame ever requests"
date: 2026-08-24
branches: []
migrations: []
subsystems: ["IDEA Foundry"]
record_order: 133
---

## The bundle root, which is the only URL the frame ever requests

`lane/foundry-entry-path`. No SQL.

Every app ever published rendered blank. The frame's `src` is
`https://apps.ideabosco.com/r/{token}/` -- the bundle root, no filename -- and
that document request answered a bodyless 404. Measured on production before
any of this: the mint returned 200 for the published app "breakout", the frame
requested the root, the response was 404 at 0.3 kB (a transfer size, so a
bodyless refusal rather than a CSP block), and `student_app_files` held exactly
one correct row for the version. Data right, token right, document refused.

### What it was

`isFoundryProxyPath` required a slash AFTER the token segment:

    return afterPrefix.indexOf("/") > 0;

So `/r/{token}/` passed and `/r/{token}` did not. The route already had a 307
from the slashless form to the slash form and it could never run, because the
HOOK answered first with `foundryNotFound()`. Anything that normalizes a
trailing slash anywhere between the browser and the function therefore turned
the frame's one request into a refusal, with the database never consulted.

The refusal was added deliberately, to close a real oracle: the route verified
the token BEFORE redirecting, so a good token answered 307 where a bad one
answered 404 -- the one place on that host where two outcomes did not look
alike. The oracle was real; refusing the path was the wrong lever, and the cost
of the wrong lever was every published app.

### What it is now

Two changes, and the second is what makes the first safe.

- `isFoundryProxyPath` allows `/r/{token}` when the token segment is non-empty.
  Every shape naming no token -- `/r`, `/r/`, `/r//...` -- is still refused, and
  those are the ones that used to reach the router and get answered by the
  portal's own error page on the bundle origin (the hole 0133 closed).
- The route's 307 moved AHEAD of `verifyFoundryToken`. Every slashless root now
  answers 307 whatever the token is, so the redirect discloses nothing and the
  token is judged on the request that follows.

The entry is still never SERVED at the slashless spelling. `/r/<token>` has
`/r/` as its base URL, so a bundle's `<img src="logo.png">` would resolve
outside the bundle; the redirect is what makes the shape work without giving up
the base-URL rule.

### Why nothing caught it, which is the part that matters

There WAS a bundle-root test, and it passed throughout. It called the route
handler directly with hand-built `params`:

    proxyGet({ params: { token, path: '' }, url, request })

That skips the hook entirely, and the hook is where the refusal lived. Every
other test and every verification drive named an explicit filename. So the
suite asserted the route resolves an empty path to the entry -- which was true,
and never the question.

`tests/foundry-proxy.test.ts` now has a block that composes the REAL
`foundryHostBranch` with the REAL route handler as its `resolve`, the way
`sequence()` runs them, and drives all three spellings: the root with its slash,
the root without it (asserting the 307 AND following it to the entry file), and
the explicit `index.html`. The only thing standing in for SvelteKit is the param
split, written to the route pattern and nothing else. It also asserts a garbage
token answers the slashless root identically, and that all three spellings 404
on the main host. `foundryHostBranch` is exported from `hooks.server.ts` for
exactly this -- re-spelling `appsHostAllows` inside a test would be a second
copy of the allowlist, which is how this went unseen in the first place.

The pre-existing allowlist assertion listed `/r/tok` among the shapes that must
be refused. It was generalized rather than deleted: the rule is now "a `/r` path
is allowed only when it names a non-empty token segment", with the slashless
root moved into the allowed list beside a comment pointing at the block that
asserts it is redirected rather than served.

The dev harness at `/dev/foundry-proxy` already framed the bare prefix (its
`at(token)` defaults to an empty path), so the frame itself was right. What it
lacked was the slashless spelling as a clickable case; it has one now, plus the
explicit-filename case, so a regression here is visible locally instead of only
in production.

### Measured

- Mutation, both directions, restored byte-identically and re-verified green.
  Reverting `isFoundryProxyPath` to refuse the slashless root reddens 3 tests;
  breaking the empty-path-to-entry resolution in `resolveBundleFile` reddens 3
  (including the pre-existing bundle-root test, which is the positive control
  that the new block is not the only thing watching).
- Against the REAL adapter output, not just dev -- `npm run build`, then the
  generated function driven with Supabase stubbed at the `fetch` boundary and
  only the one row that exists answering:

      /r/{token}/           200  6134b  db asked for index.html
      /r/{token}            307         -> follows to 200 6134b, shim injected
      /r/{token}/index.html 200  6134b  db asked for index.html
      main host, all three: 404  0b

  Before the change the same harness gave `/r/{token}` 404 with the database
  never consulted, which is the bug reproduced in the production artifact.
- Full suite 107 files / 2444 tests green. `svelte-check` 0 errors, 37 warnings
  (31 `state_referenced_locally`, 5 `css_unused_selector`, 1
  `perf_avoid_nested_class`) -- the baseline, unmoved.
- `tests/fixtures/foundry/deflect.html` is the zero-reference control this lane
  was diagnosed against: one self-contained file, inline style, inline script,
  canvas, `requestAnimationFrame`, no `src`/`href`/`@import`/`fetch`/`import`
  anywhere. It separates the serve path from every library and asset question.

### NOT verified

- **Nothing here was verified on production.** The session could not reach
  `ideabosco.com` or `apps.ideabosco.com` at all -- the egress proxy answered
  403 to CONNECT for both -- so there was no mint, no live header read, no
  console, and no browser. Every measurement above is against the built adapter
  output on this machine.
- Which layer was actually eating the trailing slash on Vercel is therefore
  still unestablished. The fix does not depend on knowing: the slashless form
  now resolves wherever it comes from. But if the normalization happens at the
  edge and is a REDIRECT rather than a rewrite, the 307 could in principle meet
  it in a loop -- the adapter's own route regexes all carry `/?`, which argues
  it passes trailing slashes through rather than stripping them, but that is an
  argument and not a measurement.
- The zip round trip was proven byte-clean in Node, not in Deno, and the real
  path is a Chrome `CompressionStream` writer against a Deno
  `DecompressionStream` reader.


---
title: An open redirect on the OAuth callback, and two SSRF gaps in link preview
date: 2026-09-11
branches: ["claude/blissful-ritchie-sk8orl"]
migrations: []
subsystems: ["auth", "classroom"]
---

Two confirmed defects, both found by reading source rather than by a failure, and
both verified in place before anything was written. A third gap in the same
module was referred back as a decision rather than half-fixed.

## ONE: `?next=` on the OAuth callback was an open redirect

`src/routes/auth/callback/+server.ts` read
`url.searchParams.get('next') ?? '/dashboard'` and handed the value straight to
`redirect(303, next)`. Nothing validated it, confirmed by reading lines 11 and 16
of the deployed file.

**It is the most valuable place on the site to have one.** The hop fires
immediately AFTER a successful sign-in; the link that starts it is genuinely on
`ideabosco.com`, so it passes every "check the domain" habit anybody has been
taught; and the person following it has just come back from a Google page, which
is exactly the moment the flow has trained them to trust it.
`?next=https://evil.example` sent a just-authenticated student off-site.

`_safeNext` is the fix and lives in the route itself, under the `_` prefix
SvelteKit requires of a non-method export from a `+server.ts` -- the same
mechanism `src/routes/vanguard/+server.ts` already uses for `_NON_ADMIN_STRIPS`.
It accepts a same-origin relative path and answers `/dashboard` for everything
else. **There is no allowlist of external hosts and there must not be one**: the
callback exists to put somebody back where they were on this site, and every
legitimate value it has ever carried is a path.

Four refusals, in order, and the order is not arbitrary:

1. **A control character.** A browser STRIPS tab, newline and carriage return out
   of a URL before resolving it, so `/<tab>/evil.example` reads as a path to any
   check written here and leaves the browser as `//evil.example`. Refused rather
   than stripped -- stripping is how this function's idea of what the string says
   and the browser's come to differ.
2. **A backslash.** `\/\/host`, `/\host` and `\\host` are all protocol-relative
   to a URL parser and none of them looks like it.
3. **One leading slash, never two.** Two is protocol-relative; a scheme
   (`javascript:`, `data:`, `https:`) has no leading slash at all, so the same
   line refuses it.
4. **An origin re-check after resolving against a fixed unreachable base.** The
   belt behind those braces, and the one that catches a form nobody listed.

## TWO: two SSRF gaps in `$lib/server/link-preview.ts`

`isBlockedHost`'s own comment is right about why it does not resolve hostnames,
and that reasoning is preserved verbatim. Two things it said nothing about were
not defence-in-depth judgements, they were holes.

### An IPv4 address hiding inside an IPv6 literal

`::ffff:127.0.0.1` is loopback and the function answered `false` -- measured
against the deployed body before anything was changed. It is not the string
`::1`, it does not begin `fc`/`fd`, and `/^127\./` cannot match a string
beginning `::ffff:`.

**Two measurements shaped the fix and one of them removed work rather than adding
it.** WHATWG `URL` already canonicalizes the decimal, octal and hex IPv4
spellings -- `http://2130706433/` arrives with `hostname` `127.0.0.1` -- so those
were never a gap, and the guard is now pinned against losing them rather than
taught to catch them. But `URL` canonicalizes `[::ffff:127.0.0.1]` to the HEX
form `[::ffff:7f00:1]`, so **a check written against the dotted spelling would
not have caught it either.** The address is therefore EXPANDED to eight hextets
and any embedded IPv4 extracted BEFORE the rules run, so there is one set of IPv4
rules rather than one per spelling. The deprecated IPv4-COMPATIBLE form
(`::a.b.c.d`) is read the same way, with `::` and `::1` deliberately excluded
from that arm -- they fit the compatible shape, and handing them to the IPv4 arm
is how `::1` would stop being loopback.

**The IPv4 policy itself did not move.** Same five ranges, same regexes. What
changed is only what arrives at them. Widening to carrier-grade NAT, multicast or
`fe80::/10` was considered and left alone: that is a policy change, not a
normalization fix, and it belongs to whoever decides it.

**The `fc`/`fd` test was applied to the bare hostname, which over-blocked.**
`fcc.gov`, `fdic.gov` and `fdn.fr` were all refused for their first two letters
-- measured. It only ever over-blocked, so nothing was exposed, but a teacher
linking one got no card and nothing said why. The IPv6 tests now apply only to a
bracketed literal. An unparseable bracketed host fails CLOSED.

### `redirect: 'follow'` meant only the first URL was ever checked

A public URL that 302s to `http://169.254.169.254/` was fetched, and the guard
never saw the address that was reached. Redirects are followed BY HAND now,
`redirect: 'manual'`, with the same predicate run on every hop and a hard stop at
five. One `AbortController` spans the whole walk, deliberately not re-armed per
hop, so a chain of slow hops cannot add up to a hung page. The final URL is
tracked rather than read off `res.url`, which under `manual` reports the URL that
was REQUESTED and would name the first hop forever -- which is what a relative
`og:image` resolves against.

## THREE: a hostname that resolves to a private address is still not checked

Left open on purpose, with `docs/decisions/entries/23-link-preview-dns-pinning.md`
carrying the three options and the one I would pick. The short version: closing
it properly means resolving, validating, and PINNING the connection to the
address that was validated, and the machinery for that is not reachable here.
Measured on this container, Node v22.22.2: `undici` is not a dependency and
`require('undici')` answers `MODULE_NOT_FOUND` (only `undici-types` is in the
lockfile, and it is types-only); the internal `Agent` IS reachable after one
fetch through `Symbol.for('undici.globalDispatcher.1')`, and reaching it is
refused precisely because a Node upgrade would drop the protection SILENTLY.
Adding the dependency is its own bundle -- `package.json` is tab-indented and
`package-lock.json` is two-space indented over 4,649 lines, so the add lands as a
whole-file reformat.

**What must never be done instead is resolve the name and then fetch the original
URL.** It reads like the fix and is strictly worse than nothing: the attacker
controls the authoritative server, so answering public to the check and private
to the fetch is the ordinary case.

## What was measured

- **Both defects reproduced before being fixed.** `isBlockedHost('::ffff:127.0.0.1')`
  -> `false` under the deployed body; line 200 read `redirect: 'follow'`.
- **`svelte-check`: 0 errors, 37 warnings, 31/5/1**, re-derived at the baseline
  and again at the end, with `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`
  exported before the sync (this checkout has no `.env`). It caught one defect of
  my own on the way: a table in the new auth test was annotated
  `[string, string][]` while holding 3-tuples, which vitest erases and
  `svelte-check` does not -- 11 errors in 21 files until it was corrected.
- **Full suite at the baseline: 378 files / 7454 tests**, matching the figure the
  prompt carried.
- **11 mutations, 11 killed, every file restored byte-identical by md5.**
  Restores came from a `cp` taken before any mutation ran; `git checkout --` was
  not used anywhere, per the rule that it is a discard-to-HEAD.

## THE INSTRUMENT WAS THE HARD HALF, AND THE FIRST ONE WAS VACUOUS

Worth writing down because it passed review by eye and proved almost nothing.

The obvious test shape is to point the fetcher at a local server with
`allowPrivateHosts: true`, redirect to `http://169.254.169.254/`, and assert the
server never logged the hop. **Every assertion in it passes on the broken code.**
That flag turns the guard off wholesale, so the hostile hop is PERMITTED and
followed; the request then goes to an address the local server cannot see, and
`ok: false` comes back because the metadata service is unreachable from a test
container -- indistinguishable from a refusal. Restoring the original
`redirect: 'follow'` under that shape killed **1 assertion out of 8**.

A spy on `globalThis.fetch` does not fix it either, and that is the part worth
remembering: **under `redirect: 'follow'` undici walks the chain inside itself,
so no spy at the `fetch` boundary ever sees hop two.** The only witness that
works is the destination.

So the rebuilt file runs the guard FULLY ON with two servers: a PUBLIC one
reached through a hostname the guard has no opinion about
(`preview-test.example`), mapped onto loopback by a `fetch` spy that is a name
mapping and not a guard; and a PRIVATE one addressed as `127.0.0.1`, genuinely
blocked, which LOGS WHAT REACHES IT. Restoring `redirect: 'follow'` against that
instrument kills **6 of 34**, including the named assertion that the private
server was never reached. Restoring the pre-fix host guard verbatim kills 4.

The instrument has its own positive control -- a direct request proving the
private server answers at all -- because "nothing reached it" is worthless if
nothing could have.

## What is NOT verified

- **No browser pass, and none is owed.** Neither change has a rendered surface:
  one is a `Location` header and one is a server-side fetch decision. Nothing
  moved in any component, stylesheet or layout.
- **Nothing was run against the live Supabase project.** No migration, no RPC, no
  signed-in session. This bundle carries no SQL at all.
- **The real Google OAuth round trip was not exercised.** `_safeNext` is asserted
  directly and the handler around it is unchanged apart from the one call; a real
  code exchange needs a Bosco Tech account.
- **`tests/classroom-link-preview.test.ts` was not edited**, though it covers a
  module this bundle owns -- it sits under a name ledger 0147 owns. It was RUN
  and passes unchanged, which is the useful half.

## Deferred

- The DNS gap, per decision 23.
- Widening the IPv4 ranges to carrier-grade NAT (`100.64/10`), multicast
  (`224/4`) and the whole of `0/8` rather than the single literal `0.0.0.0`, plus
  the IPv6 link-local `fe80::/10` twin of `169.254/16`. All are policy widenings
  rather than normalization fixes; each fails safe today by simply not being
  refused, and none is a spelling of an address the current policy already
  blocks.

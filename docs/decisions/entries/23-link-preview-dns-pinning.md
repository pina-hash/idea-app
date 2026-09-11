# 23 A link preview still does not resolve a hostname, and closing that needs a connection it can pin

- Raised: 2026-09-11  By: session on `claude/blissful-ritchie-sk8orl` (prompt 0151), item TWO, third gap
- Status: open
- Decision needed: whether the link-preview fetcher should resolve a hostname,
  validate the resolved address, and PIN the connection to the address it
  validated -- and if so, at what cost in dependencies.
- Not changed by this bundle, on purpose. The prompt that raised it said so in
  as many words: implement it only if it can be done cleanly with what this
  stack offers, and otherwise write this entry and leave the code alone rather
  than half-resolving. It cannot be done cleanly today, measured below.

## What is already fixed, so this entry is not read as covering more than it does

Two gaps in `isBlockedHost` were unambiguous and are closed in the same bundle:
an IPv4-mapped IPv6 address (`::ffff:127.0.0.1`, which `URL` hands over as
`[::ffff:7f00:1]`) passed every branch, and `redirect: 'follow'` meant only the
FIRST url in a chain was ever checked. Both are covered by
`tests/link-preview-ssrf.test.ts`, mutation-proven.

## The gap that is left

`isBlockedHost` reads the literal host TEXT. `localhost` is refused because it
is written down; any other NAME is permitted whatever it resolves to. Public DNS
carries plenty of names that answer `127.0.0.1` -- `localtest.me`, `lvh.me`,
`vcap.me` -- and nothing stops a name pointing at `169.254.169.254` or at an
address inside a VPC.

**The existing comment's reasoning is sound and is why this is a decision rather
than a bug.** It says hostnames are not resolved because a DNS answer can change
between the check and the fetch, and that the URL comes from a teacher rather
than an anonymous stranger, so this is not the primary defence. Both true. A
naive "resolve, check, then `fetch` the original URL" is strictly WORSE than
doing nothing: it looks like a control, it costs a round trip, and the attacker
controls the authoritative server, so answering a public address to the check
and a private one to the fetch is the ordinary case rather than the exotic one.
That is the TOCTOU race, and it is the reason the only honest version of this
fix resolves the name, validates the address, and then CONNECTS TO THE ADDRESS
IT VALIDATED.

## Why it was not implemented here

Pinning the connection means controlling the socket. Measured in this container,
on the Node the app runs (v22.22.2), with `@sveltejs/adapter-vercel`:

- **`undici` is not a dependency and is not resolvable.** `require('undici')`
  answers `MODULE_NOT_FOUND`; the only related entry in `package-lock.json` is
  `undici-types`, which is types-only. So `new Agent({ connect: { lookup } })`
  -- the supported way to give global `fetch` a pinned resolver -- is not
  reachable.
- **The internal instance is reachable, and reaching it is the wrong answer.**
  After one `fetch`, `globalThis[Symbol.for('undici.globalDispatcher.1')]` is an
  `Agent`, so `new (that.constructor)({ connect: { lookup } })` would work
  today. It is a versioned private symbol with no types and no contract; a Node
  upgrade that renames or removes it leaves the code falling back to unpinned
  connections SILENTLY, which is the one failure shape this repo's rules refuse
  outright ("an access helper fails closed on any error"). A protection that can
  disappear without anything reporting it is worse than a documented gap.
- **Adding `undici` is a dependency change and is its own bundle.**
  `CLAUDE.md`'s toolchain traps are explicit: `package.json` here is
  tab-indented and `package-lock.json` is two-space indented over 4,649 lines,
  so `npm install` reformats the whole lockfile and a one-package add lands as a
  4,649-line diff. That must not ride along inside a security fix.
- **Rewriting the fetcher onto `node:https`** (which takes a `lookup` option
  natively) is the other real option and is a transport rewrite: the streaming
  byte cap, the timeout, the manual redirect walk and the content-type gate all
  move with it.

## The three options

1. **Leave it.** The fetcher checks literal addresses on every hop and does not
   resolve names. Cost: a teacher who pastes a name pointing at an internal
   address reaches it. Benefit: no dependency, no transport rewrite, and no
   protection that can vanish silently.
2. **Add `undici` as a dependency and pin through `Agent({ connect: { lookup } })`.**
   The resolver validates every address it hands back and the socket goes to
   exactly that address, so the race is closed properly. Cost: one dependency,
   its lockfile diff as its own commit, and a version to keep in step with
   whatever Node the platform runs.
3. **Rewrite the fetcher onto `node:https`/`node:http` with a validating
   `lookup`.** No new dependency. Cost: the streaming read, the timeout, the
   redirect walk and the byte cap are all re-implemented against a different
   API, and every property `tests/classroom-link-preview.test.ts` and
   `tests/link-preview-ssrf.test.ts` pin has to be re-proven against it.

## The one I would pick

**Option 2, in its own bundle, and not urgently.** It is the only one that
closes the race rather than narrowing it, and the cost is a dependency plus a
lockfile commit rather than a rewrite of code that currently works and is
tested. Option 3 buys the same property and pays for it by re-implementing a
transport, which is a much larger surface to get wrong for a feature whose
failure mode is "a card degrades to a plain link".

**And it is not urgent, for the reason the original comment gives.** The URL
comes from a signed-in teacher, not an anonymous stranger; the response is
parsed for `<meta>` tags and never returned to the caller as bytes, so this is a
blind request-forgery primitive rather than a read primitive; and the two gaps
that a casual paste actually hits -- a private literal in an unusual spelling,
and a redirect -- are closed. What is left needs somebody to register or control
a name deliberately.

## What must NOT be done instead

**Do not resolve the hostname and then fetch the original URL.** It reads like
the fix, it is the shape this entry exists to refuse, and it leaves the system
looking protected while the attacker's own nameserver decides what the second
lookup returns. If options 2 and 3 are both refused, option 1 -- leaving it,
with this entry standing -- is the correct outcome, not a half-resolved
compromise.

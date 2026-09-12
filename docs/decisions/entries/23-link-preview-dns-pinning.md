# 23 A link preview does not resolve a hostname, and closing that needs a pinned connection

- Raised: 2026-09-11  By: session on `claude/blissful-ritchie-sk8orl` (prompt 0151), item TWO
- Status: decided 2026-09-12. LEAVE AS IS. Nothing is owed and nothing is built.
- Decision: 2026-09-12, Mr. Pina: leave as is. Approved.
- What this settles: `src/lib/server/link-preview.ts` keeps resolving nothing and
  keeps judging the literal host TEXT. No new dependency, no transport rewrite, no
  lockfile commit. This is the entry's own default in the direction of not doing
  it -- the default said option 2 "in its own bundle, and not urgently", and he
  has answered that the bundle does not happen.
- What stays true: the gap this entry measured is real and is now an ACCEPTED one
  rather than an open question. A public hostname that resolves to a private
  address is not refused (`localtest.me`, `lvh.me` and `vcap.me` all answer
  127.0.0.1, and nothing stops a name pointing at 169.254.169.254). The two gaps a
  casual paste actually hits were already closed by prompt 0151, the IPv4-mapped
  IPv6 spelling and the redirect chain, and nothing about this answer undoes them.
  A later bundle proposing the fix is reopening a decision, not finding a bug.
- Default this assistant would pick: option 2 -- add `undici` as a dependency and pin the
  socket through `Agent({ connect: { lookup } })` -- **in its own bundle, and not
  urgently.**
- Why it is blocked on him: every honest fix costs either a new dependency with its own
  4,649-line lockfile commit or a transport rewrite, and neither is a call a lane makes
  inside a security fix.
- What it unblocks: nothing is waiting. The two gaps a casual paste actually hits are
  already closed.
- Context: `src/lib/server/link-preview.ts`; `tests/link-preview-ssrf.test.ts`;
  `tests/classroom-link-preview.test.ts`;
  `docs/history/blissful-ritchie-sk8orl.md`.

## The question, in one sentence

Should the link-preview fetcher resolve a hostname, validate the resolved address and
**connect to the address it validated** -- and if so, is that worth one new dependency or
a rewrite onto `node:https`?

## What is true in the tree today (measured 2026-09-11, and unchanged since 0151)

- `src/lib/server/link-preview.ts` **line 166** `isBlockedHost` reads the literal host
  TEXT only. **Line 181** refuses `localhost`, `*.localhost` and `*.internal` by spelling;
  **line 184** refuses an IPv4 literal; **line 185** returns `false` for every other NAME
  whatever it resolves to. Public DNS carries `localtest.me`, `lvh.me` and `vcap.me`,
  which answer `127.0.0.1`, and nothing stops a name pointing at `169.254.169.254`.
- **Already closed, so this entry is not read as covering more than it does:** the
  IPv4-mapped IPv6 spelling (**lines 169-179**) and the redirect chain, which is now
  walked by hand with `redirect: 'manual'` and every hop put through the same predicate
  (**lines 327-342**). Both are mutation-proven in `tests/link-preview-ssrf.test.ts`.
- **The constraint that decides this, re-measured today on Node v22.22.2:**
  - `require.resolve('undici')` answers `MODULE_NOT_FOUND`. The only related lockfile
    entry is `node_modules/undici-types`, which is types-only. `undici` is absent from
    `package.json`.
  - `globalThis[Symbol.for('undici.globalDispatcher.1')]` **is** present after one
    `fetch` and is an `Agent`, so `new (that.constructor)({ connect: { lookup } })` would
    work today. **It is refused**: a versioned private symbol with no contract, and a Node
    upgrade that renames it leaves the code on unpinned connections SILENTLY -- the one
    failure shape `CLAUDE.md` refuses outright ("an access helper fails closed on any
    error").
  - `package.json` is tab-indented, `package-lock.json` is two-space indented and
    **4,649 lines**, so `npm install` reformats the whole lockfile (the toolchain trap in
    `CLAUDE.md`). A one-package add lands as a 4,649-line diff unless it is its own commit.

## The three options

| | Migration? | Applied production state? | Cost |
|---|---|---|---|
| **1. Leave it** | no | no | A teacher who pastes a name pointing at an internal address reaches it. No dependency, no rewrite, no protection that can vanish silently. |
| **2. Add `undici`, pin via `Agent({ connect: { lookup } })`** | no | no | One dependency; its lockfile reformat as its own commit; a version to keep in step with the platform's Node. Closes the race properly. |
| **3. Rewrite onto `node:https`/`node:http` with a validating `lookup`** | no | no | No new dependency, but the streaming byte cap, the 4s whole-walk timeout, the manual redirect walk and the content-type gate are all re-implemented against a different API, and every property the two test files pin has to be re-proven. |

**None of the three touches the database, so none needs a migration and none touches
applied production state.** The cost is entirely in dependencies and transport code.

## Why option 2, and why it is not urgent

It is the only one that CLOSES the TOCTOU race rather than narrowing it, and it pays a
dependency rather than a rewrite of code that currently works and is tested. Option 3 buys
the same property by re-implementing a transport, which is a far larger surface to get
wrong for a feature whose failure mode is "a card degrades to a plain link".

Not urgent because the URL comes from a signed-in teacher rather than an anonymous
stranger; the response is parsed for `<meta>` tags and never returned to the caller as
bytes, so this is a blind request-forgery primitive and not a read primitive; and what is
left needs somebody to register or control a name deliberately.

## What must NOT be done instead

**Do not resolve the hostname and then fetch the original URL.** It reads like the fix and
is strictly worse than nothing: it costs a round trip, it looks like a control, and the
attacker's own nameserver decides what the second lookup returns. If 2 and 3 are both
refused, **option 1 with this entry standing is the correct outcome**, not a half-resolved
compromise.

## If nobody decides

Option 1 is what ships, indefinitely and silently -- the code is already in that state and
nothing reports it. The comment at **line 162** points here, so the gap stays documented
rather than forgotten, which is the difference between a deferral and an oversight.

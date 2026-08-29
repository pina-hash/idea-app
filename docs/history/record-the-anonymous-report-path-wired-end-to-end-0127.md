---
title: "The anonymous report path, wired end to end (`0127`)"
date: 2026-08-22
branches: []
migrations: ["0127"]
subsystems: ["FRC / FSP / feedback"]
record_order: 109
---

0126 made an authorless `app_feedback` row possible, rate limited, and writable
by exactly one function granted to `service_role`. It changed no client code and
nothing called that function. This bundle is the wiring: a server route that
holds the key, the affordance rendered for a signed-out visitor, and a console
that shows an authorless row as what it is.

**It also cancels the third bundle and reverses a plan stated three times.** See
"Why the two write paths do not converge" below; that is the load-bearing
decision here, and the rule is now in `CLAUDE.md` under the write path.

### What shipped

**`src/routes/api/feedback/+server.ts`** -- POST, public, answering its own
responses and therefore not in `authedPrefixes`. It reads no session. The admin
client carries no JWT, so `auth.uid()` inside `app_feedback_submit` is null and
0126 takes its anonymous branch by construction rather than by a flag.

**The address is determined by the route, from the request.**
`getClientAddress()`, and the two rejected alternatives are both in the file's
header because both look identical in every manual test:

- **Not the body.** A rate limit keyed on a value the rate-limited party chooses
  is theatre. There is no field in the parsed shape through which an address or
  a hash can arrive.
- **Not a header.** `x-forwarded-for` and its neighbours are strings any caller
  can set. A script rotating one would rotate its own bucket on every request
  and the cap would count to five over an unbounded set of buckets. A browser
  does not send one and a proxy sends the right value, so this fails only
  against the caller it exists to stop -- which is why it has its own test and
  its own mutation.

**The route never computes the stored value.** It hands over an address; the
salt lives in `app_feedback_reporter_secret`, readable by nothing, and the
digest is taken inside the definer function.

**The body is capped before it is parsed** at `FEEDBACK_MAX_BODY_BYTES`
(16,384). The declared `Content-Length` is checked first so an honest oversized
request is refused without being read, and the real byte length is re-checked
after, because a caller can lie about the header. Both directions are asserted.

**The constant lives in `src/lib/feedback/feedback.ts`, not in the route**, and
that was a browser finding rather than a design choice: a `+server.ts` may only
export handlers, and SvelteKit answers **500 `Invalid export`** for anything
else. The first real POST from the dev server hit it. Beside the other two caps
is the better home anyway.

**The status describes the transport; the body describes the answer.** Every
outcome the route CONSIDERED comes back carrying a `reason` string, and the
client treats the presence of one as a refusal to report once rather than
retry -- the same rule `feedbackRetryable` applies to a PostgREST code on the
signed-in path, one hop further out. The only response with no `reason` is the
one where the far side never answered. This is what makes `body_too_large` (413)
and `not_configured` (503) reported once instead of retried five times with
backoff. 0126's own refusals pass through verbatim: `rate_limited` reaches the
client as `rate_limited`, and the words for it are chosen in ONE map on the
client (`FEEDBACK_REFUSALS`), never invented per response by the server. An
unknown reason is NAMED rather than blurred, so a refusal the database grows
later cannot go unnoticed.

**`feedbackWriter` answers for both kinds of reporter**, and `feedbackIsAnonymous`
is the one predicate for which kind this is. Four mounts read it (root layout,
error boundary, deck, GAUNTLET layout) rather than each spelling out "are they
signed in". `submit={null}` still removes the control; being signed out is
simply no longer one of the causes.

**The error boundary no longer tells the person to go and sign in.** It renders
when a LAYOUT load failed, which is precisely when `page.data` may carry neither
a session nor a supabase client -- and it answered that case with a sentence
sending them away to sign in and come back, on a page that had just failed to
load. `feedbackWriter(page.data.supabase, page.data.claims?.sub)` hands back the
anonymous route in exactly those cases now.

**The optional contact field** is offered only where there is no account
(`askContact`), says "(optional)" in the LABEL rather than only in a
placeholder, and carries a line saying an empty one is still read. When it is
not asked for, `contact` is absent from the entry entirely -- absence is the
mechanism one level in.

**`0127`** redefines `app_feedback_admin_list` (same signature, so `create or
replace` is correct and the signature trap does not apply) to add `anonymous`
and `contact`, and to return NULL rather than `split_part('', '@', 1)`'s empty
string for an authorless row's name. **It deliberately does not return
`reporter_hash`**: that value exists to be counted, and a column reaching a
console reaches an export, a paste and a screenshot. Widening a payload is a
disclosure decision, and this one is declined.

**The console shows the word, not a blank.** An anonymous row reads `ANONYMOUS`
plus either the contact string, rendered with "typed by the reporter, nothing
verified it", or "left no way to be reached". `rowIsAnonymous` prefers the
stated flag and falls back to the two empty identity fields, because a
deployment sitting between 0085 and 0127 is a real state.

**The identity toggle now withholds the contact too.** It is the only field on
an anonymous row that can name a person, so withholding names while leaving
"text me, 555-0134" in the file would be the toggle doing the opposite of what
it says. `anonymous` itself is KEPT when withholding: it is the absence of an
identity, not one, and it stops a blanked row reading as a name that went
missing.

**`rowContact` collapses whitespace to one line.** The contact prints as ONE
BULLET in the markdown export, and a newline inside it would end that bullet and
let the rest become a document-level block -- the defect `quoteMessage` exists
to stop in the message, arriving through a field nothing quotes. The JSON export
carries the row verbatim and is where the exact bytes live.

### Why the two write paths do not converge

0053, 0085 and 0126 each said the direct insert grant would be revoked once an
RPC existed. **It is not revoked, and the plan is cancelled.** The third bundle
that would have done it is not being written.

A signed-in report keeps going directly to the table under 0053's policy, whose
`WITH CHECK` pins `user_id` to `auth.uid()`. Converging would require one of
two things, and both are worse than the duplication they remove:

1. **Forward the caller's JWT into `app_feedback_submit`.** That function is
   granted to `service_role` -- the role that bypasses RLS entirely. The
   attribution check would become ours to remember inside a function body,
   where today it is the database comparing the row against the token the
   request arrived with.
2. **Let the service-key route assert who wrote the row.** A server-side gate
   in place of a database-enforced one that already works.

And the single row shape is unrepresentable anyway: 0126's XOR check refuses an
author beside an address hash, on purpose, because that pair links an account to
every anonymous report sharing the address -- de-anonymising, to whoever reads
the table, the exact person the feature protects. So there is no one row the two
paths could both produce even if the plumbing were merged.

The cost is two write paths. It is real, and it is the smaller one: they write
the same columns through the same caps (0126's function applies 0053's), and
each is enforced where it CAN be enforced rather than where it would be tidy.

### What was measured

**Tests.** `svelte-check` at the baseline throughout: **0 errors, 36 warnings**.
Full suite green at the end: **86 files, 2079 tests**. Two new files
(`feedback-anonymous-route.test.ts`, 13 tests; `feedback-untrusted-render.test.ts`,
33), plus new cases in `feedback-anonymous.test.ts` (19 total) and
`feedback-coverage.test.ts` (78 total).

**The rendered surface, counted.** `tests/feedback-untrusted-render.test.ts`
server-renders the REAL `FeedbackConsole` and compares whole-document element
counts against a benign baseline. Ten hostile fixtures, in the message and again
in the contact: **delta 0 every time**, against a stated control of **14
element-open tags** across the same fixtures counted by the same function, and a
detection check that appends each fixture to the real baseline render and gets
its own count back. Slicing the message out of the markup was rejected as the
instrument: a fixture containing the surrounding close tag ends the slice early
and reports a vacuous zero, which is why two of the ten fixtures are exactly
that shape.

In the browser, on `/dev/feedback`'s seeded hostile rows: **0 script, img,
iframe or b elements inside any `.fb-row`**, against **17 elements** of chrome in
the same card.

**Mutation proof.** Six mutations, each verified applied by grep AND a changed
md5 before its result was read, then restored and confirmed byte-identical
(`490df239…` / `1c17bda1…` / `b08f562a…` before and after all six):

| mutation | reddens |
| --- | --- |
| pass a body-supplied `address_hash` through | the body-hash test AND the rate-limit test (2 of 13) |
| **take the address from `x-forwarded-for`** | the forged-header test alone (1 of 13) |
| remove the byte cap | both cap tests (2 of 13) |
| trust the declared `Content-Length` only | both cap tests (2 of 13) |
| let the contact survive a withheld export | the withholding test (1 of 78) |
| return `reporter_hash` from `0127` | the console payload test (1 of 19) |

The header mutation is the one the brief named, and it reddens exactly the test
written for it and nothing else -- which is the point of writing it separately
from the body-hash case.

**Driven in a browser** (dev server, signed out, transitions disabled before
every measurement):

- The sign-in page at a 1440px viewport: the trigger renders, **164x44**,
  hit-tested at its centre, 27px from the right and 12px from the bottom. It did
  not render at all before this bundle.
- The box: contact field **44px** tall, `maxlength=200`, `required=false`, label
  "A way to reach you, if you want one (optional)", and Send enables with the
  contact EMPTY once a message is typed.
- **A real send against the real route: exactly 1 fetch**, counted by wrapping
  `window.fetch`, waited out 5s (past the 800ms debounce and three backoff
  steps). Indicator: "Not saved. Anonymous reports are not switched on for this
  deployment." plus a manual Retry. The message and the contact are both still
  in the box.
- **The body cap, driven for real** through the harness's oversized-context
  case: **1 fetch**, `retryable: false`, "That report is too big to send."
- The console at 1440px: **25 controls, 0 under 44px**, no horizontal overflow
  (scrollWidth 1425 against 1440).
- The console at 375px: **25 controls, 0 under 44px**, scrollWidth 375, and the
  hostile contact string (no spaces in it) wraps inside 248px rather than
  pushing the page wide.
- The box at a 375px CSS viewport: 353px wide (94vw), contact field 317x44,
  hit-tested, 8 controls, none under 44px.
- `/dev/feedback/boom` signed out: **one** trigger ("Tell us what happened"),
  the box opens with the contact field and the 500 in its note, and the old
  "sign in and come back" sentence is gone.

### What is NOT verified

- **Nothing was run against the live Supabase project.** The local `.env` is the
  placeholder project and has no service key, which is why the browser drive's
  ordinary send answers `not_configured`. **0126 and 0127 are applied by hand in
  the SQL editor**; every SQL claim here is against a real embedded Postgres with
  the real migration files applied, not against production.
- **No real rate limit was observed against a real network address.** The cap is
  driven through the route handler with a stand-in `getClientAddress()`; a
  school network NATting the building behind one address is the case the numbers
  were chosen for, and it can only be watched in production.
- **No signed-in browser pass.** There is no session available locally, so the
  signed-in path's browser behaviour is unchanged-by-construction (its code is
  untouched) and asserted at the seam: the writer performs a table insert and
  makes zero fetches, and the row lands with `user_id` set and `reporter_hash`
  null.
- **`npm run build` was not run** (the pre-existing Windows EPERM in the Vercel
  adapter's `closeBundle`).
- **No screenshot.** The Browser pane does not composite; every visual claim
  above is a measured computed-style, geometry or hit-test read.
- **A pane quirk worth knowing:** on the home page under mobile emulation,
  `window.innerWidth` reported **412** while the CSS viewport was genuinely
  **375** (`100vw` measured 375, `documentElement.clientWidth` 375,
  `(max-width: 400px)` matched, and the box's `94vw` came out at 353). A
  whole-document overflow read is therefore unreliable there -- the elements
  reported as overflowing were `.bg-fx`, its canvas and the tour overlay, all
  full-bleed and all pre-existing. The console page reported a true 375 and had
  no overflow.

### Deferred

- **No "anonymous only" facet on the console.** An authorless row passes every
  filter a signed row passes and is excluded only by choosing a role or a
  section, which is those facets working rather than a row falling out. A facet
  for it would be a corner to special-case it into, and nobody has asked to work
  the queue that way yet.
- **The contact is not made actionable.** There is no reply-from-the-console
  affordance; somebody reads the string and goes and finds the person. Wiring
  mail to an unverified string somebody typed is a different feature with a
  different set of questions.


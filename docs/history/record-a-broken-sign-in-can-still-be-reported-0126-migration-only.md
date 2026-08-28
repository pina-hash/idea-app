---
title: "A broken sign-in can still be reported (`0126`, migration ONLY)"
date: 2026-08-22
branches: []
migrations: ["0126"]
subsystems: ["FRC / FSP / feedback"]
record_order: 108
---

## A broken sign-in can still be reported (`0126`, migration ONLY)

First of three. This bundle ships one migration and changes **no client code and
no UI**: no route, no endpoint, no component, nothing calls the function it adds.
The client cutover is the next bundle; the revoke of the direct insert is the one
after.

### The problem

0053's feedback box is a direct RLS-scoped insert whose `WITH CHECK` pins
`user_id` to `auth.uid()`. That is the right write model for a comment about
yourself, and it has exactly one hole: the person who cannot file a report is the
person whose sign-in is broken, which is the report we most need. `feedbackWriter`
says so in as many words -- it returns `null` with no signed-in user, and its
comment reads "The signed-out path is deliberately absent. It needs an RLS change
and a rate limit and ships separately". This is that.

### What it does

* **`app_feedback.user_id` is nullable**, and 0053's insert policy is restated as
  `user_id is not null and user_id = (select auth.uid())`. That is **not a
  widening**: `user_id = auth.uid()` already evaluated to NULL, and therefore
  refused, for a null author. The `is not null` is written out because the
  column's `NOT NULL` is gone and a reader of the policy should not have to
  derive that.
* **`contact text`**, optional and free-form (an email, a first name, "ask me in
  4th"), capped at 200. Never required, never inferred, never filled in on
  anyone's behalf.
* **`reporter_hash text`** -- a salted digest of the reporter's address, salted
  inside the definer function against a per-apply secret with no grant and no RLS
  policy (0089's `coin_public_id_secret` doctrine, its own salt so one address
  cannot be compared across two namespaces).
* **`app_feedback_rate`** -- one row per accepted anonymous report, pruned on
  every write, plus four constant functions (`_app_feedback_rate_window` = 10
  minutes, `_app_feedback_rate_cap` = 5, and the two length mirrors).
* **`app_feedback_submit`** -- one SECURITY DEFINER function, granted to
  `service_role` and nothing else.

### The load-bearing decisions

**THE GRANT IS THE DESIGN, NOT A DETAIL.** PostgREST has no notion of a client
IP, so whatever stands in for "this reporter" has to be handed in as a parameter
-- and a rate limit keyed on a value the rate-limited party chooses is theatre.
That single fact is why the function is granted to `service_role` alone and why
the only caller will ever be a server route computing the address itself. The
rejected alternative was measured rather than argued: with `authenticated` added
to the grant, one signed-in caller sent **20 reports against a cap of 5** by
naming a fresh hash each time; with the shipped grant the same 20 calls stop at
the first with `permission denied for function app_feedback_submit`.

**ONE FUNCTION, NOT TWO.** Signed-in and anonymous differ by whether `auth.uid()`
is present and by nothing else -- same validation, same caps, same table. Two
functions would be two places for the abuse rules to drift apart.

**AN ACCOUNT IS NEVER STORED BESIDE AN ADDRESS HASH.** The signed-in path ignores
`p_address_hash` entirely, and a CHECK makes the invalid state unrepresentable:
`(user_id is null) <> (reporter_hash is null)`. The reasoning is the whole point
of the feature -- a signed-in row carrying the same hash as an anonymous one
de-anonymises, to anybody who reads the table, the exact person an anonymous
report exists to protect. The cost is that a signed-in call through this function
is unrated; it is attributable to an account, which is what a rate limit stands in
for when there is no account, and 0053's direct insert is unrated today anyway.
**Do not "fix" this by storing the hash on signed-in rows.**

**THE HASH COLUMN CANNOT HOLD AN ADDRESS, even if a caller passes one.** What is
stored is `md5(salt || whatever arrived)`, so the salting is inside the boundary
rather than a convention the next caller has to remember. The raw address buys
nothing the hash does not: it is used to count recent reports from one source and
for nothing else. It is a school app, the reporters are minors, and an address
column is a log of who was where that somebody would eventually be asked to hand
over.

**THE CAP IS CHOSEN AGAINST A SCHOOL NETWORK.** Every student is NATed behind one
public address, so a cap of one or two would mean the first reporter during a
first-period outage silences the building -- the exact failure this exists to
prevent. Five in ten minutes stops a script and still leaves a broken morning
reportable.

**A REFUSED CALL WRITES NOTHING**, including no rate row. A window that renews on
every rejected retry is a permanent ban with a friendly message.

**A REFUSAL SAYS NOTHING ABOUT THE ADDRESS.** Every refusal is the same
`{ok:false, reason:...}` shape and carries no count, no remaining quota, no
window, no reset time and no indication of whether the hash has been seen before;
there is no function anywhere that answers "is this address at its limit" without
also filing a report. Exceptions are reserved for what only our own caller can get
wrong (an unknown app or kind, an anonymous call with no address at all) -- those
are route bugs, not something a person typed.

### What the tests found

**`btrim` bit again, in a new place.** The first draft normalised with
`btrim(coalesce(p_message,''))` and a whitespace-only report was **accepted**: the
message `"   \n\t  "` survives `btrim` (spaces only), survives 0053's own
`length(trim(message)) > 0` CHECK for the same reason, and is empty to the person
who typed it and to `feedbackIssue`'s JavaScript `trim()`. The fix is one private
`_app_feedback_trim` used by all six normalisations, spelled
`regexp_replace(x, '^\s+|\s+$', '', 'g')` rather than `btrim(x, E' \t\n\r\f\v')`
-- an escape Postgres does not recognise in an `E''` string is kept as the bare
letter, and a trim set that silently includes `v` is worse than the bug it was
fixing. This is stricter than the column CHECK, and that is safe **only** because
it is a brand-new path with nothing stored through it; 0053's direct insert
answers exactly as it did.

### Verified

`tests/feedback-anonymous.test.ts`, 17 tests, against the real embedded Postgres
with the real migration files applied unmodified. `tests/db/harness.ts` gained
`asServiceRole(fn, userId?)` -- the same claims-GUC-then-`SET ROLE` mechanism as
`asUser`, because the role switch is what makes a function grant apply at all.

* **The deployed path, untouched:** a signed-in direct insert still lands, and
  carries neither new column. Against that: a null author is refused `42501`,
  somebody else's `user_id` is refused `42501`, an own row carrying a
  `reporter_hash` is refused `23514`, and `anon` is still refused outright.
* **Both roles through the one function**, and the signed-in row carries **no**
  hash although one was supplied.
* **The address never reaches the table:** a literal `198.51.100.77` is fed in;
  what is stored is not the address, not an unsalted `md5` of it, matches
  `^[0-9a-f]{32}$`, and a `f::text like` sweep of the whole row and of the rate
  table finds it nowhere -- with a positive control proving the same sweep does
  find the message.
* **The cap:** 5 through, the 6th `rate_limited`, `Object.keys` exactly
  `['ok','reason']`, 5 feedback rows and 5 rate rows (the refusal wrote neither).
  Per-address, not global, is its positive control: a second address is accepted
  in the same window while the first is still capped. Ageing the rows 11 minutes
  into the past lets one through and leaves **0** rows older than the window.
* **Grants both ways:** `authenticated` and `anon` are refused `42501`
  behaviourally, `service_role` succeeds, and the catalog agrees
  (`has_function_privilege` false/false/true). The salt secret is `select`-false
  for all three roles.
* **Idempotence:** the file is re-applied over its own result, and `pg_proc` then
  holds **exactly one** `app_feedback_submit` (the signature trap), one XOR
  constraint and one salt row.
* **0085's console read**, which ships today, still returns both rows over a table
  containing an authorless one, with a null `submitter_email` on it.
* **Full suite** 84 files / 2019 tests green; `svelte-check` at the baseline
  0 errors / 36 warnings.

### Mutation proof

Seven mutations, each in the PERMISSIVE direction, each proven applied (text
present and md5 moved) **before** any test result was read, each restored
byte-identically (`3d52cb76a7c7276619e87ec89b28f162`, verified after every one).

| | Mutation | Reddened |
| --- | --- | --- |
| M1 | the RPC granted to `authenticated` as well (**the rejected alternative**) | 1 |
| M2 | the author/hash XOR constraint replaced with `check (true)` | 1 |
| M3 | the insert policy widened to `user_id is null or user_id = auth.uid()` | 1 |
| M4 | the rate cap raised to 1000000 | 2 |
| M5 | the reporter hash stored unsalted, as handed in | 3 |
| M6 | the rate table's prune neutered to `where false` | 1 |
| M7 | the salt secret granted `select` to every client role | 1 |

M1 was then taken further than a red run: under it, an `authenticated` caller
naming a fresh hash per call landed 20 reports against a cap of 5, and the same
script against the shipped grant is refused at the first call.

### NOT verified

* **Nothing ran against the live Supabase project.** The local `.env` is a
  placeholder; this migration has not been applied anywhere real. It is pasted
  into the SQL editor by hand like every other one.
* **No browser pass, and none was possible or needed** -- the bundle renders
  nothing and no route calls the function.
* **`npm run build` was not run**; it dies on Windows in the Vercel adapter's
  `closeBundle` with `EPERM` regardless (pre-existing, machine-level).
* **The rate limit was aged with an `update`, not by waiting ten real minutes.**
  The window arithmetic is `now()`-relative either way, but no test observed a
  real clock crossing it.
* **A concurrent flood was not simulated.** Two calls racing the same hash can
  both read a count below the cap under READ COMMITTED and both land, so the cap
  is "about five", not exactly five, under simultaneous requests. That is
  deliberate: the alternative is a lock on a shared address that would serialise
  every anonymous report in the building behind one row, which costs more than
  the sixth report it prevents.

### Left for the next bundle, and one thing it must answer

The client cutover has a real problem to solve that this bundle does not: the
signed-in branch of `app_feedback_submit` fires on `auth.uid()`, and a plain
service-key call **has no `sub` claim**, so a server route holding the service key
reaches only the anonymous branch. That is fine while 0053's direct insert is
still granted -- signed-in reports keep going through it, which is exactly the
plan for bundle 2 -- but **bundle 3 must not revoke that grant until signed-in
writes have somewhere to go**, whether that is keeping the client's own insert, or
minting a claim, or something else decided there with this constraint in front of
whoever decides it.

---


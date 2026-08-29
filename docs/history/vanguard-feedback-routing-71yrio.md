---
title: "VANGUARD's in-game composer stops writing to Apps Script and files into `app_feedback`, through a second serve-time rewrite table (`claude/vanguard-feedback-routing-71yrio`, no migration)"
date: 2026-08-28
branches: [claude/vanguard-feedback-routing-71yrio]
migrations: []
subsystems: ["VANGUARD", "Feedback"]
---

VANGUARD carried two ways to report a problem and only one of them reached
anybody. The injected REPORT panel posts to `/api/vanguard-feedback` when signed
in and the shared anonymous route otherwise, landing in `app_feedback` -- the
console that gets read. The game's own older "Bug or idea?" composer
(`buildFeedbackComposer`, `index.html:5890`, mounted on the title, pause and
game-over screens) fired `action=feedback` at a hardcoded Google Apps Script URL
as `new Image().src`. Nobody reads that endpoint, and an `<img>` GET cannot
report a failure, so a student got the same silent non-answer whether the message
arrived or vanished.

The composer keeps existing. Its send now reaches the same place as everything
else. Two controls offering one thing is a UX question and can wait; one of them
writing where nobody reads was the defect.

### The mechanism had to be established before anything was written, and it moved

**`_NON_ADMIN_STRIPS` is the wrong table, and that is not a close call.** It is
applied inside `if (!isAdminUser)`. The composer ships to everyone, so an entry
there would redirect a student's composer and leave an admin's writing to Apps
Script -- a half-fix that reads as a whole one.

**There was already a second, untabled universal rewrite, and it was exactly the
shape the strip table's own comment warns about.** `+server.ts` did a bare
inline `.replace(/const VERSION='(\d+)';/, ...)` to bolt `__ideaGameInfo` onto
the build, for every visitor, outside any table. It was not uncovered --
`vanguard-admin-gate.test.ts` asserts the marker reaches the output, which does
bite -- but its anchor had no exactly-once check, and it was a second
implementation of "rewrite the served bytes for everyone" sitting beside a table
built for precisely that.

So this bundle adds **`_UNIVERSAL_REWRITES`**, applied to every visitor before
the non-admin gate, and folds `__ideaGameInfo` into it as its first entry. The
served bytes are unchanged by that move, which the pre-existing assertion in
`vanguard-admin-gate.test.ts` continues to prove without modification.

**A rewrite proves it fired by a `marker`, not by its anchor's absence, and that
is the one real difference between the two tables.** A strip REMOVES, so a
surviving anchor is the failure. A rewrite may APPEND -- `gameInfoReader` keeps
the `const VERSION` line it hangs off -- so the anchor is still in the output
afterwards and its presence says nothing at all. Each entry therefore names a
string its replacement introduces and the raw build does not contain.
`tests/vanguard-universal-rewrites.test.ts` walks the real list and asserts of
every entry: the anchor matches the build EXACTLY ONCE, the marker occurs ZERO
times in the raw build (the positive control, without which the next assertion
would pass on a marker that was always there), the marker reaches the served page
exactly once for an admin, a student AND a signed-out visitor, and no anchor is a
global regex.

### The anchor had to swallow four lines, not one, or the change would have missed its own point

The prompt described the defect as the `new Image()` call. Reading the composer
showed it is larger than that: the three lines AFTER it --

```
    ta.value=''; cnt.textContent='0 / 500'; grow();
    btn.textContent='THANKS!'; btn.disabled=true;
    setTimeout(()=>{ btn.textContent='SEND'; btn.disabled=false; },1400);
```

sit OUTSIDE the `if(API_URL)` guard and run unconditionally. They cleared the
box and painted `THANKS!` before anything could have been confirmed, and did so
even when there was no endpoint configured at all. Redirecting the request and
leaving them behind would have produced a composer that thanks a student for a
message it just failed to send -- the same defect, one layer in. The anchor spans
the whole optimistic block, and `tests/vanguard-universal-rewrites.test.ts`
asserts both of those lines are absent from every serve, separately from the
`action=feedback` assertion, so the two halves cannot regress independently.

### What the redirected call does

`window.__ideaVanguardReport`, defined in the same injected bootstrap, owns the
whole outcome. The replacement in the served bytes is one guarded call.

- **It posts to `FB.endpoint` and resolves nothing.** That decision -- signed-in
  route or anonymous route -- was made once, server-side, in the GET handler and
  is already baked into the injected `FB` object. The test asserts the hook body
  contains `fetch(FB.endpoint` and contains neither route literal nor
  `SIGNED_IN`; two spellings of "signed in or not" is the pair that stops
  agreeing.
- **It can fail visibly, which is half the reason for the change.** It reads the
  same `{ok:true}` / `{ok:false, reason}` contract the panel reads and speaks a
  refusal through the same `fbWords` vocabulary. A codeless failure says the
  message is still there and to press SEND again; a considered refusal is
  reported once in that reason's own words rather than re-sent.
- **A failed send KEEPS THE WRITING.** The box is cleared only on a confirmed
  landing. That is the specific thing the old path could not do: the words were
  gone and the button said thank you.
- **It reports into the game's own two elements** -- the SEND button and the
  character counter -- so it adds no DOM, no listener and no second idea of what
  the composer looks like. The counter is 9px and `--dim` by its class, which is
  right for a count and unreadable as a refusal, so a message overrides size,
  colour and alignment inline and the override is undone when the count returns.
  A refusal stays up 6s and an acknowledgement 1.8s.
- **`API_URL` IS NOT REMOVED.** It still carries the run telemetry (`:5399`,
  `:5414`) and the entire leaderboard (`action=top`, `action=submit`). This was a
  redirect of one call, and the test pins all four of those survivors.

### The same context, and where the initials went

`fbMeta()` gained a `surface` parameter and both callers pass one -- the panel
`'report-panel'`, the composer `'in-game-composer'`. Neither is the unlabelled
default: two controls filing into one table, where a row cannot say which control
produced it, cannot be traced back to the control that needs fixing. Everything
else the panel captures (route, path, role, viewport, user agent, clock, build,
and the three the portal cannot know without asking the game -- `gameVersion`,
`mode`, `sector`, `screen`) comes from that one function, so the composer's row
is not a second-class one missing the fields that make a report actionable.

**The initials go in `meta`, and no column was invented for them.** `meta` is
the free-form context blob every surface attaches to and is documented as exactly
that; `app_feedback` has no column for a leaderboard handle and should not gain
one. They are explicitly NOT an identity -- three characters a player types into
a scoreboard, unverified, self-chosen, re-typed every run -- and the code says so
where it sets them. The test asserts `initials` appears in `meta` and does NOT
appear at the payload's top level, where both feedback routes would silently drop
it.

**The kind is `'other'`, deliberately, and this is worth stating because it looks
like a shrug.** The composer is one channel with no dropdown by design ("Bug or
idea? Tell us"), so nobody chose a kind and the code must not guess one; `'bug'`
would put a made-up answer in a filterable column. `meta.surface` is what says
why the kind is uninformative on these rows.

### A limitation found while doing this, which is somebody else's file

**`meta.surface` and `meta.initials` will be STORED but not DISPLAYED.**
`FeedbackConsole.svelte` renders a FIXED list of meta fields (path, role,
section, viewport, user agent, http status, error id, build) rather than walking
the blob, and `rowRoute` is `meta.route ?? context ?? app`, so neither new key
reaches the screen. Showing them is a one-row addition to
`src/lib/classroom/FeedbackConsole.svelte` and/or `src/lib/feedback/console.ts`
-- neither of which this session owns, and one of which is another live session's
file. Recording it here rather than smuggling a label into `meta.route`, which
would have made the chip render at the cost of the route id being a lie.

### The injected bootstrap now has a parse assertion

The hook lives inside a template literal, and a template literal hides a syntax
error until a browser runs it. Nothing in the TypeScript build looks inside that
string: an unbalanced brace or a stray backtick compiles, deploys, serves 200 and
takes the WHOLE bootstrap down at parse time in front of a class -- no cloud save,
no nav, no report panel and no redirected composer, at once, with nothing on
screen saying why. The test now extracts the injected script from a real serve and
`new Function`s it (parse only, never run) for all three roles. The strip table
never needed this because a strip only ever removes bytes.

This was not hypothetical: the first draft of the hook's comments used backticks
inside that literal and terminated it, which `svelte-check` would have caught, but
an unbalanced brace inside the emitted JS would not have been caught by anything.

### Measured

- `svelte-check`: **0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), before and after,
  re-derived with `svelte-kit sync` after exporting placeholder
  `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY`.
- Full suite before: **142 files, 3223 tests, all passing**. After: **143 files,
  3239 tests, all passing** (the new file is 16 tests).
- `npm run verify:browser`: 28 route/width runs, 200 measurements, **2 outside
  threshold**, both the known `/dev/pathways` 26.2px tap-target finding at 375 and
  1440. Unchanged, as expected -- nothing here touches a `/dev` route.
- Anchors, counted against the real build before writing: composer block **1**,
  `const VERSION='...'` **1**, `action=feedback` **1**, and both markers **0**.

**Mutation proof, restored md5-identical each time** (`db8916b3...`):

| Mutation | Reddened |
| --- | --- |
| `_rewriteForEveryone` made a silent no-op | 4 assertions |
| the table gated on `!isAdminUser` (the wrong table) | 3 assertions |
| the composer anchor drifted by one character (`1400` to `1500`) | 5 assertions |
| an unbalanced brace inside the injected hook | 1 assertion (the parse check, and only it) |

The second is the load-bearing one: it is what makes "everyone gets these" a
real claim rather than a comment. The fourth confirms the parse check is isolated
-- it bites on exactly the defect it is for and on nothing else.

### NOT verified, and it cannot be from this container

- **Whether a redirected submission actually lands in `app_feedback` is not
  provable here.** Every surface involved needs a signed-in session against a real
  Supabase project; the local `.env` is a placeholder (`example-ref`) and this
  container holds no Bosco Tech Google session. What IS proven is that the rewrite
  fires, that the emitted call names `FB.endpoint`, that the GET handler resolves
  that to `/api/vanguard-feedback` signed-in and `/api/feedback` signed-out, and
  that both of those routes write the row -- the last of which
  `tests/vanguard-feedback-paths.test.ts` already proves against a real Postgres
  with the real migrations. The single unproven link is the browser actually
  making the fetch.
- **Nothing here was driven in a browser.** The composer is on the title, pause
  and game-over screens of a game that needs a session for the interesting half,
  and `verify:browser` covers `/dev` routes only. The failure wording, the counter
  override and the 6s/1.8s timings are unverified on screen.
- **The Apps Script endpoint's own behaviour was not inspected** and could not be;
  it is a third-party deployment outside this repo. The claim that nobody reads it
  is carried from the backlog, not re-established.

### Documents corrected

- `src/lib/feedback/context.ts` -- the VANGUARD exclusion rule's comment said the
  in-game composer "still files to VANGUARD's own Apps Script backend, not to
  app_feedback". Corrected in place: both controls land in `app_feedback` now, and
  the comment says what moved and what is still open.
- `docs/VANGUARD_BACKLOG.md` section 2 -- the composer entry, rewritten to say the
  fix lives on the SERVER side of the injection boundary (which that file cannot
  otherwise show, and which its own preamble explains is a permanent property of
  the split), naming `_UNIVERSAL_REWRITES` and why it is not `_NON_ADMIN_STRIPS`.
  It also records that `API_URL` stays.

### Reported, not changed: `GET /api/vanguard-run-state`

**Still has zero callers.** Re-checked across the whole repo: the only three call
sites are the two `POST`s (`+server.ts:333` `sendBeacon`, `:336` `fetch`) and the
one `DELETE` (`:351`). Nothing under `src/lib/legacy/` names the route at all --
the saved checkpoints reach the page through the injection, which reads them
server-side in the `/vanguard` GET and ships them as `window.__ideaRunStates`.

**It should go, but it is a tidy-up rather than a defect, and this bundle is not
the place.** It is an authenticated read (`401` with no claims) of the caller's
OWN rows, so while it sits there it leaks nothing and costs nothing. Deleting it
is three lines in a file this session does not own; the backlog entry now carries
the re-check date and that reasoning so the next bundle touching that route can
take it without re-deriving any of it.

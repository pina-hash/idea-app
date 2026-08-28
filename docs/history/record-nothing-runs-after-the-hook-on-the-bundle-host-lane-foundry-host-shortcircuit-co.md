---
title: "Nothing runs after the hook on the bundle host (`lane/foundry-host-shortcircuit`, code only)"
date: 2026-08-25
branches: [lane/foundry-host-shortcircuit]
migrations: []
subsystems: ["IDEA Foundry"]
record_order: 137
---

## Nothing runs after the hook on the bundle host (`lane/foundry-host-shortcircuit`, code only)

The lane before this one instrumented the bundle path so a production 404 could
say which check refused it. The probe answered, and it eliminated every
candidate on the list:

```
FOUNDRY_PROBE {"stage":"hook.apps-host.allowed","path":"/r/<token:114>/",
               "requestHost":"apps.ideabosco.com","method":"GET"}
responseStatusCode 404
```

`proxy.enter` did not log. The host branch allowed the request and the route
handler never ran.

### What the sequence was read to be doing, member by member

The prime suspect was `authGuard` -- signed out on an origin that carries no
cookies by design, and known to answer 404 rather than redirect for some
prefixes. Read rather than reasoned about, for a signed-out `GET /r/{token}/`
on `apps.ideabosco.com`:

1. **`foundryHostBranch`** -- `isFoundryAppsHost` true, `appsHostAllows` true
   (the shape is `/r/{token}/`, token non-empty, slash present). Logged
   `hook.apps-host.allowed` and returned `resolve(event)`.
2. **`legacyRedirects`** -- strips trailing slashes to `/r/{token}`, which is
   not a key in `legacyPaths`. Passes through. Its only possible answer is a
   308 to a legacy target.
3. **`supabase`** -- assigns `event.locals.supabase`, a server client bound to
   this origin's cookies, and installs a `setAll` that calls
   `event.setHeaders`. It has no refusal at all.
4. **`authGuard`** -- **ELIMINATED.** `authedPrefixes` is `/dashboard`,
   `/gauntlet`, `/frc`, `/greenline`, `/notebook`, `/classroom`, `/foundry`.
   `/r/...` matches none of them, so `needsAuth` is false; and the only refusal
   this member can produce for any path is `redirect(303, '/')`. It cannot
   answer 404.

**No member of the sequence can produce a 404 for that URL.** Nor can routing:
`parse_route_id('/r/[token]/[...path]')` compiles to
`^\/r\/([^/]+?)(?:\/([^]*))?\/?$`, which was run against a 114-character token
with the trailing slash and matched with `path` empty, so `route` is not null;
and `render_endpoint` answers 405 for a missing method, never 404. **So the
production 404's source is NOT in the handle sequence, and this lane did not
identify it.** What the reading did find is a different, real defect that fits
the same instrument:

**`@supabase/ssr` 0.12 hands `setAll` a `Cache-Control: private, no-cache,
no-store, must-revalidate, max-age=0`**, and the `supabase` member passes it
straight to `event.setHeaders`. That is the one thing in the sequence that
stamps a header onto whatever response comes out -- including a response the
Foundry code never produced. Its value is not the hook's own
`private, no-store`, so it does not prove which branch answered; what it does
prove is that member ran.

### The defect that was found, which is the one worth the bundle

`export const handle = sequence(foundryHostBranch, legacyRedirects, supabase,
authGuard)` meant the host branch could only ever REFUSE. In a `sequence`
member, `resolve(event)` does not mean "hand this to the router" -- it means
"run the next member". So an ALLOWED apps-host request, which is every request
the bundle host actually serves, went on to have a Supabase client created for
it against that origin's cookies, and then a live `getClaims()` round trip
performed against the Auth server by `authGuard`.

`CLAUDE.md` said the opposite, in as many words: "The branch is sequenced
FIRST, ahead of the Supabase client, so no path on that host can read a session
or write a refreshed cookie." True of the paths the branch refused. False of
every path it served. That line is corrected in place.

`handle` is now a plain function rather than a sequence: on the apps host it
either answers the bodyless 404 or returns `resolve(event)` -- SvelteKit's own
resolve, the router -- and the other three members live in a `mainHostChain`
sequence the bundle host never enters. **An exemption list inside `authGuard`
was the rejected alternative**, and rejected on the record rather than on
taste: it fixes the member that happens to be wrong today and leaves the next
middleware free to reintroduce the same failure, which is now twice a component
downstream of the hook has quietly changed what that host does.

### Why the suite was green through all of it

`tests/foundry-proxy.test.ts` composed `foundryHostBranch` with the route
handler as its `resolve`, under a comment reading "the hook first, then the
route, exactly as `sequence()` runs them". It is not that. Supplying your own
`resolve` to a sequence member silently stands in for every member after it, so
the test asserted the three downstream members out of existence -- the exact
thing that was wrong.

The replacement drives the REAL exported `handle`, with `resolve` standing in
for the router and nothing else, over an INSTRUMENTED event: `locals` starts
empty, and `cookies.getAll`/`get`/`set`/`delete` and `setHeaders` count their
calls. `locals` is the definitive instrument, because both members that can
touch a session write to it unconditionally and first -- `supabase` assigns
`locals.supabase`, `authGuard` assigns `locals.claims` -- so a key present
means that member ran whatever it went on to answer.

Measured on the bundle root, signed out, apps host: **1 router call, 200, the
entry file with the storage shim in it; `locals` keys `[]`, 0 cookie reads, 0
cookie writes, 0 header sets.** Two positive controls stop those zeros being
vacuous: the same event on the main host gives **`locals` keys
`['claims','supabase']`, `claims` null, cookie reads > 0**, and `/IDEA` on the
main host still 308s to `/` while `/IDEA` on the apps host is a bodyless 404
with the router never called.

**Proven to bite.** Reinstating the continuation (the allowed branch calling
`mainHostChain` instead of `resolve`) reddens exactly one test, on exactly the
right assertion -- `expected [ 'supabase', 'claims' ] to deeply equal []` --
while the bundle still serves 200, which is what the silent version of this
looks like. `src/hooks.server.ts` was restored and md5-checked
(`a2732008b5a37833d7d40636b0dab43e`) and the file is green again.

Driving the real `handle` costs one SvelteKit internal: `sequence()` reads the
per-request store that `respond.js` installs around `hooks.handle`, so the test
installs it the same way, with a `record_span` passthrough (which is what
`record_span` already is with no OpenTelemetry exporter configured).
`tests/kit-internal.d.ts` declares that one function, because the package ships
that entry point with `types` pointing at a file that is not a module.

### The token was in the error log

`handleError` logged `event.url.pathname` beside the correlation id and the
stack. On the bundle host that pathname CONTAINS the credential --
`/r/{token}/{path}`, thirty minutes of read access to a student's app -- so a
500 on the proxy put a live token in the Vercel function log, greppable and
outliving the request. It now logs `redactProxyPath(event.url.pathname)`.

`redactProxyPath` moved out of the deleted probe module into
`src/lib/foundry/host.ts`, beside `isFoundryProxyPath`: one module describes
where the token sits in a URL, and a second regex somewhere else is the copy
that stops matching. Non-proxy paths are returned verbatim, so an ordinary
correlation line still reads normally. The test drives the real `handleError`
and reads what it actually printed rather than asserting the helper alone --
the helper being right while the call site interpolates the raw pathname beside
it is exactly the shape of this leak.

### The instrumentation is gone

Every `FOUNDRY_PROBE` line is removed: `src/lib/server/foundry-probe.ts` is
deleted, and with it the calls in `src/hooks.server.ts`,
`src/routes/r/[token]/[...path]/+server.ts` (including `proxy.enter`,
`proxy.serving` and the four refusal probes) and
`src/lib/server/foundry-bundle.ts` (all seven). The route's
`$env/dynamic/private` import, which existed only for the token-secret presence
probe, went with them. The unrelated `foundryProbe` postMessage key in
`src/lib/server/foundry-dev-fixture.ts` and `/dev/foundry-proxy` is a different
thing and was left alone.

### What was NOT verified

- **Nothing on production.** This session cannot reach `ideabosco.com` or
  `apps.ideabosco.com`, cannot deploy, and cannot read a Vercel function log.
  Whether the production 404 is fixed by this bundle is UNKNOWN -- the reading
  above says the sequence is not what answered it, so the honest expectation is
  that the 404 has another cause still to be found. What this bundle does fix
  with certainty is the session read on the bundle origin, which is asserted in
  the suite.
- **No browser pass.** No bundle was framed, no app was launched.
- **The live Supabase project was not touched.** The local `.env` is the
  placeholder (`example-ref`); the proxy tests run against the in-memory dev
  fixture, which is what `resolveBundleFile` uses under `dev`.
- **No migration**, no SQL, no database change of any kind.


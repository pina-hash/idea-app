# Server, routes and modules

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). Route guards, endpoints, error boundary, deploy reload, proxies, long jobs. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

## Server, routes and modules

- **`$lib/server/*` never reaches the client.** SvelteKit refuses to bundle it,
  which is what makes a server-side sanitizer or credential-holder a real boundary
  rather than a convention.
- **A pure, client-safe registry per subsystem** holds plain data and pure helpers
  with no `?raw`, no `$lib/legacy`, no three.js, no Svelte: `curriculum.ts`,
  `portal-apps.ts`, `pathways.ts`, `gauntlet.ts`, `tracks.ts`, `abilities.ts`,
  `combat.ts`, `feed.ts`, `track-runtime.ts`, `rich-text-schema.ts`,
  `rich-text-doc.ts`. Pure layers are what make arithmetic testable without a
  browser.
- **Data says WHERE the limits are, never HOW they are enforced.** A track file states
  its boundaries; the runtime decides whether that is a soft wall, a drag penalty or a
  local clamp. Keep the enforcement policy in code, out of the data format.
- **A registry whose ids may already be stored in a row is APPEND-ONLY.** Nothing is
  ever removed from `curriculum.ts`'s `SECTIONS`: every id may sit in a real
  `profiles.section_id`, and deleting one orphans those rows and breaks the lookup.
  Mark an entry concluded with a FLAG instead -- an annual programme comes back, and
  flipping a flag re-opens it with nothing to restore.
- **A LINK HOVER NEVER RUNS A SERVER LOAD (ledger 0360, report R08).**
  `src/app.html`'s body carries `data-sveltekit-preload-data="tap"` and
  `data-sveltekit-preload-code="hover"`. The template's hover data preload ran a
  route's hooks, Auth and every server load for every link a pointer rested on
  (measured: six route-data loads for six launcher links); tap still preloads
  about 100ms before the click. No element overrides it, and
  `tests/link-preload-policy.test.ts` sweeps for one.
- **An API route exists when the work needs the server** (a credential, a
  multipart parse, real validation, a Drive round trip). A single RPC call with
  two strings is made directly from the browser client instead.
- **A route that answers its own 401 is NOT in `authedPrefixes`**
  (`/api/notebook/*`, `/api/classroom/*`).
- **Every `+server.ts` re-checks authorization itself.** A route group's layout
  guard does NOT run for endpoints.
- **SVELTEKIT THROWS ON ANY NON-METHOD EXPORT FROM A `+server.ts`, AND NOTHING
  LOCAL CATCHES IT, SO THE FIRST SIGN IS PRODUCTION.** `validate_server_exports`
  admits `GET`, `POST`, `PATCH`, `PUT`, `DELETE`, `OPTIONS`, `HEAD`, `fallback`,
  `prerender`, `trailingSlash`, `config`, `entries` -- **and anything whose key
  starts with `_`.** Everything else raises
  `Invalid export '<name>' in <route>` when the route is served. Exporting a
  helper, a constant or a type from an endpoint so a test can import it is the
  ordinary way to hit this.
  - **BOTH LOCAL CHECKS PASS A BROKEN FILE, MEASURED.** With
    `export const helperTable = { a: 1 }` appended to a real `+server.ts`,
    `svelte-check` reported its usual **0 errors and 37 warnings** -- the export
    is valid TypeScript, and the rule is SvelteKit's, not the type system's --
    and a vitest file imported the module, read `helperTable` off it and passed.
    Vitest imports the module DIRECTLY and never goes through the router, so the
    validator it would trip is not on the path. `npm run build` does run the
    validator in its postbuild analysis, which is the one thing that would catch
    it -- and on Windows that build dies earlier with the EPERM in the toolchain
    traps below, so the local answer is "the build is broken anyway".
  - **THE `_` PREFIX IS THE WHOLE ANSWER, and it is already the repo's.**
    `src/routes/vanguard/+server.ts` exports `_NON_ADMIN_STRIPS` and
    `_stripForNonAdmin` for exactly this reason. Prefix it, or move it to a
    module beside the route and import it from both.
- **A group-wide gate is hoisted to `+layout.server.ts`** and stated once, so a
  new area cannot ship ungated by forgetting to copy the check. **A page under
  it that READS still calls the gate as its own first statement**: SvelteKit
  runs a layout's server load and a page's concurrently unless the page awaits
  `parent()`, so the layout's 404 does not stop the page's reads from starting
  (`/admin/feedback`'s three pages, `tests/feedback-console-route.test.ts`).
- **A FAILED LOAD RENDERS IN THE APP'S CHROME.** `src/routes/+error.svelte` is the
  ONE error boundary -- root only, because a root boundary already catches a
  failure from any page or layout load beneath it and a per-section one is one
  more thing each new area must remember. It carries the status, the route, the
  correlation id and the report affordance, prefilled.
- **`handleError` in `hooks.server.ts` MINTS THE CORRELATION ID** and logs it
  beside the route and the stack, so a server log line and a report filed about it
  join on one string (`page.error.id`, `App.Error` in `src/app.d.ts`). It does
  nothing else on purpose: it runs on a request that has already gone wrong, and a
  second thing that can fail inside it turns a 500 into a 500 with no log at all.
  The message it returns for a 500 is GENERIC -- an internal error's own text can
  carry a query, a path or a token, and that value is rendered to the caller.
  **`src/hooks.client.ts` is its client twin (ledger 0297)**: it mints the same
  kind of id for a client-side failure and marks a failed chunk load with
  `App.Error.chunk`, which is what makes `+error.svelte` offer Try again.
- **A NEW VERSION OF THE SITE ARRIVES ONLY AT A NAVIGATION THE PERSON MADE, AND
  ONE FUNCTION DECIDES WHEN (ledger 0297, F6).** Every push to `main` is a
  production deploy and several land in a school day, so `svelte.config.js` polls
  (`kit.version.pollInterval`, 120 s) and `DeployWatch.svelte`, mounted once in
  the root layout, asks `deployReloadVerdict` in `$lib/shell/deploy-safety.ts` on
  every `onNavigate`. It reloads only for a link, a back/forward, or a goto the
  save guard re-issued after its flush; only when the path changes; never from a
  fullscreen element; never from a route in `PROJECTOR_ROUTES` (the deck, the
  tournament TV stage, the classroom projector, `/fsp/live`, GREENLINE,
  GAUNTLET, IdeaCAD, and any projected view added later); never while a hold
  is active. An idle page never
  reloads, because the only trigger is a navigation.
  - **`onNavigate`, NEVER `beforeNavigate`, AND NEVER THE DOCUMENTED SNIPPET.**
    The order of `beforeNavigate` callbacks between a layout and a page flips
    within a session, and assigning `location.href` there fires `beforeunload`
    synchronously, which turns the save guard's flush-then-navigate into a native
    Leave dialog. `onNavigate` runs only for navigations no guard cancelled, after
    the URL moved, so the reload is `location.reload()`.
  - **ANYTHING A FULL LOAD WOULD DESTROY HOLDS THE RELOAD**, through
    `holdDeployReload` or `trackInFlight`: every classroom upload
    (`uploadClassroomFile`), the staged deck unpack, the notebook's photo posts,
    an open composer with work in it, an open feedback box, a header quick note
    with writing the server has not got. **A new upload path
    or a new projected surface joins them in the same change**; forgetting one is
    silent until a deploy lands mid-upload.
  - **NEVER RELOAD FROM `vite:preloadError`.** It only asks for a version check.
    A failed route chunk is SvelteKit's to recover (it reloads the target when the
    version changed), a failed editor chunk degrades to a plain textarea written
    through the same document path, and the save guard's flush has a deadline
    (`SAVE_GUARD_FLUSH_TIMEOUT_MS`) so a hung save cannot freeze a link.
- **Proxy routes serving bytes from the app's own origin use a MIME ALLOWLIST,
  never an echo of the upstream header** -- same-origin `text/html` runs as script.
  Anything outside the allowlist is served `application/octet-stream` + `nosniff`.
  Prefer the STORED mime over the upstream's (Drive reports `.js` and `.json` as
  `text/plain`).
- **SUPABASE'S SIGNED-URL `download` OPTION DOUBLE-ENCODES ANYTHING THAT NEEDS
  ESCAPING.** The value is escaped into the URL's query string and escaped
  AGAIN into the header, so `Estudio (final) café.SLDPRT` arrives as
  `filename=Estudio%20%2528final%2529%20caf%25C3%25A9.SLDPRT` (`%2528` is an
  encoded `%28`) and the browser saves a name full of literal percent escapes.
  Measured: every name that was `[A-Za-z0-9.-]` came back clean and every other
  one did not. **Hand it an ASCII-only value** (`downloadFilename` folds
  diacritics rather than dropping them) and keep the real name in its own
  column for display. This is not visible without fetching the URL and reading
  the header.
- **Cache a private proxied asset `private, max-age=60`** -- the bytes are
  immutable but WHO may read them is not.
- **A long-running server job is STAGED and client-driven**, each stage bounded by
  both a time budget and an item count, resumable by adopting work already done
  (named deterministically) rather than repeating it. A serverless function has a
  duration limit that no amount of memory tuning addresses.
- **A file the platform will not accept is refused BEFORE the request is made**,
  with the same message the server would give, and the message states the LIMIT
  as well as the size -- "too large" with no number is a guessing game.
  - **THE ~4.5 MB FIGURE THIS FILE CITES IS HISTORICAL.** Vercel now accepts
    request bodies up to 100 MB, so on the one path that still POSTs bytes to
    our own function (the deck zip -- instructor-only material stopped in 0135)
    the binding limit is
    the app's OWN constant and not the platform. Do not raise one of those
    constants without measuring: they were chosen against the old cap, the
    bytes are still buffered whole in the function, and the right answer for
    anything large is the browser-to-bucket path in the classroom-files
    section rather than a bigger buffer.
- **Best-effort instrumentation must never be able to affect the thing it measures.**
  Telemetry, exports and analytics are wrapped so a throw, a batching bug or a network
  failure cannot crash or abort the run, the save, or the grade.
- **Defense in depth means a mutation test can stay green while one layer is opened.**
  Do not remove a redundant check because a test did not notice: verify by opening
  BOTH and confirming only that reddens the denial assertions.

---

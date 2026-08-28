---
title: "The platform hosts the runtime libraries (`lane/foundry-vendor`, part 2, code only)"
date: 2026-08-24
branches: [lane/foundry-vendor]
migrations: []
subsystems: ["IDEA Foundry"]
record_order: 132
---

## The platform hosts the runtime libraries (`lane/foundry-vendor`, part 2, code only)

Part 1 established that a bundle whose HTML the checker could not read is no
longer published, and closed the specific escape that let a React app through
with four dead CDN script tags in its head. It did not make that app RUN. This
is the half that does: the libraries are hosted, a CDN reference to one of them
is repointed at our copy on the way in, and the build contract stops telling
students to write plain JavaScript.

### What ships

**The registry, `src/lib/foundry/vendor.ts`.** Pure and client-safe, read by
three runtimes: the browser preflight, the Deno ingest function, and the
SvelteKit route that serves the bytes. It holds what is hosted, its pinned
version, the global it defines, a one-line note, and every alias that means it.
Matching is on THE LIBRARY, never on a URL, because paths and versions vary per
CDN and per generator and an exact-URL list would miss almost everything.

Five files, committed under `src/lib/foundry/vendor/`, verbatim from npm:

| file | package | version | bytes |
| --- | --- | --- | ---: |
| `react.js` | `react` (UMD, production) | 18.3.1 | 10,751 |
| `react-dom.js` | `react-dom` (UMD, production) | 18.3.1 | 131,835 |
| `babel.js` | `@babel/standalone` | 7.29.8 | 3,141,103 |
| `lucide.js` | `lucide` (UMD) | 1.34.0 | 419,498 |
| `tailwind.js` | `@tailwindcss/browser` | 4.3.3 | 282,289 |

sha256, in the same order: `d949f1c3687aedadcedac85261865f29b17cd273997e7f6b2bfc53b2f9d4c4dd`,
`35f4f974f4b2bcd44da73963347f8952e341f83909e4498227d4e26b98f66f0d`,
`533e5c5541abf822d5973a54e08a3f038f511fafd6b7480bc2148dc2c3d54f94`,
`381de5c07d1fa81c3430b04d66a3d710b622c1d702fadd0a0448470d9493b6f1`,
`a60c785630a06196808cbe79e6f7bdb4abcc8f4421a47b56f29338fc84805e3b`.

**Repo size cost: 3,985,476 bytes, 3.80 MiB, of which Babel is 79%.** That is
the price of a `text/babel` script working with no build step, and it is the
single thing that makes a generated React app run here unmodified.

REACT 18 AND NOT 19 because React 19 removed the UMD builds outright, so there
is no 19 to host in this shape, and the tools still emit `react@18` tags.
BABEL 7 AND NOT 8 because `@babel/standalone` unpinned now resolves to 8, and 7
is what the in-browser JSX path has been exercised against for years.

**Serving.** `/_platform/lib/<file>.js`, in the existing `_platform` route,
imported `?url` and read with `read()` exactly as the fonts are -- a file in
`static/` is served by Vercel's filesystem on every host, which would put these
on the main host too. Measured on the apps host: all five 200 with byte counts
identical to the committed files; all five 404 bodyless on the main host; an
unknown key 404s; `lib/..%2ffonts.css` 404s.

They cache `public, max-age=86400` where everything else on that host is
`private, no-store`. The difference is whose bytes they are: pinned npm
packages, identical for every viewer, versus a student's own bundle behind a
withdrawable token. Not `immutable`, because the path deliberately carries no
version and a bump reuses it.

**The rewrite.** `scanHtml` decides it and returns the repaired text;
`foundry-ingest` decides to KEEP it. The browser preflight calls the same
function and throws the repaired text away, because it writes nothing anywhere
and a preflight that quietly edited the file about to be uploaded would make the
upload and the check disagree about what was checked.

`AttrFinder` locates a value AS AN ATTRIBUTE -- preceded by an equals sign and
an optional quote -- rather than as a run of text, and `applyEdits` splices it.
A replacement carrying a newline is refused, so no edit can move a line number,
which is what lets the notes report positions in the ORIGINAL file. Verified on
the fixture: line count identical, and every byte outside the four replaced
spans identical. A span that cannot be located falls through to the refusal it
would otherwise have had.

**`/foundry/starter`**, generated from the same registry, linked from the submit
surface and the contract. It must pass its own preflight with ZERO rewrites; a
starter that had to be repaired would mean the paths we hand out are not the
paths we serve.

### The two defects the acceptance drive found

**The rewrite worked and the app was still blank.** The four tags were
repointed correctly, the bytes served were right, and nothing rendered. The
console said `ReferenceError: React is not defined` while Babel's own
in-browser-transformer warning sat in the same log -- so Babel had loaded, from
the same route, on the same origin, with the same headers, and React had not.
The one difference is the `crossorigin` attribute, which React's own published
CDN snippet carries and which the fixture therefore carries too.

A bundle runs in an OPAQUE ORIGIN. An opaque origin is same-origin with nothing,
so a request to its own host is cross-origin, and anything fetched in CORS mode
needs a header back. `/_platform/*` now sends `Access-Control-Allow-Origin: *` --
public npm builds and six font files, nothing about anybody, and `*` forbids
credentialed requests anyway on a host that sets no cookie. It is NOT on the
bundle path, where the absence is load-bearing.

**This also fixes the platform fonts, which had never worked inside a bundle.**
Every font-face fetch is made in CORS mode with no attribute to leave off, so
Part 1's whole deliverable was being discarded in exactly the place it existed
for. `CLAUDE.md` recorded this as a limitation of the claude-in-chrome
instrument; that entry has been corrected in place. "Confirmed identical on
production" was read as evidence FOR the instrument when it was evidence
against it -- the opaque origin is the same in production, so the same failure
in both places means the page. The hostile fixture now reports
`platform-font-loaded YES 1 face(s)`, measured with `document.fonts.load`
rather than with a computed `fontFamily`, which reports the declared stack and
says nothing about whether a face arrived. The two had been conflated.

**A tag carrying `integrity` would have failed silently.** The hash is of the
other site's bytes; ours cannot match it, so the browser refuses the script --
a blank app under a note claiming we fixed it. cdnjs puts `integrity` in its
copy-paste snippet, so this arrives in real files. Such a tag is REFUSED rather
than repaired, and the refusal names the checksum and says what to delete.
Deleting the attribute ourselves would have worked; it was rejected because the
rewrite's licence is to change one attribute VALUE, and the moment it stops
being "swap one URL" nobody can say what it did.

### The messages

`referenceMessage` now takes the TAG. `relativeExample`'s fallback came from a
hardcoded `file.css`, so `https://unpkg.com/lucide@latest` -- which has no
extension anywhere in it -- told a student to write `src="file.css"`: a
stylesheet name, inside a script tag, for an icon library, in a sentence about
to be pasted back into the tool that generated the app. The fallback now comes
from the tag.

A refusal for a CDN library we do not host lists every library we DO host and
the exact tag to write. An `import` of one we host names the script-tag form and
the global instead, because we host UMD builds and an ESM import of one would
bind `undefined` hundreds of lines from where it fails.

### Verification

`svelte-check` 0 errors / 37 warnings, mix 31 `state_referenced_locally`, 5
`css_unused_selector`, 1 `perf_avoid_nested_class` -- the baseline, held. Note
that `tsconfig.json` now excludes `src/lib/foundry/vendor/**`: with `checkJs` on,
five minified npm builds produced 20,729 errors about code nobody here wrote.
They are imported `?url`, which type-checks nothing, so the exclusion costs
nothing that was being checked.

Full suite: 107 files, 2438 tests, green.

`tests/foundry-vendor.test.ts` is new (23 cases) and covers the four failures
that are silent: a library with no bytes behind it, the wrong library matched,
an ESM import repointed at a UMD build, and the starter or contract drifting
from what is served. Plus the CORS header and the `integrity` refusal, each with
a positive control.

`tests/foundry-parse-failure.test.ts` had one assertion generalized rather than
deleted. It read "refuses all four, naming each URL and the line it is on"; the
four are now repaired, so it asserts the property that must hold either way --
no CDN script tag is ever silently left alone, each is named exactly once, each
carries its own line, and the served bytes no longer contain the URL.

**The acceptance drive.** `tests/fixtures/foundry/approved-react-app.html`, the
real file, unmodified, through `/dev/foundry-submit`: normalized (packed as
`index.html`, reported), preflighted, all four tags rewritten with notes naming
lines 7, 8, 9 and 10, posted into the in-memory fixture, served through the REAL
proxy on the apps host under a REAL token, and framed by the REAL `AppFrame`.
It renders, and it is interactive: the timer counts down from 25:00, Start
becomes Pause, and the disclosure expands to its three rows. Screenshotted in a
real Chrome, which composites where the verification pane does not. The starter
file was put through the same path and renders its counter, headline in
Orbitron.

The harness gained a third fixture app whose bytes the browser fills in at run
time (`setFixtureBundle`, plus a dev-only `POST /dev/foundry-run`). That is what
makes the drive end to end rather than a second computation of the same answer:
what the frame renders is the output of the pipeline in that run, in that
browser. It is a source of bytes, not a second proxy -- the same route, token
verification, publication re-check, headers, CSP, shim and sandbox.

The hostile bundle was re-run afterwards, because the CORS header is new on a
host it shares: `window.origin null`, `parent.location BLOCKED SecurityError`,
`top.document BLOCKED SecurityError`, `set-top.location BLOCKED SecurityError`,
`window.open REACHED null` (no window), `document.cookie BLOCKED SecurityError`,
`external-script-global undefined (blocked)`, `fetch-external BLOCKED
TypeError`, `fetch-same-path BLOCKED TypeError`, and the API image did not load.
Nothing opened.

**Dev cold start was measured rather than assumed**, because a first request
took 136s, then 391s on a cleared Vite cache. With the branch stashed and the
cache cleared identically, main took **407s**. The 3.8 MB of vendor files add
nothing measurable; the slow cold start is pre-existing on this machine.

`.gitattributes` is new. `core.autocrlf` is `true` here, and a stash/pop round
trip changed the md5 of all five vendor files. `-text` keeps them byte-identical
to the tarballs, which is what makes the versions and sizes recorded above true
of what is served.

### Not verified

- Nothing ran against the live Supabase project or a real `foundry-ingest`
  invocation. The rewrite was exercised through the shared module from the
  browser side; the Deno side imports the same function and stores its result,
  and that store was not observed.
- No Vercel deployment. The `read()`-from-`?url` path for the five library files
  is verified in dev only; the fonts prove the same mechanism works on
  production, but these are larger and there are five more of them.
- The `Access-Control-Allow-Origin` header is verified in dev. Vercel does not
  strip response headers from a function, but that was not observed here.
- `/foundry/starter` answered 303 to every local request, which is the
  `authedPrefixes` guard working and means the ROUTE's body is unverified
  locally. The bytes it returns were verified by calling `foundryStarterFile()`
  directly, which is the only thing the route does.
- Whether Tailwind v4's browser build satisfies apps written against the v3 Play
  CDN. The version note tells the student it changed; no real Tailwind app was
  tested.
- The `integrity` refusal is verified through the shared module and the browser
  preflight. No bundle carrying a real, correct SRI hash was served.

---


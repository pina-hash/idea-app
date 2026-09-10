# 0126 The HTML-assignment boundary: the sandbox, the bridge and the serving route

- Issued: 2026-09-10
- By: Mr. Pina, as one of four lanes building the ported-HTML-assignment
  subsystem against a single normative contract carried in every prompt.
- Owns: `src/lib/classroom/html-assignment/bridge.ts` and
  `HtmlAssignmentFrame.svelte`, `src/routes/hx/**`,
  `src/routes/dev/html-assignment/**` EXCEPT `fixtures/`,
  `tests/html-assignment-bridge*`,
  `tools/browser-verify/routes/html-assignment*.mjs`, the generated regions of
  `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0126-*`, and its
  own `docs/history/` entry.
- Does NOT own: `src/lib/classroom/html-assignment/manifest.ts` and `store.ts`
  (0127), `src/routes/dev/html-assignment/fixtures/` (0128),
  `src/lib/classroom/html-assignment/rubric.ts` (0129). None of those files
  existed at any point during this lane; none was created and none imported.
- Migration permitted: no. Claims: none.
- Lands on: `integration` only. Nothing merged to `main`.
- Status: issued
- Branch: `claude/html-assignment-manifest-contract-tpr7eg`, from
  `origin/integration` at `fd8e136e`. The branch NAME says "manifest", which is
  0127's subject; it is the name the harness minted for this session and the
  ledger id, the owned surface and the work are all 0126's. Nothing in this
  branch touches a manifest module.
- Notes: BUILD THE BOUNDARY AND NOTHING ELSE -- no database, no import UI, no
  grading, a hardcoded document string as the fixture. Delivered: the serving
  route `/hx/<docId>` with the contract's CSP; `bridge.ts`, the protocol types
  and the pure message handling; `HtmlAssignmentFrame.svelte`, the sandboxed
  frame and the parent side of every message; a `/dev/html-assignment` harness
  that mounts the real frame against the real route and is attacked by a
  hostile document; 48 unit tests; a browser-verify route measuring 36 values
  at 375px and 1440px, 0 outside threshold.
- Contract deviations, none taken locally, both reported: (1) `event.origin`
  from a correctly sandboxed frame is the string `"null"`, not the document
  origin -- measured, and a literal comparison against
  `https://sandbox.ideabosco.com` would drop every real message and make the
  feature silently inert. Implemented as `hxExpectedOrigin`, which derives the
  expectation FROM the sandbox flags, so production still validates a real
  origin against a real expectation. (2) The contract's CSP carries no
  `sandbox` directive, so a DIRECT navigation to a `/hx/` URL is not put in an
  opaque origin the way a framed one is. Not added; reported for the contract
  owner. (3) `frame-ancestors` is resolved rather than written out, so a dev
  server and a preview can frame the document at all -- production with nothing
  configured produces the contract's literal byte for byte, asserted in a test.
- Deployment work nobody in a session can do, stated in full in the history
  entry: `sandbox.ideabosco.com` must be added as a domain on the Vercel
  project with a DNS record, and `PUBLIC_HX_SANDBOX_ORIGIN` set to
  `https://sandbox.ideabosco.com` in the Vercel env. Until both, the route
  answers on any host, which is correct for dev and preview and is NOT correct
  for production.
- Files this lane could not write, and which the integration bundle owes:
  `.env.example` needs a stanza for `PUBLIC_HX_SANDBOX_ORIGIN` and
  `PUBLIC_HX_PORTAL_ORIGIN`, and `CLAUDE.md` needs the two variables and the
  origin-split rule. Both are shared files outside this lane's owned surface
  and three other lanes were editing the same subsystem concurrently.

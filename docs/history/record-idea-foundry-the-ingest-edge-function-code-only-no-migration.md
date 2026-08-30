---
title: "IDEA Foundry, the ingest Edge Function (code only, NO migration)"
date: 2026-08-23
branches: []
migrations: []
subsystems: ["IDEA Foundry"]
record_order: 119
---

`supabase/functions/foundry-ingest` plus the shared preflight rules in
`src/lib/foundry/`. Takes a zip a student has already uploaded to
`foundry-uploads`, preflights it, and on a pass extracts it into
`foundry-bundles` and `student_app_files`. Built on `lane/foundry-ingest`,
merged `--no-ff`. **No migration ships in this bundle**, and the function was
NOT deployed: a functions deploy is live in production immediately regardless of
which branch it came from, and nothing calls this yet.

### What was built

- **`src/lib/bundle-path.ts`** -- the path rule, extracted out of
  `$lib/server/classroom-decks` so three callers on three runtimes can share ONE
  implementation: the deck proxy (Node), the ingest function (Deno) and the
  browser preflight. `classroom-decks.ts` now imports it and re-exports it under
  its original deck names, so no deck call site moved and its 63 tests pass
  unchanged. It is still the mirror of 0101's `_classroom_deck_path_ok`.
- **`src/lib/foundry/preflight.ts`** -- the ONE copy of every cap, extension,
  reference rule and student-facing sentence. The function and the browser both
  import it, so a rule cannot be enforced two ways or worded two ways.
- **`src/lib/foundry/zip.ts`** -- a dependency-free reader on
  `DecompressionStream`, which is a Web API both Deno and the browser have and
  `$lib/server/deck-zip` (Node's `inflateRawSync`, random-access Drive source)
  cannot use. It owns the incremental uncompressed cap.
- **`src/lib/foundry/html-dom.ts`** -- the HTML walk, given its parser. The
  browser passes `DOMParser`, the function passes deno-dom. A REAL parser rather
  than a regex over attributes, because a false positive here reads to a student
  as arbitrary rejection.
- **`src/lib/foundry/preflight-browser.ts`** -- the pre-upload check. UX only.

### Load-bearing decisions

- **Two clients, two jobs.** The caller's JWT establishes identity and nothing
  is read through it: `foundry_can_read_version` legitimately returns other
  people's published versions, so a successful read proves nothing about
  ownership. Ownership is compared against the row the service-role client reads.
- **The zip path is re-pinned to the owner in the function.**
  `foundry_create_version` validates `p_zip_path` as a legal path but does NOT
  require it to sit under the caller's own prefix, and this function reads that
  bucket with service_role, which bypasses the storage policy that would
  otherwise be the only thing enforcing it. Without the check a student could
  name another student's upload prefix at create time and have their zip
  extracted into their own app.
- **A refusal a student reads is a 200 with `ok:false`.** The preflight
  considered the upload and answered; a client treating that as a transport
  failure would retry it five times.
- **The purge happens at the START OF THE WRITE, not at the top.** "Refused,
  nothing written" means nothing deleted either, so a failing re-run leaves the
  previous extraction intact; only a run that has passed every check clears the
  old set.
- **Everything is inflated before anything is written**, which is what lets a
  hard fail leave the bucket untouched and the budget abort partway with nothing
  to undo. The ceiling is 25 MB.
- **OS noise is dropped and REPORTED.** `__MACOSX/`, `.DS_Store`, `Thumbs.db`,
  `._*`. None would pass the extension allowlist, so leaving them in would refuse
  most zips a Mac has ever made, over files the student cannot see in Finder. A
  leading dot is NOT noise on its own -- decks depend on that.

### Three bugs found by verification, each of which presented as a clean pass

1. **The zip reader was not decompressing.** The compression method sits at
   central-directory offset +10; it was read at +8, which is the general-purpose
   flags, which are 0, which means STORED. So every deflated entry came back as
   its own compressed bytes. Every structural check passed (the NAMES were
   fine), the extension check passed, and the content scanners found no CDN
   links because they were scanning deflate output. Caught only by downloading a
   stored `index.html` and finding 184 bytes of binary where 289 bytes of HTML
   should have been.
2. **The JS comment blanker did not track string literals.** Every URL contains
   `//`, so an import of `"https://esm.sh/y"` had its second half blanked and the
   student-facing message quoted the next line of their program back at them.
3. **A null document was treated as an empty page.** deno-dom's
   `parseFromString` is typed `Document | null`; returning an empty facts object
   for a null document switches every HTML rule off at once while reporting a
   clean pass. It now throws, `scanHtml` reports `parseFailed`, and the student
   is told that page could not be checked.

### What was measured

Against a LOCAL Supabase stack (`supabase start`, all 130 migrations applied,
the real Storage service and the real 0130 policies -- not the embedded-Postgres
stub, which ships no storage grants and would only ever refuse an arrangement
the test built itself). 42 assertions, 0 failures.

- **Storage boundaries.** A student-context write to `foundry-bundles` is
  refused with `new row violates row-level security policy` (403); the
  service-role write succeeds; a student writes their OWN `foundry-uploads`
  prefix and is refused on another student's with the same message; a read-back
  of their own upload is refused.
- **Fixtures, each a genuine zip:** a clean vanilla app (6 rows, 6 objects,
  correct content types, version still `draft`); the same app inside one wrapper
  folder (stripped and reported); zip-slip at `../../evil.txt` (refused, 0 rows,
  0 objects); a symlink entry (refused); an absolute-path asset, a CDN script,
  Google Fonts and a URL import (each refused with a quoted line number); 501
  files (refused); a 33 KB zip unpacking to 30 MB (refused, aborted at
  `big24.txt`, which is partway); pass-then-re-run (exactly one file set, 5 not
  11); another student invoking the version (404, byte-identical to a missing
  id); no JWT (401).
- **`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`) -- the documented
  baseline, unmoved.
- **Mutation proof.** Disabling the traversal check in `bundlePathOk`
  PERMISSIVELY reddened exactly the containment test and the SQL-mirror test;
  `src/lib/bundle-path.ts` was restored md5-identically and re-verified green.

### THE BLOCKER, and it is 0130's rather than this code's

**`service_role` holds no EXECUTE on `_classroom_deck_path_ok` or
`_foundry_norm`, and CHECK constraints on all three Foundry tables call them.**
0130 revokes both from `public` and never grants them onward. The RPCs escape
this by being SECURITY DEFINER; the DIRECT service-role writes that 0130
explicitly designs the extraction function to be the only source of do not. The
observed errors are `permission denied for function _classroom_deck_path_ok` on
the `student_app_files` insert and `permission denied for function
_foundry_norm` on the `student_app_versions` update. So 0130's `grant ... to
service_role` on those tables is dead for any column carrying such a CHECK.

The next migration must ship this, and the function cannot be deployed until it
does:

    grant execute on function public._classroom_deck_path_ok(text) to service_role;
    grant execute on function public._foundry_norm(text) to service_role;

Applied to the LOCAL stack only, so verification could proceed. No migration
file was created in this lane.

### A second 0130 finding, not blocking, not fixed here

**`foundry-uploads` has INSERT, UPDATE and DELETE policies but NO SELECT policy,
which makes the UPDATE and DELETE ones inert.** Storage has to find an object
before it can replace or remove it, and PostgreSQL applies SELECT policies to a
WHERE-qualified UPDATE, so a student gets exactly ONE write per path, forever:
`upsert` is refused, `update` is refused, and `remove` reports success while the
object survives. Measured directly -- with the JWT claims set in SQL, a student
sees 0 rows in that bucket and 2 in `foundry-covers`.

The consequence for the flow is real: a student cannot replace a fixed zip at
the same path, so every upload attempt needs its OWN path and a fixed zip is a
NEW version rather than a re-run of the old one. The function's idempotency is
unaffected and was verified by replacing the bytes with service_role. Whether to
add a narrow owner-scoped SELECT policy is a decision for the next lane; the "a
zip is an input, not an artifact" argument in 0130's header is what would have
to move.

### NOT verified

- **The function was never deployed and has never run on the live project.**
  Everything here is the local stack.
- **The browser preflight was not driven in a browser.** It shares every rule
  with the server path, which was exercised end to end, but the `DOMParser`
  reader and `preflightZipInBrowser` itself have not been mounted in a page --
  there is no Foundry UI yet to mount them in.
- **The build contract document was not supplied.** The messages were written
  against the requirements as stated in the prompt (one folder with index.html
  at the top level, vanilla HTML/CSS/JS, relative paths, no network,
  `/_platform/fonts.css`, in-memory localStorage, the sandbox blocking
  `window.parent` / `window.open` / navigation / downloads). They should be read
  against the real document before students see them.
- **`mailto:` and `tel:` are refused** as schemes, per the stated rule. They
  carry no network load, so this may be worth loosening once the document is in
  hand.
- **`supabase functions serve` does not reload files outside
  `supabase/functions`,** and its Deno module cache lives on a Docker volume
  whose mtimes a Windows bind mount does not invalidate. Three separate
  measurements were taken against a stale bundle before this was found. Removing
  the container AND the `supabase_edge_runtime_<project>` volume is what actually
  picks up a change in `src/lib`.

---


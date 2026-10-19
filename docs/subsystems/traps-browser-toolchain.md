# Known traps: the Browser pane and the toolchain

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). Instrument limits and machine-level traps. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

### The Browser pane (`mcp__Claude_Browser__*`)

This subsection is for a fact about the VERIFICATION ENVIRONMENT itself -- something
that costs a debugging detour to rediscover because the pane behaves unlike a real,
foregrounded browser tab. It is not for facts about the application under test; those
belong wherever the app's own behaviour is documented.

- **It does not composite.** Screenshots time out; **every visual claim must be a
  measured computed-style, geometry or hit-test read**, and must be reported as
  such.
- **CSS transitions are frozen at t=0**, so `getComputedStyle().color` on anything
  the global `a`/`.btn` transition covers reports the PRE-transition value forever.
  Inject `* { transition: none !important }` before asserting any computed colour.
  **This is not only about colour: a transitioned LAYOUT property leaves the pane's
  own layout stuck at the old value too** -- a split whose `grid-template-columns`
  eases reported a 0px detail pane after opening one, which reads exactly like a
  broken rule and is not one. Inject the same style before ANY geometry read on a
  surface that animates, and note that the animation itself cannot be observed here.
  Interpolability CAN be: `el.animate([from, to])`, `pause()`, then set
  `currentTime` and read the computed value at several points -- a smooth ramp
  proves the two values interpolate, a jump at 50% proves they are discrete.
- **IT BLOCKS EVERY SUBRESOURCE REQUEST MADE FROM AN OPAQUE ORIGIN**, which
  means a sandboxed iframe's own stylesheet, script, image and font requests all
  fail with `net::ERR_BLOCKED_BY_CLIENT` and NO `securitypolicyviolation` event.
  That reads exactly like a CSP mistake and is not one -- it cost a wrong
  diagnosis here (a bundle rendering in Times New Roman with its stylesheet
  sitting in `document.styleSheets` looking loaded). **The discriminator is to
  fetch the IDENTICAL URL from an ordinary page in the same browser**: 200 there
  and blocked in the sandbox is the instrument, not the policy. A real CSP
  refusal fires `securitypolicyviolation` and names the directive. Consequence:
  **a sandboxed bundle's subresource behaviour cannot be verified in this pane
  at all**, and neither can what its requests carry.
- **Cross-origin iframe navigations to a localhost/loopback dev server are
  blocked INTERMITTENTLY**, same `ERR_BLOCKED_BY_CLIENT`, while the identical
  URL loads fine as a top-level navigation. A frame created programmatically
  right after a fresh page load is the shape that worked; repeated reloads of
  the same frame are the shape that did not. Read the network log rather than
  trusting `load` -- **`load` fires on a blocked navigation too**, so a frame
  that never loaded looks like one that did.
- **`IntersectionObserver` NEVER FIRES AT ALL, for anything.** `loading="lazy"`
  images never request, and neither does any hand-written observer: `AppLauncher`
  stamps `opacity:0` inline on every card at mount and clears it from an IO
  callback, so in this pane all eight cards sit at 0 forever and every title,
  mark and CTA in the launcher drops out of a sweep as invisible -- a smaller
  denominator with nothing to say the launcher went missing. Confirmed by
  scrolling all eight through the centre of the viewport and re-reading their
  inline opacity, which stayed "0". **Do not scroll and hope.** Put the
  component into its own settled state the way its own cleanup does (clear the
  inline entrance styles), which is byte-identically what the reduced-motion
  path renders from the first frame, and say in the report how many you
  settled.
- **KILLING `animation` ALONG WITH `transition` FREEZES ENTRANCE ANIMATIONS AT
  THEIR FIRST FRAME.** The blanket `* { transition: none !important }` this
  section calls for must NOT also say `animation: none` -- six candidates on the
  portal home came back at ratio 1.00 with an accumulated opacity of 0, which
  reads exactly like six real failures and is entirely the instrument's doing.
  Freeze transitions, let animations run, then settle on a TIMEOUT.
- **`requestAnimationFrame` never fires while the pane's tab is hidden.** A Svelte
  flush that depends on rAF never lands, so a synchronous DOM read taken right after
  a state change sees stale values. Confirm by checking whether the read changes
  after a plain `setTimeout` delay instead of immediately. Workaround: flush on a
  timeout, not rAF, when driving or verifying through this pane.
- **`ResizeObserver` never delivers**, and rAF is frozen. Confirm by resizing the
  element and polling the value the callback would have set -- it never changes on
  its own. Workaround: patch the `ResizeObserver` constructor to capture the
  callback, resize the element for real, then invoke the captured callback directly.
- **A stage element measured while its container is `display:none` captures a 0x0
  size PERMANENTLY**, because the app's own recovery path is a `ResizeObserver`
  callback that (per above) never arrives here to correct it. Gate any measurement
  on the container actually being visible before reading its size.
- **`dialog.close()` does not dispatch a `close` event** in this pane, confirmed
  against a bare vanilla `<dialog>` rather than assumed from application code. A
  deliberate close path in code under test should notify its parent directly rather
  than rely on the event round trip when verifying here.
- **`dialog` `close` and `cancel` events do not bubble here**, so Svelte's delegated
  `onclose`-style attribute binding silently never fires. Attach with
  `addEventListener` directly on the element when scripting a verification.
- **Navigation sometimes reports failure while having actually succeeded.** Confirm
  by reading the page (`read_page` / `get_page_text`) rather than trusting the
  `navigate` call's own result.
- **A `git stash` DOES NOT RELIABLY REACH THE SERVED BUNDLE.** A before/after
  measurement taken by stashing the tree and reloading measured the CHANGED
  stylesheet on a stash that had already landed on disk: Vite's watcher had not
  invalidated the module, and the reload served the edited one. It is silent --
  a plausible baseline comes back and the diff simply understates itself.
  **Assert the tree you think you are on by reading a TOKEN the change moves**
  (`--stamp-ink` unset, a `.sep` at 0.6) before running the sweep, and `touch`
  the files after a stash or a pop to wake the watcher.
- **A forced state must be forced onto a UNIQUE node.** `document.querySelector('.sep')`
  returned an unrelated component's separator, because Svelte's scoping hashes
  the STYLE and not the class: four `.sep` elements were in that tree and two
  were the badge's. Anchor a scripted read at a `data-testid`, or at a
  descendant selector under the component's own root, and print the match COUNT
  beside the value -- a single-node read that silently hit the wrong node reads
  exactly like a correct one.
- **A live WebGL canvas hangs pane screenshots.** Read the framebuffer back instead
  (pixel counts, occupancy grids), or use claude-in-chrome.
- **A harness whose loop rides rAF must be told to pump it** (`?glheadless=1` on
  the GREENLINE harnesses, read from the URL so it works on any route). Without it
  the sim silently never ticks and every physics assertion passes vacuously.
- **Enter and Tab dispatched through the pane do not reach a ProseMirror keymap.**
  Text typed with `computer` arrives, but the keys an editor binds commands to are
  swallowed, so a list cannot be indented or split from here. Drive a rich-text
  editor by dispatching a real `paste` ClipboardEvent with a `text/html` payload
  instead -- which is the path most structural editor bugs arrive on anyway -- and
  read the result back as `editorDOM.pmViewDesc.node.toJSON()`, which is the
  editor's own document without needing the instance exposed.
- **A long `await` loop inside one `javascript_tool` call KEEPS RUNNING after the
  call times out.** Keep scripted UI loops short, or verify state before trusting a
  later measurement.
- **The claude-in-chrome tab is a BACKGROUND tab that no OS window shows**, so
  OS-level input (SendInput) cannot reach it and it has no middle mouse button.
  Route real hardware input through a same-origin popup it opens and scripts.
- **A rolling performance counter measures your own instrumentation.** Stop every
  sampler and wait past the window before reading it.
- **A REAL CHROME IS CONNECTED NOW, so CHECK rather than assume either way.**
  This line used to say none was, on the strength of prior sessions finding
  nothing attached; `mcp__claude-in-chrome__list_connected_browsers` returned a
  live local browser on 2026-08-23 and the Foundry host verification ran through
  it. It is the user's own Chrome, so it carries their real sessions -- which is
  what makes it the only way to read a signed-in page or a Vercel deployment
  behind SSO. It can go away again; ask the tool, and fall back to the
  `mcp__Claude_Browser__*` pane (with the limits above) when it is not there.
  - **IT COMPOSITES AND SCREENSHOTS, WHICH THE PANE DOES NOT** -- it is the
    right instrument for anything visual, and for a live WebGL canvas.
  - **A SCRIPTED `fetch`/XHR SWEEP IS BLOCKED ON AN ORIGIN HOLDING AUTH
    COOKIES.** `javascript_tool` answers `[BLOCKED: Cookie/query string data]`
    when the script returns response bodies, headers or URLs from such a page --
    status codes and byte lengths alone get through, and top-level navigation is
    never blocked. Measuring a protected Vercel preview therefore means
    navigating per path and reading `location.href` plus a body length, where
    an empty response lands on `chrome-error://chromewebdata/`.
    **READ THE STARTING PAGE BEFORE TRUSTING THAT SIGNAL**: a navigation Chrome
    turns into a DOWNLOAD (any `.woff2`, and anything else it will not render)
    leaves the tab on the PREVIOUS page, so a font that served correctly looks
    like a failure if the tab was already on an error page. It cost a wrong
    diagnosis here. The download also lands in the working directory, so sweep
    for stray files before committing.
  - **A SANDBOXED, OPAQUE-ORIGIN DOCUMENT FAILING TO LOAD ITS OWN FONTS WAS A
    REAL BUG, NOT AN INSTRUMENT ARTEFACT, AND THIS ENTRY USED TO SAY THE
    OPPOSITE.** It read "CANNOT LOAD ITS OWN FONTS HERE, AND THAT IS NOT A BUG
    IN THE PAGE" -- a `FontFace` load failing `NetworkError` because an opaque
    origin makes the request cross-origin and the response carries no CORS
    header. Every clause of that was true; the conclusion was not. "Confirmed
    identical on production" was read as evidence for the instrument when it was
    evidence AGAINST it: the opaque origin is the same in production, so the
    same failure in both places means the page, not the tool. The missing header
    was ours, `/_platform/*` now sends `Access-Control-Allow-Origin: *`, and the
    hostile fixture reports `platform-font-loaded YES 1 face(s)` from inside the
    frame. **The lesson that survives is the diagnostic one:** a CORS failure
    from an opaque origin looks exactly like this pane's subresource blocking,
    and the discriminator is a same-route control -- one asset fetched WITHOUT
    `crossorigin` alongside one fetched with it. If the plain one loads, the
    tool is fine and the header is missing.

### Machine and toolchain

- **`npm test` runs `tools/run-tests.mjs`, which passes `--no-file-parallelism` to
  vitest** (`vitest run --no-file-parallelism`), so plain `npm test` is always the
  safe invocation. **`npx vitest run a.test.ts b.test.ts` IS the bare, parallel
  form, and it is easy to reach for**: measured on 2026-10-01, six full-chain db
  files under it once had two suites' `beforeAll` fail with every test skipped
  and then passed on a re-run, while `npm test -- <the same six>` passed 130 of
  130. Pass several files through `npm test --`, never through bare `npx vitest
  run`. DB files
  used to starve each other's `beforeAll` because each booted its own embedded
  Postgres; they now share ONE cluster (see Testing), which is the fix for that,
  not more concurrency. Serial files are what keep each file's own database the
  only isolation question worth answering: run in parallel, multiple worker
  processes race the `create role ... if not exists` guards in
  `tests/db/supabase-stub.sql` against that one shared cluster and fail
  nondeterministically (confirmed: two different failure signatures across two
  cold runs), independent of code correctness. **Do not add a parallel `test`
  variant** -- it is broken, not faster, and a second script offering it is a
  second way to hit this.
- **DO NOT RUN PRETTIER. IT IS REACHABLE AND IT IS NOT CONFIGURED, WHICH IS THE
  WORST OF THE THREE POSSIBLE STATES.** With no config the defaults apply, and
  the default is TWO SPACES over a codebase indented with TABS -- so a run
  rewrites every line of every file it touches and turns a three-line fix into a
  whole-file diff nothing can be reviewed against. The churn is silent: it
  formats cleanly, exits 0, and says nothing about having reformatted 2,000
  lines you did not write.
  - **IT IS NOT A PROJECT DEPENDENCY, AND THAT IS WHY IT IS DANGEROUS RATHER
    THAN WHY IT IS SAFE.** Measured: no `prettier` in `dependencies` or
    `devDependencies`, not in `node_modules`, and **zero occurrences in
    `package-lock.json`**. There is no `.prettierrc`, no `prettier` key in
    `package.json`, no `.editorconfig` and no `format` script. But a bare
    `prettier` resolves anyway -- it is installed GLOBALLY in the agent
    environments this repo is worked in (`/opt/node22/bin/prettier`), and `npx
    prettier` would fetch it from the registry on demand. So there is nothing in
    the repo pinning its version, nothing stating the house style, and nothing
    that records it ran. A pinned devDependency would at least be one of those.
  - **MATCH THE SURROUNDING STYLE BY HAND**, and do not add a config to "fix"
    this as a side effect of an unrelated task. Adopting a formatter is its own
    bundle and its diff is the entire repository; smuggling it in under another
    change is how a surgical fix becomes unreviewable.
- **`npm install` REWRITES `package-lock.json`'s INDENTATION TO MATCH
  `package.json`'s, WHICH TURNS A ONE-PACKAGE ADD INTO A WHOLE-FILE DIFF.** npm
  detects a lockfile's formatting from the manifest beside it and writes the
  whole file back in that style -- silently, exit 0, with nothing in the output
  saying it reformatted anything. It is the prettier problem one file over, and
  it has the same cost: the real change becomes unreviewable.
  - **THIS REPO IS EXACTLY THE DIVERGENT CASE, MEASURED**: `package.json` is
    TAB-indented and `package-lock.json` is TWO-SPACE indented, and the lockfile
    is **4,649 lines**. So a one-package add here does not produce a handful of
    lines, it produces a 4,649-line diff.
  - **`npm ci` DOES NOT DO THIS.** It installs FROM the lockfile and never
    writes it, so restoring `node_modules` in a fresh checkout -- which is every
    cloud session -- is always `npm ci` and never `npm install`.
  - **WHEN A DEPENDENCY GENUINELY HAS TO BE ADDED**, run the install, then read
    `git diff --stat package-lock.json` BEFORE committing. A count in the
    thousands for a one-package add is the reformat, not the dependency:
    `git checkout package-lock.json` and add the entry so the two files' styles
    already agree, or commit the reformat as its own commit so the dependency's
    own diff stays readable. **Never let it ride along inside another change.**
- **A BUILD LEAVES ABOUT 440MB INSIDE THE ROOT THAT A DEV SERVER THEN CRAWLS,
  AND THE SYMPTOM IS A VITE THAT PRINTS "ready" AND ANSWERS NOTHING.** On Linux
  the build succeeds and leaves `.vercel/output` and `.svelte-kit/output` behind
  (219MB and 218MB, measured 2026-09-23). Run next, `npm run verify:readme`
  failed "vite dev did not answer within 180000ms" twice, with debug logging
  showing a one-line module taking over four seconds to load; with the two
  output directories deleted, the same page answered in 1.0s. Both are build
  artifacts the next build rewrites, so delete them before any dev server or
  harness run that follows a build -- which is the order the merge gate runs
  them in.
- **`npm run build` dies on Windows in the Vercel adapter's `closeBundle` with
  `EPERM`** writing a path Windows cannot create. Machine-level and PRE-EXISTING,
  not a code failure; Vercel builds on Linux and is unaffected. It does NOT stop
  the one check a local build is wanted for: SvelteKit's illegal-import pass runs
  during compile, so a `$lib/server` leak into client code still fails loudly first.
- **Generated route types go stale after adding a load key** -- run
  `npx svelte-kit sync`, or `svelte-check` reports a phantom error.
- **`cannon-es`: a static body keeps a stale world AABB** computed while its
  quaternion was identity, and raycasts (unlike contacts) are AABB-culled. Call
  `updateAABB()` after rotating a static ground plane.
- **DOCKER AND THE SUPABASE CLI LIVE IN WSL, NOT ON THE WINDOWS SIDE, AND THE
  WINDOWS CHECK LIES ABOUT IT.** `docker` and `supabase` are not on the Windows
  PATH and `supabase status` run from Windows cannot see a stack running inside
  WSL -- it returns an error that reads as "nothing is running", which is how a
  session concluded the local stack was unavailable and skipped a verification
  it could have run. **The check is `wsl docker ps`**, and the stack comes up
  with `wsl -- bash -lc "cd /mnt/c/idea-app && supabase start"`.
  - **ANOTHER PROJECT'S STACK IS USUALLY ALREADY UP, AND IT MUST BE LEFT
    ALONE.** `supabase/config.toml` here is deliberately shifted off the 543xx
    defaults to 544xx (api 54421, db 54422, studio 54423) for exactly that
    reason, and the containers are namespaced `supabase_*_idea-app`, so both
    run side by side. Check `wsl docker ps` before starting anything and stop
    only `idea-app`.
  - **THE EDGE RUNTIME SERVES FUNCTIONS FROM `supabase start` ALREADY**, at
    `http://127.0.0.1:54421/functions/v1/<name>`; a separate `functions serve`
    is not needed. Both are reachable from the Windows side at 127.0.0.1.
  - **PROVE WHICH CODE IS LIVE WITH A BEHAVIOURAL MARKER**, per the caching
    trap below: pick a fixture whose answer CHANGED in the edit you are
    testing and check the new answer comes back, rather than assuming a fresh
    `supabase start` cleared the module cache.
- **`supabase functions serve` DOES NOT RELOAD A FILE OUTSIDE
  `supabase/functions`, and its Deno cache outlives the container.** The CLI
  bind-mounts each `src/lib` file an Edge Function imports, so the import
  resolves -- but the compiled module is cached in the
  `supabase_edge_runtime_<project>` Docker volume, and a Windows bind mount's
  mtimes do not invalidate it. Editing shared code then re-running measures the
  OLD bundle, silently and plausibly: three separate measurements were taken
  against a stale one before this was found. Killing the CLI is not enough
  either, because the container keeps serving. **Remove the container AND the
  volume, then restart**, and prove which code is live by returning a marker
  from the function rather than by assuming.
- **`cannon-es`: `wheelInfo.isInContact` is not readable from game code** --
  `updateWheelTransformWorld` clears it every frame. Use
  `vehicle.numWheelsOnGround`.

---

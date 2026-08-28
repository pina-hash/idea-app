---
title: "A bundle with four CDN scripts was approved and ran blank (`lane/foundry-libraries`, part 1)"
date: 2026-08-24
branches: [lane/foundry-libraries]
migrations: []
subsystems: ["IDEA Foundry"]
record_order: 131
---

## A bundle with four CDN scripts was approved and ran blank (`lane/foundry-libraries`, part 1)

A student submitted a single 25 KB HTML file whose `<head>` carried four
external script tags -- react, react-dom, `@babel/standalone` and lucide, all
from unpkg. Every one is a hard fail under the reference rule. All four passed,
extraction ran, the version reached the review queue, it was approved, and the
app rendered nothing.

### What it was not

Each of these was ruled out by MEASUREMENT against the real file, built as
`tests/fixtures/foundry/approved-react-app.html` (25,159 bytes, four external
scripts, two carrying `crossorigin`):

- **Not `<head>` versus `<body>`.** Both parsers find them in `<head>`.
- **Not `crossorigin`.** The reader keys on `src`; the two tags carrying it were
  found.
- **Not a size or truncation path.** `BROWSER_SCAN_MAX` is 2 MB and the file is
  25,159 bytes, so it was scanned on both sides. There is no truncation path it
  could have taken.
- **Not deno-dom's selector support**, which was the leading hypothesis --
  `querySelectorAll('[src], [href]')` is a selector list of attribute selectors,
  and deno-dom's engine is not the browser's. Run against the real fixture,
  deno-dom **0.1.43 and 0.1.46** (the two published versions bracketing the
  pinned 0.1.45; 0.1.45 itself is not on JSR) both return **4** for that
  selector and both produce all four failures through the real shared scanner.
- **Not the rule.** `classifyReference` returns `{kind:'scheme', scheme:'https'}`
  for all four.
- **Not the browser preflight.** Driven through the real
  `preflightZipInBrowser` on the real fixture, it produced all four refusals with
  correct line numbers.

Running the WHOLE server pipeline -- `readCentralDirectory` -> `planStructure`
-> inflate -> `scanHtml` with real deno-dom -- over a real zip of the fixture
refused it, 4 failures. So on a warm parser, every path already worked.

### What it was

`scanHtml` answered a PARSE FAILURE with **zero failures**, which is the same
answer it gives for a file with nothing wrong in it.

`html-dom.ts` already documented the trigger: deno-dom's WASM parser returns
`null` rather than throwing until it is ready, and a cold Edge Function instance
is exactly when it is not. The null became a throw, the throw became
`{failures: [], parseFailed: true}`, and `foundry-ingest` turned that into a
WARNING reading "Your app was still saved". Extraction ran. Review saw a soft
note. Somebody approved it.

**Measured**, with the reader stubbed to fail the way a cold deno-dom does:
0 failures, 1 warning, extraction runs, verdict PASSED.

The original reasoning is preserved in the code because it sounded right: the
browser will still render the page, the CSP is what actually contains it, so a
parse failure is not evidence of anything wrong with the FILE. All true, and all
beside the point -- every HTML rule runs off the facts the parse produces, so a
failed parse switches the whole gate off while reporting a clean bill.

**The browser half was worse.** `preflightZipInBrowser` ignored `parseFailed`
entirely -- not a failure, not a warning, nothing -- so a student whose page the
browser parser choked on read a clean pass.

### The fix

**One place, so neither caller can forget.** `scanHtml` now pushes a hard
failure when the read throws. Both callers already spread `r.failures`, so the
browser and the server refuse identically with no second opinion about the same
event; `foundry-ingest` keeps only the `console.error`, because the parser's own
error text is an operational fact and not a student-facing one.

**And the root cause, not only the symptom.** `foundry-ingest/html.ts` now
imports `deno-dom-wasm-noinit.ts` and `await initParser()` at module scope, so
the parser is ready before `readHtml` exists at all. A refusal a student did
nothing to earn is a bad outcome even when it is the safe one; the hard failure
is the backstop, the init is the fix.

**Note the direction of the behaviour change.** A parse failure now REFUSES
where it used to publish. That is the safe direction, but it is a change: if the
parser ever fails in production, students see a refusal rather than a silent
pass. That is the intended trade and it is why the init hardening ships with it.

`tests/foundry-parse-failure.test.ts` pins it with the student's actual file,
including a property test that no reader failure can produce a clean pass, with
a positive control beside it.

`SERVER_ONLY_SENTENCES` in the parity suite lost an entry. The sentence was not
reworded and did not move -- the behaviour it described is gone -- and removing
the entry rather than the assertion is exactly what that check exists to force.

### Measured, and relevant to part 2

The served CSP already permits inline script and eval on the bundle host:

```
sandbox allow-scripts allow-modals allow-pointer-lock;
default-src https://apps.ideabosco.com data: blob:;
script-src https://apps.ideabosco.com data: blob: 'unsafe-inline' 'unsafe-eval';
style-src https://apps.ideabosco.com data: blob: 'unsafe-inline';
connect-src 'none';
frame-ancestors https://ideabosco.com
```

So **inline execution is not why these apps are blank**, and part 2's
CSP-widening step is already done, with the reasoning it asked for already
written in `foundryCsp`. The only reason the student's app renders nothing is
that the four libraries are not there.

### NOT DONE

Part 2 in full: hosting react / react-dom / babel-standalone / lucide /
tailwind under `/_platform/lib/`, the ingest auto-rewrite of CDN references to
hosted copies, the `/foundry/starter` template, and the build-contract
regeneration. None of it is started.

**No local stack was available for any of this.** WSL has no distribution
installed, so `wsl docker ps` returns usage text and there is no Docker or
Supabase stack anywhere on this machine -- and therefore no other project's
stack to leave alone either. The Edge Function was not run as a function; what
was run is every module it imports, under a real Deno 2.2.7 with the real
deno-dom, which is the part that was in question. deno.land is blocked from this
machine, so deno-dom came from the JSR npm bridge, which is why the pinned
0.1.45 was bracketed rather than used directly.


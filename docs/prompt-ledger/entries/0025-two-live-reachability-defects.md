# 0025 The two live reachability defects prompt 0023 found
- Issued: 2026-09-03
- By: router chat for IDEA portal work
- Owns: `src/lib/ProfileMenu.svelte`, the tab bar rules in `src/lib/legacy/coins/index.html`, the "Known findings" prose and generated regions in `tools/browser-verify/README.md`, five route specs, `tests/profile-menu*`, `docs/prompt-ledger/entries/0025-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0175
- Status: issued
- Branch: assigned by the harness
- Notes: Prompt 0023 reclassified the harness's standing findings and, in
  doing so, found two real defects that a student meets today. It reported
  both and fixed neither, correctly, because neither file was in its scope.

  ONE. `ProfileMenu`'s trigger measures 34.0px tall against a 44px floor, on
  three routes and both widths, font-independent (a 30px avatar plus 2px of
  padding), with no `.tap-reach-44`. It ships in every page header on the
  site and had never been measured, because the only spec looking at tap
  targets was pointed at a dev page's own buttons.

  TWO. The public IDEA Coin Ledger's fourth tab is off the right edge of a
  phone and cannot be reached. `.tab-bar` is `display: flex` with no wrap and
  no scroll, and the page sets `body { overflow-x: hidden }`, so the overflow
  exists and nothing can scroll to it. 0023 measured 51px in the harness and
  89px in production with the real Orbitron webfont, leaving 17.3px of a
  106.3px tab on screen. The spec had blamed `#student-drawer` for weeks;
  that element is `position: fixed` and contributes nothing to `scrollWidth`.

  Also: the "Known findings" prose in the harness README still describes the
  drawer misdiagnosis. 0023 owned only that file's generated regions and left
  the prose alone.

  Deliberately excluded: any other change to the legacy ledger, which is
  served byte-for-byte and is not being unfrozen by this bundle; and the
  `/dev/notebook` flake, which 0023 could not make fire and claimed no fix
  for.

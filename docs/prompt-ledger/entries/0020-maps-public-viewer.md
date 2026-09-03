# 0020 IDEA Maps: the public viewer at /maps
- Issued: 2026-09-03
- By: router chat for IDEA portal work (Lane 1, Maps)
- Owns: `src/routes/maps/` except `edit/`, `src/lib/maps/viewer/**`, the public read paths in `src/lib/maps/transports.ts`, the maps card rule in `src/lib/AppLauncher.svelte` and its rationale in `tests/home-order-and-accent.test.ts`, `src/routes/dev/maps-viewer/**`, `tests/maps-viewer*`, `tests/db/maps-viewer*`, `tools/browser-verify/routes/maps-viewer*.mjs`, the generated counts block in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0020-*`, and its own `docs/history/` entry.
- Migration permitted: no. Published reads already exist from 0161 and 0163. Highest on origin/main at issue: 0174
- Status: pushed
- Branch: claude/idea-maps-public-viewer-hxz2cx
- Notes: The editor, the grants tier, search, photos and HEIC capture are all
  shipped. Nobody who is not an admin or a grantee can see any of it, because
  `/maps` does not exist. This is the surface the whole subsystem is for: a
  student standing at a toolbox, on a phone, finding where something lives.

  Spec section 6 owns the requirements. Section 10's undecided accent was
  CLOSED by Mr. Pina on 2026-09-02: Maps takes a GREEN accent, because green
  is the pathway's brand identity and an IDEA product reads as one. That
  decision is carried in this prompt and is not the session's to revisit.

  Deliberately excluded: any migration, the editor, revision-history
  surfacing (still P2), and the spec file itself, which goes to 1.2
  separately.

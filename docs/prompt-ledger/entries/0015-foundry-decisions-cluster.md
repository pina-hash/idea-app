# 0015 IDEA Foundry: six answered decisions, gallery management, and the preview control
- Issued: 2026-09-02
- By: router chat for IDEA portal work
- Owns: `src/lib/foundry/**` (except `FOUNDRY_LIMITS`), `src/routes/foundry/**`, the foundry card rule in `src/lib/AppLauncher.svelte`, `supabase/migrations/0173_*.sql`, `src/routes/dev/foundry-admin/**`, `tests/foundry-*`, `tests/db/foundry-*`, the foundry rationale in `tests/home-order-and-accent.test.ts`, `tools/browser-verify/routes/foundry-*.mjs`, the generated counts block in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0015-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, 0173. 0171 taken, 0172 reserved for 0013. Highest on origin/main at issue: 0171
- Status: issued
- Branch: assigned by the harness
- Notes: Mr. Pina answered six standing decisions on 2026-09-02 and this
  bundle builds all of them, plus three reports on the same surface.

  Decisions, with the answer he gave, which is the specification and not a
  starting point:
    01 Foundry disabled during class: a PER-SECTION toggle, checked on the
       SERVER. Not global, not scheduled, and not a client-side hide.
    03 Launcher card colours: change the card, and rewrite the rationale in
       the test that pins it, in one commit.
    05 Publish requires a description: narrow the SCHEMA and give the client
       a message. Not client-only validation.
    06 Trusted publishers: an admin marks a student trusted; their publish
       goes live immediately and the review queue shows it as ALREADY LIVE,
       reviewed after the fact rather than before.
    07 Owner-only telemetry does NOT become public. Build the owner
       dashboard instead.
  Two answers were NOT usable and are excluded: decision 02 names an RLS
  policy that exists nowhere in the migrations, and decision 04's default is
  refused in `FoundryGallery.svelte`'s own header in words. Both go back to
  Mr. Pina.

  Reports on the same surface: no obvious way to manage, edit or delete a
  game from the gallery as admin; an open game scrolls off screen while the
  list scrolls under it; and no way to test whether a game works before
  publishing.

  Deliberately excluded: `FOUNDRY_LIMITS`, which 0014 just set; the gallery
  default sort, which is decision 04; and multiplayer or save-progress,
  which are their own scoping conversation.

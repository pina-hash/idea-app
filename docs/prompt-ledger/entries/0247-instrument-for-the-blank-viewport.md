# 0247 The instrument that catches a blank viewport

- Issued: 2026-09-14
- By: router chat
- Owns: `tools/browser-verify/**` (checks, helpers and the IdeaCAD route specs
  only), `docs/prompt-ledger/entries/0247-*`, and its own `docs/history/` entry.
- Migration permitted: no. **Claims: none.**
- Status: pushed
- Branch: `claude/relaxed-meitner-2h6vmx`, branched from `main`.
- Notes: three lanes shipped visual work into an IdeaCAD 3D viewport none of
  them could see, and every content check -- present, visible, 44px, contrast --
  passed over an empty canvas. Adds three measuring checks that ask whether
  anything was actually DRAWN (canvas content, layout sanity, two things
  distinguishable), each with its negative controls proved, and reports what
  they find on the IdeaCAD routes without fixing any of it. Touches no `src/`,
  no `supabase/`, no migration and no other subsystem's specs.

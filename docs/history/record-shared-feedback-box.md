---
title: "Shared feedback box"
date: 2026-07-20
branches: []
migrations: ["0052"]
subsystems: ["FRC / FSP / feedback"]
record_order: 67
---

`src/lib/feedback/` is the app-AGNOSTIC in-app feedback / suggestion box.
GREENLINE is the first consumer and VANGUARD is the intended second; nothing
in the component or the seam knows what a race, a lap, or a wave is.

- **`FeedbackBox.svelte`** is presentation only (the Minimap / Garage
  convention: state in via props, intent out via callbacks) and never touches
  Supabase itself, so a dev harness mounts it against an in-memory store
  unchanged. Props: `app` (which app), `context` (which screen), `meta`
  (free-form context attached to the row), `submit` (does the write, resolves
  `{ error }`), `onClose`, plus optional `title` / `note`. It owns the form,
  the four kinds (bug / idea / praise / other — kept short on purpose, more
  categories means more time choosing and less writing), validation, the
  in-flight state, the thank-you, and a "send another" reset. A FAILED submit
  keeps the player's text rather than discarding it.
- **Theming is via `--fb-*` custom properties** declared on the scrim with
  neutral dark defaults, so a host overrides them from outside
  (`.glb .fb-scrim { --fb-accent: ... }`) instead of the component growing a
  per-app branch. No game-specific copy, color, or font is baked in.
- **Escape closes it and keydowns are swallowed** while open, matching
  GreenlineSettings; Ctrl/Cmd+Enter sends (a bare Enter stays a newline, since
  this is prose). A host that runs a keyboard-driven game underneath must ALSO
  block its own key handling while the box is open — see `inputBlocked` in the
  GREENLINE section for why `stopPropagation` cannot do this on its own.
- **`feedback.ts`** is the data seam (`submitFeedback`, `feedbackIssue`,
  `FEEDBACK_KINDS`, `FEEDBACK_MAX_LEN`). A feedback row is a comment about
  YOURSELF, so there is nothing to forge and NO RPC is needed: the insert is a
  direct RLS-scoped write whose WITH CHECK pins `user_id` to `auth.uid()` (the
  fsp_item_opens doctrine, not the gauntlet_submit one).
- **Table `app_feedback` (`0053`, apply manually after 0052):** ONE table with
  an `app` discriminator rather than one per game, so "what are players telling
  us this week" is one query instead of a union that grows with every surface.
  APPEND-ONLY — no update or delete grant at all; correcting yourself means
  sending a second note, which is also a truer record than a silently edited
  one. Reads are own-rows plus `is_teacher()` for everything. `meta` is
  client-reported context (build, track, screen): a debugging aid, never
  authoritative. No admin UI ships with it yet; the table is the deliverable.
- **VANGUARD is deliberately NOT wired yet** (its own task): it would mount the
  same component with `app="vanguard"`, its own `--fb-*` palette, and a submit
  that calls the same `submitFeedback`.


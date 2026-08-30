---
title: "FSP live Q&A"
date: 2026-07-11
branches: []
migrations: ["0043", "0044"]
subsystems: ["FRC / FSP / feedback"]
record_order: 76
---

`/fsp/ask` + `/fsp/live` are the FSP live audience Q&A: students submit
questions from their phones and Mr. Pina runs the feed on a projected display.

**Presentation workflow (current):** Mr. Pina runs the slide deck itself
directly from **Claude Design** (an external tool, not this portal) during a
live session, then switches to `/fsp/live` — opened as a **separate window** —
for the Q&A segment. `/fsp/live` and the deck are no longer wired together: the
former slide-13 embed (Phase 2's postMessage bridge into the deck) is gone (see
"FSP Day 1 deck" below, now an archive viewer). Always open `/fsp/live` in its
own window/tab when running an FSP session; it is a standalone display, not an
overlay.

Unlike `/fsp-tech-selection` (neutral navy/gold, Apps Script), this pair is
**Supabase-backed** and uses the **IDEA green `#00FF41` on near-black
`#0a0a0a`** aesthetic (Rajdhani + Share Tech Mono), scoped under its own opaque
root so the shell `.bg-fx` never shows through.

- **Data model (`0043_fsp_qa.sql` + `0044_fsp_qa_anon.sql`, apply manually, in
  order):**
  - `fsp_questions` (`id`, `question`, `session_id`, `created_at`, `answered`,
    `is_anonymous`, `submitter_name`). Signed-in users READ all rows (RLS
    `using (true)`); there is **no direct write grant**. The ONLY insert path is
    the SECURITY DEFINER RPC `submit_fsp_question(p_question, p_session_id,
    p_is_anonymous default false, p_submitter_name default null)` (returns the
    new id, stamps `created_at`/`answered=false` server-side), granted to
    `authenticated`, so a client can never forge those or target another
    session by raw insert. `p_is_anonymous = true` forces `submitter_name` to
    `null` server-side regardless of what the client passes; `false` stores
    `p_submitter_name` as given. Every pre-0044 row backfills to
    `is_anonymous = false` / `submitter_name = null` (unattributed, matching
    what those rows meant before the column existed).
  - `fsp_config` (`key` PK, `value`), seeded `active_session = 'Day1-A'`. All
    authenticated users read; only `@boscotech.edu` (staff) may UPDATE (RLS on
    the JWT email domain). This one row is the session `/fsp/ask` tags every
    submission with (unchanged submission flow). **Six fixed session slots**
    still exist as values, one per FSP day/session: `Day1-A`, `Day1-B`,
    `Day2-A`, `Day2-B`, `Day3-A`, `Day3-B` (two sessions per day); the column
    stays free-form text. `/fsp/live` no longer exposes these as a picker or
    groups the feed by them (see `/fsp/live` below) — they now exist purely as
    the tag every question still carries and the sweep target for Clear Feed.
  - Soft clear is the staff-only SECURITY DEFINER RPC
    `clear_fsp_session(p_session_id)` (gated to `@boscotech.edu`): sets
    `answered = true` on that session's unanswered rows (never deletes) and
    returns the count. Keeps `fsp_questions` with no client update grant.
  - `fsp_questions` is added to the `supabase_realtime` publication so the live
    feed gets INSERT (new question) and UPDATE (soft clear) events; RLS still
    applies to the stream.
- **`/fsp/ask` (any Bosco Tech account, `@boscotech.net` or `@boscotech.edu`):**
  mobile-first. In-page Google sign-in gate (no hooks redirect, like
  `/fsp-tech-selection`, since it is reached cold from a QR code) + client
  domain check against both domains (no `hd` OAuth hint, since it must not pin
  the picker to a single domain); a teacher signing in from their own account
  can submit a question too. A single textarea, a
  lightweight **"Submit anonymously" toggle** below it (default unchecked, a
  plain checkbox line, not a callout box), and submit. Unchecked shows a
  read-only "Asking as `<name>`" line (`user_metadata.full_name` from the auth
  session, falling back to `email`) and that name is sent as
  `p_submitter_name`; checked hides the name line and sends
  `p_is_anonymous = true` (with `p_submitter_name` omitted — the RPC would null
  it anyway). Submit reads the current `active_session` fresh from `fsp_config`
  then calls `submit_fsp_question`. On success the form is replaced (no reload)
  by "Your question was submitted. You earned 1 IDEA Coin." with an "Ask
  another question" button that restores the form. (Coins are still
  display-only; no coin economy exists in this repo, see the scope
  guardrails.)
- **`/fsp/live` (staff, `@boscotech.edu`):** the standalone Q&A display,
  redesigned for projection (a widescreen panel + feed layout, panel stacking
  above the feed on narrow viewports). In-page sign-in + staff domain gate, a
  full-screen toggle, and:
  - **ONE chronological feed, no session grouping.** The earlier six-preset
    session picker (`Day1-A` through `Day3-B`) is gone from the display: every
    unanswered question renders together, newest-first, regardless of which
    session it was submitted under. This is display-only — the data model and
    submission flow are unchanged (`/fsp/ask` still tags every question with
    `fsp_config.active_session`; see the `fsp_config` bullet above). **Clear
    Feed** still uses the only RPC that exists, the per-session
    `clear_fsp_session(session_id)` (no "clear all" RPC was added, to avoid a
    migration), so it loops over the six known session ids and calls the RPC
    for each, soft-clearing the whole (now ungrouped) feed in one click.
  - **QR code:** a static `api.qrserver.com` generated PNG (dark green-on-black
    to match the palette) linking to `https://ideabosco.com/fsp/ask`, labelled
    "ideabosco.com/fsp/ask" underneath, docked at the bottom of the panel so
    students can scan it straight off the projected display.
  - **Feed:** each card shows the question, the submitter (or "Anonymous" when
    `is_anonymous` or a null `submitter_name`), and a relative timestamp;
    newest-at-top, animated in, generous padding sized for reading from across
    a room.
  The **feed itself** (Realtime subscription with no session filter, loading
  every unanswered row newest-first, question cards, soft-clear UPDATE
  removing a card, `prefers-reduced-motion`) is factored into
  `src/lib/fsp/FspLiveFeed.svelte`, still shared with the dead-code
  `FspDeck.svelte` and the dev harnesses; the page keeps only the chrome (auth
  gate, QR, a **Student View** control, count via a bound prop, full-screen
  toggle). The component's `select()` includes `is_anonymous` /
  `submitter_name`, and takes a `variant` (`console` on this page, `slide` for
  the now-unused deck-embed path kept alive only by dead code / harnesses) and
  `sampleQuestions` for the no-Supabase harness path (the earlier `session`
  filter prop was removed along with the grouping).
  - **Student View** (staff-only surface, so no extra gate) opens
    `src/lib/fsp/FspStudentPreview.svelte`: a modal that shows `/fsp/ask` inside
    a ~390px mobile phone frame, so the presenter sees exactly what students see
    on their phones. X or Escape closes it (Escape only when not in native
    fullscreen). The SAME component is mounted on `/fsp/day1`.
- **Neither `/fsp/ask` nor `/fsp/live` is in `authedPrefixes`** (`hooks.server.ts`):
  auth is handled by the in-page gates, and the real boundary is RLS + the
  RPC/`fsp_config` grants, so anonymous/QR-cold visitors see a friendly sign-in
  rather than a bounce to `/`. (The `/fsp` prefix does not shadow
  `/fsp-tech-selection`, which is a sibling path, not `/fsp/...`.)
- **Dev harness `/dev/fsp-qa`** (404 in production): mounts the REAL `/fsp/ask`
  and `/fsp/live` in side-by-side iframes for the submit-appears-live check. This
  flow uses real auth + Realtime and is deliberately NOT mockable; verifying it
  needs 0043 + 0044 applied and both accounts signed in (same-origin cookies
  flow into the frames).


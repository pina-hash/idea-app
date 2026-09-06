# 0069 Five things instructors asked for, all in the class surfaces
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: the due-date default in `ContentComposer.svelte`, `SongQueue.svelte`, the instructor-tools dropdown, the feedback console's delete path, at most one migration (number taken at commit time), `src/routes/dev/instructor-requests/**`, the named test files, `tools/browser-verify/routes/instructor-requests*.mjs`, the generated regions of its README, `docs/prompt-ledger/entries/0069-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, conditional, number taken at commit time. Highest on origin/main at issue: 0184
- Migration taken: 0186 (`supabase/migrations/0186_song_spotify_and_feedback_spam.sql`). NOT applied: `IDEA_MIGRATION_URL` is not set in the session container, and `tools/apply-migration.mjs` derives its probe from `origin/main`, which a branch-only file gets no probe from. Highest across every ref at commit time was 0185 (on `origin/main`); `origin/integration` carried through 0184, so `origin/main` was merged into the branch to close the gap the contiguity test found.
- Status: pushed
- Branch: `claude/instructor-requests-surfaces-j2dfjc`, started from `origin/integration` at `13d1747`
- Built: items 1, 2, 3 and 5. Item 4 (sorting by date) DECLINED -- six candidate lists, no way to choose; the question is in the history entry.
- Notes: Five items from the 2026-09-05 feedback pull, all instructor
  requests rather than defects, and all in the class surfaces so they travel
  as one bundle:

    1. An assignment's due time should default to 11:59pm rather than
       whatever it defaults to now.
    2. Class music links should be restricted to Spotify.
    3. The feedback console needs a way to delete a false or spam report.
    4. A page needs sorting by date. WHICH page is not stated and the audit
       must establish it or decline the item.
    5. The Edit control and the instructor-tools dropdown are confusable.

  Item 4 is deliberately included WITHOUT a target. A request that cannot be
  located is a request nobody can act on, and reporting that with what you
  checked is a better outcome than guessing at a page and changing it.

  Item 2 is a policy, not a defect: the coin economy's one deliberate
  exception is that approving a song request charges the student and is
  available to any section manager, so this touches a path with money in it.
  Read `0155` before changing anything there.

  Item 3 needs care about what "delete" means. A report deleted outright is
  gone; a report marked spam is auditable. The console already has a
  seen/new filter, so a third state may be the smaller change.

  Deliberately excluded: the composer's draft path, which prompt 0061 holds;
  the Foundry trusted-publisher requests, which are their own subsystem; and
  anything about a student's own view of an assignment.

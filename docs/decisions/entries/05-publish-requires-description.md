# 05 Foundry: publishing requires a description
- Raised: 2026-08-31  By: chat "Managing multiple FRC platform projects"
- Status: closed 2026-09-12 (prompt 0177, `claude/busy-newton-trto6y`).
  ANSWERED **NO**, against the default below and REVERSING work already shipped.
  `0204` removes the requirement from both places it was enforced.
- Decision: **Mr. Pina, 2026-09-12: publishing needs a name, a thumbnail and the
  app. A DESCRIPTION IS OPTIONAL.**

  **This decision was answered AFTER the work it governs had already shipped,
  which is the thing worth recording here.** Ledger 0015 built the requirement on
  2026-09-02 and `0173` applied it, while this entry sat `open` with a blank
  `Decision:` line and a `Default this assistant would pick` that reads exactly
  like the thing that got built. So the default was implemented as though it were
  the answer. Nothing about that was caught by a test, a review or a check,
  because the code was internally consistent and well argued; what would have
  caught it is this line having been read before the build rather than after.

  **Where it was enforced, measured on the file rather than taken from a report**
  (the production database is unreachable from a cloud container, permanently, so
  the file is the only available authority):

  * `0173_foundry_section_gate_description_and_trust.sql` line 283 -- the
    publication TRIGGER, `_foundry_published_version_check`, which is the gate all
    four publish paths meet at.
  * the same file line 498 -- inside `foundry_submit_version`, so a student could
    not even SUBMIT FOR REVIEW without one. This is the half that hurt: the gate
    decision 05 asked about was PUBLISHING, and it had reached the submit.
  * `src/lib/foundry/surface.ts` lines 129-142 -- `foundryPublishBlockers`, the
    client half that named the requirement before refusing.

  **What `0204` did with each.** The trigger goes back to `0130`'s body, which is
  a byte claim rather than a reconstruction: `0173`'s body is `0130`'s plus the
  `v_moved` declaration, its assignment and the raise, and removing those three
  leaves the two files' text identical. The submit function is `0173`'s line for
  line apart from those four lines, so decision 06's trusted-publisher arm rides
  through untouched -- re-signing it from `0130` instead would have silently
  deleted that, and a test asserts it behaviourally as well as textually.
  `foundryPublishBlockers` and `foundryCanSubmit` are DELETED rather than left
  returning an empty list, because a predicate that can only answer one way is a
  dormant second idea of "is this ready" beside the real one.

  **A THUMBNAIL IS NOT A GATE AND WAS NOT MADE ONE.** The answer names one, but
  nothing in the schema requires a cover today. Measured across all 202 migration
  files, `cover_path` is named in exactly two places that could be a gate and
  neither is one: `0130` line 169 is
  `check (cover_path is null or _classroom_deck_path_ok(cover_path))`, which
  constrains the SHAPE of a path and explicitly admits null, and `0136` line 252
  is the delete sweep. There is no `raise`, no `not null` and no publication
  check. **Making one is a NARROWING outside this bundle's grant** -- 0204 does
  three things and nothing else -- and it needs its own bundle with its own
  answer for the apps already published without a cover, counted at apply time
  the way `0173` counted the blank descriptions. It must not come back as a
  client-side check, which is what `0204` just removed: the surfaces were never
  the boundary.
- Default this assistant would pick: A schema narrowing on the existing `description` column with a migration and a client message; a client-only check is bypassed by the next tool that writes rows.
- Why it is blocked on him: Which field is required, and whether an already-published app with no description is grandfathered or unpublished, is a policy call about student work already live.
- What it unblocks: A one-migration Foundry lane with its own answer for the rows already stored.
- Context: `supabase/migrations/0130_*.sql` (`student_apps.description`, nullable, 1 to 4000 characters when present; `foundry_create_app` and the field editor accept it); `src/routes/foundry/submit/+page.svelte` sends `p_description`. `CLAUDE.md`, "A VALIDATION GATE WIDENS IN ITS OWN BUNDLE" governs the narrowing shape.
- Tree check (2026-09-02): the column exists as described and is optional today, so the "existing description column" premise holds.

# 05 Foundry: publishing requires a description
- Raised: 2026-08-31  By: chat "Managing multiple FRC platform projects"
- Status: decided 2026-09-12, AGAINST the requirement. A REVERSAL is now owed; see the Build line.
- Decision: 2026-09-12, Mr. Pina: no. Minimize requirements: name, thumbnail,
  contents. Students are responsible for telling users what they need.
- Against the default: plainly, yes -- and the default had already been BUILT.
  The default below was a schema narrowing on `description`. Prompt 0015 shipped
  exactly that on 2026-09-02 while this entry was still `open` with a blank
  Decision line, so the requirement is in the tree on this assistant's DEFAULT and
  never on his answer. His answer reverses it.
- Build: OPEN, and it is a reversal in three places, measured 2026-09-12. All line
  numbers are in `0173_foundry_section_gate_description_and_trust.sql`.
  (a) **line 283**, the trigger `_foundry_published_version_check`, which raises
  "Write a description before publishing." whenever the publication MOVES. It is
  careful about existing work -- it fires only when the column genuinely changes, so
  an app already published without one keeps serving and stays rollable.
  (b) **line 498**, inside `foundry_submit_version`, which raises "Write a
  description before submitting." So the requirement bites EARLIER than publication:
  a student cannot send a build for review at all without one.
  (c) `src/lib/foundry/surface.ts` lines 129 to 142, `foundryPublishBlockers`, the
  client sentence that names the requirement before the database refuses.
  Undoing (a) and (b) is a NEW migration: 0173 is an applied record and is not
  rewritten.
- Not established: whether 0173 is APPLIED to production, which is the one thing
  the reversal's urgency turns on. `docs/migrations-applied/` holds no record of it,
  a cloud container cannot reach the production database, and no file in this repo
  records applied state. If it is applied, a student cannot SUBMIT a build without a
  description right now, let alone publish one. If it is not, the reversal is a
  source change plus a migration nobody has to hurry. `tools/idea-status.py` prints
  the probe to paste.
- Note: the three things he named are already required or already possible. The
  name is `student_apps.title`, NOT NULL and 1 to 120 characters since 0130. The
  contents are the bundle, which `foundry_submit_version` already refuses with no
  files. The thumbnail is `cover_path`, which is OPTIONAL today. Whether
  "thumbnail" in his sentence makes the cover required is NOT settled here, and it
  is bound up with decision 03 (foundry-launcher-card-colours), where the card IS
  the thumbnail -- a gallery of thumbnails has nothing to draw for an app without
  one. Raise it there rather than reading it into this answer.
- Default this assistant would pick: A schema narrowing on the existing `description` column with a migration and a client message; a client-only check is bypassed by the next tool that writes rows.
- Why it is blocked on him: Which field is required, and whether an already-published app with no description is grandfathered or unpublished, is a policy call about student work already live.
- What it unblocks: A one-migration Foundry lane with its own answer for the rows already stored.
- Context: `supabase/migrations/0130_*.sql` (`student_apps.description`, nullable, 1 to 4000 characters when present; `foundry_create_app` and the field editor accept it); `src/routes/foundry/submit/+page.svelte` sends `p_description`. `CLAUDE.md`, "A VALIDATION GATE WIDENS IN ITS OWN BUNDLE" governs the narrowing shape.
- Tree check (2026-09-02): the column exists as described and is optional today, so the "existing description column" premise holds.

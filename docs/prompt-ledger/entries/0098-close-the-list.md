# 0098 Close the list, and stop the maps editor duplicating rooms
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: the maps editor save path, the eight open feedback items across their own subsystems, the merge of `integration` into `main`, migrations 0190 and 0191 if needed (both read-only), and its own `docs/history/` entry.
- Migration permitted: at most two, 0190 and 0191, READ-ONLY. Claims: 0190, 0191. Highest on origin/main at issue: 0189
- Status: issued
- Branch: assigned by the harness
- Notes: Everything still open, after prompts 0039, 0061, 0069, 0070, 0072,
  0090, 0091, 0092, 0093 and 0095 closed the rest.
  
  ZERO, AND IT IS LIVE. Mr. Pina added one room to the IDEA building on
  2026-09-06 and got about thirty, all named "IDEA Classroom" at
  466.25 x 477.75, with the indicator still reading "Saving...". They are
  draft rows in the live map. `NodeDetail.svelte:724` reads
  `aria-disabled={problems.length > 0}`, and **`aria-disabled` disables
  nothing**: the button stays clickable, `doSave` fires on every press, and
  `node === null` is still true because the create has not returned. That is
  a candidate, not a conclusion; prompt 0061 found a second mechanism in
  `ContentComposer` where `SaveState`'s durability net fires on
  `visibilitychange` and `pagehide` whenever the machine is `dirty`, and
  `dirty` includes `failed`. Reproduce before fixing.
  
  A. THE CI MERGE. `integration` is exactly `main` plus prompt 0094's four
     commits, which fix CI's shallow checkout. `main` is red for that cause
     and only that cause. Prompt 0095 correctly declined it as out of scope.
  
  B. "sub 30 second gauntlet runs do not show up on the leaderboard"
  C. "if a student is a trusted publisher, and they have items pending
     publishing, those items should auto publish. also, a publish all button"
  D. "would be nice to be able to email an entire class, or start a draft
     that is addressed to an entire class"
  E. "roster export"
  F. "there should be a second save and publish button at the top of a post
     for long posts"
  G. "class randomizer for teams, presentation order, etc"
  H. "the hide/show other items button doesnt seem to do anything useful"
  I. "would be nice to have some kind of highlighted animation for
     assignments that are due today"
  J. `ItemDetail.svelte`'s duplicate-date refusal still reads "Pick a
     different date, or edit the existing one instead" without saying where.
     Prompt 0081 wrote the patch; prompt 0086 corrected its destination to
     the Check-ins tab, since duplicate DRAFTS and a duplicate CHECK-IN are
     different objects.
  
  THREE DECISIONS ANSWERED BY MR. PINA ON 2026-09-06, recorded here so no
  later bundle reopens them:
    - The GAUNTLET leaderboard showing student avatars: LEAVE IT. Nobody
      uploads a real photograph, so the exposure prompt 0033 measured is of
      a default mark rather than a face. No bundle acts on this.
    - Supabase Pro: NO. The Free plan's fixed 50 MB ceiling stands, and
      prompt 0072's 45 MiB Foundry limit is the permanent answer.
    - The browser-verify measured region: regenerate WARM. Cold writes twelve
      findings belonging to other routes into a shared region; warm writes
      the two real ones. Decided by the router chat at his direction.
  
  Deliberately excluded: the FRC quiz distractors, which are Mr. Pina's
  writing; orphaned bucket uploads; and deleting any row anywhere.

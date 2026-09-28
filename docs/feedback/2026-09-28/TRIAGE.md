# Feedback round: triage against the tree

- Source: the admin feedback export idea-feedback-2026-09-28T18-30-50.zip, 18 reports, exported from a4f769c. **The archive itself is NOT committed**: it
  carries student names and addresses and this repository is public. Reporters are named by
  role only (the owner excepted); the report `id` is the join key back to `app_feedback`.
- Every "evidence" line below is a CLAIM with a file:line, made by a read-only investigator.
  A build session verifies it before relying on it.

## The reports, verbatim

```
R01 [bug] app=classroom path=/classroom/6eb6cd94-01d9-4e8a-83ac-318e0e0e1de0 by=Mr. Pina (owner) filed=2026-09-25T04:55 build=abf070c viewport=1278x1304 id=33d143c0-a17e-4917-b3f5-219a2c3899ad section=6eb6cd94-01d9-4e8a-83ac-318e0e0e1de0
  > I want to be able to drag and drop ported HTML assignments

R02 [bug] app=classroom path=/classroom/feedback by=Mr. Pina (owner) filed=2026-09-25T04:55 build=abf070c viewport=1278x1304 id=92398c89-f443-4256-b091-4beec2256491
  > I want an undo button for clicking scene or spam whatever just a short-term undo button for actions on this feedback page

R03 [bug] app=classroom path=/classroom/feedback by=Mr. Pina (owner) filed=2026-09-25T04:57 build=abf070c viewport=1278x1304 id=26a682cd-e4af-408a-807f-98ce2b4c633c
  > it seems like the feedback page is stored within the classroom page this doesn't make much sense to me and I think that the feedback page should be a forward slash after idea bosco.com that I'm not inside the classroom cuz the feedback page applies to the entire website so it just doesn't make sense another little issue is the The Voice detection at least for reporting a problem maybe elsewhere as well does nothing to separate sentences so as you can see this report is just one continuous paragraph with no period and that might be confusing to you

R04 [idea] app=classroom path=/classroom/feedback by=Mr. Pina (owner) filed=2026-09-25T04:59 build=abf070c viewport=1278x1304 id=96aa5b66-821a-45f5-ae22-cf18c867dc1e
  > as a user of a website that has been heavily Vibe coded I would like to see more help as to how what things do on the website especially with the the new classroom system there's a lot of buttons and options and stuff that I do not quite understand it would be nice if I and anyone using the website at any level when you have your mouse over an option or something like in the settings menu for example or on screen it should give you a little nice pop up what exactly that thing is and what it does and any other relevant information to using that feature please keep these pop-ups practical and genuinely useful

R05 [bug] app=portal path=/maps by=Mr. Pina (owner) filed=2026-09-25T05:00 build=abf070c viewport=1278x1304 id=f7be30e0-936b-42bc-b22f-c9f3176143e9
  > clicking on a building on the map should expand its contents just like clicking on a building on the left screen

R06 [bug] app=classroom path=/classroom/6eb6cd94-01d9-4e8a-83ac-318e0e0e1de0/people by=Mr. Pina (owner) filed=2026-09-25T05:03 build=abf070c viewport=2560x1305 id=7c0923f7-5ece-47a6-bd0f-a67e0803920c section=6eb6cd94-01d9-4e8a-83ac-318e0e0e1de0
  > it's odd how the class settings are in the people tab doesn't make sense to me it's not the place I would look it's confusing multiple times already

R07 [idea] app=classroom path=/classroom by=Mr. Pina (owner) filed=2026-09-25T05:04 build=abf070c viewport=2560x1305 id=60838d52-6848-4f9a-a0b7-3beec15f567d
  > I need more visual options for differentiated between different classes perhaps some color scheme options like for example some ones I'll tell my head is an FRC color scheme for more FRC team design standards linked and idea or a couple Shades or different types of idea themes for the the class Banner at least doesn't have to be for the whole classroom before the class Banner at least some very nice looking unique themes for every different classes taught so like if it's multiple grade levels are taking the same class and they would be the same theme with a single differentiating color or something to separate them if that makes sense please clarify the finer details
  > 
  > https://frcteam5669.com/outreach/branding

R08 [idea] app=portal path=/ by=Mr. Pina (owner) filed=2026-09-25T05:10 build=abf070c viewport=629x1238 id=7abb9593-005a-46af-ba9d-94af07bdc0db
  > Dictate is terrible and dysfunctional on mobile

R09 [bug] app=portal path=/ by=Mr. Pina (owner) filed=2026-09-25T05:12 build=abf070c viewport=1238x580 id=b995bbb4-1c7b-4863-bd09-b3e36cfc6c52
  > Matrix theme not animated on mobile

R10 [bug] app=portal path=/ by=Mr. Pina (owner) filed=2026-09-25T05:14 build=abf070c viewport=1238x580 id=583c212c-ec0d-45de-8e24-37d8c8626a66
  > Lines of code should do a little count up animation when the page is refreshed. Each logged update should come along with a different count automatically. Imp4ove the visual design of the loc pop-up

R11 [bug] app=classroom path=/classroom/6eb6cd94-01d9-4e8a-83ac-318e0e0e1de0 by=Mr. Pina (owner) filed=2026-09-27T20:35 build=6a01ea3 viewport=1293x1304 id=c40b79f9-c665-424c-881b-e57856f21264 section=6eb6cd94-01d9-4e8a-83ac-318e0e0e1de0
  > when I'm editing an assignment I should be able to drag and drop into multiple places in the assignment for example if I want to upload an HTML spec I should be able to drag and drop it into the HTML spec upload area

R12 [bug] app=classroom path=/classroom by=Mr. Pina (owner) filed=2026-09-27T20:39 build=6a01ea3 viewport=1293x1304 id=e8046054-b4cf-4cfd-8dce-eea17732a3be
  screenshot: feedback-2026-09-28T18-30-50/reports/e8046054-b4cf-4cfd-8dce-eea17732a3be/screenshot.png
  > it is difficult to differentiate between archived classes and active classes on the my classes page I think that archives classes should have their own section here also as I archive more and more classes I imagine that the top left quick class election buttons will be clogged up pretty fast there has to be some kind of functionality like one of these buttons can probably be archived classes and it was a drop down to see all the archived classes as opposed to just having the archived classes as quick buttons that's a compromise I'm going to make if it uses the space more efficiently I'll always have just a few active classes and as I as time goes on like just by next semester all these active classes will be archived except for the FRC class

R13 [bug] app=classroom path=/classroom by=Mr. Pina (owner) filed=2026-09-27T20:40 build=6a01ea3 viewport=1293x1304 id=1aa33291-1e9b-464e-a537-3f95ccc7115a
  screenshot: feedback-2026-09-28T18-30-50/reports/1aa33291-1e9b-464e-a537-3f95ccc7115a/screenshot.png
  > the idea logo that goes along with the light theme does not sit right with me the colors are off and it looks weird make sure that whatever you change it to is like aesthetically valid currently it's aesthetically pretty weird and I don't like it

R14 [bug] app=classroom path=/classroom by=Mr. Pina (owner) filed=2026-09-27T20:41 build=6a01ea3 viewport=1293x1304 id=62e4fe62-4898-42bf-a401-173b2a85dc74
  screenshot: feedback-2026-09-28T18-30-50/reports/62e4fe62-4898-42bf-a401-173b2a85dc74/screenshot.png
  > this kind of brownish color you have for the my classes on the my classes page is ugly for the light theme

R15 [bug] app=classroom path=/classroom/6eb6cd94-01d9-4e8a-83ac-318e0e0e1de0/item/e4c5d7ad-940b-4355-8bba-7cc9e0c9128a by=Mr. Pina (owner) filed=2026-09-27T21:01 build=6a01ea3 viewport=1278x1304 id=244e94cf-f9df-4eff-893b-1ce6ba47c183 section=6eb6cd94-01d9-4e8a-83ac-318e0e0e1de0
  screenshot: feedback-2026-09-28T18-30-50/reports/244e94cf-f9df-4eff-893b-1ce6ba47c183/screenshot.png
  > when I am clicking on edit clicking on units to edit the units in a in a class I want the clothes units button to be highlighted or something so that I know it's the button I need to press to get back since it's initially I was very confused and this was not clear to me to edit the units and then not knowing where to click to go back to the before it's just a small little thing it needs a little refinement and if this kind of thing happens Elsewhere on the website also fix that

R16 [bug] app=classroom path=/classroom/6eb6cd94-01d9-4e8a-83ac-318e0e0e1de0/item/76e7413b-2d3c-400c-82e6-69cae838e4bf/grade by=Mr. Pina (owner) filed=2026-09-28T00:36 build=03f2c69 viewport=1278x1304 id=e0397f7b-4355-4e0f-a00e-9127bf86e20e section=6eb6cd94-01d9-4e8a-83ac-318e0e0e1de0
  screenshot: feedback-2026-09-28T18-30-50/reports/e0397f7b-4355-4e0f-a00e-9127bf86e20e/screenshot.png
  > on the grading page there's this tiny little scroll bar to go through the different export options and it was such a pain trying to use this this has to be fixed immediately and it should be as convenient as possible to access all export options

R17 [bug] app=classroom path=/classroom/6eb6cd94-01d9-4e8a-83ac-318e0e0e1de0/item/76e7413b-2d3c-400c-82e6-69cae838e4bf/grade by=Mr. Pina (owner) filed=2026-09-28T00:37 build=03f2c69 viewport=1278x1304 id=91711213-a131-433a-bbe1-5526a7743544 section=6eb6cd94-01d9-4e8a-83ac-318e0e0e1de0
  screenshot: feedback-2026-09-28T18-30-50/reports/91711213-a131-433a-bbe1-5526a7743544/screenshot.png
  > on the grading page what is the point of selecting things I'm really not sure I click check boxes and I don't really see any options to do anything with those checks what's the point of all these buttons here they're taking up space there's a paragraph above it which I don't I don't even know what that's for a lot of interesting things going on here the grading page UI in general needs a lot of work

R18 [bug] app=classroom path=/classroom/6eb6cd94-01d9-4e8a-83ac-318e0e0e1de0/people by=Mr. Pina (owner) filed=2026-09-28T18:28 build=a4f769c viewport=1920x953 id=481725b4-ff28-4155-95d3-73b0b61c52d2 section=6eb6cd94-01d9-4e8a-83ac-318e0e0e1de0
  > i need functionality to edit teams in idea classroom after they've been created and posted. drag and drop would be nice.
```

## Findings by cluster

### Cluster: Grading console (R16, R17)

#### R16 -- conflicts-with-rule (size M, P1)
**Ask.** The export options on the grading page sit in a tiny scrolling region above the names; every export should be easy to reach.

**Evidence.** The scrolling region is `.roster-tools` (GradingConsole.svelte:1866-2131), capped at `max-height: 45%; overflow-y: auto` above 1024px (:4154-4160). It holds the Roster head and Export CSV (:1867-1872), the Closing Disclosure (:1917-1993), the Export graded work Disclosure with the class picker, JSON and spreadsheet buttons, the identity toggle and its note (:2012-2102), BulkFileDownload with its long paragraph (BulkFileDownload.svelte:211-264), and three notices (:2103-2130). The screenshot is that Disclosure opened and scrolled inside the 45% cap.

**Root cause / approach.** The 45% ceiling is correct for what it was sized for (two closed panels); the exports outgrew it. Move every export out of the roster card into one Export control in the page header (`.console-hero`, :1815-1826), built on an existing Disclosure or popover rather than a new one. The roster region keeps the close panel and notices, the 45% cap stays, and the names get the room back. Update the CLAUDE.md paragraph on the two closed-by-default panels in the same change.

**Migration.** none

**Files.** `src/lib/classroom/GradingConsole.svelte`, `src/lib/classroom/BulkFileDownload.svelte`, `tools/browser-verify/routes/grading-incomplete-state-exports.mjs`, `tools/browser-verify/routes/html-assignment-grading-state-export.mjs`, `tests/dom/presence-console-mount.test.ts`

#### R17 -- bug-confirmed (size L, P1)
**Ask.** The tick boxes and Select buttons on the grading roster seem to do nothing, the paragraph above them is unclear, and the grading page needs a broader redesign.

**Evidence.** Selection is batch grading: per-row checkboxes (GradingConsole.svelte:2146-2162), presets from grading-bulk.ts:593-599 rendered at :2337-2350. The ONLY controls that act on the ticks are the batch bar (:3017-3184, Save drafts for N / Return to N), which renders only inside `{#if selected}` (:2437) and `{#if rubric?.length}` (:2661), below the whole rubric in the scrolling `.work-col`. So with no student open nothing responds to a tick, with one open the bar is off screen, and with no rubric the boxes can never act. The paragraph is `presenceCoverageNote()` (presence/state.ts:217-223, rendered :2310), already logged as friction (docs/classroom/overhaul-0297/FRICTION.md:115).

**Root cause / approach.** Narrow fix now: a sticky selection strip at the top of the roster whenever anything is ticked (N selected, Save drafts, Return, Clear), and no checkboxes when the item has no rubric. The coverage sentence is required by CLAUDE.md but its placement is not: fold it behind an InfoTip beside the presence figures. The wider redesign waits on a grading design brief, since docs/classroom/VISION.md has no grading section.

**Migration.** none

**Decision owed.** Narrow fix now and a grading design brief after, or a full redesign brief before anything ships?

**Files.** `src/lib/classroom/GradingConsole.svelte`, `src/lib/classroom/grading-bulk.ts`, `src/lib/classroom/presence/state.ts`, `docs/classroom/VISION.md`

**Owns (if built as a lane).** `src/lib/classroom/GradingConsole.svelte`, `src/lib/classroom/BulkFileDownload.svelte`, `src/lib/classroom/grading-bulk.ts`, `src/routes/dev/grading-*`, `tools/browser-verify/routes/grading-*`

**Overlaps.** The Return dock rule in CLAUDE.md (bounded by `.grade-main` because the batch panel is further down) changes if the batch controls move to the roster.

**Notes.** Geometry claims here are verify:browser's only; tests/dom reads every box as zero.

### Cluster: Classroom organization and chrome (R06, R12, R14, R15)

#### R06 -- buildable-feature (size M, P2)
**Ask.** Class settings (edit details, archive, delete) live at the bottom of the People tab, which is not where anyone looks.

**Evidence.** The Class settings card is PeoplePanel.svelte:1596-1680 with handlers at :143-190. The header Settings button (ClassroomShell.svelte:560-570) opens ClassroomSettings.svelte, which holds per-user display preferences only (:1-15). Tabs are class, live, notebook, people, grades (nav.ts:196-205); adding one is the six edits nav.ts:191-194 lists. The RPCs exist (0083 `classroom_set_section_active`).

**Root cause / approach.** Default: a manager-only Settings tab on the class, after Grades, holding the class details, archive and delete; People keeps the roster and teams. No new RPC.

**Migration.** none

**Files.** `src/lib/classroom/nav.ts`, `src/lib/classroom/PeoplePanel.svelte`, `src/routes/classroom/[sectionId]/`

#### R12 -- bug-confirmed (size M, P1)
**Ask.** Archived classes look like active ones on My classes, and the header's quick class buttons will fill with archived classes; archived ones should go in their own section and one dropdown.

**Evidence.** The /classroom page load does not select the section's `active` column (src/routes/classroom/+page.server.ts:43), so MyClasses.svelte:113-150 renders one flat grid and cannot mark an archived class. The layout load does select it (+layout.server.ts:35); the strip draws every class, archived ones with a dashed border and a label (ClassroomShell.svelte:408-418, :911). `sortSections` ignores `active` (classroom.ts:946-953).

**Root cause / approach.** Select `active` on the page load; My classes renders active classes first and an Archived section below (closed by default through Disclosure). The strip keeps active classes and gains one Archived key, a real button with aria-expanded, opening a list of archived classes.

**Migration.** none

**Files.** `src/routes/classroom/+page.server.ts`, `src/lib/classroom/MyClasses.svelte`, `src/lib/classroom/ClassroomShell.svelte`, `src/lib/classroom/classroom.ts`

#### R14 -- bug-confirmed (size S, P1)
**Ask.** The brownish ink on My classes under Space White is ugly.

**Evidence.** MyClasses.svelte:259 sets `.class-card { --acc: var(--gold) }`, used by the class icon (:287), the code (:306) and Open (:387); `.updates-all` (:197) and `.note a` (:240) read `--gold` directly. On Space White `--gold` is #715d22 (space-white.css:121). Decision 40 item 1 moved hover to `--hover-ink` and took gold off the launcher on Space White; these inks were never swept.

**Root cause / approach.** Point these at `--hover-ink` (green ink on Space White, brass on the dark themes), the role decision 40 created; sweep the classroom for other `--gold` text on Space White in the same pass.

**Migration.** none

**Files.** `src/lib/classroom/MyClasses.svelte`, `src/lib/design-system/themes/space-white.css`

#### R15 -- bug-confirmed (size S, P1)
**Ask.** When editing units, the Close units button is not highlighted, so it is unclear how to get back; fix the same thing elsewhere.

**Evidence.** The Units toggle carries only `aria-expanded` (ClassView.svelte:1900-1910), and plate.css lights only its seven state spellings (plate.css:698-700, :795), not aria-expanded. Same gap: New post / Close (ClassView.svelte:1894), Edit post / Close editor (ItemDetail.svelte:1476), UnitManager's Edit units and Rename (UnitManager.svelte:191, :287), People's email, picker and saved-teams tools (PeoplePanel.svelte:1060, :1070, :1081), and People's Edit details / Close, which carries no state at all (:1599).

**Root cause / approach.** Add `class:on` beside `aria-expanded` on each open-state toggle, which is one of the seven spellings CLAUDE.md names; plate.css does not change.

**Migration.** none

**Files.** `src/lib/classroom/ClassView.svelte`, `src/lib/classroom/ItemDetail.svelte`, `src/lib/classroom/UnitManager.svelte`, `src/lib/classroom/PeoplePanel.svelte`

**Owns (if built as a lane).** `src/lib/classroom/MyClasses.svelte`, `src/lib/classroom/ClassroomShell.svelte`, `src/lib/classroom/ClassView.svelte`, `src/lib/classroom/UnitManager.svelte`, `src/lib/classroom/PeoplePanel.svelte`, `src/lib/classroom/nav.ts`, `src/routes/classroom/+page.server.ts`

**Overlaps.** PeoplePanel.svelte is shared with R18 (teams) and R06 (settings move).

### Cluster: Composer drag and drop (R01, R11)

#### R01 -- already-shipped (size S, P2)
**Ask.** Drag and drop a ported HTML assignment.

**Evidence.** Inside the composer's create form this works: `composerDropRoute` sends .html to the ported box (composer-drop.ts:59-64, ContentComposer.svelte:1099-1119, drop target :2888-2897), shown to admins (`canStageHtml`, :578-583). What does not exist is dropping onto the class page with no composer open: neither the section layout nor ClassView handles a drop.

**Root cause / approach.** Buildable half: a drop on the class page (for a manager) opens New post with the dropped files handed in, routed by the same `composerDropRoute`. Needs an initial-files prop on ContentComposer.

**Migration.** none

**Files.** `src/routes/classroom/[sectionId]/+layout.svelte`, `src/lib/classroom/ClassView.svelte`, `src/lib/classroom/ContentComposer.svelte`, `src/lib/classroom/composer-drop.ts`

#### R11 -- bug-confirmed (size M, P2)
**Ask.** While editing an assignment, dropping a file should land in the matching box, for example an HTML spec into its upload area.

**Evidence.** The spec route is create-only (`canStageSpec` requires `mode === 'create'`, ContentComposer.svelte:537-541), and the HTML box shows on edit only when the item already has a ported document (`canReplaceHtml`, :571-577). So on the edit form a .json or .html drop falls through to Files, which students can see. The whole form's drop is also disabled when attachments are off (`composerDropZone disabled: !attachmentsEnabled || busy`, :2572), which switches off spec and HTML routing with it. The edit spec importer is a separate drop target (ItemDetail.svelte:1616-1624, SpecImporter.svelte:738).

**Root cause / approach.** On edit, route .json to the item's spec importer and .html to the replace box (offering it when the item can take one), never silently to student-visible Files; decouple the drop zone from `attachmentsEnabled`.

**Migration.** none

**Files.** `src/lib/classroom/ContentComposer.svelte`, `src/lib/classroom/composer-drop.ts`, `src/lib/classroom/ItemDetail.svelte`, `src/lib/classroom/SpecImporter.svelte`

**Owns (if built as a lane).** `src/lib/classroom/ContentComposer.svelte`, `src/lib/classroom/composer-drop.ts`, `src/lib/classroom/SpecImporter.svelte`

**Notes.** CLAUDE.md: a dropped file goes to the box whose own accept rule matches it, and FileUploadPanel stays unfiltered.

### Cluster: Teams after posting (R18)

#### R18 -- needs-migration (size M, P2)
**Ask.** Edit teams after they are saved and posted, ideally by drag and drop.

**Evidence.** 0223 has save (insert-only, 0223:320-440), post, unpost, archive, style and board RPCs (:450, :493, :529, :609, :743); none moves a member or renames a draw. A manager can already rename a team through `classroom_set_team_style` (:609) but nothing in the UI calls it (PeoplePanel.svelte:1407 is a hint only). Membership's key is `(team_set_id, student_email)`, so a move is one UPDATE of `team_id` in a new definer RPC. `sort-drag.ts` already does pointer and keyboard drags.

**Root cause / approach.** New additive migration: `classroom_move_team_member` (manager-gated, same composite keys) plus a stamp saying the draw was edited by hand. People gets drag between team cards with a Move-to button on every member as the non-drag path, and wires the existing team rename.

**Migration.** yes: one additive migration, number reserved in the queue

**Decision owed.** A hand-edited draw no longer matches its stored seed. Mark the draw as edited (keeping the seed and saying so on screen and in the CSV), or save every edit as a new draw?

**Files.** `supabase/migrations/`, `src/lib/classroom/teams.ts`, `src/lib/classroom/PeoplePanel.svelte`, `src/lib/classroom/class-teams.ts`, `src/lib/classroom/sort-drag.ts`

**Owns (if built as a lane).** `supabase/migrations/<reserved>`, `src/lib/classroom/teams.ts`, `src/lib/classroom/class-teams.ts`, `tests/db/classroom-teams*`

**Overlaps.** PeoplePanel.svelte with R06 and R15.

**Notes.** CLAUDE.md: the seed is stored and exported because it is what makes a draw checkable.

### Cluster: Feedback console and dictation (R02, R03, R08)

#### R02 -- buildable-feature (size S, P2)
**Ask.** A short-term Undo after marking a report Seen or Spam.

**Evidence.** The status write already reverses (`app_feedback_set_status`, 0188:343; 0188:95-98 says reverting is the same call). The console opens on the new tab (FeedbackConsole.svelte:219) and filters on the optimistic status (:237, console.ts:332), so a marked row vanishes at once. `move()` (:277-288) and `bulkMove()` (:339-376) never keep the previous status.

**Root cause / approach.** Keep `{id, prev}` for the last single or bulk move and show Undo for about 10 seconds beside the bulk note (:304), calling the same RPC. An undo overwrites reviewed_at and reviewed_by with now and the admin; say so in the build notes.

**Migration.** none

**Files.** `src/lib/classroom/FeedbackConsole.svelte`, `src/lib/feedback/console.ts`

#### R03 -- needs-decision (size M, P2)
**Ask.** The feedback console should not live under /classroom because it covers the whole site; and dictated reports arrive as one unpunctuated paragraph.

**Evidence.** Route: src/routes/classroom/feedback/+page.server.ts (admin-only 404 at :19-20), linked from AdminConsole.svelte:297 and dashboard/+page.svelte:431. `feedback` is not in `RESERVED_SLUGS` (short-links.ts:52-88), so a top-level /feedback needs the short-link reservation migration CLAUDE.md requires; /admin/feedback does not (admin is reserved). Punctuation: `appendDictation` (feedback/dictation.ts:93) joins chunks with one space and never adds a period or a capital; `onresult` (:194) passes the raw transcript. It is shared with grading dictation (grading-dictation.svelte.ts:46).

**Root cause / approach.** Move the console to /admin/feedback with a 307 from the old address, its own admin gate and the portal chrome. Dictation: at each final-result boundary append a period when the chunk ends without punctuation and capitalise the next chunk's first letter, append-only as the module's own rule requires.

**Migration.** none for /admin/feedback; one small reservation migration for /feedback

**Decision owed.** Where should the console live: /admin/feedback (no migration) or /feedback (one small migration)?

**Files.** `src/routes/classroom/feedback/`, `src/routes/admin/`, `src/lib/feedback/dictation.ts`, `tests/feedback-dictation.test.ts`, `tests/classroom-measure.test.ts`, `tests/feedback-untrusted-render.test.ts`

#### R08 -- bug-suspected (size M, P2)
**Ask.** Dictate is bad on mobile.

**Evidence.** dictation.ts sets `continuous = true` and `interimResults = true` (:191-192); Android Chrome in continuous mode is known to resend growing final results and the loop from `resultIndex` (:194-202) does not dedupe. There is no restart after a pause by design (:17-18), so phones stop after short silences. FeedbackBox focuses the textarea on mount (FeedbackBox.svelte:389) and when listening ends (:240), which raises the phone keyboard over the box. The documented support list has no phone (dictation.ts:13-24). Not reproduced here: no container has a phone.

**Root cause / approach.** Dedupe final results, skip the refocus on coarse pointers, and keep dictation.ts's append-only rule. Needs one real-device check by Mr. Pina after it ships.

**Migration.** none

**Files.** `src/lib/feedback/dictation.ts`, `src/lib/feedback/FeedbackBox.svelte`

**Owns (if built as a lane).** `src/lib/feedback/**`, `src/lib/classroom/FeedbackConsole.svelte`, `src/routes/classroom/feedback/`, `src/routes/admin/feedback/`

### Cluster: Help, maps and the home counter (R04, R05, R10)

#### R04 -- buildable-feature (size L, P2)
**Ask.** Practical hover and tap explanations for controls across the site, starting with Settings.

**Evidence.** `InfoTip` (classroom/InfoTip.svelte) already opens on hover, focus and tap (:47-56) and is used in five places. The Settings dialog (ClassroomSettings.svelte:161-221) shows titles and radio labels only; `SettingBase` (preferences/classroom.ts:343-350) has no help field; there are 8 settings (:400-480). src/lib/classroom and src/lib/shell carry 21 `title=` tooltips across 19 files, which CLAUDE.md says are not discoverable.

**Root cause / approach.** Default scope: a `help` string on every classroom setting rendered as an InfoTip beside the title (not inside the radio label); then the classroom header, the class toolbar, the grading console and the composer, replacing each `title=` there with an InfoTip. The rest of the site follows in later rounds.

**Migration.** none

**Files.** `src/lib/classroom/InfoTip.svelte`, `src/lib/classroom/ClassroomSettings.svelte`, `src/lib/preferences/classroom.ts`

#### R05 -- bug-suspected (size S, P2)
**Ask.** Clicking a building on the map plan should expand it, the way clicking it in the list does.

**Evidence.** Plan shapes are links through the same `nodeHref` as the rows (MapsPlan.svelte:449-462, MapsViewer.svelte:335, :425). But with exactly one root building, `mapsDrawing` draws that building's interior (viewer.ts:615-619) and the building becomes the frame, a plain `<rect class="mv-frame">` with `fill: none` (MapsPlan.svelte:438-444, :608-613) that is not a link.

**Root cause / approach.** Wrap the frame in a link to the building when the frame is not the open level (a new `frameHref` prop from MapsViewer), keeping rooms clickable above it; walls stay `pointer-events: none`.

**Migration.** none

**Files.** `src/lib/maps/viewer/MapsPlan.svelte`, `src/lib/maps/viewer/MapsViewer.svelte`, `src/lib/maps/viewer/viewer.ts`

#### R10 -- buildable-feature (size M, P3)
**Ask.** The lines-of-code figure should count up on load, each update should carry its own count, and the pop-up should look better.

**Evidence.** CodeCounter.svelte (mounted at routes/+page.svelte:501) prints a build-time figure from `virtual:site-code` (vite.config.ts ~140-217, code-census.ts) as static text. `VersionEntry` has no per-commit line counts (site-versions.ts:61-74; the log is read with --name-only). A count-up exists in GAUNTLET (`countUp`, gauntlet/viewport/motion.ts:89) but is rAF-only. The pop-up is a flat panel not in plate.css's panel list, and its `.loc-files` and `.loc-ex-n` read `--gold`, brown on Space White.

**Root cause / approach.** Lift a count-up into a shared module on rAF-or-timeout behind reduced motion; add per-commit added/removed lines from `git log --numstat` filtered by `languageFor` (full clone only, like versions) and show them on each update row; put the pop-up in plate panels and move its gold to `--hover-ink`.

**Migration.** none

**Files.** `src/lib/CodeCounter.svelte`, `src/lib/code-census.ts`, `src/lib/site-versions.ts`, `vite.config.ts`, `src/lib/gauntlet/viewport/motion.ts`

**Owns (if built as a lane).** `src/lib/classroom/InfoTip.svelte`, `src/lib/classroom/ClassroomSettings.svelte`, `src/lib/maps/viewer/**`, `src/lib/CodeCounter.svelte`, `src/lib/site-versions.ts`

### Cluster: Themes and identity (R07, R09, R13)

#### R07 -- needs-decision (size L, P3)
**Ask.** More visual options to tell classes apart: theme presets for a class banner (an FRC-standard one, several IDEA variants), with sections of one course sharing a theme and differing by one colour.

**Evidence.** A class is told apart by words and a derived glyph only (class-glyph.ts:34-64, ClassroomShell.svelte:399-428). My classes cards share one accent on purpose (MyClasses.svelte:15-17, :256-259). There is no class banner (ClassView.svelte:1860-1875 is a compact pane head) and no colour column (0082: courses id/code/title/active, sections label/block/teacher). Reusable: identity-style.ts presets and ink, 0220's nullable-columns-with-CHECK shape, the launcher's per-app accent rule, the `--frc-*` tokens.

**Root cause / approach.** Mockups first on a /dev page: a theme per course from a fixed preset list and a section accent from a short list, painted on a class banner, the My classes card and the strip key, each with a Space White twin and never colour alone. Then one additive migration with CHECK allowlists.

**Migration.** yes, after the mockups are approved

**Decision owed.** Theme per course with one accent per section (the reading of the report), and mockups before any build?

**Files.** `src/lib/classroom/class-glyph.ts`, `src/lib/classroom/MyClasses.svelte`, `src/lib/classroom/ClassroomShell.svelte`, `src/lib/classroom/ClassView.svelte`, `src/lib/identity-style.ts`

#### R09 -- bug-suspected (size S, P3)
**Ask.** The Matrix theme is not animated on mobile.

**Evidence.** Nothing gates on device. MatrixRain.svelte stops only for reduced motion (:104, :236-248) or its slow-frame degrade: 90 frames over 34ms halve the rate and 90 more park a still (matrix-rain.ts `slowFrameMs: 34`, `slowFramesToDegrade: 90`). A phone at 30fps runs about 33.3ms a frame, right on that edge. Inside the content band the rain is drawn at `contentGain: 0.2` with no bright head, and at phone width the whole screen is the band (tests/theme-rain.test.ts:231), so it may be running but barely visible.

**Root cause / approach.** Read `data-motion` off the canvas on a phone to learn which state it is in; raise the slow-frame threshold above a 30fps frame and let a narrow screen keep a little of the head brightness, re-measuring contrast in the band.

**Migration.** none

**Files.** `src/lib/MatrixRain.svelte`, `src/lib/design-system/themes/matrix-rain.ts`, `tests/theme-rain.test.ts`

#### R13 -- needs-decision (size M, P2)
**Ask.** The IDEA logo on the light theme looks off in colour and weird; replace it with something aesthetically sound.

**Evidence.** This is decision 40 item 2 as built: a light lockup in tools/idea_logo_vector.py (`LIGHT`, :51-69: plate #9DD294 to #69A862, letters #223A28 and #0F1A12, steel gear kept), rasterised by tools/idea_emblem_raster.mjs to static/IDEA/idea-*-light-*.png and picked by AnimatedLogo.svelte:106-122, :196-217.

**Root cause / approach.** Mockups first: three or four light lockups on /dev for Mr. Pina to pick from (the original dark emblem on a dark plate chip, a monochrome ink lockup, a deeper brand-green plate with ivory letters as on the dark theme). Geometry edits only in the logo tool. Amends decision 40 item 2.

**Migration.** none

**Files.** `tools/idea_logo_vector.py`, `tools/idea_emblem_raster.mjs`, `src/lib/brand/AnimatedLogo.svelte`, `static/IDEA/`

**Owns (if built as a lane).** `tools/idea_logo_vector.py`, `tools/idea_emblem_raster.mjs`, `static/IDEA/`, `src/lib/MatrixRain.svelte`, `src/lib/design-system/themes/matrix-rain.ts`

**Overlaps.** R07's migration is separate from R18's.

**Notes.** Every screenshot in this export predates ledger 0346's Plate rollout (build a4f769c and earlier).

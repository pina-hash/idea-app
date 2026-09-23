# Friction log, ledger 0297

Every place the program was slow, confusing, ugly, dead, cramped, overlapping, wasted space, or missing something, one line each, tagged with its area. Phase 0 lines were measured by six read-only auditors driving the `/dev` harnesses in Chromium 141 at 1440x900, 1366x768, 960x900 and 375x812 on `33849402`; the auditor that found each line is in brackets. Severity: `blocking` (a task cannot be done or work can be lost), `named` (a defect Mr. Pina named: dead space, text touching a border, overlap at half width, wasted space; fixed regardless of maturity score), `major`, `minor`.

Lines added after Phase 0 carry the round that found them. A line that has been fixed is struck through and carries the commit or round that fixed it.

## Shell, navigation and layout  (14)

- **named** @1440, 1366, 960 [shell-theme-home] Item detail pane 936px but content capped at 736px (--measure-reading, classroom.css:481): 200px unused at 1440, 126px at 1366 (862 pane), 224px at 960 (single pane 960, content 736).
- **named** @1440, 1366 [shell-theme-home] In split mode the breadcrumb trail and section tabs shrink-wrap and center instead of spanning the split: .crumbs 305.3px at x=567.4, first crumb at x=599.4, tabs 481px at x=479.5, while content runs x=32-1408 (flex-column .cr-root from split.css:273 plus margin:0 auto in ClassroomShell.svelte:494,593).
- **named** @1440, 375 [shell-theme-home] Chrome before content: split section content starts at y=201.3 at 1440 (22%) and y=250.1 at 375 (31%); a teacher's first item row sits at about y=487 of 900 (54%) after the class card header, buttons, a prose line and Select all.
- **named** @1440, 1366 [shell-theme-home] Nav pane with an item open: rows run x=108.8-406 inside a 416px pane (297px, 71%): pane padding 24px plus a framed unit card inside a framed pane plus the caret/icon column.
- **named** @960, 375 [shell-theme-home] Fixed VOICE (VoiceNav.svelte:421) and Report a problem (SiteFeedback.svelte:399) sit over classroom rows; hit tests at the intersection answer the overlay for row checkbox, grip, menu trigger, a unit's Select all, and People's Deactivate/Remove buttons.
- **named** @375 [shell-theme-home] Section tabs wrap to two rows at 375 (93.8px) with Check-ins alone on the second row; 'My notebook' sits alone on its own right-aligned row.
- **named** @375, 960, 1366 [notebook] The site-wide VOICE and REPORT A PROBLEM floats sit above full-screen capture overlays (corrector and camera) and cover their controls.
- **named** @1440, 375 [teacher] The fixed 'Voice' button (root VoiceNav) covers item-row checkboxes on the teacher class stream at 1440. At 375, Voice and 'Report a problem' together cover a row's checkbox, drag handle and row menu.
- **named** @960, 375 [claims-prefs-keys] The Voice pill (VoiceNav, root layout, rendered in Chromium on every page because SpeechRecognition exists) plus the Report pill sit over live content: grading roster rows at 960 and 375, class rows 'Truss load calculations' and 'Shop safety quiz' at 375, the item page's controls at 960 and 375, the assignment's 'Module content Hide' disclosure at 960 and 375.
- **major** @all [shell-theme-home] Section switcher is a 174.5x44 pill centered in the masthead; its menu items are 40px (.sw-item min-height 40px) under the student 44px floor; no per-class glyph, no search, classes invisible until opened (report 26).
- **major** @1440 [shell-theme-home] Back controls are not top-left (report 34): NotebookMasthead 'Home' at x=1342 top-right, ClassroomShell minimal back in header-right, DeckViewer back in a bottom scrim bar, classroom trail centered at x=599 (section) or x=338 (item) at 1440.
- **minor** @1440 [shell-theme-home] Current crumb ellipsizes at max-width 22rem even when the trail row is 828px wide ('Truss bridge analysis and member sizing, with the full ...').
- **minor** @all [teacher] 'Duplicates', a cleanup tool, holds a primary class tab beside Class, People and Grades.
- **minor** @375 [reliability] At 375 the floating Voice and Report a problem pills cover about two lines of the composer's Files section mid-scroll (e2-editor-chunk-failed-375-note.png).

## Visual design and themes  (5)

- **blocking** @all [shell-theme-home] Launcher identity accents on a light ground: #00ff41 1.29, #c8ff00 1.12, #2ae57e 1.58, #0fbe7a 2.29, #78b870 2.24 (only FRC #ed1c24 at 4.15); cards paint var(--bg1), and the test forbids a theme from touching --acc-ink.
- **major** @1440 [shell-theme-home] Non-default theme flashes on every full load: FCP 192ms vs data-theme at 829ms on /dev/themes, 344 vs 1130ms on home (dev server), 32-34 painted frames unthemed.
- **major** @1440, 1366 [shell-theme-home] The theme switch is only in ProfileMenu, under pathway and picture pickers: theme rows at y=1018 in a 1139px panel, below the fold at 1440x900; 3 actions (open, scroll, pick); not reachable from classroom chrome.
- **major** @all [shell-theme-home] --hairline is rgba(255,255,255,0.08) (colors.css:86) and the switcher's course code is --gold (locked, 2.17:1 on #F7F9F9): both vanish or fail on a light ground unless the rules change.
- **minor** @all [shell-theme-home] theme-color is a static #0A0C0D in src/app.html; it cannot follow a theme.

## Banners, mastheads and home entry  (8)

- **named** @1366, 375 [shell-theme-home] Home hero is 540px tall (70% of 768) and repeats 'Sign in for your classes' copy plus a stats plate to signed-in students; Your Classes starts at y=835 (below the 1366x768 fold) and at y=1340 at 375 (docH 3060).
- **named** @1440 [shell-theme-home] Your Classes feed stacks one 1036px card per class in a single column (3 classes about 1000px); 56px rows whose titles use about 400 of 1034px.
- **named** @375 [shell-theme-home] Home header wraps to 162px at 375 (student), 125.5px (teacher).
- **major** @all [shell-theme-home] Home header background is a literal rgba(19,26,19,0.88) (app.css:2031) and the .legacy-index block carries 59 rgba tints of dark-theme brand colors: none follows a light theme.
- **major** @all [shell-theme-home] AnimatedLogo is two PNGs; the text plate is dark green-grey metal (45% opaque pixels) that reads as a dark sticker on #F7F9F9 and #E8ECEB (shots/logo-on-grounds.png).
- **major** @all [shell-theme-home] Notebook masthead color is --nb-masthead, a literal per notebook plate; notebookPlate() only knows site 'matrix', so a new site theme leaves the notebook band dark.
- **minor** @all [shell-theme-home] Home starfield canvas reads --green once at mount (+page.svelte:314); a theme switch does not recolor it without a reload.
- **minor** @1440 [claims-prefs-keys] ClassroomMark and NotebookMark are flat currentColor strokes with no shaded faces, no --* hooks and no once half-cycle, below the IdeaCadMark standard; ClassroomMark's header describes a class list it does not draw; the Notebook card's texture quotes the light plate #fafaf7 that F4 retires.

## Class stream and organization  (14)

- **named** @1440 [shell-theme-home] Stream multicol leaves column 1 empty below Unit 1 (about 426x535px) because Unit 2 (18 items) is break-inside: avoid (shots/classroom-stream-1440.png).
- **named** @1440, 1366, 960 [student] Stream multicol leaves a 426x702px empty region under a short Unit 1 beside a tall Unit 2 (column bottoms 201 vs 903 in /dev/classroom-stream default shape 3,18,2,5,4); 401x702 at 1366; 452x395 at 960.
- **named** @1440, 1366 [student] Student class page spends ~298px (33% of 900) at 1440 and 39% of 768 at 1366 on masthead 82px, crumbs 34px, class title row and a lone right-aligned 'My notebook' row (y=283-327) before the first unit (y=343 minus the harness-only 45px tab bar).
- **named** @960, 375 [student] Fixed 'Voice' (90x44) and 'Report a problem' (~163x44) buttons sit on top of stream rows; hit-rect overlap measured with a.row-main at 960 (143x19.5px) and with row-expand/row-main at 375; same on the item page over link cards and the deck open link.
- **major** @all [student] No search, filter, sort or due-date view in a class; with 29 items across 3 units a student scans every row to find one assignment.
- **major** @all [student] Overdue assignments read 'Not started' in the muted grey chip with only 'Due Mon, Jul 27' in the meta line; nothing says Overdue or Missing inside a class (safety quiz in class-bulk-student).
- **major** @all [student] First paint shows due dates in the server time zone: SSR HTML 'Due Thu, Aug 20, 12:00 AM' becomes 'Due Wed, Aug 19, 5:00 PM' only after hydration in America/Los_Angeles, so the wrong day shows until JS runs.
- **minor** @1440, 375 [shell-theme-home] Unit 3 label clipped to 'MATERIALS AND TESTI...' (232px of text in 230px) in the teacher class view.
- **minor** @all [shell-theme-home] Teacher class header carries a prose instruction, 'Tick items to publish, file or delete several at once.', on its own row.
- **minor** @all [student] No unit progress (no 'n of m done', no checkmarks) though the per-assignment work map is already loaded for the student.
- **minor** @all [student] Due dates name a weekday ('Due Sun, Aug 16'): formatDue uses weekday 'short' (classroom.ts:967), against the no-weekday student-copy rule.
- **minor** @1440, 1366 [student] Units are bordered cards nested inside a bordered 24px-padded nav pane card (box in a box), costing ~50px of width at every desktop width.
- **minor** @all [student] Harness fidelity: /dev/classroom-split mounts ClassroomShell with canManage={true} (line 553) so its student mode shows teacher tabs; /dev/classroom ?view=class mounts ClassView outside the split at the 60rem page measure. Width readings off either differ from production.
- **minor** @1440, 1366, 375 [teacher] In a three-unit class the unit name 'Unit 3 · Materials and testing' is ellipsised (230/232px at 1440, 205/232 at 1366, 147/232 at 375).

## Student to-do, due dates and missing work  (7)

- **major** @all [student] Nothing owed is shown anywhere inside /classroom: MyClasses cards (440x164px at 1440) carry code, title, period and teacher only, no due or missing counts.
- **major** @1366, 375 [student] On the site home the to-do starts below the Apps launcher: first class card at y=917 at 1366 (below the 768 fold) and y=1422 at 375; three classes run to y=2969 on a phone.
- **major** @all [student] No single cross-class list: one card per section, each capped at 6 rows (URGENT_LIMIT), no Assigned/Missing/Done tabs, no This week/Next week/Later grouping.
- **major** @all [student] Missing notebook check-ins ('Not filed yet') never appear on the home to-do; they show only as a count badge beside 'My notebook' inside each class.
- **minor** @all [student] A 'Returned' row leaves the home feed as soon as the item is opened once (isUnseenReturn, feed.ts:209), so a grade glanced at is not findable from home again.
- **minor** @375 [student] 'OPEN CLASS' link in each feed card measures 341x40.9px, under the 44px student floor.
- **minor** @all [student] No notification of any kind for new, due or returned work; web push exists only for tournaments.

## Item page (student)  (15)

- **blocking** @all [student] Ported HTML (v3) and IdeaCAD (v4) items never show the returned grade breakdown or the teacher comment; the only trace is the 'Returned · n/N' chip on the class row (teacher_comment renders only in AssignmentEngine.svelte:714).
- **named** @all [shell-theme-home] Presentation card has a 60px empty band above its heading: DeckPanel's h2 inherits app.css:102-105 h2 margin-top 2.25rem (36px) on top of 24px card padding; .cr-root h2 (classroom.css:127) resets font and color but not margin.
- **named** @375, 1440 [shell-theme-home] Item title is Orbitron 38.4px at every width: 7 lines, 309px tall at 375, first content block at y=620 of 812; 4 lines, 176.6px at 1440.
- **named** @1440, 1366, 960 [student] Non-HTML item content capped at 736px (46rem): 936px pane at 1440 leaves 200px, 862px at 1366 leaves 126px, single 960px pane leaves 224px; with 'Hide other items' the pane is 1376px and 640px sits empty.
- **named** @375, 1366 [student] Item title in Orbitron 38.4px runs 7 lines and 309px tall; the hero takes 447px (55% of 812) before any content on a phone, 296px at 1366.
- **named** @all [student] Presentation card shows a 60px empty band above its heading: bare <h2> in DeckPanel.svelte:234 inherits app.css:102-104 margin 2.25rem on top of 24px card padding.
- **named** @1440, 1366, 960 [student] Reference document (v2) prose held to 466px (--rb-measure 54ch, ReferenceDoc.svelte:707) inside a 730px article at every desktop width; 32% of a 1440 window.
- **major** @all [student] v3 items render no rubric in parent chrome before starting; a rubric exists only if the author embedded collapsed rubric panels in the document itself.
- **major** @1366, 375 [student] v1 rubric ('How this will be graded') is the last card, below Submit, at y~4884 of 5994px (6.4 screens at 768); nothing near the top says it exists.
- **major** @375 [student] Returned card puts the full rubric breakdown (1235px at 375) before the teacher comment, which lands 1065px below 'Returned: 6 / 20 pts'.
- **major** @all [student] An inline link in the body renders as bare underlined text (ItemBody.svelte:101); the same YouTube URL in the Links list gets a thumbnail card.
- **minor** @all [student] Prose instructions in the interface: progress rail 'This measures how much you have filled in, not how well. Grades come from your teacher.' and 'This assignment has no online hand-in. Follow the instructions above...'.
- **minor** @all [student] v3 HTML answers autosave on an 800ms debounce with no localStorage mirror (html-assignment/answers.ts:921), unlike v1; a tab killed mid-typing loses the unsent burst.
- **minor** @1440 [student] Breadcrumb truncates the item title at 352px ('...with the full ...') with room left in the row.
- **minor** @all [student] 'Open your notebook' on an item's check-in leaves the classroom for the separate /notebook app.

## Creation and composer (teacher)  (10)

- **named** @1440, 1366 [teacher] The full-viewport composer caps its form at max-width 64rem (ContentComposer.svelte:3349-3353). With a 2rem gutter that leaves 352px unused at 1440 (176 each side) and 278px at 1366. The whole form is one column, 1611px tall for an announcement in the harness. Computed from CSS because no harness mounts `screen`.
- **major** @1440 [teacher] Report 21 is still open. A spec .json and a ported .html dropped on the title input were both staged as general, student-visible Files ('1 dropped file attached.'). composerDropZone calls filePanel.add unconditionally (ContentComposer.svelte:968-975).
- **major** @all [teacher] The composer says it is not an instructor-density surface and takes the 44px floor (:3716-3719), yet its kind tabs measure 25px, '+ Add link' and '+ Add instructor link' 24px, and the 'Post to' checkbox labels 19px.
- **major** @n/a [teacher] No harness mounts the composer with `screen`, which is the real mount (+layout.svelte:470). /dev/classroom-split mounts it as a split overlay card with one section, and /dev/classroom's note ('The real layout mounts this in the DETAIL pane') is stale.
- **minor** @all [teacher] DeckPanel's drop target has no accept (DeckPanel.svelte:229) while its picker names .zip with a literal that duplicates DECK_ACCEPT (:277), so a dropped PDF is sent to the server instead of being refused locally.
- **minor** @1366, 375 [teacher] The sticky actions row covers a control scrolled to the top edge. Hit-testing 'Choose files' after scrollIntoView(start) returns .composer-actions at 1366 and 'Save draft' at 375; there is no scroll-padding-top.
- **minor** @all [teacher] The check-in stager opens with Unit, Day and Name all empty. It does not take the composer's Unit select, the schedule date or the title, so a teacher types three things the form already knows.
- **minor** @all [teacher] 'Guidance written.' shows on a staged check-in when no guidance was typed. CheckInGuidance.svelte:146-149 calls onchange with the seeded empty document, so staged.guidance is non-null.
- **minor** @all [teacher] Four prose hint sentences are visible when the composer opens ('Leave empty to post immediately...', the deck paragraph, the instructor-only paragraph, 'Drop a file anywhere on this form...'), and the deck picker is an unstyled native 'Choose File'.
- **minor** @all [teacher] There is no due-date clash view when scheduling. Scheduling is a bare datetime-local field.

## Grading and feedback  (15)

- **named** @960 [teacher] A ported HTML document renders 300px wide in a 562px work pane, leaving 262px dead. `.work-split.has-rubric { align-items: start }` (GradingConsole.svelte:3843-3847) survives the 78rem flex fallback (:3873-3886) below 1024px, and only the 1024-to-78rem band resets it (:4038). At 1240 the same fixture fills 810px.
- **named** @all [teacher] The 'Closing this assignment' disclosure meta '2 open · 0 closed', which is the count a teacher acts on, is ellipsised to 35 of 103px at 1440, 1366 and 960, and to 26px at 375.
- **named** @1440 [teacher] Grades tab content is capped at 960px (main x=240 w=960 on /dev/grading), leaving 240px unused on each side.
- **named** @1440, 960 [claims-prefs-keys] When the unsaved bar inserts, the focused level's descriptor tooltip (.level-tip) keeps its old coordinates and lands on the key legend: 5,090 px2 overlap at 1440, 7,816 px2 at 960 (shots/grade-1440-dirty-bar.png).
- **named** @960 [claims-prefs-keys] The floating 'Report a problem' pill covers the grading console's 'Return to student' dock button at all three hit points (862/812/913, 870) at 960 (shots/grade-960-open-overlap.png).
- **major** @1440 [teacher] There is no carousel. After R R the same student stays selected, and N walks the roster alphabetically into 'Not submitted' rows (Carla, then Dana Whitfield, then Dara Nwosu). There is no filter for submitted work only.
- **major** @1366 [teacher] At 1366x768 the work split gets 289px of height and the sticky dock takes 61, so about 228px of rubric or work is visible at once. A title block of about 100px and a 106px student card sit above it.
- **major** @all [teacher] The console has no route to the same day's notebook entries. Reaching them takes the class crumb, then the 'Check-ins ›' tab into /notebook/review (a separate app with its own masthead), then the day: 3 actions.
- **major** @all [teacher] There is no comment bank, no inbound AI grade import, and the 0090 instructor-only documents are never shown beside the work being graded.
- **major** @all [teacher] There is no needs-attention queue inside /classroom, and MyClasses shows no counts. The site-home feed rows ('N to grade', at most 6 per class) link to the item page, not the console. Resubmissions are labeled only on each section's Grades tab, and teacher class-stream rows show no to-grade count.
- **major** @1440 [claims-prefs-keys] Grading console: pressing N or P after picking a level without S raises the unsaved bar, after which every key is dead including Escape and S (GradingConsole.svelte:1738 returns while pending); focus stays on the level button and 'Save draft, then switch' is 12 Shift+Tab presses away. Breaks IDEA_INTERFACE_STANDARDS section 8 (keyboard path covering the whole loop).
- **minor** @1366, 960, 375 [teacher] Dock labels wrap. 'Next student ›' drops its chevron to a second line in 98-123px buttons, and at 375 'Previous student' wraps to about 3 lines in 83px.
- **minor** @all [teacher] The grading roster's presence region carries a prose paragraph ('Counted only while this assignment is open and being typed in...').
- **minor** @n/a [teacher] Harness fidelity: /dev/grading-bulk, /dev/presence and /dev/grading-rubric set no --cr-measure-route, so main measures 880 or 960 at 1440 where the real route gives 100%. 12 of the 21 harnesses in this slice omit $lib/classroom/classroom.css.
- **minor** @1440 [claims-prefs-keys] N/P walk every roster row: fixture roster is 25 rows with 1 submitted, 1 in progress, 23 not submitted, and no key jumps to the next work that needs grading; save and advance are two keys (S then N), 9 keystrokes per student on a 4-criterion rubric.

## Live class and the teacher at the front  (5)

- **blocking** @all [teacher] There is no projector or present view, agenda, clock or timer anywhere in /classroom. The only fullscreen is DeckViewer.
- **major** @all [teacher] Presence is visible only inside the grading console roster, next to grade chips and export tools. There is no students-by-work grid on the class page.
- **major** @all [teacher] The manager hall pass chip reads '1 out · Ana Reyes' (hall-pass.ts:609) on the class pane, which is the pane that gets projected.
- **major** @all [teacher] Projecting the teacher class page shows drafts, selection checkboxes, drag handles and the notebook outstanding badge. There is no student-view or present mode (the view-as previews were deleted).
- **minor** @all [teacher] The presence heartbeat runs only on students' assignment pages, because it needs data.engine (item/[itemId]/+page.svelte:1011-1013). Opening a material or announcement is invisible to the teacher.

## People, teams and class tools  (7)

- **named** @1440, 1366 [shell-theme-home] People and Grades cap at 960px centered: 480px of margin at 1440 (x=240), 406px at 1366; Duplicates reads the same 60rem route measure. People also spends about 150px on a centered Orbitron title and repeats an ENROLLED chip on every row.
- **named** @1440 [teacher] People content is capped at 960px, leaving 240px unused on each side, and 41 roster rows run in a single column above the tools.
- **major** @all [teacher] 'Post to the class' acknowledges 'Posted. The whole class can see these teams.', but no student surface renders posted teams. This is a false acknowledgement.
- **major** @1440, 375 [teacher] Class tools sit under the full roster. 'Random picker' is at document y=3962 at 1440 (7014 at 375) with 41 students, and the drawn teams render at y=5947, 1831px below Draw at y=4116, so pressing Draw changes nothing on screen.
- **major** @1440 [teacher] `.cr-root .btn.tiny` (specificity 0,3,0, classroom.css:204) beats `.tap-44` (0,1,0). 'Random picker' carries tap-44 and measures 24px. There are 22 `tiny tap-44` sites in classroom components. People measures 86 of 90 controls at 24 to 43px, with no density class declared on the surface root.
- **minor** @all [teacher] The 'Here today' list is 39 native blue checkboxes (accent-color auto) and is not prefilled from presence. The radio inputs are 13px in a cramped 183px fieldset, and two prose sentences explain the picker.
- **minor** @n/a [teacher] /dev/instructor-tools omits classroom.css, so it measures PeoplePanel's 'Edit' at 44px while /dev/classroom?view=people (which matches the real route) measures 24px.

## Notebook capture  (15)

- **blocking** @375, 960, 1366 [notebook] The PhotoCorrector overlay's title 'Straighten this photo' and its hint are painted under the notebook masthead. The overlay (fixed, z 1000) sits inside main.nb-shell (relative, z-index 1), a sibling of .app-header (z-index 2); a hit test at the title lands on .app-header.
- **blocking** @all [notebook] Photos are held only in memory and upload only at Save draft or Turn in. A closed tab, a dead battery or a deploy loses them; the pending marker saves the form, not the image.
- **named** @960, 1366 [notebook] The site VOICE float covers the centre of the corrector's primary button 'Flatten and clean up' (hit test lands on vnav-trigger); the visible label reads 'clean up'.
- **named** @375 [notebook] The VOICE float covers the corrector's 'Reset corners' and the in-app camera's 'Cancel' (hit tests land on vnav-trigger; shots/camera-375.png).
- **named** @960 [notebook] Below 1024px the composer (1180px) stacks above the list, so the first entry starts at y=1855 and no entry shows in the first two screens.
- **named** @1366x768 [notebook] Masthead 82px plus page head 112px put the split at y=242. The 487px list pane shows 0 entry rows on load because the search, sort, 4 folder chips and 6 filter chips fill it. At 1440x900 it shows 1 row.
- **named** @1366, 1440 [notebook] The page head is capped and centred (x=102, 1162px wide) while the split spans the window, so the two left edges sit 70px apart. On the read-only views at 1440 the head is 724px wide and the edges sit 330px apart.
- **named** @1366, 1440 [notebook] The compose card is 768px wide inside an 862px detail pane, leaving 94px unused. At 1440 the form is 718px inside a 936px pane.
- **named** @1440 [notebook] An opened entry's title column is about 200px wide beside its toolbar (Folder, Move to drafts, Pinned, Copy, Rename, Delete) in a 936px pane, so the title wraps to five lines (shots/entry-open2-1440.png).
- **major** @375, 1366 [notebook] 'Reset corners' is 15px tall and the camera's 'Cancel' is 40px, both on a student surface with a 44px floor.
- **major** @all [notebook] Every photo from every source must pass the straighten screen, so skipping it costs one extra tap per page.
- **major** @375 [notebook] 'Take a photo' sits 1030px below the composer top, behind the check-in picker, guidance, title and folder. The entry list starts at y=2482.
- **major** @1366, 1440 [notebook] A laptop cannot drag and drop or paste a photo into the notebook; no drop or paste handler exists anywhere under src/lib/notebook.
- **major** @all [notebook] The composer carries about 110 words of instruction prose in five hint and note blocks plus the privacy lead, which breaks the rule of no prose instructions in the interface.
- **minor** @all [notebook] 'Open in Drive' names the storage vendor on a student surface.

## Notebook review and grading  (13)

- **named** @1366, 1440 [notebook] The grid scroller shows 684 of 782px, cutting the Covered column and 'Gearbox reassembly', while the entry pane beside it is 544px wide with 122px of content. At 1440 it shows 758 of 782px, with 'Covere' cut.
- **named** @1440 [notebook] 250px of the 682px pane sits empty under the grid card, and the entry pane stays 560px empty until an entry opens.
- **named** @960 [notebook] The split is 864px wide in a 960 viewport, leaving 96px dead at the right. The entry that follows the cursor stacks below the grid at y=722, out of view.
- **named** @960 [notebook] Both read-only notebooks (/notebook/review/student/<email>, /classroom/view-as/<email>/notebook) render one 488px list in a 960 window, leaving the right half empty.
- **major** @all [notebook] Accept records a verdict with no comment. A flag is a reason code plus one optional line ('What needs fixing?'), with no next-step chips.
- **major** @all [notebook] There is no approve-all and no 'new since my last look' queue; the only signal that an entry is unreviewed is a dot on its cell.
- **major** @all [notebook] 'Grade unit' is a genuinely disabled button whose reason ('Pick a unit above') lives only in a title tooltip, so a click explains nothing and a phone cannot see it.
- **major** @all [notebook] The grading console cannot reach review or the Documentation Check. Grading a day's HTML assignment and then its notebook entries means leaving /classroom for /notebook/review.
- **major** @1440 [claims-prefs-keys] Compliance grid's 'Covered' column header is clipped to 'Coverei' at the right edge of the grid card (shots/nbreview-1440-after-keys.png).
- **minor** @1440 [notebook] On the read-only notebooks the search field stretches 1325px wide while two entries sit in two columns under it.
- **minor** @all [notebook] The Documentation Check copy says 'The grid above works...' while Grade mode hides the grid, and its rubric sentence uses '--' as a dash.
- **minor** @all [notebook] The section select truncates 'ENG1H · Period 2 · Block B' to '...Block' (174px).
- **minor** @375, 960, 1366, 1440 [claims-prefs-keys] The multi-entry count badge on a grid cell ('✓ 2') touches the cell's right edge (right inset -0.2px); part of the locked density contract, so a mark decision rather than a padding fix.

## Notebook integration with the classroom  (11)

- **blocking** @all [notebook] A 'Something else' entry is saved with section_id null (NotebookView.svelte:1730,1780,1827). Free notebook work belongs to no class, and the grid's existing free_entries counter gets no rows.
- **named** @1440 [shell-theme-home] Notebook masthead is its own band with a DEFAULT plate picker and a top-right Home link; its detail pane is 936px with the New entry card 768px wide (168px unused).
- **major** @375 [shell-theme-home] On the item page at 375 the 'My notebook' link is hidden with the nav pane (0x0), so reaching a notebook entry takes 3 actions (crumb back, My notebook, entry) and lands in a different app.
- **major** @all [notebook] The student's 'My notebook' link from any class opens /notebook with every class mixed together and no class filter (ENTRY_FILTERS has none).
- **major** @all [notebook] '‹ Home' in the notebook masthead goes to '/', never back to the class or item the student came from. The review console's back link goes to the teacher's own notebook.
- **major** @all [notebook] Every door (launcher card, class link, stream row, item link, Check-ins tab) leaves the classroom chrome for a second dark masthead with its own DEFAULT plate picker and no class switcher or tabs.
- **major** @all [notebook] A teacher's check-in rows in the stream all link to /notebook/review?section=, which drops the check-in that was clicked.
- **major** @all [notebook] The item page's check-in is only a text link, 'Open your notebook'; no capture happens on the page where the work is.
- **major** @all [notebook] Assignment imageZone photos (Supabase submission-files) and notebook photos (Google Drive) live in two stores, and nothing shows a student's hand-in pictures in their notebook.
- **major** @375, 1366 [notebook] After Turn in the student is left in /notebook with no way back to the assignment short of the browser back button.
- **minor** @1440 [claims-prefs-keys] Notebook keeps its own plate picker ('DEFAULT' button in its masthead, 4 plates in localStorage idea_notebook_theme) separate from the site theme.

## Search, command palette and shortcuts  (7)

- **major** @375, 960, 1366, 1440 [claims-prefs-keys] No search, filter or sort inside a class: 0 search inputs on class, class-teacher, item, people and home views.
- **major** @1440 [claims-prefs-keys] Folding a unit removes its items from the DOM (Unit 1 folded on class-bulk-student: 50 visible item links to 14, 0 left hidden), so even browser Ctrl+F cannot find an item in a folded unit, and folds persist per account.
- **major** @1440 [claims-prefs-keys] Ctrl+K, Cmd+K and / do nothing on class, item, people, grading console and notebook review (DOM delta 0, focus stays on BODY); no command palette anywhere in classroom or notebook, while IdeaCAD already ships one (CommandSearch.svelte).
- **minor** @all [claims-prefs-keys] Shortcut legends exist only inside the two consoles; there is no global list; the rich-text editor's Ctrl+B and Ctrl+I (Tiptap defaults) are advertised nowhere (toolbar 'B' carries title='Bold' only).
- **minor** @375, 960, 1440 [claims-prefs-keys] Notebook search has no typo tolerance and requires every term ('gearbox' 3 of 9, 'gearbx' 0 of 9); Foundry search is any-token with one-typo tolerance, so the site already has two search rules.
- **minor** @all [claims-prefs-keys] Voice navigation knows 21 app-level phrases only; nothing inside a class (a unit, an item, what is due).
- **minor** @all [claims-prefs-keys] SpotlightTour's window keydown (SpotlightTour.svelte:113) does not ask isTypingTarget, so an interactive step pointing at an input would lose Enter and the arrow keys to the tour.

## Decks, media and embeds  (7)

- **named** @1440, 1280, 375 [student] Deck bar (58px, black gradient scrim) is absolutely positioned over the bottom of the projected slide frame (frame 0-900, bar 841.6-900 at 1440) and Back is bottom-left (report 34).
- **major** @375 [student] Deck bar does not wrap: at 375 the Report control spans x=368.3 to 463.1 in a 375px viewport (clipped, unreachable); the real route's 'Back to the item' label still overruns by roughly 60px (computed).
- **major** @all [student] Body images cap at 352px (max-height 22rem) with no action: a 1202x1202 figure cannot be enlarged, click produced 0 dialogs and no navigation.
- **major** @all [student] Image attachment thumbnails and zone photos link to the proxy in a new tab, which answers Content-Disposition: attachment, so 'look closer' downloads the file (AttachmentList.svelte:271, SpecRenderer.svelte:672).
- **major** @all [student] No image gallery: a zip of images is refused by the deck planner ('no HTML file at its top level') and an item holds one deck (0101 unique item_id).
- **minor** @375 [student] Slide index is read-only and says 'Use the arrow keys in the deck to move between slides' (DeckViewer.svelte:141); a phone has no arrow keys and a slide cannot be jumped to.
- **minor** @all [student] Deck upload refused above 4 MB in the browser (deck.ts:28) while the server accepts 150 MB (classroom-decks.ts:101); the hint tells teachers to strip video and gifs.

## Speed, reliability and deploy safety  (14)

- **blocking** @all [reliability] No deploy detection at all: svelte.config.js:5-10 sets no kit.version.pollInterval (kit default 0), no app code imports updated from $app/state or listens for vite:preloadError, and there is no src/hooks.client.ts; an open tab never learns a deploy landed until a load fails.
- **major** @1440 and 375 [reliability] A failed lazy editor chunk (every @tiptap URL aborted) leaves the composer body a 716x240 box with 0 editable elements and 8 of 8 toolbar buttons disabled; 33 typed characters landed nowhere (activeElement BODY) while the note promises the body 'will save as plain text' (RichTextEditor.svelte:244-248 and 696-699; same shape in NoteEditor.svelte:286-290 and 509-513).
- **major** @1440 [reliability] A failed route chunk during an in-class hop with a half-written post open destroys the composer and its typed title; the root error page replaces the whole class (dev reading; production reloads the target after updated.check() with the same loss).
- **major** @375, 960, 1366, 1440 [reliability] The error boundary after a failed chunk reads 'Internal Error' (SvelteKit's default client string), shows no Reference id for client errors (no hooks.client.ts handleError), and offers only 'Back to the portal' and 'Tell us what happened': no Try again and no Back to the class.
- **major** @1440 [reliability] A hung save makes every in-app link silently dead: guardSaveNavigation (save-guard.svelte.ts:79-94) awaits saveNow with no timeout and SaveState has no per-attempt timeout; measured URL unchanged at 300/1000/3000/8000ms after the click with the navigation indicator empty; the only signal is 'Saving...' at the top of the engine card.
- **major** @all [reliability] v3 ported HTML assignments, the format Mr. Pina moved assignments to, have per-block autosave but no localStorage mirror (html-assignment/answers.ts:56-66, 629); typing inside the debounce window is lost to a discarded tab or a reload, unlike v1 spec assignments (assignment-draft-mirror.ts).
- **major** @all [reliability] The teacher composer's half-written post and staged files live only in the section layout's memory (no localStorage in ContentComposer.svelte); any full load (deploy recovery reload, tab discard) loses them without a question.
- **major** @all [reliability] Classroom and notebook mastheads download 2,603,273 bytes of PNG (idea-logo-text.png 2560x1204 = 2,072,754 bytes plus idea-gear.png 1202x1202 = 530,519 bytes) to draw a mark 104px wide (ClassroomShell.svelte:145, NotebookMasthead.svelte:51); measured 2,542.3KB of images on /dev/classroom-split/s-1, more than the page needs by roughly 100x.
- **major** @all [reliability] A student opening a v3 HTML assignment waits on 5 sequential server-to-Supabase waves (item plus manages, deck, HTML version, HTML document, engine) after the hook's live getClaims Auth round trip; deck, document and engine are independent and could be one Promise.all (item/[itemId]/+page.server.ts:51, 110, 145, 198; html-assignment/load.ts:95, 112).
- **major** @all [reliability] Every deploy, including export-only commits, likely renames many client chunks because per-commit data (virtual:site-versions) sits in the client graph through the root layout and VersionBadge, which 11 classroom and notebook components import; without skew protection an open tab's first visit to a not-yet-loaded route after any deploy 404s its chunk (derived from Rollup hashing; verify after the baseline build).
- **major** @all [reliability] In-flight classroom uploads are tracked nowhere: an SPA navigation lets the PUT and record finish (nothing aborts them) but any full reload kills them silently, and there is no registry a deploy hold could read (file-upload.ts:154 uploadClassroomFile is the single choke point).
- **major** @375 [reliability] No offline photo queue: nothing in src/lib/classroom or src/lib/notebook uses IndexedDB, navigator.onLine or the online event; a capture taken on dead wifi exists only in memory.
- **minor** @all [reliability] /classroom (My Classes) statically imports the whole classroom-updates.json (137,442 bytes raw, 41,774 gzip) to render 3 entries (MyClasses.svelte:4 and 28, updates.ts:16).
- **minor** @projector [reliability] SvelteKit's own recovery can reload a projector page: invalidateAll on the tournament TV stage (tv/+page.svelte:27) goes through load_route, whose non-HTTP failure path does a native reload when the version changed (kit client.js:1338-1345); no app hook can veto it.

## Accessibility and legibility  (3)

- **major** @projector [shell-theme-home] IDEA palette under the projector model (300:1, +10% ambient): --text-2 4.21, --dim 3.35, --amber 3.59, --crimson 3.11, --boundary 2.65 on --surface-1; card vs page 1.025. Matrix is no better (surface separation 1.027).
- **major** @all [shell-theme-home] Home page controls below 44px on a student surface at every width: 3 CLASSES chip 26.9px, Take the tour 23.6, launcher order select 24.6, Comfortable view and Customize 22.6, LOC chip 23.6.
- **minor** @all [shell-theme-home] The /dev/themes contrast board omits every semantic ink, every --nb-* token, the mastheads and launcher accents; the base palette is deliberately unasserted with --gear on --bg2 at 3.57 and --boundary on --green-tint at 2.86.

## Customization and preferences  (5)

- **major** @1440 [claims-prefs-keys] Same-page preference clobber, measured on /dev/tour: folding a home class card wrote {classroomFeed}, then pinning an app wrote {homepage} alone and the fold was gone. Every writer spreads a page-load snapshot; AppLauncher also writes on every app open (noteOpen), and the root userProfile snapshot is not refreshed on client navigation, so a unit fold made in a class is erased by the next launcher open on home.
- **major** @1366, 375 [claims-prefs-keys] The theme can be changed only from the profile menu, whose Theme label sits at y=1286 in a 768px viewport (y=1462 in 812 at 375): open, scroll about 520px, tap; nothing in classroom chrome.
- **major** @all [claims-prefs-keys] No classroom density, default class view, grading defaults, pane widths or remembered sorts; GradesPanel's due/queue order resets every visit (GradesPanel.svelte:57-70 says so).
- **minor** @all [claims-prefs-keys] No reset-to-defaults for any classroom or home preference group (IdeaCAD's store has per-group reset).
- **minor** @all [claims-prefs-keys] Layout state is split between per-account (unit folds, feed folds, launcher) and per-browser (nav collapse, notebook plate, writing aid, disclosures) with nothing on screen saying which follows you.

## Learnability without instruction  (8)

- **major** @1440, 375 [claims-prefs-keys] The spotlight tour is home-only: 7 signed-in steps (hero, classes, apps, notebook, coins, GAUNTLET, GREENLINE), no classroom step, no notebook step, no teacher step; replay only from the home header.
- **major** @1440 [claims-prefs-keys] Teacher class page repeats one 33-word instruction in every empty unit ('Drag items here, or tick items and press File here...') three times, plus 'Tick items to publish, file or delete several at once.'
- **major** @1440, 960 [claims-prefs-keys] Composer default state carries 6 instruction paragraphs (~130 words): drop and paste, file limits, deck zip, instructor-only files, scheduling.
- **minor** @1440, 375 [student] /classroom/updates is one list of 176 entries, 42,751px tall at 1440 and 84,552px at 375; its intro points at a 'Feedback button' that is labeled 'Report a problem'.
- **minor** @375, 1440 [claims-prefs-keys] Meaning rides on title attributes a phone cannot hover: 17 on the teacher class page, 14 on the student class page (the '7' beside Notebook means 'Check-ins this class is behind on'; link and file counts are bare digits with an icon); InfoTip, the reachable tooltip, has 2 call sites.
- **minor** @375, 960, 1440 [claims-prefs-keys] Grading roster opens with two 36-word prose notices (off-roster response set, manager on roster) above the names.
- **minor** @1440 [claims-prefs-keys] Notebook review carries prose hints ('Arrow keys move; the entry beside the grid follows. Click a student's name...' and 'Click a page, or press Enter, to read it full screen.').
- **minor** @375 [claims-prefs-keys] Grading shortcuts are invisible until a student is opened; at 375 the legend sits 4,125px down the page.

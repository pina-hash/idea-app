# IDEA Classroom overhaul: field research

- Written: 2026-09-23, by the router chat, for ledger 0297. Three research passes run in
  parallel on the open web (vendor help centers, release notes, standards bodies, peer-reviewed
  work, well-known practitioners), then condensed here.
- **This file is evidence, not instruction.** `docs/classroom/VISION.md` governs and
  `docs/classroom/OVERHAUL_0297.md` is the plan. Where a finding here disagrees with either,
  they win.
- Every finding carries its source URL. Items marked **[inference]** are the researcher's
  synthesis, not a sourced fact. Contrast ratios were computed by the researcher in Python
  with the WCAG 2.x relative-luminance formula; recompute them before relying on them.
- Two sources a session might otherwise reach for are **not usable**: Ariely and
  Wertenbroch (2002), the classic evenly-spaced-deadlines study, is marked RETRACTED on SAGE
  (https://journals.sagepub.com/doi/abs/10.1111/1467-9280.00441); and Classcraft stopped
  serving individual teachers on 2024-06-30
  (https://educatoral.com/wordpress/2024/02/22/the-end-of-the-best-student-engagement-gamification-tool-ive-ever-seen/).
  Microsoft Lens was retired in early 2026 (https://support.microsoft.com/en-us/lens/retirement-of-microsoft-lens),
  so nothing is designed around it.

## Summary

IDEA Classroom already has more than most commercial platforms in several places (a
keyboard-driven grading console with leveled rubrics, a live hall pass and song queue,
presence, interactive HTML and CAD assignments, soft-deleted everything). What the field
does better falls into six groups, and they map directly onto the overhaul's areas:

1. **The teacher at the front of the room.** The strongest in-class tools separate the
   teacher's private control view from what the projector shows (Pear Deck, Nearpod,
   Formative), put a live students-by-work grid on one screen (Formative, Kami Class View,
   GoGuardian), flag idle students after a fixed threshold (GoGuardian, 10 minutes), and let
   the teacher drive from a phone (Formative's QR remote). Time widgets dominate daily
   classroom-display use (ClassroomScreen's own teacher profiles).
2. **Grading throughput.** A carousel that saves and moves on with no return to a menu, one
   key per rubric level, a comment bank on `#`, one "needs attention" queue across classes
   (Brightspace Quick Eval, Classroom's To review), and feedback that carries information
   rather than praise (d = 0.99 for high-information feedback against 0.24 for reward or
   punishment alone).
3. **Student clarity.** A To-do with Assigned, Missing and Done, grouped by week (Google
   Classroom); progress rings and checkmarks per unit (Canvas module requirements, Moodle
   5.2, goal-gradient evidence); the rubric visible before starting (Brookhart); weekly
   missing-work digests (27% fewer course failures in a J-PAL trial).
4. **The notebook actually getting used.** Every source that works puts the notebook page
   inside the assignment or the class day (OneNote Class Notebook on the Teams assignment
   card, LabArchives assignment entries), creates the day's entry for the student (Notion
   repeating templates), prompts per lesson (Learning by Design), makes photo capture one
   step with auto edge detection (Adobe Scan, ML Kit), and gives the teacher an approve-all
   queue with one specific next-step comment instead of a checkmark (Seesaw, Hattie and
   Timperley). Checkmark-only notebook feedback produced no growth (ERIC ED465806).
5. **Density and speed.** Response under 100 ms feels instant (NN/g). Linear, Gmail and
   Google Chat ship compact density for users who want more on screen. A command palette on
   one shortcut with prefixes (GitHub, Superhuman). List plus detail with a persistent
   selection (Apple HIG). Shortcuts stay optional and are revealed in tooltips (NN/g).
6. **A light theme for the projector.** Real classroom projectors deliver a fraction of
   their spec contrast (300:1 ANSI typical; rooms "rarely above 100:1"; about 40:1 with the
   lights on). In that range a dark theme's surfaces, accents and secondary text collapse
   while body text survives; a light theme holds its structure. The brand green `#78b870`
   is 2.24:1 on a near-white panel and can never be text or a thin line on light. Glow has
   no light-mode equivalent. The theme must be applied before first paint.

---

## Part A. The digital classroom field

### A1. Google Classroom (2025-2026)

- **To review page.** One page across all classes: turned in, graded or returned, a
  "Recently due" module (up to 5 assignments from the past week), a class filter, and a
  checkmark that marks an assignment reviewed. A per-student view filters by Turned in,
  Returned with grade, or Missing, and the summary can be emailed to the student and
  guardians. [https://support.google.com/edu/classroom/answer/9157286?hl=en]
- **Student To-do.** Three tabs, Assigned, Missing, Done, grouped by No due date, This week,
  Next week and Later, with a class filter.
  [https://support.google.com/edu/classroom/answer/6020284?hl=en&co=GENIE.Platform%3DDesktop]
- **Comment bank.** Typing `#` shows the 5 most-used comments; `#` plus a keyword searches.
  The bank follows the teacher across classes. Private comments accept text, audio, video
  and screen recordings. [https://support.google.com/edu/classroom/answer/9093530?hl=en]
- **Rubrics.** Up to 50 criteria and 10 levels, reusable across classes, export and import
  through Sheets, scored or unscored.
  [https://support.google.com/edu/classroom/answer/9335069?hl=en&co=GENIE.Platform%3DDesktop]
- **AI suggested feedback.** "Help me write" drafts a private comment from the student's own
  submission; the teacher must review and edit before it is shared. Rollout finished
  2026-03-30.
  [https://workspaceupdates.googleblog.com/2026/02/educators-now-get-help-drafting-personalized-guidance-on-written-assignments-with-AI.html]
- **BETT 2026.** A revamped homepage dashboard with class insights, audio, video and screen
  recording for assignments and feedback, standards tagging with progress tracking.
  [https://blog.google/products-and-platforms/products/education/bett-2026-gemini-classroom-updates/]
- **Student groups.** Email a group, sort student work by group when grading, edit groups
  while creating an assignment.
  [https://workspaceupdates.googleblog.com/2025/04/new-student-group-capabilities-google-classroom.html]
- **Reuse post.** Copies a post into the same or another class, with fresh copies of
  attachments; the reused rubric is independent of the original.
  [https://support.google.com/edu/classroom/answer/6272593?hl=en&co=GENIE.Platform%3DAndroid]
- **Guardian summaries.** Daily or weekly emails of Missing work, Upcoming work and Class
  activity, excluding grades. [https://support.google.com/edu/classroom/answer/6386354?hl=en]
- **Complaints.** A weak gradebook with no overall course grade, sync delays, too many
  notifications [https://capterra.com/p/186631/Google-Classroom/reviews/]; "I wish I could
  pick settings for how I like to grade and have them set as default"
  [https://www.trustradius.com/products/google-classroom/reviews]. Alice Keeler: the Stream
  "is NOT your class website", because new posts push announcements down; she links students
  to Classwork organized by Topics and numbers items.
  [https://alicekeeler.com/2020/08/04/using-the-stream-on-google-classroom/]

### A2. Canvas LMS

- **What makes SpeedGrader fast.** `j`/`k` next and previous student, `c` comment, `g` grade,
  `r` rubric, only while the grading panel has focus
  [https://ctl.cedarville.edu/wp/speeding-up-grading-with-the-speedgrader-keyboard-shortcuts/];
  `Shift+?` lists every shortcut, clicking a rubric level auto-calculates, a progress bar and
  checkmarks show what is done, filters show what remains, anonymous grading shows
  "Student 1".
  [https://www.instructure.com/en-au/resources/blog/top-tips-10-speedgrader-questions-you-might-be-asking]
- **Comment library** suggests saved comments as you type and belongs to the instructor
  across courses. [https://teaching.pitt.edu/featured/canvas-update-speedgrader-comment-library/]
- **2025 changes.** SpeedGrader rebuilt for faster loads (June 2025); student submission
  progress tracker, drafts, and a confetti animation on on-time submission (May 2025).
  [https://oit.colorado.edu/services/teaching-learning-applications/canvas/enhancements-integrations/new-notable-updates]
  Scheduled feedback sets when grades and comments become visible (December 2025).
  [https://gocanvas.stanford.edu/news/canvas-update-fall-2025]
- **Module requirements.** View, mark as done, contribute, submit, score at least. Students
  see a green check per item and per module; the teacher has "View Progress".
  [https://blog.uwgb.edu/catl/canvas-module-requirements/]
- **Dashboard.** Card, List and Recent Activity views plus a "To Do and Coming Up" sidebar.
  [https://its.gmu.edu/knowledge-base/canvas-dashboard-as-a-student/] Canvas for Elementary's
  Schedule tab is a day-at-a-glance planner including missing work.
  [https://www.instructure.com/resources/blog/canvas-elementary-supporting-young-learners-every-day]
- **Smart Search (Fall 2025)** is mostly keyword, off by default, and reviewers call it
  unpolished. [https://edtech.unc.edu/2025/08/new-in-canvas-smart-search/]
- **April 2026.** Instructure announced updates to "more than 20 key Canvas workflows,
  including course dashboards... course navigation and grading".
  [https://www.instructure.com/press-release/instructure-introduces-simplified-canvas-tiers-and-ecosystem-updates-new-next]

### A3. Each tool's single best idea for the teacher at the front

- **Pear Deck: the dashboard is separate from the projector.** Scrolling the dashboard is
  private; responses show on the projector anonymously by default; the teacher stars which
  to show; a press-and-hold lock timer counts down. [https://help.peardeck.com/en/the-teacher-dashboard]
- **Formative.** A live grid of students by questions colored by score, gray where it needs
  manual grading; clicking a cell opens a side panel; several students scored with one
  click; the 3 most recent feedback messages offered for reuse
  [https://help.formative.com/en/articles/6198532-view-and-score-responses]; a green dot
  shows active work [https://help.formative.com/en/articles/6023282-live-presence-indicator];
  teacher-paced mode hides names and shuffles responses when projecting and moves the remote
  to a phone by QR code.
  [https://help.formative.com/en/articles/5321202-teacher-paced-mode-present-a-formative]
- **Nearpod.** Share student answers anonymously to highlight a strong example or a
  misconception. [https://nearpod.com/blog/monitoring-student-progress-formative-assessment/]
- **GoGuardian Teacher.** A tile grid of live screens sortable by status or name
  [https://docs.goguardian.com/products/teacher/active-screens-view]; "Student may be idle"
  after **10 minutes** with no input, with a duration counter.
  [https://docs.goguardian.com/products/teacher/student-may-be-idle]
- **Kami Class View.** Student documents in columns, pages as rows, updating live, sortable,
  "Return All". [https://help.kamiapp.com/en/articles/6264795-how-to-use-class-view-with-google-classroom]
- **Brightspace Quick Eval.** Everything needing grading in one list across courses, by
  activity or by student [https://help.intech.arizona.edu/article/514-quick-eval]. Its users'
  complaint is a spec: "3 clicks and waiting 3 times" per student, and a wish for "a non-stop
  carousel of things that need to be marked".
  [https://community.d2l.com/brightspace/discussion/6160/grading-is-very-slow-in-brightspace]
  Intelligent Agents send rule-triggered emails ("not accessed course for 5 days").
  [https://www.tudelft.nl/en/teaching-support/educational-tools/brightspace/collaboration-communication/automate-e-mail-with-intelligent-agents-use-cases]
- **Moodle 4 and 5.** A collapsible course-index drawer showing completion and where you
  are [https://moodle.com/news/find-your-way-around-moodle-4-0/]; 5.2 puts activity dates
  under the title, keeps "Mark as complete" fixed in the header, and **explains why a locked
  item is locked**. [https://pimenko.com/en/moodle-5-2-new-features-2026/]
- **Schoology Workload Planning.** Each student's daily load as a yellow, orange or red
  percentage; teachers use it to avoid stacking tests.
  [https://nhsroar.com/2983/news/schoology-offers-a-workload-planning-page/]
- **Teams Insights.** Inactive students, activity timing, grade trends.
  [https://support.microsoft.com/en-us/education/insights/class-overview-page-in-insights]
- **Seesaw.** A review queue with "Approve All" per class or activity.
  [https://help.seesaw.me/hc/en-us/articles/27160258738957-How-to-approve-posts-individually-and-in-bulk]
- **Google Class Tools (ChromeOS).** Mirror a student's screen to the display with live
  annotation. [https://support.google.com/chrome/a/answer/16059946?hl=en]

### A4. Teacher workflow research

- Teachers report about 9.9 hours a week grading in a vendor-commissioned survey of 258
  (January 2025) [https://learnosity.com/edtech-blog/a-third-of-us-teachers-considered-leaving-education-in-last-12-months-due-to-grading-workload/];
  EdWeek's median is 5 hours a week of a 54-hour week.
  [https://www.edweek.org/teaching-learning/how-teachers-spend-their-time-a-breakdown/2022/04]
- A meta-analysis of 435 studies: d = 0.48 overall; high-information feedback (task,
  process, self-regulation) **d = 0.99**; reward or punishment alone d = 0.24.
  [https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2019.03087/full]
- In classroom studies immediate feedback usually beats delayed.
  [https://journals.sagepub.com/doi/10.3102/00346543058001079] Withholding the mark until the
  feedback is read improved later performance in two experiments
  [https://eric.ed.gov/?id=EJ1314798]; Butler's comments-over-grades advantage held only for
  the bottom quarter, per Guskey.
  [https://www.edweek.org/education/opinion-grades-versus-comments-what-does-the-research-really-tell-us/2019/06]
- Students do not use feedback they cannot parse; feedback must be usable.
  [https://eric.ed.gov/?id=EJ995173]
- Students mostly preferred audio feedback, used for global issues while text handles line
  level. [https://jolt.merlot.org/vol10no1/cavanaugh_0314.pdf]
- Rubrics work through descriptive rather than evaluative level language; only 56% of
  studies shared the rubric with students (Brookhart).
  [https://frontiersin.org/journals/education/articles/10.3389/feduc.2018.00022/full]
- Keyboard accelerators must stay optional and be revealed in tooltips and menus.
  [https://www.nngroup.com/articles/ui-accelerators/]

### A5. What gets students to do the work

- Weekly texts to parents about missed work cut course failures 27%; high school students
  missed 26% fewer assignments.
  [https://www.povertyactionlab.org/evaluation/sending-text-messages-parents-improve-student-achievement-middle-and-high-schools-united]
- Push reminders for imminent missing work raised submissions 3.7 to 5.7%.
  [https://www.academia.edu/96853374/Automated_Educative_Nudges_to_Reduce_Missed_Assignments_in_College]
- One-time nudges fade; "not a silver bullet".
  [https://news.cornell.edu/stories/2020/06/study-no-single-solution-helps-all-students-complete-moocs]
- A randomized trial of 60,000 grade 4 to 6 students: streak messages raised weekly returns
  9.4 points, no discouragement when a streak broke.
  [https://www.ipr.northwestern.edu/documents/working-papers/2026/wp-26-05.pdf]
- Gamification effects g = 0.49 cognitive, 0.36 motivational, 0.25 behavioral; narrative
  plus collaboration helped [https://eric.ed.gov/?id=EJ1245270]. Badges and leaderboards
  lowered intrinsic motivation and exam scores in one 16-week course.
  [https://www.sciencedirect.com/science/article/abs/pii/S0360131514002000]
- Visible progress speeds completion (goal-gradient: 10 days against 15).
  [https://business.columbia.edu/insights/chazen-global-insights/goal-gradient-hypothesis-resurrected-purchase-acceleration]
- Phones are for checking; laptops for substantive work.
  [https://er.educause.edu/articles/2023/1/the-evolving-landscape-of-students-mobile-learning-practices-in-higher-education]
- Teens have low patience, dislike dense text and small fonts.
  [https://www.nngroup.com/articles/usability-of-websites-for-teenagers/]

### A6. Projector and classroom-display modes

- ClassroomScreen has 26 widgets; screens can be saved for future weeks.
  [https://classroomscreen.com/widgets] In its teacher profiles, time widgets dominate daily
  use (timer, clock, stopwatch used by all five), then the randomizer, text and timetable.
  [https://classroomscreen.com/blog/teaching-around-the-world-with-classroomscreen]
- "Warm" random call (discuss first, then pick) raised perceived participation and made
  students 2.65x less likely to report interfering anxiety.
  [https://par.nsf.gov/servlets/purl/10482726]
- Text at least 1/50 of screen height when the back row is within 8 screen heights (8H rule).
  [https://presentationguild.org/how-big-big-enough-the-8h-rule-reveals-all/]
- No evidence was found that noise meters work.

### A7. Density, speed and keyboard-first design

- 0.1 s feels instant, 1 s keeps the flow of thought, 10 s loses attention.
  [https://www.nngroup.com/articles/response-times-3-important-limits/]
- Linear's redesign aimed to "reduce visual noise, maintain visual alignment, and increase
  the hierarchy and density of navigation elements".
  [https://linear.app/now/how-we-redesigned-the-linear-ui]
- Gmail's Comfortable, Cozy, Compact exist because some users "wanted to see as much
  information as possible without scrolling".
  [https://groups.google.com/g/gmail-blog-posts/c/CTvQcH69O-I]
- Command palette: one shortcut everywhere, every action, fuzzy matching with synonyms,
  context-aware ranking [https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/];
  GitHub scopes it to where you are with prefixes `#`, `@`, `/`, `>`.
  [https://docs.github.com/en/get-started/accessibility/github-command-palette]
- Tables: freeze headers, human-readable first column, non-modal side panels for editing,
  batch checkboxes; tables beat cards for comparison.
  [https://www.nngroup.com/articles/data-tables/]
- Split views keep a persistent selection highlight.
  [https://developer.apple.com/design/human-interface-guidelines/split-views]

### A8. Accessibility and devices

- WCAG 2.2 SC 2.5.8 (AA): targets at least 24x24 CSS px; 2.5.5 (AAA) 44x44 for important
  controls. [https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html] This
  matches the repo's decision 09.
- WCAG 2.2 AA also adds 2.4.11 Focus Not Obscured (sticky headers must not cover focus) and
  2.5.7 Dragging Movements (every drag needs a single-pointer alternative).
  [https://www.wcag22aa.org/new-criteria/]
- Budget education laptops still ship 1366x768 (Lenovo 100e Gen 4, Dell 3120 2-in-1)
  [https://psref.lenovo.com/syspool/Sys/PDF/Lenovo/Lenovo_100e_Chromebook_Gen_4_Intel/Lenovo_100e_Chromebook_Gen_4_Intel_Spec.pdf]
  [https://www.shi.com/product/49736896/Dell-Chromebook-3120-2in1-(2024)]; ChromeOS scales a
  1920x1080 panel to 1536x864 by default. [https://chromeos.dev/en/games/optimizing-games-display]
  **[inference]** about 1366x650 usable once browser chrome is removed. Bosco Tech's own
  fleet is unknown; measure 1366x768 anyway.

---

## Part B. The notebook

### B1. Engineering notebook practice

- FTC judges score a 15-page portfolio, read after the interview in a 10-minute gap, and
  follow no links. [https://ftc-resources.firstinspires.org/ftc/archive/2026/event/judging-guide]
  The portfolio is assembled from the in-season record: "the photos, the meeting notes, the
  CAD progression, the build journal." [https://fc-robotics.org/right-brain/the-engineering-portfolio-path/]
  Explain "why previous iterations didn't work"; "Less is more".
  [https://gm0.org/en/latest/docs/awards/portfolio.html]
- **FRC has no notebook requirement.** Technical awards are judged by pit interview; only
  Impact, Leadership and Woodie Flowers take written submissions. A notebook's FRC value is
  interview preparation and Impact material. [https://www.firstinspires.org/resources/library/frc/awards]
- RECF (VEX) judges read 10 to 20 minutes per notebook; pages numbered or dated; teams
  "should not edit or replace old entries".
  [https://kb.roboticseducation.org/hc/en-us/articles/4969763478167-Guide-to-Judging-Judging-Engineering-Notebooks]
  RECF bans AI tools "to generate or organize notebook content".
  [https://v5rc-kb.recf.org/hc/en-us/articles/24078456872343-Engineering-Notebook-Purpose-Academic-Honesty]
- VEX: "Short, consistent entries can be more useful than long entries written after the
  fact"; "The best format is the one students can use consistently."
  [https://kb.vex.com/hc/en-us/articles/49010276056596-Getting-Started-with-Engineering-Notebooks]
- **Structured prompts beat blank pages.** Learning by Design found students did not use
  information "unless they were explicitly asked to"; prompted diaries moved solutions "from
  the 'ridiculous' to the 'realistic.'" [https://sites.cc.gatech.edu/projects/lbd/htmlpubs/ddtoolsupport.html]
- Journal content predicts design quality: in 67 capstone journals, time on problem
  definition correlated with better outcomes
  [https://iced.designsociety.org/download-publication/25476/From+Journals+to+Validated+Tool:+Results+of+Empirical+Research+on+Student+Designers];
  journals were 15% of the grade with periodic rubric feedback.
  [https://www.montana.edu/dsobek/career/documents/ASEE04_1331.pdf] Experts spend far more
  time problem scoping (Atman).
  [https://www.academia.edu/290635/Engineering_Design_Processes_A_Comparison_of_Students_and_Expert_Practitioners]

### B2. Products, the mechanic that gets each used, and the complaints

- **OneNote Class Notebook.** A distributed page gives "each student... a copy", attached to
  the Teams assignment card, graded inside Teams.
  [https://support.microsoft.com/en-us/education/onenote/use-onenote-class-notebook-in-teams]
  Complaint: pages auto-lock at turn-in with no setting, and teachers call unlocking "a pain".
  [https://learn.microsoft.com/en-my/answers/questions/5579981/how-can-i-turn-off-automatic-page-locking-of-oneno]
- **Seesaw.** Capture in any medium straight into a journal
  [https://www.commonsense.org/education/articles/teachers-essential-guide-to-seesaw]; a
  teacher approval queue with Approve All
  [https://help.seesaw.me/hc/en-us/articles/27160258738957-How-to-approve-posts-individually-and-in-bulk];
  adding a library photo still takes about 5 taps.
  [https://help.seesaw.me/hc/en-us/articles/10008570303757-How-do-Students-add-photos-and-videos-to-Seesaw]
- **Google Classroom "make a copy for each student".** The copy disconnects from the
  original, so a template fix never reaches students who opened it.
  [https://alicekeeler.com/2015/07/20/google-classroom-make-a-copy-for-each-student/]
- **LabArchives Education.** An Assignment entry on the course notebook page, an Assignment
  Navigator filtered by Assigned, Submitted, Graded.
  [https://help.labarchives.com/hc/en-us/articles/11785793623956-Quick-Start-Guide-for-Instructors-using-Education-Edition]
  A student on why it stuck: "I don't have to print and tape manually into my notebook
  anymore." [https://news.wisc.edu/researchers-embrace-and-reap-benefits-of-electronic-lab-notebooks/]
- **Onshape Education.** Every submission auto-creates a version the teacher views "exactly
  as it existed at the time of submission"; Needs Revision notifies the student; counts of
  started and submitted at a glance.
  [https://www.onshape.com/en/blog/education-feature-classes-assignments] Compare shows two
  versions side by side. [https://cad.onshape.com/help/Content/Document/compare.htm]
- **Notion.** Repeating templates auto-create a daily entry.
  [https://www.notion.com/help/guides/automate-work-repeating-database-templates]
- **Georgia Tech's Engineering Design Log** failed: 8th graders averaged below 1 of 3,
  Iterate 0.05; teachers said "log usage is not intuitive" and moving images from CAD
  "required multiple steps."
  [https://ampitup.gatech.edu/sites/default/files/publications/engineering_design_log_final_20161.pdf]

### B3. Capture friction and habit

- Adobe Scan defaults to auto-capture with live edge detection.
  [https://www.adobe.com/devnet-docs/adobescan/android/en/scan.html] ML Kit's document
  scanner does automatic capture, crop and shadow removal on device.
  [https://developers.google.com/ml-kit/vision/doc-scanner]
- In the browser: jscanify (open-source JavaScript scanner)
  [https://github.com/puffinsoft/jscanify] and OpenCV.js edge detection and perspective
  correction [https://www.dynamsoft.com/codepool/web-document-scanner-with-opencvjs.html].
- Offline capture: queue images in IndexedDB, retry, show stored, waiting, uploaded badges.
  [https://www.smashingmagazine.com/2025/04/building-offline-friendly-image-upload-system/]
- Fogg: "Behavior happens when Motivation, Ability, and a Prompt come together at the same
  time." [https://behaviormodel.org/] **[inference]** A notebook unused for weeks is missing a
  prompt (nothing in class triggers it) and ability (too many steps), not only motivation.
- Habits take weeks to months (Lally 2010, secondary summaries).
  [https://www.thebehavioralscientist.com/articles/how-long-to-form-a-habit]
- Audio reflection "relieves the paralyzing fear of spelling errors."
  [https://www.facultyfocus.com/articles/effective-teaching-strategies/audio-reflection-assignments-help-students-develop-metacognitive-skills/]

### B4. Where the notebook lives relative to assignments

- The embedded-page model beats a separate app (OneNote on the assignment card; LabArchives
  entry on the page). In Canvas ePortfolios "There is no way to control when students add
  content", so they are "not appropriate for summative/contributory assignments."
  [https://blogs.sussex.ac.uk/tel/2021/07/20/canvas-eportfolios/]
- Two tiers: an internal process record, and a curated public portfolio the student selects
  from it. [https://www.edutopia.org/article/tools-creating-digital-student-portfolios/]
- Templates made a digital science notebook work: "The only reason it worked is because we
  formatted those pages ahead of time."
  [https://citejournal.org/volume-19/issue-3-19/science/using-digital-science-notebooks-to-support-elementary-student-learning-lessons-and-perspectives-from-a-fifth-grade-science-classroom/]
- Grade while circulating: "I don't have stacks of notebooks to go through after school."
  [https://thesciencepenguin.com/2014/11/time-saving-notebook-tip-for-you.html]
- Public sharing drives quality (Learning by Design gallery walks).
  [https://sites.cc.gatech.edu/projects/lbd/popups/gallerywalk.html]

### B5. Grading notebooks

- Only 4 of 10 teachers gave any notebook feedback, as "a grade, checkmark, or a code
  phrase"; student understanding "did not improve". [https://eric.ed.gov/?id=ED465806]
- Feedback averages effect size 0.79; the three questions are "Where am I going? How am I
  going? Where to next?" [https://assess.ucr.edu/sites/default/files/2019-02/hattietimperley_2007.pdf]
- Recurring judged criteria: dated sequential entries never rewritten; the design process
  repeated with justification; iterations with the reason each failed; goals, tests and
  results; decisions with rationale and next steps. (RECF, Purdue SIGBots wiki, gm0, VEX, as
  cited above.)
- Process over product (UW Engineering Design Notebook rubric).
  [https://centerforneurotech.uw.edu/education/undergraduate/engineering-design-notebook/]
- The single-point rubric forces specific problem areas and areas of excellence.
  [https://www.cultofpedagogy.com/single-point-rubric/]

### B6. Mechanics to borrow

- Today's entry created automatically per class day (Notion).
- Prompts tied to the day's lesson (Learning by Design).
- Auto-capture scanning with edge detection as the default, not a manual shutter.
- Evidence attached where it is needed: the notebook page lives on the assignment.
- Timeline of a project and side-by-side iterations (Onshape versions and Compare).
- Project a student's page anonymously (Desmos snapshots and anonymize).
  [https://blog.desmos.com/articles/collections-and-snapshots/]
  [https://blog.desmos.com/articles/anonymize-the-dashboard/]
- Combine starred pages into one PDF (Book Creator combine; RECF accepts digital notebooks
  as PDFs under 250 MB).

---

## Part C. A light "space console" theme and the projector

### C1. Visual references

- Real spacecraft UIs are mostly dark (Crew Dragon uses Lato on dark panes)
  [https://uxdesign.cc/how-i-recreated-crew-dragons-ui-15877eddf3ed]; they are references
  for density, not for ground color.
- NASA's crew display standard (HIDH Appendix F): character contrast 6:1 or greater, 10:1
  preferred; sans serif; fixed-width for numeric and tabular data; distinguishable l/1 and
  O/0; red emergency, yellow caution, blue advisory; color always has a redundant cue; reverse
  video and flashing reserved for events needing immediate action. No background polarity is
  specified. [https://www.nasa.gov/reference/appendix-f-vol-2/]
- **Oblivion** (Kosinski, GMUNK) is the canonical light sci-fi UI: "simpler, more elegant";
  a "bright, unified color palette"; "the Greeble under control" (decoration capped)
  [https://www.awn.com/vfxworld/crushing-the-user-interface-designs-of-oblivion]
  [https://gmunk.com/OBLIVION-GFX]; thin line work, refined type, subtle accents and a dot
  grid to hang elements on. [https://www.hudsandguis.com/home/2013/05/02/oblivion-interface-design]
- 2001: A Space Odyssey assigns one typeface per job (Eurostile, Futura, a monospaced
  telemetry face). [https://typesetinthefuture.com/2014/01/31/2001-a-space-odyssey/]
- Teenage Engineering: five colors, one orange action accent, monospace uppercase labels at
  0.12em tracking above the value, 1px cell gaps, no radius or shadow softening
  [https://blakecrosley.com/guides/design/teenage-engineering]. Nothing OS: black, white, red,
  dot matrix [https://www.androidauthority.com/nothing-os-3-hands-on-3488739/]. Braun:
  neutral grounds, color only to mark function.
  [https://www.aesdes.org/2023/01/31/aesthetic-exploration-the-braun-style/]
- visionOS glass flattens to gray on a projector; do not use translucency as structure.
  [https://www.createwithswift.com/ensuring-interface-legibility-and-contrast-in-visionos/]
- **Traits to carry**: cool neutral grounds, one hot functional accent, color reserved for
  meaning, mono uppercase micro-labels above values, a visible grid with registration or
  corner marks used sparingly, a small fixed set of typefaces each with one job, decoration
  capped.

### C2. Projector legibility

- Dark text on a light ground serves best in well-lit rooms (Tufte forum).
  [https://www.edwardtufte.com/notebook/recommended-background-for-projected-presentations/]
- Typical ANSI contrast 300:1 average; one projector measured 20,000:1 on/off but 2,000:1
  ANSI; an EXIT sign can cut effective contrast 50%.
  [https://www.projectorcentral.com/projector-contrast-ratio.htm] Real rooms are "rarely above
  100:1", about 40:1 with lights on.
  [https://officinaacustica.com/knowledge/best-practice-how-bright-should-my-projected-image-be]
  ANSI/INFOCOMM 3M-2011 sets 15:1 system contrast for basic decision making and 50:1 for
  analytical content. [https://ravepubs.com/infocomm-designing-for-high-contrast-how-one-university-uses-infocomms-projected-image-standard/]
- **Washout model (researcher's own, stated as a model):** a 300:1 projector with ambient
  light equal to 10% of white added to every pixel. Dark theme: bone on graphite 8.6:1 (body
  text survives), ground against a `#161a18` panel 1.06:1 (panels vanish), green `#78b870` on
  ground 4.65:1, dim text 3.5:1. Light theme `#0D1311` on `#F7F9F9`: 9.6:1, and surface steps
  hold. **The benefit is surfaces, accents and secondary text, not body text.**
- Single-chip DLP color light output can be about 22% of white, so colored fills project
  darker and muddier; carry color in dark ink rather than bright tints.
  [https://www.projectorcentral.com/lcd-dlp-color-light-output.htm?page=Concluding-Thoughts]
- Projected pale greens turn chartreuse and yellows turn brown; avoid red-green pairings.
  [https://edgeforscholars.vumc.org/optimizing-colors-for-projected-presentations/]
- Thin lines lose contrast to anti-aliasing (W3C); a 1px hairline at 1.6:1 carries no
  meaning on a projector. Any boundary that matters needs 3:1 and 1.5 to 2px.
  [https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html]
- Minimum 24pt for projected text (ARL) [https://www.arl.org/accessibility-guidelines-for-powerpoint-presentations/];
  AVIXA DISCAS basic decision making: smallest critical glyph about 2.5% of image height, about
  27px at 1080 lines (researcher's derivation from
  [https://www.avixa.org/resources/display-image-size-calculators/learn-more-about-display-size]).
- Color vision: Okabe-Ito, never red against green alone, always a second cue.
  [https://jfly.uni-koeln.de/color/]

### C3. Light themes in mature design systems

- Material 3: the accent gets darker on light (primary tone 40 on light, 80 on dark), with
  paired on-colors and five surface-container levels. [https://material-web.dev/theming/color/]
  [https://github.com/material-foundation/material-color-utilities/blob/main/typescript/scheme/scheme.ts]
- Radix 12-step scales: 1 to 2 backgrounds, 3 to 5 component states, 6 to 8 borders, 9 to 10
  solid fills, 11 to 12 text. [https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale]
- Primer: functional tokens (bgColor, fgColor, borderColor with default, muted, emphasis);
  light and dark share functional names. [https://primer.style/foundations/color/overview]
- Carbon: White and Gray 10 themes; elevation by alternating layers rather than shadows;
  text `#161616`, `#525252`; border-subtle `#c6c6c6`, border-strong `#8d8d8d`.
  [https://carbondesignsystem.com/elements/color/overview/] [https://carbondesignsystem.com/elements/color/tokens/]
- **Glow has no light-mode equivalent.** Replace it with a 2px solid ink border, a tinted
  container, or an inset bar.
- Focus on light: a solid dark ring at 3:1 against both component and ground; 2px perimeter.
  [https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html]

### C4. Theme switching

- Saved choice first, then the default; set before first paint to avoid a flash of the wrong
  theme. [https://www.joshwcomeau.com/react/dark-mode/]
- In SvelteKit, a cookie read in `hooks.server` with `transformPageChunk` rewriting a
  placeholder in `app.html` sends correct HTML from the server.
  [https://scriptraccoon.dev/blog/darkmode-toggle-sveltekit]
  [https://scottspence.com/posts/cookie-based-theme-selection-in-sveltekit-with-daisyui]
- `prefers-color-scheme` describes the teacher's laptop, not the room; the projector choice
  must be explicit. [https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme]
- **[inference]** Per device, reachable in one tap while projecting, applied instantly.

### C5. A starting palette (researcher's proposal, to be measured, not copied)

Cool gray grounds with a faint green cast, not warm paper. WCAG ratios as computed by the
researcher.

| Role | Hex | vs page | vs panel |
|---|---|---|---|
| page | `#E8ECEB` | | 1.13 |
| panel | `#F7F9F9` | 1.13 | |
| raised | `#FFFFFF` (see note) | | |
| inset | `#DCE2E0` | | |
| text-1 | `#0D1311` | 15.76 | 17.77 |
| text-2 | `#384340` | 8.62 | 9.72 |
| text-3 | `#56625E` | 5.34 | 6.01 |
| hairline, decorative only | `#BFC9C5` | 1.42 | 1.61 |
| boundary, load-bearing | `#6F7C78` | 3.65 | 4.11 |
| green ink (text, icons, selected) | `#2E6A29` | 5.49 | 6.19 |
| green fill (buttons, white label 4.83) | `#37812F` | 4.06 | 4.58 |
| brand green, large fields only | `#78B870` | 1.98 | 2.24 |
| success | `#1D6E34` | 5.29 | 5.96 |
| warning text | `#8A5300` | 5.31 | 5.99 |
| danger / live | `#B8141F` | 5.58 | 6.29 |
| info | `#1A56A8` | 6.00 | 6.76 |
| hot signal | `#B53A00` | 4.94 | 5.57 |

Notes: page against panel is only 1.13, so **surfaces are separated by the boundary line,
not by fill alone**. The repo's `CLAUDE.md` says never pure white `#FFFFFF`, so "raised" must
be a near-white unless that rule is amended with a reason. Hot signal and danger sit close in
luminance and hue: hot is reserved for "now / you are here", and danger always carries a glyph
and a word.

---

## Ranked moves, all three passes combined

For the teacher at the front (T), the student (S), or both (B).

1. **Notebook inside the class and inside each assignment, never a separate app.** (B)
2. **Photo capture in one step that lands in the right place and uploads immediately,**
   with edge detection by default and an offline queue with visible status. (S)
3. **A grading carousel:** save moves to the next ungraded work, then the next assignment,
   with no return to a menu. (T)
4. **One "needs attention" queue** across sections and classes: ungraded work, resubmissions,
   new notebook entries, flagged items, missing work. (T)
5. **A live students-by-work grid** for the current item: not started, working, idle, stuck,
   done, needs grading; idle after a fixed threshold. (T)
6. **A projector view separate from the teacher's control view,** showing the day's agenda,
   a large clock and timer, and starred anonymized student work. (T)
7. **A Space White theme applied before first paint,** reachable in one tap while
   projecting, with brand green darkened to ink and structure carried by load-bearing lines.
   (B)
8. **Student To-do with Assigned, Missing, Done,** grouped by week, inside the classroom. (S)
9. **A comment bank on `#`** with the most-used comments first and comments attached to
   rubric levels. (T)
10. **One command registry feeding a Cmd-K palette,** shortcuts, menus and tooltips, scoped
    to the current class with prefixes. (T)
11. **Today's notebook entry created automatically per class day,** carrying the day's prompts.
    (S)
12. **An approve-all notebook review queue** with one specific next-step comment instead of
    a checkmark. (T)
13. **Unit progress with item checkmarks,** and a sentence explaining any lock. (S)
14. **Rubric visible to the student before starting.** (S)
15. **Instructor density (compact) on teacher-only surfaces, declared by a named class,**
    with students held at 44px. (T)
16. **Optimistic saves under 100 ms and prefetch of the next item.** (B)
17. **Every student surface built and measured at 1366x768.** (S)
18. **Warm random picker and a presence-driven group maker,** only present students eligible.
    (T)
19. **Project timeline and side-by-side iterations** built from notebook entries and hand-ins.
    (S)
20. **Starred-entry portfolio PDF** (FTC 15-page shape; FRC interview prep). (S)
21. **Release feedback before the grade,** or on a schedule. (S)
22. **Audio comments** for the big picture, text for line level. (B)
23. **Individual streaks for notebook entries,** no public leaderboard. (S)
24. **Reuse a post into another section with scheduled publish.** (T)
25. **A due-date clash view when scheduling.** (T)

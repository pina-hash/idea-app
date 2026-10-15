# IDEA Certification Portal Spec

Approved by Mr. Pina on 2026-10-15. This is the build authority for the portal. The
working copy he reviewed is the Claude Doc "IDEA Certification Portal Spec"
(https://claude.ai/code/artifact/f5ca2062-c5e7-40d1-83f0-761d95f8b9a3); from this commit on,
changes land HERE first. Decisions were made in the scoping chat of 2026-10-14 and 2026-10-15,
in Mr. Pina's words where quoted.

## Purpose and guiding principles

The IDEA Certification Portal issues official IDEA certifications: proof that a student can perform a named skill alone, with zero outside help. It is open to any Bosco Tech student, on the robotics team or not.

1. **A certification means zero help.** The holder can do everything it names, alone. The final proof is done cold.
2. **Each certification is an automated learning environment.** A student picks it, starts it and moves through it self-guided. Mr. Pina only touches what a machine cannot judge: grading projects, proctoring the exam and watching checkouts.
3. **Automated to earn, never watered down.** Automation removes busywork, never rigor. The exam stays at 100% and projects are really judged.
4. **Maximum weight.** The certificate is beautiful and technically real. Every number on it resolves to a live, signed record.
5. **The admin controls everything from the portal.** Anything Mr. Pina would reasonably change is an edit button, never a GitHub push.
6. **Built to work with Claude.** Every certification exports as a package and re-imports. Every log and report exports in bulk for a Claude chat to read.
7. **Maximum telemetry.** The portal records everything it can and surfaces it on the dashboard.

## Where it lives and what it connects to

The portal lives at **ideabosco.com/certifications**. It is built inside `pina-hash/idea-app` but stands on its own: it is not a page inside IDEA Classroom.

- **Shared with the rest of idea-app:** the same Google sign-in, the same Supabase database, the existing YouTube helper (`src/lib/youtube.ts`), the HTML assignment engine (`src/lib/classroom/html-assignment/`), Web Push (`src/lib/server/push.ts`) and the Plate look in every theme.
- **Linked from:** a Certifications entry in the IDEA Classroom header and in the FRC app nav.
- **The one official record:** the portal's database. The FRC app receives a one-way, read-only copy (see FRC app mirror).
- **Who is who:** a person is their lowercase school Google sign-in email. idea-app derives role from the email domain: `@boscotech.net` is a student and `@boscotech.edu` is staff (migration 0001, read 2026-10-15).

## Roles and authority

At launch only Mr. Pina, as site admin, can check off requirements, proctor, review or award. Later he grants named people authority over specific certifications, one at a time.

| Role | Who | Can do |
| --- | --- | --- |
| Admin | Mr. Pina (idea-app `is_admin()`) | Everything: author, publish, hide, grade, proctor, award, suspend, revoke, correct, grant authority, export, import |
| Certifier | A named person Mr. Pina grants, per certification | For that certification only: proctor the exam, grade both projects, review the checkout, award. Granted as one whole power, not split into parts |
| Student | Any signed-in Bosco Tech account | Explore published certifications, start, withdraw, submit, request sittings, see their own full status, see the holders board |
| Public | Anyone, no sign-in | The verify-by-serial page only |

- **Nobody acts on their own record.** A certifier cannot grade, proctor or award their own attempt, and the server refuses it.
- **Grants can come long after earning.** A grant is set person by person, certification by certification, and can be removed.
- **No separate proctor certification exists.**
- **The server enforces every rule.** A hidden button is not a permission: every write checks the caller's authority in the database.

## The certification engine

The catalog is live data, not code: the admin adds, edits, hides, publishes and retires certifications in the portal, with no fixed count. The 35 codes in the catalog draft are starting content, not a limit, and the portal can launch with just one.

**What a certification holds, all editable in the portal:**

- Identity: code (for example `MILL-1`), name, level, category, sort order
- Meaning: definition, what it allows, what it does not allow
- Prerequisites: any other certifications, enforced by the portal
- Renewal: never expires (the default), or expires on the school-year date
- Requirement set: which parts it uses and in what order (see How a certification is earned)
- Learning kit: training content, quick checks, practice quiz, study guide, common mistakes
- Exam: topic list, question pool, questions drawn per sitting, time limit
- Guided project spec, autonomous project spec, checkout card and filming guide

**Lifecycle:** Draft, then Published, then Retired. A draft is invisible to students. Publishing requires a complete kit, including real training content: the portal refuses to publish one with any required part empty. Retiring stops new starts and keeps every existing award valid. A certification with holders is never deleted, only retired.

**Editing a published certification:** every save is a new revision with a full history. A student mid-attempt keeps the requirement set they started with, and new starts get the new one.

**Import and export, the Claude workflow:**

1. **Export** any certification as one ZIP: a `certification.json` manifest plus one file per kit part (exam pool, both project specs, study guide, practice quiz, checkout card, common mistakes, video links, any HTML lessons). It is structured, documented and readable by an AI.
2. Mr. Pina hands the ZIP to a Claude chat, which reads, critiques and refines it.
3. **Import** the refined ZIP from the portal. The portal validates it, shows a diff against the current version and imports only on his confirm. A new code creates a draft, and an existing code creates a new revision.
4. Nothing in this loop touches GitHub or needs a deploy.

The package format is versioned and documented in the repo, so a Claude chat can author a new certification from scratch in the same format.

## How a certification is earned

Every certification follows one fixed order, and each step unlocks only when the one before it is checked off. The order was settled 2026-10-14 and confirmed against a research brief (4C/ID, cognitive apprenticeship, mastery learning, FAA 14 CFR 61.39): guided training, then exam, then autonomous project, then checkout, then award.

1. **Start.** The student presses Start on a published certification whose prerequisites they hold. This starts their clock and puts them on the dashboard.
2. **Guided training project.** A hands-on, follow-along project that teaches the basic skills, with help that fades as it goes (see Learning kit). Ungraded quick checks run throughout. It is checked off when a certifier passes the guided deliverable.
3. **Exam.** In-app, locked down, proctored in person, 100% to pass (see The exam).
4. **Autonomous project.** A different project, objective only, zero help. Pass or fail, with written feedback (see Projects and checkout).
5. **Checkout.** The cold, no-help performance, in person or by unlisted video. **Optional per certification:** required where watching the process or safety matters (machining), skipped where the output is the whole proof (scouting, programming).
6. **Award.** Once every required part is checked, the award button lights up for an authorized certifier.

**Waivable parts.** All parts are on by default. The admin can waive the guided project, exam, autonomous project or checkout for a certification that genuinely does not need it, for example a simple one. The award is never waived.

**Prerequisites.** A certification can require any others, and the portal enforces them. Levels go in order: MILL-1 before MILL-2. The old rule that no Level 2 opens until every Level 1 is released is dropped, because prerequisites cover it.

**Renewal.** Most certifications never expire. SAFE-1 and RESP-1 expire on one fixed date at the start of each school year, set by the admin each year (for 2026-27 the first day of school was Aug 17, 2026). Holders retake them under the same steps, and the expired award stays in their history as Expired.

**Cooldown.** A failed exam locks that student out of the exam for that certification for **7 days**, automatically. Projects and checkouts have no cooldown: the student revises from feedback and resubmits.

**Withdraw and dormant.** A student can withdraw from a certification and restart later without penalty. Withdrawing keeps their history, and a restart starts a new attempt and a new clock. An attempt with no activity for a long period is marked **Dormant**: hidden from the main dashboard view and never deleted. The threshold is an admin setting, 60 days by default.

## Learning kit and watch tracking

Each certification's kit is the automated learning environment: everything a student needs to go from zero to ready with no instructor in the room. Any signed-in student can explore a published kit in full before starting.

| Part | What it is | Rules |
| --- | --- | --- |
| Training content | A single video, a video series, or interactive HTML lessons, in any mix | Required before publishing, SAFE-1 included. Videos are Mr. Pina's public YouTube uploads, played embedded. HTML lessons run in the existing HTML assignment engine. Hands-on: the student works at the machine or bench while learning |
| Faded guidance | Built into the guided project | Early steps are fully shown. Later steps give only the goal, with a hint behind a click. Help falls away so the student is working alone by the end |
| Quick checks | Short ungraded questions inside the training | Instant feedback, no grade. They exist for retrieval practice, not scoring |
| Practice quiz | An ungraded self-test | Its own question set, paraphrased from the real exam topics, never the real exam questions |
| Study guide | A professional, thorough document | Thorough enough that a student who masters it passes the exam easily |
| Common mistakes | Short warnings | Written by Mr. Pina from intuition, from what students actually get wrong, or both |
| Checkout card and filming guide | What the checkout demonstrates, and how to film it | Shown only where the certification uses a checkout |
| My checklist | The student's own live progress | Every part, done or pending |

**Video watch tracking.** "Training video watched" checks itself off, and only real watching counts:

- The player reports every second actually played. Seeking ahead does not count unplayed footage, and a video counts when its played seconds cover at least 95% of its length.
- Playback speed is capped at **2x**. Faster speeds are blocked, not just discounted.
- Random **Continue** check-ins pause the video. A check-in left unanswered for 60 seconds stops crediting time until the student returns.
- Progress is saved server-side as played ranges, so a student can stop and resume on any device.
- Every watch session is logged for telemetry: when, how long, speed and check-ins missed.

## The exam

The exam is taken in the portal, under lockdown, with Mr. Pina or a granted certifier physically in the same room. A score of 100% passes. Paper exams are dropped.

**Getting a seat.** There are two paths:

- **Request:** the student sends a digital request and the certifier approves it with a time.
- **Scheduled windows:** the admin posts recurring after-school certification windows, weekly for example, with a seat limit, and students sign up.

Either way the student must have finished the guided project and must not be in a cooldown.

**Releasing the exam.** A test cannot be opened at home. It only opens when the proctor, signed in on their own device, presses **Release** for that student at that sitting. The release expires if not used within 10 minutes.

**The question pool.**

- Each certification lists its required topics. Every question belongs to one topic.
- The pool holds roughly **twice** as many questions as one exam uses.
- Each sitting draws a fresh random set covering **every** topic, with at least the per-topic minimum the admin sets. No topic can be skipped by the shuffle.
- Question order and answer order are shuffled per student.
- Question types: multiple choice, multiple select, numeric with tolerance, and short exact answer.

**Lockdown.**

- One question at a time. No going back.
- The browser never holds the answer key. Answers are checked on the server only after submission, and the student's draw is stored server-side.
- Leaving the tab or window, losing focus, or leaving fullscreen is **logged with a timestamp** and shown live on the proctor's screen. The proctor decides what to do with a flag.
- Copy, paste, right-click and text selection are disabled on the exam screen.
- A time limit is set per certification.

**After submission.**

- **Pass:** the exam checks off. The graded attempt is kept: draw, answers and flags.
- **Fail:** the student sees which topics they missed, never which questions or the correct answers, so the pool stays secure. The 7-day cooldown starts.
- The proctor sees the full result, including every focus flag.

## Projects and checkout

Each certification has two different projects: a guided one that teaches and an autonomous one that proves. They are never the same task done twice. Both are graded pass or fail by a certifier, always with written, constructive feedback so the next attempt is better.

**Project format is open.** A project is whatever proves that skill. It could be a machined part to a drawing, a working program, a wired panel, a scouting report or a team-role deliverable. The admin defines each project as:

- An objective and spec: what to make or do and the acceptance criteria
- Attached references: drawings, starter files, links
- A self-inspection checklist the student completes before submitting
- An evidence list: what the student must submit

**Evidence.** Photos, files, text and links. Video evidence is only ever a YouTube link, so the portal stores no video.

**Guided project.** Faded guidance is built in (see Learning kit). Submission goes to the review queue. Pass checks it off. Fail returns it with feedback, and the student revises and resubmits with no cooldown.

**Autonomous project.** Objective only, with no walkthrough and no hints. The page states that outside help voids the attempt. Review works the same way.

**Checkout, where the certification uses one.** The student performs the skill cold, start to finish, with no help. There are two paths, and either one checks the same requirement:

- **In person:** when a certifier is available, they watch and record pass or fail with feedback on the spot.
- **Video:** the student films one continuous, unedited take following the filming guide, uploads it to YouTube as **unlisted** and submits the link. The certifier watches it embedded in the review queue. The portal checks that the link is a valid YouTube video. The certifier confirms that it is continuous and shows the student.

**Every review is kept.** Each attempt, decision, reviewer, timestamp and feedback is stored and visible to the student and in the history.

## Award, certificate, signed serials, public verify

One confirmed press of the award button records a permanent, cryptographically signed award and opens its printable certificate. The paper is only a pointer to the record: forging the paper gets nothing, because anyone who checks reads the live database.

**The award moment.**

1. The button stays dark until every required part is checked. It then lights up as a deliberately important control, visible only to an authorized certifier who is not the student.
2. A confirm dialog shows exactly what will be recorded: student, email, certification, level, date and certifier. The certifier confirms with **Award** to commit.
3. The server re-checks every requirement, generates the serial, signs the record and stores it in one transaction.
4. The printable certificate opens, the student is notified, and the FRC mirror sync fires.

**Serials.**

- Always auto-generated, never typed by hand. A serial looks like `IDEA-7K3Q-M9XD-2HTR-W4PB`: 80 random bits in Crockford base32, so it cannot be guessed.
- Each award is signed with an **Ed25519** private key that exists only in a server environment variable (`CERT_SIGNING_PRIVATE_KEY`). The signature covers the serial, certification code and level, holder name, a hash of the holder email, the award date and the certifier.
- The public key is published, so anyone can confirm the signature independently. A made-up serial, or a real serial with any field altered, fails verification.
- Mr. Pina sets the private key by hand as a server secret. It never appears in a prompt, a log or the database.

**The printed certificate.** It is landscape, US Letter, printed from the browser, and can be reprinted any time from the record. It must be aesthetically excellent and technically exact, and **every field on it is real and resolves to the record**:

- The IDEA mark with the gear (full mark, never the text-only lockup)
- Student name, large
- Certification name, code, level and category
- True award date, and the expiry date for SAFE-1 and RESP-1
- Certifier name and signature line
- The serial, plus a QR code that opens the verify page for that serial
- No decorative fake numbers or filler text

**Public verify page** at `ideabosco.com/certifications/verify`, needing no sign-in:

- Scan the QR or type a serial. It shows that one certificate only: name, certification, level, date, certifier and status.
- Status is shown honestly: **Valid**, **Suspended**, **Revoked** or **Expired**.
- It shows nothing else and has no browse or search, and it is rate limited against guessing.
- An unknown serial shows a plain "No such certificate."

**Suspend, revoke, correct.** Each requires a written reason and is logged with who, when and why. Nothing is ever deleted. A correction, such as a misspelled name, re-signs the record under the same serial and keeps the old values in its history. No physical tags or badges are part of the program.

## Student screens

Students see four screens plus the verify page, all in the Plate look and laid out for both desktop and phone.

| Screen | Address | What it shows |
| --- | --- | --- |
| Catalog | `/certifications` | Every published certification grouped by category, each with its level, prerequisites, average completion time and holder count. Locked ones show which prerequisite is missing. Each item shows a Start or Continue state |
| Certification page | `/certifications/<code>` | Definition, what it allows and does not allow, the full kit, the student's own live checklist in order, Start or Withdraw, exam sitting requests and sign-ups, submission forms, every past review with its feedback, and cooldown status |
| My certifications | `/certifications/me` | Earned certifications laid out by category and level, with serial, date and a reprint link; in-progress attempts with every part done or pending; withdrawn and expired history |
| Holders board | `/certifications/holders` | Who holds what, by certification and by person. Bosco Tech sign-in required |
| Verify | `/certifications/verify` | Public, one serial at a time (see Award) |

- **Notifications.** A badge with a count sits on the student's profile menu across ideabosco.com. Clicking it lists what happened, each linking to the right page. See Notifications.
- **Clicking opens and jumps.** Opening a kit part scrolls it fully into view below the sticky bar. Long kit sections collapse, and videos play embedded at the right timestamp rather than opening new tabs.

## Certifier screens and dashboard

The certifier side opens on one dashboard at `/certifications/desk`: what is waiting now, plus any student's exact status, both one click away. Mr. Pina accepted these screens without fully picturing them, so they are expected to change once he sees them.

| Screen | What it does |
| --- | --- |
| Desk (dashboard) | Top: the **review queue**, every submitted project and checkout video waiting, each showing how long it has waited, oldest first. Next: pending sitting requests. Then live telemetry tiles. A student search box is always visible |
| Student view | Any student's every certification and every part: done, pending, failed, cooldown, dormant or withdrawn, with timestamps, reviews and exam attempts |
| Review | One submission: the evidence or the embedded unlisted video, the spec and self-inspection beside it, then Pass or Fail plus feedback, which is required on a fail and optional on a pass |
| Sittings | Post recurring windows, approve requests, see who is booked, and run a live sitting: release each student, watch focus flags live, and see results |
| Award | The requirement checklist and the award button, with its confirm step |
| Records | Suspend, reinstate, revoke and correct, each with a required reason, plus each award's full history |
| Authority grid | People by certification. Grant or remove whole authority for one person on one certification |
| Engine | Create, edit, publish and retire certifications. Edit kits, exam pools and projects. Import and export packages. Revision history. Portal settings (school-year expiry date, dormancy days, check-in timeout, release window) |
| Logs and exports | Audit log, sync log, error log, telemetry, with bulk export |

**Telemetry on the desk.** Active attempts by certification, stalled attempts, items pending and how long they have waited, pass and fail rates per part, exam pass rate per topic, average completion time per certification, time spent per part, and the most-missed topics. Every figure exports.

## Notifications, telemetry, logs, exports

Every event is recorded once in an event log. That one log drives the notification badge, the dashboard telemetry, the completion-time averages and the bulk exports.

**Notifications.**

- **In portal:** a badge count on the profile menu across ideabosco.com. Each notification has a type, a message, a link and read or unread status.
- **Email, a primary channel:** every student notification is also sent as an HTML email that is visually striking, beautiful and professional ("big time"). It uses the IDEA identity with the full gear mark, is tested in Gmail on desktop and phone, has a plain-text fallback, and comes from a certifications address on ideabosco.com. idea-app had no email service as of 2026-10-15. The build adds Resend (https://resend.com/pricing, read 2026-10-15: free plan 3,000 emails a month and 100 a day, Pro $20 a month). Until Mr. Pina sets its key and verifies the domain, email is a clean no-op, so nothing breaks.
- **Push:** idea-app already has Web Push (`src/lib/server/push.ts`), used where a student has subscribed.
- **Students are notified of:** a part checked off, a review returned with feedback, a sitting approved or scheduled, a cooldown ending, an award (the email carries the certificate's serial and verify link), a suspension or revocation, and an expiry coming up 30 days before the school-year date.
- **Certifiers are notified of:** a new submission or sitting request in their queue.

**Telemetry, captured from day one.** Start and finish times per attempt, with time-to-complete averaged per certification. Time per part, video watch sessions, quick-check and practice-quiz results, every exam attempt with its draw and focus flags, review turnaround, dormancy and withdrawals.

**Logs.**

- **Audit log:** every write that changes a record, with who, what, when and why. It is append-only and never edited.
- **Sync log:** every FRC mirror call and its result.
- **Error log:** server failures in the portal, including email sends.

**Bulk export for Claude.** Every log, the telemetry and any filtered view export in one click as JSON plus CSV. The export carries a short README explaining its fields, so Mr. Pina can hand it to a Claude chat to diagnose or analyze without reading it himself.

## FRC app mirror

The FRC app only displays a read-only copy of who holds what. All weight lives in the portal. The receiving end is already built in `FRC-Team-5669-Techmen/frc-app`: its contract `docs/IDEA_CERTIFICATIONS_SYNC.md` and migration `0001_idea_certifications_mirror.sql` are on its `main` as of 2026-10-06. That migration had not been applied to any real database as of its decision files.

**Sending end (idea-app), built to that contract exactly.**

- A server-side call to the `idea_cert_sync` RPC, carrying the whole snapshot every time: every published or retired certification, and every holder row of every status. Drafts are never sent.
- It fires after every change to an award or the catalog, and on a daily schedule as a full resync.
- Three server-only secrets, set by Mr. Pina by hand: `TECHMEN_SUPABASE_URL`, `TECHMEN_SUPABASE_ANON_KEY`, `TECHMEN_CERT_SYNC_SECRET`. Unset means a clean no-op.
- Every call and its result goes to the sync log, which is exportable.
- The contract's holder rows carry no serial signature. The mirror links to the portal's verify page for proof.

**FRC app decisions, answered 2026-10-14.**

| Decision | Answer |
| --- | --- |
| 27, two certification systems | **Retire** the FRC app's old skills and FRC training page: "it teaches nothing." Job claiming must not break. Its gating moves to the mirror by email match, decided in the frc-app build session's audit |
| 33, identity | Confirmed: the lowercase school Google sign-in email is the single link |
| 34, refused snapshots | Log rejected syncs. Do not log wrong-secret calls. The rejection log is exportable in bulk for Claude |

## Data model and architecture

Everything lives in idea-app's Supabase database under a `cert_` prefix. Every write goes through a server-checked function, and secrets and answer keys never reach a browser. These names are the spec's proposal. The build session's audit phase confirms them against the tree.

| Table | Holds | Key rules |
| --- | --- | --- |
| `cert_certifications` | Code, name, level, category, state (draft, published, retired), sort order, renewal, current revision | Code unique; never deleted once it has holders |
| `cert_revisions` | Every saved version of a certification's full package | Immutable; an attempt pins the revision it started on |
| `cert_prerequisites` | Certification requires certification | Enforced at Start |
| `cert_exam_questions` | Pool by topic, type, options, **answer key** | Students can never select this table; draws and scoring happen server-side |
| `cert_attempts` | One student working one certification: email, revision, started, finished, state (active, withdrawn, dormant, complete) | Clock for completion averages |
| `cert_checks` | Per attempt, per part: state, who checked it, when | Drives the checklist and the award button |
| `cert_submissions`, `cert_reviews` | Evidence and YouTube links, then pass or fail with feedback and reviewer | A reviewer cannot be the submitter |
| `cert_sittings`, `cert_exam_attempts` | Windows and requests; each exam's draw, answers, score, focus flags and releasing proctor | 7-day cooldown computed from the last failed attempt |
| `cert_watch_progress` | Played ranges, speed, check-ins per student per video | Server-side merge of ranges; 2x cap enforced |
| `cert_awards`, `cert_award_history` | Serial, holder email and name, code, level, revision, dates, certifier, status, Ed25519 signature; every change with its reason | Serial unique and random; history append-only |
| `cert_authority` | Person by certification grants | Admin-only writes |
| `cert_settings` | School-year expiry date, dormancy days, check-in timeout, release window | Admin-only writes |
| `cert_events`, `cert_notifications`, `cert_sync_log` | Event log, badge items, mirror calls | Append-only logs |

**Server pieces (SvelteKit).** Routes live under `src/routes/certifications/`. Signing and verification sit in a `$lib/server` module that reads `CERT_SIGNING_PRIVATE_KEY`, server-only. Email sending sits in a `$lib/server` module that reads `RESEND_API_KEY`, server-only. The verify endpoint is public and rate limited. Scheduled jobs run the daily mirror resync, the dormancy sweep and the expiry reminders.

**Security rules carried from this repo's history.**

- Each new function names its roles, revoking from `anon` by name, because `revoke ... from public` does not remove Supabase's default `anon` grant.
- No validator tells the caller which check failed: verify answers only valid or not, and the reason goes to the log.
- Every verification query returns rows, never only a notice.
- Every migration states its undo and is written to be re-applied safely.

## Build plan

Two Claude Code sessions, the minimum, because one session cannot write two repositories. Each is solo on `main`, opens with an audit of the tree, and fans its independent parts out to subagents inside the one session.

1. **idea-app: the whole portal.** Every section of this spec, including the mirror sending end. Its migrations are additive, new tables only, and apply through `migrate.yml` on push. Nothing reaches students until a certification is published.
2. **frc-app: the mirror and the retirement.** Runs after session 1 is live and the mirror secrets are set. It applies the mirror migration, records decisions 27, 33 and 34, moves job gating to the mirror, then retires the old skills and training page.

**After the build:** the first real certification is authored through the package workflow with a Claude chat and published when Mr. Pina vets it.

## Decisions Mr. Pina answered, 2026-10-15

| # | Item | Answer |
| --- | --- | --- |
| 1 | Exam before the autonomous project | Kept, as the research supports |
| 2 | Guided project review | A certifier passes it |
| 3 | Email notifications | Yes, "big time". Visually striking, beautiful, professional HTML emails |
| 4 | SAFE-1 and RESP-1 expiry | A fixed date at the start of each school year |
| 5 | Holders board | Every signed-in Bosco Tech account |
| 6 | Number defaults | Accepted as admin settings |
| 7 | Signing key | Accepted: one hand step |
| 8 | Certifier screens | Built as listed, then adjusted |
| 9 | Number of build sessions | "Minimal Claude Code sessions": two, one per repository |

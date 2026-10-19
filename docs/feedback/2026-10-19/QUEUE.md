# Feedback queue, 2026-10-19

Every open "fix soon" report from the site's feedback list and every open connector gap, as of 2026-10-19 17:30 UTC (main at `1c014f8`). Long-term ideas are out of scope (TA fines `1279c247`, parent access `db8f7f94`, click-to-annotate feedback `d9815486`, live feedback engine `6b814ca1`). Every report older than 2026-10-16 is already resolved.

Messages are copied word for word from the reports (many were dictated). Screenshots are in `screenshots/`, named `<report id>-<topic>.jpg`, captured from the admin feedback console on 2026-10-19.

## Mr. Pina's answers (2026-10-19, in chat)

- **The connector does everything he can do.** Any action he can take by hand on the site as an admin must be doable through the connector, the IDEA Market banner included.
- **The connector updates itself.** Every time an update is pushed, the connector picks up every new admin action without him asking. Tools are **generated automatically**, not just guarded by a test. He wants automation, not chores.
- **Assignment thumbnails:** banner mode already does what he wants. Build what is missing for banners.
- **Hiding sections on the student page:** offer both scopes, per class and everywhere, with a switch to flip between them. He wants to try both.
- **Games keep their own feedback systems.** Everything else shares one feedback window.
- **"Needs attention" with several things owed:** the session's judgment. (Chat's suggestion: open a short list, each item linking straight to its fix.)

## Site reports

### 1. `551c11e3` Matrix theme background does not move
- App portal, route `/`, role student, build `1c014f8`, 1920x911, Chrome 155 on Windows. Filed 2026-10-19.
- "Martix theme isn't moving"
- Screenshot: `screenshots/551c11e3-matrix-theme.jpg`

### 2. `7dfde5e5` Dragging a post in banner mode swaps its banner for the icon
- App classroom, route `/classroom/[sectionId]`, section `ff603907-1b2c-4297-915a-eaf4754242fd`, role teacher, build `ca07e25`, 2560x1351. Filed 2026-10-19.
- "When I drag. Items around to move them. The one I reposition changes its icon. To blend more to the to the wrong type so I'm on banner mode right now and when I drag one of these posts to change the order. The one that I drag. Becomes. The the banner. HTML icon. Changes to just the icon and not the banner version and it takes up the banner area but it's not the banner. Icon."
- Screenshot: `screenshots/7dfde5e5-banner-drag.jpg` (Shop Fix: Presentation shows the banner treatment; Build Log and Design show only a centered icon in the banner slot)

### 3. `6f1c0a3d` The 404 page uses an outdated look
- App classroom, route `/classroom/[sectionId]/item/[itemId]` (404), build `c38e23e`, 1278x1352. Filed 2026-10-19.
- "The 404 page seems to use an outdated. Aesthetic theme."
- Screenshot: `screenshots/6f1c0a3d-404-page.jpg` (also shows the retired "//" motif in "ERROR // 404" and the heading)

### 4. `7d456cf9` IDEA-Blade assignment text grouping looks wrong
- App classroom, route `/classroom/[sectionId]`, section `6eb6cd94-01d9-4e8a-83ac-318e0e0e1de0`, build `793bb15`, 1278x1512. Filed 2026-10-18.
- "The text groupings for the idea blade assignments look funny. I I can't imagine that's right or the best way to go about that text formatting"
- Screenshot: `screenshots/7d456cf9-blade-text-grouping.jpg` (narrow unit column squeezes title and meta into a tall, wrapped stack)

### 5. `c2446a58` Every class shows a confusing "to grade" state
- App portal, route `/`, build `4452876`, 1278x1405. Filed 2026-10-18.
- "All my classes have this two grade thing. As I mentioned in my last report I don't know what I need to do to fix this also it's weird and annoying and it looks like there's an error when really I don't think there's anything really wrong I think there's just something in the system that's being weird I don't know if this is a problem that I have to resolve on the website or problem that the website is having maybe from an old update that's probably screwing with the new update I not sure."
- Screenshot: `screenshots/c2446a58-two-to-grade.jpg` (IDEA209H Sections 1 and 2 each list Unit 1 items with "1 TO GRADE" / "2 TO GRADE" and "7 NEED ATTENTION")

### 6. `e4bc53e5` "Needs attention" on the home page is unclear
- App portal, route `/`, build `4452876`, 1278x1405. Filed 2026-10-18.
- "On the I as an instructor on the idea homepage when I see one of my classes and it says needs attention I have absolutely no clue what that means when I click on one of these orange buttons it should just take me to the place I need to be to resolve the issue I don't want to have to guess at it it says one to grade four session one but I have no idea what that is even after having gone there I still have no idea what that really means so. That's a serious issue."
- Screenshot: `screenshots/e4bc53e5-needs-attention.jpg` (FRC 2026/27, "1 NEEDS ATTENTION", "Session 1" with "1 TO GRADE")

### 7. `08bafda7` Grade and Full screen buttons in Needs attention
- App classroom, route `/classroom/[sectionId]/people/[studentEmail]`, build `2673393`, 1278x1352. Filed 2026-10-16.
- "The great and full screen buttons should be. Included on the needs and tension area. So when when an item is listed on needs attention the the grade and full screen buttons should be. Beside it the same way they are in the assignments list."
- Screenshot: `screenshots/08bafda7-needs-attention-buttons.jpg`

### 8. `bd38fa25` Hide or show sections on the student page
- Same route and build as 7. Filed 2026-10-16.
- "Give me options to hide or show different items on this page altogether. Like I should have the option to hide notebook check-ins. For example since we're not using the notebook system or I should be able to hide the the coins in music section because it's not so relevant or whatever."
- Answer above: per class and everywhere, with a switch.

### 9. `169b931d` Preview image picker scrolling
- Same route and build as 7. Filed 2026-10-16.
- "I'm having a bug in the image selection for the preview image where. When I select the first image the scroll bar goes all the way to the right for some reason. Also when I'm. Clicking through. Images and I get to the last image and I want to go to the next one it should just cycle through to the front again and the school bar should follow where the image is selected."
- Screenshot: `screenshots/169b931d-image-picker.jpg` ("1 of 11" selected, strip scrolled right)

### 10. `0fe82a80` and `80bb4d23` One feedback window everywhere
- App portal, build `2673393`, 1278x1352. Filed 2026-10-16.
- `0fe82a80`: "As a matter of fact. Every feedback. Window on the website should be the same window. I'm sending. This message to and as this feedback system updates and updates across every page on the website there should be no page on the website that does not share the same feedback window unless it's a game or something or I think the games are the only things that would be different. The games are the only different. Things the rest of the website is. Should be on this feedback system. Same interface. Different colors Maybe but the interface and the functionality of it should be the exact same."
- `80bb4d23`: "I don't get why the feedback system is so different on. The idea coin Ledger page it should just be the same exact system that's on the rest of the website except maybe a different color scheme."
- Screenshot: `screenshots/80bb4d23-coin-ledger-feedback.jpg` (the coin ledger's own Send Feedback dialog)

### 11. `a6a037f3` Assignment visual identity (banners)
- App classroom, route `/classroom/[sectionId]`, build `6e1c4af`, 1278x1352. Filed 2026-10-16.
- Summary of a long dictated report: finding an assignment at a glance is hard; he wants a thumbnail he can set on any post, and HTML specs that supply their own visual (animated allowed) automatically on upload.
- Answer above: banner mode does what he wants; build what is missing for banners.
- Screenshot: `screenshots/a6a037f3-assignment-thumbnails.jpg` (the class page before banner mode)

### 12. `48f505c1` Remove the "//" motif everywhere (decision 69)
- Filed by Claude for him 2026-10-18. On 2026-10-17, 93 files under `src/` used "IDEA //" or "// IDEA". Replace the separator with a middle dot ("IDEA · Certifications") in titles, eyebrows and tiles, and add a test that fails on "//" used as a separator in a rendered title. Logged as decision 69.

### 13. CLAUDE.md shortening (`796f97cf` idea-app, `22a8e4e9` frc-app, `a69dd152` fll-app)
- Keep only standing rules; move subsystem detail into linked docs files; lose nothing. idea-app: `tools/claude-md-check.mjs` keeps passing.

## Connector gaps (open)

### C1. `81be18d9` confirm-level site_call actions never complete
- "site_call's confirm step never accepts its own confirm_token for armory_create_project: four previews in a row (season as "2026" and as 2026, with the preview's request_id, with none) each answered "missing, already used, more than ten minutes old, or was for different arguments" within 15 seconds of the preview. Nothing was written. Confirm-level actions through site_call cannot complete."

### C2. `ae4a495d` list_posts shows a shared post in one class; no site-feedback tool
- "list_posts reports a shared post as belonging to only the class it was queried from. In 209H Block 4, Shop Fix: Build Log (57b52c00), Shop Fix: Fit Lab (3f0fe179) and Shop Fix: Presentation (f5226bc7) each show "classes": ["IDEA209H · Section 3 · Block 4"], but all three are one shared copy posted to Blocks 2, 3 and 4 (the site's edit form says so). The classes field should list every class the post is in, so Claude knows an edit changes all of them. Also: there is no tool for site feedback (the Send feedback box); send_feedback is notes to students, so connector bugs can only be filed through report_gap."

### C3. `8d500e31` add people to an IDEA Armory project
- "Add people to an IDEA Armory project by email (and set their role) from the connector. Today only armory_create_project and read tools exist, so teams must be added by hand on each project's Team view."

### C4. `499d58e1` post an IDEA Market ad banner
- "A way to post an idea marketplace (idea shop) ad banner to the classroom sites, such as a banner promoting donations of tissue boxes (both sizes) and class supplies." The classroom banner shipped in `8ba0a4ed` (migration 0280).

### C5. `75287d20` and `be9187d4` the connector must cover everything, automatically
- `75287d20`: "The IDEA Website connector needs to be updated to include the newer features, including the idea marketplace (idea shop) and its ad banner, which was created after the connector was built and isn't reachable through it yet."
- `be9187d4`: "When a new feature is added to the IDEA website, the connector should pick it up automatically, with no separate request needed each time."
- Answer above: every manual admin action, tools generated automatically on every push.

### C6. `3157f5d8` the feedback list's filters fail
- "app_feedback_admin_list rejects its own optional filters. Passing horizon ("fix-soon"/"now") or count fails with "Could not find the function public.app_feedback_admin_list(p_horizon) / (p_horizon, p_limit) in the schema cache". Only the no-argument call works, which returns all ~300k characters and gets truncated."

### C7. Found 2026-10-19: no connector tool returns a feedback screenshot
- The screenshots above had to be captured through the browser, because no connector tool returns one. The console mints a short-lived signed URL server-side; a connector tool should do the same.

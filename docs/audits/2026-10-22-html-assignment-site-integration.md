# Everything between an HTML assignment and the site, read from the code

- **Date:** 2026-10-22
- **Ledger:** `docs/prompt-ledger/entries/0428-authoring-2-0-rebuild.md`
- **Read at:** `main@b6e9756`. From the code only: not the live database, not a signed-in
  browser. Lines marked *(inferred)* follow from what the code lacks, not from a run.
- **Asked by:** Mr. Pina, 2026-10-21: does the standard use everything the site offers, on
  every page an HTML assignment can appear, for every function and every event?
- **Feeds:** `docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md` 2.0, Parts E and J.

## 1. The matrix: surface by feature

`Live` means the student can change answers there; `RO` read-only; `—` not wired.
Surfaces: Post = the student's item page (`ItemDetail.svelte:2866-2883`); Copy = the
teacher's working copy (`HtmlInstructorCopy.svelte:225-237`); Grade = the grading
console's Worksheet view (`HtmlGradingWork.svelte:160-173`); Answers = Answers view,
Answers by question and the Answers CSV (`HtmlAnswerList.svelte`, `HtmlQaPanel.svelte`,
`grading-export.ts:1473`); Work = one student's work page
(`classroom/[sectionId]/people/[studentEmail]/work/[itemId]`); Cert = a certification
lesson (`LessonFrame.svelte:78`); Thumb = the post's thumbnail in lists
(`PostThumbnail.svelte:267`).

| Feature | Post | Copy | Grade | Answers | Work | Cert | Thumb | The standard uses it |
|---|---|---|---|---|---|---|---|---|
| Answers save (`idea:change`) | Live | Live (instructor table) | RO | data | RO | RO | — | yes |
| Pictures and files (`idea:image`, remove, caption) | Live | refused with a sentence | RO | file names | RO | — | — | yes |
| Picture drawn in place (`idea:image-box`) | yes | yes | yes | — | yes | — | — | yes |
| Teacher notes pinned (`idea:feedback`, `idea:field-box`) | yes | — | yes, plus Draw on this | — | — | — | — | yes |
| Theme (`idea:theme`) | yes | yes | yes | — | yes | yes | full theme name | yes |
| Video in the post (`idea:video`) | yes | yes | yes | — | yes | yes | — | yes |
| Height (`idea:height`) | yes | yes | yes | — | yes | yes | — | yes |
| Team progress (`idea:team-progress`) | yes | — | — | — | — | — | — | **no, until 2.0 (F15)** |
| Presentation link check | parent rail | — | Open key, Present links | yes | — | — | — | yes |
| Read-only on close | yes | — | always | — | always | always | — | yes |
| Thumbnail (`idea:thumb`, pointer, ready, open) | — | — | — | — | — | — | yes | yes |

Messages, both directions, are validated in `hxReceive` (`bridge.ts:620-794`); anything else
is dropped as `type`. The parent posts `idea:state`, `idea:theme`, `idea:saved`,
`idea:video-state`, `idea:image-box-state`, `idea:feedback` and `idea:team-progress`
(`HtmlAssignmentFrame.svelte`).

## 2. The frame and the page around it

- Height: `max(320, reported)`, inline (`HtmlAssignmentFrame.svelte:214-215`, `:679`); the
  only ceiling is the 40,000px refusal. **No viewport-height mode.**
- From 1024px the item pane scrolls on its own (`split.css:277-281`, `:620-630`); below, the
  page does. An HTML item drops the page's max width (`ItemDetail.svelte:1469`).
- Above the frame: a 60px masthead (`ClassroomShell.svelte:917`), a 44px breadcrumb row with
  16px under it (`:1464`, `:1487`), the coin banner, then in the item the hero, the
  inspector (managers), the returned grade, the progress rail, the link check and the notes
  panel. The class list (26rem) starts collapsed on a work surface (`nav-collapse.ts:90-91`).
- **No expand, fullscreen or focus mode** for the frame or the post. The only fullscreen near
  it is the YouTube overlay. Patterns to borrow: Foundry's `AppStage.svelte:442-478`,
  `ProjectorView.svelte:280-310`.
- Sandbox: `allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads`
  (`bridge.ts:136-137`), the same set in the served CSP (`src/routes/hx/_headers.ts:181-198`).

## 3. Events

| Event | What happens | Where |
|---|---|---|
| First open | `idea:ready` gets state, then theme, then notes | `HtmlAssignmentFrame.svelte:243-260` |
| Reload or a second `idea:ready` | full state again; every box forgotten | same |
| Typing | per-block save, 800 ms debounce, 4 tries, backoff to 8 s | `answers.ts:1145-1191` |
| Echo | state re-posted on every change, can be stale | `HtmlAssignmentFrame.svelte:417-421` |
| Network loss | block reads failed, `idea:saved ok:false`, a browser backup copy (24 h, no photos) | `answers.ts:273`, `assignment-draft-mirror.ts:74` |
| Two tabs | last write wins, silently; one shared backup slot *(inferred)* | `draft-mirror.ts:61` |
| Upload | base64 over the bridge, stored as a submission file; any type; 200 MB server cap | `answers.ts:966-1013`, `file-upload.ts:46` |
| Re-upload of a file | a new row is appended; old files pile up unless the document sends remove | `answers.ts:451-485` |
| Past the due date | nothing locks; a later edit marks the worksheet late | `classroom.ts:1295-1300` |
| Closed | read-only with a notice; **an open frame is not flipped, saves are refused** *(inferred)* | `0198`, `answers.ts:649-651` |
| Grade returned | shown above the frame; still editable, changes marked | `ItemDetail.svelte:2777` |
| Grade revoked | back to draft, editable | `0265:86-97` |
| Note arrives | pin beside the box, the notes panel; no push or email | `bridge.ts:295-303` |
| Re-upload of the document | replace screen; answered blocks refused unless retired | connector `tools.ts:674-795` |
| Duplicate post | **the document is not copied**: a plain assignment with a rubric | `0193:716-862` |
| One post in several classes | one item, answers keyed by item, student, block | `0086:126` |

## 4. Site features and whether an assignment can reach them

| Feature | Today | Opportunity |
|---|---|---|
| IDEA Coins | no bridge message (a frame must never mint coins); Perfect Score pays on a full returned score (`0242:116-170`) | a rule keyed on a stored optional block or a rubric level, beside the Perfect Score call (`0242:444`) |
| Extra credit | its own column, bought or logged | none needed |
| Certifications | lessons reuse the frame read-only; no link from classroom work | a post that requires or awards a certification |
| IDEA Armory | links only, opened in a new tab | an Armory link kind |
| Notifications | push exists for certifications, coins and tournaments only (`server/push.ts`) | grade returned and note arrived |
| Progress and turn-in | the parent's rail; finishing is turning in (decision 37) | none |
| Due date in the document | not sent | a field on `idea:state` |
| Auto-grading of picks | not in either engine | none planned |

## 5. Gaps, in the order they bite

1. Duplicate post loses the document (UI and connector `duplicate_post`); the comment at
   `0268:390` says it copies, and it does not.
2. Closing mid-session leaves the open frame editable while every save is refused.
3. No expand or full-page mode.
4. No notification for a returned grade or a new note.
5. Stretch coin awards cannot be automated.
6. The document cannot see its due date.
7. `idea:team-progress` is not re-sent after a reload in place (`toldTeam` is not reset,
   `HtmlAssignmentFrame.svelte:600`).
8. The cross-class console omits retired blocks from its Answers views; the exports keep
   them.
9. No export carries teacher notes; the Grades tab has no export.
10. `idea:team-progress` is missing from `IDEA_HTML_ASSIGNMENT_SPEC.md` 6.1; `idea:download`
    is described there and handled nowhere.
11. Dead code: `hxSubmitRefusal` and `submitRefusal` (`answers.ts:592-608`, `:897-900`);
    `docs/subsystems/html-assignments.md` still says submit is a parent control.

**Rechecked: HTML answers are in the exports.** The Answers CSV, the JSON and the workbook
exports carry them (`grading-export.ts:729-804`, `:1086-1137`, `:1473-1511`); the FACTS grades
CSV carries scores only, by design.

# IDEA Reference Library
**Version 4.3 - 2026-08-31**

Owning document for Google Drive material. Project knowledge holds the working
set, read automatically every chat. Drive holds bulk source that is consulted
occasionally and would otherwise crowd out what is needed constantly, and, as of
Library C, the artifacts this assistant produces.

Three libraries. Two are read. One is written.

| Library | Folder ID | Holds |
|---|---|---|
| A. Reference PDFs | `1MAEkVrDFMKhMZ2v21AkbYStnEYmFm9ZO` | 39 files. FRC reference set, NASA RAP, CCSS and NGSS source |
| B. Curriculum and A-G archive | `1eOxBGvFGShn6xBHDZUHe-ueH_Mg_qAHy` | 79 files across four subfolders. Course descriptions, UC policy source, comparison corpus, textbooks |
| C. Artifact store | `1SkIKOIdMM34f_fFnKmtOw1KsTtqDAOtt` | Finished deliverables produced in claude.ai chats. Written to at every delivery, read by any later chat |

**Established:** August 23, 2026. Library C added August 31, 2026.

---

## Retrieval

List a folder, or search across one by content:

```
search_files: parentId = 'FOLDER_ID'
search_files: parentId = 'FOLDER_ID' and fullText contains 'swerve'
```

Then `read_file_content` with the returned `fileId`. Never guess a file ID.

**Rules.**

1. Search before saying a source is unavailable. Nothing here surfaces on its own.
2. Never answer from a filename. `l3launchersplacerspdf.pdf` and
   `course-export (17).txt` could be about anything. Open them.
3. `read_file_content` returns incomplete text on very large files. Above roughly 60
   pages, confirm with `fullText contains` first, then read, and say plainly if the
   response looks truncated.
4. Retrieval is per chat. Nothing read here persists to the next conversation.
5. When a file gets consulted repeatedly across chats, extract the relevant section
   into a project knowledge markdown file. Trim, do not migrate the PDF.
6. Library B is writable and holds live Google Docs. Never edit one without being
   asked. Reading is always safe; writing is never assumed.
7. **Consult before authoring, not only before declaring a source unavailable.**
   Rule 1 fires on a specific sentence Claude is about to write. It does not fire when
   Claude never doubts itself, which is the more common case and the more expensive
   one. Before authoring any FRC, curriculum, A-G, or course-material artifact, check
   the inventory below for a document that owns the subject, and open it. Course
   materials were added to this list on 2026-08-25; see rule 10. Established 2026-08-25,
   after a first-training-session run sheet was authored end to end from memory while
   `frctoolrecommendations.pdf` sat in Library A carrying the exact hex key, wrench,
   and tap sizes the session was about to teach, plus a PPE rule the run sheet had
   gotten wrong. Nothing in the delivered artifact was flagged as uncertain, so rule 1
   never triggered. The output was plausible, which is the failure mode: a run sheet
   built from general FRC knowledge reads correctly to anyone who has not opened the
   source.
8. **Time pressure is the argument for consulting, not against it.** The session in
   rule 7 was hours away, and the two file reads that fixed it cost under a minute.
   A deadline changes what gets built, never whether the owning source gets opened.
9. **A source Claude knows exists is requested before authoring, not after.** Rule 7
   assumes the owning document is in a library and can be opened unilaterally. The
   harder case is a source that is on Mr. Pina's machine and has to be asked for.
   Observed 2026-08-25, twice in one hour on the same file: the IDEA209H Unit 1.2
   deck was scoped end to end against Mr. Cosso's Unit 1.1 PowerPoint without the
   file, and then a coverage comparison against it was delivered from a past-chat
   topic list, six rows of which were wrong. Cost was recorded as absent from a deck
   that gives it a slide. Two rules follow. Ask for the file in the turn the need
   appears rather than after a draft exists, because a draft makes the request look
   optional. And when a comparison must be made from recollection anyway, state the
   provenance in the same sentence as the claim rather than in a preamble, since a
   caveat at the top does not survive a reader scanning the table underneath it.
10. **Course materials are subject to rules 7 through 9, and the textbooks are the
   owning source for engineering fundamentals.** Rule 7 originally named FRC,
   curriculum, and A-G artifacts, which left assignments, labs, and course decks
   outside the list that triggers a consultation. That gap was live. Established
   2026-08-25, when the IDEA209H Unit 1 hardware content was built against the NASA RAP
   guide, correctly and from a real source, while `Shigley's-Mechanical-Eningeering-
   Design.pdf` and `Machine Elements in Mechanical Design.pdf` sat in the Library B
   Textbooks subfolder carrying the same material at greater depth, unopened. Nothing
   was wrong in the output, which is the point: consulting one source is not the same
   as consulting the source that owns the subject, and the second is the standard.

   For any material touching statics, stress and strain, fasteners and bolted joints,
   power transmission, bearings, shafts, gears, or tolerances, the Textbooks subfolder
   is checked before authoring. Its folder ID is
   `1A0uSOTwIqxNsH0CZ1Gyh9iO898OLh6rO`, recorded here so the check costs one query
   rather than a search for the search. Read the size and copyright constraints in the
   Textbooks entry below before opening one; they are unchanged and they bind.

   What is cited and how it reaches students is governed by
   `IDEA_MATERIALS_PROCESS.md`, section "Every Material Cites Its Sources." This rule
   covers the reading; that one covers the writing.

11. **Rule 6 governs A and B only. Library C is written to without asking.** The
   never-edit-unasked rule exists because Libraries A and B hold source that other work
   depends on and that this assistant did not create. Library C holds output this
   assistant did create, and writing to it is the point of it. Creating a file inside
   Library C needs no instruction. Deleting one still does, and deletion is the only
   correction available, because the connector cannot replace a file.

12. **The connector creates and cannot replace, so a name is used once.** Two writes
   under one title return two file IDs and leave two copies with no staleness marker,
   measured 2026-08-31 on this library. A corrected artifact therefore carries an
   explicit version marker in its filename rather than reusing the name, and the turn
   says which file it supersedes. Removing the superseded copy is Mr. Pina's, or this
   assistant's on his word, and it is never assumed.

13. **A chat looks in Library C when it has a reason to, not at every open.** Drive is
   not mounted the way project knowledge is, so nothing here is read unless a chat goes
   and gets it, and rule 4 still holds: nothing read persists to the next conversation.
   Search before any work that would rebuild something, before any handoff that claims
   an artifact exists, and whenever Mr. Pina refers to a deliverable this chat has not
   seen. The folder listing is the index; there is no maintained table, deliberately.
   A table this assistant cannot update in place would have to be rebuilt by hand every
   delivery and would drift from the folder it describes, which is the `REGISTER.md`
   blind spot bought at a cost and for no benefit.

---

## Library A - Reference PDFs

### Standards sources (2)

| File | Use |
|---|---|
| `finalelaccssstandards.pdf` | Full CA CCSS ELA/Literacy framework, 98 pages. Only the RST and WHST strands are cited by IDEA. A trimmed high school version belongs in project knowledge |
| `cangsshsengdesigndci.pdf` | NGSS high school engineering design disciplinary core ideas |

Both are duplicated in Library B under the UCOP subfolder, byte-identical. Library A
is the copy to use.

### FRC design and build (17)

`design101.pdf`, `prototyping101.pdf`, `programming101.pdf`,
`engineering_design_process_for_robotics 1.pdf`, `DesignTutorialsRev10.pdf`,
`FRC Survival Guide V3.1 (1).pdf`, `firstbrandguidelines.pdf`, `bumperguide 1.pdf`,
`frctoolrecommendations.pdf`, `controlsystemsworksheet.pdf`, `indexerpdf.pdf`,
`FMS Whitepaper (1).pdf`

Mechanism lesson series: `l1chassisdrivetrainspdf.pdf` (chassis and drivetrains),
`l2gamepieceintakespdf.pdf` (game piece intakes), `l3launchersplacerspdf.pdf`
(launchers and placers), `l4extendersliftreachclimbpdf.pdf` (extenders, lift, reach,
climb), `l5actuatorscreatingmovementpdf.pdf` (actuators)

**`frctoolrecommendations.pdf` is the authority for shop tooling, fastener sizes, and
PPE.** Real title is FIRST Robotics Competition Tool & Fabrication Expectations, Rev.
December 2025. Open it before authoring any hands-on training content, tool purchase
list, or safety document. Three things in it are load-bearing and are not what general
knowledge produces:

- The sizes FIRST names as the ones to stock spares of, which is the correct
  vocabulary list for a beginner hardware session: hex keys 1/8, 5/32, 3/16;
  combination wrenches 3/8, 7/16, 1/2; taps #10-32 and 1/4-20; drill bits #21, 3/16,
  #9, #7, H.
- Over-the-glasses safety glasses are called out as a separate stocked item, not a
  variant to substitute in for students who wear glasses.
- Gloves are conditional protection. Cut-resistant gloves create an entanglement risk
  around power tools and are wrong for those tasks. Any safety document that lists
  gloves without that caveat is teaching a hazard.

Consulted 2026-08-25 for the first FRC training session. A second consultation makes
it a rule 5 extraction candidate: the sizes, the PPE list, and the spares list belong
in project knowledge as an FRC shop reference, and the rest of the document is
purchasing guidance that does not.

### Scouting and strategy (12)

`introscouting.pdf`, `intermediatescouting.pdf`, `scoringanalysispdf.pdf`,
`effectivestrategies.pdf`, `kickoffworksheet.pdf`, `kickoffbreakdownworksheet.pdf`

Team Curriculum worksheets: `tcascoutingworksheet.pdf`, `tcaprematchworksheet.pdf`,
`tcapitworksheet.pdf`, `tcamechanismsworksheet.pdf`, `tcamanufacturingworksheet.pdf`,
`tcaprototypingworksheet.pdf`

**The six `tca*` worksheets are team planning documents, not student exercises.**
Verified against `tcamanufacturingworksheet.pdf` on 2026-08-25. Each is a numbered
sequence of open discussion prompts with ruled answer space, addressed to a whole team
deciding how it will operate for a season: what tools to acquire, how to delegate,
what timeline to hold. There is no procedure, no worked example, and nothing a student
does with their hands. They are useful for a leads planning session or a preseason
strategy meeting and are the wrong artifact to reach for when a training block needs a
hands-on task. The filenames read like exercise packets, which is why this note exists.

### Drive team (3)

`selectingdrivers.pdf`, `drivecoachpractices.pdf`, `improvingdriverperformance.pdf`

### NASA RAP curriculum (5)

`nasaraprdcv101compressed 157.pdf`, `nasaraprdcv101compressed 5898.pdf`,
`nasaraprdcv101compressed 99170.pdf`, `nasaraprdcv101compressed 171216.pdf`,
`nasaraprdcv101compressed 217298.pdf`

Page-range splits of one document of roughly 300 pages. Trailing numbers are page
ranges, not versions. Status undecided: no IDEA unit currently draws on this.

---

## Library B - Curriculum and A-G archive

### Course descriptions, root folder

Each course exists as a live Google Doc and as a PDF export. **The two disagree, and
which one is current varies by course.** Check `modifiedTime` on both before using
either. As of August 23, 2026:

| Course | Current version | Note |
|---|---|---|
| IDEA114 Engineering Foundations | PDF | Exported 20 minutes after the last Doc edit, July 21 |
| IDEA209 Engineering I Honors | **Doc** | Doc edited August 6, PDF exported July 14. The PDF is three weeks stale |
| IDEA210 Engineering Applications Honors | PDF | Doc last edited June 21 |
| IDEA305 Engineering II Honors | PDF | Doc last edited May 24 |
| IDEA306 Advanced Engineering I Honors | PDF | Doc last edited May 25 |
| IDEA404 Advanced Engineering II Honors | PDF | Doc last edited May 25 |

Recheck these timestamps rather than trusting the table. It is a snapshot.

IDEA114, IDEA209, and IDEA210 PDFs are also in project knowledge. Those are the same
July 14 exports and carry the same staleness for IDEA209.

Docs with no PDF counterpart, all draft or superseded:

| Doc | Status |
|---|---|
| `IDEA209 - Engineering I` | Non-honors variant. Not among the five UC-approved courses |
| `IDEA210 - Engineering Applications` | Non-honors variant. Not among the five |
| `IDEA 250 - Engineering Studio` | Stub, 2.6 KB. Never developed |
| `Course Notes / Revisions` | Working notes on description revisions |
| `IDEA Curriculum Overhaul - 2026-27` | Planning document behind the IDEA 2.0 restructure |

The five UC-approved courses are IDEA114, IDEA209, IDEA209H, IDEA210, IDEA210H,
approved July 17, 2026. IDEA305 and IDEA404 are pending Area F to D and G to D
reclassification. IDEA306 and IDEA250 are in neither group.

Also at root: `Materials for Design Engineers.pdf`, a materials selection reference
relevant to IDEA209H Unit 1.

### UCOP A-G, Context and Standards (22 files)

Source documents behind the trimmed project knowledge files. Consult when a trimmed
file is ambiguous or a claim needs verification against the original.

- `General A-G honors-level course criteria.pdf` and `D-Science.pdf` are the sources
  for `UC_AG_Policy_Guide.md` and `UC_AreaD_Science_Criteria.md`. Use the trimmed
  files first. These are for adjudicating disputes
- Eleven `hs-articulation.ucop.edu_*.pdf` files: submission deadlines, writing
  courses, submitting courses, course revisions, online courses, annual update
  checklist, reference list management, and four FAQ pages
- Eight `UCOP A-G Course Management Portal (CMP)*.pdf` files: portal screen captures
  numbered by course, 113, 205, 208, 303, 304, 401, plus two unnumbered
- `Science course sample.pdf`: a UC-published exemplar Area D description
- Four `course-export (N).pdf` files: prior IDEA submissions
- `finalelaccssstandards.pdf` and `cangsshsengdesign-dci.pdf`: Library A duplicates

### UC Honors Approved Courses (30 files)

`course-export.txt` through `course-export (29).txt`, 6 KB to 39 KB each. UC-approved
honors course descriptions from other schools. This is the comparison corpus that
produced `course-examples-consolidated.md`.

Filenames carry no information about which course or school any file holds. Open them.
Several are byte-identical pairs and are duplicate exports of the same course, for
example 7, 22, and 23 at roughly 17.5 KB, and 17 and 18 at 10,517 bytes.

Use `course-examples-consolidated.md` first. Come here when writing a new submission
and a specific structural precedent is needed.

### BoscoTech Context (3 files)

`Semester 1.pdf`, `Semester 2.pdf`, `Technology Majors.pdf`. School-level context on
the full course catalog and the technology major structure.

### Textbooks (6 files)

Subfolder ID `1A0uSOTwIqxNsH0CZ1Gyh9iO898OLh6rO`. Owning source for engineering
fundamentals under rule 10.

`Shigley's-Mechanical-Eningeering-Design.pdf`, `MachinerysHandbkOBERG.pdf`,
`Machine Elements in Mechanical Design.pdf`, `Manufacturing-Processes-4-5-*.pdf`,
`Practical Electronics for Inventors, 4th Edition.pdf`,
`Learning OpenCV 3 Computer Vision with Python.pdf`

Commercial engineering textbooks, 4 MB to 46 MB. Two constraints.

1. All are far past the size where `read_file_content` returns complete text. Always
   narrow with `fullText contains` before reading.
2. These are copyrighted works. Use them to check a fact, a formula, or a standard
   value. Never reproduce passages, tables, or figures into student-facing materials.
   Cite the source and write the explanation fresh.

---

## Library C - Artifact store

`1SkIKOIdMM34f_fFnKmtOw1KsTtqDAOtt`. Established August 31, 2026. Four folders and
an index, all at the top level of the folder.

| Folder | Folder ID | Holds |
|---|---|---|
| root | `1SkIKOIdMM34f_fFnKmtOw1KsTtqDAOtt` | `README.md` only |
| IDEA100 | `1H4g7dJyNMJ983rDuBJ-ToDKji3butoDy` | Every IDEA100 artifact |
| IDEA209H | `1HRaq94Ty3Klp5o7ElX8k5HtJv29qqcq0` | Every IDEA209H artifact |
| FRC | `1IfL5hKl0f9KDqtE-42BuoWW9iCAiJ2yZ` | Team 5669 artifacts |
| Program | `1EclTFFWQggLQjI6hRndnTycGHhOBh37C` | Everything not owned by one course: A-G, coin, app prompts, cross-course reports |

`README.md` at the root describes the library and is static. There is no index table:
the folder listing is the index. Delivered filenames already lead with course and day,
so `title contains 'IDEA209H_Day08'` returns every class of artifact for that day at
once, and the four folders exist for Mr. Pina's eye rather than for retrieval.

**What does not go here.**

Standards files. Every file with a row in `docs/standards/REGISTER.md` lives in
`pina-hash/idea-app` and only there. A second home for a versioned file is a fork
generator, and the freshness protocol in `IDEA_instructions.md` exists because that
failure has already happened twice at real cost. Library C holds outputs, never
governing documents.

Source. Libraries A and B do not move and nothing is copied out of them into C.

Anything large enough to be dragged in by hand. See the size ceiling below.

**Writing to it.** `create_file` with `parentId` set to the folder, `textContent` for
UTF-8 content and `base64Content` for anything else, `contentMimeType` set to the real
type, and **`disableConversionToGoogleType` set to true, without exception.** Left
unset, Drive converts an uploaded `.md` into a Google Doc and an uploaded `.csv` into a
Sheet, and the file is then no longer the artifact that was delivered. Measured
2026-08-31 on the round trip that established this library.

**Archiving is never free, and the cost is context rather than Drive.** There is no path
from the container filesystem to the connector, so every archived file passes through the
response in full: text as itself, a binary as base64 at roughly 1.37 times its size. A
file authored in the container and then archived is therefore emitted twice, once to
write it and once to upload it. Two consequences.

**Binaries have a hard ceiling of about 100 KB.** A 500 KB rendered PDF is on the order
of 170k tokens and will end a chat rather than archive a file. Above the ceiling, deliver
the download, name the target folder, and say in one line that it is a manual drag. A
1367-byte PDF was round-tripped byte-exact on 2026-08-31, so the mechanism is sound and
the cost is the only limit.

**Text artifacts get a judgment rather than a ceiling.** Archive anything a later chat
would otherwise rebuild or would have to be told about: specs, prompts worth reusing,
rendered materials, reports. Do not archive scratch, one-off diagnostics, or a draft
superseded inside the same turn. The doubling cost is the reason the question is asked
at all; before this was measured the rule read that text was free, which it is not.

## Known unreadable

No text layer. Every page is an image. Any tool reading them returns nothing, and the
failure is silent, so a chat can believe it consulted them when it did not.

| File | Library | Problem |
|---|---|---|
| `FMS Whitepaper (1).pdf` | A | 10 pages, zero extractable characters |
| `effectivestrategies.pdf` | A | 60 pages, about 80 characters per page. Presenter name, slide titles, and bare bullet glyphs only. All substance is in slide images |

Do not cite either. If a question needs them, say they are unreadable and ask whether
to OCR. `effectivestrategies.pdf` is the one worth fixing.

---

## Changelog

**v4.3 - August 31, 2026**
Added Library C, the artifact store, and with it the first Drive location this
assistant writes to rather than reads. Built and verified in the same session: folder
and four subfolders created, a markdown file written and downloaded back to confirm it
survived as markdown, and a 1367-byte PDF round-tripped byte-exact to prove the binary
path. Two findings are recorded because neither is guessable and both are expensive to
rediscover. `disableConversionToGoogleType` must be set on every write or Drive
silently converts the artifact into a Google first-party file. And the binary ceiling
is a context cost rather than a Drive limit: base64 in the conversation runs about
1.37x the file, so a 500 KB PDF is roughly 170k tokens and the practical ceiling is
100 KB, above which the file is delivered for a manual drag. Scoped Library C against
the repo deliberately: standards files stay in `docs/standards/` and only there,
because a versioned file with two homes is the fork generator the freshness protocol
was written to survive. Added rules 11 and 12, splitting the never-edit-unasked rule
so it continues to bind A and B while C is written to freely, and stating that a chat
searches Library C on a reason rather than at every open. A third finding retired a design written earlier in the same
session before it shipped: the connector creates and cannot replace, so two writes under
one title return two file IDs and two copies with no staleness marker. That kills any
maintained index table, since one this assistant cannot update in place would drift from
the folder it describes and buy the `REGISTER.md` blind spot for no benefit. The folder
listing is the index, `README.md` is static, and a corrected artifact carries a version
marker in its filename rather than reusing the name.

**v4.2 - August 26, 2026**
Added rule 10, extending consult-before-authoring to course materials and naming the
Textbooks subfolder as the owning source for engineering fundamentals, after Unit 1
hardware content was authored against a real but non-owning source while two textbooks
covering the same material went unopened. Rule 7's artifact list widened to match.
Recorded the Textbooks subfolder ID in both rule 10 and the inventory entry so the check
is one query. Pointed the writing half of the rule at the new section in
`IDEA_MATERIALS_PROCESS.md` 2.6 rather than duplicating it here.

**v4.1 - August 26, 2026**
Version header added on line 2. The file carried a changelog and no header, so the
freshness protocol's line-2 comparison could not read it and a mirroring session had to
fall back to parsing the newest changelog entry. A fallback that works is still a file
that opted out of the check. No content changed.

**v4 - August 25, 2026**
Added rule 9, on sources that live on Mr. Pina's machine rather than in a library.
Rule 7 covers what Claude can open unilaterally and is silent on what it has to ask
for, which is the case that failed: a deck was scoped against a colleague's
PowerPoint that was never requested, and a coverage table was then delivered from a
past-chat topic list with six wrong rows. Establishes that the file is asked for in
the turn the need appears, and that provenance on a recalled claim belongs in the
sentence carrying the claim.

**v3 - August 25, 2026**
Added rules 7 and 8: consult the owning source before authoring, and never let a
deadline be the reason not to. Rule 1 only fires when Claude is about to call a source
unavailable, which leaves confident-and-wrong output entirely uncovered, and a first
FRC training session was authored from memory with `frctoolrecommendations.pdf`
unopened in Library A. Documented that file as the authority for tool sizes, fastener
sizes, and PPE, with the three findings that general knowledge does not produce, and
flagged it as a rule 5 extraction candidate on next use. Corrected the characterization
of the six `tca*` worksheets: they are whole-team planning discussion documents, not
student exercises, and their filenames invite the wrong assumption.

**v2 - August 23, 2026**
Added Library B, the curriculum and A-G archive, 79 files across four subfolders.
Documented the Doc versus PDF currency conflict on course descriptions, which is the
main hazard in that library. Flagged the textbook subfolder for size and copyright.
Noted the CCSS and NGSS duplicates across the two libraries. Added the rule that
Library B is writable and must never be edited unasked.

**v1 - August 23, 2026**
Created. Established Library A, moved 39 PDFs out of project knowledge, inventoried
and categorized them, flagged the two files with no text layer.

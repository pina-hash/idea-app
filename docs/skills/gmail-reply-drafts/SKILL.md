---
name: gmail-reply-drafts
description: Use whenever Mr. Pina wants an email drafted in his Gmail, reply or new, plain or designed: build it in the Gmail web UI with the right signature for the audience, never with the Gmail connector.
---

# Gmail drafts (replies, new emails, designed emails)

Source of truth: `docs/skills/gmail-reply-drafts/SKILL.md` in pina-hash/idea-app.

A draft must look exactly like one he started himself: a reply sits inline in the thread and answers the right message, it carries the right signature for the readers, Gmail quotes the history normally, the links are clean, and every email is formatted, never bare text.

The Gmail connector (create_draft, update_draft) cannot do this. It makes a separate compose draft, can only insert the default signature, and rewrites every URL into a google.com/url redirect. Never use it to write a draft. Use connector tools only to search and read mail and to verify or delete drafts.

Write the words with my-writing-style first.

## Formatting floor (EVERY email, to anyone, never asked for)

His rule, 2026-10-23: he must never have to ask for formatting. Bare plain-text paragraphs are never the deliverable for an email, not to a colleague, not to maintenance, not to a one-line reply. Plain text stays only for Discord, GroupMe, texts and Classroom posts (my-writing-style, By channel).

The floor, for a short working email to an adult:
- Arial 14px, #1a1a1a, set inline on every element (Gmail strips style blocks). Paragraph gaps from margins, not blank lines.
- Greeting, then one line saying what the email is.
- More than one topic: bold numbered headings ("1. Truck reservation", "2. Shop supplies").
- Dates, times, quantities, anything a reader will scan: a small table, never a run of lines. One table per day or group, 460px wide, 1px #d6d6d1 border, header row bgcolor #eeeeea with bold caps ("FRIDAY, OCT 30"), label column gray #555555, value column bold, thin #e2e2de rules between rows. Use both the bgcolor attribute and the CSS background so Gmail keeps it.
- Items to order, bring or do: a bulleted list with the key quantity in bold ("3 cases", "Soap").
- The ask or question on its own line, then "Thank you,", then the signature.
- A one or two sentence reply still gets the greeting, spacing and bold on the one fact the reader must not miss (the date, time or amount). Nothing is left as an undifferentiated text block.
- Colors stay readable if Gmail strips them: dark text on light fills only.

Anything to families, the team or a group announcement goes up a level, to the designed email below.

Facts for the email come from the conversation first, then past chats (conversation_search), the calendar and project knowledge. He has said more than once that the facts are findable; ask him only for the one fact none of those hold, and never send a draft with a fact marked as a guess without saying which one is.

## Standing recipients

- Every new FRC Team 5669 email to families or students (announcements, reminders, sign-up and event emails): Cc Luis Garza, lgarza@boscotech.edu. To is apina@boscotech.edu, families and students go in Bcc.
- Replies to a single parent or student: keep Garza on only if he was on the original or Mr. Pina asks.

## Signature by audience (mandatory)

- ANY student among the recipients (an @boscotech.net student address in To, Cc or Bcc, or a student writing as themselves): a Mr. Pina signature. This wins over everything else, including team-wide emails that also go to parents.
- Only adults (parents, guardians, coworkers, administrators, outside adults): an Alejandro Pina signature.
- Replies use the [reply] versions: "[reply] Mr. Pina 2026" or "[reply] Alejandro Pina 2026". New emails use "Mr. Pina 2026" or "Alejandro Pina 2026". Never use the 2025 signatures.
- Gmail inserts a default signature. After the body is in, click the Insert signature (pen) button in the compose toolbar and choose the right one; Gmail swaps it in place. Confirm in the read-back: the signature names "Mr. Pina" when any student is included, "Alejandro Pina" otherwise.
- If the right signature is not in the list, stop and tell him which one was missing.

## Chrome safety (every draft)

Gmail keyboard shortcuts are on. Typing while focus is outside the compose window fires shortcuts on the inbox (archive, star, mute, reply). Before any type action: click the field (use find refs or a fresh screenshot, since the compose window moves), type a few characters, zoom to confirm they landed, then type the rest. If text ever lands outside the compose window, stop, press Escape, and check the inbox count, trash, spam and Sent before going on; tell him what you checked. Opening compose can leave two compose windows open: close the empty one before typing.

## Replies (Claude in Chrome, apina@boscotech.edu)

1. Find the message with search_threads. Note the sender and a distinctive phrase from the exact message being answered.
2. Open it in Chrome: navigate to `https://mail.google.com/mail/u/0/#search/from%3A<sender>+<phrase>`, then click the single result. Hash navigation from an already-open thread does not reload: click the back arrow to the list first.
3. In a long thread, use find to locate THAT message's collapsed row, click it to expand, then use find for the Reply button in that message's header. Never use the thread-bottom Reply when the message being answered is not the last one. Use Reply all only when he asks or when Cc recipients on the original need the answer.
4. Put the formatted body in with the paste method under "Building the body" below. Gmail autolinks URLs with no redirect and autosaves.
5. Fix the signature for the audience.
6. Verify (below). Leave it as a draft. Never click Send.

## New emails

Click Compose (or navigate to `https://mail.google.com/mail/u/0/#inbox?compose=new`). Click and fill To, then the Cc link and Cc (standing recipients above), then the Bcc link and Bcc (comma-separated, confirm the first address landed before typing the rest), then Subject, then build the body. Fix the signature. Verify. If he has no address for a person on file, search mail and the directory first; leave To empty and say so in one line only when it truly cannot be found.

## Building the body (every email)

1. Write the HTML in a file or a JS string. For a designed email, render it with headless Chromium (`/opt/pw-browsers/chromium*/chrome-linux/chrome --headless --no-sandbox --screenshot=... --window-size=600,1700 file://...`) and look at it first; for the floor above, the Gmail compose view itself is the check.
2. Open the compose (new or an existing draft) in Chrome and fill recipients and subject.
3. Put the HTML into the body by paste, not typing. execCommand insertHTML and innerHTML are blocked by Gmail's Trusted Types. What works: in javascript_tool, find the compose editor (`div[contenteditable=true][role=textbox]` that contains `.gmail_signature`), remove any old body nodes above the signature with removeChild (in an existing draft the old text can sit inside the same wrapper as the signature, so walk up from `.gmail_signature` and remove earlier siblings at each level), insert an empty div before the signature block, collapse the selection into it, then dispatch `new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true})` where `dt = new DataTransfer()` with `text/html` set to the HTML and `text/plain` set to a short fallback. Gmail inserts it with its own sanitizer and keeps the tables, bold, bullets and colors.
4. Fix the signature.
5. Make Gmail save. A JS change alone does NOT save, and a pasted change can sit unsaved even after a keystroke: click a body line found by screenshot (inside the compose window), press End, space, BackSpace, then CLOSE the compose window with its X, which is what forces the save. Wait about 10 seconds. list_drafts and get_draft can lag a few seconds behind; read again before concluding it failed. If it still shows the old body, reopen the draft (its viewUrl, then expand the minimized compose), redo the paste, and close again.
6. Check innerText for stray fragments (for example "nbsp;") and remove them.
7. Verify.

## Designed emails (anything to families, the team, or a group announcement)

These must match the established Beach Blitz family email design: light gray outer background; a white 560px max-width card; a dark #141414 header with a small gold #d4a72c eyebrow ("FRC TEAM 5669 · TECHMEN"), a white 24px title and a gray subline; a red #b3261e full-width bar with the one must-know line in caps; numbered STEP sections with red step labels and bold 19px titles; a light #f7f6f2 instruction box with red numbers; a green-edged #eef5ec status box for lists like who is done; one gold button for the main link; small gray notes; a key dates table with thin row rules; "Questions? Reply to this email." Use bgcolor attributes and font color tags as well as CSS so Gmail keeps the colors. Scannable, no em dashes, his voice. Build and paste as under "Building the body".

## Verify (every draft)

Wait about 10 seconds, then read the draft back with get_draft or list_drafts: right To, Cc (Garza on team and family emails) and Bcc, threadId, subject, the full body in order, no old text left behind, the correct signature name, zero google.com/url anywhere, and the formatting present in the html body (tables, bold, bullets, the expected bgcolor values). A draft whose html body is plain divs is not done. Only then tell him it is ready.

## Cleanup

- If a connector-made draft exists for the same message, delete it with delete_draft so only one draft remains.
- Before rebuilding a draft, check Sent: if he already sent it, do not recreate it.
- Close the Chrome tabs you opened when done.

## If Chrome is not connected

Say so in one line. Give the formatted HTML as a paste-ready file and name the signature to pick. Do not fall back to the connector and do not fall back to plain text.

## Report

One line per draft: who it is to (including the Cc), the signature used, and the key lines of the body. No mechanics.

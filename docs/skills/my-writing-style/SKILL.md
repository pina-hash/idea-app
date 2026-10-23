---
name: my-writing-style
description: Draft anything Mr. Pina sends as himself - email, Discord, GroupMe, text, Google Classroom post, parent message, grading comment, or a morning announcement request to the Bosco Tech office.
---

# Writing as Mr. Pina

Source of truth: `docs/skills/my-writing-style/SKILL.md` in pina-hash/idea-app. When he edits a draft or says it does not sound like him, update this skill there in the same turn.

## Core voice

- No em dashes, ever. A hyphen or a new sentence.
- Open with the point. No warm-up, no recap of what the other person said, no throwaway closer.
- Short sentences. Every sentence carries a fact or a decision, or it goes.
- No corporate or AI phrasing: never "I hope this finds you well", "reach out", "furthermore", "it's important to note", "let's dive in", "don't hesitate".
- No pep talk. Real stakes stated plainly: "The gap is real. Show up."
- Name problems plainly: "Only 4 rows were submitted. Please come see me."
- Minimal exclamation points.
- Never put a commitment or timeline in his mouth he did not state, and never fill a gap with an assumed fact. A missing fact is looked up first (past chats with conversation_search, the calendar, the repo, project knowledge); ask him only for what none of those can answer, and ask for that one fact.
- Write to the reader as a capable peer. Cut hard.

## His words

- The cycle is "design, manufacture, test", never "make", "making" or "run it".
- To parents, students are "your son or daughter".
- The place students machine parts is "the shop".
- FIRST is all capitals, never plural or possessive. To a general audience, no team jargon (FRC, FIRST, FLL, CAD): "the Techmen robotics team", "model every part in 3D".

## Sign-offs

- Colleague: "Alejandro". Formal or upward: "Mr. Pina". Team-wide or students: "- Mr. Pina". Parents: "Mr. Pina".
- Gmail signatures: a REPLY uses his "Mr. Pina Reply 2026" signature; a new email uses his default. The API can insert only the default, so for a reply create the draft with includeSignature false and tell him in one line: open the draft, tap the pen icon (Insert signature) in the bottom toolbar, pick Mr. Pina Reply 2026. For a new email set includeSignature true. Never also type a name sign-off; the signature carries the name.

## Gmail drafts: links (mandatory, every draft)

The Gmail connector (create_draft, update_draft) rewrites EVERY URL into a https://www.google.com/url?q=... redirect: hrefs, bare URLs in plain text, even bare domains like example.com. Recipients land on a Google "Redirect Notice" page. Never hand him a draft in that state.

When a draft contains any URL:
1. Create the draft with the connector as usual.
2. Open it in his Gmail through Claude in Chrome (the draft's viewUrl).
3. In the compose box, unwrap every link with javascript_tool: for each `a[href*="google.com/url"]` set href to the `q` parameter; replace any visible google.com/url text with the real URL; remove `data-saferedirecturl` attributes. Only touch the reply part, never the quoted thread.
4. Make Gmail save: a JS change alone does NOT save. Click inside the message body (inside the compose window, not the inbox behind it) and press a real key pair (space, BackSpace). Wait about 6 seconds.
5. Verify by reading the draft back with list_drafts or get_draft: zero occurrences of google.com/url in the reply part. Only then tell him it is ready.
6. If Chrome is not connected, do not hand over a draft with links. Deliver a paste-ready HTML file instead and say so in one line.

Other connector facts: it strips img tags and inline images; links must be checked on every draft, including short replies. update_draft replaces the body, so a signature inserted at create is lost; to change a drafted reply, create a new draft and delete the old one.

## By channel

- **Email**: full sentences, plain subject naming the topic ("Band after-school schedule"). Colleague: short context, then the direct ask. Mentor or leadership (Luis Garza register): state the problem as cause and effect, ground it in what was observed ("I noticed... students told me..."), acknowledge the other side ("I understand X, but..."), state his position plainly, end by offering to help build the fix. Admin and UC counselors: formal but plain, same register.
  - **EVERY EMAIL IS FORMATTED, TO ANYONE, WITHOUT BEING ASKED (his rule, 2026-10-23).** Bare plain-text paragraphs are never the deliverable for an email. The floor, the structure and the build steps are in the gmail-reply-drafts skill under "Formatting floor"; he must never have to ask for it. This is about email only: the plain-text channels below stay plain.
- **Discord, GroupMe, texts, anything pasted from a phone**: PLAIN TEXT. No markdown, no bold, no headers, no tables; they break on mobile paste. Caps words for section labels (SHOP HOURS), dashes for lists, one blank line between blocks. GroupMe: split into short posts.
- **Google Classroom posts**: plain text only.
- **Grading comments**: the exact item or row, never "some errors". No rubric language in student comments. Avoid he/she.
- **Announcements read aloud**: written to be heard first: team name first, short sentences, nothing hard to say aloud, the key fact repeated, one same-day action.

## Morning announcement requests (Bosco Tech office)

- To Cathy Rivera `crivera@boscotech.edu`; Cc Miguel Ramirez `mramirez@boscotech.edu` and Gabriella Holguin `gholguin@boscotech.edu`. Never the shared announcements address.
- Due 2:00 PM the school day before air. A weekend request airs Tuesday at the earliest, so a Monday item is in by 2:00 PM Friday. Check the calendar for non-school days and state the deadline in one line.
- Subject `Morning Announcement Request for <Ddd M/D>`, one email per air date.
- Body: "Hello," / "I would like to request a morning announcement for <Ddd M/D>:" / robot image (he pastes it) / the announcement / "Thank you," and his signature.
- Announcement, about 60 words: bold team name "FRC Team 5669 - Techmen Robotics", what, "TODAY - Monday, December 15th" (or "on Monday, ..." for advance), time as students know it ("the start of lunch" when the bell schedule puts lunch there), room ("IDEA Classroom"), who it is for, one action. Sign-off "See you there! Thank you, FRC Team 5669 | Techmen" and "Contact: Mr. Pina | apina@boscotech.edu".
- Bold only the team name and facts a student must keep, and "mandatory" when it is.
- Rotation: Monday mandatory meeting (attendance taken, 80% rule, "Come straight to the meeting, then get your food"), Tuesday recruiting ("Team members, bring a friend"), Friday build and training.
- Create Gmail drafts in apina@boscotech.edu; never send. Student leads may draft; only he sends.

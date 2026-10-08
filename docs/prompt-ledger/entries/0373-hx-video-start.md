# 0373 A ported HTML assignment's video plays from a chapter; Hook 03 chapter players

- Issued: 2026-10-08
- By: IDEA100 R2 chat, directly, Mode: solo
- Repo: `pina-hash/idea-app`
- Owns: `src/lib/classroom/html-assignment/bridge.ts` (`hxVideoStart`, `hxVideoEmbedUrl`),
  `src/lib/classroom/html-assignment/HtmlAssignmentFrame.svelte` (the video key and src),
  `tests/html-assignment-bridge.test.ts`, `docs/standards/IDEA_HTML_ASSIGNMENT_SPEC.md` 1.7,
  `docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md` 1.21, their `REGISTER.md` rows, one
  CLAUDE.md sentence, one `classroom-updates.json` entry.
- Migration permitted: no.
- Status: done.
- Notes: Mr. Pina, 2026-10-08: per-step YouTube links opening new tabs were "really
  annoying"; everything should happen inside the HTML. `idea:video` gains an optional
  whole-second `start`; anything else plays from the beginning, so every posted document is
  unchanged. A new start keys a new player. Verified on the real frame in
  `/dev/html-assignment` (start 137 and 570 reach the embed src; none and junk do not).
  Hook 03's printing moves became chapter players. No block id changed.

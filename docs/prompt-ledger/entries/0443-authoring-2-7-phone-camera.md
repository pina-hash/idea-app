# 0443 Authoring 2.7 and the kit's phone camera

- Issued: 2026-10-26
- By: Mr. Pina, from the IDEA & FRC chat (the patch came from the Unit 4 authoring chat, whose container could not push)
- Owns: tools/hx-kit/** (camera.js, build.mjs, kit.css, host.html, test.mjs, README.md, starter.html), docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md, docs/standards/REGISTER.md (its one row), docs/skills/idea-html-test/SKILL.md, docs/prompt-ledger/entries/0443-*, your own docs/history/ entry
- Migration permitted: no. Claims: none
- Status: pushed
- Mode: solo
- Branch: main (solo)
- Notes: done in the chat itself. Measured 2026-10-26 in Chromium 1243: the rebuilt starter 0 FAIL, 0 WARN, 36 PASS; Launcher: Design rebuilt from its exported document on main with the current kit, 0 FAIL, 1 WARN (the finish line, which warns the same way on the live document), 35 PASS; the live document as exported fails the new phone gate (7 picture boxes with no Take photo) and 2.6's step-move gate (318px), which is the negative control for both.

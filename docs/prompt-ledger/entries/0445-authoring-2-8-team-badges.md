# 0445 Authoring 2.8: team-post badges, and the camera gate's click fallback

- Issued: 2026-10-26
- By: Mr. Pina, from the IDEA & FRC chat (follow-ups to ledger 0443)
- Owns: tools/hx-kit/test.mjs, docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md, docs/standards/REGISTER.md (its one row), docs/prompt-ledger/entries/0445-*, your own docs/history/ entry
- Migration permitted: no. Claims: none
- Status: pushed
- Mode: solo
- Branch: main (solo)
- Notes: done in the chat itself. The camera gate taps, then clicks when the tap opened no chooser; proved on tools/hx-kit/starter.html in Chromium 1243 both ways (default: opened on tap; HX_TEST_CAMERA_PRESS=click: opened on click), 0 FAIL, 0 WARN, 36 PASS each. The Playwright 1.56 stock-Chromium tap failure Mr. Pina reported was not reproduced here (this container's tap delivers a click).

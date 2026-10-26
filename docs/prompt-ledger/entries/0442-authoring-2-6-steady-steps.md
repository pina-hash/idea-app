# 0442 IDEA_HTML_ASSIGNMENT_AUTHORING 2.6 and hx-kit: steps change without moving the page

- Issued: 2026-10-26
- By: Mr. Pina, from the IDEA-Blade chat. Mode: solo.
- Repo: `pina-hash/idea-app`
- Branch: none; docs and kit, pushed straight to `main`.
- Owns: `docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md` (E1, F8, F8b, changelog 2.6), its `REGISTER.md` row, `tools/hx-kit/kit/kit.js` (`kitHoldHeight`, `kitLand`), `tools/hx-kit/test.mjs` (track-click drift and dead-space checks), `tools/hx-kit/starter.html` rebuilt, this entry.
- Does not touch: site code, migrations, `materials/**`.
- Migration permitted: no.
- Status: pushed
- Notes: Mr. Pina found the page jumping when he clicked between steps. Measured in the classroom stand-in: the previous kit moved a track segment by 289, 26, 92, 54, 185, 185 and 120px over seven clicks (the frame shrank under a shorter step, and every click scrolled twice); the new kit moves 0px. Negative control kept in this entry rather than a file: the old `kit.js` built into the starter fails the new check.

# 0439 IDEA_HTML_ASSIGNMENT_AUTHORING 2.4 and hx-kit: the subject palette is real

- Issued: 2026-10-26
- By: Mr. Pina, from the IDEA-Blade chat. Mode: solo.
- Repo: `pina-hash/idea-app`
- Branch: none; docs and kit, pushed straight to `main`.
- Owns: `docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md` (D3, changelog 2.4), its `REGISTER.md` row, `docs/skills/idea-html-assignment/SKILL.md` step 3, `tools/hx-kit/build.mjs` (`palette`, `paletteCss`), `tools/hx-kit/kit/kit.css` (no default hue, `--hx-cs`), `tools/hx-kit/test.mjs` (palette applied, green only reserved, cool-band warning), `tools/hx-kit/starter.src.html` and `starter.html`, `tools/hx-kit/README.md`, this entry.
- Does not touch: site code, migrations, `materials/**`.
- Migration permitted: no.
- Status: pushed
- Notes: Mr. Pina: "Everything's just cyan, blue, purple now." Measured: nothing read `data-hue-from`/`data-hue-to`, so every kit page rendered kit.css's default 195 to 290 (the live IDEA-Blade 02 declared 215 to 300 and rendered oklch hue 195). The new test check reads the rendered value against the declared one; that file would have failed it. Starter passes 30 of 30 in brass and steel (45 to 95, chroma 0.6). IDEA-Blade 02 re-posted in ember (15 to 70), with fight night and forged steel rendered as alternatives for him to pick.

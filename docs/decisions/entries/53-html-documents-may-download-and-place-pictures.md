# 53 A ported HTML assignment may save a file, and draws a student's picture in its own box

- Raised: 2026-10-07  By: feedback round 2026-10-07 (ledger 0368), reports R03 and R07.
- Status: DECIDED 2026-10-07. Mr. Pina's report R07 ("download button ... is not working") is the authorisation for the sandbox widening; the picture placement is this round's default and a correction is one line.
- Decision: `allow-downloads` joins `HX_SANDBOX_FLAGS`, the second widening after the popup flags (decision recorded with 0153). `allow-same-origin`, `allow-top-navigation`, `allow-forms` and `allow-modals` stay refused. A student's stored picture is drawn by the portal OVER the box the document reports for it (the video precedent of ledger 0349), so no bytes go back into the document and the CSP is unchanged; clicking it opens the classroom picture viewer. A live document shows pictures in place only after it is re-uploaded with the box reporter; until then the strip under the frame gains Enlarge and Download, and a file that is not a picture becomes a file row.
- Why it is his: the sandbox flag set is a security boundary.
- Context: `src/lib/classroom/html-assignment/bridge.ts`; `docs/standards/IDEA_HTML_ASSIGNMENT_SPEC.md`.

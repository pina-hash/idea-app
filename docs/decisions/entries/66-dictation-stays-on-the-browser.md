# 66 Dictation stays on the browser's own speech recognition

- Raised: 2026-10-14  By: the dictation reports in the 2026-10-14 exports (ledger 0381), which raised whether speech-to-text should move from the browser to a server-side service.
- Status: DECIDED 2026-10-14 by Mr. Pina's answer "Stay on the browser" (ledger 0381).
- Decision: Dictation keeps using the browser's built-in Web Speech recognition through the one driver (`Dictation` in `$lib/feedback/dictation.ts`). No audio leaves the device for a service of ours, nothing is recorded or stored, and there is no cost or new credential. Accuracy work stays in how the transcript is shaped and joined.
- Context: CLAUDE.md "DICTATION IS ONE DRIVER AND ONE APPEND".

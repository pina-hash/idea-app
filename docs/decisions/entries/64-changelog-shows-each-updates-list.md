# 64 The changelog shows each update's list of changes and hides bookkeeping

- Raised: 2026-10-14  By: the changelog reports in the 2026-10-14 exports (ledger 0381), which raised what an update in the changelog should show.
- Status: DECIDED 2026-10-14 by Mr. Pina's answer "Missing detail" (ledger 0381).
- Decision: An update in the changelog shows its short list of what changed (the bullet lines a commit's body carries, up to six). Repository bookkeeping (prompt-ledger lines, migration-applied records, migration claims, and git's own merge subjects) is kept in the history but never shown and never counts as a version a reader sees.
- Consequence for every later session: a commit that changes what people see writes its body as short, reader-facing `- ` bullets.
- Context: CLAUDE.md "A COMMIT'S BODY BULLETS ARE THE UPDATE'S LIST OF CHANGES".

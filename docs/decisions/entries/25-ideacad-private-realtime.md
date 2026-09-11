# 25 Should IdeaCAD use authorized private Realtime channels?

- Raised: 2026-09-11  By: ledger 0145
- Status: open
- Decision needed: whether to add a `realtime.messages` policy and private channels to prevent forged preview frames.
- Default: do it in the next bundle. The shipped roster/revision filter plus 15-second database reread bounds a forged intermediate preview and permits no write, but private channels close the remaining display cost.

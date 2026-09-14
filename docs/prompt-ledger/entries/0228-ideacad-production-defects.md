# 0228 IdeaCAD production width and document open defects

- Issued: 2026-09-14
- By: router chat
- Owns: `src/routes/ideacad/**`, `src/lib/ideacad/app/**`, the layout wrapping
  `/ideacad`, `docs/prompt-ledger/entries/0228-*`, and its own `docs/history/`
  entry.
- Migration permitted: no. **Claims: none.**
- Status: pushed
- Branch: `codex/ideacad-production-defects-0228`, branched from the supplied working tree.
- Notes: removes the inherited 880px page ceiling from the IdeaCAD workspace,
  opens listed existing documents through their document-keyed read transport,
  and exposes the transport's actual refusal instead of replacing it.

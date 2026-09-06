# 0073 Finish 0072: give the migration a probe, and find out if we can reach the database
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: prompt 0072's migration and app changes on `claude/upload-limit-fiction-jv9w43`, `docs/prompt-ledger/entries/0073-*`, and its own `docs/history/` entry.
- Migration permitted: exactly one, the file 0072 wrote, number re-verified at commit time. Highest on origin/main at issue: 0184
- Status: pushed
- Branch: assigned by the harness, starting from `claude/upload-limit-fiction-jv9w43`
- Notes: Prompt 0072 finished its work and could not apply it, for two
  reasons it established precisely.
  
  ONE, now fixed outside the repo: the container's egress allowlist blocked
  `registry.npmjs.org`, so `npm ci` failed and the tool could not load `pg`.
  It stopped before opening a socket, so whether a cloud container can reach
  the pooler is STILL UNPROVEN.
  
  TWO, a real collision between the router chat's scope rule and the tool's
  precondition. 0072 was told the migration should write "storage.buckets
  rows and nothing else. No policy, no table, no function." `idea-status.py`
  derives a probe from the first object a migration CREATES. A migration
  creating nothing has no probe, so its applied-state reads `unknown`, and
  `orderVerdict` refuses because cannot-say is never a pass. Measured:
  `first_object(0185) -> None`.
  
  That rule is right and the scope was wrong. A migration that cannot be
  probed cannot be confirmed applied, by anyone, ever -- which is the whole
  reason the rule exists. So the migration gains one probeable object, and
  the obvious one is useful in itself: a function returning the global
  ceiling, so the database states the number rather than only the app.
  
  0072 also rejected two workarounds for good reasons, recorded here so
  nobody retries them: a CHECK on `storage.buckets` would be probeable but
  Supabase owns that table as `supabase_storage_admin` and the ALTER would
  likely fail on production; and a view or function was what its own scope
  rule excluded.
  
  Deliberately excluded: everything 0072 already settled -- the 45 MiB
  arithmetic, the per-bucket table, the SVG answer, both controls.

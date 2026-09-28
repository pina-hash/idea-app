# 42 The feedback console moves to /admin/feedback

- Raised: 2026-09-28  By: feedback round 2026-09-28, report R03.
- Status: DECIDED 2026-09-28 by Mr. Pina ("/admin/feedback").
- Build: OPEN, session 1 of `docs/feedback/2026-09-28/QUEUE.md`.
- Decision: The site-wide feedback console leaves `/classroom/feedback` and lives at `/admin/feedback`, with the old address answering a 307 to the new one after the same admin gate, so a non-admin still gets 404.
- Default this assistant would pick: the same.
- Why it was blocked on him: `/feedback` needs a short-link reservation migration (`RESERVED_SLUGS` and `_app_short_link_reserved` move together); `/admin/feedback` needs none because `admin` is already reserved.
- What it unblocks: the feedback half of the 2026-09-28 build session (`docs/feedback/2026-09-28/QUEUE.md`).
- Context: `docs/feedback/2026-09-28/TRIAGE.md` R03. The console leaves the classroom shell, so it takes the portal chrome and its report control from the root layout; CLAUDE.md's "the console at `/classroom/feedback`" line is edited in place by the build session.

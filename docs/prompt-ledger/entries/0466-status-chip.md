# 0466 One StatusChip and one tone map across the site

- Issued: 2026-10-28
- By: Mr. Pina, in the IDEA & FRC chat "IDEA Website Feedback Pass Ranked List" ("Fold in a site-wide color and geometry pass"). Queue: `docs/feedback/2026-10-28/QUEUE-site-ui-pass.md`, section "Lane 0466"
- Model: Opus 5.5, effort high
- Repo: `pina-hash/idea-app`
- Owns: a new StatusChip component and tone map in `src/lib/ui/`, every `.tone-*` definition and status `*-chip` class in `src/` and their call sites, except files lane 0467 owns; the lane's tests; one `classroom-updates.json` entry where students see a change; its `docs/history/` entry; this entry.
- Starts: after 0465 lands and after 0455, 0456, 0457, 0458 and 0463 land; alongside 0467
- Migration permitted: no. Claims: none
- Status: pushed
- Mode: solo
- Branch: main (solo)

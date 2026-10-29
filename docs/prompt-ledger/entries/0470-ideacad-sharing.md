# 0470 IdeaCAD sharing: pick people, see who has it, confirm every change

- Issued: 2026-10-28
- By: Mr. Pina, in the IDEA & FRC chat ("also do the idea kit sharing. The IdeaCAD sharing thing."). Queue: `docs/feedback/2026-10-28/QUEUE-0470.md`
- Model: Opus 5.5, effort high
- Repo: `pina-hash/idea-app`
- Owns: the IdeaCAD sharing UI and its reads and writes in `src/lib/ideacad/` and `src/routes/ideacad/`, a reusable person-picker in `src/lib/ui/` unless lane 0455's has landed, the IdeaCAD sharing entries in `src/lib/server/connector/registry/` (additive), new `ideacad_*` sharing migration files, `tests/*ideacad*share*`, `tests/db/*ideacad*share*`, `docs/subsystems/ideacad.md` sharing lines, one `classroom-updates.json` entry, its `docs/history/` entry, this entry.
- Does not touch: tournaments (0455), team documents (0456), grading (0457), HTML assignments (0458), Armory (0463), the color and geometry pass (0465 to 0469).
- Migration permitted: yes, as many as needed, each under the next free migration number at landing. Claims: 0325
- Status: pushed
- Mode: solo (beside 0455, 0456, 0457 and 0463, which own no IdeaCAD files)
- Branch: main (solo)

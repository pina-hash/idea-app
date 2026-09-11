---
title: "IdeaCAD Blade editor"
date: "2026-09-11"
branches: ["codex/0145-ideacad"]
migrations: [0201]
subsystems: ["Classroom", "IdeaCAD", "Realtime", "Testing"]
---

Ledger 0145 adds the schema-4 Blade concept engine, its four-table data model, derived geometry and physics, SolidWorks-oriented control math, broadcast live transport, and the real editor harness.

Apply `supabase/migrations/0201_ideacad_blade_editor.sql` first in the Supabase SQL editor. Run the verification query at its foot and require all rows to say `ok = true` before deploying the client. Do not apply it from a cloud session.

Realtime could not be measured against production from this container because it has placeholder credentials and production connections are forbidden. Ship 4 Hz, adapt to 10 Hz only below 150 ms p95. Mr. Pina must run `/dev/coop-netcheck` on two school-network machines at 25 Hz for 60 seconds and record median, p95, and loss.

Before class, weigh the hex core, hex collar, and tip bolt and enter their gram masses in the IdeaCAD editor config; measure launcher across-flats and enter inches there too. Confirm SolidWorks arrow increment, wheel direction, Rotate about scene floor, perspective default, rotation-center persistence, and mouse speed on the lab installation, then calibrate the corresponding config.

Follow-ons not started: editors for other projects; STL/STEP/DXF export; grading automation; hex-core CSG; profile fillets; linked split viewport; server revision snapshots; mouse gestures; View Selector cube; Track 2 geometry; teacher-to-student channel; team compare; private Realtime channels. Each needs a separately scoped data, geometry, or authorization design.

The checkout contradicted the prompt's remote instructions: it has no `origin` refs and uses local branch `work`, as the Codex environment document predicts. Chromium availability and all visual measurements remain to be established by the verification run; this record does not claim that preview rendering or the school-network channel was verified.

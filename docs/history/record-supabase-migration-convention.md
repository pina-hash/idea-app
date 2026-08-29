---
title: "Supabase migration convention"
date: 2026-06-20
branches: []
migrations: []
subsystems: ["Curriculum, migrations, policy"]
record_order: 17
---

- SQL lives in `supabase/migrations/`, sequentially numbered:
  `0001_*.sql`, `0002_*.sql`, ...
- Migrations are applied **manually in the Supabase SQL editor** (no automated
  migration runner yet).
- Migrations should be idempotent where practical (`create or replace`,
  `if not exists`, `drop ... if exists` before `create`).


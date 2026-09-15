---
migration: "0216"
file: 0216_ideacad_direct_documents.sql
sha256: 1da9a9aee9ab7909bd630209781f9823e4a49f2f3892f46bb4fc2398601ac4f8
sha256_covers: repo bytes at commit baf2106ad1e816b5861e238fe8b92daae447c6ee
applied_at: 2026-09-15
recorded_at: 2026-09-15T10:05:41.170Z
source: report
attested_by: Alejandro
evidence: verification-output
ledger: "ideacad-direct-modeler"
recorded_by_ledger: "ideacad-direct-modeler"
branch: codex/ideacad-direct-modeler
commit: baf2106ad1e816b5861e238fe8b92daae447c6ee
outcome: applied
---

# 0216 applied by hand

**This record rests on Alejandro's report of 2026-09-15, not on a measurement made by this repository.** No process in this repository has ever connected to the production database. `0216_ideacad_direct_documents.sql` was pasted into the Supabase SQL editor by hand; what is written below is what was reported back, and nothing here was observed by the tool that wrote it.

`session_user` and `database` are absent on purpose. In a record written by `tools/apply-migration.mjs` they are answers the SERVER gave to a query, and this tool spoke to no server, so it has no honest value for either. The absence is the signal.

## Authorisation

- Ledger entry: `docs/prompt-ledger/entries/ideacad-direct-modeler.md`
- `Migration permitted: yes, standalone documents require an additive migration. Claims: 0216. Highest on origin/main at issue: 0215.`
- Written on `codex/ideacad-direct-modeler`.
- Recorded, later and separately, by ledger `ideacad-direct-modeler`. This task wrote the migration and records Alejandro's manual application; it did not apply it.

## What was reported back

As supplied to this tool, with anything shaped like a connection string masked. The values are reproduced and NOT interpreted: whether a particular `false` is a pass or a failure is a question about the query that produced it, and this tool did not write that query and did not run it.

```
Alejandro reported on 2026-09-15: "I applied the migration."
The supplied migration 0216 result returned these 27 rows:

examined | ready
RLS and grants: ideacad_assignment_sections | true
RLS and grants: ideacad_brep_artifacts | true
RLS and grants: ideacad_rule_revisions | true
client function: public.ideacad_advisory_rules() | true
client function: public.ideacad_create_direct_document(text,text) | true
client function: public.ideacad_direct_concept_history(uuid,bigint,integer) | true
client function: public.ideacad_direct_documents() | true
client function: public.ideacad_link_direct_document(uuid,uuid) | true
client function: public.ideacad_open_direct_document(uuid) | true
client function: public.ideacad_read_brep_artifacts(uuid,text[]) | true
client function: public.ideacad_save_direct_document(uuid,integer,uuid,text,jsonb,jsonb,jsonb) | true
client function: public.ideacad_set_advisory_rules(bigint,jsonb) | true
client function: public.ideacad_set_direct_document_archived(uuid,boolean) | true
client function: public.ideacad_share_direct_document(uuid,text,text) | true
client function: public.ideacad_share_direct_document_with_section(uuid,uuid) | true
client function: public.ideacad_unshare_direct_document_from_section(uuid,uuid) | true
direct document deletion protection | true
operation receipt uniqueness | true
private function: public._ideacad_direct_apply_action(jsonb,jsonb) | true
private function: public._ideacad_direct_can_write(uuid) | true
private function: public._ideacad_direct_manager(uuid) | true
private function: public._ideacad_direct_payload(uuid) | true
private function: public._ideacad_direct_validate_model(jsonb) | true
private function: public._ideacad_direct_validate_sketches(jsonb) | true
private function: public._ideacad_preserve_direct_document() | true
private function: public._ideacad_valid_advisory_limits(jsonb) | true
standalone document item nullable | true
```

Alejandro explicitly authorized release to main after supplying all 27 ready=true rows. This same task authored the migration and records his manual application; the task did not apply it.

## What a verification query would cover

No probe could be derived for this file, so this record names no object list. `tools/idea-status.py` derives a probe from a migration's FIRST object and answers nothing for some shapes; that is a limit of the derivation and not a claim about the file.

## What this record does not prove

That the migration was a good idea, that a backfill inside it did the right thing, or that the database still holds what it held on the day above. It is one person's report, written down where the next session can find it instead of nowhere.

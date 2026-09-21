---
migration: "0217"
file: 0217_ideacad_feature_graph.sql
sha256: 1e7f0fcd337e2ade79265c1e29dc5a9a0effd7bbd27df5ab394590eb76f5e61a
sha256_covers: repo bytes at commit e0f64e50d4ddb7a6c46d097a291f018e87a02529
applied_at: 2026-09-21
recorded_at: 2026-09-21T13:41:25.787Z
source: report
attested_by: Mr. Pina
evidence: verification-output
ledger: "0273"
recorded_by_ledger: "0273"
branch: claude/optimistic-mayer-rcq01p
commit: e0f64e50d4ddb7a6c46d097a291f018e87a02529
outcome: applied
---

# 0217 applied by hand

**This record rests on Mr. Pina's report of 2026-09-21, not on a measurement made by this repository.** No process in this repository has ever connected to the production database. `0217_ideacad_feature_graph.sql` was pasted into the Supabase SQL editor by hand; what is written below is what was reported back, and nothing here was observed by the tool that wrote it.

`session_user` and `database` are absent on purpose. In a record written by `tools/apply-migration.mjs` they are answers the SERVER gave to a query, and this tool spoke to no server, so it has no honest value for either. The absence is the signal.

## Authorisation

- Ledger entry: `docs/prompt-ledger/entries/0273-ideacad-feature-graph.md`
- `Migration permitted: yes, exactly one. Claims: 0217. Highest on origin/main at issue: 0216`
- Written on `claude/optimistic-mayer-rcq01p`.
- Recorded, later and separately, by ledger `0273`. That bundle did not write this migration and did not apply it.

## What was reported back

As supplied to this tool, with anything shaped like a connection string masked. The values are reproduced and NOT interpreted: whether a particular `false` is a pass or a failure is a question about the query that produced it, and this tool did not write that query and did not run it.

```
| examined                                                                              | expected | actual | ok   |
| ------------------------------------------------------------------------------------- | -------- | ------ | ---- |
| client function: public.ideacad_create_folder(text)                                   | true     | true   | true |
| client function: public.ideacad_delete_folder(uuid)                                   | true     | true   | true |
| client function: public.ideacad_direct_documents()                                    | true     | true   | true |
| client function: public.ideacad_direct_folders()                                      | true     | true   | true |
| client function: public.ideacad_direct_trash()                                        | true     | true   | true |
| client function: public.ideacad_duplicate_direct_document(uuid,text)                  | true     | true   | true |
| client function: public.ideacad_link_direct_document(uuid,uuid)                       | true     | true   | true |
| client function: public.ideacad_move_direct_document(uuid,uuid)                       | true     | true   | true |
| client function: public.ideacad_purge_direct_document(uuid)                           | true     | true   | true |
| client function: public.ideacad_rename_direct_document(uuid,text)                     | true     | true   | true |
| client function: public.ideacad_rename_folder(uuid,text)                              | true     | true   | true |
| client function: public.ideacad_restore_direct_document(uuid)                         | true     | true   | true |
| client function: public.ideacad_set_direct_document_archived(uuid,boolean)            | true     | true   | true |
| client function: public.ideacad_set_direct_document_thumbnail(uuid,text)              | true     | true   | true |
| client function: public.ideacad_share_direct_document(uuid,text,text)                 | true     | true   | true |
| client function: public.ideacad_tag_direct_document(uuid,text[])                      | true     | true   | true |
| client function: public.ideacad_trash_direct_document(uuid)                           | true     | true   | true |
| column ideacad_documents.deleted_at                                                   | true     | true   | true |
| column ideacad_documents.deleted_by                                                   | true     | true   | true |
| column ideacad_documents.folder_id                                                    | true     | true   | true |
| column ideacad_documents.tags                                                         | true     | true   | true |
| column ideacad_documents.thumbnail                                                    | true     | true   | true |
| NEGATIVE CONTROL (expected false): a column this file never adds exists               | false    | false  | true |
| NEGATIVE CONTROL (expected false): anon may call ideacad_purge_direct_document        | false    | false  | true |
| preserve trigger present and admits only a purge                                      | true     | true   | true |
| private function: public._ideacad_clean_tags(text[])                                  | true     | true   | true |
| private function: public._ideacad_direct_can_write(uuid)                              | true     | true   | true |
| private function: public._ideacad_direct_payload(uuid)                                | true     | true   | true |
| private function: public._ideacad_direct_validate_model(jsonb)                        | true     | true   | true |
| private function: public._ideacad_preserve_direct_document()                          | true     | true   | true |
| private function: public._ideacad_purge_expired_direct_documents()                    | true     | true   | true |
| private function: public._ideacad_trash_window()                                      | true     | true   | true |
| table ideacad_folders: RLS on, authenticated SELECT only, anon nothing                | true     | true   | true |
| trash is unlinked-only on the row (constraint ideacad_documents_trash_unlinked_check) | true     | true   | true |
| validator accepts ideacad-solid-v2                                                    | true     | true   | true |
```

Pasted from the branch at e0f64e50 (sha256 1e7f0fcd337e2ade79265c1e29dc5a9a0effd7bbd27df5ab394590eb76f5e61a); the readiness query's 35 rows all ok, both negative controls false, reported back in chat on 2026-09-21.

## What a verification query would cover

No probe could be derived for this file, so this record names no object list. `tools/idea-status.py` derives a probe from a migration's FIRST object and answers nothing for some shapes; that is a limit of the derivation and not a claim about the file.

## What this record does not prove

That the migration was a good idea, that a backfill inside it did the right thing, or that the database still holds what it held on the day above. It is one person's report, written down where the next session can find it instead of nowhere.

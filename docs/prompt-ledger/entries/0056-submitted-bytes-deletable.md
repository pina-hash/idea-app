# 0056 The row is locked and the bytes are not
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: exactly one migration (number taken at commit time), the submission-file server route, the submission-file paths in `src/lib/classroom/transports.ts`, `tests/db/classroom-submission-file*`, `tests/classroom-storage-objects.test.ts`, the generated regions of `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0056-*`, and its own `docs/history/` entry.
- Migration permitted: exactly one, number taken at commit time. Highest on origin/main at issue: 0180
- Status: issued
- Branch: assigned by the harness
- Notes: Prompt 0054 put the student submission boundary to a real student
  across ten cases and answered the question it was sent for: no, a student
  cannot read another student's work. It found one defect on the way.

  `classroom_delete_submission_file` refuses when the submission is
  `submitted`. The storage policy beside it,
  `submission files delete own submission`, asks
  `classroom_owns_submission_object` and nothing else. So a student turns in
  work, the row delete answers `locked`, and a plain
  `delete from storage.objects` removes the bytes anyway. The row survives
  naming an object that is gone; the teacher who is allowed to read it reads
  zero, and the download 404s in a way that reads as a platform fault rather
  than as something the student did.

  The scoping is ownership, mutation-proved, so a student can destroy only
  their OWN work. That is self-harm plus a teacher's confusion, not a
  disclosure and not a cross-student reach. It is why 0054 did not ship a
  migration from a test bundle and why this is a normal lane rather than an
  incident.

  0054 also measured why the OBVIOUS fix is wrong. A `state <> 'submitted'`
  narrowing would break the orphan sweep: the server route uploads bytes
  first and, when the row insert answers `locked`, sweeps the orphan with the
  STUDENT'S OWN client, in exactly that case. Narrowing on the submission
  would leave an orphan behind on every such pick. The correct predicate keys
  on the ROW rather than on the submission, and 0054 applied it to a fixture
  and measured all four cases before handing it on.

  A milder twin, recorded not fixed by 0054: the insert policy is
  ownership-only too, so bytes can land against a submitted hand-in. No row
  can name them, so nothing serves or lists them.

  Deliberately excluded: the type and size questions, which 0054 established
  are governed by the private bucket and the signed URL's
  `Content-Disposition`, not by anything about the file; and the read
  boundary, which is proved correct.

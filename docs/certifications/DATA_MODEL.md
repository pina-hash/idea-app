# IDEA Certification Portal: data model and function catalog

The build contract for ledger 0391. `docs/CERTIFICATIONS.md` is the authority on
WHAT the portal does; this file is the authority on HOW the pieces name each
other: every table, every database function (its signature, who may call it,
what it returns), every route, and which build surface owns which files.
`docs/certifications/DECISIONS.md` records why each open design point went the
way it did. `docs/certifications/PACKAGE_FORMAT.md` documents the import and
export package.

Conventions that hold everywhere below:

- Every table is `cert_`-prefixed, has row level security ON, and carries NO
  client grant and NO policy (the storage bucket's objects are the one
  exception, below). Every read and write is a `security definer` function with
  `set search_path = ''`.
- Every function revokes `from public, anon, authenticated, service_role` BY
  NAME, then grants back exactly the roles listed in its row. `_cert_*`
  functions are private: no grant at all.
- The caller is `_cert_caller()`: `lower(btrim(current_user_email()))`, which
  RAISES when it is `''` (no session). Admin is `is_admin()`. A certifier of a
  certification is `_cert_can_certify(certification_id)`: admin, or a live row
  in `cert_authority` for the caller.
- "Not found" and "not yours" answer identically: a refusal that a caller must
  render returns `{ "ok": false, "reason": "<slug>", "message": "<sentence>" }`
  jsonb; a probe of an id that is not theirs returns the same shape with
  `reason: "not_found"`. Genuine misuse (a malformed argument) raises.
- Every successful write returns `{ "ok": true, ... }` and, when the write
  produced notifications, a `notify` array of notification rows (shape under
  `cert_notifications`) so the SERVER route that called it can send the email
  and the push. Student-triggered browser RPCs that produce no notification
  (watch reports, exam answers, exam flags, practice results) are called from
  the browser directly; everything that notifies somebody goes through a
  SvelteKit server action or API route on `locals.supabase` (the caller's own
  client, never a service-role one).
- Timestamps are `timestamptz`; the client formats them in
  `America/Los_Angeles`. Dates named to a student are written as a date,
  never a weekday name.
- Enumerations are TEXT with CHECK constraints, mirrored one-for-one in
  `src/lib/certifications/types.ts`. Adding a value is a migration plus a type.

## Enumerations

| name | values |
| --- | --- |
| certification state | `draft`, `published`, `retired` |
| renewal | `never`, `school_year` |
| part | `training`, `guided`, `exam`, `autonomous`, `checkout` (in this fixed order) |
| check state | `pending`, `done`, `waived` |
| attempt state | `active`, `withdrawn`, `dormant`, `complete` |
| submission part | `guided`, `autonomous`, `checkout` |
| submission state | `pending`, `passed`, `failed` |
| review decision | `pass`, `fail` |
| seat state | `requested`, `approved`, `declined`, `booked`, `cancelled`, `used` |
| exam state | `released`, `in_progress`, `submitted`, `expired` |
| exam flag kind | `blur`, `hidden`, `fullscreen_exit`, `resize`, `copy`, `paste`, `contextmenu` |
| question type | `multiple_choice`, `multiple_select`, `numeric`, `short` |
| award status (stored) | `active`, `suspended`, `revoked` |
| award status (shown) | `valid`, `suspended`, `revoked`, `expired` (expired is DERIVED: stored `active` with `expires_at < now()`) |
| award history action | `awarded`, `suspended`, `reinstated`, `revoked`, `corrected` |
| notification kind | `part_checked`, `review_returned`, `sitting_approved`, `sitting_declined`, `cooldown_ended`, `awarded`, `suspended`, `reinstated`, `revoked`, `expiring`, `queue_submission`, `queue_request` |
| training item kind | `video`, `lesson` |
| event kinds | free text, dotted: `attempt.started`, `attempt.withdrawn`, `attempt.dormant`, `attempt.revived`, `attempt.complete`, `check.done`, `submission.sent`, `review.decided`, `seat.requested`, `seat.decided`, `seat.booked`, `seat.cancelled`, `exam.released`, `exam.opened`, `exam.flag`, `exam.submitted`, `exam.passed`, `exam.failed`, `watch.session`, `practice.answered`, `award.granted`, `award.suspended`, `award.reinstated`, `award.revoked`, `award.corrected`, `award.expiring`, `catalog.saved`, `catalog.published`, `catalog.hidden`, `catalog.retired`, `catalog.deleted`, `authority.granted`, `authority.revoked`, `settings.changed`, `sync.sent`, `error` |

## The revision package

`cert_revisions.package` holds one certification's whole definition as jsonb.
The same object is what the export ZIP's `certification.json` carries (minus
the files it splits out) and what `cert_admin_save` takes. Its shape is
`CertPackage` in `src/lib/certifications/types.ts` and is documented field by
field in `PACKAGE_FORMAT.md`. The keys that the database itself reads:

```
{
  "format": "idea-certification", "version": 1,
  "code": "MILL-1", "name": "...", "level": 1, "category": "Machining", "sort_order": 10,
  "renewal": "never" | "school_year",
  "definition": "...", "allows": "...", "does_not_allow": "...",
  "prerequisites": ["SAFE-1"],
  "parts": { "guided": true, "exam": true, "autonomous": true, "checkout": true },
  "training": { "items": [ { "kind": "video", "key": "yt:<id>", "title": "...", "youtube_id": "<id>", "start": 0 }
                            | { "kind": "lesson", "key": "lesson:<slug>", "title": "...", "slug": "<slug>" } ],
                "quick_checks": [ { "id": "...", "after": "<item key>", "prompt": "...", "options": ["..."], "answer": 0, "explain": "..." } ] },
  "practice_quiz": [ { "id": "...", "prompt": "...", "options": ["..."], "answer": 0, "explain": "..." } ],
  "study_guide": "<markdown>",
  "common_mistakes": [ { "title": "...", "body": "..." } ],
  "exam": { "time_limit_minutes": 30, "questions_per_exam": 20,
            "topics": [ { "id": "setup", "name": "Setup", "minimum": 2 } ] },
  "guided_project": { "objective": "...", "spec": "<markdown>", "acceptance": ["..."], "references": [ { "label": "...", "href": "https://..." } ],
                      "steps": [ { "title": "...", "body": "<markdown>", "fade": "full" | "goal" | "hint", "hint": "..." } ],
                      "self_inspection": ["..."], "evidence": [ { "kind": "photo" | "file" | "text" | "link" | "youtube", "label": "...", "required": true } ] },
  "autonomous_project": { "objective": "...", "spec": "<markdown>", "acceptance": ["..."], "references": [...], "self_inspection": ["..."], "evidence": [...] },
  "checkout": { "card": "<markdown>", "filming_guide": "<markdown>" }
}
```

`training` is ALWAYS required (the kit must hold at least one item to publish).
The other four parts are waivable per revision through `parts`; a waived part's
check row is created as `waived` so the checklist still names it.

The exam question POOL is NOT in the package jsonb: it lives in
`cert_exam_questions`, replaced whole by `cert_exam_pool_replace`, and travels in
the export ZIP as `exam-pool.json`. HTML lessons live in `cert_lessons` and
travel as `lessons/<slug>.html` plus `lessons/<slug>.manifest.json`.

## Tables

### 0260 `cert_engine`: catalog, revisions, lessons, pool, authority, settings, events

0260 ALSO RESERVES THE SLUG: its last section re-creates `_app_short_link_reserved` with `'certifications'` added in order, in `0215_short_link_reserve_ideacad.sql`'s exact shape (a moves row for any existing `certifications` short link, the predicate, the named revokes, the literal-count self-check at 37), because `tests/short-link-reserved-names.test.ts` sweeps `src/routes` for slug-shaped directories and asserts the deployed predicate names the identical set. That test applies ONLY its own chain (0001, 0003, 0020, 0067, 0093, 0137, 0156, 0166, 0196, 0215, 0231, then 0260), so **0260 may reference nothing outside those files**: `profiles` (0001, 0020), `app_admins`, `is_admin()`, `current_user_email()` (0067), `_notebook_*` bridges are NOT in that chain and 0260 must not call them (0263's `_cert_notify` may, because 0263 is never applied there). 0260 opens with `create table if not exists public.cert_settings`, a genuinely new object, so the production probe keys on it.

| table | columns (type, rule) |
| --- | --- |
| `cert_settings` | `id boolean primary key default true check (id)`, `school_year_expiry date null`, `dormancy_days int not null default 60 check (1..3650)`, `checkin_timeout_seconds int not null default 60 check (10..600)`, `release_window_minutes int not null default 10 check (1..120)`, `updated_at timestamptz`, `updated_by text` |
| `cert_certifications` | `id uuid pk default gen_random_uuid()`, `code text not null unique check (code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9-]{0,31}$')`, `name text not null`, `level int not null check (level between 1 and 9)`, `category text not null`, `sort_order int not null default 0`, `state text not null default 'draft'`, `renewal text not null default 'never'`, `current_revision_id uuid null` (FK added after revisions), `created_at`, `created_by text`, `updated_at`, `published_at`, `retired_at` |
| `cert_revisions` | `id uuid pk`, `certification_id uuid not null fk`, `revision int not null`, `package jsonb not null`, `note text`, `created_at`, `created_by text`; `unique (certification_id, revision)`. Immutable: no function updates a row. |
| `cert_prerequisites` | `certification_id uuid fk`, `requires_id uuid fk`, pk on both, check they differ. Rewritten from the package on every save. |
| `cert_lessons` | `id uuid pk`, `certification_id uuid fk`, `slug text not null check (~ '^[a-z0-9][a-z0-9-]{0,63}$')`, `title text not null`, `document text not null check (length <= 1500000)`, `manifest jsonb not null default '{}'`, `created_at`, `updated_at`, `updated_by text`; `unique (certification_id, slug)` |
| `cert_exam_questions` | `id uuid pk`, `certification_id uuid fk`, `topic text not null`, `type text not null`, `prompt text not null`, `options jsonb null` (array of `{ "key": "a", "text": "..." }` for choice types), `answer jsonb not null` (`"a"` / `["a","c"]` / `{ "value": 12.5, "tolerance": 0.1, "unit": "mm" }` / `{ "accept": ["ream", "reamer"] }`), `explain text null`, `active boolean not null default true`, `created_at`, `updated_at`; index on `(certification_id, topic) where active` |
| `cert_authority` | `certification_id uuid fk`, `email text not null check (lower, has @)`, `granted_by text`, `granted_at`, `note text`, `revoked_at timestamptz null`, `revoked_by text`; pk `(certification_id, email)` |
| `cert_events` | `id bigserial pk`, `at timestamptz default now()`, `kind text not null`, `actor_email text`, `subject_email text`, `certification_id uuid`, `attempt_id uuid`, `reason text`, `payload jsonb not null default '{}'`; indexes on `(at desc)`, `(subject_email, at desc)`, `(certification_id, at desc)`. Append-only: no function updates or deletes. |

### 0261 `cert_attempts`: attempts, checks, submissions, reviews, training progress, evidence bucket

| table | columns |
| --- | --- |
| `cert_attempts` | `id uuid pk`, `certification_id uuid fk`, `revision_id uuid fk`, `email text not null`, `state text not null default 'active'`, `started_at`, `finished_at null`, `withdrawn_at null`, `dormant_at null`, `last_activity_at`; unique partial index `(certification_id, email) where state in ('active','dormant')` |
| `cert_checks` | `attempt_id uuid fk`, `part text not null`, `state text not null default 'pending'`, `checked_by text null`, `checked_at null`, `note text`; pk `(attempt_id, part)` |
| `cert_submissions` | `id uuid pk`, `attempt_id uuid fk`, `part text not null check in (guided, autonomous, checkout)`, `evidence jsonb not null` (`{ "text": "...", "links": ["https://..."], "youtube_id": "..." | null, "files": [ { "path": "<attempt_id>/<uuid>.<ext>", "name": "...", "size": 123 } ] }`), `self_inspection jsonb not null default '[]'` (array of `{ "item": "...", "checked": true }`), `in_person boolean not null default false`, `state text not null default 'pending'`, `submitted_at`, `decided_at null` |
| `cert_reviews` | `id uuid pk`, `submission_id uuid fk`, `reviewer_email text not null`, `decision text not null`, `feedback text not null default ''` (required non-empty on fail), `reviewed_at` |
| `cert_training_progress` | `email text`, `certification_id uuid`, `item_key text` (`yt:<id>` or `lesson:<slug>`), `item_kind text`, `duration_seconds numeric null`, `ranges jsonb not null default '[]'` (sorted, merged `[[start,end],...]`), `covered_seconds numeric not null default 0`, `completed_at null`, `updated_at`; pk `(email, certification_id, item_key)` |
| `cert_watch_sessions` | `id bigserial pk`, `email`, `certification_id`, `item_key`, `at timestamptz`, `played_seconds numeric`, `max_rate numeric`, `checkins_missed int`, `coverage numeric` (telemetry, append-only) |
| `cert_practice_results` | `id bigserial pk`, `email`, `certification_id`, `kind text check in (quick, practice)`, `item_id text`, `correct boolean`, `at` (append-only) |
| storage | bucket `cert-evidence`, private, `file_size_limit` 47185920 (45 MiB, the class notice's figure: the project's `tests/upload-limits.test.ts` holds every bucket under the 50,000,000-byte global, so 50 MiB is refused), registered in `src/lib/upload-limits.ts` as `cert-evidence`. Objects are keyed `<attempt_id>/<uuid>.<ext>`. Policies on `storage.objects` for `bucket_id = 'cert-evidence'`: INSERT for `authenticated` where `_cert_attempt_owner(_cert_storage_prefix_uuid(name))`; SELECT for `authenticated` where owner OR `_cert_can_certify(<attempt's certification>)` through `_cert_can_read_evidence(uuid)`. The storage half sits in a guarded `do` block that NOTICEs where the applying role cannot write `storage.buckets`, exactly as 0233 does. |

### 0262 `cert_exam`: sittings, seats, exam attempts

| table | columns |
| --- | --- |
| `cert_sittings` | `id uuid pk`, `series_id uuid null`, `certification_id uuid null fk` (null = any certification), `starts_at timestamptz not null`, `ends_at timestamptz not null check (> starts_at)`, `seat_limit int not null check (1..200)`, `location text`, `note text`, `state text not null default 'open' check in (open, closed, cancelled)`, `created_by text`, `created_at` |
| `cert_seats` | `id uuid pk`, `attempt_id uuid fk`, `certification_id uuid fk`, `email text`, `sitting_id uuid null fk`, `state text not null`, `requested_at`, `note text`, `decided_by text null`, `decided_at null`, `scheduled_at timestamptz null`, `decision_note text`; unique partial index `(attempt_id) where state in (requested, approved, booked)` |
| `cert_exam_attempts` | `id uuid pk`, `attempt_id uuid fk`, `seat_id uuid null fk`, `certification_id uuid fk`, `revision_id uuid fk`, `email text`, `proctor_email text not null`, `state text not null default 'released'`, `released_at`, `release_expires_at`, `started_at null`, `deadline timestamptz null`, `submitted_at null`, `time_limit_minutes int`, `draw jsonb not null` (array of `{ "question_id": uuid, "topic": "...", "type": "...", "option_order": ["c","a","b"] | null }`), `answers jsonb not null default '[]'` (array index = draw index; `null` where unanswered), `current_index int not null default 0`, `flags jsonb not null default '[]'` (`[{ "at": "...", "kind": "..." }]`), `score jsonb null` (`{ "correct": n, "total": n, "by_topic": { "<topic>": { "correct": n, "total": n } }, "missed_topics": ["..."], "per_question": [ { "index": i, "topic": "...", "correct": bool } ] }`), `passed boolean null` |

### 0263 `cert_awards`: awards, history, notifications

| table | columns |
| --- | --- |
| `cert_awards` | `id uuid pk`, `serial text not null unique check (~ '^IDEA(-[0-9A-HJKMNP-TV-Z]{4}){4}$')`, `attempt_id uuid fk unique`, `certification_id uuid fk`, `revision_id uuid fk`, `email text not null`, `holder_name text not null`, `code text`, `name text`, `level int`, `category text`, `awarded_at timestamptz not null`, `awarded_by_email text not null`, `awarded_by_name text not null`, `expires_at timestamptz null`, `status text not null default 'active'`, `signature text not null` (base64 Ed25519), `signed_payload jsonb not null`, `key_id text not null`, `created_at`, `updated_at` |
| `cert_award_history` | `id bigserial pk`, `award_id uuid fk`, `at`, `actor_email`, `action text`, `reason text not null`, `before jsonb`, `after jsonb` (append-only) |
| `cert_notifications` | `id uuid pk`, `email text not null`, `user_id uuid null` (resolved at insert through `_notebook_user_id_for_email`, the 0094 bridge, so the push sender needs no second lookup; null for an address that has never signed in), `kind text not null`, `title text not null`, `body text not null`, `href text not null`, `payload jsonb not null default '{}'`, `created_at`, `read_at null`, `emailed_at null`, `pushed_at null`; index `(email, read_at, created_at desc)` |

### 0264 `cert_ops`: sync log, errors, jobs, telemetry, exports

| table | columns |
| --- | --- |
| `cert_sync_log` | `id bigserial pk`, `at`, `trigger text` (`award`, `catalog`, `daily`, `manual`), `ok boolean`, `http_status int null`, `catalog_count int`, `holder_count int`, `source_revision text`, `error text null`, `duration_ms int`, `remote_log_id bigint null` |
| `cert_errors` | `id bigserial pk`, `at`, `where_ text`, `message text`, `detail jsonb`, `correlation_id text` |

## Function catalog

Grant column: `A` = `authenticated`, `S` = `service_role`, `N` = `anon`, `-` = private (no grant). "certifier(c)" means `_cert_can_certify(c)`; "any certifier" means admin or any live authority row.

### 0260

| function | grant | who | behavior and return |
| --- | --- | --- | --- |
| `_cert_caller() returns text` | - | | lower trimmed email; raises `cert: no session` when empty |
| `_cert_can_certify(p_cert uuid) returns boolean` | - | | admin or live authority |
| `_cert_is_certifier() returns boolean` | - | | admin or any live authority |
| `_cert_event(p_kind text, p_actor text, p_subject text, p_cert uuid, p_attempt uuid, p_payload jsonb, p_reason text) returns bigint` | - | | one insert into `cert_events` |
| `_cert_person_name(p_email text) returns text` | - | | `display_name` when set, else `full_name`, else null (the Foundry rule; never the address) |
| `_cert_package_check(p jsonb) returns text[]` | - | | every problem with the package SHAPE (types, ranges, part references, topic ids unique, minimums sum <= questions_per_exam, prerequisites are known codes other than itself); empty array when sound |
| `_cert_publish_check(p_cert uuid) returns text[]` | - | | every reason the current revision cannot publish: shape problems plus COMPLETENESS (definition, allows, does_not_allow non-empty; at least one training item; study guide non-empty; at least one practice question; at least one common mistake; each ENABLED part complete: guided and autonomous need objective, spec, at least one acceptance line and one evidence item; checkout needs card and filming guide; exam needs at least one topic with minimum >= 1, a time limit, and a pool with every topic holding at least its minimum ACTIVE questions and a total of at least 2 x questions_per_exam; every prerequisite code exists and is published or retired; every lesson item names an existing lesson) |
| `cert_is_certifier() returns boolean` | A | anyone signed in | the desk gate |
| `cert_my_authority() returns jsonb` | A | anyone | `{ "admin": bool, "certifications": [ { "id", "code", "name" } ] }` the caller may certify (admin: all non-draft) |
| `cert_settings() returns jsonb` | A | anyone | `{ "school_year_expiry": "2027-08-16" | null, "dormancy_days", "checkin_timeout_seconds", "release_window_minutes" }` |
| `cert_settings_set(p jsonb) returns jsonb` | A | admin | merges the four keys, validates ranges, event `settings.changed`; returns the settings |
| `cert_catalog() returns jsonb` | A | anyone | published certifications: `[ { "id", "code", "name", "level", "category", "sort_order", "renewal", "definition", "allows", "does_not_allow", "parts", "prerequisites": [ { "code", "name", "held": bool } ], "holders_count", "avg_completion_days" (null when fewer than 3 completions), "my": { "state": "none" | "active" | "dormant" | "complete" | "withdrawn", "attempt_id", "held": bool, "expired": bool } } ]` ordered by category earliest sort, then sort_order, level, code |
| `cert_get(p_code text) returns jsonb` | A | anyone | the full published certification: everything in `cert_catalog` for it plus `revision_id`, `package` (the kit, projects, exam CONFIG: topics, time limit, count; never questions), `lessons: [ { "id", "slug", "title" } ]`, `my_attempt` (`cert_me` shape for this one attempt, or null), `my_training: [ { "item_key", "covered_seconds", "duration_seconds", "completed_at" } ]`, `cooldown_until`, `seats` (my open seat), `sittings` (open windows this certification may use), `holders_count`. Returns null for a draft or unknown code (route 404s). A certifier of the certification also gets a retired one. |
| `cert_admin_list() returns jsonb` | A | any certifier | every certification the caller may certify, every state, with `revision`, `holders_count`, `active_attempts`, `pending_reviews`, `publish_problems: text[]` |
| `cert_admin_get(p_id uuid) returns jsonb` | A | certifier(p_id) | the certification with its current `package`, `revisions: [ { id, revision, note, created_at, created_by } ]`, `lessons`, `pool_summary: { "total", "by_topic": { topic: count } }`, `publish_problems`, `authority: [ emails ]` (admin only), `prerequisites` |
| `cert_admin_save(p_id uuid, p_package jsonb, p_note text) returns jsonb` | A | admin | `p_id` null creates a draft from the package (code must be new), else writes a new revision and updates the identity columns (code may not change once published); runs `_cert_package_check` and refuses `reason: "invalid"` with `problems`; rewrites `cert_prerequisites`; event `catalog.saved`; returns `{ ok, id, revision_id, revision, publish_problems }` |
| `cert_admin_publish(p_id uuid) returns jsonb` | A | admin | refuses `reason: "incomplete"` with `problems` from `_cert_publish_check`; sets published; event; returns `{ ok, notify: [] , sync: true }` |
| `cert_admin_hide(p_id uuid) returns jsonb` | A | admin | published back to draft, ONLY with no awards and no active attempts (`reason: "in_use"` otherwise, naming the counts); event `catalog.hidden` |
| `cert_admin_retire(p_id uuid) returns jsonb` | A | admin | published to retired; existing awards untouched; active attempts keep working; event; `sync: true` |
| `cert_admin_delete(p_id uuid) returns jsonb` | A | admin | ONLY a draft that was never published and has no attempts, revisions and lessons go with it (cascade); `reason: "not_deletable"` otherwise |
| `cert_lesson_save(p_cert uuid, p_slug text, p_title text, p_document text, p_manifest jsonb) returns jsonb` | A | admin | upsert by `(cert, slug)`; the manifest must be a jsonb object (the full block-shape validation runs in TypeScript at save and import time through the hx module's own validator, because 0260 must apply over the short-link test chain, which has no classroom tables; a lesson's manifest decides no write and stores no answer, so the SQL gate is the object check); returns `{ ok, id }` |
| `cert_lesson_delete(p_cert uuid, p_slug text) returns jsonb` | A | admin | refuses while the current revision's training items name the slug |
| `cert_lesson_document(p_id uuid) returns jsonb` | A | anyone signed in | `{ "id", "title", "document", "updated_at", "manifest" }` when the certification is published or retired, or the caller is its certifier; null otherwise |
| `cert_exam_pool_get(p_cert uuid) returns jsonb` | A | admin | every question with its answer key, for the pool editor only |
| `cert_exam_pool_replace(p_cert uuid, p_questions jsonb) returns jsonb` | A | admin | validates every question (type, options with unique keys for choice types, answer shape per type, topic is in the current package's topics); replaces the pool: rows whose id is present are updated, absent rows are set `active = false` (never deleted: a draw may reference them), new rows inserted; returns `{ ok, total, by_topic, publish_problems }` |
| `cert_authority_list() returns jsonb` | A | admin | `[ { "certification_id", "code", "name", "email", "person_name", "granted_at", "granted_by", "note" } ]` live grants |
| `cert_authority_grant(p_cert uuid, p_email text, p_note text) returns jsonb` | A | admin | upsert, un-revokes; email must be `@boscotech.edu` or `@boscotech.net`; event |
| `cert_authority_revoke(p_cert uuid, p_email text) returns jsonb` | A | admin | stamps `revoked_at`; event |

### 0261

| function | grant | who | behavior and return |
| --- | --- | --- | --- |
| `_cert_attempt_owner(p_attempt uuid) returns boolean` | - | | attempt's email is the caller |
| `_cert_can_read_evidence(p_attempt uuid) returns boolean` | - | | owner or certifier of its certification |
| `_cert_storage_prefix_uuid(p_name text) returns uuid` | - | | first path segment when it is a bare uuid, else null |
| `_cert_touch(p_attempt uuid)` | - | | `last_activity_at = now()`; a dormant attempt goes back to `active` with event `attempt.revived` |
| `_cert_holds(p_email text, p_cert uuid) returns boolean` | - | | has an `active` award with `expires_at` null or in the future |
| `_cert_next_part(p_attempt uuid) returns text` | - | | the first part in order whose check is `pending`, or null when all are done or waived |
| `_cert_part_unlocked(p_attempt uuid, p_part text) returns boolean` | - | | every earlier part in order is `done` or `waived` |
| `_cert_attempt_json(p_attempt uuid) returns jsonb` | - | | `{ "id", "certification": { "id", "code", "name", "level", "category" }, "revision_id", "email", "state", "started_at", "finished_at", "withdrawn_at", "dormant_at", "last_activity_at", "parts": { part: bool }, "checks": [ { "part", "state", "checked_by_name", "checked_at", "note" } ], "next_part", "submissions": [ { "id", "part", "state", "in_person", "submitted_at", "decided_at", "evidence", "self_inspection", "review": { "decision", "feedback", "reviewer_name", "reviewed_at" } | null } ], "exams": [ { "id", "state", "released_at", "started_at", "submitted_at", "passed", "missed_topics", "flags_count" } ], "cooldown_until", "seat": { "id", "state", "sitting_id", "scheduled_at", "requested_at", "decision_note" } | null, "award": { "serial", "awarded_at", "expires_at", "status" } | null }`. Exams carry per-question detail only for a certifier (`cert_student_view`). |
| `_cert_check_done(p_attempt uuid, p_part text, p_by text, p_note text) returns jsonb` | - | | marks the check done; event `check.done`; if that completes every part it leaves the attempt `active` (the award is a separate press); returns the notification row to send |
| `cert_start(p_code text) returns jsonb` | A | student | published; no active or dormant attempt; every prerequisite held (`reason: "locked"` with `missing: [codes]`); creates the attempt pinned to `current_revision_id`, one check per part (`waived` for a disabled part), event; returns `{ ok, attempt }` |
| `cert_withdraw(p_attempt uuid) returns jsonb` | A | owner | active or dormant to withdrawn; cancels an open seat; event |
| `cert_me() returns jsonb` | A | anyone | `{ "attempts": [ attempt json, every state ], "awards": [ { "id", "serial", "code", "name", "level", "category", "awarded_at", "awarded_by_name", "expires_at", "status" (shown), "revision_id" } ], "notifications_unread": n }` |
| `cert_submit(p_attempt uuid, p_part text, p_evidence jsonb, p_self_inspection jsonb) returns jsonb` | A | owner | attempt active or dormant (touch revives); part enabled and unlocked; no pending submission for it; evidence shape checked: links through a URL check, `youtube_id` `^[A-Za-z0-9_-]{11}$`, every file path starts with `<attempt_id>/`, text <= 20000 chars, at most 20 files and 20 links; checkout REQUIRES a `youtube_id`; every required evidence item in the revision's list present; `self_inspection` every item checked; event `submission.sent`; notifications `queue_submission` for every live certifier of the certification (admin included through `app_admins`); returns `{ ok, submission_id, notify }` |
| `cert_review(p_submission uuid, p_decision text, p_feedback text) returns jsonb` | A | certifier, not the submitter | submission pending; fail requires non-empty feedback; inserts review, sets submission state, `pass` marks the part's check done (checked_by = reviewer), event `review.decided`; notification `review_returned` (and `part_checked` on pass) to the student; returns `{ ok, notify }` |
| `cert_checkout_in_person(p_attempt uuid, p_decision text, p_feedback text) returns jsonb` | A | certifier, not the student | checkout enabled and unlocked; creates a submission with `in_person = true` and its review in one statement; same effects as `cert_review` |
| `cert_watch_report(p_cert uuid, p_item_key text, p_duration numeric, p_ranges jsonb, p_max_rate numeric, p_checkins_missed int, p_played_seconds numeric) returns jsonb` | A | anyone signed in | item must be a training item of the published revision (or the caller's attempt's revision); `p_max_rate > 2.0` or `p_duration <= 0` refuses `reason: "rate"` / `"duration"` and records nothing; ranges clamped to `[0, duration]`, merged with the stored ranges server-side; `covered_seconds` recomputed; `completed_at` set when coverage >= 0.95 (never cleared); one `cert_watch_sessions` row; when EVERY training item of the caller's active attempt's revision is complete, `training` check done (checked_by = 'system'); returns `{ ok, covered_seconds, coverage, complete, training_done, notify }` |
| `cert_lesson_complete(p_cert uuid, p_slug text) returns jsonb` | A | anyone signed in | marks `lesson:<slug>` complete; same training roll-up as above |
| `cert_practice_record(p_cert uuid, p_kind text, p_item_id text, p_correct boolean) returns jsonb` | A | anyone signed in | one telemetry row; returns `{ ok }` |
| `cert_student_view(p_email text) returns jsonb` | A | any certifier | `{ "email", "name", "attempts": [ attempt json with full exam detail for certs the caller certifies ], "awards": [...] }`; a non-certifier gets `not_found` |
| `cert_desk() returns jsonb` | A | any certifier | `{ "queue": [ { "submission_id", "attempt_id", "part", "in_person", "submitted_at", "waited_seconds", "student": { "email", "name" }, "certification": { "id", "code", "name" } } ] oldest first, "requests": [ seat requests requested, with student and certification and requested_at ], "exams_today": n, "tiles": { "active_attempts": n, "dormant_attempts": n, "pending_reviews": n, "oldest_wait_seconds": n, "awards_total": n, "awards_30d": n } }` scoped to the caller's certifications |

### 0262

| function | grant | who | behavior and return |
| --- | --- | --- | --- |
| `_cert_cooldown_until(p_attempt uuid) returns timestamptz` | - | | last failed exam's `submitted_at + interval '7 days'`, null when none or passed |
| `_cert_exam_draw(p_cert uuid, p_revision uuid) returns jsonb` | - | | for each topic, `minimum` random active questions; then random fill from the remaining pool up to `questions_per_exam`; shuffled order; each choice question gets a shuffled `option_order`; RAISES `cert: pool cannot cover the exam` when any topic is short |
| `_cert_exam_score_one(p_type text, p_answer jsonb, p_key jsonb, p_option_order jsonb) returns boolean` | - | | multiple_choice: equal key; multiple_select: equal sets; numeric: `abs(value - key.value) <= key.tolerance`; short: normalized (lower, trim, collapse spaces, strip trailing period) membership in `key.accept` |
| `_cert_exam_question_json(p_exam uuid, p_index int) returns jsonb` | - | | `{ "index", "total", "type", "prompt", "options": [ { "key", "text" } ] in option_order | null, "unit": text | null, "deadline" }` NEVER the answer |
| `cert_sitting_post(p jsonb) returns jsonb` | A | admin | `p = { "starts_at", "ends_at", "seat_limit", "location", "note", "certification_id" | null, "repeat_weeks": 0..26 }`; creates one row per week sharing a `series_id`; returns `{ ok, sitting_ids }` |
| `cert_sitting_cancel(p_sitting uuid) returns jsonb` | A | admin | state cancelled; every booked seat set cancelled with notification `sitting_declined` (body says the window was cancelled); returns `{ ok, notify }` |
| `cert_sittings() returns jsonb` | A | anyone | `[ { "id", "starts_at", "ends_at", "seat_limit", "seats_taken", "location", "note", "certification": { code, name } | null, "state" } ]` open windows from today on |
| `cert_seat_request(p_attempt uuid, p_sitting uuid, p_note text) returns jsonb` | A | owner | exam enabled and unlocked (guided done or waived), not in cooldown, no open seat; with a sitting: seats left, window open, certification matches or null; state `booked` for a window, `requested` for a plain request; event; notification `queue_request` to certifiers on a plain request; returns `{ ok, seat, notify }` |
| `cert_seat_decide(p_seat uuid, p_decision text, p_scheduled_at timestamptz, p_note text) returns jsonb` | A | certifier, not the student | `approve` needs `p_scheduled_at`; `decline` needs a note; notification to the student; returns `{ ok, notify }` |
| `cert_seat_cancel(p_seat uuid) returns jsonb` | A | owner or certifier | requested, approved or booked to cancelled |
| `cert_exam_release(p_seat uuid) returns jsonb` | A | certifier, NOT the student | seat approved or booked; cooldown clear; no exam released or in progress for the attempt; draws; `release_expires_at = now() + release_window`; seat `used`; event; returns `{ ok, exam_id, release_expires_at, total }` or `reason: "pool"` when the draw raises |
| `cert_exam_open(p_exam uuid) returns jsonb` | A | owner | `released` and before `release_expires_at`: starts, `deadline = now() + time_limit`, state `in_progress`; already `in_progress`: resumes; past the release window: state `expired`, `reason: "release_expired"`; returns `{ ok, exam: { id, state, total, current_index, deadline }, question }` |
| `cert_exam_answer(p_exam uuid, p_index int, p_answer jsonb) returns jsonb` | A | owner | in progress; `p_index = current_index` (`reason: "out_of_order"` otherwise); before deadline + 5s (past it, auto-submits and returns the result); stores; `current_index + 1`; returns `{ ok, question }` or `{ ok, done: true }` when the last one is answered |
| `cert_exam_flag(p_exam uuid, p_kind text) returns jsonb` | A | owner | appends `{ at, kind }` while released or in progress; event `exam.flag`; returns `{ ok, flags_count }` |
| `cert_exam_submit(p_exam uuid) returns jsonb` | A | owner | in progress; scores every drawn question; `passed = every correct`; pass: `exam` check done (checked_by = proctor), notification `part_checked`; fail: event `exam.failed` with `cooldown_until`, notification `review_returned` kind `exam_failed` text naming the topics and the date the cooldown ends; returns to the STUDENT only `{ ok, passed, total, correct, missed_topics, cooldown_until, notify }` |
| `cert_exam_end(p_exam uuid, p_reason text) returns jsonb` | A | the proctor or certifier | ends an in-progress exam from the proctor's side (submits as it stands); returns the full result |
| `cert_exam_live(p_cert uuid) returns jsonb` | A | certifier | `[ { "exam_id", "student": { email, name }, "certification": { code, name }, "state", "current_index", "total", "released_at", "release_expires_at", "started_at", "deadline", "flags": [...], "passed", "submitted_at" } ]` for exams released today or in progress, for the caller's certifications (null `p_cert` = all) |
| `cert_exam_result(p_exam uuid) returns jsonb` | A | certifier | the full stored result: score, per question `{ index, topic, type, prompt, answer_given, correct }`, flags, timings. No answer KEY text is returned even here; the pool editor is where the admin reads keys. |

### 0263

| function | grant | who | behavior and return |
| --- | --- | --- | --- |
| `_cert_award_status(a cert_awards) returns text` | - | | `valid` / `suspended` / `revoked` / `expired` (active with `expires_at < now()`) |
| `_cert_signed_payload(p_serial text, p_code text, p_level int, p_holder_name text, p_email text, p_awarded_at timestamptz, p_certifier_name text) returns jsonb` | - | | `{ "v": 1, "serial", "code", "level", "holder_name", "email_sha256": lower hex of sha256(lower email), "awarded_at": ISO 8601 UTC with `Z` and no fractional seconds, "certifier_name" }` with keys in exactly that order (jsonb reorders keys; the CANONICAL BYTES signed are produced by `canonicalPayload` in `$lib/certifications/signing-payload.ts` and the function compares VALUES, never bytes) |
| `_cert_notify(p_email text, p_kind text, p_title text, p_body text, p_href text, p_payload jsonb) returns jsonb` | - | | inserts a notification (resolving `user_id` through `public._notebook_user_id_for_email`, called, never copied) and returns the row (`{ id, email, user_id, kind, title, body, href, payload, created_at }`); the `notify` arrays every write returns are arrays of exactly this shape |
| `cert_award_prepare(p_attempt uuid) returns jsonb` | A | certifier, NOT the student | attempt active or dormant; every check done or waived; no award yet; holder name resolvable (`reason: "no_name"`); renewal `school_year` requires `settings.school_year_expiry` in the future (`reason: "expiry_unset"`); returns `{ ok, record: { attempt_id, student: { email, name }, certification: { id, code, name, level, category }, revision_id, awarded_at: now, expires_at, certifier: { email, name } } }` |
| `cert_award_commit(p_attempt uuid, p_serial text, p_signature text, p_key_id text, p_signed jsonb) returns jsonb` | A | certifier, NOT the student | re-runs every `prepare` check; serial matches the format and is unused; `p_signed.awarded_at` within 5 minutes of now; `p_signed` values equal `_cert_signed_payload(...)` recomputed from the record (`reason: "payload_mismatch"`); inserts the award, history `awarded`, attempt `complete` with `finished_at`, event `award.granted`, notification `awarded` with `serial` and `verify_url` in payload; returns `{ ok, award: { id, serial, ... }, notify, sync: true }` |
| `cert_award_action(p_award uuid, p_action text, p_reason text) returns jsonb` | A | admin | `suspend` (active to suspended), `reinstate` (suspended to active), `revoke` (active or suspended to revoked, final); reason required; history row; event; notification to the holder; returns `{ ok, award, notify, sync: true }` |
| `cert_award_correct(p_award uuid, p_holder_name text, p_email text, p_signature text, p_key_id text, p_signed jsonb, p_reason text) returns jsonb` | A | admin | re-signs the same serial with the corrected name or email; `p_signed` must recompute from the corrected values; history `corrected` with before and after; `sync: true` |
| `cert_award_get(p_id uuid) returns jsonb` | A | admin, certifier of its certification, or the holder | the award with `history: [...]` (reasons included for admin and certifier; the holder sees actions and dates, not reasons) |
| `cert_awards_list(p_cert uuid) returns jsonb` | A | certifier | awards for the records page (null = all the caller's certifications), newest first, with shown status |
| `cert_certificate(p_serial text) returns jsonb` | A | holder, certifier of its certification, admin | every field the printed certificate shows: `{ serial, holder_name, code, name, level, category, awarded_at, expires_at, awarded_by_name, status, signature, signed_payload, key_id, definition, verify_url_path: "/certifications/verify?serial=<serial>" }`; `not_found` otherwise |
| `cert_verify(p_serial text) returns jsonb` | **N**, A | the public | normalizes (upper, trim, hyphenate 16 Crockford chars into groups of 4, `I/L -> 1`, `O -> 0`); returns `{ "found": true, "holder_name", "code", "name", "level", "category", "awarded_at", "awarded_by_name", "expires_at", "status" (shown), "signature", "signed_payload", "key_id" }` or `{ "found": false }`; never an email, never a reason. The ROUTE rate limits per address; the function is cheap and deliberately anon (allowlisted in `tests/db/ideacad-grants-anon-execute-surface.test.ts` with its reason). |
| `cert_holders() returns jsonb` | A | anyone signed in | `{ "by_certification": [ { code, name, level, category, holders: [ { name, awarded_at, status } ] } ], "by_person": [ { name, email_hash, certifications: [ { code, level, awarded_at, status } ] } ] }`. Names only; no address leaves. |
| `cert_notifications_mine(p_limit int) returns jsonb` | A | anyone | newest first `[ { id, kind, title, body, href, created_at, read_at } ]` |
| `cert_notifications_mark_read(p_ids uuid[]) returns jsonb` | A | anyone | own rows only; `{ ok, unread }` |
| `cert_notifications_unread() returns int` | A | anyone | count; cheap enough for the root layout |

### 0264

| function | grant | who | behavior and return |
| --- | --- | --- | --- |
| `cert_mirror_snapshot() returns jsonb` | A, S | admin or service_role (`auth.role() = 'service_role'`) | the frc-app contract snapshot, built in SQL: `{ "source_revision": "idea-certs-<max updated_at ISO>", "catalog": [ every published or retired certification with the EXACT keys code, name, level, category, definition, allows, does_not_allow, prerequisites, renewal (null for never, "Expires on <date> each school year" for school_year), active (published = true, retired = false), sort_order ], "holders": [ every award with serial, email, holder_name, code, status (shown status mapped: valid -> active), awarded_at (ISO with offset), awarded_by_name, expires_at ] }`. Drafts never. |
| `cert_sync_log_write(p jsonb) returns jsonb` | A, S | admin or service_role | one `cert_sync_log` row; event `sync.sent` |
| `cert_sync_log_list(p_limit int) returns jsonb` | A | any certifier | newest first |
| `cert_error_log(p_where text, p_message text, p_detail jsonb, p_correlation text) returns jsonb` | A, S | anyone signed in or service_role | one row; detail must not carry secrets (the caller's duty) |
| `cert_sweep_dormant() returns jsonb` | A, S | admin or service_role | active attempts with `last_activity_at < now() - dormancy_days` to dormant; event per attempt; returns `{ ok, marked: n }` |
| `cert_expiry_reminders() returns jsonb` | A, S | admin or service_role | active awards with `expires_at` within 30 days and no `award.expiring` event for the award: notification `expiring`; returns `{ ok, notify }` |
| `cert_notifications_unsent(p_limit int) returns jsonb` | S | service_role | notifications older than 10 minutes with `emailed_at` null, for the daily flush: `[ { id, email, kind, title, body, href, payload } ]` |
| `cert_notifications_mark_sent(p_ids uuid[], p_channel text) returns jsonb` | A, S | admin or service_role | stamps `emailed_at` or `pushed_at` |
| `cert_telemetry() returns jsonb` | A | any certifier | `{ "active_by_certification": [ { code, name, active, dormant } ], "stalled": [ { attempt_id, student_name, code, days_idle } ], "pending": [ { kind, count, oldest_wait_seconds } ], "pass_rates": [ { code, part, passed, failed } ], "exam_topics": [ { code, topic, correct, total } ], "completion_days": [ { code, average, count } ], "time_per_part_hours": [ { code, part, average } ], "most_missed_topics": [ { code, topic, missed } ], "withdrawals_30d": n, "watch_sessions_30d": n }` scoped to the caller's certifications |
| `cert_export(p_kind text, p_from timestamptz, p_to timestamptz) returns jsonb` | A | any certifier (admin for `audit` and `errors`) | `p_kind` in `events`, `audit` (events with a reason or an award action), `sync`, `errors`, `attempts`, `awards`, `exams`, `watch`, `practice`, `notifications`; rows as an array of flat objects, at most 50,000; the route makes JSON plus CSV plus README |

## Serial, signing and verify

- A serial is 80 random bits from `crypto.randomBytes(10)` encoded in Crockford
  base32 (alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ`), 16 characters in four
  groups: `IDEA-XXXX-XXXX-XXXX-XXXX`. `src/lib/certifications/serial.ts` is the
  one implementation (`newSerial`, `normalizeSerial`, `SERIAL_RE`).
- The canonical signed bytes are `canonicalPayload(record)` in
  `src/lib/certifications/signing-payload.ts`: the JSON of the payload object
  above with keys in the fixed order and no whitespace, UTF-8. The signature is
  Ed25519 over those bytes, base64. `key_id` is the first 8 hex characters of
  the SHA-256 of the raw public key.
- `CERT_SIGNING_PRIVATE_KEY` (server only, `$env/dynamic/private`) holds either
  a PKCS8 PEM or the base64 / base64url 32-byte seed. `signingKey()` in
  `src/lib/server/certifications/signing.ts` returns `{ ok: false, reason }` when
  it is unset or malformed; the award route then REFUSES with
  `CERT_SIGNING_UNSET_MESSAGE`, an admin-facing sentence, and never awards.
- The public key is served at `GET /certifications/verify/public-key` as text
  (`-----BEGIN PUBLIC KEY-----` SPKI PEM) and JSON (`?format=json`: `{ key_id,
  algorithm: "Ed25519", spki_pem, raw_base64 }`), and rendered on the verify
  page under "Check it yourself".
- The verify route (`/certifications/verify`, public) takes `?serial=`, rate
  limits per client address through `src/lib/server/certifications/verify-limit.ts`
  (token bucket: 30 a minute per address, 300 an hour; over the limit answers
  429 with the same page saying to try again in a minute), calls `cert_verify`
  on the request's own client (anon when signed out), and shows ONE of five
  states: Valid, Suspended, Revoked, Expired, or "No such certificate." It never
  says which check failed. Signature verification against the published key
  runs server-side too and a mismatch is logged to `cert_errors` and shown as
  "No such certificate."

## Routes

| route | file | who | what |
| --- | --- | --- | --- |
| `/certifications` | `src/routes/certifications/+layout.svelte`, `+layout.server.ts`, `+page.svelte`, `+page.server.ts` | signed in (redirect to `/` from `hooks.server.ts`'s `authedPrefixes` is NOT used: the layout renders its own sign-in panel the Armory way, because `/certifications/verify` is public under the same prefix) | catalog |
| `/certifications/[code]` | `[code]/+page.svelte`, `+page.server.ts` (actions: `start`, `withdraw`, `submit`, `requestSeat`, `cancelSeat`, `lessonComplete`) | signed in | the certification page |
| `/certifications/[code]/exam/[examId]` | `[code]/exam/[examId]/+page.svelte`, `+page.server.ts` | the exam's student | the exam runtime (`ExamRunner`) |
| `/certifications/me` | `me/+page.svelte`, `+page.server.ts` | signed in | my certifications |
| `/certifications/holders` | `holders/+page.svelte`, `+page.server.ts` | signed in | holders board |
| `/certifications/verify` | `verify/+page.svelte`, `+page.server.ts` | PUBLIC | verify by serial |
| `/certifications/verify/public-key` | `verify/public-key/+server.ts` | PUBLIC | the Ed25519 public key |
| `/certifications/certificate/[serial]` | `certificate/[serial]/+page.svelte`, `+page.server.ts` | holder, certifier, admin | the printable certificate (print stylesheet, landscape US Letter) |
| `/certifications/lesson/[lessonId]` | `lesson/[lessonId]/+server.ts` | signed in | serves a lesson document with the hx CSP and sandbox (see DECISIONS: lessons) |
| `/certifications/notifications` | `notifications/+page.svelte`, `+page.server.ts` (action `read`) | signed in | the list the badge opens |
| `/certifications/desk` | `desk/+layout.server.ts` (404 unless `cert_is_certifier()`), `desk/+page.svelte` | certifier | the desk |
| `/certifications/desk/students/[email]` | | certifier | student view |
| `/certifications/desk/review/[submissionId]` | actions `decide` | certifier | review |
| `/certifications/desk/sittings` | actions `post`, `cancel`, `decide`, `release`, `inPerson` | certifier (post: admin) | sittings and requests |
| `/certifications/desk/sittings/live` | | certifier | live proctoring (polls `cert_exam_live`) |
| `/certifications/desk/award/[attemptId]` | | certifier | the requirement checklist and the award button; the confirm posts to `/api/certifications/award` |
| `/certifications/desk/records` and `records/[awardId]` | actions `action`, `correct` | admin (certifier reads) | suspend, reinstate, revoke, correct, history |
| `/certifications/desk/authority` | actions `grant`, `revoke` | admin | authority grid |
| `/certifications/desk/engine` and `engine/[id]` | actions `save`, `publish`, `hide`, `retire`, `delete`, `savePool`, `saveLesson`, `deleteLesson`, `settings` | admin (certifier reads) | the engine; package import at `engine/import` (`POST /api/certifications/package/import`, two steps: validate and diff, then confirm) and export at `GET /api/certifications/package/export/[id]` |
| `/certifications/desk/logs` | | certifier (admin for audit and errors) | logs with bulk export `GET /api/certifications/export?kind=&from=&to=` |
| `/api/certifications/award` | `+server.ts` POST `{ attempt_id }` | certifier | checks the signing key, `cert_award_prepare`, signs, `cert_award_commit`, emails and pushes the student, fires the mirror sync; returns the award and the certificate path |
| `/api/certifications/correct` | POST | admin | same shape for a correction |
| `/api/certifications/evidence/sign` | POST `{ attempt_id, filename, size }` | owner | `createSignedUploadUrl` into `cert-evidence` at `<attempt_id>/<uuid>.<ext>` (47,185,920-byte cap, `PORTAL_UPLOAD_MAX_BYTES`, refused before the transfer with the size and the limit) |
| `/api/certifications/evidence/[...path]` | GET | owner or certifier | 302 to a signed download URL with `download=<ascii name>` (the classroom rule: never inline) |
| `/api/certifications/jobs/[job]` | GET or POST, `job` in `daily`, `mirror`, `dormant`, `expiry`, `emails` | the scheduler | authorized by `Authorization: Bearer <CRON_SECRET>` (a NEW variable; the repository's autopay cron route checks nothing because its function is anon-granted and idempotent, which these are not) compared in constant time, OR by a signed-in admin; an unknown job or a wrong bearer answers 404; `CRON_SECRET` unset leaves the scheduler path open with a one-run-a-minute floor per job (the autopay shape; see DECISIONS D4), because Vercel sends the bearer on its own once the variable is set. The service-role client is `serviceClient()` imported from `$lib/server/push.ts` (an existing sanctioned reader of the key), so no new module reads `SUPABASE_SERVICE_ROLE_KEY`. `daily` runs mirror, dormant, expiry, emails in order under one correlation id and is the one Vercel cron entry; a GitHub Actions workflow `cert-jobs.yml` is the second caller. See DECISIONS D4. |
| `/api/certifications/export` | GET | certifier | a ZIP of `<kind>.json`, `<kind>.csv`, `README.md` |
| `/api/certifications/package/export/[id]` | GET | admin | the package ZIP |
| `/api/certifications/package/import` | POST multipart `{ file, confirm?: "1", id? }` | admin | validate and diff, or apply |
| `/dev/cert-*` | | dev only (`dev` from `$app/environment`, 404 otherwise) | harnesses; every one mounts the REAL components with in-memory transports |

## Modules and ownership

Pure, client-safe, written BEFORE the fan-out and shared by every surface (do
not edit from a surface agent; report a needed change instead):

- `src/lib/certifications/types.ts`: every shape above as TypeScript.
- `src/lib/certifications/parts.ts`: `PARTS`, `PART_WORDS`, `nextPart`, `partUnlocked`, `requiredParts`.
- `src/lib/certifications/serial.ts`: `newSerial`, `normalizeSerial`, `SERIAL_RE`, `CROCKFORD`.
- `src/lib/certifications/signing-payload.ts`: `canonicalPayload`, `emailSha256` (Web Crypto, works in Node and the browser).
- `src/lib/certifications/nav.ts`: `CERT_PATHS`, `certHref(code)`, `deskHref(...)`, `DESK_TABS`, `isDeskPath`.
- `src/lib/certifications/copy.ts`: shared sentences (`CERT_SIGNING_UNSET_MESSAGE`, the verify states, the outside-help sentence, the watch rules sentence).
- `src/lib/certifications/status.ts`: `awardShownStatus`, `cooldownActive`, `formatCertDate` (America/Los_Angeles, no weekday).
- `src/lib/certifications/cert.css`: the room (`.cert-root`), its measure, the sticky header (`.app-header.cert-header`), panels (`.cert-panel`, `.cert-well`), readouts (`.cert-readout` with `.is-ok/.is-warn/.is-bad/.is-info`), tabs (`.cert-tabs .cert-tab[aria-current=page]`), the award key (`.cert-award-key`), the checklist rows, the facts list, the serial, plain-SVG chart classes (`.cert-chart`), form rows (`.cert-field`) and the sign-in panel. `.cert-panel`, `.cert-well`, `.cert-readout` and `.cert-tabs .cert-tab` are joined to the plate's lists in `$lib/classroom/plate.css` room-qualified as `:where(.cert-root)`. Every button is `.btn` (`secondary`, `danger`) plus `.cert-btn`; a lit key carries `.on` or `aria-pressed`; an unavailable one is `aria-disabled`, never `disabled`. Import `InfoTip` from `$lib/classroom/InfoTip.svelte` (there is no `$lib/InfoTip`), `Disclosure` from `$lib/Disclosure.svelte`, `Pending` from `$lib/Pending.svelte`, `SaveIndicator` from `$lib/SaveIndicator.svelte`, and `MarkdownText` from `$lib/classroom/MarkdownText.svelte` (`body` prop) for every markdown field.

Surface ownership (disjoint; a surface creates files only under its own paths):

| surface | owns |
| --- | --- |
| (a) migrations | `supabase/migrations/0260_cert_engine.sql` … `0264_cert_ops.sql`; `tests/db/cert-*.test.ts`; `tests/db/cert-mutation-proof.mjs` |
| (b) server | `src/lib/server/certifications/**` (signing, mirror, jobs, exports, package-zip, verify-limit, evidence, notify), `src/lib/server/email/index.ts` (transport), `src/routes/api/certifications/**`, `vercel.json` `crons` entries (append), `tests/cert-server-*.test.ts` |
| (c) student routes | `src/routes/certifications/{+layout*, +page*, [code]/+page*, me/, holders/, verify/, lesson/, notifications/, certificate/}` EXCEPT `[code]/exam/**` and `certificate/**` which belong to (e) and (f); `src/lib/certifications/student/**` (components); `src/routes/dev/cert-catalog/`, `cert-certification/`, `cert-verify/`, `cert-me/`; their `tools/browser-verify/routes/cert-*.mjs`; `tests/cert-student-*.test.ts`, `tests/dom/cert-student-*.test.ts` |
| (d) certifier routes | `src/routes/certifications/desk/**`; `src/lib/certifications/desk/**`; `src/routes/dev/cert-desk/`, `cert-review/`, `cert-award/`, `cert-engine/`, `cert-telemetry/`; their browser-verify specs; `tests/cert-desk-*.test.ts` |
| (e) exam and watch | `src/lib/certifications/exam/**` (ExamRunner, ProctorLive), `src/lib/certifications/watch/**` (YouTubePlayer wrapper, tracker, ranges), `src/routes/certifications/[code]/exam/**`; `src/routes/dev/cert-exam/`, `cert-watch/`; their specs; `tests/cert-watch-*.test.ts`, `tests/cert-exam-*.test.ts` |
| (f) certificate and emails | `src/lib/certifications/certificate/**`, `src/routes/certifications/certificate/**`, `src/lib/server/email/templates/**`, `src/lib/server/email/cert.ts` (renderCertEmail), `src/routes/dev/cert-certificate/`, `cert-emails/`; their specs; `tests/cert-email-*.test.ts`, `tests/cert-certificate-*.test.ts` |
| orchestrator | this file, `DECISIONS.md`, `PACKAGE_FORMAT.md`, the shared modules above, `src/lib/theme.ts` / `src/lib/shell/site-plate.ts` scope lists, `ClassroomShell.svelte` entry, `ProfileMenu.svelte` badge and the root layout's unread key, `classroom-updates.json`, the history entry, the ledger status |

## The email module contract (between (b) and (f))

```ts
// src/lib/server/email/index.ts  (surface b)
export interface EmailMessage { to: string; subject: string; html: string; text: string; replyTo?: string }
export type EmailResult = { ok: true; id: string | null } | { ok: false; reason: 'not_configured' | 'refused' | 'network'; message: string }
export function emailConfigured(): boolean            // RESEND_API_KEY and CERT_EMAIL_FROM both set
export async function sendEmail(m: EmailMessage): Promise<EmailResult>  // Resend POST https://api.resend.com/emails; unset -> { ok:false, reason:'not_configured' } with no network call; never logs the key

// src/lib/server/email/cert.ts  (surface f)
export type CertEmailKind = NotificationKind            // from $lib/certifications/types
export interface CertEmailInput { kind: CertEmailKind; to: string; recipientName: string | null; title: string; body: string; href: string; payload: Record<string, unknown>; siteOrigin: string }
export function renderCertEmail(input: CertEmailInput): { subject: string; html: string; text: string }
```

`CERT_EMAIL_FROM` is the from-address, for example
`IDEA Certifications <certifications@ideabosco.com>`. Both variables are read
through `$env/dynamic/private` at call time.

## The YouTube player contract (surface e, consumed by c)

```ts
// src/lib/certifications/watch/YouTubePlayer.svelte
props: { videoId: string; start?: number; title: string; onprogress?: (p: WatchProgress) => void; onsession?: (s: WatchSession) => void; checkinTimeoutSeconds: number; itemKey: string }
// src/lib/certifications/watch/ranges.ts (pure)
export function mergeRanges(ranges: [number, number][]): [number, number][]
export function coveredSeconds(ranges: [number, number][], duration: number): number
export const WATCH_COVERAGE = 0.95; export const WATCH_MAX_RATE = 2
```

The certification page (c) mounts `YouTubePlayer` for every `video` training
item and posts `cert_watch_report` from `onsession` through the browser client;
(e) owns the player, the tracker, the check-ins and the speed cap.

## The hx lesson contract (surface c, with the serving route)

`/certifications/lesson/[lessonId]` serves `cert_lesson_document(p_id).document`
with the SAME header set the classroom's `/hx/[docId]` sends, by calling the
classroom's own exported pieces (`hxDocumentCsp`, `HX_SANDBOX_FLAGS` from
`$lib/classroom/html-assignment/bridge.ts`), never a second copy. The page
mounts `HtmlAssignmentFrame` with `src` pointing at that route and no answers
controller; a lesson's quick checks render in parent chrome from the package.

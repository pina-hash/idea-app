---
title: "The event-trigger guard cannot be installed on Supabase, so it is removed and `tools/apply-migration.mjs` is the only control left -- with the role file's header rewritten to say exactly what does not protect the reader, plus the duplicate decision 15 (`claude/guard-outside-database-0uczmi`, no migration)"
date: 2026-09-05
branches: [claude/guard-outside-database-0uczmi]
migrations: []
subsystems: ["Tooling", "Migrations", "Security", "Decisions"]
---

Prompt 0055 built a scoped Postgres role with an event-trigger guard, measured
every claim it made against a real PostgreSQL 17.10, and wrote a header that was
unusually honest about the guard's limits. Mr. Pina pasted it on 2026-09-05 and
it refused at its first statement. **The measurements were right and the
platform is different.** This bundle removes what cannot be installed, keeps
what can, hardens the half that survives, and rewrites the header so nobody
reads a protection that is not there.

**Nothing was applied anywhere.** This session holds no production credential
and asked for none.

## What Mr. Pina does now -- the paste steps, since the last set failed at line 166

1. **Read `supabase/roles/idea_migrator.sql`'s section "WHAT DOES NOT PROTECT
   YOU" before anything else.** It is the deliverable of this bundle. It lists
   eight things a session or a person holding this password can do to the
   production database that nothing will stop, and it is blunt on purpose. If
   that list is not acceptable, stop here and keep pasting migrations by hand;
   nothing else in this bundle depends on the role existing.
2. **Open the file in the Supabase SQL editor as `postgres`.** Replace
   `REPLACE_ME_WITH_A_REAL_PASSWORD` with a real password IN THE EDITOR. There
   is exactly one occurrence and it is on the `alter role` statement. Do not
   commit the edited copy anywhere.
3. **Run it.** It is one transaction. Read the NOTICE stream, which now opens
   with the server version.
4. **Expect one of three outcomes**, and each is a real answer:
   - **It commits.** The notices will state, every time, that there is no guard
     in the database and that `tools/apply-migration.mjs` is the only control.
     Hand the connection string to a session as `IDEA_MIGRATION_URL`.
   - **It raises 42501 on the grant**, with a sentence beginning
     `idea_migrator: \`grant postgres to idea_migrator\` was refused (42501)`.
     Nothing was created. This is the expected outcome on PostgreSQL 16 and
     later -- see below -- and the only ways forward are Supabase support
     running the grant as a superuser, or leaving migrations manual.
   - **It raises 0LP01**, naming a membership cycle. Also expected on 16+, also
     leaves nothing behind, and the message says what a superuser would have to
     run.
5. **If it raises, that is the file working.** The previous paste left nothing
   behind for the same reason, and that is the one part of the original design
   that behaved exactly as intended.

## Why the guard is gone

Two independent refusals, both measured here on PostgreSQL 17.10 against a role
built to be at least as privileged as Supabase's `postgres` -- a non-superuser
holding CREATEROLE, CREATEDB and ownership of the database.

**The first is what Mr. Pina hit.** Line 166 named `nosuperuser`,
`noreplication` and `nobypassrls`. On PostgreSQL 16 and later, naming the
SUPERUSER attribute at all, even to set it FALSE, requires superuser:

    ERROR 42501: permission denied to alter role

Measured clause by clause. `login`, `password`, `nocreatedb`, `nocreaterole` and
`inherit` all succeed for a CREATEROLE non-superuser; those three do not, and
neither does a positive-control `superuser`. And **all three were already the
default**: a bare `create role` on 17.10 produces `rolsuper` false,
`rolreplication` false, `rolbypassrls` false, `rolcreatedb` false,
`rolcreaterole` false and `rolinherit` true, so naming them bought nothing and
cost the whole paste. They are replaced by an ASSERTION -- the self-check reads
those columns back and raises if any is true -- which is the same guarantee
obtained by asking rather than by setting.

**The second is the one that matters.** `create event trigger` is refused
42501 for the same role, and there is no privilege that can be granted instead;
this is PostgreSQL's rule, not Supabase's, so support cannot lift it. The guard
SCHEMA creates fine and the guard FUNCTION creates fine, which is the trap: a
file that stripped only the three attributes would have installed a function
that nothing ever calls and that reads exactly like a control. So both are gone,
not commented out and not left standing "for later".

## The header is the deliverable

The old header's own "WHAT THE GUARD CANNOT CATCH" section is why this was
survivable: it already said the guard stopped an accident and not an intent, and
it already named `tools/apply-migration.mjs` as the compensating control. That
section is now longer and is called **"WHAT DOES NOT PROTECT YOU"**. It says
that nothing in the database refuses anything from this role, that the only
control is client-side and bypassable in one line by anyone with the password
and a `psql` prompt, and then lists the eight specific things that follow.

**Two of those eight were stated WRONGLY by the previous header and by decision
15, independently of the guard**, and finding them was the point of re-deriving
rather than re-typing:

1. **Membership in `postgres` reads every row in every table**, `auth.users`
   included, because it owns them and ownership bypasses RLS. This was true of
   the guarded design too -- an event trigger never fires on a `select` -- and
   was simply never written down.
2. **NOCREATEROLE does not stop the role minting a second credential.** The old
   claim was that role ATTRIBUTES are not inherited through membership, which is
   true, and the conclusion drawn from it is false: `SET ROLE` does not inherit
   anything, it CHANGES `current_user`, and the privilege check for
   `create role` reads `current_user`. Measured against a NON-superuser
   `postgres` holding CREATEROLE, which is the real Supabase shape: the direct
   `create role` is refused 42501, `set role postgres` succeeds because the role
   is a member of `postgres`, and a `create role ... login` then succeeds and
   produces a working credential. `tests/apply-migration-guard.test.ts` asserts
   that as a PASSING test, so the exposure is a recorded fact rather than an
   absence somebody has to notice.

## The paste may still not succeed, and the reason is the server version

`grant postgres to idea_migrator` is the statement everything rests on: without
it the role owns nothing and every `alter table` in every migration fails.
PostgreSQL 16 changed GRANT on a role so the grantor must hold ADMIN OPTION on
the role being granted; before 16, CREATEROLE alone was enough.

On 16+, with a non-superuser `postgres`, that is unreachable:

- `postgres` cannot hold ADMIN OPTION on `postgres`, because admin option comes
  from a membership and a role cannot be granted to itself -- `grant postgres to
  postgres` is refused **0LP01**. Measured.
- so `grant postgres to idea_migrator` run as `postgres` is refused **42501
  permission denied to grant role "postgres"**. Measured.
- and there is a SECOND, independent refusal underneath it that the original
  design would have hit even with the attributes removed. PostgreSQL 16+
  automatically grants a CREATEROLE role ADMIN membership in every role it
  creates, so `create role idea_migrator` makes `postgres` a member of
  `idea_migrator`; the grant then closes a loop and is refused **0LP01 role
  "postgres" is a member of role "idea_migrator"** -- measured, and refused for
  a SUPERUSER performing the grant too, because it is a structural check rather
  than a privilege one. **It cannot be undone from the SQL editor**: the grantor
  recorded for that automatic membership is the bootstrap superuser, so
  `revoke idea_migrator from postgres` silently no-ops with a warning and
  `... granted by supabase_admin` is refused 42501. Both measured.

**NOT MEASURED: the PostgreSQL 15 half.** The repository's harness supplies only
17.10, so "on 15 and earlier the grant is expected to land" is stated as the
documented behaviour of the version change and not as something this session
ran. The file now reports `server_version` and `server_version_num` at paste
time and turns each refusal into a sentence naming the cause, so the answer
arrives with the evidence instead of as a bare 42501.

**A draft that revoked the reverse membership before granting was written and
removed**, because measurement showed it cannot work: the revoke is a no-op for
the role that would run it. Leaving it in would have been a statement that looks
like it handles the case and does not.

## The tool is now the only guard, so it was hardened

`tools/apply-migration.mjs` already parsed properly rather than regexing a
file: `splitStatements` is a character scanner that respects dollar-quoted
bodies, single-quoted literals with `''` escapes, double-quoted identifiers, and
both comment forms. That part was verified and left alone.

**`head()` had a real hole and it is exactly the one the prompt pointed at.** It
stripped comments only from the FRONT of a statement, so a comment in the MIDDLE
hid the keyword pair the refusal list matches on. Measured against the shipping
scanner before the fix:

| statement | before | after |
| --- | --- | --- |
| `drop table public.b;` | REFUSED | REFUSED |
| `drop /* sneaky */ table public.b;` | **SENT** | REFUSED |
| `drop -- sneaky` + newline + `table public.b;` | **SENT** | REFUSED |

A new `stripComments` removes every comment, respecting quoting and
dollar-quoting for the same reason `splitStatements` does -- a `--` inside a
string literal is not a comment, and removing it would change a statement's
meaning rather than reveal it. It handles **nested** block comments, which
Postgres has and a naive `indexOf('*/')` gets wrong, and it replaces each
comment with a SPACE rather than nothing, because `drop/*x*/table` is one token
to a naive join and two to Postgres.

**The four controls the prompt asked for, all passing**, now in
`tests/apply-migration.test.ts`:

1. A top-level `drop table` is refused before anything is sent.
2. The same text inside a `do $$ ... $$` block, a function body, a line comment,
   a block comment, a string literal or a `$tag$` body is NOT refused. **The
   parser does distinguish these** -- it is a real tokenizer, not a regex -- so
   there was no need to refuse both and no cost to report.
3. Split across lines, or with a comment inside it, is still refused: nine
   cases, count asserted, covering `drop table`, `truncate`, `delete`,
   `drop schema`, `drop owned` and `alter table ... drop column`, plus the
   nested-comment case.
4. A clean file with the real shape of a migration is sent.

**Mutation proof**, because a scanner that stops matching looks exactly like a
file with nothing wrong in it: `head()` was reverted to the leading-comments-only
version by writing over the file, and controls 3 and the token-welding check both
reddened (2 failed, 37 passed). Restored from a `cp` copy and md5-verified
identical (`3cbe9bab20dc5ffbb100d399db569eff`), green again at 39 passed. **No
`git checkout --` was run on any file in this session.**

**And the corpus sweep did not move.** All 180 committed migrations still refuse
exactly the same seven files, so the stricter head introduced zero false
refusals on real content -- which is the measurement that says the tightening is
safe rather than merely stricter.

Top-level `insert`/`update` were already refused by default (`main()` returns
`EXIT.refused`; `kind: 'warn'` decides only whether `--allow-dml` can release
them, which it can for those two and cannot for `delete` or `truncate`). That
was verified rather than changed, and a positive control was added beside it.
Every refusal reason that claimed the database would also refuse the statement
has been corrected; several said so and none of them was true any more.

## The duplicate decision 15

`15-scoped-migration-role.md` and `15-tournament-thumbs-stay-public.md` were
both written on 2026-09-05, by prompts that each read `origin/main`, each
correctly found 15 free, and each were right when they looked. Git merged them
without a murmur, because two files with different slugs conflict on nothing --
which is why it was invisible until somebody listed the directory. The same
failure as duplicate migration 0177, one directory over.

**The tournament entry moved to 17**, by a rule that needs no judgment: its
creating commit is 19:44:22 against 19:37:51, seven minutes later. `docs/decisions/README.md`
now carries that rule under **"How a number is claimed"**, and the honest part of
it is the first line: **a number cannot be reserved, and reading `origin/main` is
not a claim.** There is no fix that makes the claim atomic at write time, because
the only thing that could serialize two sessions is a shared file they both edit,
and a shared file is exactly the fork the directory was split to remove. So the
number is settled afterwards -- earlier creating commit keeps it -- and entries
are to be cited **by slug, never by number alone**, because `docs/history/` is a
dated record that is never edited and two entries there now say "decision 15"
meaning two different things, permanently.

**Not built, and named in the README so it is not reinvented: nothing detects a
collision.** `tools/idea-status.py` parses each entry's number out of its heading
and never compares two, so a duplicate prints twice and reads as two ordinary
rows. A check that reddens is what would have caught this in minutes rather than
hours; this prompt owned the renumbering and not the tool, so it is written down
rather than half-built.

Decision 15's guard paragraphs are **left standing unedited** under a heading
saying none of it is true any more, with a "What actually happened" section
appended. An entry has to show what was agreed as well as what was delivered.
Decision 16 (the merge-to-`main` half) is **unaffected and stands as decided** --
none of its six gates depends on the scoped role -- and gained a section saying
so, plus the distinction that a bad merge is an ordinary revert commit and a bad
apply has no revert at all.

## Verification

- **`npx svelte-check`: 0 errors, 37 warnings**, breakdown 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`, over 20 files. Exactly the documented baseline. The
  two `PUBLIC_SUPABASE_*` placeholders were exported before `svelte-kit sync`,
  per the documented phantom-error trap; this checkout has no `.env`.
- **Full suite, 2026-09-05 15:29:11 to 15:33:04 America/Los_Angeles**: 290 files,
  **5923 passed, 4 failed**, 231.69s.
- **THE 4 FAILURES ARE PRE-EXISTING AND ARE NOT THIS BUNDLE'S.** Established
  rather than assumed: a `git worktree` at `origin/integration` (54af392) with
  no change from this branch in it runs the same three files and fails the same
  4. They are `tests/derived-numbers.test.ts` (2, about
  `tools/browser-verify/README.md` region counts) and `tests/gauntlet-doc.test.ts`
  (2, about `docs/GAUNTLET.md` agreement and GAUNTLET migration coverage).
  Nothing in this bundle touches either subsystem. They are reported, not fixed:
  they belong to whoever owns those files.
- **One failure WAS this bundle's and is fixed.**
  `tests/workflows.test.ts`'s password sweep reads
  `/password\s+'([^']*)'/gi` over `supabase/roles/*.sql` and cannot tell a
  comment from a statement -- correctly, for a file that must never carry a real
  password -- and two illustrative `password '...'` strings in the new header
  tripped it. The header was reworded; the sweep was not touched.
- **The role file was applied to a real Postgres, twice, in two shapes.** A
  faithful fixture where the bootstrap superuser is `supabase_admin` and
  `postgres` is a non-superuser CREATEROLE role owning the database: the file
  raises with its own explanation and `pg_roles` holds no `idea_migrator`
  afterwards. And a shape where the grant can land: it commits, produces
  `rolcanlogin` true with all five refused attributes false and `rolinherit`
  true, **re-applies cleanly a second time**, the role can `alter table` a table
  owned by `postgres`, the direct `create role` is refused, and the commented
  reversal at the bottom of the file removes it completely.
- **NOT VERIFIED, and this is the important one: nothing here ran against the
  live Supabase project.** Whether that project is on PostgreSQL 15 or 16+ is
  the question that decides whether the file can work at all, and it is
  answerable only by pasting it and reading the version the file now prints.
  No preview was opened, no browser pass was run, and none was relevant: this
  bundle changes no surface.

## What is deliberately not here

- **Any attempt to obtain superuser on Supabase.** It is not available.
- **A migration.** The role file carries a password and must never become one;
  a migration would also run as the same non-superuser and fail identically.
- **The canned lane ending in `IDEA_instructions.md`**, which is already correct
  and names the tool, which is the half that survives. It was read and left
  alone.
- **A collision detector for decision numbers**, named above.
- **Edits to `docs/history/`.** Two entries there cite "decision 15" and one of
  them now means an entry numbered 17. That directory is a dated record and is
  not edited to match later changes; the renumbering is recorded on entry 17
  itself and the citation rule is in the decisions README.

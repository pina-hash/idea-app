# How a migration reaches production

**Two things are new and everything else is unchanged.** The database now keeps
its own record of which migrations it has, and a GitHub workflow applies the next
one when a change reaches `main`. Both need one setup, once, and the numbered
steps for it are in "Setting it up" below.

This file is the whole path. `CLAUDE.md` and
`docs/standards/IDEA_instructions.md` still own the rules about writing a
migration; this owns how one gets applied.

---

## The short version

| | |
| --- | --- |
| Where migrations live | `supabase/migrations/`, numbered `0001` upward |
| What applies one | `.github/workflows/migrate.yml`, on a push to `main` |
| How it applies one | `tools/apply-migration.mjs`, one named file, one transaction |
| What records it | `docs/migrations-applied/<nnnn>-<slug>.md`, committed by the workflow, and one row in `supabase_migrations.schema_migrations` |
| What you still do by hand | nothing per migration, once the setup below is done |

---

## Why this needed a setup step at all

Every migration this project has ever had was pasted by hand into the Supabase
SQL editor. That was not a preference. The database had never been touched by
the Supabase CLI, so it had no `supabase_migrations.schema_migrations` table --
the table the CLI uses to remember what it has already applied.

With no such table, `supabase db push` believes **nothing** is applied. Run
against this project it planned the entire chain from `0001`, which would have
re-run two one-time imports over real student coin data:

- `supabase/migrations/0084_coin_legacy_import.sql`
- `supabase/migrations/0100_coin_legacy_reimport.sql`

So `db push` was forbidden, correctly, and it stayed forbidden. What got lost
along the way is that the forbidden thing was **one command**, not the idea of
applying a migration without a person pasting it. Nothing in the repository knew
what production had, so every check that needed that answer had to guess from
the catalog object by object -- and for a migration whose objects cannot be
derived, the answer was "cannot say", which is never a pass. Five separate
sessions stopped at that gate in one week.

`supabase/data/0209-seed-migration-history.sql` writes down what is already
true. After it runs, the database's own record matches reality, `db push` has
nothing left to replay, and the workflow keeps the record current from then on.

---

## Setting it up

**Two steps. Do them in this order.** Step 1 is what makes step 2 safe.

### Step 1. Paste the seed

1. Open <https://supabase.com/dashboard> and sign in.
2. Click the **idea-app** project.
3. In the left sidebar, click **SQL Editor**.
4. Click **New query** (top left of the editor area).
5. Open `supabase/data/0209-seed-migration-history.sql` from this repository.
   On GitHub: go to the repo, click **supabase**, then **data**, then that
   filename, then the **Copy raw file** button (two overlapping squares, top
   right of the file view).
6. Click once inside the empty query box in the SQL Editor and paste.
   **Paste the whole file.** Do not run part of it.
7. Click **Run** (bottom right of the editor; the keyboard shortcut is
   Ctrl+Enter, or Cmd+Enter on a Mac).
8. **Look at the result table at the bottom.** It has three columns: `check`,
   `subject`, `detail`.

   **The first row is the one that matters.** Its `check` reads `VERDICT`.

   - `subject` = **`EQUAL`** -- correct. Go on to the next bullet.
   - `subject` starts with **`NOT EQUAL`** -- read "If the verification reports
     a difference" below before doing anything else.

9. **Now read the row whose `check` is `0211`.** It is a separate question with
   a separate answer.

   - `subject` = **`APPLIED, and now recorded`** -- correct, nothing to do. This
     is the expected answer: `docs/migrations-applied/0211-lucid-dirac-8b6m2f.md`
     records that you applied it on 2026-09-13.
   - `subject` = **`NOT APPLIED to this database`** -- not expected, but not
     broken either, and nothing was written for it. It means the record above is
     about a different database or the paste did not take. Say so; do not write
     the row by hand. The workflow will apply `0211` the first time step 2 is
     finished and something reaches `main`.

10. You never run this file again. If you do run it again by accident, nothing
    happens: it writes no row it has already written.

### Step 2. Set the secret

The workflow needs a connection string that can write to the database. It is
stored as a GitHub repository secret, which means the workflow can use it and
nobody, including anyone reading this repository, can read it back.

1. **Get the connection string.** In the Supabase dashboard for **idea-app**,
   click **Connect** (top of the page, beside the project name). Choose the
   **Session pooler** or **Direct connection** tab and copy the URI shown. It
   begins `postgresql://`.

   It contains a `[YOUR-PASSWORD]` placeholder. Replace that text, brackets
   included, with the database password. If you do not have it, click the gear
   icon (**Project Settings**) in the left sidebar, then **Database**, then
   **Reset database password** -- note that this changes the password for
   everything else that uses it too.

   **Prefer the `idea_migrator` role if it exists.** `supabase/roles/idea_migrator.sql`
   creates a narrower role for exactly this. If it has been created, use its
   username and password in the URI instead of `postgres`.

2. **Store it.** Go to
   <https://github.com/pina-hash/idea-app/settings/secrets/actions>.
   (Or: the repository page, then the **Settings** tab, then **Secrets and
   variables** in the left sidebar, then **Actions**.)
3. Click the green **New repository secret** button.
4. In **Name**, type exactly:

   ```
   IDEA_MIGRATION_URL
   ```

5. In **Secret**, paste the connection string from step 1.
6. Click **Add secret**.
7. The page now lists `IDEA_MIGRATION_URL` with an "Updated now" timestamp. The
   value is never shown again, which is correct. If you need to change it later,
   click the pencil icon beside it.

### Step 3. The one time you press a button

**This is the only step in this document that uses the Actions tab, and it
happens once.** A workflow added by a pull request does not run for the merge
that added it, so the first run has to be started by hand.

1. Go to <https://github.com/pina-hash/idea-app/actions/workflows/migrate.yml>.
2. Click the grey **Run workflow** button on the right.
3. Leave the box empty and click the green **Run workflow** button in the panel
   that drops down.
4. Wait for the run to appear in the list and finish. Click it, then click the
   **migrate** job, to read what it did. The summary at the top of the run page
   says one of:

   - **Nothing to apply** -- production already has every migration. Correct.
   - **Applying migration NNNN** followed by a green tick -- it applied one and
     committed the record. Correct.
   - **Stopped: the probe could not name a candidate** -- it could not read
     production's state for at least one migration, so it did nothing. Green,
     and correct. See "When the workflow says it could not name a candidate".
   - Anything red -- see "When a run goes red".

From then on it runs by itself on every push to `main` and you never open this
tab again.

---

## What happens after that, with no action from you

1. A bundle writes a migration and its pull request merges to `integration`.
2. `integration` merges to `main` (the **Deploy** workflow, as before).
3. The push to `main` starts **Migrate**. It asks production which migrations it
   has, takes the lowest one it does not, applies it, and commits a record under
   `docs/migrations-applied/`.
4. Vercel builds the same push. The migration is applied before the code that
   calls it is live, which is the order that matters.

**The workflow never applies two migrations in one run.** If two are outstanding
it applies the lower one and stops; the commit it makes is itself a push to
`main`, and a later push applies the next. That is deliberate: one file per run
is the same rule that has always governed this project, and it keeps every run's
record about exactly one thing.

---

## When something is not right

### If the verification reports a difference

The seed's last statement returns a row for every difference it found, by
migration number. Read the `check` column:

- **`IN THIS FILE, NOT IN THE TABLE`** -- the insert did not land. Re-paste the
  whole file and run it again. If it says the same thing twice, stop and say so;
  something is refusing the write.
- **`IN THE TABLE, NOT IN THIS FILE`**, `detail` says **EXPECTED** -- a
  migration numbered `0211` or above. It was applied after the seed file was
  written, which is exactly what is supposed to happen. Nothing to do.
- **`IN THE TABLE, NOT IN THIS FILE`**, `detail` says **UNEXPECTED** -- a
  migration numbered below `0211` is recorded and the seed does not list it.
  Nothing should be able to do that. Stop and say so before running anything
  else.
- **`PERMANENT HOLE`** -- these two rows are about `0190` and `0191`, which are
  gaps in the numbering on purpose. `absent, as intended` is the correct answer
  for both.

### When the workflow says it could not name a candidate

The run is green and it applied nothing. This means production's applied state
could not be read for at least one migration in range -- which is the ordinary
state of this project, because a few migrations create nothing the check knows
how to look for.

Nothing is wrong and nothing is stuck: the seeded history table is what will
eventually replace that check entirely. Until then, a migration in that position
is applied the way every migration was applied before this: paste it into the
SQL editor, exactly as in step 1 above, using the file under
`supabase/migrations/`.

### When a run goes red

Open the run, click the **migrate** job, and read the summary. It says which of
these happened, and every one of them leaves production alone unless it says
otherwise.

| The summary says | What it means | What to do |
| --- | --- | --- |
| **RED: the probe could not run** | The secret is set and production could not be reached at all. | Push again, or press **Run workflow**. If it repeats, the connection string is wrong -- redo step 2. |
| **Refused: cannot tell which bundle authorised migration NNNN** | The migration is fine; the run could not match it to a ledger entry. | Press **Run workflow** and type the four-digit ledger number in the box. The summary names the entries it looked at. |
| `apply-migration exited 2` | A refusal. Nothing was sent. The log says which check refused -- a destructive statement, a ledger entry that did not permit a migration, or a file that is not the lowest unapplied one. | Nothing is broken and nothing needs undoing. The bundle that wrote the migration has to answer it. |
| `apply-migration exited 3` | The migration ran and something in it raised. **The whole thing was rolled back; nothing it did survives.** | The log carries the error and every notice before it. The bundle that wrote it has to answer it. |
| **the migration APPLIED and could not be fully verified** | It committed and one object it names is not in the catalog, or its history row is not there. | **Do not re-run.** Re-running will not re-apply it. Read the committed record under `docs/migrations-applied/`, which says which object is missing. |

### If a migration applied and its row did not

You will see this only for a migration file that opens its own transaction. The
migration is applied; only its row in `supabase_migrations.schema_migrations` is
missing, so the database's record of itself is one behind.

Open the SQL Editor as in step 1, paste this, replacing `NNNN` with the four
digit number and `the_file_name` with the part of the filename after the
underscore and before `.sql`, and click **Run**:

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('NNNN', 'the_file_name')
on conflict do nothing
returning version, name;
```

It returns the row it wrote. If it returns nothing, the row was already there.

---

## Things that have not changed

- **`supabase db push` is still forbidden.** The seed removes the specific
  danger it had here, and it is still not how anything on this project applies a
  migration. `tools/apply-migration.mjs` takes one named file and refuses a
  range; that is the only path.
- **A migration is still an immutable applied record.** A mistake in an applied
  file is corrected by a new file, never by editing the old one.
- **Deploy still refuses to merge while a migration is unapplied.** Nothing here
  weakens that check. What changes is that the unapplied migration now gets
  applied on the next push to `main` rather than waiting for somebody.
- **No cloud session can reach this database.** The container's egress proxy
  accepts a connection to the database port and then carries no bytes, so a
  session working in this repository still cannot apply anything and still says
  so. A GitHub Actions runner is not behind that proxy, which is the whole
  reason the workflow can do what a session cannot.

---

## The one rule to keep straight

**The seed and the secret are one decision.** The secret is safe to hold in CI
*because* the seed removed the replay. If the history table is ever dropped, or
the seed reverted, **delete the `IDEA_MIGRATION_URL` secret in the same breath**
-- otherwise a credential that can write to production is sitting in front of a
command that would replay two coin imports over real student data.

`.github/workflows/migrate.yml` says this in its own header too, so that it
cannot be found only here.

# Backing up the database, and restoring it

`pina-hash/idea-app` is on the Supabase **free plan**, which has no automated
backups and no point-in-time recovery. This is what stands in for them.

Every night at 09:00 UTC (02:00 Pacific in summer, 01:00 in winter) the
**Backup** workflow dumps the production database with `pg_dump`, gzips it, and
puts one file in a Google Drive folder. It keeps the newest 30 and one copy from
each of the last 12 months, and deletes the rest.

**If you only ever read one section of this file, read
[Restoring](#restoring-into-a-fresh-project).** A backup nobody has restored is
a file, not a backup.

---

## Read this first: what is in the file, and what is not

**IN IT.** Everything in the database. All 127 tables in `public` with their
rows, every row-level security policy, every `SECURITY DEFINER` function, every
grant, every constraint and trigger. Plus `auth.users` and `auth.identities` --
who your students are and which Google account each one is -- and the
`storage.objects` rows.

Four `auth` tables are deliberately left out: `sessions`, `refresh_tokens`,
`flow_state` and `audit_log_entries`. The first three are who happened to be
signed in at 1am, and they are worthless in a restored project anyway (its JWT
secret is different, so none of those tokens would validate). The fourth is an
operational log that is routinely the largest table in a Supabase project, and
it would dominate the file while being the one thing nobody would ever ask for
back. **`auth.identities` is not one of them and never will be** -- see
[step 8](#8-turn-google-sign-in-back-on) for what depends on it.

**NOT IN IT: THE FILES.** `pg_dump` reads a database. The actual BYTES of every
Foundry bundle, classroom attachment, student hand-in, answer key, map photo and
notebook photo live in **Supabase Storage**, which is a different service that
no database dump can reach. What is captured is the rows that NAME those files.

So restoring this gives you a database that knows about every file and can serve
none. Everything else works: every student signs in as themselves, every coin
balance is right, every notebook entry, grade, tournament record and IdeaCAD
document is there. Downloads and images 404 until the buckets are refilled, and
there is nothing here to refill them from.

That gap is real and is not closed by this workflow. Closing it is separate
work: Storage has its own API and its own size problem, and a nightly copy of
every Foundry bundle is a different order of magnitude from a 262 KB database
dump.

---

## Where the backups are

A Google Drive folder, named by the `BACKUP_DRIVE_FOLDER_ID` repository secret.
One file a night:

```
idea-app-2026-09-12.sql.gz
```

The date is the **America/Los_Angeles** date, so the file is named for the
school day that just ended rather than for the UTC day that had just begun when
the run fired.

### Retention: 30 daily, 12 monthly

The rule is `keepDecision` in `tools/backup/drive-upload.mjs` and is computed
from the filenames alone -- there is no manifest and no label, so you can check
it by looking at the folder.

- **The newest 30 copies**, unconditionally. A mistaken statement in the SQL
  editor is noticed in hours or days, so what matters for that is yesterday's
  copy and the one before it.
- **The earliest surviving copy in each of the newest 12 calendar months.** A
  Bosco Tech summer is about ten weeks, which is longer than any daily window
  worth paying for. This is the chain that still has a link in August.

Anything else is deleted. A file this workflow did not write -- anything not
named `idea-app-YYYY-MM-DD.sql.gz` -- is **never** deleted; it is reported in
the run summary and left alone.

`node tools/backup/drive-upload.mjs --selftest` puts that rule to a fixture and
needs no credential. Run it after changing it.

### How big these get

Measured by `tools/backup/roundtrip.sh` against the real 201-migration schema on
PostgreSQL 16:

| what | gzipped | uncompressed |
| --- | --- | --- |
| the schema alone, 6 rows of data | **261,886 bytes** | 1,681,727 bytes |
| + 40,000 narrow rows | 1,406,789 bytes | 8,577,147 bytes |

(The first figure moves by a few bytes between runs: modern `pg_dump` writes a
random token into each dump's `\restrict` lines, and the header carries a
timestamp. Readings across several runs sat between 261,866 and 261,894.)

So the fixed cost of 201 migrations' worth of schema is about **262 KB**, and a
narrow row (a coin transaction, a notebook entry) costs about **29 gzipped
bytes** on top -- measured twice, at two scales, and linear between them
(28.9 and 28.6 bytes per row). Rows carrying prose or a JSONB document -- a
rich-text revision, an IdeaCAD feature tree -- cost roughly their own text
divided by three or four.

Extrapolating:

| rows in the database | dump, gzipped |
| --- | --- |
| 50,000 | ~1.7 MB |
| 250,000 | ~7.5 MB |
| 1,000,000 | ~29 MB |

Add roughly a third of the volume of any student writing and JSONB on top. A
mature year is very unlikely to exceed a few tens of megabytes, so the whole
42-file retained set stays comfortably inside even a personal Drive's 15 GB.

**The production database's actual size has not been measured**, because no
container in this repository's cloud sessions can reach it (see
[What was not verified](#what-was-not-verified)). The first real run's job
summary prints the number.

---

## Restoring into a fresh project

This is the whole point of the thing. Follow it in order.

You need, on your own computer:

- the `psql` command, from PostgreSQL **17 or newer**
  (macOS: `brew install libpq`; Windows: the PostgreSQL installer, then use the
  "SQL Shell (psql)" it installs). Anything older than the `pg_dump` that wrote
  the file will refuse it.
- about ten minutes.

### 1. Get the file

Open the Drive folder. Pick the copy you want -- normally the newest, but if the
damage happened some days ago and you are not sure when, pick a copy from before
it. Click it, then **Download**.

You now have `idea-app-2026-09-12.sql.gz` in your Downloads folder. Do not
unzip it; `psql` is given it zipped.

**If the folder is empty or the newest file is old:** the nightly run has been
failing. Open the repository on github.com, go to **Actions**, click **Backup**
in the left-hand list, and read the newest run's summary. Fix that first --
restoring from a two-month-old copy is a decision, not an accident.

### 2. Make a new Supabase project

At <https://supabase.com/dashboard>, press **New project**.

- **Name**: something you will recognise, `idea-app-restored-2026-09-12`.
- **Database Password**: generate one and **save it somewhere now**. You cannot
  read it back later and you need it in step 3.
- **Region**: the same as the original project.

Wait for it to finish setting itself up. That takes a couple of minutes.

> **Do not restore into the original project unless you mean to.** If the
> original is still there and merely damaged, a fresh project lets you compare
> the two before you commit to anything. It is also the only safe option if you
> are not certain what went wrong.

### 3. Get its connection string

In the new project, press **Connect** at the top of the page. Choose the
**Session pooler** tab and copy the string. It looks like:

```
postgresql://postgres.abcdefghijklm:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:5432/postgres
```

Replace `[YOUR-PASSWORD]` with the password from step 2.

> **Session pooler, port 5432 -- not Transaction pooler, port 6543.** The
> transaction pooler does not keep a session between statements, and a restore
> is one long session. If the button has been renamed, the one you want is the
> one whose port is **5432**.

Keep that string on your clipboard. The commands below call it `$URL`; on
Windows's SQL Shell you will paste it where the command says `"$URL"`, quotes
included.

### 4. Empty the new project's `public` schema

Paste this into the new project's **SQL Editor** (left sidebar) and press
**Run**:

```sql
drop schema if exists public cascade;
```

**Correct result:** `Success. No rows returned.`

**Why:** the backup file creates the `public` schema itself, and a new project
already has one. Without this step the restore stops immediately with
`ERROR: schema "public" already exists` and writes nothing.

### 5. Restore

In a terminal, in the folder holding the downloaded file:

```
gunzip -c idea-app-2026-09-12.sql.gz | psql -v ON_ERROR_STOP=1 --single-transaction "$URL"
```

This takes a few seconds for a small database and a few minutes for a large one.
It prints a wall of `CREATE TABLE`, `CREATE FUNCTION` and `COPY` lines.

**Correct result:** it ends and gives you your prompt back with no line
beginning `ERROR:`.

**`--single-transaction` means all or nothing.** If anything fails, nothing at
all is written and you can fix the cause and run the identical command again. A
half-restored database is the thing you least want to be reasoning about.

If it does fail, see [When it goes wrong](#when-it-goes-wrong) -- the message
is on the LAST few lines, and everything above it is the part that worked.

### 6. Check that it worked

Back in the **SQL Editor**, run:

```sql
select
  (select count(*) from auth.users)                     as students,
  (select count(*) from public.profiles)                as profiles,
  (select count(*) from public.coin_transactions)       as coin_rows,
  (select count(*) from public.notebook_entries)        as notebook_entries,
  (select count(*) from pg_policies
     where schemaname = 'public')                       as rls_policies,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public')                        as functions;
```

**Correct result:** every number is greater than zero, `profiles` is close to
`students`, and `rls_policies` and `functions` are in the low hundreds. On the
tree this was written against, a database with no data at all still has **201**
policies and **545** functions -- those two come from the schema, so if either
is zero or tiny, the schema did not restore and the data on top of it means
nothing.

And spot-check one real thing you recognise:

```sql
select student_email, sum(amount) as balance
from public.coin_transactions
group by 1 order by 2 limit 10;
```

**Correct result:** real student addresses, with balances you can sanity-check
against what you remember.

### 7. Point the site at the new project

Three values in Vercel, under the project's **Settings -> Environment
Variables**. Take all three from the new Supabase project's **Project Settings
-> API** page:

| variable | where it comes from |
| --- | --- |
| `PUBLIC_SUPABASE_URL` | "Project URL" |
| `PUBLIC_SUPABASE_ANON_KEY` | the `anon` / `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key |

**Then REDEPLOY. Changing them is not enough.** The first two are read through
`$env/static/public`, which SvelteKit inlines into the JavaScript **at build
time** -- so until a new build runs, the site keeps talking to the old project
no matter what the Vercel settings say. In Vercel: **Deployments**, the newest
one, the **...** menu, **Redeploy**.

### 8. Turn Google sign-in back on

A new project has no auth providers configured, so nobody can sign in yet.

1. In the new project: **Authentication -> Sign In / Up -> Google**, enable it,
   and paste the same **Client ID** and **Client Secret** the old project used.
2. Copy the **Callback URL** that page shows you.
3. In the Google Cloud console, on that OAuth client, add that callback URL to
   **Authorised redirect URIs**.

**Students keep their identity.** `auth.identities` is in the backup, and that
is the table saying "this Google account is that uuid" -- so a student signs in
and lands on their own notebook, their own coins and their own Foundry apps. If
that table had been left out, everyone would be issued a brand new uuid on their
next sign-in and every row they own would be stranded behind them. This is worth
checking explicitly: sign in as yourself and confirm you see your own admin
surfaces.

### 9. Know what is still missing

Go back and read [what is in the file and what is
not](#read-this-first-what-is-in-the-file-and-what-is-not). Attachments,
hand-ins, photos and Foundry bundles will 404. Tell people that before they find
out.

---

## When it goes wrong

**`ERROR: schema "public" already exists`** -- step 4 was skipped. Run it and
repeat step 5.

**`ERROR: operator class "public.gin_trgm_ops" does not exist`** -- the file was
made by an older version of `tools/backup/dump.sh` that did not carry the
`pg_trgm` extension. Use a newer copy, or run
`create extension if not exists pg_trgm;` in the SQL editor first and restore
again.

**`pg_dump: error: server version: 17.x; pg_dump version: 16.x`**, or the same
from `psql` -- your client is older than the server. Install a newer one; see
the requirements at the top of [Restoring](#restoring-into-a-fresh-project).

**`\restrict: invalid command`** -- same cause, from the other direction: your
`psql` is older than the `pg_dump` that wrote the file. Those two lines are a
safety marker modern `pg_dump` emits, and only a `psql` that knows about them
can read the file.

**The restore hangs, or dies with `server closed the connection unexpectedly`**
-- you are probably on the transaction pooler. Go back to step 3 and take the
**port 5432** string.

**`ERROR: permission denied`, on anything** -- you are connected as something
other than `postgres`. The connection string from the **Connect** panel is the
right one.

**`ERROR: must be member of role "pg_database_owner"`** -- the file carries
`ALTER SCHEMA public OWNER TO pg_database_owner`, and the role you are connected
as is not a member of it. Nothing was written (`--single-transaction`), so drop
that one line and run it again:

```
gunzip -c idea-app-2026-09-12.sql.gz \
  | grep -v 'OWNER TO pg_database_owner' \
  | psql -v ON_ERROR_STOP=1 --single-transaction "$URL"
```

That changes who owns the schema and nothing else -- every table, function and
policy inside it keeps the owner the file gives it, which is what matters,
because a `SECURITY DEFINER` function runs as ITS owner.

**`ERROR: role "something" does not exist`** -- a grant in the file names a role
the new project does not have. Create it with no privileges
(`create role something nologin noinherit;`) in the SQL editor and restore
again; the file's own `GRANT` statements then give it exactly what it had.

### When the nightly run goes red

Open **Actions -> Backup** and read the newest run's summary.

- **"Backup did not run -- these repository secrets are not set"** -- exactly
  what it says. See [Setting up the secrets](#setting-up-the-secrets-once).
- **`invalid_grant`** from Google -- the refresh token has been revoked or has
  expired, or the Google account's password changed. Mint a new one and update
  `BACKUP_GOOGLE_REFRESH_TOKEN`; see below.
- **"the dump is N bytes; the schema alone is about 260,000"** -- the dump
  connected and read almost nothing. Usually the `backup_dumper` role lost
  `pg_read_all_data` or `BYPASSRLS`. Re-run the grants in
  [Setting up the secrets](#setting-up-the-secrets-once).
- **`query would be affected by row-level security policy`** -- the role has
  `pg_read_all_data` but not `BYPASSRLS`. See the note in that section; this is
  the one that must not be "fixed" with `--enable-row-security`.

---

## Setting up the secrets (once)

Five repository secrets. All of it is yours to do; no session in this repository
can hold any of it, and none ever will.

### 1. A read-only database role

In the **production** project's SQL editor:

```sql
create role backup_dumper login password '<a long random password>'
  nosuperuser nocreatedb nocreaterole bypassrls;
grant connect on database postgres to backup_dumper;
grant pg_read_all_data to backup_dumper;
```

**Why a role rather than the `postgres` string.** This repository is public, and
the thing this backup mostly exists to undo is a mistaken statement. A
credential that cannot write cannot be the cause of one. Proven in
`tools/backup/roundtrip.sh`: a role made exactly this way is refused on
`insert`, on `delete` and on `drop table`, and still produces a dump that is
**byte-for-byte identical** to the owner's.

**`bypassrls` IS NOT OPTIONAL, and this is the one line to get right.**
`pg_read_all_data` grants SELECT on every table and does *not* confer
`BYPASSRLS`. `pg_dump` issues `SET row_security = off` before it copies
anything, so without the flag it stops on the first table with RLS enabled --
measured, on `storage.objects`. That refusal is the good outcome: the
alternative spelling, `pg_dump --enable-row-security`, does **not** error. It
dumps whatever the policies let that role see, which for a role no policy names
is nothing at all, and hands you a valid, uploadable, empty backup. Do not reach
for that flag.

**If Supabase refuses `bypassrls`** (the `postgres` role has to hold an
attribute to grant it), the fallback is the project's own `postgres` connection
string. It works, and it costs you the read-only property: say so to yourself
rather than forgetting you did it.

### 2. `BACKUP_DATABASE_URL`

On github.com: the repository, **Settings -> Secrets and variables -> Actions**,
**New repository secret**.

- **Name**: `BACKUP_DATABASE_URL`
- **Secret**: the production project's **Session pooler** string (step 3 above),
  with `postgres.<ref>` replaced by `backup_dumper.<ref>` and the password
  replaced by the one you just set. Add `?sslmode=require` on the end.

### 3. A Drive folder

In Google Drive, signed in as the Bosco Tech account this repository already
uses for Drive, make a folder called `idea-app database backups`. Open it and
read the id out of the address bar:

```
https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz
                                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^ this
```

Add it as the secret **`BACKUP_DRIVE_FOLDER_ID`**.

**Do not share that folder with anyone, and do not put it anywhere shared.**
Every file in it is the whole school's data in one download: student names and
addresses, coin balances, notebook writing, grades. A Drive folder is one click
from "Anyone with the link", and that click is not recoverable. If it has to be
reachable by more than one person, share it with named accounts, never a link.

**The files are not encrypted, and that is a choice rather than an oversight.**
Encrypting them would mean a key, and a key is a thing to lose -- an encrypted
backup whose passphrase went with the laptop is not a backup. The protection
here is that the folder is private to a school Google account with its own
sign-in, which is the same protection the live database's dashboard has. If that
ever stops being enough, the right answer is a second, named-account-only folder
rather than a passphrase in somebody's head.

### 4. The three Google secrets

- `BACKUP_GOOGLE_CLIENT_ID`
- `BACKUP_GOOGLE_CLIENT_SECRET`
- `BACKUP_GOOGLE_REFRESH_TOKEN`

You already have working values for all three: they are `GOOGLE_OAUTH_CLIENT_ID`,
`GOOGLE_OAUTH_CLIENT_SECRET` and `GOOGLE_DRIVE_REFRESH_TOKEN` in the Vercel
environment. Copy them across.

**Why they have different names.** `CLAUDE.md` requires that a credential have
exactly one reader, and for Drive that reader is
`src/lib/server/notebook-drive.ts`. Separate names mean you can revoke the
backup's access without touching notebook photos, and a leak of one is not a
leak of both. If you would rather they be genuinely separate credentials rather
than the same values under two names, visit `/admin/drive-connect` on the live
site and mint a second refresh token -- Google issues a new one per consent and
leaves existing ones working.

**When the credential stops working.** A refresh token dies if it is revoked, if
the Google account's password changes, or if the OAuth consent screen is in
"Testing" rather than "In production" (in Testing, Google expires them after
seven days). Mint a new one at `/admin/drive-connect` and update the secret.

---

## Firing the first run

The nightly schedule only starts once `backup.yml` is on the repository's
default branch, and a schedule does not fire retroactively. So run it once by
hand and read what it says.

1. On github.com, open the repository and click **Actions**.
2. In the left-hand list, click **Backup**.
3. On the right, click **Run workflow**. Leave the branch as `main`.
4. Click the green **Run workflow** button.
5. Wait about a minute and refresh. Click into the run.

**Correct result:** a green tick, and a summary naming the file, its size in
bytes, and the PostgreSQL version it read. The file is in the Drive folder.

**Then restore it.** Not eventually -- now, while you are already here. Follow
[Restoring](#restoring-into-a-fresh-project) into a throwaway project and delete
that project afterwards. The first restore is the one that finds the thing
nobody thought of, and the worst time to find it is the time you actually need
it.

---

## Why Google Drive, and what was rejected

You asked about Drive specifically. It is the right answer here, and it is worth
saying why rather than just agreeing.

**Google Drive -- chosen.**

- *Credential*: three repository secrets, and you already have working values
  for all three. No new vendor, no new account, no new billing relationship.
  Nothing about the school's Google Workspace has to be negotiated: this repo
  already proved that a **service account cannot work** against it (the
  Workspace policy blocks any identity outside the school domain) and that OAuth
  on behalf of a real account does. That is exactly the kind of thing that
  otherwise fails at 2am with nobody watching.
- *Size*: 15 GB on a personal account, far more on the school's. The whole
  42-file retained set is projected in the low hundreds of megabytes.
- *Retention*: entirely ours. Deleting a file deletes it.
- *Restore*: **you can see the file.** You open a folder in a browser you are
  already signed into and press Download. No CLI, no token, no Actions UI.

**GitHub Actions artifacts -- rejected, three separate reasons, any one of which
would be enough.**

- Retention caps at **90 days**. That is a hard platform limit, and it does not
  cover a school year.
- Getting a file back means the **Actions UI or the API** -- and you do
  everything by pull request. A restore path that starts with "find the right
  workflow run" is a restore path nobody follows under pressure.
- **This repository is public**, and its artifacts listing answers to nobody in
  particular. Measured from this container with no credential of any kind:
  `GET https://api.github.com/repos/pina-hash/idea-app/actions/artifacts`
  returned **HTTP 200**. There are no artifacts today so the download endpoint
  itself could not be tested, and I will not claim what I did not measure --
  but a store I cannot prove is private is not where a school's student data
  goes.

**Committing the dump to this repository -- rejected outright.** Measured
anonymously: the GitHub API answers `"private": false` for
`pina-hash/idea-app`. Committing student emails, coin ledgers and notebook
writing to it would publish them, permanently and unremovably, since git history
does not forget.

**A second, PRIVATE GitHub repository (files, or release assets) -- the runner
up, and genuinely viable.** Rejected for two reasons rather than one bad one:
the credential would be a fine-grained personal access token, which is a new
kind of thing that **expires** and has to be re-minted on a schedule nobody
remembers; and a PAT sitting in a public repository's secret store has a wider
blast radius than a Drive refresh token scoped to one folder. If Drive ever
becomes a problem, this is what to move to.

**S3, Cloudflare R2, Backblaze B2 -- rejected.** A new vendor, a new account and
a new billing relationship, in exchange for being *worse* at the thing that
actually matters: a person finding the file and getting it back.

**Supabase's own Storage -- rejected without much thought.** A backup on the
service you are backing up is not a backup.

---

## How any of this is known to work

`tools/backup/roundtrip.sh` -- run it, it needs no credential and no network:

```
bash tools/backup/roundtrip.sh
```

It boots a throwaway PostgreSQL, applies **all 201 real migration files**, seeds
rows in `auth.users`, `auth.identities`, `storage.objects`, `profiles`,
`coin_transactions` and `notebook_entries`, runs the same `tools/backup/dump.sh`
the workflow runs, and restores the result into a second database with the exact
command [step 5](#5-restore) gives. Then it compares the two:

- all **127** `public` tables present in both, with identical row counts;
- content compared value for value on six tables across both halves of the file;
- **201** RLS policies, **545** functions, **634** constraints, **25** triggers,
  and the function ACL set, identical;
- the same dump taken again as the read-only `backup_dumper` role, byte for byte
  identical, with that role refused on `insert`, `delete` and `drop table`;
- and a **negative control** that deletes rows and drops a policy from the
  restored copy and requires both comparisons to notice, so a green run cannot
  be a comparison that was reading nothing.

`node tools/backup/drive-upload.mjs --selftest` does the same for the retention
rule, which is the one part of this that can delete something.

`node tools/backup/drive-upload.mjs --selftest-transport` puts the half that
talks to Google to a **loopback server that answers the way Drive does**, so the
network code is not shipped having never been executed. It proves the refresh
token is exchanged once, that every later call carries the minted bearer token,
that the two-step resumable handshake is followed and 3 MB arrives byte-identical
at the session URL, that the listing is paged to the end, and that exactly the
copies the retention rule chose are deleted and the foreign file is not. It does
**not** prove Google accepts these requests -- only that they are formed and
sequenced correctly.

### What was not verified

- **Nothing here has ever run against the production database.** No container in
  this repository's cloud sessions can reach it: the egress proxy accepts a
  CONNECT to 5432 and carries no bytes. The workflow was written, committed, and
  never successfully run. The first real run is yours.
- **Nothing here has ever talked to Google Drive.** `drive-upload.mjs`'s token
  refresh, resumable upload and delete calls have not been executed against the
  live API. Its retention rule has, at length, via `--selftest`.
- **The round trip restores into a bare database, not into a fresh Supabase
  project.** The difference is what [step 4](#4-empty-the-new-projects-public-schema)
  and [step 8](#8-turn-google-sign-in-back-on) are about, and it is why the
  first restore should be a rehearsal rather than an emergency.
- **The round trip ran on PostgreSQL 16.13**, which is what this container has.
  Supabase may be on 15 or 17; the workflow asks the server its version and
  installs a matching client for exactly that reason, and that step has not run.
- **Production's real size is unknown**, so the extrapolation above is built
  from measured bytes-per-row and not from a reading of the live database.
- **Supabase dashboard labels move.** The button and field names in
  [Restoring](#restoring-into-a-fresh-project) were written from how the console
  is laid out today; where one matters, the identifying property is given beside
  it (the pooler is "the one on port 5432") so a rename does not strand you.

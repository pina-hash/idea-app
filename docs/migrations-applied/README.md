# docs/migrations-applied/

**One file per migration that actually applied to the production database,
written by `tools/apply-migration.mjs` and committed by the session that ran
it.** Nothing here is written by hand and nothing here is a plan: a file exists
if and only if a transaction committed.

Before prompt 0066 the tool wrote nothing anywhere, on purpose -- a failed apply
had to leave no trace of itself. That was right about failure and wrong about
success. Once a session applies its own migrations with nobody watching, "what
touched the database, when, and from which bundle" has to be answerable from the
repository, and it was not answerable from anything.

## What is in a file

Front matter, so `grep -r` over this directory finds an apply by number, by
branch, by ledger entry or by date without reading anything end to end:

| field | |
| --- | --- |
| `migration` | the four-digit number |
| `file` | the migration's filename |
| `sha256` | of the file's bytes AS APPLIED, so a later edit to the file is detectable |
| `applied_at` | UTC, ISO 8601 |
| `ledger` | the bundle that authorised it |
| `branch` / `commit` | where the apply ran from |
| `session_user` / `database` | what the SERVER answered, not what the URL said |
| `outcome` | `applied`, or `unverified` when an object the file names did not turn up |

Then the body: the authorising ledger line quoted in full, every notice in the
order it arrived with its severity, and the per-object verification as a table.

**NOTHING FROM THE CONNECTION STRING IS IN A FILE.** No host, no port, no
password, and the URL never reaches the writer. Every free-text field goes
through `redact` on the way in, so a URL that turned up inside a notice is
masked rather than committed to a public repository. `session_user` and
`database` are the exception and are deliberate: they are answers the server
gave to a query rather than strings parsed out of the URL, and "this ran as
`postgres` rather than `idea_migrator`" is exactly what the record exists to be
able to say.

## Why one file per apply

The same reason `docs/history/` is one file per entry and
`classroom-updates.json` is the counter-example: a shared array is a merge
conflict every time two sessions touch it, and the history split is what fixed
that. The name is `<nnnn>-<branch slug>.md`, with the slug taken exactly as
`docs/history/` takes it -- the branch with `claude/` or `lane/` stripped. The
harness mints one branch per session and a branch name cannot be taken twice, so
two sessions cannot collide **by construction** rather than by anyone checking.

The number alone would nearly work, because the ordering rule refuses a
migration that is already applied. It would lose exactly one race: two sessions
that both read the probe before either committed. Two sessions are two branches.

## What a file does NOT prove

That the migration was a good idea, or that its effect on real data was what was
intended. The `outcome` field answers whether every object the file NAMES exists
afterwards. It never answers whether a backfill did the right thing. That
distinction is decision 16's third un-establishable gate and it is unchanged.

Nor is this an audit log in the security sense. It is written by the same
process that did the applying, into a repository that process can also edit. It
catches a session that forgot, not a session that meant to.

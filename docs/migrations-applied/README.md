# docs/migrations-applied/

**One file per migration that actually applied to the production database.**
Nothing here is a plan.

**THERE ARE TWO KINDS OF RECORD AND THE FRONT MATTER SAYS WHICH.** `source: tool`
is a record `tools/apply-migration.mjs` wrote from a transaction it watched
commit and a catalog it queried afterwards. `source: report` is a record
`tools/record-applied.mjs` wrote from the report of the person who pasted the
migration into the Supabase SQL editor by hand. **A reader must be able to tell
them apart with `grep`**, so the distinction is a field rather than a tone, and
the second kind opens its body with a sentence saying in words that it rests on
a report and not on a measurement.

Before prompt 0066 the tool wrote nothing anywhere, on purpose -- a failed apply
had to leave no trace of itself. That was right about failure and wrong about
success. Once a session applies its own migrations with nobody watching, "what
touched the database, when, and from which bundle" has to be answerable from the
repository, and it was not answerable from anything.

**AND THEN NO SESSION COULD RUN THE TOOL, SO FOR EIGHTEEN MIGRATIONS THE ANSWER
WAS AGAIN NOTHING.** A cloud session's egress proxy accepts a CONNECT to port
5432 and then carries no bytes, permanently -- measured, and written into
`docs/standards/IDEA_instructions.md` as the reason no prompt may plan around a
session applying its own migration. So `0193` through `0210` were every one of
them pasted by hand, this directory held only this file, and every lane's
applied-state gate read `CANNOT SAY`. That is what `record-applied.mjs` is for:
it fits the loop Mr. Pina already runs rather than adding one beside it.

    node tools/record-applied.mjs 0211 --query
        Prints the read-only catalog probe for 0211, derived locally through
        `deploy-probe.mjs`'s own `readProbes`/`prepare`/`buildSql` -- the SAME
        probe the measuring tool would have run, so this is not a second idea
        of what to check. Paste it after the migration.

    node tools/record-applied.mjs 0211 --by "Mr. Pina" --on 2026-09-13 \
        --evidence rows.txt
        Writes the record from what came back. `--evidence -` reads stdin.

**IT IS A SECOND TOOL RATHER THAN A FLAG ON THE FIRST, DELIBERATELY.** An
`--offline` mode on `apply-migration.mjs` would make the sentence above -- a
file exists if and only if a transaction committed -- false, and it would put a
measurement and a report behind one code path where nothing distinguishes them.
The two-tool shape is what keeps `source:` honest. A shared `applied.json`
somebody edits was the other rejected option: one file is one write point, which
is the merge conflict `docs/history/` was split to remove.

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
| `session_user` / `database` | what the SERVER answered, not what the URL said. **`source: report` records carry NEITHER, and the absence is the signal** -- a tool that spoke to no server has no honest value for either, so it writes none rather than a guess |
| `source` | `tool` or `report`, per the two kinds above |
| `outcome` | for `source: tool`, `applied` or `unverified` when an object the file names did not turn up. For `source: report`, `applied` only where a verification query's output was supplied, and `reported` where the whole of the evidence is that somebody says they pasted it |
| `attested_by` / `evidence` | `source: report` only. Who reported it, and whether that report carried query output (`verification-output`) or nothing but their word (`report-only`) |
| `sha256_covers` | `source: report` only. A hand apply cannot hash the bytes that were pasted, only the bytes in the repository at record time, and the two differ if the file has since moved. The field names the commit so nobody reads the hash as more than it is |
| `recorded_by_ledger` | `source: report` only. **`ledger` names the bundle that WROTE the migration and never the one recording it**, because `apply-migration.mjs`'s `appliesUnderLedger` greps `^ledger:` to ask "has this bundle already applied one" -- pointing that at the recorder would attribute eighteen migrations to a lane that wrote none of them |

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

**A `source: report` record has no race to break, so its slug is doing a
different job and is chosen on different grounds.** There is one applier and he
applies one at a time. The slug therefore names the branch the migration came
FROM -- attribution, which is what a reader opening `0209-...md` actually wants
-- and `0201` is the case that shows why it is worth stating: that migration
came from a Codex task, so its slug is a `codex/**` branch name read off the
merge that brought the file in, not a `claude/**` one.

## What a file does NOT prove

That the migration was a good idea, or that its effect on real data was what was
intended. The `outcome` field answers whether every object the file NAMES exists
afterwards. It never answers whether a backfill did the right thing. That
distinction is decision 16's third un-establishable gate and it is unchanged.

Nor is this an audit log in the security sense. It is written by the same
process that did the applying, into a repository that process can also edit. It
catches a session that forgot, not a session that meant to.

**AND A `source: report` RECORD PROVES ONE STEP LESS THAN THAT.** It is one
person's account, written down where the next session can find it instead of
nowhere. It does not say the objects were seen; where a verification query was
reported, the record reproduces the values and does NOT interpret them, because
whether a particular `false` is a pass is a question about a query this
repository did not write and did not run. Treat `source: report` as better than
silence and weaker than a measurement, which is exactly what it is.

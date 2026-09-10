---
title: "Prompt 0140: landing the HTML-assignment subsystem, and a Gate 5 that could not be met (`claude/ledger-0140-deploy-gate-dc8awr`, no migration)"
date: 2026-09-10
branches: [claude/ledger-0140-deploy-gate-dc8awr]
migrations: []
subsystems: ["Deploy", "Prompt ledger", "CI", "HTML assignments"]
---

Seven finished ledgers had accumulated on `integration` since `main`'s last
landing at `a3e6576e`, and every one of them was one feature: the ported HTML
assignment. 0126 drew the boundary and 0131 reserved the `hx` slug it serves
from; 0127 and 0136 fixed the manifest contract and mirrored it into the spec
path; 0137 wrote the authoring template; 0138 widened the write gate, which is
migration `0197`; and 0139 was the grep that found the whole thing inert --
`htmlAssignmentTransports` had no occurrence under `src/routes/` at all, so an
import panel nobody could reach was gated on a transport nobody passed. This
bundle owns none of that. It owns the merge, the ledger entry and this file,
and it wrote no source file, because none turned out to be needed.

## What landed

`integration` at `8564be38` merged into `main` at `9450aadd` with `--no-ff`,
producing `ad31fdafe4befde98e2405cf44f06a9a324640ca`, pushed non-force. The
merge was clean in both the dry run and the fact: `git merge-tree
--write-tree --messages` exited 0 with a single tree oid and zero conflict
messages beforehand, and no file conflicted during. `classroom-updates.json`
never came into it -- worth saying only because that file is AT THE REPO ROOT
rather than under `static/`, which is the detail a landing session gets wrong
under time pressure.

`main` was already an ancestor of `integration` at the branch point and still
was on a re-fetch immediately before the merge, so the reconciling merge in the
other direction was a genuine no-op rather than a skipped step. Exactly one
migration was new on `integration` relative to `main`:

```
$ git diff --name-status origin/main origin/integration -- supabase/migrations/
A	supabase/migrations/0197_classroom_html_assignment_write_gate.sql
```

`0193` through `0197` were all hand-applied to production and reported verified
before this session opened. Only `0197` rode in on this merge.

## The CI dispatch, and why the duration is the measurement

`ci.yml` sets `continue-on-error: true` on all four of its checks, so the
rolled-up run conclusion says nothing useful; the aggregator step echoes the
four `outcome` values and those are what were read. Run **34529196552**,
dispatched with `inputs.ref` set to the full forty-character
`8564be382f334782013342ec61e0db5bda32b786`:

```
ref tested:         8564be382f334782013342ec61e0db5bda32b786 (HEAD)
check:              success
test:               success
vanguard-changelog: success
history-verify:     success
```

**The wall clock is a second, independent instrument here and it was read as
one.** A short sha makes `actions/checkout` fail while the later `if: always()`
steps report success against an empty workspace -- a green-looking run that
tested nothing, finishing in under a minute. This run took **5m41s**, with the
`Test suite` step alone accounting for 4m37s of it, which is the shape of a
suite that actually ran. The `ref tested:` line is the direct confirmation and
the duration is the corroboration; either alone is weaker than people assume,
because the failure mode this guards against is precisely one that prints
`success` four times.

## Gate 4: the substitution, stated rather than assumed

`node tools/deploy-probe.mjs` cannot pass in this container:

```
deploy-probe: DEPLOY_PROBE_URL is not set, so production's applied set cannot
be read. This is "cannot confirm", never "applied".
(exit 1)
```

That is the tool working correctly. `CANNOT SAY` is never a pass, and the probe
fails closed by design. Ledger 0115's substitution applies: the gate rests on
the five migrations already applied by hand and on their reported verification
output, and the exit 1 is not a stop.

**I verified none of those values myself, and that sentence is load-bearing
rather than ceremonial.** No session in this container reaches the production
database, and the local `.env` points at a placeholder project. What I can say
about `0197`'s reported figures is only that they are internally coherent:
`file_arities 2` alongside `wide_defaults 0` is exactly the signature-trap
shape `CLAUDE.md` prescribes for an RPC a deployed client already calls -- both
arities standing, no defaults on the wide one, so no payload binds to both.
That shape is what made this deploy safe in either order relative to the
migration, which is why the ordering never had to be reasoned about.

## Gate 5 was not met, and pretending otherwise was the available shortcut

The prompt required confirming the deploy by reading production and never from
push output. **This session cannot reach `ideabosco.com`.** Both paths refused:

```
curl: (56) CONNECT tunnel failed, response 403
```

and, through the fetch tool, `EGRESS_BLOCKED` -- "Access to ideabosco.com is
blocked by the network egress proxy." The proxy's own status endpoint named the
host and the reason in `recentRelayFailures`: `connect_rejected`, "gateway
answered 403 to CONNECT (policy denial or upstream failure)",
`ideabosco.com:443`. `/root/.ccr/README.md` is unambiguous that a 403 there is
an organization policy denial and that the response is to report the blocked
host, **not to retry or route around it**. So `idea-app-sage.vercel.app` was
not tried: it serves the same bytes, and fetching it would have been routing
around the denial rather than respecting it.

What was obtained instead is Vercel's own commit status for `ad31fdaf`, polled
from `pending` ("Vercel is deploying your app", 21:02:21Z) to terminal at
**`success`, "Deployment has completed", 21:03:21Z**.

**That is not the same claim and must not be recorded as one.** It is the
builder reporting that it built and deployed. It cannot distinguish a completed
deploy from a served page carrying the expected stamp, which is the entire
reason the standing rule says to read production rather than trust a report.
The footer stamp was never read and no sha was ever matched against it. Every
prior landing ledger in `docs/prompt-ledger/entries/` makes a stronger claim
than this one does, and the difference is a missing measurement rather than a
difference in wording.

The open action: a session with egress should fetch
`https://ideabosco.com/assignments/IDEA-Blade_Rulebook_v2_2` and confirm the
footer stamp names `ad31fda`.

## Not verified

- **The production deploy itself**, per the section above. Vercel's status is
  the only signal; the served page was never read.
- **Every migration value in the prompt**, `0193` through `0197` inclusive.
  Reported, not measured here.
- **The suite was not run locally.** CI ran it on the exact tip and its four
  outcomes were read; nothing was re-run in this container, and no source file
  was touched that could have needed it.
- **No browser pass.** This bundle changed no rendered surface.

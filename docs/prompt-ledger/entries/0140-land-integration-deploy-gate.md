# 0140 Land `integration` into `main`: the ported-HTML-assignment subsystem goes live

- Issued: 2026-09-10
- By: a landing session, carrying no source change of its own. `integration`
  had accumulated seven finished ledgers since `main`'s last landing (ledger
  0133's cycle, `a3e6576e`) -- the HTML-assignment boundary and its `hx`
  sandbox origin, the manifest contract and its spec mirror, the authoring
  template, the write gate that is migration `0197`, and 0139's wiring, which
  is what finally made a subsystem six lanes had already finished reachable
  from a route.
- Owns: the merge of `integration` into `main`, the reconciling merge of `main`
  into `integration`, `docs/prompt-ledger/entries/0140-*`, and its own
  `docs/history/` entry. NO SOURCE FILE. None was needed, and none was written.
- Migration permitted: `0193`, `0194`, `0195`, `0196`, `0197`. All five are
  hand-applied to production and reported verified; I verified none of the
  values myself (see Notes). Only `0197` was new on `integration` relative to
  `main` at this bundle's branch point, confirmed by
  `git diff --name-status origin/main origin/integration -- supabase/migrations/`,
  which returned exactly one line:
  `A supabase/migrations/0197_classroom_html_assignment_write_gate.sql`.
- Lands on: `main`, at `ad31fdafe4befde98e2405cf44f06a9a324640ca`. **The deploy
  was NOT read back from production** -- see the egress finding in Notes, which
  is the one thing about this bundle a later reader must not skim past.
- Status: pushed
- Branch: `claude/ledger-0140-deploy-gate-dc8awr`, branched from
  `origin/integration` at `8564be38`.
- Notes:

  **DUPLICATE CHECK, CLEAN, BOTH HALVES.** No
  `docs/prompt-ledger/entries/0140-*` existed on any ref before this bundle
  wrote one: `git log --all` over that path glob returned nothing, and
  `git ls-tree` on both `origin/main` and `origin/integration` showed the
  entries directory topping out at `0139-html-assignment-wiring.md` (132
  entries). All 42 standing remote `claude/**` branches were then swept
  individually with `git ls-tree -r --name-only <branch> docs/prompt-ledger/
  entries/` for a `/0140-` path; zero hits. So nothing was carrying a 0140
  ledger commit and nothing else.

  **THE THREE OPENING CHECKS, REPORTED AS ASKED.** `git fetch --unshallow
  origin` succeeded (`git rev-parse --is-shallow-repository` -> `false`, 2010
  commits reachable from HEAD; the clone had arrived shallow, which is the
  normal cloud-session state and is what would otherwise have made
  `site-versions` emit no version). `git fetch origin integration` succeeded.
  `git config user.name` -> `Claude`, `user.email` ->
  `noreply@anthropic.com`.

  **CI DISPATCHED ON THE FULL FORTY-CHARACTER SHA, AND THE AGGREGATOR'S OWN
  FOUR OUTCOMES WERE READ RATHER THAN THE ROLLED-UP CONCLUSION.** `ci.yml` was
  dispatched via `workflow_dispatch` with `inputs.ref` set to
  `8564be382f334782013342ec61e0db5bda32b786`, `integration`'s tip at the time
  and unchanged through the merge. Run **34529196552** ran 20:55:12 to
  21:00:53 UTC -- **5m41s**, with the `Test suite` step alone taking 20:56:11
  to 21:00:48 (4m37s). That duration is itself the discriminator the prompt
  asked for: a run under a minute is `actions/checkout` failing on a short sha
  with the later `if: always()` steps reporting success against an empty
  workspace, and this is nothing like it. `ci.yml` sets
  `continue-on-error: true` on all four checks, so the rolled-up conclusion is
  not the signal; the "Fail the job if any step failed" step's own echoed
  lines were read from the job log instead:

  > ref tested:         8564be382f334782013342ec61e0db5bda32b786 (HEAD)
  > check:              success
  > test:               success
  > vanguard-changelog: success
  > history-verify:     success

  The `ref tested:` line is what confirms the checkout resolved the full sha
  rather than silently testing something else.

  **NO RECONCILING MERGE OF `main` INTO `integration` WAS NEEDED.**
  `git merge-base --is-ancestor origin/main origin/integration` answered yes at
  the branch point (`origin/main` `9450aadd`, `origin/integration`
  `8564be38`) and again on a re-fetch immediately before the merge, both refs
  unmoved. So step 1 of the loop was a no-op on the first pass, correctly and
  not by being skipped.

  **ALL SEVEN LEDGER ENTRIES NEW ON `integration` READ `pushed`**, read out of
  `origin/integration` itself rather than from a working copy: 0126
  (html-assignment-boundary), 0133 (land-four-branches), 0134
  (html-assignment-integration), 0136 (spec-mirror), 0137 (template), 0138
  (write-gate), 0139 (wiring). `git merge-tree --write-tree --messages
  origin/main origin/integration` exited 0 and emitted a single tree oid
  (`f790a1e7`) with zero conflict messages, so the merge was known clean
  before it was attempted. It then merged clean in fact, with no conflict
  anywhere -- `classroom-updates.json` (which is AT THE REPO ROOT, not under
  `static/`) included, so its keep-both-textually rule was not exercised.
  Pushed non-force, `9450aadd..ad31fdaf`.

  **GATE 4 SUBSTITUTION, NAMED, AND THE PROBE REPORTED VERBATIM.**
  `node tools/deploy-probe.mjs` cannot pass here -- `DEPLOY_PROBE_URL` is
  unset -- and its exit 1 is not treated as a stop, per ledger 0115's
  substitution:

  > deploy-probe: DEPLOY_PROBE_URL is not set, so production's applied set
  > cannot be read. This is "cannot confirm", never "applied".
  > (exit 1)

  Gate 4 rests instead on `0193` through `0197` being hand-applied to
  production and reported verified, with `0197`'s verification given as:
  `save_arities` 1, `file_arities` 2, `wide_defaults` 0, `helpers_present` 2,
  both `reads_manifest` 1, `anon_can_save` false, `authed_can_save` true,
  `authed_can_attach` true, `anon_can_resolve` false, and 0 for
  `version_row_disagreements`, `items_carrying_both`, `ported_answers_stored`
  and `selfcheck_leftover`. **I VERIFIED NONE OF THOSE VALUES MYSELF.** No
  session in this container can reach the production database, and the local
  `.env` points at a placeholder project. The `file_arities` 2 with
  `wide_defaults` 0 is the signature-trap pair from `CLAUDE.md` -- both
  arities standing, no defaults on the wide one -- which is the shape that
  makes a deployed client and a hand-applied migration independent of each
  other's ordering, and is why this deploy was safe to make in either order.

  **STEP 5 COULD NOT BE PERFORMED, AND THIS IS THE FINDING WORTH CARRYING
  FORWARD.** The prompt required confirming the deploy by READING production
  and never from push output. **This session cannot reach `ideabosco.com` at
  all.** Both available paths were tried and both were refused by the
  organization's egress proxy, not by the site:

  > curl: (56) CONNECT tunnel failed, response 403

  and, through the fetch tool, `EGRESS_BLOCKED` / "Access to ideabosco.com is
  blocked by the network egress proxy." The proxy's own status endpoint names
  the host and the reason under `recentRelayFailures`: `connect_rejected`,
  "gateway answered 403 to CONNECT (policy denial or upstream failure)",
  `ideabosco.com:443`. `/root/.ccr/README.md` is explicit that a 403 here is
  an organization policy denial and that the correct response is to **report
  the blocked host rather than retry or route around it** -- so no attempt was
  made to read the same bytes off `idea-app-sage.vercel.app`, which would have
  been routing around the denial for identical content.

  What was obtained instead, and it is deliberately NOT presented as a
  substitute: Vercel's own commit status for
  `ad31fdafe4befde98e2405cf44f06a9a324640ca`, polled from `pending`
  ("Vercel is deploying your app", 21:02:21Z) to terminal, settling at
  **`state: success`, "Deployment has completed", 21:03:21Z**. That is a
  report from the builder, not a read of the served page, and it cannot
  distinguish a deploy that completed from a page that renders the expected
  stamp. **The footer stamp was never read and no sha was ever matched against
  it**, so this bundle's Gate 5 is unmet on its own terms. A session with
  egress to `ideabosco.com` should fetch
  `https://ideabosco.com/assignments/IDEA-Blade_Rulebook_v2_2` and confirm the
  stamp names `ad31fda`; until somebody does, "live" here means "Vercel says
  it built and deployed", which is a weaker claim than every prior landing
  ledger in this directory makes.

  **CONFLICT POLICY.** No conflict arose in either direction, so nothing had
  to be resolved. Had one, it would have been resolved on `integration` and
  never on `main`.

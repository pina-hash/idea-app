---
title: "Prompt 0182: the standing notebook overhaul branch is dead weight, verified rather than believed -- 0122's harvest checked item by item against the tree, and the loser archived under a ref a cloud session is actually allowed to write (`claude/affectionate-newton-xkuftf`, no migration)"
date: 2026-09-12
branches: [claude/affectionate-newton-xkuftf]
migrations: []
subsystems: ["Digital notebook", "Site themes", "Browser harness", "Repo workflow"]
---

`claude/notebook-ui-theme-overhaul-0gnx0f` had stood since 2026-09-09 and
`merge-tree` refused it against `integration` across ten files. Ledger 0122
said it had been harvested by content; ledger 0163 said the harvest checked out
and the branch should be archived. **Neither report was taken at its word.**
This bundle diffed the branch against `integration` as it stands TODAY -- after
ledger 0180 landed work in `src/lib/notebook/**` -- and then decided.

The answer is that everything of value is already on `integration`, so the
branch is archived and not merged.

## What the verification actually was

0122 claims four things were brought across. Each was checked on
`origin/integration` at `b0a8101d`, not on the tree 0122 was written against:

1. **The application frame keyed on a prop.** `NotebookView.svelte:502`,
   `const framed = $derived(ownsPage ?? masthead)`, with `class:cr-app={framed}`
   on `.nb-root` and `class:cr-app-body={framed}` on `.nb-shell`, and the split
   at `scroll="fill"`. Present, and STRICTLY BETTER than the branch's, which
   keyed on `masthead` alone -- a hole 0122 measured and named
   (`/notebook/review/student/<email>` keeps the masthead and is still not the
   whole page, so the branch's key gave it a 900px viewport frame starting
   127px past the fold inside a 1463px document).
2. **A pinned pane head over a scrolling body.** `.list-head` / `.list-body`
   present at lines 2444 / 2566 with their rules at 3526 / 3530.
3. **The compose actions pinned to the pane's foot.** `position: sticky` at
   3617, with the explanatory sentences moved above it and the reason written
   beside them at 3112.
4. **The plate picker reading `<html data-theme>`.** `watchSiteThemeOnDocument`
   in `notebook-theme.svelte.ts:158`, a `MutationObserver` with
   `attributeFilter: ['data-theme']`.

## What was left behind was left behind correctly

- **The one-line bar** (`.nb-bar`, `.bar-title`, `.bar-facts`, `.bar-note`,
  `nb-fact-entries`, `nb-fact-drafts`, `nb-fact-owed`). Integration carries a
  HEAD instead (`nb-head`, `nb-status`, `nb-privacy`) whose two chips are
  actionable and more specific than the bar's counts: `nb-next-check-in` NAMES
  the nearest outstanding session and picks it in the composer, where the
  branch's `nb-fact-owed` says "3 check-ins to file" and opens the form on
  whatever the default is; `nb-drafts-chip` applies the Drafts filter. Taking
  the bar takes both. 0122's judgement stands.
- **`.list-title`** (the result count moved up beside the "Entries" heading).
  Integration keeps `result-count` in `.tools`, which is in the head either
  way, so the move buys nothing and churns a harness row.
- **`notebookPlateShowing`**. Absent from `integration`, correctly: it made the
  trigger read "Matrix" while the menu ticked "Default", a control
  contradicting itself. Integration's `notebookPickerName` puts the painted
  plate in the ACCESSIBLE NAME only, and only when the two differ.
- **`notebook-plate-follow.mjs`**. Integration's `notebook-site-matrix.mjs`
  covers the same state and more: it reaches it through the dev page's own
  `?site=matrix` rather than hand-writing the attribute, and it asserts the
  accessible name, the absent `data-nb-theme`, and the absent rain canvas.

## Three differences 0122 did not name, and why none of them is a reason to merge

This is the part a reader should have, because "0122 named two exclusions" is
not the same as "there are two". A class-by-class and testid-by-testid diff of
`NotebookView.svelte` found three more, and each is redundant rather than
missing:

- **`.meta-fields`**, a grid putting Title and Folder on one line above the
  breakpoint. A density preference with no measurement behind it on the landed
  base, where the compose form now scrolls in its own pane with the actions
  pinned to its foot -- which is the condition that made the two-column
  arrangement worth having in the first place, and it is already met another
  way.
- **`.compose-title`**, the compose card's `<h2>` echoing
  `pickedSession.session_label` with "New entry" demoted to an eyebrow.
  Integration renders `<h2>New entry</h2>` and answers the same question
  better one element down: the `.quick-picks` fieldset shows every open
  check-in with the chosen one `aria-pressed`, plus a "Draft in progress"
  marker the heading could not carry.
- **`.nb-list` / `.tool-btns`**, wrapper class renames over markup
  `integration` already has under `.card.nb-pane-card` and `.tool-btn`, on the
  same `data-testid="nb-entries"`.

One thing the branch found that is worth recording as NOT lost: `.label-field`,
the override that stops the shared row-flex `.field` class laying a stacked
label, input and hint out side by side and forcing the document 10.5px past
375px. It is on `integration` with the branch's own comment, so both lanes
found it and the fix landed.

`tests/notebook-theme.test.ts` on `integration` carries 43 assertions against
the branch's 12, and every branch assertion has a counterpart.

## The archive, and the one place this deviates from what was asked

The prompt asked for a TAG, `archive/notebook-theme-0gnx0f`, so the objects
survive collection once the branch is deleted. **A tag could not be pushed.**
`git push origin refs/tags/archive/notebook-theme-0gnx0f` answers
`RPC failed; HTTP 403` and then `Everything up-to-date` -- the same shape the
prompt warns about for branch deletion, where git reports success over a failed
RPC. Three attempts with backoff, `git ls-remote --tags origin` empty after
each. The proxy's own `recentRelayFailures` records no github.com entry, so the
refusal is the git host's ref-write policy for this container and not the
egress proxy.

So the ref is a BRANCH, created through the GitHub API:
`refs/heads/archive/notebook-theme-0gnx0f` at `30adfd77`, which is the branch
tip exactly. **Verified with `git ls-remote`, never with git's own output.**
It does the one job a tag was wanted for -- an object is collected when no ref
reaches it, and this one reaches it -- and it is inert to the sweeper:
`integrate.yml`'s `AGENT_BRANCH_PREFIXES` is `'claude/ codex/'`, so an
`archive/` ref is never merged, never deleted, and never counted.
`tools/idea-status.py` reads the same two prefixes.

**`claude/notebook-ui-theme-overhaul-0gnx0f` itself still stands**, because a
cloud session cannot delete a remote branch. Deleting it is Mr. Pina's.

## The prompt's premise about the red Integrate runs was one branch out of date

The prompt says the branch is "the sole reason EVERY Integrate run goes red".
It was, and today it is not. Every `claude/**` and `codex/**` ref was put to
`git merge-tree` against `origin/integration`:

| | |
|---|---|
| contained in `integration` already | 48 |
| conflicts | **2** -- `notebook-ui-theme-overhaul-0gnx0f`, and `busy-newton-trto6y` |
| clean, not yet swept | 1 -- `great-bell-ppysbn` |

`claude/busy-newton-trto6y` is ledger 0177 (Foundry), pushed at 15:53 today,
conflicting on `CLAUDE.md`, `classroom-updates.json` and two decision entries.
It is a live lane's surface and is not this bundle's to touch, but archiving
0gnx0f will NOT turn Integrate green on its own, and a reader expecting that
should know why.

## Verified

- **The branch conflicts, and it is ten files.**
  `git merge-tree --write-tree --name-only origin/integration <branch>` names
  exactly the ten the prompt does.
- **`node tools/claude-md-check.mjs`**: CLAUDE.md agrees with the tree.
- **`npm run history:verify`** and the ledger/workflow test files, green.
- **The full suite**, and **`svelte-check` re-derived from its own summary
  line** with a placeholder `.env` exported before `svelte-kit sync` -- figures
  in the final report rather than here, because this bundle changed no file
  under `src/` and both are baselines rather than deltas.

## NOT verified

- **Production was not read, and could not be.** `https://ideabosco.com/`
  answers `curl: (56) CONNECT tunnel failed, response 403` from this container;
  the proxy's status endpoint records the denial by host. So no claim is made
  here about what is deployed.
- **`node tools/deploy-probe.mjs --ref origin/integration` cannot pass**:
  `DEPLOY_PROBE_URL` is unset and the probe fails closed. Ledger 0114's gate 4
  substitution is what this bundle relies on, and it applies only because the
  `origin/main...origin/integration` migration range is EMPTY -- checked, not
  assumed.
- **No browser pass.** Nothing under `src/`, `tools/browser-verify/routes/` or
  `static/` was touched, so there is nothing this bundle could have moved on a
  rendered page. The measured region of `tools/browser-verify/README.md` is
  untouched and still describes commit `7ad0cb3`.
- **The archived branch's own work was never RUN**, in a browser or otherwise.
  It was read: its diff, its 311-line history entry, its class list, its
  testids and its test names, each against `integration`'s counterpart. A
  measured comparison of the two surfaces side by side would have needed both
  checked out and driven, which is the work of rebuilding the fork rather than
  of closing it.

## Left undone, by name

- **Deleting `claude/notebook-ui-theme-overhaul-0gnx0f`.** Mr. Pina's, and the
  archive ref above is what makes it safe.
- **`claude/busy-newton-trto6y`'s conflict.** Ledger 0177's surface.
- **The branch's own `docs/history/notebook-ui-theme-overhaul-0gnx0f.md`** is
  not landed on any ref and deliberately so: a history entry describes a
  shipped bundle, and landing 311 lines about a surface that is not in the tree
  would read as authoritative about the notebook and describe something nobody
  can find. It survives in the archive ref, which is where a record of
  unshipped work belongs.
- **`classroom-updates.json`** takes no entry: nothing here changes what a
  class sees.

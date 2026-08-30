/**
 * The short-link manager, in the room it actually ships in: none.
 *
 * `ShortLinkManager` is mounted by exactly one route, `/admin/links`, which is
 * the portal shell -- no scoped stylesheet, `--dim`/`--white`/`--line` resolving
 * to their `:root` values. Its only harness mount until this bundle was a tab on
 * `/dev/classroom-reference`, which wraps its whole page in `.cr-root`, so every
 * reading ever taken of this component was taken against the classroom's calm
 * surfaces instead of the portal plate. The tab is gone and `/dev/short-links`
 * is the mount; see either file's header.
 *
 * `ready` IS LEFT AT ITS DEFAULT, deliberately. `/admin/links` passes
 * `data.ready`, which is false when the RPCs are missing (the select ladder's
 * bottom rung) and renders a not-configured card instead of the manager. The
 * harness measures the CONFIGURED surface, which is the one with controls on it;
 * the refusal card has no room question to answer.
 */
export default {
	path: '/dev/short-links',
	label: 'Short-link manager (portal shell, no room)',
	presence: [
		/* The room question, asserted in the direction that has no wrapper to
		   point at: this component must NOT find itself inside a scoped theme.
		   `expectPresent: 0` alone would be a floor and therefore vacuous, so
		   the ceiling is stated too -- CLAUDE.md requires both directions, and
		   the positive control is the row beneath it. */
		{ selector: '.cr-root, .nb-root, .gt-root, .cd-root, .fg-root, .frc-root, .tnm-root, .fsp-root', label: 'no scoped room around it', expectPresent: 0, expectVisible: 0, maxVisible: 0 },
		{ selector: 'main.admin-page', label: "the /admin/links measure", expectPresent: 1 },
		{ selector: 'main.admin-page .form', label: 'the link composer', expectPresent: 1 },
		{ selector: 'main.admin-page .form input[type="text"]', label: 'composer fields', expectPresent: 3, maxPresent: 3 },
		{ selector: 'main.admin-page table tbody tr', label: 'one row per link', expectPresent: 2, maxPresent: 2 }
	],
	contrast: [
		{ selector: 'main.admin-page h1', label: 'page heading', min: 4.5 },
		{ selector: 'main.admin-page .lede', label: 'lede copy on the portal plate', min: 4.5 },
		{ selector: 'main.admin-page table tbody td', label: 'link table cells', min: 4.5 }
	],
	tapTargets: [
		{ selector: 'main.admin-page .form input[type="text"]', label: 'composer fields', min: 44 },
		{ selector: 'main.admin-page .form button.btn', label: 'composer save control', min: 44 },
		/* THE 24px FLOOR, NOT THE 44px ONE, AND IT IS THE DOCUMENTED EXCEPTION
		   RATHER THAN A LOOSENED THRESHOLD.
		   `IDEA_INTERFACE_STANDARDS` 10 asks 44px of anything a phone touches
		   and of every student-facing surface, with 24px as the absolute floor
		   everywhere else. These are the row-ops chips -- Edit, Delete, Cancel
		   beside a link, in a table, on an admin-only route no student can
		   reach -- and `ShortLinkManager`'s own stylesheet says so in a comment
		   beside the `min-height: 24px` that puts them there, along with the
		   reason this component needs its own floor at all: it is the one
		   `.btn.tiny` call site OUTSIDE `.cr-root`, so the classroom's floor
		   never reaches it.
		   That comment also ends "The dev harness mounts it INSIDE `.cr-root`,
		   which is why the divergence is invisible there" -- the room mismatch
		   this spec's bundle closed, written down by whoever hit it and left
		   standing. The check still reports every box and still counts anything
		   under the 24px floor separately, so nothing is hidden by choosing the
		   right number. */
		{ selector: 'main.admin-page table button', label: 'row-ops chips (24px floor)', min: 24 }
	]
};

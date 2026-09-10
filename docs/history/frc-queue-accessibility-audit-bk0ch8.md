---
title: "Prompt 0124: the FRC review queue's controls onto the 44px floor, an admin mark that is not the orphan it was reported as, and a coin-desk link that names its destination (`claude/frc-queue-accessibility-audit-bk0ch8`, no migration)"
date: 2026-09-10
branches: [claude/frc-queue-accessibility-audit-bk0ch8]
migrations: []
subsystems: ["FRC Training", "Admin console", "Coin desk", "Browser harness"]
---

Three items handed on from ledger 0117's final report: one real accessibility
violation, one deletion that turned out not to be available, and one piece of
tidying. No migration, `Claims: none`.

## The opening

`git fetch --unshallow origin` (the clone WAS shallow: `is-shallow-repository`
answered true before and false after, 1926 commits), `git fetch origin
integration`, identity `Claude <noreply@anthropic.com>` already set, nothing to
add. Branched from `origin/integration` at `21b0801d` and not from
`origin/main` at `131aeec2`, because two of the three items exist only there --
`131aeec2` was a forced update over the local `origin/main`, and the
integration tip carried 0117's console merge that items TWO and THREE are
consequences of.

**The duplicate check found nothing**, which is the answer that permits the
work rather than the one that proves it safe: no `0124-*` entry on
`origin/main`, none on `origin/integration`, and none on any of the 40-odd
standing `claude/**` branches, swept with `git ls-tree` per ref rather than by
reading the mounted directory.

## ONE. The only real violation, and it was the twin of one already fixed

The prompt's numbers reproduce exactly. Measured on the PRE-FIX component at
both widths:

| Surface | Control | Before | Floor |
| --- | --- | --- | --- |
| `/dev/portal-admin` @375 and @1440 | `.frq` links | **18.4px** | 44 |
| `/dev/portal-admin` @375 and @1440 | `.frq` buttons | **26.2px** | 44 |
| `/dev/frc?state=review-console` @375 and @1440 | `.frq-link` | **17.8px** | 44 |
| `/dev/frc?state=review-console` @375 and @1440 | `.frq-btn` | **26.2px** | 44 |

The dashboard row reported `6/6 under 44px, 2 under the 24px floor`: the two
under 24 are the links, and the four buttons clear 24 while failing 44. The
review console measures its link at 17.8 rather than 18.4 -- same rule, a
different room's inherited line box -- which is worth writing down only because
a single number quoted for "the link" would have been wrong on one of the two
surfaces.

**The floor is 44px because neither surface declares otherwise, and that is a
property read off the element rather than argued.** `IDEA_INTERFACE_STANDARDS`
10 permits 24px only where a surface is instructor-only AND says so in a named
class on its own root. The dashboard's root is `legacy-index admin-console` and
`FrcReviewConsole`'s is the light FRC room; neither is such a declaration, and
the same conclusion about the same dashboard is already written into
`DecalReviewQueue.svelte`'s own comment by the session that owned it. The
review-tier surface is the stronger case of the two anyway: `/frc/review` is
gated on `frc_can_review()` and not on `is_admin()`, so "instructor console" is
a claim about a wider set of people than admin.

**`DecalReviewQueue` is this component's mirror and took the identical fix
first.** Its header says it was written "mirroring FrcReviewQueue exactly", and
its `.gdq-btn` already carried `min-height: 44px` with the reasoning beside it;
`.frq-btn` did not. So this is not a new decision, it is the twin catching up,
and the comment says so rather than restating the argument a second time.

**Step 1 of section 10's resolution order is the whole fix and no later step
was reached.** Re-lay the controls in the space already there: `.frq-actions`
and `.frq-body` both already carry `flex-wrap: wrap`, so growing the controls
costs row height and nothing else. Measured after, at both widths:
`/dev/portal-admin` `74.6x44, 0/6 under 44px`; `/dev/frc?state=review-console`
buttons `133.3x44, 0/4 under`, links `74.6x44, 0/2 under`; horizontal scroll
`0px overflow (scrollWidth 375 vs clientWidth 375)`. No control was moved
behind an affordance (step 2), no container was widened (step 3), and no
exception was recorded (step 4), because none was needed.

**So this ends as a fix**, which is the first of the three endings section 10
allows. It is worth being explicit that the other two were live options: the
rule that "wrote the number in the report" is not a way to finish is what makes
a finding like this one somebody's, and 0117 discharged it correctly by handing
it on with an owner rather than leaving it standing.

**`min-height`, never `height`, on both.** The floor can then only round up;
the plate switch that could not is the case CLAUDE.md already carries.

**The link is a control, not prose.** Section 10 exempts an inline target
inside a sentence because a 44px reach there steals taps from the lines above
and below. "Open model" sits in `.frq-body` beside a timestamp with nothing
within 44px vertically, so the exemption does not reach it and expanding it
costs no neighbouring tap. The row keeps `align-items: baseline`, so the time
beside the link still sits on the link's own text baseline.

**The route spec was half the violation.** `frc-state-review-console.mjs` read
`min: 24` for these buttons -- a SPEC asserting the instructor-density floor
about a surface that never declared it, which is the exact shape section 10
names ("a property a surface declares, not one a bundle asserts about it"). At
26.2px the buttons passed that row. Raised to 44 and the link added beside it,
so the spec now measures what the standard actually requires of this surface.
`portal-admin.mjs` had it right already: it measured `.frq button, .frq a` at
44 and REPORTED the failure without widening, which is why the finding reached
0117's report at all.

**Proven by reverting, not by assertion.** The component was copied to a
scratch file, the pre-fix body written over it from `origin/integration`, and
the harness re-run: the 18.4/26.2 findings came back, `2 outside threshold` on
the dashboard and `4` on the review console. Restored FROM THE COPY -- never
`git checkout --`, which restores from HEAD and discards uncommitted work --
verified `md5 34b0d077818759a573db7ae06197a7a9` identical, and re-measured
green. A check that has never failed has not been tested.

## TWO. `AdminMark.svelte` is imported, so it stays

The prompt's premise is ledger 0117's, and the tree disagrees with it. 0117
wrote that the mark "is now drawn by nothing", which is true of PRODUCTION --
the launcher's Site Admins card merged into the dashboard card and nothing in
`src/lib` or `src/routes` names the component. It is not true of the tree.

**`src/routes/dev/marks/+page.svelte` imports it, eagerly, and mounts it.** The
glob is `import.meta.glob('../../../lib/marks/*Mark.svelte', { eager: true })`,
and every module it returns becomes a cell in the marks grid with a caption
derived from its filename. **And `tools/browser-verify/routes/marks.mjs` sweeps
it**: that spec `readdirSync`s the same directory and derives one `motion` row
per mark, so `AdminMark` currently carries a reduced-motion assertion of its
own.

Both of those are deliberate and recent. `mark-roster.js` exists precisely
because the page and the spec used to carry hand-written lists of eleven marks
while `$lib/marks` held twelve, so `MapsMark` was mounted by nothing and swept
by nothing while the spec stayed green. The roster is read off disk on both
sides now. Deleting `AdminMark` would remove a cell from that harness and a
motion row from that sweep -- quietly, since every count on both sides is
derived and nothing would redden.

The instruction was to delete it if and only if nothing imports it. Something
does, twice, so **it is left exactly where it is** and this entry names the two
importers. Whether a mark with no production card should keep a harness cell is
a real question and not this bundle's: it belongs to whoever owns
`/dev/marks`, and answering it from here would be the same shape as a spec
asserting a floor about somebody else's surface.

## THREE. The coin desk names where it is going

`/coin-desk`'s header linked "Site Admins" to `/admin`. That route has no
`+page.svelte` any more: its load 404s a non-admin and `redirect(303,
'/dashboard#panel-admins')`s everyone else. So the link worked, via a round
trip nobody can see, and its label promised a page that no longer exists --
sitting one control away from a "Dashboard" link to the same page's top.

The href now names the destination directly and the label is "Site admins",
which is that panel's own `title` in `src/routes/dashboard/console.ts`. Nothing
in the tree pinned either the old label or the old href.

**`/admin` itself is untouched.** It still forwards, and it should: printed
links, bookmarks and other surfaces' headers predate the merge, and this change
removes one caller rather than the reason the forward exists.

## What was measured, and what was not

- **`svelte-check` 0 errors / 37 warnings, 31 `state_referenced_locally` / 5
  `css_unused_selector` / 1 `perf_avoid_nested_class`.** The stated baseline,
  held exactly. Re-derived rather than trusted: `svelte-kit sync` first, with
  `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` exported before it, or
  the missing-`.env` phantom errors land instead.
- **The full suite**, run once at the end.
- **The browser harness at 375 and 1440** on `/dev/portal-admin` (three specs),
  `/dev/frc?state=review-console` and the three `/dev/coin-desk` specs, plus a
  full run to regenerate the README's measured region -- which named these two
  findings by route and width and would otherwise have gone on naming findings
  that no longer exist.
- **NOT verified in a browser: the coin-desk header link itself.**
  `/dev/coin-desk` mounts the desk's area components, not the route group's
  `+layout.svelte`, so the harness never renders that header and no dev route
  does. The change is an href and a label; the destination is proven by
  `/admin/+page.server.ts`'s own redirect target rather than by driving it.
- **NOT verified: anything signed in, and anything against the live Supabase
  project.** The local `.env` written for this session points at the
  placeholder project and was created, not modified -- the checkout arrived
  with none, as every cloud session does.
- **The harness blocks non-loopback requests**, so `fonts.googleapis.com` does
  not resolve and every figure above is measured in the FALLBACK font stack;
  and it runs at `prefers-reduced-motion: no-preference`, so that path is not
  exercised here.

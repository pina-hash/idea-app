/**
 * What the harness drives, and what it measures on each surface.
 *
 * ONLY routes under /dev are listed, and that is a hard BOUNDARY rather than a
 * starting set -- see README.md. A dev route mounts the real component with
 * fixture data and needs no account and no Supabase; a real route needs a Bosco
 * Tech Google session that no automated run holds.
 *
 * Each entry:
 *   path        the dev route
 *   label       what the surface is
 *   prepare     [{ click }|{ waitFor }|{ evaluate }, waitMs?] -- reach the state
 *               to measure. `waitFor` is a page-side predicate SOURCE waited on
 *               until it holds, for a state reached by an async payload landing
 *               rather than by a press; the wait is reported in ms and a
 *               predicate that never holds prints FAILED
 *   settleMs    how long to let entrance animations finish before measuring
 *   contrast    [{ selector, label, min }]   4.5 for copy, 3 for a boundary
 *   tapTargets  [{ selector, label, min }]
 *   presence    [{ selector, label, expectPresent, expectVisible }]
 *   statePairs  [{ activeSelector, inactiveSelector, label }]  asserts a
 *               pressed/active control actually renders differently from
 *               its unpressed siblings, not merely that both individually
 *               clear a contrast minimum
 *   datalistOrder  [{ inputSelector, evaluateExpected, label }]  an input's
 *               `list` attribute resolves to a real datalist, options in the
 *               order a page-side probe function produces -- `evaluateExpected`
 *               calls that probe rather than a list retyped here
 *   ignoreConsole  regex sources for errors that belong to the FIXTURE
 *
 * Selectors are ANCHORED (a component root, then the element) rather than bare
 * tag names. A bare `svg` on /dev/animated-logo matched the site-feedback glyph
 * mounted by the root layout and reported it as a failure; the emblem there is
 * not an svg at all.
 */
export const WIDTHS = [375, 1440];

/**
 * SETTLE THE ENTRANCE CHROME, the way the components' own cleanup does.
 *
 * `.legacy-index .course-card` is `opacity: 0` in `src/app.css` until an
 * IntersectionObserver adds `.visible`; `AppLauncher` stamps `opacity: 0`
 * INLINE on every `.app-card` at mount and clears it from its own IO callback.
 * The harness never scrolls, so a card below the fold at a given viewport
 * genuinely never intersects and stays at opacity 0 -- real entrance chrome,
 * not a fixture gap.
 *
 * WHY THIS EXISTS AT ALL, AND IT IS NOT A CONVENIENCE. `opacity` is NOT
 * inherited, so a ROW INSIDE an opacity-0 card computes opacity 1. Until the
 * ancestor walk went into `isVisible` (see checks.mjs), every `.assignment-item`
 * assertion on these two routes reported "visible" about an element painted
 * nowhere -- so four presence rows and three tap-target rows were passing
 * VACUOUSLY, and the 44px figure the pass printed for a feed row was the
 * geometry of something no reader could see. Asserting `expectVisible: 0` on
 * the rows to match would have written the vacuum down as if it were the
 * intended reading.
 *
 * So the entrance is SETTLED instead, which CLAUDE.md's own prescription for
 * this case is: put the component into the state its cleanup produces -- which
 * is byte-identically what the reduced-motion path renders from the first frame
 * -- and SAY HOW MANY were settled, which the returned count does (the prepare
 * line prints it). Settling nothing would be a silent no-op the day a class
 * name changes; a count of 0 in the report is visible.
 */
export const SETTLE_ENTRANCE = `() => {
	/* A STYLE RULE, NOT A MUTATION OF THE ELEMENTS, and that is the second
	   attempt rather than the first. Adding \`.visible\` and clearing the inline
	   opacity settled /dev/home-order's student variant and left the teacher
	   variant and /dev/home-feed at opacity 0 -- because \`AppLauncher\`'s own
	   onMount re-stamps \`style.opacity = '0'\` on every card, and whether it has
	   run yet by the time a prepare step fires is a race that resolves
	   differently per route. A rule cannot be re-stamped over. */
	const css = '.legacy-index .course-card, .course-card { opacity: 1 !important; transform: none !important; }'
		+ '.app-card { opacity: 1 !important; transform: none !important; }';
	const tag = document.createElement('style');
	tag.setAttribute('data-bv-settle', '1');
	tag.textContent = css;
	document.head.appendChild(tag);
	const cards = document.querySelectorAll('.legacy-index .course-card, .course-card');
	const apps = document.querySelectorAll('.app-card');
	return 'settled entrance on ' + cards.length + ' course-card(s) and ' + apps.length + ' app-card(s)';
}`;

export const ROUTES = [
	{
		path: '/dev/pathways',
		label: 'Pathway identity harness',
		/* The page mounts the REAL first-login picker, whose overlay covers the
		   surface underneath. "Not now" dismisses it, which is what a student
		   does, and is the state the chips below are meant to be read in. */
		prepare: [
			{
				click: 'button.pwp-later',
				until: '() => !document.querySelector(".pwp-overlay")'
			}
		],
		presence: [
			{ selector: '.harness h1', label: 'page heading', expectPresent: 1 },
			{ selector: 'span.pathway-chip', label: 'pathway chips', expectPresent: 6 },
			{ selector: '.chip-grid .chip-cell', label: 'one cell per pathway', expectPresent: 6 },
			{ selector: '.pwp-overlay', label: 'picker overlay (dismissed)', expectPresent: 0, expectVisible: 0 }
		],
		contrast: [
			{ selector: '.harness h1', label: 'h1 on its plate', min: 4.5 },
			{ selector: '.harness p.note', label: 'note copy', min: 4.5 },
			{ selector: 'span.pathway-chip .pw-label', label: 'chip label on its fill', min: 4.5 }
		],
		tapTargets: [{ selector: '.harness .controls button', label: 'harness controls', min: 44 }]
	},
	{
		path: '/dev/spec-table',
		label: 'Spec table harness',
		presence: [
			{ selector: 'h1', label: 'page heading', expectPresent: 1 },
			/* A closed Disclosure keeps its region in the DOM at a zero box on
			   purpose (CLAUDE.md: hidden in CSS, never removed), so present > 0
			   with visible 0 is the CORRECT reading of a closed panel. */
			{ selector: 'table.entry-table', label: 'spec tables (closed disclosures)', expectPresent: 1, expectVisible: 0 }
		],
		contrast: [{ selector: 'h1', label: 'h1 on its plate', min: 4.5 }],
		tapTargets: [{ selector: 'button', label: 'buttons', min: 44 }]
	},
	{
		path: '/dev/spec-table-open',
		label: 'Spec table harness, disclosures opened',
		aliasOf: '/dev/spec-table',
		/* Assert the EFFECT wanted (a table with height), not a proxy for it.
		   The first predicate here read aria-expanded on one named button and
		   reported FAILED through twelve attempts that had in fact opened both
		   regions -- a true reading of the wrong thing. */
		prepare: [
			{
				click: 'button[aria-expanded="false"]',
				until: '() => { const t = document.querySelector("table.entry-table"); return !!t && t.getBoundingClientRect().height > 0; }',
				attempts: 6,
				waitMs: 300
			}
		],
		presence: [{ selector: 'table.entry-table', label: 'spec tables (opened)', expectPresent: 2, expectVisible: 1 }],
		contrast: [{ selector: 'table.entry-table td', label: 'table cell copy', min: 4.5 }],
		tapTargets: []
	},
	{
		path: '/dev/home-order?role=student&classes=1&rows=3',
		label: 'Home page section order, non-managing student (Classes above Apps)',
		/* Mounts the REAL src/routes/+page.svelte (see the route's own +page.ts
		   for why its fixture items are dated off Date.now() rather than a
		   frozen clock). A prior vitest probe asserted `managesAnySection` as a
		   computed boolean and passed while never rendering a single row --
		   every assertion here reads elements actually painted in the DOM. */
		/* `.course-card` and `.app-card` mount at opacity:0 and are handed
		   `.visible` by an IntersectionObserver in this page's own onMount
		   (threshold 0.08) -- real entrance chrome, not a fixture gap. This
		   harness does not scroll, so a card below the fold at a given
		   viewport genuinely never intersects and never fades in.

		   THIS USED TO SAY `present` OVER `visible` WAS CORRECT HERE, AND IT
		   WAS HALF RIGHT. It was correct about the CARDS and it quietly covered
		   for the ROWS, which had no `expectVisible` of their own and were
		   reported visible only because `isVisible` did not walk ancestors for
		   opacity -- the rows compute opacity 1 inside an opacity-0 card. The
		   entrance is settled in `prepare` now (see SETTLE_ENTRANCE), so every
		   row below is measured painted and the card assertions are `visible`
		   rather than an exemption. */
		prepare: [{ evaluate: SETTLE_ENTRANCE, waitMs: 150 }],
		presence: [
			{ selector: '[data-tour="classes"] .course-card.section-card.feed-card', label: 'rendered class card(s)', expectPresent: 1, expectVisible: 1 },
			{ selector: '[data-tour="classes"] .assignment-item.linked', label: 'rendered due-soon rows', expectPresent: 1, expectVisible: 1 },
			{ selector: '.launcher .app-card', label: 'rendered app cards', expectPresent: 1, expectVisible: 1 }
		],
		domOrder: [
			{
				before: '[data-tour="classes"]',
				after: '.launcher',
				label: 'Classes precedes Apps for a viewer who manages nothing'
			}
		],
		contrast: [{ selector: '[data-tour="classes"] .assignment-name', label: 'feed row title', min: 4.5 }],
		tapTargets: [{ selector: '[data-tour="classes"] .assignment-item.linked', label: 'feed rows', min: 44 }]
	},
	{
		path: '/dev/home-order?role=teacher&classes=1&rows=3',
		label: 'Home page section order, managing teacher (Apps above Classes)',
		/* Same entrance settling as the student variant above, and for the same
		   reason: the rows are what the assertions are about, and a row inside
		   an opacity-0 card is painted nowhere. */
		prepare: [{ evaluate: SETTLE_ENTRANCE, waitMs: 150 }],
		presence: [
			{ selector: '[data-tour="classes"] .course-card.section-card.feed-card', label: 'rendered class card(s)', expectPresent: 1, expectVisible: 1 },
			{ selector: '[data-tour="classes"] .assignment-item.linked', label: 'rendered ungraded-work rows', expectPresent: 1, expectVisible: 1 },
			{ selector: '.launcher .app-card', label: 'rendered app cards', expectPresent: 1, expectVisible: 1 }
		],
		domOrder: [
			{
				before: '.launcher',
				after: '[data-tour="classes"]',
				label: 'Apps precedes Classes for a viewer who manages a section'
			}
		],
		contrast: [{ selector: '[data-tour="classes"] .assignment-name', label: 'feed row title', min: 4.5 }],
		tapTargets: [{ selector: '[data-tour="classes"] .assignment-item.linked', label: 'feed rows', min: 44 }]
	},
	{
		path: '/dev/home-feed',
		label: 'Home feed harness, student mode',
		/* Mounts the REAL ClassroomFeed through the REAL buildFeed, against a
		   clock frozen in the fixture (`now={NOW}`), so unlike /dev/home-order
		   this one carries no live-clock trap of its own -- the assertions
		   below still read rendered rows rather than a ranking result, for the
		   same reason: a computed value proves the function ran, not that
		   anything painted. */
		/* This route mounts ClassroomFeed directly rather than the real
		   src/routes/+page.svelte, so the entrance IntersectionObserver that
		   page's own onMount wires up for `.course-card` never runs here --
		   the shared `.legacy-index .course-card` rule still stamps opacity:0
		   at mount and NOTHING EVER ADDS `.visible` on this route at all.

		   Which makes it the sharper case of the two: on /dev/home-order a card
		   above the fold does fade in, so the vacuum was intermittent. Here the
		   cards were at opacity 0 at every width on every run, and the nine
		   `.assignment-item` rows inside them were being measured for contrast
		   and tap geometry the whole time. `SETTLE_ENTRANCE` adds the class this
		   route's own page never gets round to adding. */
		prepare: [{ evaluate: SETTLE_ENTRANCE, waitMs: 150 }],
		presence: [
			{ selector: '.legacy-index .course-card.section-card.feed-card', label: 'rendered section card(s)', expectPresent: 3, expectVisible: 3 },
			{ selector: '.legacy-index .assignment-item.linked', label: 'rendered feed rows', expectPresent: 1, expectVisible: 1 }
		],
		contrast: [{ selector: '.legacy-index .assignment-name', label: 'feed row title', min: 4.5 }],
		tapTargets: [{ selector: '.legacy-index .assignment-item.linked', label: 'feed rows', min: 44 }]
	},
	{
		path: '/dev/home-feed-teacher',
		label: 'Home feed harness, teacher mode (ungraded queue)',
		aliasOf: '/dev/home-feed',
		/* The settle comes AFTER the mode switch, not before: switching modes
		   re-renders the feed, and a class added to the cards that were on
		   screen a moment ago is a class on elements that no longer exist. */
		prepare: [
			{
				click: '[data-mode="teacher"]',
				until: '() => document.querySelector(\'[data-mode="teacher"]\').classList.contains("active")'
			},
			{ evaluate: SETTLE_ENTRANCE, waitMs: 150 }
		],
		presence: [
			{ selector: '.legacy-index .course-card.section-card.feed-card', label: 'rendered section card(s)', expectPresent: 3, expectVisible: 3 },
			{ selector: '.legacy-index .assignment-item.linked', label: 'rendered feed rows (teacher)', expectPresent: 1, expectVisible: 1 }
		],
		contrast: [{ selector: '.legacy-index .assignment-name', label: 'feed row title (teacher)', min: 4.5 }],
		tapTargets: []
	},
	{
		path: '/dev/classroom-split/s-1?manage=1',
		label: 'Class stream, bulk selection bar + drag reorder (teacher)',
		/* Mounts the REAL ClassSplit/ClassView/ClassroomShell against the
		   classroom-split fixture (u-1: i-1, i-crowded [pinned], i-2, i-2b).
		   Checking one row's own checkbox is what a teacher does to reveal the
		   bulk-action bar -- selecting BEFORE measuring is the correct state,
		   the same way /dev/pathways dismisses its overlay before measuring
		   the chips underneath it.

		   The drag itself is dispatched as synthetic DragEvents rather than
		   simulated pointer motion, because the handlers ClassView wires up
		   (`ondragstart`/`ondragover`/`ondrop`) are native DnD, which Chromium
		   answers identically either way -- what the second `evaluate` proves
		   is not that a drag happened, but that the DROP wrote the id array it
		   should, read back from the dev transport's own log
		   (`window.__composeProbe().orders`), never from the fixture's static
		   render order: the fixture never actually reorders on screen, so a
		   DOM read here would pass even if `setOrder` silently dropped the
		   write.

		   `groupItems` (the drop handler's argument) is the WHOLE per-unit
		   list, pinned items first -- unit u-1 renders
		   [i-crowded(pinned), i-1, i-2, i-2b, i-3..i-7] (see
		   classroom-split/fixture.ts: all seven unpinned items share one
		   `created_at`, so the newest-first tiebreak falls through to array
		   order). i-2b is dragged onto i-1's row: `dragReorderedIds` moves it
		   from index 3 to index 1, giving
		   ['i-crowded','i-2b','i-1','i-2','i-3','i-4','i-5','i-6','i-7']. */
		prepare: [
			{ click: '[data-testid="row-select-i-1"]', until: '() => !!document.querySelector(\'[data-testid="bulk-bar"]\')' },
			{
				evaluate: `() => {
					const dt = new DataTransfer();
					const grip = document.querySelector('[data-testid="row-grip-i-2b"]');
					const targetRow = document.querySelector('[data-testid="row-select-i-1"]').closest('li.row-wrap');
					if (!grip || !targetRow) throw new Error('drag fixture rows not found');
					grip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
					targetRow.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
					targetRow.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
				}`,
				waitMs: 300
			}
		],
		presence: [
			{ selector: '[data-testid="bulk-bar"]', label: 'bulk-action bar (one row selected)', expectPresent: 1 }
		],
		tapTargets: [
			{ selector: '[data-testid="bulk-publish"], [data-testid="bulk-delete"], [data-testid="bulk-clear"]', label: 'bulk-bar buttons', min: 44 },
			{ selector: '[data-testid="bulk-unit-select"]', label: 'bulk-bar file-into select', min: 44 }
		],
		orderResult: [
			{
				evaluate: '() => window.__composeProbe().orders.at(-1)',
				expected: ['i-crowded', 'i-2b', 'i-1', 'i-2', 'i-3', 'i-4', 'i-5', 'i-6', 'i-7'],
				label: 'setOrder recorded the id array the drop should have produced'
			}
		]
	},
	{
		path: '/dev/classroom-split/s-1?manage=1&state=compose-assignment-rubric',
		label: 'Class stream composer, assignment kind + staged rubric builder (teacher)',
		aliasOf: '/dev/classroom-split/s-1?manage=1',
		/* THE STAGED RUBRIC BUILDER never ran in a browser before this: the
		   composer defaults to 'post' and `canStageRubric` needs kind ===
		   'assignment' AND mode === 'create' AND a teacherTransports, none of
		   which any prior /dev route reached at once. `New post` opens the
		   composer, then the kind toggle -- plain text, no data-testid on the
		   three buttons -- is selected by its own label. `RubricBuilder`
		   mounted with `itemId={null}` (staging mode) is the state: "Build
		   rubric" / "Generate from spec", nothing saved yet, applied the
		   moment the create call returns an id. */
		prepare: [
			{
				click: '[data-testid="new-post"]',
				until: '() => !!document.querySelector(".compose-card .kind-toggle")'
			},
			{
				click: '.compose-card .kind-toggle .kind:has-text("Assignment")',
				until: '() => !!document.querySelector(".compose-card .attach-editor .rubric-builder")'
			}
		],
		presence: [
			{ selector: '.compose-card .kind-toggle .kind.active', label: 'kind tab active (Assignment)', expectPresent: 1 },
			{ selector: '.compose-card .attach-editor .rubric-builder', label: 'staged rubric builder (create, assignment)', expectPresent: 1 }
		],
		contrast: [
			{ selector: '.compose-card .rubric-builder .line', label: 'rubric builder empty-state copy', min: 4.5 }
		],
		/* `.btn.secondary.tiny` here is a chip beside a heading -- it is not
		   phone-touched (manage-only classroom surface) and not the
		   student-facing engine, so IDEA_INTERFACE_STANDARDS 10's 24px floor
		   applies, not the 44px one `.cr-console` and `.engine-host` bump their
		   own `.btn.tiny` controls to. classroom.css:195 now clears 24px for
		   every `.btn.tiny`/`.btn.secondary.tiny`, so this check asserts the
		   floor that actually applies to this control. */
		tapTargets: [
			{ selector: '.compose-card .rubric-builder .actions .btn', label: 'rubric builder controls (Build rubric / Generate from spec)', min: 24 }
		]
	},
	{
		path: '/dev/classroom-split/s-1/item/i-crowded?manage=1',
		label: 'Item detail, second notebook check-in attach door (teacher, one already attached)',
		/* THE SECOND DOOR never ran in a browser before this either: the attach
		   control used to be the {:else} of `{#if checkIns.length}`, so an item
		   that already carried a check-in had no way to add a second one. It is
		   now mounted beside the list unconditionally once `canManageCheckIn`
		   holds. i-crowded carries one check-in (classroom-split/fixture.ts,
		   CHECK_INS) and this route now wires `checkInTransports` (previously
		   omitted here entirely, which is the whole reason this state was
		   unreachable from any dev route this session may touch). The
		   inspector strip is collapsed by default (`itemInspector.open` starts
		   false), so it has to be opened first. */
		prepare: [
			{
				click: '[data-testid="inspector-toggle"]',
				until: '() => !!document.querySelector("#item-inspector-body")'
			}
		],
		presence: [
			{ selector: '[data-testid="insp-check-in"]', label: 'check-in already attached', expectPresent: 1 },
			{ selector: '[data-testid="detach-check-in"]', label: 'detach control on the attached check-in', expectPresent: 1 },
			{ selector: '[data-testid="check-in-open"]', label: 'second attach door (Add a check-in)', expectPresent: 1 }
		],
		contrast: [
			{ selector: '[data-testid="insp-check-in"] strong', label: 'attached check-in label', min: 4.5 }
		],
		/* Same chip-sized control as the composer route above -- neither
		   `.cr-console` nor `.engine-host`, so the 24px floor applies rather
		   than the 44px one (classroom.css:195). */
		tapTargets: [
			{ selector: '[data-testid="check-in-open"]', label: 'second attach door control', min: 24 },
			{ selector: '[data-testid="detach-check-in"]', label: 'detach control', min: 24 }
		],
		/* THE CROWDED FIXTURE'S OWN IMAGE ATTACHMENT (span-photo.jpg), not this
		   bundle's doing: `AttachmentList` always renders through
		   `attachmentSrc()` -> `/api/classroom/attachment/<id>`, a real server
		   route that needs a session this placeholder-.env dev server cannot
		   provide, so it 401s. Every route in this file with fixture-only
		   errors gets its own documented ignore, same as the harness's own
		   external-block pattern above. */
		ignoreConsole: ['Failed to load resource: the server responded with a status of 401']
	},
	{
		path: '/dev/classroom?view=class-teacher',
		label: 'Class stream composer, grading-category datalist (teacher)',
		/* This is the fixture side of a real 0142 gap: the harness mounted the
		   REAL ContentComposer but supplied no `loadCategorySuggestions`
		   transport, so the grading-category datalist never rendered here and
		   the pass measured nothing about it. `New post` opens the composer
		   (kind defaults to `post`, which carries no category field at all),
		   then the Assignment kind tab is what renders the "Grading category"
		   input the datalist attaches to. Both steps mirror
		   /dev/classroom-split's own compose-assignment-rubric route exactly. */
		prepare: [
			{
				click: '[data-testid="new-post"]',
				until: '() => !!document.querySelector(".composer-host .kind-toggle")'
			},
			{
				click: '.composer-host .kind-toggle .kind:has-text("Assignment")',
				until: '() => !!document.querySelector(".composer-host input[list]")'
			}
		],
		presence: [
			{ selector: '.composer-host .kind-toggle .kind.active', label: 'kind tab active (Assignment)', expectPresent: 1 },
			{ selector: '.composer-host input[list]', label: 'grading-category field carries a list attribute', expectPresent: 1 }
		],
		/*
			THE REGRESSION THIS CATCHES: a fixture whose `loadCategorySuggestions`
			returns raw, unranked categories in a different order than the real
			RPC would, or a composer that renders the datalist's `<option>`s out
			of the order `categorySuggestions` (the effect's own state) actually
			holds -- either one a plain "the datalist has N options" presence
			check would miss entirely. `evaluateExpected` calls the SAME transport
			and the SAME `courseCategorySuggestions` the real render path calls
			(exposed at `window.__categorySuggestionsFor`, see
			src/routes/dev/classroom/+page.svelte), so the expected order is never
			retyped here -- it is the function's own output on this fixture's own
			data (i-3 and i-8 are both 'Unit Labs', i-4 is 'Documentation', so the
			ranked order is ['Unit Labs', 'Documentation']).
		*/
		datalistOrder: [
			{
				inputSelector: '.composer-host input[list]',
				evaluateExpected: "() => window.__categorySuggestionsFor(['c-1'])",
				label: 'grading-category datalist matches courseCategorySuggestions'
			}
		]
	},
	{
		path: '/dev/animated-logo',
		label: 'Animated emblem harness',
		presence: [
			{ selector: 'h1, .note', label: 'page copy', expectPresent: 1 },
			/* The emblem is img-based, not an svg. */
			{ selector: '.idea-logo', label: 'emblem roots', expectPresent: 1 },
			{ selector: '.idea-logo img.gear', label: 'emblem gear layer', expectPresent: 1 }
		],
		contrast: [{ selector: '.note', label: 'note copy on its plate', min: 4.5 }],
		tapTargets: [{ selector: '.sfb-trigger', label: 'site feedback trigger', min: 44 }]
	},
	{
		path: '/dev/foundry-gallery',
		label: 'Foundry gallery / review harness (telemetry + admin metadata)',
		/* Both `gallerySlug` and `reviewSlug` default to 'hostile-probe', so the
		   page loads with a detail pane already open on both halves. Under
		   `ClassSplit`'s `narrow="swap"` that means the GALLERY's nav pane --
		   where the sort control lives -- is the one pane hidden at 375px, same
		   as a student who followed a deep link straight to an app. The
		   harness's own deselect control is what a visitor to bare `/foundry`
		   does; clicking it is what makes the sort buttons measurable at both
		   widths rather than only the one where a selection happens not to
		   collapse the nav pane. The review pane is left alone deliberately: its
		   selection is what puts `FoundryPlayStats` and the metadata editor on
		   screen, which is the whole point of this route being listed. */
		prepare: [
			{
				click: '[data-testid="gallery-deselect"]',
				until: '() => !!document.querySelector("[data-testid=\'foundry-gallery-grid\']") && !document.querySelector(".fdy-gal-detail")'
			}
		],
		presence: [
			{ selector: '.harness h1', label: 'page heading', expectPresent: 1 },
			{ selector: '[data-testid="foundry-gallery-grid"] li', label: 'gallery cards', expectPresent: 3 },
			{ selector: '.fdy-gal-sort-btn', label: 'gallery sort buttons', expectPresent: 3 },
			/*
				TWO OF THREE FIXTURE APPS CARRY A NONZERO PLAY COUNT; the third is
				zero on purpose (`playCountLabel` renders no chip for zero), so this
				is an exclusion assertion as much as a presence one -- 2 chips
				painted, never 3, proves the zero case is genuinely rendering
				nothing rather than the fixture simply lacking a third number.
			*/
			{ selector: '[data-testid="fdy-card-plays"]', label: 'play-count chips (2 of 3 apps played)', expectPresent: 2 },
			{ selector: '[data-testid="foundry-inspector"]', label: 'review inspector (admin path)', expectPresent: 1 },
			{ selector: '[data-testid="foundry-play-stats"]', label: 'FoundryPlayStats block', expectPresent: 1 },
			{ selector: '[data-testid="foundry-metadata-edit"]', label: 'admin metadata editor', expectPresent: 1 },
			/* The inspector's own download control (FoundryInspector.svelte), never
			   measured by the harness before this: 'hostile-probe's reviewed
			   version carries real fixture bundle files (file_count > 0) and its
			   app is not hidden, so `foundryDownloadable` holds and the control
			   renders. Hand-measured previously at 208 x 45.4, 8.28:1. */
			{ selector: '[data-testid="foundry-inspector"] .fdy-insp-get a.btn', label: 'inspector download control', expectPresent: 1 }
		],
		contrast: [
			{ selector: '.fdy-gal-sort-btn[aria-pressed="true"]', label: 'sort control, active', min: 4.5 },
			{ selector: '.fdy-gal-sort-btn[aria-pressed="false"]', label: 'sort control, inactive', min: 4.5 },
			{ selector: '[data-testid="foundry-inspector"] .fdy-insp-get a.btn', label: 'inspector download control', min: 4.5 }
		],
		tapTargets: [
			{ selector: '.fdy-gal-sort-btn', label: 'gallery sort buttons', min: 44 },
			{ selector: '[data-testid="foundry-inspector"] .fdy-insp-get a.btn', label: 'inspector download control', min: 44 }
		],
		/*
			THE REGRESSION THIS CATCHES: a first draft styled the active sort
			button `color: var(--green)`, which `.btn` was already setting, so
			pressed and unpressed rendered the IDENTICAL foreground at the
			IDENTICAL 8.28:1 ratio and only `aria-pressed` told them apart --
			invisible to a sighted reader. Two ordinary `contrast` checks above
			would not have caught it (8.28:1 clears 4.5:1 twice over); this one
			asserts the two states actually differ from EACH OTHER.
		*/
		statePairs: [
			{
				activeSelector: '.fdy-gal-sort-btn[aria-pressed="true"]',
				inactiveSelector: '.fdy-gal-sort-btn[aria-pressed="false"]',
				label: 'sort control: active vs inactive must render differently'
			}
		]
	},
	{
		path: '/dev/foundry-forge',
		label: 'Forge identity harness (FoundryMine download control)',
		/* Mounts the REAL FoundryMine over fixture apps holding every lifecycle
		   state at once. `/foundry/mine` and this harness's own FoundryMine
		   mount were never in tools/browser-verify/routes.mjs, so the download
		   control FoundryMine.svelte renders beside every version (submitted,
		   draft, approved, rejected -- `foundryDownloadable` mirrors
		   `foundryPreviewable` and asks no status question) was hand-measured
		   instead of driven here. 'ember-clock' is selected by default, whose
		   five fixture versions all carry file_count: 3 on a non-hidden app, so
		   every one renders its own "Download v<ordinal>" control. Hand-measured
		   previously at 138.8 x 45.4, 7.97:1. */
		presence: [
			{ selector: '.fdy-detail .fdy-versions a.btn[download]', label: 'per-version download controls (ember-clock, 5 versions)', expectPresent: 5 }
		],
		contrast: [
			{ selector: '.fdy-detail .fdy-versions a.btn[download]', label: 'FoundryMine download control', min: 4.5 }
		],
		tapTargets: [
			{ selector: '.fdy-detail .fdy-versions a.btn[download]', label: 'FoundryMine download control', min: 44 }
		]
	},
	{
		path: '/dev/hall-pass',
		label: 'Hall pass, all five projections + the 0144 close branch',
		/*
			THE ONE CONTROL THIS FEATURE HAS, and until now it had never been
			measured anywhere. 0143 shipped the hall pass with no harness; the
			route's own header says so in as many words and asks whoever owns
			`tools/` to list it. This is that listing.

			WHY IT MATTERS MORE THAN ITS SIZE SUGGESTS: it is a PHONE control on
			a student surface -- one-handed, at the top of the class pane, at the
			one moment a student is not going to read anything -- and it is
			`aria-disabled` rather than `disabled` on purpose, so a student who
			taps a taken pass gets a sentence instead of a dead button. Both of
			those are invisible to `svelte-check` and neither shows up as wrong
			on screen: a `disabled` attribute renders identically and simply eats
			the tap.

			CONFIRMED HERE, NOT COPIED. The bundle that added the route
			hand-measured 44.0px min dimension, hit fraction 1.0 and 0px overflow
			at both widths. Re-measured through this harness: min dim 44.0px over
			4 controls, 4/4 centre hit tests land on the control itself, 0px
			overflow at 375 and 1440. The hand numbers reproduce exactly.
		*/
		presence: [
			/* SIX MOUNTS: the five payload projections plus the read-only one. */
			{ selector: '[data-testid="hall-pass"]', label: 'hall pass mounts (5 projections + read-only)', expectPresent: 6 },
			/*
				ABSENCE IS THE MECHANISM, and this is the assertion for it. The
				sixth mount is handed `transports={null}`, so the whole actions
				block is not rendered -- 5 `.hp-actions`, never 6. A read-only
				surface with a flag somebody honours would show 6 here.

				PRESENT 5 BUT VISIBLE 4, MEASURED, and the gap is the sixth
				projection rather than a defect: an instructor with NOBODY OUT has
				a `transports` object (so the block renders) and nothing to press
				(`canClose` is false, and the Sign-out branch is student-only), so
				that mount's block is a real zero-box -- 309.0x0.0 at 375px,
				638.0x0.0 at 1440. Asserting visible 5 here would be asserting a
				control the component is right not to offer. The numbers are split
				deliberately: `present` says the read-only mount rendered nothing,
				`visible` says exactly one of the five holds no control.
			*/
			{ selector: '.hp-actions', label: 'action blocks (read-only renders none; manager-empty renders an empty one)', expectPresent: 5, expectVisible: 4 },
			/*
				THE aria-disabled CONTRACT, ASSERTED IN BOTH DIRECTIONS. The
				blocked student's control must carry `aria-disabled="true"` so it
				can still receive the tap and explain itself, and NOTHING here may
				carry a real `disabled` attribute -- that swallows the pointer
				event and takes the explanation with it. The second row is the one
				that bites: a `disabled` added "to be consistent" looks correct in
				every screenshot.
			*/
			{ selector: '[data-mount="student-blocked"] [data-testid="hall-pass-open"][aria-disabled="true"]', label: 'blocked control is aria-disabled', expectPresent: 1 },
			{ selector: '[data-testid="hall-pass-open"][disabled], [data-testid="hall-pass-close"][disabled]', label: 'no control carries a real disabled attribute', expectPresent: 0, expectVisible: 0 }
		],
		contrast: [
			{ selector: '[data-testid="hall-pass-status"]', label: 'status line', min: 4.5 },
			/* `--ice` on the blocked control: a boundary-weight signal on a
			   control, not body copy, so 3:1 is the floor that applies. */
			{ selector: '[data-mount="student-blocked"] [data-testid="hall-pass-open"]', label: 'blocked control ink (--ice)', min: 3 }
		],
		tapTargets: [
			{ selector: '[data-testid="hall-pass-open"], [data-testid="hall-pass-close"]', label: 'hall pass controls (phone-first, 44px)', min: 44 }
		],
		/*
			THE 0144 BRANCH, WHICH IS THE HALF `svelte-check` CANNOT SEE AND THE
			SCREEN DOES NOT SHOW. `signIn()` sends the PASS ID when the payload is
			a manager's and the SECTION when it is a student's -- one button, one
			label, two different requests. The defect it replaced was a
			section-keyed close that re-resolved "whatever is open in this
			section" server-side, so a clear pressed while one student returned
			and another left closed the SECOND student's pass and marked them back
			in the room while they were in a corridor.

			So this is a claim about a WRITE, which is exactly what `orderResult`
			exists for and what no DOM read can settle: the button looks identical
			either way. The prepare steps press the manager's control and then the
			student's; the harness's transports record which METHOD each press
			called, and the evaluate below projects the log down to just the
			method names. The expected pair is 0144's rule, not the fixture's
			prose -- reformatting a log line must not move this assertion, and
			taking the wrong branch must.
		*/
		prepare: [
			{
				click: '[data-mount="manager-open"] [data-testid="hall-pass-close"]',
				until: '() => document.querySelectorAll(\'[data-testid="hall-pass-log"] li\').length >= 1'
			},
			{
				click: '[data-mount="student-mine"] [data-testid="hall-pass-close"]',
				until: '() => document.querySelectorAll(\'[data-testid="hall-pass-log"] li\').length >= 2'
			}
		],
		orderResult: [
			{
				evaluate:
					'() => [...document.querySelectorAll(\'[data-testid="hall-pass-log"] li\')].map((li) => (li.textContent.match(/(closeById|closeMine|open)\\(/) || [])[1] ?? "?")',
				expected: ['closeById', 'closeMine'],
				label: "the manager's close named the PASS, the student's named nothing"
			}
		]
	},
	{
		path: '/dev/foundry-submit',
		label: 'Foundry submit, a refused upload rendered to the student',
		/*
			THE STUDENT'S OWN UPLOAD SURFACE, and the highest-churn dev route that
			nothing drove: `FoundrySubmit`, `FoundryIssues`, `FoundryContract` and
			`AppFrame` are all mounted here and none of them appears anywhere else
			in this file. `/dev/foundry-forge` drives `FoundryMine` and stops
			there.

			WHAT IS BEING MEASURED IS THE REFUSAL PATH, deliberately, because that
			is the half a student meets when something is wrong and the half whose
			failure is silent: a refusal that stops rendering leaves a student
			looking at an upload that did not work with nothing on screen saying
			why, and the next thing that happens is they paste it back into
			whatever generated the app. CLAUDE.md pins those sentences as
			VERBATIM -- `FoundryIssues` never rewrites, shortens or re-tones one,
			because the same string is produced by the browser preflight and by
			`foundry-ingest`.

			THE PREFLIGHT IS THE REAL ONE. `[data-drive="zip-bad"]` builds a real
			`File`, hands it to the component's own input through a real `change`
			event, and the route runs `preflightZipInBrowser` over the same
			normalized zip the surface would have uploaded -- the same module the
			server runs, with the same wording. Measured: 4 sentences render, at
			14.27:1, at both widths.
		*/
		prepare: [
			{
				click: '[data-drive="zip-bad"]',
				until: '() => !!document.querySelector(".fdy-issues")',
				attempts: 8,
				gapMs: 400
			}
		],
		presence: [
			/*
				THE INPUT IS NOT ASSERTED HERE, ON PURPOSE, AND IT IS NOT
				UNCHECKED. `[data-fdy-input]` exists before the drive and is gone
				after it -- the surface moves off its drop zone once it has a
				bundle -- so a presence row for it measured 0 and reported a
				finding about a control that had done its job. It is proven by the
				PREPARE STEP instead, and more strongly: the route's `drive()`
				looks the input up itself and, not finding one, writes "No file
				input on screen" into the drive note and returns WITHOUT handing
				the files over, so `.fdy-issues` never appears and the step prints
				FAILED. The note below is the same fact stated positively.
			*/
			{ selector: '[data-testid="drive-note"]', label: 'the drive note (the input was found and handed the files)', expectPresent: 1 },
			{ selector: '.fdy-issues', label: 'issues panels after the bad zip', expectPresent: 1 },
			/*
				FOUR SENTENCES, not "at least one": the bad fixture trips a leading
				slash, two references to files the upload does not contain, and the
				unconditional localStorage warning. A count of 1 would pass on a
				panel that had lost three of them.
			*/
			{ selector: '.fdy-issue-message', label: 'refusal + warning sentences (leading slash, 2 missing refs, storage)', expectPresent: 4 }
		],
		contrast: [
			{ selector: '.fdy-issue-message', label: 'refusal sentence on its panel', min: 4.5 }
		],
		/*
			THE COPY CONTROLS ARE `tap-44` AND THE REASON IS THE FEATURE ITSELF:
			the next thing that happens to a failure is being pasted back into an
			AI tool, so per-issue copy and copy-all are the point of the panel
			rather than a convenience. Measured 77.4x44, min dim 44.0px over 5
			controls.

			NOTE ON THE HIT TEST the tap-target check also records: these controls
			sit ~3000px down the document at 375px, and `elementFromPoint` answers
			null outside the viewport, so `centreHitsSelf` reads false for all
			five here. It is an artefact of the harness never scrolling, not a
			finding -- scrolled into view the same control hit-tests to itself --
			and it changes nothing, because `tapTargets` gates only on the
			geometry. Do not "fix" it by scrolling before measuring: scrolling
			moves the boxes this check exists to report.
		*/
		tapTargets: [
			{ selector: '.fdy-issues .btn', label: 'per-issue and copy-all controls', min: 44 }
		]
	},
	{
		path: '/dev/notebook-review',
		label: 'Notebook review grid, the locked density contract and its seven states',
		/*
			THE GRID IS A LOCKED CONTRACT (CLAUDE.md): its density, its status
			glyphs, Share Tech Mono and the 1.9rem cell box are verified
			byte-identical after any restyle, and every status value carries a
			glyph, a label, a fill STYLE no other state uses, a `--nb-cell-*`
			token declared on all three plates AND A MEASURED CONTRAST FIGURE FOR
			EACH. That last clause is a standing obligation on a surface nothing
			automated has ever measured, which is the whole argument for listing
			this route: a token missing from one plate, or an ink that quietly
			stops clearing on the ground it is actually painted on, is invisible
			on screen and reddens no type check.

			0140 IS WHY IT IS URGENT RATHER THAN TIDY. `scheduled` is the seventh
			answer to the same question the other six answer, so it arrived with
			all of it -- key, label, glyph, dashed-vs-dotted fill, per-plate token
			-- and its contrast figure is now measured here (6.19:1) instead of
			once, by hand, in the bundle that added it.

			THE STATES PRESENT IN THIS FIXTURE ARE FIVE OF THE SEVEN, and the two
			absent ones are asserted as absent rather than left unmentioned: the
			section fixture produces no `ontime` and no `await` cell, so a
			contrast row naming either would report "no match" forever and read as
			a finding about the ink. The LEGEND is the assertion that covers all
			seven regardless -- it renders the same array the grid dispatches
			from, so a state that stopped being drawn stops being advertised.
		*/
		/*
			THE COLD-LOAD RACE, AND WHY THIS ROUTE NEEDS `waitFor`. The compliance
			grid arrives on an async transport. The FIRST visit to any route also
			pays vite's module-graph compile, and the run visits 375 before 1440 --
			so on the cold pass the grid had not landed 700ms after `waitForApp`
			returned and the page measured 0 cells, while the warm 1440 pass
			measured 30. That reads exactly like a console that renders no grid at
			phone width, and it is nothing of the kind: warm, BOTH widths render
			the identical 30 cells (`narrow="stack-nav-first"` puts the grid pane
			first, it is not dropped). A longer `settleMs` would paper over it
			until the payload got slower again; the predicate cannot.
		*/
		prepare: [
			{ waitFor: '() => document.querySelectorAll(".cell").length > 0', timeoutMs: 20000 }
		],
		presence: [
			{ selector: '[data-testid="grid-scroll"]', label: 'compliance grid', expectPresent: 1 },
			{ selector: '.cell', label: 'grid cells', expectPresent: 30 },
			/* SEVEN STATES PLUS THE not-reviewed DOT. The legend is always
			   visible on purpose -- CLAUDE.md forbids putting words in a cell to
			   satisfy a label audit, so this row and the hint above the grid are
			   what carry the meaning. */
			{ selector: '.legend li', label: 'always-visible legend (7 states + not-reviewed)', expectPresent: 8 },
			/* The two states this fixture does not produce, asserted as absent so
			   the five contrast rows below cannot be read as covering all seven. */
			{ selector: '.cell.ontime, .cell.await', label: 'states absent from this fixture (ontime, await)', expectPresent: 0, expectVisible: 0 }
		],
		contrast: [
			{ selector: '.cell.late', label: 'cell: late', min: 4.5 },
			{ selector: '.cell.flagged', label: 'cell: flagged', min: 4.5 },
			{ selector: '.cell.excused', label: 'cell: excused', min: 4.5 },
			{ selector: '.cell.missing', label: 'cell: missing', min: 4.5 },
			/* 0140's new value, measured rather than asserted. */
			{ selector: '.cell.scheduled', label: 'cell: scheduled (0140)', min: 4.5 }
		],
		/*
			24px, NOT 44px, AND THAT IS THE DOCUMENTED EXCEPTION RATHER THAN A
			RELAXATION. `IDEA_INTERFACE_STANDARDS` 10 exempts a control inside a
			locked density contract, because inflating the cell box to 44px would
			break the invariant the contract exists to hold -- and this grid is an
			instructor console, not a phone surface. Measured 30.4x30.4, which
			clears the floor that actually applies with room to spare.
		*/
		tapTargets: [{ selector: '.cell', label: 'grid cells (locked density: 24px floor)', min: 24 }]
	},
	{
		path: '/dev/notebook',
		label: "Notebook, student account (the compose form stacked above the feed at phone width, always -- CLAUDE.md: 'a phone has always shown it ABOVE the feed')",
		/*
			REACHABLE FROM NOWHERE ELSE IN THIS FILE. `NotebookView.svelte` and
			`NotebookEntryCard.svelte` had never been driven here before this
			bundle -- `/dev/notebook-review` mounts the review CONSOLE (a
			different component, `SectionGrid`), never the student's own
			notebook. The default account is 'student', which at 375px is
			`wide=false`, so `composerMounted` is unconditionally true and the
			split's `has-detail` class applies from first paint -- no prepare
			step is needed to reach the state this route exists to measure.

			THIS IS THE ROUTE THE 10px OVERFLOW WAS ON. `.field.label-field`
			(the free-entry title field) had no override for the shared
			`.field` class's row-flex layout from app.css -- a key/value row
			built for a profile header, not a label wrapping a stacked input
			and hint -- so the title field's long hint sentence forced the row,
			and the document, 10.5px past the viewport. `body` clips horizontal
			overflow (app.css), so nothing scrolled and nothing looked wrong;
			the content was simply cut off the right edge. Fixed by giving
			`.label-field` itself the column stacking `.note-field` and
			`.folder-field` already had -- the folder field only avoided the
			same defect by ALSO carrying `.folder-field`, which the title
			field's label never did.
		*/
		/*
			THE TITLE FIELD ONLY RENDERS FOR A FREE ENTRY (`selectedSession ===
			null`), and which check-in (if any) auto-selects on mount is not
			pinned by this route -- forcing "Something else" is what makes the
			title field's presence deterministic at BOTH widths rather than
			riding whatever the auto-pick effect happened to land on.
		*/
		prepare: [{ click: '.pick.free', until: '() => document.querySelector(".pick.free").getAttribute("aria-pressed") === "true"' }],
		presence: [
			{ selector: '.dev-bar', label: 'harness controls', expectPresent: 1 },
			{ selector: '.nb-root', label: 'NotebookView mounted', expectPresent: 1 },
			{ selector: '.compose-card label.label-field', label: 'free-entry title + folder fields (both stacked, not row-flex)', expectPresent: 2 }
		],
		contrast: [{ selector: '.compose-card .hint', label: 'title field hint copy', min: 4.5 }],
		tapTargets: [{ selector: '.compose-card input[type="text"], .compose-card select', label: 'compose form controls', min: 44 }],
		/*
			THE FEED'S PHOTO THUMBNAILS 401 FOR THE SAME REASON EVERY OTHER
			NOTEBOOK ROUTE'S DO: `<img>` against the real `/api/notebook/photo/
			<id>` proxy, which needs a session this placeholder-.env dev server
			cannot provide. This fixture's own photo ids (p-1 through p-13,
			the STUDENT_ENTRIES/FILLER fixtures), named rather than blanketed.
		*/
		ignoreConsole: ['\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/']
	},
	{
		path: '/dev/notebook-review-student',
		label: 'Notebook review, one student (StudentReviewBackStrip + NotebookView read-only + NotebookDeletedZone)',
		/*
			ALREADY CLEAN AT BOTH WIDTHS -- 0px overflow, measured -- and the only
			reason it was not already listed is that nothing had driven it. The
			default student ('ana') carries one self-deleted and one
			staff-deleted entry, so both `NotebookDeletedZone` branches (a
			Restore control on the first, a bare refusal reading on the
			second) are on screen without a click.

			THE 401s ARE THE FIXTURE, NOT A DEFECT: `NotebookView` here (like
			every other notebook route in this file) renders `<img>` tags
			against the REAL `/api/notebook/photo/<id>` proxy, which needs a
			session this placeholder-.env dev server cannot provide. NAMED
			rather than blanketed -- the harness now tags a "Failed to load
			resource" console error with the actual failing request (see
			`browser.mjs`), so this ignores the two specific photo fetches
			ana's fixture makes and nothing else that happens to also 401.
		*/
		presence: [
			{ selector: '.back-strip', label: 'StudentReviewBackStrip', expectPresent: 1 },
			{ selector: '.nb-root', label: 'NotebookView mounted (read-only)', expectPresent: 1 },
			{ selector: '[data-testid="staff-deleted-zone"]', label: 'deleted-entries disclosure', expectPresent: 1 },
			{ selector: '[data-testid="staff-restore-entry"]', label: 'Restore control (self-deleted entry only)', expectPresent: 1 }
		],
		contrast: [{ selector: '.back-strip .who', label: 'back-strip student line', min: 4.5 }],
		ignoreConsole: [
			'\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/ana-p1\\?',
			'\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/ana-p2-live\\?'
		]
	},
	{
		path: '/dev/song-queue',
		label: 'Song queue (0145), seven mounts -- student, capped student, manager, read-only',
		/*
			SHIPPED BUILT AND NEVER REGISTERED. The route's own header says so:
			"deliberately NOT in tools/browser-verify/routes.mjs, because the
			session that added it was scoped out of that directory." Its own
			session hand-measured 0px overflow, 23 controls at exactly 44.0px
			(hit fraction 1.0) and 20 links boxing at 24.3px whose HIT-TESTED
			reach is 44.0px with 0 taps stolen -- confirmed here rather than
			retyped: a plain box-height tap-target check would report 20
			findings on `.tap-reach-44` links that are genuinely fine, because
			the reach is a pseudo-element that grows the HIT AREA without
			reflowing the link's own line box (CLAUDE.md: ".tap-reach-44
			expands the HIT AREA of one sitting inside a line of text"). The
			harness's own `tap-target` check already hit-tests every control's
			CENTRE and reports it beside the box, which is what proves the
			20 links are not 20 findings.
		*/
		presence: [
			{ selector: 'section.mount[data-mount]', label: 'the seven state mounts', expectPresent: 7 },
			{ selector: '[data-testid="song-queue"]', label: 'SongQueue card, one per mount', expectPresent: 7 },
			{ selector: '[data-mount="student / at the cap"] [data-testid="song-queue-send"][aria-disabled="true"]', label: 'capped student control is aria-disabled', expectPresent: 1 },
			{ selector: '[data-testid="song-queue-send"][disabled], [data-testid="song-queue-approve"][disabled], [data-testid="song-queue-reject"][disabled]', label: 'no control carries a real disabled attribute', expectPresent: 0, expectVisible: 0 }
		],
		contrast: [
			{ selector: '[data-testid="song-queue-price"]', label: 'price label', min: 4.5 },
			{ selector: '[data-mount="manager / queue to work"] [data-testid="song-queue-tally"]', label: 'pending tally', min: 4.5 }
		],
		tapTargets: [
			{ selector: '.tap-44', label: 'primary controls (send / approve / reject / send reason)', min: 44 }
		],
		/*
			`.sq-link` IS `.tap-reach-44`, NOT `.tap-44`: it sits inside a text
			row (a URL and its meta beside it), so its box stays whatever its
			text needs (measured 24.3px tall) and the 44px floor is met by the
			pseudo-element reach instead (app.css). Pointing the ordinary
			`tapTargets` box check at it would report all 20 as findings on a
			control that is correct by design -- see `tapReach` in checks.mjs,
			which measures the reach's own geometry and hit-tests it rather
			than the link's box.
		*/
		tapReach: [
			{ selector: '.sq-link.tap-reach-44', label: 'approved/pending row links (reach, not box)', min: 44 }
		],
		/*
			THE aria-disabled CONTRACT AGAIN, the same shape as /dev/hall-pass:
			the capped student's Request control must still take the tap and
			explain itself. Proven by actually clicking it (clickUntil's
			coordinate click, which lands on aria-disabled where
			locator.click() would refuse) and reading the notice it produces.
		*/
		prepare: [
			{
				click: '[data-mount="student / at the cap"] [data-testid="song-queue-send"]',
				until: '() => !!document.querySelector(\'[data-mount="student / at the cap"] [data-testid="song-queue-notice"]\')'
			}
		]
	},
	{
		path: '/dev/frc',
		label: 'FRC Training shell nav, admin state (widest header configuration)',
		/*
			REGRESSION GUARD FOR c04e448. `.frc-nav` stayed `nowrap` even though
			`.frc-header` itself already wraps, so the nav's own min-content (two
			links, the admin "View as student" toggle, the rank badge, the
			profile menu) forced the header wider than a 375px viewport --
			silently, because `body` clips horizontal overflow. `min-width: 0`
			alone did NOT fix this shape: it only let the row shrink below that
			sum, and the overflow reappeared one flex level down, on the rank
			badge's own nowrap text. `flex-wrap: wrap` on `.frc-nav` is what
			actually converged (0px overflow at 375px, unchanged at 1440px).

			This route's default state already carries the widest nav with no
			prepare step: `rankCount={count}` is 0, not null, so the badge
			renders, and `simulateTeacher` (adminOverride) defaults true, so the
			admin toggle renders too.
		*/
		presence: [
			{ selector: '.frc-header', label: 'FRC header', expectPresent: 1 },
			{ selector: '.frc-nav', label: 'FRC nav', expectPresent: 1 },
			{ selector: '.frc-nav .frc-view-toggle', label: 'admin "View as student" toggle', expectPresent: 1 },
			{ selector: '.frc-nav .rank-chip', label: 'rank badge (chip)', expectPresent: 1 }
		],
		/*
			ONE LINE AT >=1024px IS THE OUTCOME, ASSERTED DIRECTLY -- NOT A RULE
			ABOUT flex-wrap. `min-width: 0` alone had already been tried and
			converged on the WRONG outcome (zero overflow, but by forcing the
			rank badge's own text to overhang instead); `flex-wrap: wrap` is
			what made both true at once. The horizontal-scroll check already
			measured for every route covers the overflow half; this is the half
			it cannot state -- that the wrap did not cost the 1440px nav its
			single line (hand-measured at 28.7px tall in c04e448, reproduced
			here). Below 1024px the nav is EXPECTED to wrap onto more than one
			line, so the same evaluate is a deliberate no-op there rather than a
			claim it was never meant to hold.

			COMPARING EACH CHILD'S ROUNDED `top` IS NOT "ONE LINE": the three
			links, the admin toggle and the rank chip do not share one box
			height (`align-items: center` centers each against the tallest), so
			their tops differ by ~2px even sitting on the identical line --
			measured [216, 216, 216, 218, 218], two distinct rounded values from
			a single-line render. A wrapped nav's second line differs by a
			whole line-plus-gap (~35px+), so comparing the ROW'S OWN height
			against its tallest child (with a few px of slack for that same
			centering) is the discriminator that survives it.
		*/
		orderResult: [
			{
				evaluate: `() => {
					const nav = document.querySelector('.frc-nav');
					if (!nav) return [false];
					if (document.documentElement.clientWidth < 1024) return [true];
					const navH = nav.getBoundingClientRect().height;
					const maxChildH = Math.max(...[...nav.children].map((el) => el.getBoundingClientRect().height));
					return [navH <= maxChildH + 4];
				}`,
				expected: [true],
				label: '.frc-nav is one line at >=1024px (free to wrap narrower, where zero-overflow is the only claim)'
			}
		]
	},
	{
		path: '/dev/classroom-deck',
		label: 'Classroom deck harness controls (long select option text)',
		/*
			REGRESSION GUARD FOR c04e448. `.controls` wraps (flex-wrap: wrap),
			but a flex child's automatic minimum is still its own min-content --
			here the mode `<select>`'s widest OPTION text ("normal export
			(wrapper folder + hidden state file)"), wider than a 375px viewport
			on its own (CLAUDE.md: "min-width: 0 on grid/flex children").
			Wrapping the LABEL onto its own row does nothing for a label that is,
			by itself, wider than the row; `min-width: 0` on `.controls label` is
			what lets the select shrink to fit. The default 'panel' view renders
			`.controls` immediately, no prepare step needed.
		*/
		presence: [
			{ selector: '.controls', label: 'mode/fault controls', expectPresent: 1 },
			{ selector: '.controls select', label: 'mode + fault selects', expectPresent: 2 }
		]
	},
	{
		path: '/dev/gauntlet-shell',
		label: 'GAUNTLET viewport chrome -- trademark footer, FeatureManager rail, cursor layer',
		/*
			THREE COMPONENTS THE GAUNTLET LAYOUT PUTS ON EVERY PAGE, none of
			which had ever been measured: TrademarkFooter, FeatureTreeNav and
			CursorLayer are mounted in `src/routes/gauntlet/+layout.svelte` and
			were reachable from no dev route at all, so every student in every
			mode has been looking at them and no instrument has.

			The footer is COMPLIANCE-CRITICAL rather than cosmetic
			(docs/GAUNTLET-DESIGN.md: nominative SOLIDWORKS text only, never the
			logo or a lookalike), which is why it gets a `textContains` row and
			an `img/svg` exclusion rather than a presence row. A footer that had
			lost the rights holder from its sentence is present, visible, and
			clears its contrast minimum exactly as before.
		*/
		textContains: [
			{
				selector: '.gt-tm p',
				label: 'trademark disclaimer, verbatim',
				must: [
					'SOLIDWORKS is a trademark of Dassault Systèmes',
					'IDEA GAUNTLET is an educational tool built at Bosco Tech',
					'not affiliated with, sponsored by, or endorsed by Dassault Systèmes'
				],
				/*
					The forbidden half is not decoration: a sentence can keep
					every required phrase and add one that reverses it, and a
					`must` list cannot see that. These are the claims the
					disclaimer exists to deny.
				*/
				mustNot: ['officially endorsed', 'in partnership with', 'a Dassault Systèmes product']
			}
		],
		presence: [
			{ selector: '.gt-tm', label: 'trademark footer', expectPresent: 1, expectVisible: 1 },
			/*
				"Nominative text only, never the logo or a lookalike" as a
				STRUCTURAL exclusion. No image and no inline mark may appear
				inside the footer, in any form.
			*/
			{ selector: '.gt-tm img, .gt-tm svg, .gt-tm picture', label: 'no mark of any kind inside the footer', expectPresent: 0, expectVisible: 0 },
			/*
				GAUNTLET-DESIGN states the FeatureManager rail as a
				PROHIBITION -- "hidden by default; do not make it visible by
				default" -- and the rail is present in the DOM either way, so
				a presence row alone says nothing about it. The claim is the
				`orderResult` reachability probe below; what is asserted HERE
				is only that it exists and is hidden from assistive tech,
				which is the half a hit test cannot see.

				THE FIRST DRAFT OF THIS ROW WAS `maxVisible: 0`, AND IT WAS
				WRONG IN A WAY WORTH WRITING DOWN. At 1440px the collapsed
				rail is not `display: none` -- it is `translateX(calc(-100% -
				1.5rem))` plus `pointer-events: none`, so it keeps a real
				232px box, entirely off the left edge of the viewport, and
				`isVisible` correctly reports it as painted. The ceiling
				therefore reddened on a rail that is behaving exactly as
				designed. `isVisible` does not model "outside the viewport"
				and must not be taught to: `tapReach` already reports
				off-screen sample points as a harness artefact, so changing
				that predicate would move readings on routes this bundle does
				not own. The effect is what gets asserted instead.
			*/
			{ selector: '.gt-tree', label: 'FeatureManager rail, present (display:none at 375, slid off the left edge at 1440)', expectPresent: 1, expectVisible: 0 },
			{ selector: '.gt-tree[aria-hidden="true"]', label: 'collapsed rail hidden from assistive tech', expectPresent: 1, expectVisible: 0 },
			/*
				The tab is `display: none` below 1440px along with the rail it
				reveals, so `expectVisible: 0` is the width-safe floor and the
				printed count is the reading: 0 at 375, 1 at 1440.
			*/
			{ selector: '.gt-tree-tab', label: 'the rail’s reveal tab (display:none below 1440px: 0 visible at 375, 1 at 1440)', expectPresent: 1, expectVisible: 0 },
			/*
				`cursor: none` is applied by CursorLayer adding `.gt-cursor-on`
				to `.gt-root`, and it must not be applied until the first real
				mousemove has seeded the reticle a position -- otherwise there
				is a window in which the native cursor is hidden and nothing
				has replaced it. The harness never moves the mouse before
				measuring, so the class must be absent here.
			*/
			{ selector: '.gt-root.gt-cursor-on', label: 'native cursor NOT hidden before the first mousemove', expectPresent: 0, expectVisible: 0 },
			{ selector: '.gt-cursor-layer', label: 'cursor layer mounted', expectPresent: 1 },
			/*
				The countdown renders NOTHING when inactive, which is its state
				on every page that is not mid-room-start. Absence is the
				mechanism; the alias below is its positive control.
			*/
			{ selector: '.gt-countdown', label: 'countdown overlay, inactive', expectPresent: 0, expectVisible: 0 }
		],
		contrast: [
			{ selector: '.gt-tm p', label: 'trademark disclaimer copy', min: 4.5 },
			{ selector: '.harness h1', label: 'h1 on the VIEWPORT plate', min: 4.5 }
		],
		/*
			THE HIT TEST IS THE HIGHEST-VALUE ROW ON THIS ROUTE. `.gt-cursor-layer`
			is `position: fixed; inset: 0; z-index: 900` -- it covers the entire
			viewport of every GAUNTLET page. It is `pointer-events: none`, and if
			that ever stopped being true the whole section would go unclickable
			with nothing on screen looking wrong and no console error. The probe
			asks the DOM what a tap at the centre of a control actually lands on.
		*/
		orderResult: [
			/*
				"HIDDEN BY DEFAULT" AS THE EFFECT, NOT AS A PROXY FOR IT. The
				rail is unreachable at 375 because it is `display: none`, and
				unreachable at 1440 because it is translated off the left edge
				with `pointer-events: none`. Those are two different
				mechanisms producing one guarantee, and a probe that asked
				about either mechanism would be width-dependent and would go
				green the day the other one changed. This one samples the
				rail's own box, clamped into the viewport, and asks the DOM
				what a pointer at each point actually lands on -- so a rail
				that started painting itself open, by any means, comes back
				'reachable' at both widths.
			*/
			{
				label: 'the FeatureManager rail cannot be reached by a pointer on arrival',
				evaluate:
					'() => { const rail = document.querySelector(".gt-tree"); if (!rail) return ["NO RAIL"]; const r = rail.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return ["unreachable"]; const xs = [0.1, 0.5, 0.9].map((f) => r.left + r.width * f); const ys = [0.1, 0.5, 0.9].map((f) => r.top + r.height * f); for (const x of xs) { for (const y of ys) { if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue; const hit = document.elementFromPoint(x, y); if (hit && (hit === rail || rail.contains(hit))) return ["reachable"]; } } return ["unreachable"]; }',
				expected: ['unreachable']
			},
			{
				label: 'a tap reaches the page through the full-viewport cursor layer',
				evaluate:
					'() => { const b = document.querySelector(\'[data-testid="under-overlay"]\'); if (!b) return ["NO CONTROL"]; b.scrollIntoView({ block: "center", behavior: "instant" }); const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return [hit ? (hit.getAttribute("data-testid") || hit.className || hit.tagName) : "NOTHING"]; }',
				expected: ['under-overlay']
			}
		],
		tapTargets: [{ selector: '.harness .bar button', label: 'harness controls', min: 44 }]
	},
	{
		path: '/dev/gauntlet-shell-countdown',
		label: 'GAUNTLET viewport chrome, room-start countdown armed',
		aliasOf: '/dev/gauntlet-shell',
		/*
			The countdown is a 3-2-1-BUILD sequence that tears itself down at
			3.7s, so this variant asserts only what can be read inside that
			window and nothing that needs a long settle. That is a real limit,
			not a shortcut: the numeral is painted with `background-clip: text`
			over `color: transparent`, so it HAS no computed foreground colour
			and a contrast row on it would report the transparent value and
			pass vacuously. It is deliberately absent.

			What is worth reading is that the overlay is inert while it covers
			the page: `pointer-events: none` and `aria-hidden`, over a full
			`position: fixed; inset: 0` box at z-index 800.
		*/
		prepare: [
			{
				click: '[data-drive="countdown"]',
				until: '() => !!document.querySelector(".gt-countdown .numeral")',
				attempts: 6,
				waitMs: 120
			}
		],
		settleMs: 150,
		presence: [
			{ selector: '.gt-countdown', label: 'countdown overlay, armed', expectPresent: 1, expectVisible: 1 },
			{ selector: '.gt-countdown .numeral', label: 'the numeral currently on screen', expectPresent: 1, expectVisible: 1 },
			/*
				The overlay is decoration over a server-authoritative clock and
				announces nothing; it carries aria-hidden on its root, so the
				count reads 1 rather than 0.
			*/
			{ selector: '.gt-countdown[aria-hidden="true"]', label: 'overlay hidden from assistive tech', expectPresent: 1 }
		],
		orderResult: [
			{
				label: 'a tap reaches the page THROUGH the armed countdown overlay',
				evaluate:
					'() => { const b = document.querySelector(\'[data-testid="under-overlay"]\'); if (!b) return ["NO CONTROL"]; b.scrollIntoView({ block: "center", behavior: "instant" }); const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return [hit ? (hit.getAttribute("data-testid") || hit.className || hit.tagName) : "NOTHING"]; }',
				expected: ['under-overlay']
			}
		],
		contrast: [],
		tapTargets: []
	},
	{
		path: '/dev/gauntlet-run',
		label: 'GAUNTLET run surfaces -- RunResults in four verdict states, SpeedrunClock in three',
		/*
			RunResults is the post-run screen for ALL SIX MODES and SpeedrunClock
			is on screen for the whole of every ranked run. Neither was reachable
			from any dev route.

			THE FLOURISH IS AN EXCLUSION WITH A POSITIVE CONTROL IN THE SAME
			MEASUREMENT. `celebrate` is `firstClear || beatPb`, so it must fire
			on exactly two of the four mounts. A clear that was SLOWER than the
			standing personal best is still a clear, and a regression that
			derived the flourish from `correct` alone would congratulate a
			student for going backwards -- and would look completely fine on
			screen. `present 2` over four mounts is the assertion; `present 4`
			for the results themselves is what stops it passing on a page that
			rendered two results.
		*/
		presence: [
			{ selector: '.run-results', label: 'the four verdict mounts', expectPresent: 4, expectVisible: 4 },
			{ selector: '.run-results.celebrate', label: 'celebrating results (first clear + PB beaten ONLY)', expectPresent: 2, expectVisible: 2, maxVisible: 2 },
			{ selector: '.pb-flash', label: 'the flourish banner, one per celebrating result', expectPresent: 2, expectVisible: 2, maxVisible: 2 },
			{ selector: '.result-banner.no', label: 'the not-cleared banner', expectPresent: 1, expectVisible: 1, maxVisible: 1 },
			{ selector: '.sr-clock', label: 'the three clock states', expectPresent: 3, expectVisible: 3 },
			/*
				STANDBY is the state between pressing reveal and the SolidWorks
				Start macro firing -- `running` true, `serverStartMs` still
				null -- and it is the one nothing else in the repo renders. It
				must be exactly one of the three, and the live ranked clock
				must NOT be wearing it.
			*/
			{ selector: '.sr-clock.standby', label: 'standby treatment, ranked-armed-but-not-started', expectPresent: 1, expectVisible: 1, maxVisible: 1 },
			{ selector: '.sr-clock.unranked', label: 'the calmer unranked variant', expectPresent: 1, expectVisible: 1, maxVisible: 1 }
		],
		textContains: [
			/*
				The three clock labels are the student's only statement of what
				the run is worth. STANDBY and REC . RANKED are different claims
				about the same ranked clock and the fixture renders both, so
				the presence of one is not evidence of the other.
			*/
			{
				selector: '.sr-clock .sr-rec',
				label: 'clock status labels across the three states',
				must: ['STANDBY', 'REC . RANKED', 'UNRANKED']
			},
			/*
				XP comes from `xpForRun`, whose arithmetic is pinned in
				tests/gauntlet-progression.test.ts. What is asserted HERE is
				only what reaches the screen: the first-attempt first-clear
				mount is worth 15 + 120, and a repeat run of an
				already-cleared challenge banks nothing and must say so rather
				than printing "+0 XP".
			*/
			{
				selector: '[data-mount="first clear"] .run-results',
				label: 'first clear reports the run XP it earned',
				must: ['+135 XP']
			},
			{
				selector: '[data-mount="cleared slower"] .run-results',
				label: 'an already-banked run says so instead of printing +0',
				must: ['Already banked for this one'],
				mustNot: ['+0 XP']
			}
		],
		contrast: [
			{ selector: '.result-verdict', label: 'run verdict', min: 4.5 },
			{ selector: '.result-detail .key', label: 'result field labels', min: 4.5 },
			{ selector: '.result-detail .val', label: 'result field values', min: 4.5 },
			/*
				The ranked clock's chrome is the one place in GAUNTLET that
				paints crimson-adjacent ink as a matter of course (REC . RANKED
				is the live/rec reservation, legitimately). It is small mono
				type at 0.58rem on `--bg2`, which is exactly the shape of thing
				that is authored by eye and never measured.
			*/
			/*
				`:not(.standby)` IS LOAD-BEARING. The standby clock is ALSO
				`.ranked` -- standby is a state of a ranked clock, not a
				fourth kind -- so the bare descendant selector matched both
				labels and reported the WORSE of the two under the REC row's
				name, while the STANDBY row beneath reported the same figure
				again. Two rows measuring one element is how a real finding
				gets counted twice and its actual owner never named.
			*/
			{ selector: '.sr-clock.ranked:not(.standby) .sr-rec', label: 'REC . RANKED label on the clock plate', min: 4.5 },
			{ selector: '.sr-clock.unranked .sr-rec', label: 'UNRANKED label on the clock plate', min: 4.5 },
			{ selector: '.sr-clock.standby .sr-rec', label: 'STANDBY label on the clock plate', min: 4.5 }
		],
		tapTargets: [{ selector: '.run-results .btn-row .btn', label: 'post-run actions (retry / next / back)', min: 44 }]
	}
];

export function selectRoutes(filter) {
	if (!filter || filter.length === 0) return ROUTES;
	return ROUTES.filter((r) => filter.some((f) => r.path.includes(f) || (r.label ?? '').includes(f)));
}

/** The URL to visit for a spec (an aliased spec measures a different state of the same route). */
export const urlFor = (spec) => spec.aliasOf ?? spec.path;

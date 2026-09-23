/**
 * TEAMS THAT PERSIST: the count-mode draw, and the saved-teams panel that keeps
 * one, measured in a real browser at 375 and 1440.
 *
 * WHY THIS NEEDS A BROWSER. Both halves are CONDITIONAL on interaction state
 * that does not exist in the server-rendered markup. Count mode's number input
 * only exists once the radio has been changed; the saved-teams panel only
 * exists once its tool is opened, and its contents arrive from an `$effect`
 * that calls an injected transport -- an effect never runs under
 * `svelte/server`, and `tests/dom/` has no layout engine, so neither the
 * geometry nor the contrast below is reachable from a cheaper instrument.
 *
 * THE EFFECT IS ITSELF UNDER TEST HERE, which is the part worth saying. The
 * harness's teams transport deliberately reads and writes `$state` and appends
 * to a `$state` log -- the exact shape that makes an un-`untrack`ed effect
 * loop with `effect_update_depth_exceeded` on mount. The production transport
 * is a plain Supabase call with no reactivity in it, so a spun effect would
 * never show up in production and would never show up in the node suite
 * either. If the `untrack` in `PeoplePanel` is removed, THIS is what goes red,
 * by way of the panel never rendering at all.
 *
 * THE NEGATIVE CONTROLS ARE HALF THE VERDICTS. A posted draw and an unposted
 * one are both in the fixture and are asserted to read DIFFERENTLY; a student
 * who has left the class is asserted PRESENT in the team rather than absent
 * from it, which is the whole difference between the left join this feature
 * has and the inner join every other presence read in this app has; and the
 * style controls are asserted ABSENT, because the harness omits the `style`
 * transport and absence is the mechanism that removes them.
 *
 * EVERY BACKSLASH IN AN `evaluate` TEMPLATE IS DOUBLED, AND IT HAS TO BE. These
 * sources are template literals, where `\\s` is just the letter `s` and `\\d` is
 * just `d` -- so a regex written `/\\s+/` arrives in the browser as `/s+/` and
 * silently normalises runs of the letter S instead of runs of whitespace. That
 * is not a syntax error and nothing warns: the first run of this spec reported
 * false for a sentence that was on screen and correct, because the normaliser
 * had turned "Build teams" into "Build team ". The tell is an assertion that
 * fails on text a DEBUG print shows to be exactly right.
 *
 * THE COUNT-MODE CLAMP IS ASSERTED AS A SENTENCE, NOT A TEAM COUNT. Asking for
 * more teams than there are students is clamped rather than padded with empty
 * cards, and a clamp nobody is told about reads as the control being ignored.
 */
export default {
	path: '/dev/instructor-tools?tool=teams',
	label: 'Teams: a count-mode draw, and a saved set that can be posted and exported',
	aliasOf: '/dev/instructor-tools',
	prepare: [
		/* --- half one: count mode in the picker ------------------------- */
		{
			click: '[data-testid="tool-picker"]',
			until: '() => !!document.querySelector("[data-testid=\'picker-panel\']")'
		},
		{
			/* The number input does not exist until the mode moves, which is why
			   a server render cannot reach this at all. */
			click: '[data-testid="picker-mode-count"]',
			until: '() => !!document.querySelector("[data-testid=\'picker-team-count\']")'
		},
		{
			/* MEASURED HERE, NOT IN `tapTargets`, because opening the teams panel
			   CLOSES the picker -- one open panel at a time is this page's own
			   rule -- so by the time the measurement phase runs the radio is not
			   on screen. A `tapTargets` entry for it would match nothing and
			   report "0 matched", which is the shape of result that looks like a
			   pass to a skim. Taking the box while it is genuinely visible is the
			   honest reading. */
			evaluate: `() => {
				const label = document.querySelector('[data-testid="picker-mode-count"]').closest('label');
				const r = label.getBoundingClientRect();
				window.__radioBox = [r.width, r.height];
				return 'radio label ' + Math.round(r.width) + 'x' + Math.round(r.height);
			}`
		},
		{
			evaluate: `() => {
				const el = document.querySelector('[data-testid="picker-team-count"]');
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
				setter.call(el, '7');
				el.dispatchEvent(new Event('input', { bubbles: true }));
				return 'asked for 7 teams';
			}`
		},
		{
			click: '[data-testid="picker-draw"]',
			until: '() => !!document.querySelector("[data-testid=\'picker-teams\']")'
		},
		{
			evaluate: `() => {
				window.__countTeams = [...document.querySelectorAll('[data-testid="picker-teams"] .picker-team')]
					.map((t) => t.querySelectorAll('li').length);
				return 'teams: ' + window.__countTeams.join('/');
			}`
		},
		/* --- half two: the saved-teams panel ---------------------------- */
		{
			click: '[data-testid="tool-teams"]',
			until: '() => !!document.querySelector("[data-testid=\'teams-panel\']")'
		},
		{
			/* The board arrives from the effect's transport call, so the panel
			   exists before its contents do. Waiting on a SET rather than on the
			   panel is what tells a loaded board from a spun effect.
			
			   `waitFor` AND NOT A BARE `until`: `until` is read only by a step
			   that also ACTS, so a step carrying it alone is discarded and waits
			   for nothing. `tests/browser-verify-prepare-until.test.ts` caught
			   exactly that here, which is the defect that whole file exists for. */
			waitFor: '() => document.querySelectorAll("[data-testid=\'team-set\']").length >= 2'
		},
		{
			/* ARMED IN PREPARE, NOT INSIDE AN `orderResult`. Svelte settles
			   asynchronously, so a `.click()` followed by a synchronous read in
			   the same expression reads the DOM as it was BEFORE the click --
			   which is what the first run of this spec did, and it reported all
			   three sub-assertions false for a control that works. A prepare
			   step with an `until` is the only shape that waits. */
			click: '[data-testid="team-retire"]',
			until: '() => !!document.querySelector("[data-testid=\'team-retire-note\']")'
		}
	],
	orderResult: [
		{
			/* A CONTROL WRAPPED IN A LABEL IS MEASURED AT THE LABEL, which is
			   what a finger actually hits. The radio itself is smaller; the
			   44px floor lives on `.team-mode-opt`. */
			label: 'the Number of teams radio clears 44px where a finger lands on it',
			evaluate: '() => { const b = window.__radioBox || [0, 0]; return [String(b[1] >= 44), String(b[0] > 0)]; }',
			expected: ['true', 'true']
		},
		{
			label: 'count mode gives exactly the number of teams asked for, balanced within one',
			evaluate: `() => {
				const sizes = window.__countTeams || [];
				return [
					String(sizes.length === 7),
					String(sizes.length > 0 && Math.max(...sizes) - Math.min(...sizes) <= 1),
					String(sizes.every((n) => n > 0))
				];
			}`,
			expected: ['true', 'true', 'true']
		},
		{
			label: 'a posted draw and an unposted one read differently, and both say so in words',
			evaluate: `() => {
				const states = [...document.querySelectorAll('[data-testid="team-set-state"]')]
					.map((el) => (el.textContent || '').trim());
				return [
					String(states.length >= 2),
					String(states.some((t) => t.startsWith('Posted.'))),
					String(states.some((t) => t.startsWith('Not posted.'))),
					/* NEVER COLOUR ALONE: every state chip carries a full sentence. */
					String(states.every((t) => t.length > 10))
				];
			}`,
			expected: ['true', 'true', 'true', 'true']
		},
		{
			label: 'a student who left the class is still ON the team, with a word saying what moved',
			evaluate: `() => {
				const left = [...document.querySelectorAll('[data-testid="team-member-left"]')];
				const li = left[0]?.closest('li');
				/* TWO, not one: the fixture marks team 2's first member in BOTH
				   saved sets, so a departed student appears in the posted draw
				   and the unposted one. Counted from the fixture rather than
				   from what came out. */
				return [
					String(left.length === 2),
					/* The name is still there beside the label: the row was
					   annotated, not replaced. */
					String(!!li && li.textContent.replace(left[0].textContent, '').trim().length > 0),
					String((left[0]?.textContent || '').includes('no longer on the roster'))
				];
			}`,
			expected: ['true', 'true', 'true']
		},
		{
			label: 'the seed rides on every saved set, so a persisted draw is still checkable',
			evaluate: `() => {
				/* WHITESPACE-NORMALISED. textContent carries the template's own
				   line breaks and indentation, so a raw substring check against a
				   sentence that wraps in the source fails on whitespace rather
				   than on content -- which is what the first run of this spec
				   did, reporting false for a sentence that was on screen. */
				const seeds = [...document.querySelectorAll('[data-testid="team-set"] .team-seed')]
					.map((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim());
				return [
					String(seeds.length >= 2),
					String(seeds.every((t) => /seed \\d+/.test(t))),
					String(seeds.every((t) => t.includes('always gives this same result')))
				];
			}`,
			expected: ['true', 'true', 'true']
		},
		{
			/*
				THE SELECT'S CHOSEN OPTION IS READ BACK, not just its presence.
				A select bound to a value none of its options carries renders
				EMPTY -- no error, no warning, a blank box where a choice should
				be -- which is what this control did until a screenshot showed
				it. `selectedIndex` and the option's own text are the two reads
				that tell a working control from that one.
			*/
			label: 'the Post for control shows the option it is actually on',
			evaluate: `() => {
				const sel = document.querySelector('[data-testid="team-post-days"]');
				if (!sel) return ['no select'];
				return [
					String(sel.selectedIndex >= 0),
					String((sel.options[sel.selectedIndex]?.text || '').trim().length > 0),
					String(sel.options.length === 4)
				];
			}`,
			expected: ['true', 'true', 'true']
		},
		{
			label: 'a posted set offers Take down and an unposted one offers Post, never both on one set',
			evaluate: `() => {
				const sets = [...document.querySelectorAll('[data-testid="team-set"]')];
				const both = sets.filter(
					(s) => s.querySelector('[data-testid="team-post"]') && s.querySelector('[data-testid="team-unpost"]')
				);
				const neither = sets.filter(
					(s) => !s.querySelector('[data-testid="team-post"]') && !s.querySelector('[data-testid="team-unpost"]')
				);
				return [String(sets.length >= 2), String(both.length === 0), String(neither.length === 0)];
			}`,
			expected: ['true', 'true', 'true']
		},
		{
			label: 'no style control is offered, because the harness hands in no style transport',
			evaluate: `() => {
				const hint = document.querySelectorAll('.team-style-hint').length;
				/* THE POSITIVE CONTROL beside the absence: the styled team DID
				   render its decoration, so "no controls" is not "no teams". */
				/* TWO styled cards, not one: hasStyle is true for a team with
				   only an accent as well as for one with a background, and the
				   fixture has one of each. Only ONE carries a style_updated_by,
				   which is why the two numbers differ. */
				const styled = document.querySelectorAll('[data-testid="team-card"].has-style').length;
				const by = document.querySelectorAll('[data-testid="team-style-by"]').length;
				return [String(hint === 0), String(styled === 2), String(by === 1)];
			}`,
			expected: ['true', 'true', 'true']
		},
		{
			label: 'a student style is rendered through the shared tournament functions, not re-derived',
			evaluate: `() => {
				const card = document.querySelector('[data-testid="team-card"].has-style');
				if (!card) return ['no styled card'];
				const cs = getComputedStyle(card);
				const accent = cs.getPropertyValue('--team-accent').trim();
				const bg = cs.getPropertyValue('--team-bg').trim();
				return [
					String(/^#[0-9a-f]{6}$/i.test(accent)),
					String(bg.includes('gradient')),
					/* The ink is picked by bannerInk rather than chosen in the
					   component, so a dark gradient cannot end up with dark text. */
					String(cs.getPropertyValue('--team-ink').trim().length > 0)
				];
			}`,
			expected: ['true', 'true', 'true']
		},
		{
			label: 'retiring arms a confirm that names the draw and says the record is kept',
			evaluate: `() => {
				const note = document.querySelector('[data-testid="team-retire-note"]');
				const t = (note?.textContent || '').replace(/\\s+/g, ' ').trim();
				return [String(!!note), String(t.includes('Build teams')), String(t.includes('kept'))];
			}`,
			expected: ['true', 'true', 'true']
		}
	],
	presence: [
		{ selector: '[data-testid="teams-panel"]', label: 'the saved-teams panel', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="team-set"]', label: 'saved draws', expectPresent: 2, expectVisible: 2 },
		/* Three teams in the posted set plus two in the draft set. */
		{ selector: '[data-testid="team-card"]', label: 'team cards', expectPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="team-export"]', label: 'an Export control per draw', expectPresent: 2, expectVisible: 2 },
		/* The picker panel is CLOSED by opening this one: one open panel at a
		   time is this page's own rule, and a second open panel would push the
		   roster off a phone. */
		{ selector: '[data-testid="picker-panel"]', label: 'picker panel (closed by opening teams)', expectPresent: 0 },
		{ selector: '[data-testid="teams-unavailable"]', label: 'the no-0223 notice (must not show here)', expectPresent: 0 },
		{ selector: '[data-testid="teams-error"]', label: 'an error (must not show here)', expectPresent: 0 }
	],
	tapTargets: [
		{ selector: '[data-testid="tool-teams"]', label: 'the Saved teams tool', min: 44 },
		{ selector: '[data-testid="team-export"]', label: 'Export CSV', min: 44 },
		{ selector: '[data-testid="team-retire"]', label: 'Retire', min: 44 },
		{ selector: '[data-testid="team-post-days"]', label: 'the Post for select', min: 44 }
		/* The mode radio is NOT here: see the prepare step that measures it
		   while the picker is still open. */
	],
	contrast: [
		{ selector: '[data-testid="team-set"] h3', label: 'a saved draw title', min: 4.5 },
		{ selector: '[data-testid="team-set"] .team-seed', label: 'the seed line', min: 4.5 },
		{ selector: '[data-testid="team-set-state"]', label: 'the posting state sentence', min: 4.5 },
		{ selector: '[data-testid="team-member-left"]', label: 'the left-the-roster label', min: 4.5 },
		/* The one that a scoped palette most easily gets wrong: text sitting on
		   a STUDENT-CHOSEN gradient, inked by `bannerInk` rather than by this
		   component. */
		{ selector: '[data-testid="team-card"].has-style li', label: 'a member on a student-chosen background', min: 4.5 }
	]
};

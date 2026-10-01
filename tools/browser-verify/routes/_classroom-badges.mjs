/**
 * Shared pieces of the /dev/classroom-badges specs (ledger 0360, report R16).
 * `_`-prefixed, so `routes.mjs` does not load it as a route.
 *
 * WHAT A BROWSER IS FOR HERE. The art itself is asserted in
 * `tests/badge-art.test.ts` (every layer drawn, the gear's teeth counted, the
 * stylesheet swept for a looping or ungated animation). What only a browser
 * can say: that each emblem's ink clears the 3:1 graphical floor on the ground
 * it actually sits on (and 2:1 under the projector wash), that the `once`
 * beat RUNS, one iteration, and ENDS on the rest frame, that a hover-mode
 * badge moves only when its own key is focused, that a badge nothing can press
 * never moves, and that under `reduce` nothing does.
 */

/** Every emblem at four sizes, the eight keys and the eight once badges have painted. */
export const READY = `() => document.querySelectorAll('[data-testid="badge-cell"] svg').length === 32 && document.querySelectorAll('[data-testid="badge-key"] svg').length === 8 && document.querySelectorAll('[data-testid="badge-once"] svg').length === 8`;

/**
 * THE ONCE BEAT, MEASURED. Press Replay (which remounts the row, the way a
 * first view mounts it) through a retried click whose `until` is the remount
 * itself -- the page is server-rendered, so a press before hydration does
 * nothing, and a probe that read right after an unhydrated press would report
 * "not running" about a beat nobody started. Then read what is attached, wait
 * past the longest beat, and read again. Stored on `window` for the verdict
 * rows below, and printed as the step's own measurement.
 */
const REPLAY = {
	click: '[data-testid="badge-replay"]',
	until: `() => Number(document.querySelector('[data-testid="badge-once-row"]')?.dataset.replays) >= 1`,
	label: 'press Replay and the once row remounts',
	waitMs: 0
};
const ONCE_PROBE = {
	label: 'the once beat starts, runs one iteration, and ends on the rest frame',
	evaluate: `async () => {
		const read = () => {
			const row = document.querySelector('[data-testid="badge-once-row"]');
			const anims = row ? row.getAnimations({ subtree: true }) : [];
			const arts = row ? [...row.querySelectorAll('.b-art')] : [];
			return {
				running: anims.length,
				iterations: [...new Set(anims.map((a) => a.effect.getTiming().iterations))],
				infinite: anims.filter((a) => a.effect.getTiming().iterations === Infinity).length,
				artsMoved: arts.filter((g) => getComputedStyle(g).transform !== 'none').length,
				arts: arts.length
			};
		};
		const start = read();
		await new Promise((r) => setTimeout(r, 1800));
		const end = read();
		window.__badgeOnce = { start, end };
		return 'just after replay: ' + JSON.stringify(start) + ' | after 1.8s more: ' + JSON.stringify(end);
	}`
};

/**
 * HOVER MODE ANSWERS ITS OWN KEY ONLY. Focus one key from script (no pointer
 * has moved, so it is `:focus-visible`), count the animations attached inside
 * each key's svg -- the svg, never the key, whose own transitions would count
 * too -- then blur.
 */
const FOCUS_PROBE = {
	label: 'focus the Star key: its badge beats, no other key s badge moves',
	evaluate: `async () => {
		const keys = [...document.querySelectorAll('[data-testid="badge-key"]')];
		const star = keys.find((k) => k.dataset.badge === 'star');
		star.focus();
		await new Promise((r) => setTimeout(r, 60));
		const counts = keys.map((k) => k.dataset.badge + ':' + k.querySelector('svg').getAnimations({ subtree: true }).length);
		const visible = star.matches(':focus-visible');
		star.blur();
		window.__badgeFocus = { counts, visible };
		return 'focus-visible=' + visible + ' ' + counts.join(' ');
	}`
};

export const IGNORE = ['Failed to load resource: net::ERR_FAILED'];

/** The spec for one theme: `query` is '' or '?theme=...'. */
export function badgeSpec({ query = '', label }) {
	return {
		path: '/dev/classroom-badges' + query,
		label,
		ignoreConsole: IGNORE,
		prepare: [
			{ waitFor: READY, label: 'every emblem, key and once badge has painted' },
			/* Focus first: a pointer press (Replay) makes the next scripted focus
			   a mouse focus, which is not :focus-visible. */
			FOCUS_PROBE,
			REPLAY,
			ONCE_PROBE
		],
		presence: [
			{ selector: '[data-testid="badge-cell"] svg', label: 'every emblem at the four site sizes (8 x 4)', expectPresent: 32, maxPresent: 32, expectVisible: 32 },
			{ selector: '[data-testid="badge-key"]', label: 'a plate key per emblem', expectPresent: 8, maxPresent: 8, expectVisible: 8 },
			{ selector: '[data-testid="badge-key"][aria-pressed="true"]', label: 'exactly one key pressed', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
			{ selector: '[data-testid="badge-once"] svg', label: 'a once badge per emblem', expectPresent: 8, maxPresent: 8, expectVisible: 8 },
			/* Every layer is there, every size: an emblem is more than one stroke. */
			{ selector: '[data-testid="badge-cell"] .b-face', label: 'the recessed faces (14 per size, 4 sizes)', expectPresent: 56, maxPresent: 56 },
			{ selector: '[data-testid="badge-cell"] .b-line', label: 'the outlines (10 per size, 4 sizes)', expectPresent: 40, maxPresent: 40 }
		],
		contrast: [
			/* A glyph is a graphical object: 3:1 against the ground it sits on. */
			{ selector: '[data-testid="badge-cell"] svg', label: 'every emblem, on the card', min: 3 },
			{ selector: '[data-testid="badge-key"] svg', label: 'every emblem, on its key', min: 3 },
			{ selector: '[data-testid="badge-once"] svg', label: 'every once emblem, on the card', min: 3 },
			{ selector: '[data-testid="badge-cell"] svg', label: 'every emblem on the card, under the projector wash', min: 2, projector: true },
			{ selector: '[data-testid="badge-key"] svg', label: 'every emblem on its key, under the projector wash', min: 2, projector: true },
			{ selector: '[data-testid="badge-key"] span', label: 'the key words', min: 4.5 }
		],
		tapTargets: [
			{ selector: '[data-testid="badge-key"]', label: 'the badge keys', min: 44 },
			{ selector: '[data-testid="badge-replay"]', label: 'Replay', min: 44 }
		],
		orderResult: [
			{
				label: 'the once beat: running at replay, one iteration each, none infinite, and nothing left moving after',
				evaluate: `() => { const o = window.__badgeOnce; if (!o) return ['NO PROBE']; return [o.start.running > 0 ? 'running' : 'NOT RUNNING', JSON.stringify(o.start.iterations), 'infinite=' + o.start.infinite, 'after=' + o.end.running, 'moved after=' + o.end.artsMoved + '/' + o.end.arts]; }`,
				expected: ['running', '[1]', 'infinite=0', 'after=0', 'moved after=0/8']
			},
			{
				label: 'focus moves the focused key s badge and no other',
				evaluate: `() => { const f = window.__badgeFocus; if (!f) return ['NO PROBE']; const n = (id) => Number((f.counts.find((c) => c.startsWith(id + ':')) || ':-1').split(':')[1]); const others = f.counts.filter((c) => !c.startsWith('star:') && !c.startsWith('gear:')).map((c) => Number(c.split(':')[1])); return ['focus-visible=' + f.visible, n('star') > 0 ? 'star beats' : 'STAR STILL', others.every((x) => x === 0) ? 'others still' : 'OTHERS MOVED ' + others.join(',')]; }`,
				expected: ['focus-visible=true', 'star beats', 'others still']
			}
		],
		/* A badge nothing can press never moves, in either media state. The
		   reduced-motion half of a beat that DOES run is
		   classroom-badges-replay-loop.mjs, which keeps one running for the
		   sweep to find. (Pausing a beat from script to hold it is not an
		   instrument: measured, Chromium keeps a script-paused CSS animation
		   attached after its rule stops applying, so it reads as "still
		   animating" under reduce for a reason that is the probe's, not the
		   page's.) */
		motion: [{ selector: '[data-testid="badge-cell"] .b-art', label: 'a badge outside any control', expect: 'never' }]
	};
}

/**
 * THE REDUCED-MOTION SWEEP, ON A BEAT THAT IS GENUINELY RUNNING. The sweep runs
 * last and discovers what animates by asking each element, and a once beat has
 * long finished by then -- so `?replay=loop` makes the HARNESS (never the
 * component) remount the once row every 700ms, shorter than the 1.2s draw and
 * beat, so a beat is always in flight when the sweep reads. Under `reduce` the
 * stylesheet's gate must leave every one of them still and painted.
 */
export function replayingSpec({ query = '', label }) {
	return {
		path: '/dev/classroom-badges?replay=loop' + query,
		label,
		ignoreConsole: IGNORE,
		prepare: [
			{ waitFor: READY, label: 'every emblem, key and once badge has painted' },
			/* The loop is an effect, so it runs only once the page has hydrated;
			   two remounts are the proof it is running before the sweep reads. */
			{ waitFor: `() => Number(document.querySelector('[data-testid="badge-once-row"]')?.dataset.replays) >= 2`, label: 'the harness loop is replaying the once row' }
		],
		presence: [{ selector: '[data-testid="badge-once"] svg', label: 'a once badge per emblem, replaying', expectPresent: 8, maxPresent: 8, expectVisible: 8 }],
		motion: [
			{ selector: '[data-testid="badge-once"] .b-art', label: 'the once beat (art)', expect: 'gated' },
			{ selector: '[data-testid="badge-once"] .b-line', label: 'the once draw (outlines)', expect: 'gated' },
			{ selector: '[data-testid="badge-once"] .b-face', label: 'the once fill (faces)', expect: 'gated' },
			{ selector: '[data-testid="badge-cell"] .b-art', label: 'a badge outside any control', expect: 'never' }
		]
	};
}

// original array position 24 of 25 -- see ../README.md for what `order` means
export const order = 24;

export default {
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
};

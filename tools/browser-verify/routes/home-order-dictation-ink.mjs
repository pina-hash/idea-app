/* THE GREY OF WORDS STILL BEING HEARD, AGAINST THE PLATED FIELD, IN EVERY SITE
   THEME. The report box's own harness (`/dev/feedback`) is not plated, so its
   ghost row measures the box's unplated field. On a plated page `plate.css`
   paints every textarea with a gradient over a colour, and the box opens from
   the shell's own report control on any page; this opens it over a plated dev
   route and composites `--dg-ink` (the ink `DictationGhost` draws the guess
   in) against the message field's OWN computed colour and every gradient stop,
   once per site theme, restoring the theme afterwards. No guess has to be on
   screen: the ink and the ground are both read off the real elements. */
const PROBE = `() => {
	const par = (c) => { const m = String(c).match(/[\\d.]+/g); return m ? m.map(Number) : null; };
	const lum = (p) => { const f = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]); };
	const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
	const over = (fg, bg) => { const a = fg.length > 3 ? fg[3] : 1; return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)); };
	const area = document.querySelector('#fb-msg');
	const box = document.querySelector('.fb-box');
	if (!area || !box) return ['NO REPORT BOX OPEN'];
	const root = document.documentElement;
	const before = root.getAttribute('data-theme');
	const out = [];
	for (const theme of [null, 'matrix', 'space-white']) {
		if (theme === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
		const probe = document.createElement('span');
		probe.style.color = 'var(--dg-ink, var(--text-2))';
		box.appendChild(probe);
		const ink = par(getComputedStyle(probe).color);
		probe.remove();
		let n = area.parentElement, under = [0, 0, 0];
		while (n && n !== document.documentElement) { const c = par(getComputedStyle(n).backgroundColor); if (c && (c.length < 4 || c[3] > 0.9)) { under = c.slice(0, 3); break; } n = n.parentElement; }
		const cs = getComputedStyle(area);
		const base = par(cs.backgroundColor);
		const field = base ? over(base, under) : under;
		const stops = [...String(cs.backgroundImage).matchAll(/rgba?\\([^)]+\\)/g)].map((m) => over(par(m[0]), field));
		const grounds = [field, ...stops];
		let worst = 99;
		for (const g of grounds) worst = Math.min(worst, ratio(over(ink, g), g));
		out.push((theme ?? 'idea') + ': ' + grounds.length + ' ground(s), worst ' + worst.toFixed(2) + ':1 ' + (worst >= 4.5 ? 'clears 4.5' : 'FAILS 4.5'));
	}
	if (before === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', before);
	return out;
}`;

export default {
	path: '/dev/home-order?dictation=ink',
	label: 'Report box over a plated page: the dictation guess ink against the plated message field, every theme',
	prepare: [
		{
			click: '.sfb-shell .sfb-trigger',
			until: '() => { const t = document.querySelector("#fb-msg"); return !!t && t.getBoundingClientRect().height > 0; }',
			attempts: 8,
			waitMs: 300
		}
	],
	presence: [
		{
			selector: '.site-plate .fb-box #fb-msg',
			label: 'the message field, inside the site plate (the plated case this spec exists for)',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		}
	],
	orderResult: [
		{
			label: 'the guess ink clears 4.5:1 on the plated field in all three themes',
			evaluate: PROBE,
			/* MEASURED, written down so a regression moves it rather than merely
			   staying above the floor: each theme's lightest gradient stop is the
			   ground that governs. */
			expected: [
				'idea: 3 ground(s), worst 6.82:1 clears 4.5',
				'matrix: 3 ground(s), worst 7.29:1 clears 4.5',
				'space-white: 3 ground(s), worst 7.76:1 clears 4.5'
			]
		}
	]
};

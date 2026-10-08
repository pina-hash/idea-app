import { SETTLE_ENTRANCE } from './_shared.mjs';
import { reach } from './_home-theme.mjs';

/**
 * THE HOME PAGE'S PARTICLES UNDER SPACE WHITE: NONE (Mr. Pina, 2026-10-07:
 * "there shouldn't be any floating particles in the background for the IDEA
 * white theme"). This reverses his 2026-09-29 answer, which had kept the field
 * here in the brand green with no glow, and this spec used to gate that.
 *
 * WHAT IS MEASURED: the theme is reached through the shipping profile-menu
 * control; the canvas then has no box, its frame loop has stopped (`paused`),
 * and after the probe clears the canvas and waits, NOTHING has been painted
 * into it -- a field still running would repaint within the wait. Then the
 * same probe with the attribute set to Matrix and to IDEA, the two controls:
 * Matrix still takes the canvas away, and IDEA paints exactly what it always
 * did -- the brand green, a blur of 4 and 35% opacity -- which is also the
 * positive control that the readback can see a painted field at all.
 */
const PIXELS = `async () => {
	const c = document.querySelector('#bg-canvas');
	if (!c) return ['NO CANVAS'];
	window.__particleInk = undefined;
	/* CLEAR FIRST, THEN WAIT FOR THE FIELD TO REPAINT. A canvas keeps its last
	   frame when its box is taken away, so a readback without this found the
	   IDEA dots the page drew before the theme switched, on a canvas that was
	   display:none -- a vacuous pass. Only a running field repaints. */
	c.getContext('2d').clearRect(0, 0, c.width, c.height);
	await new Promise((r) => setTimeout(r, 600));
	const cs = getComputedStyle(c);
	let painted = 0, rs = 0, gs = 0, bs = 0;
	try {
		const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
		for (let i = 0; i < d.length; i += 4) {
			if (d[i + 3] > 0) { painted++; rs += d[i]; gs += d[i + 1]; bs += d[i + 2]; }
		}
	} catch (e) { return ['READBACK FAILED ' + e.message]; }
	let hue = 'none';
	if (painted) {
		const r = rs / painted / 255, g = gs / painted / 255, b = bs / painted / 255;
		const max = Math.max(r, g, b), min = Math.min(r, g, b);
		let h = 0;
		if (max !== min) {
			if (max === g) h = 60 * ((b - r) / (max - min) + 2);
			else if (max === r) h = 60 * (((g - b) / (max - min)) % 6);
			else h = 60 * ((r - g) / (max - min) + 4);
		}
		h = (h + 360) % 360;
		hue = h >= 80 && h <= 160 ? 'green' : 'hue ' + Math.round(h);
		/* AND WHICH GREEN: the brand green (#78b870), not the theme's darker
		   ink (#3b6c36), which reads grey on this ground at the alphas a dot is
		   drawn at. Read off the unpremultiplied readback, so an edge pixel's
		   colour is the fill's. */
		const ink = [r * 255, g * 255, b * 255];
		const near = (t) => t.every((v, i) => Math.abs(v - ink[i]) <= 24);
		window.__particleInk = near([0x78, 0xb8, 0x70]) ? 'the brand green' : near([0x3b, 0x6c, 0x36]) ? 'the Space White green ink' : 'rgb ' + ink.map(Math.round).join(',');
	}
	window.__particles = 'display ' + cs.display + ', opacity ' + cs.opacity + ', ' + painted + ' painted pixels';
	return [
		'canvas display ' + (cs.display === 'none' ? 'none' : 'shown'),
		'opacity ' + cs.opacity,
		'particles ' + (c.dataset.particles ?? 'unstamped'),
		'blur ' + (c.dataset.particleBlur ?? 'unstamped'),
		painted > 0 ? 'dots painted' : 'NOTHING PAINTED',
		'hue ' + hue,
		'ink ' + (window.__particleInk ?? 'none')
	];
}`;

/** Set the attribute directly (a CSS-and-observer probe, not a theme choice), read, and put it back. */
const UNDER = (theme) => `async () => {
	const html = document.documentElement;
	const was = html.getAttribute('data-theme');
	if (${JSON.stringify(theme)} === 'idea') html.removeAttribute('data-theme'); else html.setAttribute('data-theme', ${JSON.stringify(theme)});
	await new Promise((r) => setTimeout(r, 120));
	const c = document.querySelector('#bg-canvas');
	const cs = getComputedStyle(c);
	const out = [
		'canvas display ' + (cs.display === 'none' ? 'none' : 'shown'),
		'opacity ' + cs.opacity,
		'colour ' + cs.getPropertyValue('--li-particle').trim().toLowerCase(),
		'blur ' + (c.dataset.particleBlur ?? 'unstamped')
	];
	if (cs.display !== 'none') {
		/* A theme that gives the canvas its box back restarts the loop: clear,
		   wait, and read back painted pixels. */
		c.getContext('2d').clearRect(0, 0, c.width, c.height);
		await new Promise((r) => setTimeout(r, 600));
		const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
		let n = 0;
		for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
		out.push('particles ' + (c.dataset.particles ?? 'unstamped'), n > 0 ? 'dots painted' : 'NOTHING PAINTED');
	}
	if (was === null) html.removeAttribute('data-theme'); else html.setAttribute('data-theme', was);
	await new Promise((r) => setTimeout(r, 120));
	return out;
}`;

export default {
	path: '/dev/home-order?role=student&classes=1&rows=3&state=particles-space-white',
	label: 'Home page particles under Space White: none, the loop stopped; IDEA and Matrix unchanged',
	prepare: [
		{ evaluate: SETTLE_ENTRANCE, waitMs: 150, label: 'settle the entrance' },
		...reach('space-white'),
		{ evaluate: `() => { const s = document.querySelector('.harness-strip'); if (s) s.style.display = 'none'; return 'harness strip hidden'; }`, label: 'the harness strip is not the page' },
		{
			evaluate: `async () => {
				const c = document.querySelector('#bg-canvas');
				if (!c) return 'no canvas';
				await new Promise((r) => setTimeout(r, 600));
				const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
				let n = 0;
				for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
				return 'canvas ' + c.width + 'x' + c.height + ', ' + n + ' painted pixels, computed opacity ' + getComputedStyle(c).opacity + ' (printed, never pinned)';
			}`,
			label: 'how much of the field is on the canvas'
		}
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'the Space White attribute is on <html>', expectPresent: 1, maxPresent: 1 },
		{ selector: '.legacy-index #bg-canvas', label: 'the particle canvas is in the page and NOT visible', expectPresent: 1, maxPresent: 1, expectVisible: 0, maxVisible: 0 },
		{ selector: '.legacy-index #bg-canvas[data-particles="paused"]', label: 'its frame loop has stopped', expectPresent: 1, maxPresent: 1, expectVisible: 0, maxVisible: 0 }
	],
	orderResult: [
		{
			label: 'under Space White the field is gone: no box, the loop stopped, and nothing painted after a clear and a wait',
			evaluate: PIXELS,
			expected: ['canvas display none', 'opacity 0.35', 'particles paused', 'blur 4', 'NOTHING PAINTED', 'hue none', 'ink none']
		},
		{
			label: 'control: under IDEA the field is exactly what it was (brand green, blur 4, 35%), and the loop restarts',
			evaluate: UNDER('idea'),
			expected: ['canvas display shown', 'opacity 0.35', 'colour #78b870', 'blur 4', 'particles running', 'dots painted']
		},
		{
			label: 'control: under Matrix the field is still taken away (the rain is that theme\'s field)',
			evaluate: UNDER('matrix'),
			expected: ['canvas display none', 'opacity 0.35', 'colour #78b870', 'blur 4']
		}
	]
};

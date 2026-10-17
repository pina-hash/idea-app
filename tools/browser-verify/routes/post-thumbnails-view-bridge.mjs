/**
 * THE BRIDGE, LIVE (ledger 0396): a live HTML thumbnail is told its slot's
 * size, its shape and the site theme whenever they change, and LAYS ITSELF OUT
 * again. The person's own Display settings choice drives the shape (the REAL
 * ClassroomSettings over the real preference store), a stylesheet change
 * resizes every slot, and the theme attribute moves; after each, the gear
 * fixture reports what it was told AND what it then drew (its gear's laid-out
 * height and whether its label shows), read off its own boxes inside the
 * sandboxed frame, which the page cannot reach into. Every read is of the
 * report the gear POST's own frame sent (`__thumbReportsByItem`), so another
 * post showing the same document cannot stand in for it.
 */
import { LIVE_READY, THUMBS, THUMBS_READY } from './_post-thumbnails.mjs';

/** Append the gear's last report, reduced to facts that do not depend on the window. */
const snap = (tag) => `() => {
	const r = ((window.__thumbReportsByItem ?? {})['as-gears'] ?? []).filter((x) => x.kind === 'state').at(-1);
	const s = r?.state, l = r?.layout;
	const facts = !s || !l ? 'nothing' : [
		${JSON.stringify(tag)},
		s.shape,
		s.scheme,
		'label ' + l.label,
		s.shape === 'wide'
			? 'gear is 52% of the slot ' + (Math.abs(l.gearH - s.height * 0.52) <= 1)
			: s.shape === 'banner'
				? 'gear ' + l.gearH + ' in a strip ' + s.height + ' high'
				: 'gear ' + l.gearH + ' in ' + s.width + 'x' + s.height
	].join(' | ');
	(window.__bridgeLog ??= []).push(facts);
	return facts;
}`;
const told = (pred) => `() => { const s = ((window.__thumbReportsByItem ?? {})['as-gears'] ?? []).filter((x) => x.kind === 'state').at(-1)?.state; return !!s && (${pred}); }`;
/* A frame whose row is further from the screen than the near margin is held
   and not drawn (`visibility: hidden` on a held frame, `.htf.away` in
   HtmlThumbnailFrame.svelte), and one that stays far away while the page is
   still is taken down and made again when its row comes back near. So each
   snapshot is taken with the gear on screen, as a reader would look at it. */
const inView = {
	evaluate: `() => { document.querySelector('[data-item-id="as-gears"] [data-testid="post-thumb"]').scrollIntoView({ block: 'center', behavior: 'instant' }); return 'the gear is on screen'; }`,
	waitMs: 500
};

export default {
	path: `${THUMBS}?view=bridge`,
	label: 'A live thumbnail re-lays itself out when the shape, the size and the theme change',
	prepare: [
		THUMBS_READY,
		LIVE_READY,
		{
			click: '[data-testid="settings-trigger"]',
			until: `() => !!document.querySelector('[data-testid="settings-option-display-wide"]')`,
			attempts: 20
		},
		{
			click: '[data-testid="settings-option-display-wide"]',
			until: `() => document.querySelector('.stream')?.getAttribute('data-thumbs') === 'wide'`,
			attempts: 20
		},
		{ waitFor: told(`s.shape === 'wide'`), timeoutMs: 15000 },
		inView,
		{ evaluate: snap('Display settings Wide'), waitMs: 50 },
		{
			click: '[data-testid="settings-option-display-banner"]',
			until: `() => document.querySelector('.stream')?.getAttribute('data-thumbs') === 'banner'`,
			attempts: 20
		},
		{ waitFor: told(`s.shape === 'banner'`), timeoutMs: 15000 },
		inView,
		{ evaluate: snap('Display settings Banner'), waitMs: 50 },
		{
			click: '[data-testid="settings-option-display-class"]',
			until: `() => document.querySelector('.stream')?.getAttribute('data-thumbs') === 'tile'`,
			attempts: 20
		},
		{
			click: '[data-testid="settings-close"]',
			until: `() => !document.querySelector('[data-testid="settings-option-display-wide"]')?.checkVisibility()`,
			attempts: 20
		},
		{ waitFor: told(`s.shape === 'tile'`), timeoutMs: 15000 },
		{
			evaluate: `() => { const st = document.createElement('style'); st.textContent = '.stream .row-wrap { --thumb-tile: 96px !important; }'; document.head.append(st); return 'tile slots resized to 96px'; }`
		},
		{ waitFor: told(`s.width === 96 && s.height === 96`), timeoutMs: 15000 },
		inView,
		{ evaluate: snap('A 96px tile'), waitMs: 50 },
		{ evaluate: `() => { document.documentElement.setAttribute('data-theme', 'space-white'); return 'space-white'; }` },
		{ waitFor: told(`s.scheme === 'light' && s.theme === 'space-white'`), timeoutMs: 15000 },
		inView,
		{ evaluate: snap('Space White'), waitMs: 50 }
	],
	orderResult: [
		{
			label: 'what the gear was told after each change, and what it drew',
			evaluate: `() => window.__bridgeLog ?? []`,
			expected: [
				'Display settings Wide | wide | dark | label true | gear is 52% of the slot true',
				'Display settings Banner | banner | dark | label true | gear 41 in a strip 56 high',
				'A 96px tile | tile | dark | label false | gear 71 in 96x96',
				'Space White | tile | light | label false | gear 71 in 96x96'
			]
		}
	],
	presence: [
		{ selector: '.stream[data-thumbs="tile"]', label: 'back on the class default, Tile', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="thumbs-mine"]', label: 'the harness says the choice', expectPresent: 1, maxPresent: 1 }
	]
};

/**
 * THE ADMIN CONSOLE ON SPACE WHITE (ledger 0360). `/dashboard` is a site-plate
 * page, so it is in the theme's scope now. The one thing on it that painted for
 * a dark ground only was the roster's pathway-tinted names: an INLINE `color`
 * of the pathway's dark-ground ink (IDEA's #00ff41 read 1.09:1 on the light
 * panel), which no theme rule can reach. They read both inks as hooks now and
 * take `inkOnLight` here, so this spec puts the six roster names first.
 *
 * THE THEME IS PINNED, as `ThemeRoot` would write it: the harness holds no
 * session. The `until` reads the body ink back, so a pin that did not take
 * fails the step.
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';

export default {
	path: '/dev/portal-admin?theme=space-white',
	aliasOf: '/dev/portal-admin',
	label: 'Admin console on Space White: the pathway-tinted roster names and every panel word',
	settleMs: 900,
	prepare: [
		{ evaluate: SETTLE_ENTRANCE, waitMs: 150 },
		{
			evaluate: `() => {
				const h = document.documentElement;
				const apply = () => { if (h.getAttribute('data-theme') !== 'space-white') h.setAttribute('data-theme', 'space-white'); };
				apply();
				const iv = setInterval(apply, 40);
				setTimeout(() => clearInterval(iv), 60000);
				const names = [...document.querySelectorAll('.roster-name.tinted')];
				return 'data-theme=' + h.getAttribute('data-theme') + '; ' + names.length + ' tinted roster name(s): ' + names.map((n) => getComputedStyle(n).color).join(' | ');
			}`,
			until: `() => document.documentElement.getAttribute('data-theme') === 'space-white'
				&& getComputedStyle(document.documentElement).getPropertyValue('--text-1').trim().toLowerCase() === '#0d1311'`,
			waitMs: 200
		}
	],
	presence: [
		{ selector: '[data-testid="admin-console"]', label: 'the console', expectPresent: 1, maxPresent: 1 },
		{ selector: '.panel[data-panel="roster"] .roster-name.tinted', label: 'roster names tinted by pathway (the case that failed)', expectPresent: 5, maxPresent: 6 }
	],
	contrast: [
		{ selector: '.roster-name', label: 'roster names, each in its pathway ink on light', min: 4.5 },
		{ selector: '.roster-email', label: 'roster emails', min: 4.5 },
		{ selector: '.panel-title', label: 'panel titles', min: 4.5 },
		{ selector: '.panel-blurb', label: 'panel blurbs', min: 4.5 },
		{ selector: '.chip-word', label: 'nav chip words', min: 4.5 },
		{ selector: '.chip-count', label: 'nav chip counts', min: 4.5 },
		{ selector: '.meta-count', label: 'panel counts', min: 4.5 },
		{ selector: '.frc-sum-meta', label: 'FRC completion summary', min: 4.5 },
		{ selector: '.ar-email', label: 'admin roster emails', min: 4.5 },
		{ selector: '.panel', label: 'panel edge on the plate', min: 3 }
	],
	tapTargets: [
		{ selector: '.console-nav .chip', label: 'nav chips', min: 44 },
		{ selector: '.panel .btn', label: 'panel buttons and links', min: 44 }
	]
};

import { SETTLE_ENTRANCE } from './_shared.mjs';

/**
 * A LINK HOVER RUNS NO SERVER LOAD; A TAP STILL DOES (ledger 0360, report R08).
 *
 * The site shipped the SvelteKit template's hover data preload: a pointer
 * resting on a link for 20ms fetched that route's `__data.json`, which runs the
 * hooks and every server load of the route -- about 18 database calls for
 * /classroom and 33 to 36 for an item page -- and every row of the home feed and
 * every launcher card is a link. The body now preloads DATA on tap
 * (mousedown or touchstart, about 100ms before the click lands) and CODE on
 * hover (the route's JS, which costs the database nothing).
 *
 * HOW. Count the `__data.json` resource entries, move a synthetic mouse over up
 * to six distinct same-origin links (resting 600ms on each, past the 20ms hover delay),
 * wait, count again. Then press the mouse down on a feed link that was not
 * hovered and count again: that is the positive control that preloading still
 * happens, at the moment a person commits to the link. On the old body the
 * hover row reads one load per link hovered.
 */
const HOVER = `async () => {
	const s = document.querySelector('.harness-strip');
	if (s) s.style.display = 'none';
	/* THE RESOURCE TIMELINE IS FULL BEFORE THIS RUNS. A dev page loads its
	   modules unbundled, several hundred of them, and the browser stops writing
	   entries at 250 by default -- so a count read off it says 0 for every
	   request after that, whatever happened. Emptied and widened first. */
	performance.clearResourceTimings();
	performance.setResourceTimingBufferSize(5000);
	const data = () => performance.getEntriesByType('resource').filter((e) => e.name.includes('__data.json')).length;
	const before = data();
	const seen = new Set();
	const links = [...document.querySelectorAll('.legacy-index a[href^="/"]')].filter((a) => {
		if (a.closest('.harness-strip') || a.closest('[data-tour="classes"]')) return false;
		const href = a.getAttribute('href');
		if (seen.has(href)) return false;
		seen.add(href);
		return true;
	}).slice(0, 6);
	/* A POINTER THAT RESTS: 600ms on each link, well past the 20ms hover delay.
	   Moving on sooner discards the previous preload from the one-slot cache
	   before a cold route's code has even arrived, which on the old body could
	   read 0 for a reason that has nothing to do with the policy. */
	for (const a of links) {
		a.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
		await new Promise((r) => setTimeout(r, 600));
	}
	/* A RESOURCE ENTRY IS WRITTEN WHEN A RESPONSE COMPLETES, and a cold dev
	   server compiles a route on its first request, so a short wait reads 0 for
	   loads that are still in flight (the first version of this probe did, on
	   the old body, with the requests sitting in the network log as aborted at
	   page close). So it waits up to ten seconds for any load to land. */
	const until = Date.now() + 10000;
	while (Date.now() < until && data() === before) await new Promise((r) => setTimeout(r, 250));
	return ['links hovered: ' + (links.length >= 4 ? 'at least 4' : links.length), 'data loads on hover: ' + (data() - before)];
}`;

const TAP = `async () => {
	const data = () => performance.getEntriesByType('resource').filter((e) => e.name.includes('__data.json')).length;
	const link = document.querySelector('[data-tour="classes"] a[href^="/"]');
	if (!link) return ['NO FEED LINK TO PRESS'];
	const before = data();
	link.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
	const until = Date.now() + 15000;
	while (Date.now() < until && data() === before) await new Promise((r) => setTimeout(r, 250));
	return ['data loads on tap: ' + (data() - before)];
}`;

export default {
	path: '/dev/home-order?role=student&classes=1&rows=3&state=preload',
	label: 'Home page links: hovering preloads no data, pressing still does',
	prepare: [
		{ evaluate: SETTLE_ENTRANCE, label: 'settle the entrance' },
		{
			waitFor: '() => document.querySelectorAll(".launcher a.app-card").length > 0 && !!document.querySelector("[data-tour=\\"classes\\"] a[href^=\\"/\\"]")',
			timeoutMs: 20000,
			label: 'the launcher and the feed have links'
		}
	],
	presence: [
		{ selector: 'body[data-sveltekit-preload-data="tap"]', label: 'the body preloads data on tap', expectPresent: 1, maxPresent: 1 },
		{ selector: 'body[data-sveltekit-preload-code="hover"]', label: 'the body preloads code on hover', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-sveltekit-preload-data="hover"]', label: 'nothing asks for a hover data preload', expectPresent: 0 }
	],
	orderResult: [
		{ label: 'resting the pointer on six links fetches no route data', evaluate: HOVER, expected: ['links hovered: at least 4', 'data loads on hover: 0'] },
		{ label: 'pressing a feed link still preloads its data (positive control)', evaluate: TAP, expected: ['data loads on tap: 1'] }
	]
};

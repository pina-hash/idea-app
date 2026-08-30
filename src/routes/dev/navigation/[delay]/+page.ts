import type { PageLoad } from './$types';

/**
 * THE SLOW LOAD, and it is a real one rather than a rendered placeholder.
 *
 * `[delay]` is a count of milliseconds this load sleeps before resolving, so a
 * navigation to `/dev/navigation/1200` genuinely keeps `navigating.to` non-null
 * for 1200ms and the indicator's delay gate is exercised by the mechanism it
 * gates on. Faking it by toggling a prop would measure the component and not
 * the integration, which is the half that was missing entirely.
 *
 * A CLIENT LOAD (`ssr = false` on the layout), so no server round trip and no
 * dependency on anything outside the browser -- and so the sleep is the ONLY
 * thing between the click and the paint.
 */
export const load: PageLoad = async ({ params }) => {
	const delay = Math.max(0, Math.min(5000, Number(params.delay) || 0));
	const startedAt = performance.now();
	if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
	return { delay, tookMs: Math.round(performance.now() - startedAt) };
};

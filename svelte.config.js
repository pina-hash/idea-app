import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		version: {
			/**
			 * HOW OFTEN AN OPEN TAB ASKS WHETHER A NEWER VERSION IS LIVE: two minutes.
			 *
			 * The answer only sets `updated`; `$lib/shell/DeployWatch.svelte` takes
			 * the new version at the person's next safe navigation and never reloads
			 * a page on its own (see `$lib/shell/deploy-safety`). So this number is
			 * how stale a tab may be when that navigation comes, weighed against
			 * what asking costs.
			 *
			 * The cost is one request for a static file a few dozen bytes long,
			 * `cache-control: no-cache`, per open tab per interval: thirty open
			 * tabs is fifteen a minute. The benefit shrinks fast below a couple of
			 * minutes, because a production build takes about that long, because a
			 * tab coming back into view asks at once anyway (throttled to one ask
			 * per thirty seconds), and because a chunk that fails to download asks
			 * immediately. Above it, a teacher who sits on one page through a
			 * deploy keeps navigating on the old build for longer -- and without
			 * Vercel's skew protection, which nobody here can read, every such
			 * navigation into a route the tab has not loaded yet is a chance to hit
			 * a chunk the new deployment no longer has.
			 *
			 * `version.name` STAYS AT ITS DEFAULT, the build timestamp. A
			 * content-derived name would be tempting and wrong: the site's commit
			 * log is in the client graph, so every deploy renames chunks, and a
			 * name that did not change with them would make SvelteKit's own
			 * failed-chunk check answer "nothing new" and show an error page where
			 * it should have reloaded.
			 */
			pollInterval: 120_000
		}
	}
};

export default config;

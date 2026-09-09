// Ambient declarations for the two `virtual:site-*` Vite modules
// (vite.config.ts): the site's version + changelog substrate, generated from
// the git history at build time via the manifest in src/lib/site-manifest.ts.
//
// The SHAPES live in src/lib/site-versions.ts, beside the pure derivation that
// produces them and the formatter that reads them, so the virtual modules and
// the functions on both sides of them can never describe different things.
// This file only says which of those shapes each module exports.
//
// THE SPLIT IS A PAYLOAD BOUNDARY, and the argument for it is in
// vite.config.ts beside the plugin that emits both. In short: the eager module
// is on every route in the site, so the 1,433-record commit log cannot live in
// it -- a shared Rollup chunk carries every binding any of its dependents
// needs, so `entries` sitting beside `deploy` put the whole log on the
// signed-out landing page and on every legacy handout. Import from
// `virtual:site-changelog` ONLY through `await import()`, and only on a
// surface that is about to render the log.
declare module 'virtual:site-versions' {
	import type { AppVersion, DeployStamp, VersionEntry } from '$lib/site-versions';
	export type { AppVersion, DeployStamp, VersionEntry };
	export const apps: Record<string, AppVersion>;
	export const deploy: DeployStamp;
	/** How many entries `virtual:site-changelog` holds, without loading it. */
	export const total: number;
	/** The newest entry alone, for a collapsed summary line. Null on no history. */
	export const latest: VersionEntry | null;
}

declare module 'virtual:site-changelog' {
	import type { VersionEntry } from '$lib/site-versions';
	export const entries: VersionEntry[];
}

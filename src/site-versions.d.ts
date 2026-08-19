// Ambient declaration for the `virtual:site-versions` Vite module
// (vite.config.ts): the site's version + changelog substrate, generated from
// the git history at build time via the manifest in src/lib/site-manifest.ts.
//
// The SHAPES live in src/lib/site-versions.ts, beside the pure derivation that
// produces them and the formatter that reads them, so the virtual module and
// the functions on both sides of it can never describe different things. This
// file only says which of those shapes the virtual module exports.
declare module 'virtual:site-versions' {
	import type { AppVersion, DeployStamp, VersionEntry } from '$lib/site-versions';
	export type { AppVersion, DeployStamp, VersionEntry };
	export const entries: VersionEntry[];
	export const apps: Record<string, AppVersion>;
	export const deploy: DeployStamp;
}

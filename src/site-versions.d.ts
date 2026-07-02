// Ambient declaration for the `virtual:site-versions` Vite module
// (vite.config.ts): the site's version + changelog substrate, generated from
// the full git history at build time via the manifest in src/lib/site-manifest.ts.
declare module 'virtual:site-versions' {
	export interface VersionEntry {
		/** Short commit SHA. */
		sha: string;
		/** Human date, e.g. "Jun 30, 2026". */
		date: string;
		/** ISO date (YYYY-MM-DD) for range filtering. */
		iso: string;
		/** Commit subject (the user-facing changelog line). */
		note: string;
		/** Change type id (see CHANGE_TYPES in site-manifest.ts). */
		type: string;
		/** App ids this commit touched (see APPS in site-manifest.ts). */
		apps: string[];
	}
	export interface AppVersion {
		/** Auto-derived version, e.g. "v1.42" (bumps with each commit to the app). */
		version: string;
		count: number;
		lastSha: string;
		lastDate: string;
	}
	export const entries: VersionEntry[];
	export const apps: Record<string, AppVersion>;
	export const deploy: { sha: string; date: string };
}

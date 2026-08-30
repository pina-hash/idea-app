// original array position 14 of 25 -- see ../README.md for what `order` means
export const order = 14;

export default {
	path: '/dev/foundry-forge',
	label: 'Forge identity harness (FoundryMine download control)',
	/* Mounts the REAL FoundryMine over fixture apps holding every lifecycle
	   state at once. `/foundry/mine` and this harness's own FoundryMine
	   mount were never in tools/browser-verify/routes.mjs, so the download
	   control FoundryMine.svelte renders beside every version (submitted,
	   draft, approved, rejected -- `foundryDownloadable` mirrors
	   `foundryPreviewable` and asks no status question) was hand-measured
	   instead of driven here. 'ember-clock' is selected by default, whose
	   five fixture versions all carry file_count: 3 on a non-hidden app, so
	   every one renders its own "Download v<ordinal>" control. Hand-measured
	   previously at 138.8 x 45.4, 7.97:1. */
	presence: [
		{ selector: '.fdy-detail .fdy-versions a.btn[download]', label: 'per-version download controls (ember-clock, 5 versions)', expectPresent: 5, maxPresent: 5 }
	],
	contrast: [
		{ selector: '.fdy-detail .fdy-versions a.btn[download]', label: 'FoundryMine download control', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.fdy-detail .fdy-versions a.btn[download]', label: 'FoundryMine download control', min: 44 }
	]
};

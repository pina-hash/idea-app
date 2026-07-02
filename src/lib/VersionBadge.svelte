<script lang="ts">
	import { apps, deploy } from 'virtual:site-versions';
	import { appLabel } from '$lib/site-manifest';

	/**
	 * Auto-derived version chip for a page/app: `<label> v1.N` (bumps whenever a
	 * deploy includes commits touching that app's paths, per site-manifest.ts)
	 * plus the deploy short SHA and date. Never hand-edited.
	 */
	let { app }: { app: string } = $props();
	const info = $derived(apps[app]);
</script>

<span class="version-badge" title="Version auto-derived from git history">
	{appLabel(app)}
	{info?.version ?? 'v1.0'}
	<span class="sep">&middot;</span>
	{deploy.sha}
	<span class="sep">&middot;</span>
	{deploy.date || 'local build'}
</span>

<style>
	.version-badge {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.6rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--dim, #4a7a52);
		white-space: nowrap;
	}
	.sep {
		opacity: 0.6;
	}
</style>

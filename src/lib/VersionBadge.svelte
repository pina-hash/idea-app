<script lang="ts">
	import { apps, deploy } from 'virtual:site-versions';
	import { stampParts, stampTitle } from '$lib/site-versions';

	/**
	 * The build stamp for a page/app: `<label> v1.N · <sha> · <date>`, all of it
	 * derived at build time from the commit that was actually built. Never
	 * hand-edited.
	 *
	 * THE SEGMENTS COME FROM `stampParts` AND NOTHING IS ADDED HERE. This
	 * component and `versionLine()` (the same stamp, injected into the legacy
	 * HTML endpoints serve) each used to assemble the line themselves, which is
	 * two chances for the same build to describe itself two ways. All this owns
	 * now is the separator's styling.
	 *
	 * THE VERSION SEGMENT CAN BE ABSENT, and that is the honest case, not a
	 * degraded one: a version is a commit count, and a count over the shallow
	 * clone a deploy usually gets moves backwards as commits land. When the
	 * build could not see a whole history there is no number, the sha still says
	 * exactly which build this is, and the title says why.
	 */
	let { app }: { app: string } = $props();
	const parts = $derived(stampParts(app, apps, deploy));
</script>

<span class="version-badge" title={stampTitle(deploy)}>
	{#each parts as part, i (i)}
		{#if i > 0}<span class="sep">&middot;</span>{/if}
		{part}
	{/each}
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

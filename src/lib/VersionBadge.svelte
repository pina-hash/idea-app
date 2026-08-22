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
		/* A ROOM HOOK, PORTAL TOKEN AS THE FALLBACK. --dim is measured against a
		   dark plate; this component is mounted inside .nb-root, where the page
		   is paper and it measured 3.20:1. The room points the name at the
		   muted-copy ink it already has (see --stamp-ink in
		   $lib/notebook/notebook-theme.css) and the shell renders byte-identically.
		   Same mechanism as ItemBody's --body-link and SaveIndicator's --save-*. */
		color: var(--stamp-ink, var(--dim, #4a7a52));
		white-space: nowrap;
	}
	/* The separator is quieter than the segments it parts, but it still has to
	   be VISIBLE to part them. At 0.6 it measured 2.38-2.76:1 across the three
	   portal grounds and the three notebook plates; 0.8 is the lowest step that
	   clears 3:1 on all six (worst 3.23, on --bg2) while staying well under the
	   stamp's own 4.24-5.42. This is the same defect as the notebook meta dots
	   drawn in a hairline token: a separator painted below the threshold at
	   which it separates anything. */
	.sep {
		opacity: 0.8;
	}
</style>

<script lang="ts">
	/**
	 * THE WHOLE-FOUNDRY SWITCH, ITS PANEL AND ITS BANNER (report c26026b0).
	 *
	 *   panel    what a student reads in place of any Foundry page while it is
	 *            off, inside the shell exactly as the layout renders it.
	 *   banner   what a site administrator reads above the page, with the way
	 *            to the switch.
	 *   switch   the control, once ON (so "Turn the Foundry off" can be armed
	 *            and confirmed) and once OFF (one press turns it back on).
	 */
	import '$lib/foundry/forge.css';
	import FoundryShell from '$lib/foundry/FoundryShell.svelte';
	import FoundrySiteOff from '$lib/foundry/FoundrySiteOff.svelte';
	import FoundrySiteSwitch from '$lib/foundry/FoundrySiteSwitch.svelte';
	import type { FoundrySiteState } from '$lib/foundry/access';

	const OFF: FoundrySiteState = {
		open: false,
		note: 'The Foundry is off during exams this week. It comes back on Monday.',
		closedAt: '2026-10-01T08:00:00Z',
		exempt: false
	};
	const ON: FoundrySiteState = { open: true, note: null, closedAt: null, exempt: true };

	let last = $state('(nothing yet)');

	async function setSiteOpen(open: boolean, note: string | null) {
		last = JSON.stringify({ open, note });
		return { ok: true };
	}
</script>

<svelte:head><title>dev: Foundry switched off</title></svelte:head>

<div class="fg-root">
	<FoundryShell active="gallery" isAdmin={false} reviewPending={null}>
		<section data-view="panel">
			<FoundrySiteOff site={OFF} />
		</section>
	</FoundryShell>
	<section data-view="banner">
		<FoundrySiteOff site={{ ...OFF, exempt: true }} variant="admin" />
	</section>
	<div class="wrap">
		<p class="note">Last transport call: <code data-testid="last-call">{last}</code></p>
		<section data-view="switch-on">
			<FoundrySiteSwitch site={ON} {setSiteOpen} id="foundry-site-on-harness" />
		</section>
		<section data-view="switch-off">
			<FoundrySiteSwitch site={{ ...OFF, exempt: true }} {setSiteOpen} id="foundry-site-off-harness" />
		</section>
	</div>
</div>

<style>
	.wrap {
		max-width: 60rem;
		margin: 1.5rem auto;
		padding: 0 var(--cr-gutter, 1rem);
	}

	.note {
		margin: 0 0 1rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2);
	}
</style>

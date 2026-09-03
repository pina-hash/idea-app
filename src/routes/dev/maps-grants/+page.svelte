<script lang="ts">
	/**
	 * The REAL MapsEditor, twice, over one fixture: an admin and a granted
	 * editor holding Machine Shop. Nothing here is a copy of the shipping
	 * markup -- both columns mount the same component the route mounts, which
	 * is what makes a measured difference between them a fact about the
	 * editor rather than about this page.
	 */
	import MapsEditor from '$lib/maps/MapsEditor.svelte';
	import GrantAdmin from '$lib/maps/GrantAdmin.svelte';
	import { MAPS_ADMIN_SCOPE, type MapsEditorScope } from '$lib/maps/grants';
	import { FIX, mapsEditFixture, memoryMapsTransports } from '../maps-edit/fixture';
	import { memoryGrantTransports, mapsGranteeScope } from './fixture';
	import type { MapsSelection } from '$lib/maps/maps';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/* TWO FIXTURES, NOT ONE SHARED OBJECT. Each column's edits are its own, so
	   driving one does not silently move the other's numbers mid-measurement. */
	const adminFixture = mapsEditFixture();
	const granteeFixture = mapsEditFixture();

	const adminTransports = memoryMapsTransports(adminFixture);
	const grantTransports = memoryGrantTransports();

	/* THE GRANTEE'S TRANSPORTS HAVE NO `publish`, which is exactly how the real
	   route builds them (`mapsTransportsFor`): 0172 keeps `maps_publish`
	   admin-only, so the absence IS the removal of every publish control. */
	const granteeTransports = (() => {
		const { publish: _publish, ...rest } = memoryMapsTransports(granteeFixture);
		void _publish;
		return rest;
	})();

	const granteeScope: MapsEditorScope = mapsGranteeScope();

	const SELECTIONS: Record<string, MapsSelection> = {
		granted: { kind: 'node', id: FIX.toolChest },
		outside: { kind: 'node', id: FIX.millRoom },
		published: { kind: 'node', id: FIX.drawer1 },
		type: { kind: 'type', id: FIX.bladeType }
	};
	const initialSelection = $derived(data.state ? (SELECTIONS[data.state] ?? null) : null);
</script>

<svelte:head>
	<title>maps-grants harness</title>
</svelte:head>

<main class="harness">
	<p class="harness-note">
		Dev harness: the real MapsEditor twice over one fixture, as an ADMIN and as a GRANTED EDITOR
		holding Machine Shop. States: <a href="/dev/maps-grants">none</a>,
		<a href="/dev/maps-grants?state=granted">granted</a>,
		<a href="/dev/maps-grants?state=outside">outside</a>,
		<a href="/dev/maps-grants?state=published">published</a>,
		<a href="/dev/maps-grants?state=type">type</a>.
	</p>

	<div class="columns">
		<section class="col" data-testid="maps-grants-admin">
			<h2>Site admin</h2>
			{#key data.state}
				<MapsEditor
					initial={adminFixture}
					transports={adminTransports}
					{initialSelection}
					scope={MAPS_ADMIN_SCOPE}
				/>
			{/key}
			<div class="console">
				<GrantAdmin nodes={adminFixture.nodes} transports={grantTransports} />
			</div>
		</section>

		<section class="col" data-testid="maps-grants-grantee">
			<h2>Granted editor &mdash; Machine Shop</h2>
			{#key data.state}
				<MapsEditor
					initial={granteeFixture}
					transports={granteeTransports}
					{initialSelection}
					scope={granteeScope}
				/>
			{/key}
		</section>
	</div>
</main>

<style>
	.harness {
		padding: 0 1rem 2rem;
		max-width: 120rem;
		margin: 0 auto;
	}
	.harness-note {
		font-size: 0.8rem;
		color: var(--dim);
		padding: 0.6rem 0;
	}
	.harness-note a {
		color: var(--cyan);
	}
	.columns {
		display: grid;
		/* auto-fit with a min(), so the two columns become one at a phone width
		   with no breakpoint of its own -- and the pair is genuinely side by
		   side above it, which is the whole point of the harness. */
		grid-template-columns: repeat(auto-fit, minmax(min(34rem, 100%), 1fr));
		gap: 1.2rem;
		align-items: start;
	}
	.col {
		min-width: 0;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
		padding: 0.8rem;
		background: var(--bg1);
	}
	.col h2 {
		margin: 0 0 0.7rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.console {
		margin-top: 1.2rem;
	}
</style>
